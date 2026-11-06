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
  tag: string;
  selected: boolean;
  assigneeId?: string;
  assigneeName?: string;
  /** AI 评估的预计工时（小时，0.5 粒度）；undefined 表示未评估 */
  estimatedHours?: number;
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
