// 云效 Projex 富文本描述解析（轻量方案）：
// 描述字段可能是 纯文本 / JSON 字符串 / {htmlValue, jsonMLValue} 结构，
// 这里统一抽成纯文本 + 图片占位（附件 URL 需云效登录态，不在客户端渲染）。

interface RichDoc {
  htmlValue?: string;
  jsonMLValue?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** JsonML 节点：["tag", {attrs?}, ...children]，child 为 string 或嵌套节点 */
function walkJsonML(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    if (node) out.push(node);
    return;
  }
  if (!Array.isArray(node) || typeof node[0] !== 'string') return;
  const tag = node[0];
  const attrs = isRecord(node[1]) ? node[1] : {};
  const start = isRecord(node[1]) ? 2 : 1;

  if (tag === 'img') {
    const name = typeof attrs.name === 'string' && attrs.name ? attrs.name : '图片';
    out.push(`\n📎 ${name}（需在云效查看）\n`);
    return;
  }
  if (tag === 'br') {
    out.push('\n');
    return;
  }
  if ((tag === 'p' || tag === 'li' || tag.startsWith('h')) && out.length && !out[out.length - 1].endsWith('\n')) {
    out.push('\n');
  }
  for (let i = start; i < node.length; i++) walkJsonML(node[i], out);
}

/** 无 jsonML 时的兜底：剥 HTML 标签取文本 */
function fromHtml(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, '\n📎 图片（需在云效查看）\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 描述字段（unknown）→ 可展示纯文本；空返回 ''，由调用方给占位文案 */
export function richTextToPlain(raw: unknown): string {
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return '';
    // 云效会把整个富文本结构再序列化成 JSON 字符串
    if (s.startsWith('{') || s.startsWith('["')) {
      try {
        const parsed: unknown = JSON.parse(s);
        if (isRecord(parsed) && ('htmlValue' in parsed || 'jsonMLValue' in parsed)) {
          return richTextToPlain(parsed);
        }
        if (Array.isArray(parsed)) {
          const t = richTextToPlain({ jsonMLValue: parsed });
          if (t) return t;
        }
      } catch {
        /* 非 JSON 或格式不符：按原文 */
      }
    }
    return s;
  }

  if (isRecord(raw)) {
    if ('htmlValue' in raw || 'jsonMLValue' in raw) {
      const doc = raw as RichDoc;
      let ml: unknown = doc.jsonMLValue;
      if (typeof ml === 'string') {
        try { ml = JSON.parse(ml); } catch { ml = undefined; }
      }
      const out: string[] = [];
      walkJsonML(ml, out);
      const text = out.join('').replace(/[ \t]+\n/g, '\n').trim();
      if (text) return text;
      if (typeof doc.htmlValue === 'string') return fromHtml(doc.htmlValue);
      return '';
    }
    // 非富文本结构对象：沿用旧取值口径（name 等单值字段）
    const name = raw.name;
    return typeof name === 'string' ? name : '';
  }

  return '';
}
