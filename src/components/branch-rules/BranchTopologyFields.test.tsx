import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchTopologyFields } from './BranchTopologyFields';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const apiMock = vi.hoisted(() => ({
  getBranchTrackTopology: vi.fn(),
  saveBranchTrackTopology: vi.fn(),
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/attribution-api', () => apiMock);
vi.mock('@/store/app', () => ({
  useApp: {
    getState: () => ({ setToast: toastMock }),
  },
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function chooseSelect(label: string, optionLabel: string) {
  const trigger = document.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
  expect(trigger, `未找到下拉框：${label}`).toBeTruthy();
  await act(async () => {
    trigger!.click();
    await Promise.resolve();
  });
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) =>
    element.textContent?.includes(optionLabel),
  );
  expect(option, `未找到选项：${optionLabel}`).toBeTruthy();
  await act(async () => {
    option!.click();
    await Promise.resolve();
  });
}

function findButton(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) =>
    element.textContent?.includes(text),
  );
  expect(button, `未找到按钮：${text}`).toBeTruthy();
  return button!;
}

async function setPatternInput(value: string) {
  const input = document.querySelector<HTMLInputElement>(
    '[data-testid="branch-topology-fields"] input',
  );
  expect(input).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const previewText = (line: 'baseline' | 'parent' | 'child') =>
  document.querySelector(`[data-testid="branch-topology-preview"] [data-line="${line}"]`)
    ?.textContent ?? '';

describe('BranchTopologyFields 子分支拓扑', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    apiMock.getBranchTrackTopology.mockResolvedValue({
      trackId: 'track-1',
      childPattern: null,
      childBase: 'requirement',
      childMrTarget: 'parent',
    });
    apiMock.saveBranchTrackTopology.mockImplementation(async (input: unknown) => input);

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  const render = async () => {
    await act(async () => {
      root.render(
        <BranchTopologyFields
          trackId="track-1"
          templateName="局点专版"
          iterationName="Sprint-2026"
          parentIdentifier="REQ-101"
          childIdentifier="BUG-303"
          baselinePattern="iteration/{iteration}/{template}"
          workitemPattern="feature/{identifier}"
        />,
      );
      await Promise.resolve();
    });
    await flush();
  };

  it('legacy：读取现有拓扑并按模板展开 baseline / parent / child 三行预览', async () => {
    await render();

    expect(apiMock.getBranchTrackTopology).toHaveBeenCalledWith({ trackId: 'track-1' });
    expect(previewText('baseline')).toContain('iteration/Sprint-2026/局点专版');
    expect(previewText('parent')).toContain('feature/REQ-101');
    expect(previewText('child')).toContain('feature/BUG-303');
    expect(document.body.textContent).toContain('legacy 模式');
    expect(document.body.textContent).toContain('父需求分支缺失时不会自动回退');
  });

  it('none：切换为不建子分支后，子项共用需求分支', async () => {
    await render();

    await chooseSelect('子分支模式', '不建子分支');

    expect(previewText('child')).toContain('feature/REQ-101');
    expect(previewText('child')).toContain('共用需求分支');
    expect(document.querySelector('[data-testid="branch-topology-fields"] input')).toBeNull();
  });

  it('custom：切换自定义模式后展开 {parentIdentifier} 并保存拓扑', async () => {
    await render();

    await chooseSelect('子分支模式', '自定义子分支模式');
    await setPatternInput('feature/{parentIdentifier}/{identifier}');

    expect(previewText('child')).toContain('feature/REQ-101/BUG-303');

    await act(async () => {
      findButton('保存子分支拓扑').click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMock.saveBranchTrackTopology).toHaveBeenCalledWith({
      trackId: 'track-1',
      topology: {
        trackId: 'track-1',
        childPattern: 'feature/{parentIdentifier}/{identifier}',
        childBase: 'requirement',
        childMrTarget: 'parent',
      },
    });
    expect(toastMock).toHaveBeenCalledWith({ kind: 'ok', text: '子分支拓扑已保存' });
  });

  it('自定义模式选择迭代基准作为基点与 MR 目标后一并保存', async () => {
    await render();

    await chooseSelect('子分支模式', '自定义子分支模式');
    await chooseSelect('子分支基点', '迭代基准');
    await chooseSelect('MR 目标分支', '迭代基准');
    await act(async () => {
      findButton('保存子分支拓扑').click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMock.saveBranchTrackTopology).toHaveBeenCalledWith(
      expect.objectContaining({
        topology: expect.objectContaining({
          childBase: 'baseline',
          childMrTarget: 'baseline',
        }),
      }),
    );
  });

  it('非法占位符给出校验并阻止保存', async () => {
    await render();

    await chooseSelect('子分支模式', '自定义子分支模式');
    await setPatternInput('bug/{bogus}');

    expect(document.body.textContent).toContain('仅支持');
    await act(async () => {
      findButton('保存子分支拓扑').click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMock.saveBranchTrackTopology).not.toHaveBeenCalled();
  });

  it('父需求分支缺失时给出回退 warning', async () => {
    await act(async () => {
      root.render(
        <BranchTopologyFields
          trackId="track-1"
          templateName="局点专版"
          iterationName="Sprint-2026"
          parentIdentifier="REQ-101"
          childIdentifier="BUG-303"
          baselinePattern="iteration/{iteration}/{template}"
          workitemPattern="feature/{identifier}"
          parentBranchExists={false}
        />,
      );
      await Promise.resolve();
    });
    await flush();

    expect(document.body.textContent).toContain('不存在');
    expect(document.body.textContent).toContain('回退到迭代基准');
  });
});