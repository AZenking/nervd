import { describe, expect, it } from 'vitest';
import { extractBreakdownKeywords } from './breakdown-keywords';

describe('extractBreakdownKeywords', () => {
  it('从需求标题中拆出中文短词，供 git grep 命中现有代码', () => {
    const keywords = extractBreakdownKeywords('【福田】【线下工单统一收银】支付对接易宝');
    expect(keywords).toContain('收银');
    expect(keywords).toContain('支付');
    expect(keywords).toContain('易宝');
  });

  it('保留英文单词并去重、限制数量', () => {
    const keywords = extractBreakdownKeywords('payment Payment yibao cashier 支付 payment');
    expect(keywords.filter((item) => item.toLowerCase() === 'payment')).toHaveLength(1);
    expect(keywords.length).toBeLessThanOrEqual(24);
  });
});
