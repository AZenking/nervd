// 分支模板策略提示：只做可行动警告，不阻断保存。
import type { BranchRuleTemplate } from '@/types';

export type BranchTrackWarningSeverity = 'error' | 'warning' | 'info';

export interface BranchTrackWarning {
  code: string;
  severity: BranchTrackWarningSeverity;
  message: string;
}

/**
 * 检查一条分支轨道是否符合当前策略：
 * - 需求分支必须含 {identifier}；
 * - iteration scope 的 baseline 默认应含 {iteration}；固定 baseline 提示“确认长期线”；
 * - release/* 作为 iteration baseline 时提示发布线语义；
 * - 需求分支前缀与常见约定不一致时给 info。
 */
export function branchTrackWarnings(
  template: Pick<BranchRuleTemplate, 'baselineBranchPattern' | 'workitemBranchPattern'>,
  scope: 'global' | 'iteration',
): BranchTrackWarning[] {
  const warnings: BranchTrackWarning[] = [];
  const baseline = template.baselineBranchPattern.trim();
  const workitem = template.workitemBranchPattern.trim();

  if (baseline.includes('{template}') || workitem.includes('{template}')) {
    warnings.push({
      code: 'deprecated-template-token',
      severity: 'warning',
      message: '{template} 已废弃，请改用 {track}',
    });
  }

  if (!workitem.includes('{identifier}') && !workitem.includes('{parentIdentifier}')) {
    warnings.push({
      code: 'missing-identifier',
      severity: 'error',
      message: '需求开发分支模板缺少 {identifier}，同一仓库的多个需求会生成同名分支',
    });
  }

  if (scope === 'iteration') {
    if (baseline.startsWith('release/')) {
      warnings.push({
        code: 'release-baseline',
        severity: 'warning',
        message: 'release/* 是发布线，不应作为迭代默认基线；请确认这是独立的发布轨道',
      });
    } else if (!baseline.includes('{iteration}')) {
      warnings.push({
        code: 'fixed-iteration-baseline',
        severity: 'warning',
        message: '该迭代基线是固定分支；请确认它是长期产品线，否则改用 {iteration}',
      });
    }
  }

  if (workitem && !/^(feature|bugfix|hotfix|release)\//.test(workitem)) {
    warnings.push({
      code: 'unusual-prefix',
      severity: 'info',
      message: '需求分支前缀不是 feature/ 或 bugfix/，请确认符合团队命名约定',
    });
  }

  return warnings;
}

export function highestSeverity(
  warnings: readonly BranchTrackWarning[],
): BranchTrackWarningSeverity | null {
  if (warnings.some((warning) => warning.severity === 'error')) return 'error';
  if (warnings.some((warning) => warning.severity === 'warning')) return 'warning';
  if (warnings.some((warning) => warning.severity === 'info')) return 'info';
  return null;
}
