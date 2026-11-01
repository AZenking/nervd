import { invoke } from '@tauri-apps/api/core';
import type {
  AiBreakdownItem,
  AiChatMessage,
  AiCommentSummary,
  AiMergeRequestDraft,
  AiRepoRecommendation,
  AiSettings,
  AiSettingsView,
  AiTestConnectionResult,
} from '@/types/ai';

function hasTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

const DEFAULT_AI_SETTINGS: AiSettingsView = {
  provider: 'dashscope',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-plus',
  temperature: 0.3,
  breakdownMode: 'review',
  defaultBreakdownTags: ['前端', '后端', '自测'],
  hasApiKey: true,
  customPrompts: {},
};

export async function getAiSettings(): Promise<AiSettingsView> {
  if (!hasTauri()) {
    const raw = localStorage.getItem('nervd_ai_settings');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // ignore
      }
    }
    return DEFAULT_AI_SETTINGS;
  }
  return invoke('get_ai_settings');
}

export async function saveAiSettings(settings: AiSettings): Promise<AiSettingsView> {
  if (!hasTauri()) {
    const next: AiSettingsView = { ...settings, hasApiKey: true };
    localStorage.setItem('nervd_ai_settings', JSON.stringify(next));
    return next;
  }
  return invoke('save_ai_settings', { settings });
}

export async function saveAiApiKey(apiKey: string): Promise<boolean> {
  if (!hasTauri()) {
    localStorage.setItem('nervd_ai_api_key', apiKey);
    return true;
  }
  return invoke('save_ai_api_key', { apiKey });
}

export async function deleteAiApiKey(): Promise<boolean> {
  if (!hasTauri()) {
    localStorage.removeItem('nervd_ai_api_key');
    return true;
  }
  return invoke('delete_ai_api_key');
}

export async function testAiConnection(): Promise<AiTestConnectionResult> {
  if (!hasTauri()) {
    return {
      ok: true,
      latencyMs: 128,
      model: 'qwen-plus',
      reply: 'pong (preview mock)',
    };
  }
  return invoke('test_ai_connection');
}

export async function aiChatCompletion(params: {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  if (!hasTauri()) {
    return `[
  { "tag": "前端", "subject": "实现订单退款流转界面与状态即时回显" },
  { "tag": "后端", "subject": "提供订单退款 RPC 接口与状态变更审计" },
  { "tag": "自测", "subject": "验证并发退款幂等性与资金账户正确回滚" }
]`;
  }
  return invoke('ai_chat_completion', {
    messages: params.messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
}

/** 辅助解析大模型返回的 JSON 片段 */
function parseJsonFromLlm<T>(raw: string, fallback: T): T {
  try {
    // 优先匹配 ```json ... ``` 或 ``` ... ``` 代码块
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const textToParse = codeBlockMatch ? codeBlockMatch[1] : raw.trim();
    return JSON.parse(textToParse) as T;
  } catch {
    // 尝试寻找首个 '[' 或 '{'
    const startBracket = raw.indexOf('[');
    const endBracket = raw.lastIndexOf(']');
    if (startBracket !== -1 && endBracket > startBracket) {
      try {
        return JSON.parse(raw.slice(startBracket, endBracket + 1)) as T;
      } catch {
        // ignore
      }
    }
    const startBrace = raw.indexOf('{');
    const endBrace = raw.lastIndexOf('}');
    if (startBrace !== -1 && endBrace > startBrace) {
      try {
        return JSON.parse(raw.slice(startBrace, endBrace + 1)) as T;
      } catch {
        // ignore
      }
    }
    return fallback;
  }
}

/**
 * 需求智能拆解：按指定 Tag 维度（如前端、后端、自测）将需求拆解为具体可落地的子任务
 */
export async function aiBreakdownRequirement(
  subject: string,
  description: string,
  tags: string[],
): Promise<AiBreakdownItem[]> {
  const activeTags = tags.length > 0 ? tags : ['前端', '后端', '自测'];
  const tagsStr = activeTags.join('、');

  const settings = await getAiSettings();
  const customRule = settings.customPrompts?.breakdown?.trim();

  const systemPrompt = `你是一个资深敏捷研发架构师与任务拆解专家。
你的任务是将用户提供的需求拆解为具体的、可落地的子任务列表。
要求：
1. 只能在以下指定的维度标签中选择分类：【${tagsStr}】。
2. 每个子任务标题必须清晰、动宾结构、表达明确的交付产物，尽量控制在 25 个汉字以内。
3. 为每个子任务评估预计工时 estimatedHours（单位小时，按 0.5 粒度取整，范围 0.5~40），按单个熟练工程师的纯开发/测试耗时估算，不含评审与等待。
4. 严格输出符合格式的 JSON 数组，严禁包含任何前缀闲聊或 Markdown 解释文字。
5. JSON 结构规范：
[
  { "tag": "前端", "subject": "实现退款申请弹窗与表单校验逻辑", "estimatedHours": 4 },
  { "tag": "后端", "subject": "提供退款申请校验与状态流转 RPC 接口", "estimatedHours": 3 },
  { "tag": "自测", "subject": "验证并发退款场景下幂等性与资金状态回写", "estimatedHours": 1.5 }
]${customRule ? `\n\n团队自定义规则与工程规范：\n${customRule}` : ''}`;

  const userPrompt = `需求标题：${subject}
需求详细描述与上下文：
${description ? description.slice(0, 1500) : '（暂无详细描述，请根据标题进行标准研发任务拆解）'}

请针对上述【${tagsStr}】维度，输出 3~6 个高质量子任务 JSON 列表：`;

  const responseText = await aiChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  });

  interface RawItem {
    tag?: string;
    subject?: string;
    estimatedHours?: number;
  }

  const rawList = parseJsonFromLlm<RawItem[]>(responseText, []);
  if (!Array.isArray(rawList) || rawList.length === 0) {
    // 降级兜底方案：按行解析
    const lines = responseText.split('\n').filter((l) => l.trim().length > 0);
    return lines.slice(0, 5).map((line, idx) => ({
      id: `ai-${Date.now()}-${idx}`,
      subject: line.replace(/^[-*0-9.)\s]+/, '').trim(),
      tag: activeTags[idx % activeTags.length] || '子任务',
      selected: true,
    }));
  }

  return rawList.map((item, idx) => {
    const hours = Number(item.estimatedHours);
    return {
      id: `ai-${Date.now()}-${idx}`,
      subject: item.subject?.trim() || `子任务 ${idx + 1}`,
      tag: item.tag?.trim() || activeTags[0],
      selected: true,
      // 0.5 粒度、上限 40h；非法值视为未评估，交给用户手填
      estimatedHours: Number.isFinite(hours) && hours > 0
        ? Math.min(40, Math.round(hours * 2) / 2)
        : undefined,
    };
  });
}

/**
 * AI 生成 Merge Request 规范标题与结构化描述
 */
export async function aiGenerateMergeRequest(params: {
  identifier: string;
  subject: string;
  sourceBranch: string;
  targetBranch: string;
  commits?: string[];
}): Promise<AiMergeRequestDraft> {
  const settings = await getAiSettings();
  const customRule = settings.customPrompts?.mergeRequest?.trim();

  const commitListStr = (params.commits && params.commits.length > 0)
    ? params.commits.slice(0, 15).join('\n')
    : '（未提供具体 commit 信息，根据需求标题推导）';

  const systemPrompt = `你是一名精通 Git 与大型协同规范的代码审查助手。
请根据需求和 Git 提交历史，生成符合 Conventional Commits 规范的 Merge Request 标题与结构化 PR 描述。
严格返回如下 JSON 格式，不要输出其他文字：
{
  "title": "feat(REQ-123): 简要描述",
  "description": "### 需求背景\\n...\\n\\n### 核心变更\\n- ...\\n\\n### 自测验证\\n- [ ] ...\\n\\n### 风险与注意事项\\n无"
}${customRule ? `\n\n团队自定义 MR 规范：\n${customRule}` : ''}`;

  const userPrompt = `需求编号：${params.identifier}
需求标题：${params.subject}
源分支：${params.sourceBranch}
目标分支：${params.targetBranch}
最新 Commit 提交记录：
${commitListStr}`;

  const responseText = await aiChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  });

  const parsed = parseJsonFromLlm<{ title?: string; description?: string }>(responseText, {
    title: `${params.identifier}: ${params.subject}`,
    description: `### 关联工作项\n${params.identifier} ${params.subject}\n\n### 变更说明\n${params.sourceBranch} -> ${params.targetBranch}`,
  });

  return {
    title: parsed.title || `${params.identifier}: ${params.subject}`,
    description: parsed.description || `关联需求：${params.identifier}`,
  };
}

/**
 * 需求讨论历史智能提炼纪要 (TL;DR)
 */
export async function aiSummarizeComments(
  subject: string,
  comments: { author: string; time?: string; content: string }[],
): Promise<AiCommentSummary> {
  const settings = await getAiSettings();
  const customRule = settings.customPrompts?.commentSummary?.trim();

  const commentsText = comments
    .map((c, i) => `[#${i + 1}] ${c.author} (${c.time || '未知时间'}): ${c.content}`)
    .join('\n');

  const systemPrompt = `你是一名研发敏捷项目管理与协同专家。
请根据需求下的历史讨论评论，提炼出一份精炼清晰的讨论纪要 (TL;DR)。
输出严格的 JSON 格式：
{
  "consensus": ["达成共识的要点1", "达成共识的要点2"],
  "blockers": ["阻塞或卡点问题（若无则为空数组）"],
  "actionItems": ["待跟进事项及跟进人（若无则为空数组）"],
  "rawSummary": "一段简短概括总结（3句话以内）"
}${customRule ? `\n\n团队自定义纪要规则：\n${customRule}` : ''}`;

  const userPrompt = `需求标题：${subject}
历史讨论评论列表：
${commentsText}`;

  const res = await aiChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  });

  return parseJsonFromLlm<AiCommentSummary>(res, {
    consensus: ['讨论暂无结构化共识'],
    blockers: [],
    actionItems: [],
    rawSummary: res.slice(0, 300),
  });
}

/**
 * 评论草稿智能生成（研发进度同步 / 提测交付说明 / 智能润色）
 */
export async function aiGenerateCommentDraft(params: {
  type: 'progress' | 'test_delivery' | 'polish';
  subject: string;
  identifier: string;
  branch?: string;
  ciStatus?: string;
  subtaskStats?: { total: number; done: number };
  draftText?: string;
}): Promise<string> {
  const settings = await getAiSettings();
  const customRule = settings.customPrompts?.commentDraft?.trim();

  let scenarioDesc = '';
  if (params.type === 'progress') {
    scenarioDesc = '生成一段清晰规范的研发进度同步汇报，简要说明当前开发完成度、关联分支状态及下一步计划。';
  } else if (params.type === 'test_delivery') {
    scenarioDesc = '生成一份规范的提测交付说明，包含需求编号、提测分支、主要改动特性与测试注意事项。';
  } else {
    scenarioDesc = '将用户输入的粗略要点草稿整理润色为条理清晰、格式专业的评论。';
  }

  const systemPrompt = `你是一个高效敏捷研发团队的技术负责人。
任务：${scenarioDesc}
要求：
1. 输出规范结构化的富文本 Markdown（使用有序/无序列表、加粗重点）。
2. 【严格禁止使用任何 Emoji 表情符号】（严禁使用任何表情图标），因为云效服务端底层数据库不支持 Emoji 会直接触发 400 校验拦截报错。必须用纯文本或数字/符号替代。
3. 言简意赅，语气专业高效，严禁包含任何前缀闲聊（如“好的，这是为您生成的…”）。
${customRule ? `\n\n团队自定义评论规范：\n${customRule}` : ''}`;

  const userPrompt = `需求：${params.identifier} ${params.subject}
${params.branch ? `关联分支：${params.branch}\n` : ''}${params.ciStatus ? `CI 构建状态：${params.ciStatus}\n` : ''}${params.subtaskStats ? `子任务进度：${params.subtaskStats.done}/${params.subtaskStats.total} 已完成\n` : ''}${params.draftText ? `用户草稿要点：\n${params.draftText}` : ''}`;

  return aiChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  });
}

/**
 * 智能推荐关联代码仓库
 */
export async function aiRecommendRepositories(params: {
  subject: string;
  description: string;
  availableRepos: { id: number; name: string; description?: string }[];
}): Promise<AiRepoRecommendation[]> {
  const settings = await getAiSettings();
  const customRule = settings.customPrompts?.repoRecommendation?.trim();

  const repoListStr = params.availableRepos
    .slice(0, 80)
    .map((r) => `- [${r.id}] ${r.name}${r.description ? ` (${r.description})` : ''}`)
    .join('\n');

  const systemPrompt = `你是一个大型分布式微服务架构技术专家。
你的任务是根据给定的产品需求（标题与描述），从候选代码仓库列表中推荐 1~3 个最可能需要改动的仓库。
若候选描述中标注为「默认云效仓库」，说明它是团队常驻主仓库；在相关度接近时应优先选择它，而不是牵强的冷门仓库。
输出严格的 JSON 数组格式，不要包含任何前置解释：
[
  {
    "repoId": 12345,
    "repoName": "xxx-service",
    "reason": "推荐理由（20字以内，如负责订单退款核心RPC接口）",
    "confidence": "high"
  }
]${customRule ? `\n\n团队架构与仓库规则：\n${customRule}` : ''}`;

  const userPrompt = `需求标题：${params.subject}
需求详细描述：
${params.description ? params.description.slice(0, 1000) : '（暂无详细描述）'}

可选代码仓库清单：
${repoListStr}

请输出推荐修改的代码仓库 JSON 列表：`;

  const res = await aiChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  });

  return parseJsonFromLlm<AiRepoRecommendation[]>(res, []);
}

/**
 * 集成分支发版交付报告（Release Notes）一键生成
 */
export async function aiGenerateReleaseNotes(params: {
  branchName: string;
  baseBranch: string;
  commits: string[];
  workitems: { identifier: string; subject: string }[];
}): Promise<string> {
  const workitemsStr = params.workitems.length > 0
    ? params.workitems.map((w) => `- **${w.identifier}**: ${w.subject}`).join('\n')
    : '无直接关联工作项';

  const commitsStr = params.commits.length > 0
    ? params.commits.slice(0, 30).map((c) => `- ${c}`).join('\n')
    : '无超前提交';

  const systemPrompt = `你是一个软件工程交付总监。
请根据集成分支与其领先提交、关联云效需求，撰写一份清晰、专业、排版优美的 Markdown 格式发版交付报告（Release Notes）。
报告结构包含：
- 版本与交付概览（分支名、基准分支、交付日期）
- 新增功能与业务特性（Features）
- 缺陷与问题修复（Bug Fixes）
- 架构调优与基础设施（Improvements）
- 关联需求编号与提交清单
直接输出 Markdown 内容，无需包裹最外层 \`\`\`markdown。`;

  const userPrompt = `集成分支：${params.branchName}
基准分支：${params.baseBranch}
关联云效需求项：
${workitemsStr}

分支超前提交记录：
${commitsStr}`;

  return aiChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 3000,
  });
}
