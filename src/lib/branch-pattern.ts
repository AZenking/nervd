// 分支命名模板的变量插入 / 校验 / 预览纯函数。
//
// 规则：
// - token 形如 {iteration}、{track}、{identifier}、{parentIdentifier}、{iterationEnd}、{yyyy}、{MM}、{dd}
// - {template} 仅作为旧配置兼容别名，UI 不再提供
// - 不在 allowed 列表中的 token 视为未知变量

export interface InsertAtSelectionResult {
  value: string;
  cursor: number;
}

const TOKEN_RE = /\{[A-Za-z][A-Za-z0-9]*\}/g;

/** 把 token 插入到 [start, end) 区间；越界自动收敛，返回新值与光标位置。 */
export function insertAtSelection(
  value: string,
  token: string,
  start?: number | null,
  end?: number | null,
): InsertAtSelectionResult {
  const length = value.length;
  const safeStart = Math.max(0, Math.min(start ?? length, length));
  const safeEnd = Math.max(safeStart, Math.min(end ?? safeStart, length));
  const next = `${value.slice(0, safeStart)}${token}${value.slice(safeEnd)}`;
  return { value: next, cursor: safeStart + token.length };
}

/** 返回模板中出现的未知 token（去重，保留出现顺序）。 */
export function findUnknownPlaceholders(value: string, allowedTokens: readonly string[]): string[] {
  const allowed = new Set(allowedTokens);
  const unknown: string[] = [];
  for (const match of value.matchAll(TOKEN_RE)) {
    const token = match[0];
    if (!allowed.has(token) && !unknown.includes(token)) unknown.push(token);
  }
  return unknown;
}

/** 返回缺失的必需 token（去重，保留 required 顺序）。 */
export function missingRequiredTokens(value: string, requiredTokens: readonly string[]): string[] {
  return requiredTokens.filter((token) => !value.includes(token));
}

/**
 * 用示例值展开模板；未知 token / 缺失示例时保留原 token，便于用户发现问题。
 */
export function renderPatternPreview(value: string, samples: Record<string, string>): string {
  return value.replace(TOKEN_RE, (token) => samples[token] ?? token);
}

/** 提取模板中的 token（调试/测试用）。 */
export function extractPatternTokens(value: string): string[] {
  return [...value.matchAll(TOKEN_RE)].map((match) => match[0]);
}
