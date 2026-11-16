/**
 * 从需求标题/描述里提取代码检索关键词（供 git grep 找现有代码）。
 *
 * 中文没有分词器：长句先整体保留，再按 2/3/4 字子串补齐（收银台统一收银 → 收银/支付/易宝…），
 * 英文按大小写不敏感去重；上限 40 个，避免 git grep 参数过长。
 */
export function extractBreakdownKeywords(...texts: Array<string | null | undefined>): string[] {
  const words = new Map<string, string>(); // lower-case key -> 展示原词
  const add = (word: string) => {
    const trimmed = word.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!words.has(key)) words.set(key, trimmed);
  };

  const source = texts.filter(Boolean).join('\n');
  const segments = source.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  // 1) 完整片段优先（“支付对接易宝”这类可能是代码里的中文注释）
  for (const segment of segments) {
    if (segment.length >= 2 && segment.length <= 16) add(segment);
  }

  // 2) 再按 2/3/4 字子串补齐，先 2 字确保“收银/支付/易宝”这类核心词不会被预算挤掉
  for (const size of [2, 3, 4]) {
    for (const segment of segments) {
      if (!/[\u4e00-\u9fa5]/.test(segment)) continue;
      for (let index = 0; index + size <= segment.length; index += 1) {
        const piece = segment.slice(index, index + size);
        if (/^[\u4e00-\u9fa5]+$/.test(piece)) add(piece);
      }
    }
  }

  return [...words.values()].slice(0, 40);
}
