import * as api from '../../lib/api';
import type { Category, IterationSummary } from '../../types';
import type { AppRuntime } from './runtime';
import type {
  AppSliceCreator,
  OverviewCategoryState,
  OverviewIterationsState,
  OverviewSlice,
} from './types';

const emptyCategoryState = (): OverviewCategoryState => ({
  items: [],
  loadedCount: 0,
  nextToken: null,
  complete: false,
  status: 'idle',
  error: null,
  fetchedAt: null,
});

const emptyIterationsState = (): OverviewIterationsState => ({
  items: [],
  status: 'idle',
  error: null,
  fetchedAt: null,
});

/** 总览只做「概览」：限制单次拉取页数与条数，避免首次挂载把整个空间工作项瀑布式抽干。 */
const MAX_OVERVIEW_PAGES = 5;
const MAX_OVERVIEW_ITEMS = 300;

const emptyCategories = (): Record<Category, OverviewCategoryState> => ({
  Req: emptyCategoryState(),
  Bug: emptyCategoryState(),
  Task: emptyCategoryState(),
});

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function contextKey(settings: { organizationId?: string; defaultSpaceIdentifier?: string } | null): string {
  return `${settings?.organizationId ?? ''}:${settings?.defaultSpaceIdentifier ?? ''}`;
}

export function createOverviewSlice(_runtime: AppRuntime): AppSliceCreator<OverviewSlice> {
  return (set, get) => {
    const categoryRequests: Record<Category, number> = { Req: 0, Bug: 0, Task: 0 };
    let iterationsRequest = 0;

    const ensureContext = (key: string) => {
      if (get().overviewContextKey === key) return;
      set({
        overviewContextKey: key,
        overviewByCategory: emptyCategories(),
        overviewIterations: emptyIterationsState(),
      });
    };

    const updateCategory = (category: Category, patch: Partial<OverviewCategoryState>) => {
      set((state) => ({
        overviewByCategory: {
          ...state.overviewByCategory,
          [category]: { ...state.overviewByCategory[category], ...patch },
        },
      }));
    };

    const isCategoryCurrent = (
      category: Category,
      requestId: number,
      organizationId: string,
      spaceIdentifier: string,
    ) => {
      const settings = get().settings;
      return (
        categoryRequests[category] === requestId &&
        settings?.organizationId === organizationId &&
        settings?.defaultSpaceIdentifier === spaceIdentifier &&
        get().overviewContextKey === contextKey(settings)
      );
    };

    const isIterationsCurrent = (
      requestId: number,
      organizationId: string,
      spaceIdentifier: string,
    ) => {
      const settings = get().settings;
      return (
        iterationsRequest === requestId &&
        settings?.organizationId === organizationId &&
        settings?.defaultSpaceIdentifier === spaceIdentifier &&
        get().overviewContextKey === contextKey(settings)
      );
    };

    return {
      overviewByCategory: emptyCategories(),
      overviewIterations: emptyIterationsState(),
      overviewContextKey: null,

      resetOverviewData() {
        categoryRequests.Req += 1;
        categoryRequests.Bug += 1;
        categoryRequests.Task += 1;
        iterationsRequest += 1;
        set({
          overviewContextKey: null,
          overviewByCategory: emptyCategories(),
          overviewIterations: emptyIterationsState(),
        });
      },

      async loadOverviewCategory(category, options = {}) {
        const settings = get().settings;
        const organizationId = settings?.organizationId ?? '';
        const spaceIdentifier = settings?.defaultSpaceIdentifier ?? '';
        const key = contextKey(settings);
        ensureContext(key);

        const current = get().overviewByCategory[category];
        if (!options.refresh && current.status !== 'idle') return;
        if (!spaceIdentifier) {
          updateCategory(category, {
            status: 'error',
            error: '未配置项目空间，无法加载工作项',
            complete: false,
            fetchedAt: null,
          });
          return;
        }

        const requestId = ++categoryRequests[category];
        const previousItems = current.items;
        updateCategory(category, {
          status: previousItems.length > 0 ? 'refreshing' : 'loading',
          error: null,
          nextToken: null,
          complete: false,
          ...(previousItems.length === 0
            ? { items: [], loadedCount: 0, fetchedAt: null }
            : {}),
        });

        const collected = new Map<string, api.WorkitemRow>();
        let nextToken: string | undefined;
        let previousToken: string | undefined;
        let loadedPage = false;

        try {
          // 循环内只累积局部变量，结束后一次性 set：避免每页触发一轮全树重渲。
          let reachedEnd = false;
          for (let pageCount = 0; pageCount < MAX_OVERVIEW_PAGES; pageCount += 1) {
            const page = await api.listWorkitems({
              category,
              spaceIdentifier,
              ...(nextToken ? { nextToken } : {}),
            });
            if (!isCategoryCurrent(category, requestId, organizationId, spaceIdentifier)) return;
            loadedPage = true;

            for (const item of page.items) {
              const key = item.workitemId || `${item.identifier}:${item.subject}`;
              if (key) collected.set(key, item);
            }

            const pageNextToken = page.nextToken ?? null;
            if (pageNextToken === null) {
              reachedEnd = true;
              nextToken = undefined;
              break;
            }
            if (pageNextToken === previousToken) {
              throw new Error('分页游标未前进');
            }
            previousToken = pageNextToken;
            nextToken = pageNextToken;
            if (collected.size >= MAX_OVERVIEW_ITEMS) break;
          }

          const items = [...collected.values()].slice(0, MAX_OVERVIEW_ITEMS);
          updateCategory(category, {
            items,
            loadedCount: items.length,
            nextToken: reachedEnd ? null : nextToken ?? null,
            complete: reachedEnd,
            status: 'success',
            error: null,
            fetchedAt: Date.now(),
          });
        } catch (error) {
          if (!isCategoryCurrent(category, requestId, organizationId, spaceIdentifier)) return;
          const items = collected.size > 0 ? [...collected.values()] : previousItems;
          updateCategory(category, {
            items,
            loadedCount: items.length,
            nextToken: nextToken ?? null,
            complete: false,
            status: loadedPage || items.length > 0 ? 'partial' : 'error',
            error: errorText(error),
            fetchedAt: items.length > 0 ? Date.now() : null,
          });
        }
      },

      async loadOverviewIterations(options = {}) {
        const settings = get().settings;
        const organizationId = settings?.organizationId ?? '';
        const spaceIdentifier = settings?.defaultSpaceIdentifier ?? '';
        const key = contextKey(settings);
        ensureContext(key);

        const current = get().overviewIterations;
        if (!options.refresh && current.status !== 'idle') return;
        const requestId = ++iterationsRequest;
        set({
          overviewIterations: {
            ...current,
            items: options.refresh ? [] : current.items,
            status: 'loading',
            error: null,
          },
        });

        if (!spaceIdentifier) {
          if (isIterationsCurrent(requestId, organizationId, spaceIdentifier)) {
            set({
              overviewIterations: {
                items: [],
                status: 'error',
                error: '未配置项目空间，无法加载迭代',
                fetchedAt: null,
              },
            });
          }
          return;
        }

        try {
          const iterations: IterationSummary[] = await api.listIterations();
          if (!isIterationsCurrent(requestId, organizationId, spaceIdentifier)) return;
          set({
            overviewIterations: {
              items: iterations,
              status: 'success',
              error: null,
              fetchedAt: Date.now(),
            },
          });
        } catch (error) {
          if (!isIterationsCurrent(requestId, organizationId, spaceIdentifier)) return;
          set({
            overviewIterations: {
              items: [],
              status: 'error',
              error: errorText(error),
              fetchedAt: null,
            },
          });
        }
      },
    };
  };
}
