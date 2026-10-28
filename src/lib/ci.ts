import type { CiRunSummary, JenkinsJobSummary, RepoCiBinding } from '@/types';

/**
 * CI 领域共享逻辑：提供方文案、状态兜底、Jenkins 参数推断、触发反馈链路。
 * 迭代仓库表 / CI 详情抽屉 / 需求详情仓库表 / 总览 CI 卡共用同一口径。
 */

/** 提供方展示名（未绑定为「未绑定 CI」） */
export function ciProviderLabel(binding?: RepoCiBinding | null): string {
  return binding?.provider === 'flow'
    ? '云效 Flow'
    : binding?.provider === 'jenkins'
      ? 'Jenkins'
      : '未绑定 CI';
}

/** CI 状态展示值：快照缺失时按「加载中 / 查询失败 / —」兜底（全工程统一口径，含查询失败分支） */
export function ciStatusText(
  status: string | null | undefined,
  entry?: { loading?: boolean; error?: string | null } | null,
): string {
  return status ?? (entry?.loading ? '加载中' : entry?.error ? '查询失败' : '—');
}

/** Jenkins 参数名推断：分支类（branch/branchname/gitref/scmref 等） */
export function isBranchParameterName(name: string): boolean {
  return /(^|[_-])(git)?branch([_-]|$)/i.test(name) || /branchname|gitref|scmref/i.test(name);
}

/** Jenkins 参数名推断：环境类（env/environment/deployenv/targetenv 等） */
export function isEnvironmentParameterName(name: string): boolean {
  return /(^|[_-])(env|environment|deployenv|targetenv)([_-]|$)/i.test(name) || /environment/i.test(name);
}

/** 从构建记录取分支/环境参数值：优先绑定参数名的实际值，缺失时按参数名推断，无记录显示「未记录」 */
export function buildRunParameter(
  run: CiRunSummary | undefined,
  selectedName: string | undefined,
  kind: 'branch' | 'environment',
): string {
  const parameters = run?.parameters ?? {};
  const matcher = kind === 'branch' ? isBranchParameterName : isEnvironmentParameterName;
  const oppositeMatcher = kind === 'branch' ? isEnvironmentParameterName : isBranchParameterName;
  const isValidSelected = selectedName && !oppositeMatcher(selectedName);
  const selectedValue = isValidSelected ? parameters[selectedName] : undefined;
  if (selectedValue?.trim()) return selectedValue;
  const inferred = Object.entries(parameters).find(([name]) => matcher(name))?.[1];
  return inferred?.trim() || '未记录';
}


export interface ScoredJenkinsJob {
  name: string;
  fullName: string;
  isSaved: boolean;
  isRecommended: boolean;
  score: number;
}

/**
 * Jenkins Job 推荐与置顶排序算法：
 * 1. 优先度 100（最高）：当前仓库已绑定的 Job
 * 2. 优先度 80：包含当前仓库完整名称（如 foton-mobile-view-sst-fed-isd 包含 mobile-view）
 * 3. 优先度 70：归一化去标点匹配（忽略 - / _ / . 等标点）
 * 4. 优先度 60：仓库分词全命中（如 mobile-view 的 tokens ['mobile', 'view'] 均在 job 中）
 * 5. 普通 Job（score = 0）：按字母顺序自然排序置后
 */
export function sortJenkinsJobsWithRecommendation(
  jobs: JenkinsJobSummary[],
  repoName: string,
  savedJobFullName?: string,
): ScoredJenkinsJob[] {
  const cleanRepo = (repoName.split('/').pop() || repoName).trim().toLowerCase();
  const normRepo = cleanRepo.replace(/[-_.]/g, '');
  const repoTokens = cleanRepo.split(/[-_.]/).filter((t) => t.length >= 2);

  const scored: ScoredJenkinsJob[] = jobs.map((job) => {
    const isSaved = Boolean(savedJobFullName && job.fullName === savedJobFullName);
    if (isSaved) {
      return {
        name: job.name,
        fullName: job.fullName,
        isSaved: true,
        isRecommended: true,
        score: 100,
      };
    }

    const lowerJob = job.fullName.toLowerCase();
    let isRecommended = false;
    let score = 0;

    if (cleanRepo && lowerJob.includes(cleanRepo)) {
      isRecommended = true;
      score = 80;
    } else if (normRepo.length >= 3 && lowerJob.replace(/[-_.]/g, '').includes(normRepo)) {
      isRecommended = true;
      score = 70;
    } else if (repoTokens.length >= 2 && repoTokens.every((token) => lowerJob.includes(token))) {
      isRecommended = true;
      score = 60;
    }

    return {
      name: job.name,
      fullName: job.fullName,
      isSaved: false,
      isRecommended,
      score,
    };
  });

  return scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.fullName.localeCompare(b.fullName);
  });
}

