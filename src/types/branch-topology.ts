// 分支拓扑（子分支 / 基点 / MR 目标）扩展类型。
//
// 不改冻结的 `BranchRuleTemplate`；拓扑以 trackId 为键单独持久化。

import type { BranchRuleTemplate } from '../types';

export type ChildBranchBase = 'requirement' | 'baseline';
export type ChildMrTarget = 'parent' | 'baseline';

export interface BranchTrackTopology {
  trackId: string;
  /**
   * `null` = 沿用旧行为（子分支 = workitemBranchPattern 展开子项编号）；
   * `''` = 不建子分支，子项共用需求分支；
   * 其他 = 自定义模式，支持 `{identifier}` / `{parentIdentifier}` / `{iteration}` / `{track}` / `{iterationEnd}` / `{yyyy}` / `{MM}` / `{dd}`。
   */
  childPattern: string | null;
  childBase: ChildBranchBase;
  childMrTarget: ChildMrTarget;
}

export interface ChildBranchResolution {
  /** undefined 表示不建子分支（子项共用需求分支）。 */
  sourceBranch?: string;
  baseBranch: string;
  targetBranch: string;
  /** true = 使用旧行为（未配置 childPattern）。 */
  legacy: boolean;
  warning?: string;
}

export interface ResolvedChildTopologyInput {
  topology?: BranchTrackTopology | null;
  template: BranchRuleTemplate;
  iterationName: string;
  parentIdentifier: string;
  childIdentifier: string;
  parentBranch: string;
  baselineBranch: string;
  parentBranchExists: boolean;
}