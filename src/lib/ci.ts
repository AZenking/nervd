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

export type CiStatusTone = 'ok' | 'run' | 'fail' | 'idle';

export interface CiStatusInfo {
  label: string;
  tone: CiStatusTone;
}

/**
 * CI / 流水线构建运行状态规范枚举字典
 * 覆盖 Jenkins（building, success, failure, aborted, unstable 等）
 * 以及阿里云效 Flow（RUNNING, SUCCESS, FAIL, CANCELED, WAITING 等）
 */
export const CI_STATUS_MAP: Record<string, CiStatusInfo> = {
  // 运行 / 排队态 (tone: 'run')
  RUNNING: { label: '运行中', tone: 'run' },
  IN_PROGRESS: { label: '运行中', tone: 'run' },
  BUILDING: { label: '构建中', tone: 'run' },
  WAITING: { label: '等待中', tone: 'run' },
  PENDING: { label: '等待中', tone: 'run' },
  QUEUED: { label: '排队中', tone: 'run' },

  // 成功态 (tone: 'ok')
  SUCCESS: { label: '成功', tone: 'ok' },
  FINISH: { label: '成功', tone: 'ok' },
  PASSED: { label: '成功', tone: 'ok' },

  // 失败 / 异常态 (tone: 'fail')
  FAIL: { label: '失败', tone: 'fail' },
  FAILURE: { label: '失败', tone: 'fail' },
  FAILED: { label: '失败', tone: 'fail' },
  ERROR: { label: '失败', tone: 'fail' },
  UNSTABLE: { label: '不稳定', tone: 'fail' },
  TIMEOUT: { label: '超时', tone: 'fail' },

  // 中止 / 取消 / 空闲态 (tone: 'idle')
  CANCELED: { label: '已取消', tone: 'idle' },
  CANCELLED: { label: '已取消', tone: 'idle' },
  ABORTED: { label: '已中止', tone: 'idle' },
  PAUSED: { label: '已暂停', tone: 'idle' },
  SKIPPED: { label: '已跳过', tone: 'idle' },
  TERMINATED: { label: '已终止', tone: 'idle' },
  NOT_BUILT: { label: '未构建', tone: 'idle' },
  OTHER: { label: '其他', tone: 'idle' },
};

/**
 * 解析 CI 状态元数据（语义分组与中文名）
 */
export function ciStatusInfo(status?: string | null): CiStatusInfo {
  const raw = (status ?? '').trim();
  if (!raw || raw === '—') return { label: '—', tone: 'idle' };
  const matched = CI_STATUS_MAP[raw.toUpperCase()];
  if (matched) return matched;
  // 中文关键词兜底（失败/成功优先判定，避免「构建失败」被「构建」误判为运行态）
  if (/失败|错误|阻塞|异常|不稳定|超时/.test(raw)) return { label: raw, tone: 'fail' };
  if (/完成|成功|通过/.test(raw)) return { label: raw, tone: 'ok' };
  if (/进行|运行|处理中|构建|开启|加载|排队|等待/.test(raw)) return { label: raw, tone: 'run' };
  return { label: raw, tone: 'idle' };
}

/** CI 状态展示值：转为中文枚举（RUNNING → 运行中，SUCCESS → 成功等），缺失时按「加载中 / 查询失败 / —」兜底（全工程统一口径） */
export function ciStatusText(
  status: string | null | undefined,
  entry?: { loading?: boolean; error?: string | null } | null,
): string {
  if (entry?.loading) return '加载中';
  if (entry?.error) return '查询失败';
  const info = ciStatusInfo(status);
  return info.label;
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

