import { describe, expect, it } from 'vitest';
import { getMrStatusInfo } from './types';

describe('getMrStatusInfo', () => {
  it('正确解析待合入状态（opened / open / to_be_merged / reopened）', () => {
    expect(getMrStatusInfo('opened').label).toBe('待合入');
    expect(getMrStatusInfo('OPEN').label).toBe('待合入');
    expect(getMrStatusInfo('to_be_merged').label).toBe('待合入');
    expect(getMrStatusInfo('TO_BE_MERGED').label).toBe('待合入');
    expect(getMrStatusInfo('reopened').label).toBe('待合入');
    expect(getMrStatusInfo().label).toBe('待合入');
  });

  it('正确解析审查中状态（under_review / reviewing / review）', () => {
    const res = getMrStatusInfo('under_review');
    expect(res.label).toBe('审查中');
    expect(res.tone).toBe('sky');

    expect(getMrStatusInfo('UNDER_REVIEW').label).toBe('审查中');
    expect(getMrStatusInfo('reviewing').label).toBe('审查中');
  });

  it('正确解析已通过（approved）状态', () => {
    const res = getMrStatusInfo('approved');
    expect(res.label).toBe('已通过·待合入');
    expect(res.tone).toBe('amber');
  });

  it('正确解析已合入（merged）状态', () => {
    const res = getMrStatusInfo('merged');
    expect(res.label).toBe('已合入');
    expect(res.tone).toBe('emerald');
  });

  it('正确解析已关闭（closed）状态', () => {
    const res = getMrStatusInfo('closed');
    expect(res.label).toBe('已关闭');
    expect(res.tone).toBe('muted');
  });

  it('正确解析冲突状态（conflict / hasConflict: true）', () => {
    const byState = getMrStatusInfo('conflict');
    expect(byState.label).toBe('有冲突');
    expect(byState.tone).toBe('rose');

    const byFlag = getMrStatusInfo('opened', true);
    expect(byFlag.label).toBe('有冲突');
    expect(byFlag.tone).toBe('rose');
  });
});
