import { describe, expect, it } from 'vitest';
import { branchTrackWarnings, highestSeverity } from './branch-track-warnings';

const base = {
  baselineBranchPattern: 'iteration/{iteration}/{track}',
  workitemBranchPattern: 'feature/{identifier}',
};

describe('branchTrackWarnings', () => {
  it('标准迭代轨道无警告', () => {
    expect(branchTrackWarnings(base, 'iteration')).toEqual([]);
  });

  it('需求分支缺少 identifier 是 error', () => {
    const warnings = branchTrackWarnings(
      { ...base, workitemBranchPattern: 'feature/fixed' },
      'iteration',
    );
    expect(warnings.some((warning) => warning.code === 'missing-identifier')).toBe(true);
    expect(highestSeverity(warnings)).toBe('error');
  });

  it('{template} 提示废弃并改用 {track}', () => {
    const warnings = branchTrackWarnings(
      { ...base, baselineBranchPattern: 'iteration/{iteration}/{template}' },
      'iteration',
    );
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'deprecated-template-token' }),
      ]),
    );
  });

  it('固定迭代基线给出 warning', () => {
    const warnings = branchTrackWarnings(
      { ...base, baselineBranchPattern: 'iteration/nationwide-warranty' },
      'iteration',
    );
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'fixed-iteration-baseline', severity: 'warning' }),
      ]),
    );
  });

  it('release 基线给出发布线 warning', () => {
    const warnings = branchTrackWarnings(
      { ...base, baselineBranchPattern: 'release/20261029' },
      'iteration',
    );
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'release-baseline', severity: 'warning' }),
      ]),
    );
  });

  it('global scope 不检查 iteration 固定基线', () => {
    const warnings = branchTrackWarnings(
      { ...base, baselineBranchPattern: 'master' },
      'global',
    );
    expect(warnings).toEqual([]);
  });
});
