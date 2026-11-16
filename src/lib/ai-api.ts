import { invoke } from '@tauri-apps/api/core';
import type {
  AiBreakdownItem,
  AiBugMergeContext,
  BreakdownRepoCode,
  BreakdownRepoScope,
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

/** 去除 JSON 里对象/数组末尾的逗号（LLM 常输出 `}, ]` 这类非法 JSON）。 */
export function stripTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      out += char;
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === ',') {
      let lookahead = index + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1;
      if (text[lookahead] === ']' || text[lookahead] === '}') continue;
    }
    out += char;
  }
  return out;
}

/** 辅助解析大模型返回的 JSON 片段（容忍代码块、尾逗号与前后废话）。 */
export function parseJsonFromLlm<T>(raw: string, fallback: T): T {
  const candidates: string[] = [];
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) candidates.push(codeBlock[1]);
  candidates.push(raw.trim());

  const startBracket = raw.indexOf('[');
  const endBracket = raw.lastIndexOf(']');
  if (startBracket !== -1 && endBracket > startBracket) {
    candidates.push(raw.slice(startBracket, endBracket + 1));
  }
  const startBrace = raw.indexOf('{');
  const endBrace = raw.lastIndexOf('}');
  if (startBrace !== -1 && endBrace > startBrace) {
    candidates.push(raw.slice(startBrace, endBrace + 1));
  }

  for (const candidate of candidates) {
    for (const variant of [candidate, stripTrailingCommas(candidate)]) {
      try {
        return JSON.parse(variant) as T;
      } catch {
        // 尝试下一个候选
      }
    }
  }
  return fallback;
}

/** 从 LLM 返回中解析子任务数组：容忍 `{"items":[...]}`、尾逗号、尾部截断。 */
export function parseBreakdownResponse(raw: string): Array<{ subject: string; order?: number }> {
  const toItems = (value: unknown[]): Array<{ subject: string; order?: number }> =>
    value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .filter((item) => typeof item.subject === 'string' && item.subject.trim())
      .map((item) => ({
        subject: String(item.subject).trim(),
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : undefined,
      }));

  const parsed = parseJsonFromLlm<unknown>(raw, null);
  if (Array.isArray(parsed)) return toItems(parsed);
  if (parsed && typeof parsed === 'object') {
    for (const key of ['items', 'subtasks', 'data', 'result']) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return toItems(value);
    }
  }

  // JSON 被截断 / 结构损坏时，逐个提取完整对象
  const objects: Array<{ subject: string; order?: number }> = [];
  for (const match of raw.matchAll(/\{[^{}]*\}/g)) {
    try {
      const value = JSON.parse(stripTrailingCommas(match[0])) as Record<string, unknown>;
      if (typeof value.subject === 'string' && value.subject.trim()) {
        objects.push({ subject: value.subject, order: Number(value.order) });
      }
    } catch {
      // 跳过损坏片段
    }
  }
  if (objects.length) return objects;

  // 最后兜底：直接抽取所有 "subject": "..." 字符串（连结尾残缺的对象也能救回）
  const subjects = [...raw.matchAll(/"subject"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
  return subjects.map((subject, index) => ({ subject, order: index }));
}

/**
 * 需求智能拆解：读需求描述 + 关联仓库的改动范围，按「功能点」拆成可交付子任务。
 *
 * - 不按前端/后端/测试等工种分类，也不评估工时；
 * - 仓库上下文来自调用方（RequirementDetails 采集），这里只负责格式化与拼 Prompt。
 */
export async function aiBreakdownRequirement(
  subject: string,
  description: string,
  repoScope: BreakdownRepoScope[] = [],
  repoCode: BreakdownRepoCode[] = [],
): Promise<AiBreakdownItem[]> {
  const settings = await getAiSettings();
  const customRule = settings.customPrompts?.breakdown?.trim();
  const scopeText = formatBreakdownRepoScope(repoScope);
  const codeText = formatBreakdownRepoCode(repoCode);

  const systemPrompt = `你是一名资深研发架构师，擅长把需求拆解为可独立交付、可独立验收的功能点。

拆解前请先做两件事：
1. 通读需求描述，提取业务目标、涉及角色、主流程、规则约束与验收标准；描述缺失时才根据标题做合理推断。
2. 阅读「关联仓库与修改范围」。它列出了本需求涉及的仓库、开发分支及已改动的文件/模块；
   子任务应落在这些模块内，不要凭空引入不存在的页面、接口或服务。
3. 阅读「现有代码参考」。它包含仓库文件树与相关文件节选，用于确认既有目录、模块与调用方式；
   子任务应复用现有结构（页面、组件、API 层），需要新增文件时也要符合项目现有组织方式。

拆解要求：
1. 从「功能点」角度拆分，而不是按前端、后端、测试等工种拆分；
2. 每个子任务对应用户可感知的业务功能或能力，能独立开发、独立验收；
3. 标题使用动宾结构，明确交付产物，控制在 25 个汉字以内；
4. 按业务主流程拆分；权限、并发、失败回滚、空数据等异常与边界，只有确实需要单独功能产出时才成项；
5. 子任务之间尽量低耦合；存在先后依赖时用 order 标注顺序，从 0 开始；
6. 每个子任务粒度控制在半个到三个工作日可完成的范围，不要拆得过碎；
7. 输出 3~8 条；不要编造具体的接口名、字段名或文件路径；
8. 只输出 JSON 数组，不要 Markdown 代码块，不要任何解释文字。

JSON 结构：
[
  { "order": 0, "subject": "实现退款申请的提交与表单校验" },
  { "order": 1, "subject": "支持退款申请的审核与状态流转" }
]${customRule ? `\n\n团队自定义规则与工程规范：\n${customRule}` : ''}`;

  const descriptionText = description
    ? description.slice(0, 1500)
    : '（暂无详细描述，请根据标题做标准功能拆解）';

  const userPrompt = `需求标题：${subject}

需求描述：
${descriptionText}

关联仓库与修改范围：
${scopeText}

现有代码参考（只读节选，可能被截断）：
${codeText || '（未读取到现有代码，请仅依据需求描述与关联仓库信息拆解。）'}

请从功能点角度拆解为 3~8 个可独立交付的子任务，按 order 排序输出 JSON 数组：`;

  const responseText = await aiChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  });

  const rawList = parseBreakdownResponse(responseText);
  const items = rawList
    .map((item, idx) => ({
      id: `ai-${Date.now()}-${idx}`,
      subject: String(item.subject ?? '').trim(),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : idx,
      selected: true,
    }))
    .filter((item) => item.subject.length > 0);

  if (items.length === 0) {
    return [];
  }
  return items.sort((left, right) => left.order - right.order);
}

/** 把仓库改动范围格式化为 Prompt 片段（导出便于单测）。 */
export function formatBreakdownRepoScope(scope: BreakdownRepoScope[]): string {
  if (!scope.length) {
    return '（当前需求未关联任何仓库，请仅依据需求描述拆解。）';
  }
  return scope
    .map((entry) => {
      const header = entry.workitemBranch
        ? `- ${entry.repoName}（开发分支 ${entry.workitemBranch}，基准 ${entry.baselineBranch || '未知'}）`
        : `- ${entry.repoName}`;
      const lines = [header];
      if (!entry.branchCreated) {
        lines.push('  尚未创建开发分支，暂无改动范围。');
      } else if (entry.files?.length) {
        lines.push(`  变更文件（${entry.files.length} 个）：`);
        for (const file of entry.files) {
          lines.push(`  - ${file.path} (+${file.additions} / -${file.deletions})`);
        }
      } else {
        lines.push(`  没有检测到文件改动${entry.note ? `（${entry.note}）` : ''}。`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

/** 把现有代码节选格式化为 Prompt 片段（总字符数封顶，避免撑爆上下文）。 */
export function formatBreakdownRepoCode(repoCode: BreakdownRepoCode[]): string {
  if (!repoCode.length) return '';
  const parts: string[] = [];
  let used = 0;
  const LIMIT = 24_000;

  for (const entry of repoCode) {
    const lines: string[] = [];
    lines.push(`- ${entry.repoName}${entry.gitRef ? `（ref: ${entry.gitRef}）` : ''}`);
    if (entry.note) lines.push(`  （${entry.note}）`);
    if (entry.tree?.length) {
      lines.push(`  现有文件结构（节选）：${entry.tree.slice(0, 40).join('、')}`);
    }
    for (const file of entry.files ?? []) {
      const excerpt = file.content.split('\n').slice(0, 120).join('\n');
      lines.push(`  --- ${file.path}${file.truncated ? '（已截断）' : ''} ---`);
      lines.push(excerpt);
    }
    const block = lines.join('\n');
    if (used + block.length > LIMIT) {
      parts.push(block.slice(0, Math.max(0, LIMIT - used)));
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n');
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
 * 缺陷页发起 MR 的一次性 AI 生成：
 * 输出 MR 标题 + 修改说明（填充 MR 描述）+ 测试影响范围（MR 创建成功后发布到缺陷动态）。
 */
export async function aiGenerateBugMergeContext(params: {
  bugIdentifier: string;
  bugSubject: string;
  requirementIdentifier: string;
  requirementSubject: string;
  sourceBranch: string;
  targetBranch: string;
  commits?: string[];
}): Promise<AiBugMergeContext> {
  const settings = await getAiSettings();
  const customRule = settings.customPrompts?.mergeRequest?.trim();

  const commitListStr = (params.commits && params.commits.length > 0)
    ? params.commits.slice(0, 15).join('\n')
    : '（未提供具体 commit 信息，根据缺陷标题推导）';

  const systemPrompt = `你是一名精通 Git 与大型协同规范的代码审查助手与测试专家。
请根据缺陷信息与 Git 提交历史，一次性生成缺陷修复 MR 的标题、修改说明与测试影响范围。
严格返回如下 JSON 格式，不要输出其他文字：
{
  "title": "fix(缺陷编号): 简要修复描述",
  "description": "### 缺陷背景\\n...\\n\\n### 修复方案\\n- ...\\n\\n### 自测验证\\n- [ ] ...",
  "testImpactScope": "### 测试影响范围\\n- 影响模块：...\\n- 建议回归用例：...\\n- 风险提示：..."
}
要求：
1. title 必须包含缺陷编号，遵循 Conventional Commits 规范。
2. description 为结构化 Markdown 修改说明。
3. testImpactScope 为独立可发布的测试影响范围说明（Markdown），供测试同学评估回归范围。
4. 全部输出严禁使用任何 Emoji 表情符号（云效服务端不支持会触发 400 拦截）。${customRule ? `\n\n团队自定义 MR 规范：\n${customRule}` : ''}`;

  const userPrompt = `缺陷编号：${params.bugIdentifier}
缺陷标题：${params.bugSubject}
所属需求编号：${params.requirementIdentifier}
所属需求标题：${params.requirementSubject}
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

  const fallback: AiBugMergeContext = {
    title: `${params.bugIdentifier}: ${params.bugSubject}`,
    description: `### 关联缺陷\n${params.bugIdentifier} ${params.bugSubject}\n\n### 所属需求\n${params.requirementIdentifier} ${params.requirementSubject}\n\n### 变更分支\n${params.sourceBranch} -> ${params.targetBranch}`,
    testImpactScope: '',
  };

  const parsed = parseJsonFromLlm<Partial<AiBugMergeContext>>(responseText, {});
  return {
    title: parsed.title || fallback.title,
    description: parsed.description || fallback.description,
    testImpactScope: parsed.testImpactScope || '',
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
