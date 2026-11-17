// Agent 启动辅助：把「当前子任务上下文」拼成可直接粘贴到终端的 Codex 启动命令。
//
// 纯前端能力：不启动进程、不读写文件、不调用 IPC；只负责生成文本并交给剪贴板。
// 之所以生成命令而不是直接拉起 App：Tauri 当前仅有 opener/notification/dialog 权限，
// 直接启动外部进程需要新增命令与契约变更，另行决策。

export interface AgentTaskContext {
  /** 工作项编号（写入 Refs 的主键），如 TASK-202 / REQ-101 */
  identifier: string;
  subject?: string;
  /** Req / Bug / Task */
  category?: string;
  /** 父需求编号：子任务/缺陷提交时用于补 Req */
  parentIdentifier?: string;
  parentSubject?: string;
  /** 当前迭代名（仅作为上下文提示） */
  iterationName?: string;
}

/** POSIX shell 单引号转义：把 ' 变成 '\''，其余字符原样保留在单引号内。 */
export function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** 构造给 Codex 的中文任务提示（含显式 --workitem/--req，active 文件缺失也能正确归属）。 */
export function buildAgentPrompt(ctx: AgentTaskContext): string {
  const category = ctx.category?.trim();
  const parentPart = ctx.parentIdentifier
    ? `；父需求：${ctx.parentIdentifier}${ctx.parentSubject ? `「${ctx.parentSubject}」` : ''}`
    : '';
  const iterationPart = ctx.iterationName ? `；当前迭代：${ctx.iterationName}` : '';
  const subjectPart = ctx.subject ? `「${ctx.subject}」` : '';
  const commitArgs = [
    `--workitem ${ctx.identifier}`,
    ctx.parentIdentifier ? `--req ${ctx.parentIdentifier}` : '',
  ].filter(Boolean).join(' ');

  return [
    `请处理云效工作项 ${ctx.identifier}${subjectPart}${category ? `（类别：${category}${parentPart}${iterationPart}）` : ''}。`,
    '先运行 ./scripts/read-active-workitem.sh 确认上下文（文件不存在时可忽略）。',
    `完成后使用 ./scripts/agent-commit.sh ${commitArgs} -m "<type>(<scope>): <subject>" 提交，标题需符合 Conventional Commits，不要使用 git commit --no-verify。`,
  ].join('\n');
}

/** 生成在指定仓库目录下启动 Codex 的命令：cd '<repo>' && codex '<prompt>'。 */
export function buildCodexLaunchCommand(repoPath: string, ctx: AgentTaskContext): string {
  const path = repoPath.trim();
  if (!path) throw new Error('仓库路径不能为空');
  return `cd ${quoteForShell(path)} && codex ${quoteForShell(buildAgentPrompt(ctx))}`;
}