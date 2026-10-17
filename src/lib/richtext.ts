// 云效 Projex 富文本描述解析（轻量方案）：
// 描述字段可能是 纯文本 / JSON 字符串 / {htmlValue, jsonMLValue} 结构，
// 这里统一抽成纯文本 + 图片信息（附件 URL 需登录态，经 Rust 代理后内联直显）。

interface RichDoc {
  htmlValue?: string;
  jsonMLValue?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** 图片附件（img 节点提取，url 为云效附件地址） */
export interface RichImage {
  name: string;
  url: string;
}

/** img 占位行：纯文本渲染与组件过滤共用同一格式 */
export function imagePlaceholderLine(name: string): string {
  return `📎 ${name}（需在云效查看）`;
}

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
    const name = imgNameOf(attrs);
    out.push(`\n${imagePlaceholderLine(name)}\n`);
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

/** img 名称：name 属性，缺省「图片」（纯文本占位与图片提取共用口径） */
function imgNameOf(attrs: Record<string, unknown>): string {
  return typeof attrs.name === 'string' && attrs.name.trim() ? attrs.name : '图片';
}

/** 遍历 JsonML，收集 img 节点（name + src） */
function collectJsonMLImages(node: unknown, out: RichImage[]): void {
  if (typeof node === 'string') return;
  if (!Array.isArray(node) || typeof node[0] !== 'string') return;
  const tag = node[0];
  const attrs = isRecord(node[1]) ? node[1] : {};
  const start = isRecord(node[1]) ? 2 : 1;
  if (tag === 'img') {
    const src = attrs.src;
    if (typeof src === 'string' && src.trim()) {
      out.push({ name: imgNameOf(attrs), url: src.trim() });
    }
    return;
  }
  for (let i = start; i < node.length; i++) collectJsonMLImages(node[i], out);
}

/** 从 HTML 提取 img（name + src） */
function collectHtmlImages(html: string, out: RichImage[]): void {
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = htmlAttr(tag, 'src');
    if (!src) continue;
    const name = htmlAttr(tag, 'name') || '图片';
    out.push({ name, url: src });
  }
}

/** HTML 标签属性取值：支持 "…" / '…' / 裸值三种写法 */
function htmlAttr(tag: string, attr: string): string {
  const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? '').trim();
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

/** jsonMLValue 若为 JSON 字符串则解开 */
function parseJsonML(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

/** 描述字段（unknown）→ {htmlValue, jsonMLValue} 结构（含 JSON 字符串解包）；非富文本返回 null */
function resolveRichDoc(raw: unknown): RichDoc | null {
  let v = raw;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s.startsWith('{') && !s.startsWith('["')) return null;
    try {
      v = JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (isRecord(v) && ('htmlValue' in v || 'jsonMLValue' in v)) return v as RichDoc;
  if (Array.isArray(v)) return { jsonMLValue: v }; // 裸 JsonML 数组
  return null;
}

/** {htmlValue, jsonMLValue} → 纯文本（jsonML 优先，空则剥 HTML） */
function richDocToPlain(doc: RichDoc): string {
  const out: string[] = [];
  walkJsonML(parseJsonML(doc.jsonMLValue), out);
  const text = out.join('').replace(/[ \t]+\n/g, '\n').trim();
  if (text) return text;
  if (typeof doc.htmlValue === 'string') return fromHtml(doc.htmlValue);
  return '';
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
          return richDocToPlain(parsed as RichDoc);
        }
        if (Array.isArray(parsed)) {
          const t = richDocToPlain({ jsonMLValue: parsed });
          if (t) return t;
        }
      } catch {
        /* 非 JSON 或格式不符：按原文 */
      }
    }
    return s;
  }

  if (isRecord(raw)) {
    if ('htmlValue' in raw || 'jsonMLValue' in raw) return richDocToPlain(raw as RichDoc);
    // 非富文本结构对象：沿用旧取值口径（name 等单值字段）
    const name = raw.name;
    return typeof name === 'string' ? name : '';
  }

  return '';
}

/** 描述字段（unknown）→ 图片附件列表（img 的 name + src，保序按 URL 去重） */
export function extractRichImageUrls(raw: unknown): RichImage[] {
  const doc = resolveRichDoc(raw);
  if (!doc) return [];
  const out: RichImage[] = [];
  collectJsonMLImages(parseJsonML(doc.jsonMLValue), out);
  if (!out.length && typeof doc.htmlValue === 'string') collectHtmlImages(doc.htmlValue, out);
  const seen = new Set<string>();
  return out.filter((img) => (seen.has(img.url) ? false : (seen.add(img.url), true)));
}

/**
 * 将 Markdown 格式文本转换为标准 HTML（供 Tiptap 和富文本展示组件渲染）
 * 若传入文本已是结构化 HTML，直接返回原内容。
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';
  const trimmed = md.trim();
  // 已是 HTML 格式则直接透传
  if (
    (trimmed.startsWith('<') && trimmed.endsWith('>')) ||
    /<\/(p|div|span|h[1-6]|ul|ol|li|strong|em|code|pre|blockquote|table)>/i.test(trimmed)
  ) {
    return trimmed;
  }

  // 1. 保护代码块 ```...```
  const codeBlocks: string[] = [];
  const text = md.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (_, _lang, code) => {
    const idx = codeBlocks.length;
    const escaped = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
    return `\u0000CODEBLOCK_${idx}\u0000`;
  });

  const lines = text.split('\n');
  const htmlParts: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inQuote = false;
  let quoteLines: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length) {
      const pText = paragraphLines.map(parseInline).join('<br/>');
      htmlParts.push(`<p>${pText}</p>`);
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (inList) {
      htmlParts.push(`</${inList}>`);
      inList = null;
    }
  };

  const flushQuote = () => {
    if (inQuote) {
      const qText = quoteLines.map(parseInline).join('<br/>');
      htmlParts.push(`<blockquote><p>${qText}</p></blockquote>`);
      inQuote = false;
      quoteLines = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  function parseInline(str: string): string {
    // 1. 行内代码 `...`
    const codes: string[] = [];
    let s = str.replace(/`([^`]+)`/g, (_, code) => {
      const idx = codes.length;
      codes.push(`<code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`);
      return `\u0000INLINECODE_${idx}\u0000`;
    });

    // 2. 粗体 & 斜体 & 删除线
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 3. 链接
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 4. 还原行内代码
    s = s.replace(/\u0000INLINECODE_(\d+)\u0000/g, (_, idx) => codes[Number(idx)]);

    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      continue;
    }

    // 代码块占位行
    if (line.startsWith('\u0000CODEBLOCK_')) {
      flushAll();
      htmlParts.push(line);
      continue;
    }

    // 分割线
    if (/^(?:---|\*\*\*|___)$/.test(line)) {
      flushAll();
      htmlParts.push('<hr/>');
      continue;
    }

    // 标题 (#, ##, ###, ####)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushAll();
      const level = Math.min(headingMatch[1].length, 3);
      htmlParts.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // 引用 (> )
    if (line.startsWith('>')) {
      flushParagraph();
      flushList();
      inQuote = true;
      quoteLines.push(line.replace(/^>\s*/, ''));
      continue;
    } else if (inQuote) {
      flushQuote();
    }

    // 无序列表 (- 或 *)
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      flushQuote();
      if (inList !== 'ul') {
        flushList();
        inList = 'ul';
        htmlParts.push('<ul>');
      }
      htmlParts.push(`<li>${parseInline(ulMatch[1])}</li>`);
      continue;
    }

    // 有序列表 (1. , 2. )
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      flushQuote();
      if (inList !== 'ol') {
        flushList();
        inList = 'ol';
        htmlParts.push('<ol>');
      }
      htmlParts.push(`<li>${parseInline(olMatch[1])}</li>`);
      continue;
    }

    // 普通文本段落行
    flushList();
    flushQuote();
    paragraphLines.push(line);
  }

  flushAll();

  let result = htmlParts.join('');
  result = result.replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_, idx) => codeBlocks[Number(idx)]);
  return result;
}

/** 描述字段（unknown）→ HTML 字符串（用于富文本编辑器渲染与回填） */
export function extractRichHtml(raw: unknown): string {
  const doc = resolveRichDoc(raw);
  if (doc?.htmlValue && typeof doc.htmlValue === 'string') {
    return doc.htmlValue;
  }
  if (typeof raw === 'string') {
    return markdownToHtml(raw);
  }
  const plain = richTextToPlain(raw);
  if (plain) {
    return markdownToHtml(plain);
  }
  return '';
}

