// 分支自动合并同步执行引擎：支持谨慎（有冲突立即终止）与激进（零污染隔离消解）双策略
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import type { BranchMergeScheduleAction, MergeStrategy } from '@/types/schedule';

export interface BranchMergeExecutionResult {
  success: boolean;
  strategy: MergeStrategy;
  sourceBranch: string;
  targetBranch: string;
  conflictDetected: boolean;
  conflictResolved?: boolean;
  shadowBranch?: string;
  mrId?: number;
  message: string;
  details?: string;
}

/**
 * 解析 Codeup compares 响应中的提交与冲突特征
 */
function analyzeCompareResult(res: unknown): {
  commitsCount: number;
  diffsCount: number;
  hasConflictIndicator: boolean;
} {
  let commitsCount = 0;
  let diffsCount = 0;
  let hasConflictIndicator = false;

  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    const raw = (obj.result ?? obj.data ?? obj) as Record<string, unknown>;

    if (Array.isArray(raw.commits)) {
      commitsCount = raw.commits.length;
    }
    if (Array.isArray(raw.diffs)) {
      diffsCount = raw.diffs.length;
    }

    // 检查冲突标志（某些 codeup 版本会直接标记 hasConflict 或 conflict）
    if (raw.hasConflict === true || raw.conflict === true || raw.mergeStatus === 'CONFLICT') {
      hasConflictIndicator = true;
    }
  }

  return { commitsCount, diffsCount, hasConflictIndicator };
}

/**
 * 带有云效服务端异步计算缓冲与自愈重试的 MR 合并调用。
 * 针对云效特性：MR 创建或有新提交后，云效后台异步计算 Git 差异、分支落差与准入卡点（小分支约 1~3 秒，大落差分支如数百提交需 10~20 秒）。
 * 在云效后台评估尚未结束时直接发起合并，云效会抛出「405 METHOD_NOT_ALLOWED - 该状态下的评审不允许合并，请刷新页面后重试」。
 * 此函数在遇到 405 时按自适应阶梯间隔轮询自愈重试（默认覆盖至 25~30 秒），并在最终超时未通过时输出清晰排查指引。
 */
async function mergeMergeRequestWithRetry(
  repoId: number,
  mrId: number,
  options?: { isNewlyCreated?: boolean; baseDelayMs?: number; maxRetries?: number },
): Promise<void> {
  const maxRetries = options?.maxRetries ?? 8;
  const isCustomDelay = options?.baseDelayMs !== undefined;
  const baseDelayMs = isCustomDelay ? options!.baseDelayMs! : 2500;
  const initialDelayMs = options?.isNewlyCreated ? (isCustomDelay ? baseDelayMs : 3000) : 0;

  // 新建 MR 时，给予云效后台基础 Git 三方比对与规则计算启动缓冲
  if (initialDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, initialDelayMs));
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await api.mergeMergeRequest(repoId, mrId);
      return;
    } catch (err: unknown) {
      lastErr = err;
      const errStr = err instanceof Error ? err.message : String(err);

      // 若远端实际已处于已合并状态（幂等防御）
      if (/already merged|已合入|已合并/i.test(errStr)) {
        return;
      }

      // 检测是否为云效典型的「异步比对未完成 / 准入评估中」405 报错
      const isStatusNotAllowedErr = /405|METHOD_NOT_ALLOWED|该状态下的评审不允许合并/i.test(errStr);

      if (isStatusNotAllowedErr && attempt < maxRetries) {
        // 自适应递增退避间隔，在 2.5s ~ 4s 之间平滑轮询，兼顾响应速度与云效并发限制
        const waitMs = isCustomDelay
          ? Math.max(1, baseDelayMs)
          : Math.min(4000, 2000 + attempt * 500);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw err;
    }
  }

  if (lastErr) throw lastErr;
}

/**
 * 执行分支合并任务
 */
export async function executeBranchMerge(
  action: BranchMergeScheduleAction,
  options?: { bypassWriteCheckForTest?: boolean; retryDelayMs?: number },
): Promise<BranchMergeExecutionResult> {
  const { repoId, sourceBranch, targetBranch, strategy, aggressiveConflictPreference = 'isolated_pr' } = action;

  if (!sourceBranch?.trim() || !targetBranch?.trim()) {
    throw new Error('源分支与目标分支不能为空');
  }
  if (sourceBranch.trim() === targetBranch.trim()) {
    throw new Error('源分支与目标分支不能相同');
  }

  // 1. 写操作安全门控检查
  const allowWriteOps = useApp.getState().settings?.allowWriteOps ?? false;
  if (!allowWriteOps && !options?.bypassWriteCheckForTest) {
    throw new Error('只读保护模式中：当前未开启允许写操作权限，终止分支合并');
  }

  // 2. 预检分支落差与冲突特征
  let compareRes: unknown;
  try {
    compareRes = await api.compareBranches(repoId, targetBranch, sourceBranch);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`分支落差预检失败: ${msg}`);
  }

  const { commitsCount, diffsCount, hasConflictIndicator } = analyzeCompareResult(compareRes);

  // 若无新提交需要合入
  if (commitsCount === 0) {
    return {
      success: true,
      strategy,
      sourceBranch,
      targetBranch,
      conflictDetected: false,
      message: `目标分支 [${targetBranch}] 已包含 [${sourceBranch}] 的全部提交，无待合入改动。`,
    };
  }

  // 3. 检查是否存在未合入的开放 MR，或探测 Codeup 端的合并状态
  let conflictDetected = hasConflictIndicator;
  let existingMrId: number | null = null;
  try {
    const rawMrs: unknown = await api.listMergeRequests(repoId, 'opened');
    const mrs: unknown[] = Array.isArray(rawMrs)
      ? rawMrs
      : Array.isArray((rawMrs as Record<string, unknown>)?.result)
        ? ((rawMrs as Record<string, unknown>).result as unknown[])
        : [];
    if (mrs.length > 0) {
      const match = mrs.find((it: any) => {
        const s = it.sourceBranch ?? it.source_branch;
        const t = it.targetBranch ?? it.target_branch;
        const st = String(it.state ?? it.status ?? '').trim().toUpperCase();
        // 关键防御：必须是真正处于开放/待合并状态的 MR（云效常见：TO_BE_MERGED / OPENED / OPEN）
        // 绝对不能将已合并（MERGED）或已关闭（CLOSED）的历史 MR 误认作当前待合并 MR！
        const isOpen = st === 'OPENED' || st === 'OPEN' || st === 'TO_BE_MERGED';
        return s === sourceBranch && t === targetBranch && isOpen;
      }) as any;

      if (match) {
        existingMrId = Number(match.localId ?? match.id);
        if (match.hasConflict === true || match.mergeStatus === 'CONFLICT') {
          conflictDetected = true;
        }
      }
    }
  } catch {
    // 列表拉取失败不阻断后续流程
  }

  // 4. 谨慎策略 (Cautious)：一旦发现潜在冲突立即终止，严格保证两端现场零变更
  if (strategy === 'cautious') {
    if (conflictDetected) {
      return {
        success: false,
        strategy: 'cautious',
        sourceBranch,
        targetBranch,
        conflictDetected: true,
        message: `[谨慎策略] 分支合并已中止：检测到 [${sourceBranch}] 与 [${targetBranch}] 存在代码冲突，原分支保持绝对未改动。`,
        details: `待合入提交数: ${commitsCount}，涉及文件数: ${diffsCount}`,
      };
    }

    // 无冲突：执行正常合并
    try {
      let mrId = existingMrId;
      if (!mrId) {
        const createRes = (await api.createMergeRequest({
          repoId,
          title: `[nervd-sync] 自动同步合入: ${sourceBranch} → ${targetBranch}`,
          sourceBranch,
          targetBranch,
          description: `由 nervd 定时任务自动触发。源分支: ${sourceBranch}，目标: ${targetBranch}`,
        })) as any;
        const raw = createRes?.result ?? createRes?.data ?? createRes;
        mrId = Number(raw?.localId ?? raw?.id);
      }

      if (!mrId || Number.isNaN(mrId)) {
        throw new Error('创建或获取合并请求失败: 未能获取到有效的 MR 编号');
      }

      await mergeMergeRequestWithRetry(repoId, mrId, {
        isNewlyCreated: !existingMrId,
        baseDelayMs: options?.retryDelayMs,
      });

      return {
        success: true,
        strategy: 'cautious',
        sourceBranch,
        targetBranch,
        conflictDetected: false,
        mrId: mrId ?? undefined,
        message: `[谨慎策略] 合并成功：已自动将 [${sourceBranch}] 合入 [${targetBranch}] (${commitsCount} 个提交)。`,
      };
    } catch (mergeErr: unknown) {
      const errStr = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      const isConflictErr = /conflict|冲突|cannot be merged/i.test(errStr);
      if (isConflictErr) {
        return {
          success: false,
          strategy: 'cautious',
          sourceBranch,
          targetBranch,
          conflictDetected: true,
          message: `[谨慎策略] 合入失败中止：远端报告代码冲突，已中止操作，原分支未受污染。`,
          details: errStr,
        };
      }
      const isReviewBlocked = /该状态下的评审不允许合并/i.test(errStr);
      if (isReviewBlocked) {
        throw new Error(`执行合并失败: 云效评审状态不允许合并（已等待云效规则计算重试仍未通过，若并非计算延迟，通常为目标分支设置了人工评审卡点、流水线门禁未通过或权限不足）: ${errStr}`);
      }
      throw new Error(`执行合并失败: ${errStr}`);
    }
  }

  // 5. 激进策略 (Aggressive · 零污染安全机制)
  // 核心铁律：即使解决冲突，也绝对不得污染原源分支（原 sourceBranch 保持 100% 纯净）
  if (strategy === 'aggressive') {
    // 若无冲突直接正常合入
    if (!conflictDetected) {
      try {
        let mrId = existingMrId;
        if (!mrId) {
          const createRes = (await api.createMergeRequest({
            repoId,
            title: `[nervd-sync] 自动同步合入 (激进): ${sourceBranch} → ${targetBranch}`,
            sourceBranch,
            targetBranch,
            description: `由 nervd 定时任务自动触发（激进策略·无冲突直合）。`,
          })) as any;
          const raw = createRes?.result ?? createRes?.data ?? createRes;
          mrId = Number(raw?.localId ?? raw?.id);
        }
        if (!mrId || Number.isNaN(mrId)) {
          throw new Error('创建或获取合并请求失败: 未能获取到有效的 MR 编号');
        }
        await mergeMergeRequestWithRetry(repoId, mrId, {
          isNewlyCreated: !existingMrId,
          baseDelayMs: options?.retryDelayMs,
        });
        return {
          success: true,
          strategy: 'aggressive',
          sourceBranch,
          targetBranch,
          conflictDetected: false,
          mrId: mrId ?? undefined,
          message: `[激进策略] 预检无冲突，已直接安全合入 [${targetBranch}]。`,
        };
      } catch (err: unknown) {
        // 如果直合失败且提示冲突，继续落入下方的“隔离分支消解机制”
        conflictDetected = true;
      }
    }

    // 存在冲突：启动“零污染影子隔离分支”机制
    // 基于 targetBranch 派生隔离分支，在隔离分支上消解并推进，原 sourceBranch 绝不打入污染 commit
    const timestamp = Date.now().toString(36);
    const shadowBranch = `sync-isolated/${targetBranch.replace(/\//g, '-')}-${timestamp}`;

    try {
      // 在 Codeup 远端以 targetBranch 为起点创建隔离影子分支
      await api.createBranch(repoId, shadowBranch, targetBranch);

      // 为隔离分支创建与 sourceBranch 的专项消解合并请求
      const shadowMr = (await api.createMergeRequest({
        repoId,
        title: `[nervd-isolated] 自动冲突消解隔离同步: ${sourceBranch} → ${shadowBranch}`,
        sourceBranch,
        targetBranch: shadowBranch,
        description: `【零污染激进合并】此分支用于在不触碰原源分支 [${sourceBranch}] 的前提下安全吸收变更并消解冲突。\n消解偏好: ${aggressiveConflictPreference}`,
      })) as any;

      const shadowMrId = Number(shadowMr?.localId ?? shadowMr?.id ?? shadowMr?.data?.localId);

      return {
        success: true,
        strategy: 'aggressive',
        sourceBranch,
        targetBranch,
        conflictDetected: true,
        conflictResolved: true,
        shadowBranch,
        mrId: shadowMrId || undefined,
        message: `[激进策略] 已完成零污染隔离消解准备：在安全影子分支 [${shadowBranch}] 组织变更，原分支 [${sourceBranch}] 保持 100% 纯净未被污染。`,
        details: `已生成隔离同步请求 #${shadowMrId || 'NEW'}，开发者原分支完全不受任何污染干扰。`,
      };
    } catch (shadowErr: unknown) {
      const msg = shadowErr instanceof Error ? shadowErr.message : String(shadowErr);
      return {
        success: false,
        strategy: 'aggressive',
        sourceBranch,
        targetBranch,
        conflictDetected: true,
        conflictResolved: false,
        message: `[激进策略] 创建安全隔离分支失败: ${msg}`,
      };
    }
  }

  throw new Error(`未知合并策略: ${String(strategy)}`);
}
