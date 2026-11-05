import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '@/store/app';
import { useScheduleStore } from '@/store/schedule';
import { ScheduleEditorDrawer } from './ScheduleEditorDrawer';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  }
  Element.prototype.scrollIntoView = vi.fn();
});

// 分支列表拉取走 mock，避免触碰 Tauri IPC
vi.mock('@/lib/api', () => ({
  listBranches: vi.fn().mockResolvedValue([{ name: 'dev' }, { name: 'master' }, { name: 'release/1.0' }]),
}));

describe('ScheduleEditorDrawer（新建/编辑定时任务抽屉）', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useApp.setState({
      repositories: [
        { id: 101, name: 'nervd-web', pathWithNamespace: 'codeup/nervd-web' },
      ] as never,
      settings: {
        jenkinsConnections: [{ id: 'c1', name: '主 Jenkins', baseUrl: 'https://ci.example.com' }],
      } as never,
    });

    useScheduleStore.setState({ tasks: [], logs: [] } as never);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
    document.body.textContent = '';
  });

  const renderDrawer = (props?: Partial<Parameters<typeof ScheduleEditorDrawer>[0]>) => {
    act(() => {
      root?.render(
        <ScheduleEditorDrawer
          open
          onOpenChange={() => {}}
          {...props}
        />,
      );
    });
  };

  const radio = (value: string) =>
    document.body.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);

  const tag = (label: string) =>
    [...document.body.querySelectorAll<HTMLElement>('[data-slot="tag"]')].find((el) =>
      el.textContent?.includes(label),
    );

  it('渲染完整抽屉骨架：头部 / 五个分节 Card / 底部操作栏，且默认展示分支同步配置', async () => {
    renderDrawer();
    // 等待分支列表异步拉取 flush
    await act(async () => {
      await Promise.resolve();
    });

    const body = document.body.textContent ?? '';

    // 头部与说明
    expect(body).toContain('新建定时任务');
    expect(body).toContain('配置自动化定时调度策略');

    // 完整分节 Card：基本信息 / 执行动作类型(+同卡配置) / 调度频率 / 运行与通知
    expect(body).toContain('基本信息');
    expect(body).toContain('执行动作类型');
    expect(body).toContain('分支同步配置');
    expect(body).toContain('自动执行时间 (调度频率)');
    expect(body).toContain('运行与通知');

    // 执行动作类型 TagGroup：五个动作名齐全，选中动作描述展示在下方
    expect(tag('分支安全同步')).toBeTruthy();
    expect(tag('Jenkins 构建')).toBeTruthy();
    expect(tag('云效 Flow 流水线')).toBeTruthy();
    expect(tag('同步云效需求')).toBeTruthy();
    expect(tag('集成分支巡检')).toBeTruthy();
    expect(body).toContain('谨慎/激进双策略，定时将开发分支安全合入目标分支');

    // 合并冲突策略（谨慎/激进）
    expect(body).toContain('谨慎策略');
    expect(body).toContain('冲突即终止');
    expect(body).toContain('激进策略');

    // 底部操作栏
    expect(body).toContain('取消');
    expect(body).toContain('创建任务');
  });

  it('切换动作类型为 Jenkins：描述随选中动作更新，分支配置隐藏，Jenkins 配置出现', async () => {
    renderDrawer();

    const jenkinsTag = tag('Jenkins 构建');
    expect(jenkinsTag).toBeTruthy();

    act(() => {
      jenkinsTag?.click();
    });

    const body = document.body.textContent ?? '';
    expect(body).toContain('定时触发远程 Jenkins Job 构建');
    expect(body).not.toContain('谨慎/激进双策略，定时将开发分支安全合入目标分支');
    expect(body).toContain('Jenkins 构建配置');
    expect(body).toContain('Jenkins 实例连接');
    expect(body).toContain('Job 全名 / 路径 (FullName)');
    expect(body).not.toContain('分支同步配置');
    expect(body).not.toContain('合并冲突策略');
  });

  it('选择激进策略后展示冲突自动裁决偏好（含三个裁决选项）', async () => {
    renderDrawer();

    const aggressiveRadio = radio('aggressive');
    expect(aggressiveRadio).toBeTruthy();

    act(() => {
      aggressiveRadio?.click();
    });

    const body = document.body.textContent ?? '';
    expect(body).toContain('冲突自动裁决偏好');
    expect(body).toContain('偏向源分支 (Theirs)');
    expect(body).toContain('偏向目标分支 (Ours)');
    expect(body).toContain('生成隔离 MR 审查');
    expect(body).toContain('推荐 · 人工裁决');
  });

  it('编辑态：标题携带任务名，主按钮为保存修改', () => {
    renderDrawer({
      initialTask: {
        id: 'task-1',
        name: '每日凌晨分支同步',
        enabled: true,
        cron: '0 2 * * *',
        action: { type: 'branch_merge', repoId: 101, sourceBranch: 'dev', targetBranch: 'master', strategy: 'cautious' },
        notifyOnSuccess: true,
        notifyOnFailure: true,
      } as never,
    });

    const body = document.body.textContent ?? '';
    expect(body).toContain('编辑定时任务 · 每日凌晨分支同步');
    expect(body).toContain('保存修改');
    expect(body).not.toContain('创建任务');
  });
});
