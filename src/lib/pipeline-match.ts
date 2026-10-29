import type { PipelineSummary } from '@/types';

export interface PipelineMatchResult {
  bestMatch: PipelineSummary | null;
  score: number;
  reason?: string;
}

/**
 * 智能匹配与指定代码仓库最相关的云效 Flow 流水线
 * 匹配策略与置信分权重：
 * 1. 名称完全一致（忽略大小写）：100 分
 * 2. 仓库名作为独立前缀/后缀（如 repo="trade-service", pipeline="trade-service-prod"）：85 分
 * 3. 包含完整仓库名（如 pipeline="deploy-trade-service"）：75 分
 * 4. 仓库名包含流水线名（如 repo="nervd-app", pipeline="nervd"）：70 分
 * 5. 命名分词重叠度（按 -、_、.、/ 分词）：50~65 分
 */
export function matchPipelineForRepo(
  repoName: string,
  pipelines: PipelineSummary[],
): PipelineMatchResult {
  if (!repoName || !pipelines || pipelines.length === 0) {
    return { bestMatch: null, score: 0 };
  }

  // 提取纯仓库名（去除组织/群组前缀）
  const cleanRepo = (repoName.includes('/') ? repoName.split('/').pop()! : repoName)
    .trim()
    .toLowerCase();

  if (!cleanRepo) {
    return { bestMatch: null, score: 0 };
  }

  const repoTokens = new Set(
    cleanRepo.split(/[-_./\s]+/).filter((t) => t.length > 1),
  );

  let best: PipelineSummary | null = null;
  let maxScore = 0;
  let matchReason = '';

  for (const pipeline of pipelines) {
    const pName = pipeline.pipelineName.trim().toLowerCase();
    let score = 0;
    let reason = '';

    if (pName === cleanRepo) {
      score = 100;
      reason = '流水线名称与仓库名完全一致';
    } else if (
      pName.startsWith(`${cleanRepo}-`) ||
      pName.startsWith(`${cleanRepo}_`) ||
      pName.endsWith(`-${cleanRepo}`) ||
      pName.endsWith(`_${cleanRepo}`)
    ) {
      score = 85;
      reason = `流水线包含完整仓库标识「${cleanRepo}」`;
    } else if (pName.includes(cleanRepo)) {
      score = 75;
      reason = `流水线包含仓库名「${cleanRepo}」`;
    } else if (cleanRepo.includes(pName) && pName.length >= 3) {
      score = 70;
      reason = `仓库名包含流水线标识「${pName}」`;
    } else if (repoTokens.size > 0) {
      const pTokens = pName.split(/[-_./\s]+/).filter((t) => t.length > 1);
      const overlap = pTokens.filter((t) => repoTokens.has(t)).length;
      if (overlap > 0) {
        score = Math.min(65, 30 + overlap * 15);
        reason = `关键字匹配 (${overlap} 处重合)`;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      best = pipeline;
      matchReason = reason;
    }
  }

  // 置信分 >= 60 判定为有效推荐
  if (maxScore >= 60 && best) {
    return { bestMatch: best, score: maxScore, reason: matchReason };
  }

  return { bestMatch: null, score: maxScore };
}
