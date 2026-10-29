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
  return `[图片] ${name}（需在云效查看）`;
}

/**
 * 过滤云效服务端（尤其是评论接口）不支持的 Emoji、4 字节 UTF-8 字符及特殊控制字符
 * 避免触发云效服务端拦截："400: 评论失败，请检查是否存在特殊符号或者表情符号"
 */
export function sanitizeForYunxiao(text: string): string {
  if (!text) return '';
  return text
    // 移除大部分 Unicode Emoji 范围（包含增补表情、几何图形、变体选择器等）
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '')
    // 移除零宽字符和特定不可见控制字符
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // 连续多余空格收缩为单空格
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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
  if ((tag === 'p' || tag.startsWith('h')) && out.length && !out[out.length - 1].endsWith('\n')) {
    out.push('\n\n');
  } else if (tag === 'li' && out.length && !out[out.length - 1].endsWith('\n')) {
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
    .replace(/<img[^>]*>/gi, '\n[图片]（需在云效查看）\n')
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
    // 允许以 { 或 [" 或字符串包裹的 \" 开头
    if (!s.startsWith('{') && !s.startsWith('["') && !s.startsWith('"')) return null;
    try {
      v = JSON.parse(s);
      // 支持可能存在的双重 JSON 序列化（例如网关层二次编码或 JSON 字符串嵌套）
      if (typeof v === 'string') {
        const s2 = v.trim();
        if (s2.startsWith('{') || s2.startsWith('["')) {
          v = JSON.parse(s2);
        }
      }
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
 * 若文本仅被单层 <p>...</p> 包裹，但内部包含多行换行且无其他块级元素，
 * 则将其解包为普通多行文本，以便进入 markdownToHtml 的列表与段落精细解析。
 */
function unwrapSingleParagraph(str: string): string {
  const trimmed = str.trim();
  const m = trimmed.match(/^<p(?:\s+[^>]*)?>([\s\S]*)<\/p>$/i);
  if (m) {
    const inner = m[1];
    // 仅当包含裸换行符且无其他块级元素时，说明是伪富文本包裹的多行文本，才解包进行精细排版
    if (inner.includes('\n') && !/<(p|div|ul|ol|h[1-6]|table|blockquote|pre)\b/i.test(inner)) {
      return inner;
    }
  }
  return str;
}

/**
 * 规范化已有 HTML 标签内的换行符：
 * 避免浏览器在正常模式下将 <p> 或 <div> 内的原生 \n 折叠为空格，丢失用户输入的换行
 */
function normalizeHtmlNewlines(html: string): string {
  const preBlocks: string[] = [];
  const safe = html.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, (m) => {
    const idx = preBlocks.length;
    preBlocks.push(m);
    return `\u0000PREBLOCK_${idx}\u0000`;
  });

  const normalized = safe.replace(/<(p|div|li)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi, (match, tag, inner: string) => {
    if (inner.includes('\n')) {
      return `<${tag}>${inner.replace(/\r?\n/g, '<br/>')}</${tag}>`;
    }
    return match;
  });

  return normalized.replace(/\u0000PREBLOCK_(\d+)\u0000/g, (_, idx) => preBlocks[Number(idx)]);
}

/** JsonML 节点直接递归转换为语义化 HTML */
export function jsonMLToHtml(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (!Array.isArray(node) || typeof node[0] !== 'string') return '';
  const tag = node[0];
  const attrs = isRecord(node[1]) ? node[1] : {};
  const start = isRecord(node[1]) ? 2 : 1;
  const children: string[] = [];
  for (let i = start; i < node.length; i++) {
    const c = jsonMLToHtml(node[i]);
    if (c) children.push(c);
  }
  const inner = children.join('');

  if (tag === 'root') return inner;
  if (tag === 'p') {
    return `<p>${inner.replace(/\r?\n/g, '<br/>')}</p>`;
  }
  if (tag === 'span') {
    let res = inner;
    if (attrs.bold) res = `<strong>${res}</strong>`;
    if (attrs.italic) res = `<em>${res}</em>`;
    if (attrs.code) res = `<code>${res}</code>`;
    if (attrs.strikethrough) res = `<del>${res}</del>`;
    return res;
  }
  if (tag === 'img') {
    const src = typeof attrs.src === 'string' ? attrs.src : '';
    const name = typeof attrs.name === 'string' ? attrs.name : '图片';
    return `<img src="${src}" alt="${name}" />`;
  }
  if (tag === 'br') return '<br/>';
  if (
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'del', 'table', 'tr', 'td', 'th'].includes(tag)
  ) {
    return `<${tag}>${inner}</${tag}>`;
  }
  return inner;
}

/**
 * 将 Markdown 格式文本转换为标准 HTML（供 Tiptap 和富文本展示组件渲染）
 * 若传入文本已是结构化 HTML，直接返回原内容。
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';
  const unwrapped = unwrapSingleParagraph(md);
  const trimmed = unwrapped.trim();

  // 已是纯粹 HTML 格式且不包含裸换行，则直接透传
  if (
    ((trimmed.startsWith('<') && trimmed.endsWith('>')) ||
      /<\/(p|div|span|h[1-6]|ul|ol|li|strong|em|code|pre|blockquote|table)>/i.test(trimmed)) &&
    !trimmed.includes('\n')
  ) {
    return trimmed;
  }

  // 若是包含多标签的结构化 HTML，规范化段落换行后返回
  if (
    trimmed.startsWith('<') &&
    trimmed.endsWith('>') &&
    /<(p|div|ul|ol|h[1-6]|table|blockquote)\b/i.test(trimmed)
  ) {
    return normalizeHtmlNewlines(trimmed);
  }

  // 1. 保护代码块 ```...```
  const codeBlocks: string[] = [];
  const text = trimmed.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (_, _lang, code) => {
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

    // 2. 关键研发追溯元数据高亮：分支/Commit/MR/PR (等宽字体展示，对齐 AGENTS.md 规范)
    s = s.replace(/(?:^|\b)((?:分支|branch|仓库|repo|commit|mr|pr)[：:])\s*([!#]?[a-zA-Z0-9_\-./@]+)/gi, (_, label, val) => {
      return `<strong>${label}</strong> <code>${val}</code>`;
    });

    // 3. 粗体 & 斜体 & 删除线
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 4. 链接
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 5. 还原行内代码
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

    // 无序列表 (- 或 * 或 + 或 • 或 · 或 ◆ 或 ■)
    const ulMatch = line.match(/^[-*+•·◆■]\s+(.*)$/);
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

    // 有序列表 (1. 或 1、或 1) 或 (1) 或 1． 或 一、)
    const olMatch = line.match(/^(?:(?:\d+[.、．\)]|[(（]\d+[)）]|(?:[一二三四五六七八九十]+[、.]))\s*|\d+\.\s+)(.*)$/);
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

    // 小节/清单引言 (以中文冒号 ： 或英文冒号 : 结尾的简短行，如 "本次交付（流程配置部分，已验证通过）：")
    if (/^[^：:\n]{2,30}[：:]$/.test(line)) {
      flushAll();
      htmlParts.push(`<p><strong>${parseInline(line)}</strong></p>`);
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

/**
 * HTML 是否「视觉为空」：剥掉标签后仅剩空白 / &nbsp; / 零宽字符，且无图片。
 * 云效空描述常为 `<p><br></p>`、`<p>&nbsp;</p>` 之类的富文本壳，
 * 若按「有内容」渲染会撑出一大块空白，必须按空处理（由调用方给紧凑占位）。
 */
function isVisuallyEmptyHtml(html: string): boolean {
  if (/<img\b/i.test(html)) return false;
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, '')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .length === 0;
}

/**
 * 描述字段（unknown）→ HTML 字符串（用于富文本编辑器渲染与回填）；视觉为空返回 ''
 * 具备对云效富文本结构的深度容错：
 * 1. 若 htmlValue 实际上是纯文本或仅有换行，自动升级为语义化 HTML（识别中英文列表、分支标签与小节引言）
 * 2. 若 htmlValue 被外层单个 <p> 包裹但内部是多行文本，解包并按段落/列表精准解析
 * 3. 若已有完整 HTML，对标签内裸换行规范化为 <br/>，杜绝浏览器坍塌为空格
 * 4. 若无 htmlValue 但有 jsonMLValue，直接遍历 AST 输出标准 HTML
 */
export function extractRichHtml(raw: unknown): string {
  const doc = resolveRichDoc(raw);
  if (doc?.htmlValue && typeof doc.htmlValue === 'string') {
    if (isVisuallyEmptyHtml(doc.htmlValue)) return '';

    // 检测是否真包含 HTML 标签
    const hasTags = /<[a-z][\s\S]*>/i.test(doc.htmlValue);
    if (!hasTags) {
      const html = markdownToHtml(doc.htmlValue);
      return isVisuallyEmptyHtml(html) ? '' : html;
    }

    // 若是被单层 <p> 包裹但内部含多行换行的伪富文本，解包后重新排版
    const unwrapped = unwrapSingleParagraph(doc.htmlValue);
    if (unwrapped !== doc.htmlValue && !/<[a-z][\s\S]*>/i.test(unwrapped)) {
      const html = markdownToHtml(unwrapped);
      return isVisuallyEmptyHtml(html) ? '' : html;
    }

    // 已有真实 HTML 标签：规范化段落内的裸换行
    const normalized = normalizeHtmlNewlines(doc.htmlValue);
    return isVisuallyEmptyHtml(normalized) ? '' : normalized;
  }

  if (doc?.jsonMLValue) {
    const fromJson = jsonMLToHtml(parseJsonML(doc.jsonMLValue));
    if (fromJson && !isVisuallyEmptyHtml(fromJson)) return fromJson;
  }

  if (typeof raw === 'string') {
    const html = markdownToHtml(raw);
    return isVisuallyEmptyHtml(html) ? '' : html;
  }

  const plain = richTextToPlain(raw);
  if (plain) {
    const html = markdownToHtml(plain);
    return isVisuallyEmptyHtml(html) ? '' : html;
  }

  return '';
}

