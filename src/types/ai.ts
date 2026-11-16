// AI 专有数据类型定义（与 types.ts 隔离，保证冻结契约完整性）

export type AiProvider = 'dashscope' | 'deepseek' | 'openai' | 'zhipu' | 'custom';
export type AiBreakdownMode = 'review' | 'direct';

export interface AiCustomPrompts {
  breakdown?: string;
  commentSummary?: string;
  commentDraft?: string;
  repoRecommendation?: string;
  mergeRequest?: string;
}

export interface AiSettings {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  temperature: number;
  breakdownMode: AiBreakdownMode;
  defaultBreakdownTags: string[];
  customPrompts?: AiCustomPrompts;
}

export interface AiSettingsView extends AiSettings {
  hasApiKey: boolean;
}

export interface AiTestConnectionResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  reply: string;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiBreakdownItem {
  id: string;
  subject: string;
  /** 旧版维度标签：新版按功能点拆解，不再产出 */
  tag?: string;
  selected: boolean;
  /** 建议的实施顺序（从 0 开始） */
  order?: number;
  assigneeId?: string;
  assigneeName?: string;
  /** 旧版工时评估：新版不再产出，保留字段仅兼容历史数据 */
  estimatedHours?: number;
}

/** 一次拆解使用的完整仓库上下文 */
export interface BreakdownContext {
  scope: BreakdownRepoScope[];
  code: BreakdownRepoCode[];
}

/** 现有代码节选（AI 拆解上下文） */
export interface BreakdownRepoCode {
  repoName: string;
  gitRef?: string;
  tree?: string[];
  files?: Array<{ path: string; content: string; truncated: boolean }>;
  note?: string;
}

/** AI 拆解时传给模型的单个仓库上下文：仓库名 + 开发分支相对基准分支的改动范围 */
export interface BreakdownRepoScope {
  repoName: string;
  workitemBranch?: string;
  baselineBranch?: string;
  /** 开发分支是否已创建 */
  branchCreated: boolean;
  /** 变更文件（按改动量排序后截断） */
  files?: Array<{ path: string; additions: number; deletions: number }>;
  /** 读取失败等说明 */
  note?: string;
}

export interface AiMergeRequestDraft {
  title: string;
  description: string;
}

/** 缺陷页发起 MR 的 AI 一次性产物：MR 标题 + 修改说明（写入 MR 描述）+ 测试影响范围（发布到缺陷动态） */
export interface AiBugMergeContext {
  title: string;
  /** 修改说明：结构化 Markdown，填充 MR 详细变更说明 */
  description: string;
  /** 测试影响范围：发布为缺陷动态评论的 Markdown */
  testImpactScope: string;
}

export interface AiRepoRecommendation {
  repoId: number;
  repoName: string;
  reason: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface AiCommentSummary {
  consensus: string[];
  blockers: string[];
  actionItems: string[];
  rawSummary: string;
}
