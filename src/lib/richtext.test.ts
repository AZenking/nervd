import { describe, it, expect } from 'vitest';
import { markdownToHtml, extractRichHtml } from './richtext';

describe('markdownToHtml', () => {
  it('handles empty or blank string', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('   ')).toBe('');
  });

  it('preserves existing html string', () => {
    const html = '<p>已经<strong>富文本</strong></p>';
    expect(markdownToHtml(html)).toBe(html);
  });

  it('converts headers to h1-h3 tags', () => {
    const md = '### 🚀 研发进度同步';
    expect(markdownToHtml(md)).toBe('<h3>🚀 研发进度同步</h3>');

    const mdH1 = '# 标题一';
    expect(markdownToHtml(mdH1)).toBe('<h1>标题一</h1>');
  });

  it('converts bullet lists and bold inline text', () => {
    const md = [
      '### 🚀 研发进度同步',
      '- **开发状态**：已完成核心功能开发',
      '- **分支**：`feature/login`',
      '- **CI 流水线**：运行成功',
    ].join('\n');

    const result = markdownToHtml(md);
    expect(result).toContain('<h3>🚀 研发进度同步</h3>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li><strong>开发状态</strong>：已完成核心功能开发</li>');
    expect(result).toContain('<li><strong>分支</strong>：<code>feature/login</code></li>');
    expect(result).toContain('<li><strong>CI 流水线</strong>：运行成功</li>');
    expect(result).toContain('</ul>');
  });

  it('converts numbered lists', () => {
    const md = [
      '1. 第一项',
      '2. 第二项',
    ].join('\n');

    const result = markdownToHtml(md);
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>第一项</li>');
    expect(result).toContain('<li>第二项</li>');
    expect(result).toContain('</ol>');
  });

  it('converts code blocks', () => {
    const md = '```ts\nconst x = 1;\n```';
    const result = markdownToHtml(md);
    expect(result).toContain('<pre><code>const x = 1;</code></pre>');
  });

  it('converts blockquotes', () => {
    const md = '> 这是一条引用说明';
    const result = markdownToHtml(md);
    expect(result).toBe('<blockquote><p>这是一条引用说明</p></blockquote>');
  });
});

describe('extractRichHtml', () => {
  it('converts markdown string to rich html', () => {
    const md = '- **测试**：通过';
    expect(extractRichHtml(md)).toContain('<ul><li><strong>测试</strong>：通过</li></ul>');
  });

  it('returns htmlValue if present in object', () => {
    const doc = { htmlValue: '<p>富文本内容</p>' };
    expect(extractRichHtml(doc)).toBe('<p>富文本内容</p>');
  });
});
