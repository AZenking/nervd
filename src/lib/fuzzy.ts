/**
 * 高性能模糊搜索打分与排序引擎
 * 支持：
 * 1. 完全匹配与前缀匹配（高优先级）
 * 2. 词首边界匹配（如 `/`, `-`, `_`, `.`, 空格后首字母）
 * 3. 连续子串包含
 * 4. 多词空格拆分匹配（如 "order prod" 匹配 "frontend/order-service-deploy-prod"）
 * 5. 符号容错匹配（忽略连字符/下划线差异，如 "orderservice" 匹配 "order-service"）
 * 6. 首字母缩写匹配（如 "mvp" 匹配 "mobile-view-pipeline"）
 * 7. 顺序子序列模糊匹配（如 "osdp" 匹配 "order-service-deploy-prod"）
 */

export interface FuzzyMatcherContext {
  q: string;
  escapedQ: string;
  boundaryRegex: RegExp;
  tokens: string[];
  cleanQuery: string;
}

/**
 * 预编译查询词上下文，避免在过滤数百上千个选项时重复编译正则与分词
 */
export function createFuzzyMatcherContext(query: string): FuzzyMatcherContext | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const escapedQ = q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const boundaryRegex = new RegExp('(?:^|[\\/\\-_\\.\\s])' + escapedQ);
  const tokens = q.split(/\s+/).filter(Boolean);
  const cleanQuery = q.replace(/[\/\-_\.\s]/g, '');
  return { q, escapedQ, boundaryRegex, tokens, cleanQuery };
}

/**
 * 计算目标文本与查询词的模糊匹配得分
 * 支持传入原始字符串或已预编译的 FuzzyMatcherContext
 * @returns 得分 > 0 表示命中（数值越大匹配度越高），0 表示不匹配
 */
export function fuzzyScore(
  text: string,
  queryOrContext: string | FuzzyMatcherContext,
): number {
  if (!text) return 0;
  let ctx: FuzzyMatcherContext | null = null;
  if (typeof queryOrContext === 'string') {
    ctx = createFuzzyMatcherContext(queryOrContext);
    if (!ctx) return 1;
  } else {
    ctx = queryOrContext;
    if (!ctx || !ctx.q) return 1;
  }

  const target = text.toLowerCase();
  const { q, boundaryRegex, tokens, cleanQuery } = ctx;

  // 1. 完全相等（最高分）
  if (target === q) return 1000;

  // 2. 前缀精确匹配
  if (target.startsWith(q)) return 800 - (target.length - q.length) * 0.1;

  // 3. 词首边界匹配（例如在 '/', '-', '_', '.', 空格后紧接着命中 query）
  if (boundaryRegex.test(target)) return 650;

  // 4. 连续子串包含
  const subIdx = target.indexOf(q);
  if (subIdx !== -1) {
    // 首次出现越靠前得分越高
    return Math.max(500 - subIdx * 5, 420);
  }

  // 5. 多词空格拆分匹配（输入 "order prod"，两个词均出现在 target 中）
  if (tokens.length > 1 && tokens.every((token) => target.includes(token))) {
    return 400;
  }

  // 6. 忽略标点符号后的连续子串匹配（如 "orderservice" 匹配 "order-service"）
  const cleanTarget = target.replace(/[\/\-_\.\s]/g, '');
  if (cleanQuery.length >= 2 && cleanTarget.includes(cleanQuery)) {
    return 320;
  }

  // 7. 单词首字母缩写匹配（如 "osdp" 匹配 "order-service-deploy-prod"）
  const words = target.split(/[\/\-_\.\s]+/).filter(Boolean);
  const acronym = words.map((w) => w[0]).join('');
  if (cleanQuery.length >= 2 && acronym.includes(cleanQuery)) {
    return 260;
  }

  // 8. 字符顺序子序列模糊匹配（如 "osd" 字符顺序出现在字符串中）
  let tIdx = 0;
  let qIdx = 0;
  let gapPenalty = 0;
  let lastMatchIdx = -1;

  while (tIdx < target.length && qIdx < q.length) {
    if (target[tIdx] === q[qIdx]) {
      if (lastMatchIdx !== -1) {
        gapPenalty += tIdx - lastMatchIdx - 1;
      }
      lastMatchIdx = tIdx;
      qIdx++;
    }
    tIdx++;
  }

  if (qIdx === q.length) {
    // 间距越小得分越高
    return Math.max(10, 200 - gapPenalty * 2);
  }

  return 0;
}

/**
 * 判断目标文本是否模糊命中查询词
 */
export function isFuzzyMatch(text: string, query: string): boolean {
  return fuzzyScore(text, query) > 0;
}

/**
 * 根据模糊匹配得分过滤并自动降序排序列表项
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  getText: (item: T) => string,
): T[] {
  const ctx = createFuzzyMatcherContext(query);
  if (!ctx) {
    return [...items];
  }

  const scoredEntries: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const text = getText(item);
    const score = fuzzyScore(text, ctx);
    if (score > 0) {
      scoredEntries.push({ item, score });
    }
  }

  // 稳定降序排序：得分高的排在前面
  scoredEntries.sort((a, b) => b.score - a.score);

  return scoredEntries.map((entry) => entry.item);
}
