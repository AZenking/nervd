import { describe, expect, it } from 'vitest';
import { formatBreakdownRepoCode, formatBreakdownRepoScope, parseBreakdownResponse } from './ai-api';
import type { BreakdownRepoScope } from '@/types/ai';

describe('formatBreakdownRepoScope（AI 拆解上下文）', () => {
  it('没有关联仓库时给出兜底说明', () => {
    expect(formatBreakdownRepoScope([])).toContain('未关联任何仓库');
  });

  it('开发分支尚未创建时只给仓库名，不编造改动', () => {
    const scope: BreakdownRepoScope[] = [
      { repoName: 'f6car/financial-view', workitemBranch: 'feature/REQ-1', baselineBranch: 'master', branchCreated: false },
    ];
    const text = formatBreakdownRepoScope(scope);
    expect(text).toContain('f6car/financial-view');
    expect(text).toContain('尚未创建开发分支');
    expect(text).not.toContain('变更文件（');
  });

  it('有改动时输出文件路径与增删行数', () => {
    const scope: BreakdownRepoScope[] = [
      {
        repoName: 'f6car/financial-view',
        workitemBranch: 'feature/REQ-1',
        baselineBranch: 'master',
        branchCreated: true,
        files: [
          { path: 'src/views/Apply.vue', additions: 86, deletions: 12 },
          { path: 'src/api/refund.ts', additions: 40, deletions: 3 },
        ],
      },
    ];
    const text = formatBreakdownRepoScope(scope);
    expect(text).toContain('变更文件（2 个）');
    expect(text).toContain('src/views/Apply.vue (+86 / -12)');
    expect(text).toContain('src/api/refund.ts (+40 / -3)');
  });

  it('读取失败时把说明带进上下文', () => {
    const scope: BreakdownRepoScope[] = [
      { repoName: 'repo', branchCreated: true, note: '变更文件读取失败' },
    ];
    expect(formatBreakdownRepoScope(scope)).toContain('变更文件读取失败');
  });
});

describe('parseBreakdownResponse（容错解析）', () => {
  it('容忍对象数组中的尾逗号', () => {
    const raw = `[
      {"order":0,"subject":"收银台新增易宝支付渠道"},
      {"order":1,"subject":"易宝支付结果查询"},
    ]`;
    const items = parseBreakdownResponse(raw);
    expect(items.map((item) => item.subject)).toEqual(['收银台新增易宝支付渠道', '易宝支付结果查询']);
  });

  it('容忍 Markdown 代码块与前后废话', () => {
    const raw = '好的，结果如下：\n```json\n[{"order":0,"subject":"新增退款入口"}]\n```';
    expect(parseBreakdownResponse(raw)[0].subject).toBe('新增退款入口');
  });

  it('尾部对象被截断时救回前面完整的条目', () => {
    const raw = `[{"order":0,"subject":"收银台新增易宝支付渠道"},
      {"order":1,"subject":"易宝支付结果查询"},
      {"order":2,"subject":"取消与超时处理"},{"order":3,"subject":"结算页支持易宝`;
    const items = parseBreakdownResponse(raw);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0].subject).toContain('易宝');
  });

  it('兼容 { items: [...] } 包装', () => {
    const raw = '{"items":[{"order":0,"subject":"新增易宝渠道"}]}';
    expect(parseBreakdownResponse(raw)[0].subject).toBe('新增易宝渠道');
  });

  it('完全无法解析时返回空数组，不再把裸 JSON 行当标题', () => {
    expect(parseBreakdownResponse('无法生成')).toEqual([]);
  });
});


describe('formatBreakdownRepoCode（现有代码参考）', () => {
  it('输出文件树与代码节选，并标注截断', () => {
    const text = formatBreakdownRepoCode([
      {
        repoName: 'f6car/financial-view',
        gitRef: 'feature/MANT-24',
        tree: ['src/App.vue', 'src/api/payment.js'],
        files: [
          { path: 'src/api/payment.js', content: 'export const pay = 1;', truncated: true },
        ],
      },
    ]);
    expect(text).toContain('feature/MANT-24');
    expect(text).toContain('src/App.vue');
    expect(text).toContain('src/api/payment.js（已截断）');
    expect(text).toContain('export const pay = 1;');
  });

  it('读取失败时只给说明，不伪造代码', () => {
    const text = formatBreakdownRepoCode([{ repoName: 'repo', note: '现有代码读取失败' }]);
    expect(text).toContain('现有代码读取失败');
    expect(text).not.toContain('---');
  });
});
