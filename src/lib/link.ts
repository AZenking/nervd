// 需求 ↔ 代码 关联匹配（ID 规则，契约 §6）

/** 从文本中按规则提取工作项关键号（捕获组 1，否则整段匹配），去重大写 */
export function extractWorkItemKeys(text: string, pattern: string): string[] {
  if (!text) return [];
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'gi');
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const m of text.matchAll(re)) {
    const key = (m[1] ?? m[0] ?? '').trim();
    if (key) out.add(key.toUpperCase());
  }
  return [...out];
}

/** 工作项标识（如 REQ-1234）里的数字段 */
export function identifierNum(identifier: string): string {
  return (identifier.match(/\d+/)?.[0] ?? '').toUpperCase();
}

/** 文本是否命中该工作项（按编号匹配；带前缀更严格） */
export function matchesWorkitem(identifier: string, text: string, pattern: string): boolean {
  const num = identifierNum(identifier);
  if (!num) return false;
  const prefix = identifier.replace(/[-_]?\d+$/, '').toUpperCase();
  const keys = extractWorkItemKeys(text, pattern);
  return keys.some((k) => {
    if (k === identifier.toUpperCase()) return true;
    // 捕获组只有数字时：配合上下文前缀判断
    if (k === num) return true;
    // key 形如 REQ1234 / REQ-1234
    const norm = k.replace(/[-_]/g, '');
    const idNorm = identifier.toUpperCase().replace(/[-_]/g, '');
    if (norm === idNorm) return true;
    return prefix.length > 0 && norm === `${prefix}${num}`;
  });
}
