import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTrackTopologyGraph,
  isDirectConnectBranches,
  TrackTopologyDiagram,
  type TrackTopologyDiagramProps,
} from './track-topology-diagram';

describe('TrackTopologyDiagram', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
  });

  const baseProps: TrackTopologyDiagramProps = {
    sourceBranch: 'master',
    baselinePattern: 'iteration/{iteration}/{track}',
    workitemPattern: 'feature/{identifier}',
    variables: { iteration: 'Sprint-1', track: '局点专版', identifier: 'REQ-101' },
  };

  const renderDiagram = async (overrides: Partial<TrackTopologyDiagramProps> = {}) => {
    await act(() => {
      root.render(<TrackTopologyDiagram {...baseProps} {...overrides} />);
    });
    return host.querySelector('[data-testid="track-topology"]');
  };

  it('三节点形态：按 expandBranchPattern 展开真实分支名渲染节点', async () => {
    const diagram = await renderDiagram();

    expect(diagram?.getAttribute('data-form')).toBe('three-node');
    const source = diagram?.querySelector('[data-node="source"]');
    const baseline = diagram?.querySelector('[data-node="baseline"]');
    const development = diagram?.querySelector('[data-node="development"]');
    expect(source?.textContent).toContain('master');
    expect(source?.textContent).toContain('源主干');
    expect(baseline?.textContent).toContain('iteration/Sprint-1/局点专版');
    expect(baseline?.textContent).toContain('迭代基准');
    expect(development?.textContent).toContain('feature/REQ-101');
    expect(development?.textContent).toContain('需求分支');
  });

  it('三节点形态：连线契约 派生基准 / 切出开发 / MR 合入 与琥珀虚线 发布 MR（buildTrackTopologyGraph）', () => {
    // jsdom 零尺寸下 ReactFlow 不渲染边标签，连线契约经纯函数图结构断言
    const graph = buildTrackTopologyGraph(baseProps);

    expect(graph.direct).toBe(false);
    expect(graph.edges.map((edge) => edge.data?.label)).toEqual(['派生基准', '发布 MR', '切出开发', 'MR 合入']);
    // 发布 MR：迭代基准 → 源主干，琥珀（warning）虚线
    const release = graph.edges[1];
    expect(release.data?.tone).toBe('warning');
    expect(release.data?.dashed).toBe(true);
    expect(release.source).toBe('baseline');
    expect(release.target).toBe('source');
    // MR 合入：需求分支 → 迭代基准
    expect(graph.edges[3]).toMatchObject({ source: 'development', target: 'baseline' });
  });

  it('直连判定：基准模式展开后与源主干同名（含 trim）自动切两节点形态', async () => {
    const diagram = await renderDiagram({
      // 字面同名：master → master
      baselinePattern: 'master',
    });

    expect(diagram?.getAttribute('data-form')).toBe('direct');
    expect(diagram?.querySelector('[data-node="baseline"]')).toBeNull();
    expect(diagram?.querySelector('[data-node="source"]')?.textContent).toContain('master');
    expect(diagram?.querySelector('[data-node="development"]')?.textContent).toContain('feature/REQ-101');
    expect(diagram?.textContent).toContain('直连主干');
  });

  it('直连判定：变量展开后同名（{track} → master）同样切直连', async () => {
    const diagram = await renderDiagram({
      baselinePattern: '{track}',
      variables: { iteration: 'Sprint-1', track: 'master', identifier: 'REQ-101' },
    });

    expect(diagram?.getAttribute('data-form')).toBe('direct');
  });

  it('直连形态：连线契约 直接切出 / MR 合入，无三节点专属标签（buildTrackTopologyGraph）', () => {
    const graph = buildTrackTopologyGraph({ ...baseProps, baselinePattern: 'master ' });

    expect(graph.direct).toBe(true);
    expect(graph.edges.map((edge) => edge.data?.label)).toEqual(['直接切出', 'MR 合入']);
    // 直接切出：源主干 → 需求分支；MR 合入：需求分支 → 源主干
    expect(graph.edges[0]).toMatchObject({ source: 'source', target: 'development' });
    expect(graph.edges[1]).toMatchObject({ source: 'development', target: 'source' });
    expect(graph.edges.some((edge) => edge.data?.dashed)).toBe(false);
  });

  it('状态光晕：ready/missing/loading 映射到对应视觉类（未传状态为纯预览态）', async () => {
    const diagram = await renderDiagram({
      states: { source: 'ready', baseline: 'missing', development: 'loading' },
    });

    const source = diagram?.querySelector('[data-node="source"][data-state="ready"]');
    const baseline = diagram?.querySelector('[data-node="baseline"][data-state="missing"]');
    const development = diagram?.querySelector('[data-node="development"][data-state="loading"]');
    // ready = Emerald 描边 + 光晕
    expect(source?.className).toContain('border-success');
    expect(source?.className).toContain('ring-success');
    // missing = 灰占位（虚线描边 + 弱化文本）
    expect(baseline?.className).toContain('border-dashed');
    expect(baseline?.className).toContain('text-muted-foreground');
    // loading = 微光（呼吸动画）
    expect(development?.className).toContain('animate-pulse');
  });

  it('纯预览态：未传 states 的节点使用中性 hairline，不带状态属性', async () => {
    const diagram = await renderDiagram();

    for (const node of Array.from(diagram?.querySelectorAll('[data-node]') ?? [])) {
      expect(node.hasAttribute('data-state')).toBe(false);
      expect(node.className).toContain('border-border');
      expect(node.className).not.toContain('ring-success');
      expect(node.className).not.toContain('animate-pulse');
    }
  });

  it('isDirectConnectBranches：trim 比较 + 空源主干防御', () => {
    expect(isDirectConnectBranches('master', 'master')).toBe(true);
    expect(isDirectConnectBranches(' master ', 'master')).toBe(true);
    expect(isDirectConnectBranches('master', 'test')).toBe(false);
    expect(isDirectConnectBranches('', '')).toBe(false);
    expect(isDirectConnectBranches('', 'master')).toBe(false);
    expect(isDirectConnectBranches('master', '')).toBe(false);
  });
});
