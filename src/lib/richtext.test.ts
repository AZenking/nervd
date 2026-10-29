import { describe, it, expect } from 'vitest';
import { markdownToHtml, extractRichHtml, sanitizeForYunxiao } from './richtext';

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
    const md = '### 研发进度同步';
    expect(markdownToHtml(md)).toBe('<h3>研发进度同步</h3>');

    const mdH1 = '# 标题一';
    expect(markdownToHtml(mdH1)).toBe('<h1>标题一</h1>');
  });

  it('converts bullet lists and bold inline text', () => {
    const md = [
      '### 研发进度同步',
      '- **开发状态**：已完成核心功能开发',
      '- **分支**：`feature/login`',
      '- **CI 流水线**：运行成功',
    ].join('\n');

    const result = markdownToHtml(md);
    expect(result).toContain('<h3>研发进度同步</h3>');
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

  it('treats visually-empty rich shells as empty (no blank block)', () => {
    // 云效空描述常见形态：空段落 / <br> / &nbsp; / 零宽字符壳，不应按有内容渲染
    expect(extractRichHtml({ htmlValue: '<p><br></p>' })).toBe('');
    expect(extractRichHtml({ htmlValue: '<p>&nbsp;</p><p></p>' })).toBe('');
    expect(extractRichHtml({ htmlValue: '<p>\u200B</p><div><br/></div>' })).toBe('');
    expect(extractRichHtml('<p><br></p>')).toBe('');
  });

  it('keeps htmlValue that only carries an image', () => {
    const html = '<p><img src="https://yunxiao/file.png" name="截图"></p>';
    expect(extractRichHtml({ htmlValue: html })).toBe(html);
  });

  it('optimizes dynamic Yunxiao rich text with plain text in htmlValue', () => {
    const raw = {
      htmlValue:
        '\n\nmaintain-view\n\n分支:test\n本次交付（流程配置部分，已验证通过）：\n1、维修单/维保单流程配置新增「整备检测」「复检」两个节点，门店可开启整备流程并配置操作员工\n2、两个节点为开启即必须，不可跳过；整备检测与复检同开同关，复检需配合完工节点\n3、流程配置页可配置「整备检测」「复检」的操作员工与「复检后修改」员工\n4、按公司级整备业务开关控制两个节点的显示\n\n',
      jsonMLValue: [
        'root',
        {},
        ['p', {}, ['span', { 'data-type': 'text' }, ['span', { 'data-type': 'leaf' }, 'maintain-view']]],
        [
          'p',
          {},
          [
            'span',
            { 'data-type': 'text' },
            [
              'span',
              { 'data-type': 'leaf' },
              '分支:test\n本次交付（流程配置部分，已验证通过）：\n1、维修单/维保单流程配置新增「整备检测」「复检」两个节点，门店可开启整备流程并配置操作员工\n2、两个节点为开启即必须，不可跳过；整备检测与复检同开同关，复检需配合完工节点\n3、流程配置页可配置「整备检测」「复检」的操作员工与「复检后修改」员工\n4、按公司级整备业务开关控制两个节点的显示\n',
            ],
          ],
        ],
      ],
    };

    const html = extractRichHtml(raw);
    // 应该被结构化解析，而不是一坨未格式化的裸文本
    expect(html).toContain('<p>maintain-view</p>');
    expect(html).toContain('<strong>分支:</strong> <code>test</code>');
    expect(html).toContain('<strong>本次交付（流程配置部分，已验证通过）：</strong>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>维修单/维保单流程配置新增「整备检测」「复检」两个节点，门店可开启整备流程并配置操作员工</li>');
    expect(html).toContain('<li>两个节点为开启即必须，不可跳过；整备检测与复检同开同关，复检需配合完工节点</li>');
    expect(html).toContain('<li>流程配置页可配置「整备检测」「复检」的操作员工与「复检后修改」员工</li>');
    expect(html).toContain('<li>按公司级整备业务开关控制两个节点的显示</li>');
    expect(html).toContain('</ol>');
  });

  it('unwraps single <p> tag containing multi-line text into structured elements', () => {
    const raw = {
      htmlValue: '<p>分支:feat/user\n1、开发完成\n2、测试通过</p>',
    };
    const html = extractRichHtml(raw);
    expect(html).toContain('<strong>分支:</strong> <code>feat/user</code>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>开发完成</li>');
    expect(html).toContain('<li>测试通过</li>');
    expect(html).toContain('</ol>');
  });

  it('handles double stringified JSON and bare jsonML fallback', () => {
    const inner = JSON.stringify({
      jsonMLValue: [
        'root',
        {},
        ['h2', {}, '模块交付'],
        ['p', {}, '功能正常运行'],
      ],
    });
    const doubleEncoded = JSON.stringify(inner);
    const html = extractRichHtml(doubleEncoded);
    expect(html).toContain('<h2>模块交付</h2>');
    expect(html).toContain('<p>功能正常运行</p>');
  });
});

describe('sanitizeForYunxiao', () => {
  it('strips unicode emojis and zero-width characters', () => {
    const rocket = '\u{1F680}';
    const check = '\u{2705}';
    const person = '\u{1F64B}\u200D\u2642\uFE0F';
    const input = `### ${rocket} 研发进度同步\n- **状态**：正常 ${check}\n如有阻塞请升级 ${person}`;
    const cleaned = sanitizeForYunxiao(input);
    expect(cleaned).not.toContain(rocket);
    expect(cleaned).not.toContain(check);
    expect(cleaned).not.toContain(person);
    expect(cleaned).toContain('### 研发进度同步');
    expect(cleaned).toContain('- **状态**：正常');
    expect(cleaned).toContain('如有阻塞请升级');
  });

  it('handles empty input', () => {
    expect(sanitizeForYunxiao('')).toBe('');
  });
});
