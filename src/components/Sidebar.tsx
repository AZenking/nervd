import { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '../store/app';
import type { Category } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CATS: { key: Category; label: string }[] = [
  { key: 'Req', label: '需求' },
  { key: 'Bug', label: '缺陷' },
  { key: 'Task', label: '任务' },
];

const FILTER_ALL = '__all__';

/** 单个 tab 的筛选条件 */
interface ListFilter { assignee: string; related: string }
const EMPTY_FILTER: ListFilter = { assignee: FILTER_ALL, related: FILTER_ALL };
/** 选项已不在当前列表（如刷新后）时仍显示原值，避免空白 */
const labelOf = (opts: { label: string; value: string }[], v: string) =>
  v === FILTER_ALL ? '全部' : (opts.find((o) => o.value === v)?.label ?? v);

/** 就地选项：按出现顺序收集去重，'—'（未指派）固定沉底 */
function uniqOptions(values: string[]): { label: string; value: string }[] {
  const seen: string[] = [];
  let unassigned = false;
  for (const v of values) {
    if (!v) continue;
    if (v === '—') { unassigned = true; continue; }
    if (!seen.includes(v)) seen.push(v);
  }
  seen.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const opts = seen.map((v) => ({ label: v, value: v }));
  if (unassigned) opts.push({ label: '未指派', value: '—' });
  return opts;
}

export function Sidebar() {
  const { category, setCategory, items, nextToken, loadingList, loadList, select, selectedId } = useApp();
  const [kw, setKw] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  // 筛选按 tab 记忆：切走再切回，处理人/关联人条件保留
  const [filtersByCat, setFiltersByCat] = useState<Record<Category, ListFilter>>({
    Req: { ...EMPTY_FILTER }, Bug: { ...EMPTY_FILTER }, Task: { ...EMPTY_FILTER },
  });
  const filter = filtersByCat[category] ?? EMPTY_FILTER;
  const patchFilter = (patch: Partial<ListFilter>) =>
    setFiltersByCat((m) => ({ ...m, [category]: { ...(m[category] ?? EMPTY_FILTER), ...patch } }));

  const assigneeOpts = useMemo(() => uniqOptions(items.map((i) => i.assignedTo ?? '')), [items]);
  const relatedOpts = useMemo(() => uniqOptions(items.flatMap((i) => i.relatedTo ?? [])), [items]);
  const filterActive = filter.assignee !== FILTER_ALL || filter.related !== FILTER_ALL;

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    const hasPerson = filter.assignee !== FILTER_ALL || filter.related !== FILTER_ALL;
    return items.filter((i) => {
      if (k && !i.subject.toLowerCase().includes(k) && !i.identifier.toLowerCase().includes(k)) return false;
      if (hasPerson) {
        // 并集：处理人 / 关联人任一命中即保留（两处选同一人 = 该人名下全部工作项）
        const byAssignee = filter.assignee !== FILTER_ALL && (i.assignedTo ?? '') === filter.assignee;
        const byRelated = filter.related !== FILTER_ALL && (i.relatedTo ?? []).includes(filter.related);
        if (!byAssignee && !byRelated) return false;
      }
      return true;
    });
  }, [items, kw, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-muted/40">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-foreground">工作项</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">按类别浏览和筛选</p>
      </div>

      <Tabs
        value={category}
        onValueChange={(v) => void setCategory(v as Category)}
        className="flex shrink-0 flex-col px-3"
      >
        <TabsList variant="line" className="h-auto w-full justify-start gap-1 border-b-0 bg-transparent p-0">
          {CATS.map((c) => (
            <TabsTrigger
              key={c.key}
              value={c.key}
              className="h-8 flex-1 justify-center rounded-md px-2 text-xs text-muted-foreground after:hidden hover:bg-accent hover:text-foreground data-active:bg-background data-active:text-foreground data-active:shadow-sm"
            >
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex shrink-0 gap-1.5 px-3 py-3">
        <Input placeholder="搜索编号/标题…" value={kw} onChange={(e) => setKw(e.target.value)} className="h-8 min-w-0 rounded-md bg-background" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={showFilter}
          title="过滤（处理人 / 关联人，任一命中即显示）"
          onClick={() => setShowFilter((s) => !s)}
          className={cn(
            'shrink-0 rounded-md text-muted-foreground',
            (showFilter || filterActive) && 'bg-accent text-foreground',
          )}
        >
          <Filter />
        </Button>
      </div>

      {showFilter && (
        <div className="grid shrink-0 grid-cols-2 gap-2 px-3 pb-3">
          <div className="min-w-0">
            <div className="mb-1 text-xs text-muted-foreground">处理人</div>
            <Select
              items={[{ label: '全部', value: FILTER_ALL }, ...assigneeOpts]}
              value={filter.assignee}
              onValueChange={(v) => patchFilter({ assignee: String(v) })}
            >
              <SelectTrigger size="sm" className="w-full rounded-md bg-background text-xs">
                <SelectValue>{labelOf(assigneeOpts, filter.assignee)}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value={FILTER_ALL}>全部</SelectItem>
                  {assigneeOpts.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-xs text-muted-foreground">关联人</div>
            <Select
              disabled={!relatedOpts.length}
              items={[{ label: '全部', value: FILTER_ALL }, ...relatedOpts]}
              value={filter.related}
              onValueChange={(v) => patchFilter({ related: String(v) })}
            >
              <SelectTrigger
                size="sm"
                title={!relatedOpts.length ? '当前列表未返回关联人数据' : undefined}
                className="w-full rounded-md bg-background text-xs"
              >
                <SelectValue>{labelOf(relatedOpts, filter.related)}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value={FILTER_ALL}>全部</SelectItem>
                  {relatedOpts.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="list">
        {filtered.map((it) => (
          <div
            key={it.workitemId || it.identifier}
            role="listitem"
            className={cn(
              'mx-2 my-0.5 cursor-pointer rounded-md px-3 py-2.5 transition-colors',
              selectedId === it.workitemId
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/60',
            )}
            onClick={() => void select(it.workitemId)}
          >
            <div className="text-xs font-medium text-muted-foreground">{it.identifier}</div>
            <div className="mt-0.5 truncate text-sm font-medium text-foreground">{it.subject}</div>
            <div className="mt-1 flex gap-2.5 text-xs text-muted-foreground">
              <span>{it.status || '—'}</span>
              {it.assignedTo && it.assignedTo !== '—' && <span className="truncate">{it.assignedTo}</span>}
              <span className="truncate">{it.spaceName || ''}</span>
            </div>
          </div>
        ))}
        {!filtered.length && !loadingList && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">无匹配工作项</div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-border px-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => void loadList(false)}>
          刷新
        </Button>
        {nextToken && (
          <Button variant="ghost" size="sm" onClick={() => void loadList(true)}>
            下一页
          </Button>
        )}
        {loadingList && <span className="self-center text-xs text-muted-foreground">加载中…</span>}
      </div>
    </div>
  );
}
