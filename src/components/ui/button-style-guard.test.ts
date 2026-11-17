// 按钮样式门禁：业务层使用 HeroUI Button 时只允许传语义变体与 size 档，
// 不得用 className 改写组件形态（高度 / 内距 / 字号 / 字重 / 圆角 / 底色 / 边框 / 阴影）。
// 背景：2026-11-17 设计评审「使用 heroUI Button 组件时，不要更改组件的样式」。
// 允许保留的只有纯布局与交互类（间距、截断、收缩、光标、过渡、显隐等）——它们不改变按钮的形态语言。
import { describe, expect, it } from 'vitest';

/** 会改写组件形态的工具类前缀（命中即视为覆盖） */
const STYLE_PATTERN =
  /^(?:h-|w-|size-|p[xytblr]?-|text-\[\d|text-(?:xs|sm|base|lg|xl)|rounded|bg-|border|shadow|font-|opacity-|min-h-|max-h-|leading-|tracking-|uppercase|italic)/;

/** 纯布局 / 交互状态类：不算覆盖组件样式 */
const ALLOWED_PREFIX =
  /^(?:gap-|ml-|mr-|mt-|mb-|mx-|my-|shrink|grow|min-w-0|max-w-|w-full|flex-|items-|justify-|self-|truncate|whitespace|overflow-|relative|absolute|group|hidden|inline-|block|content-|align-|tabular-nums|select-|cursor-|transition|duration-|ring-offset|outline-|focus-|hover:|active:|data-|aria-|disabled:|group-|peer-|z-|order-|basis-|grid-|col-|row-|space-|divide-|sr-only|opacity-0|opacity-100|group-hover)/;

/** 通过 Vite 的 raw 导入读取所有业务 TSX（避免在冻结的 tsconfig 里引入 node 类型） */
const SOURCES = import.meta.glob('../../**/*.tsx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** 从一个 `<Button` 起读完整开标签：跳过字符串与花括号/圆括号里的 `>`（如 onPress={() => ...}） */
function readButtonTag(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth += 1; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth -= 1; continue; }
    if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** 提取 className 字符串（支持 className="..." 与 className={cn(...)} 两种写法） */
function classNameOf(tag: string): string | null {
  const plain = /className="([^"]*)"/.exec(tag);
  if (plain) return plain[1];
  const cn = /className=\{cn\(([\s\S]*?)\)\}/.exec(tag);
  if (cn) return cn[1];
  return null;
}

export interface ButtonStyleViolation {
  file: string;
  line: number;
  tokens: string[];
  className: string;
}

export function findButtonStyleOverrides(): ButtonStyleViolation[] {
  const violations: ButtonStyleViolation[] = [];
  for (const [file, source] of Object.entries(SOURCES)) {
    if (file.endsWith('.test.tsx')) continue;
    for (const match of source.matchAll(/<Button\b/g)) {
      const tag = readButtonTag(source, match.index ?? 0);
      const className = classNameOf(tag);
      if (!className) continue;
      const tokens = className.match(/[A-Za-z0-9_:[\].()/%!-]+/g) ?? [];
      const offenders = tokens.filter(
        (token) => STYLE_PATTERN.test(token) && !ALLOWED_PREFIX.test(token),
      );
      if (offenders.length === 0) continue;
      violations.push({
        file: file.replace(/^(\.\.\/)+/, ''),
        line: source.slice(0, match.index).split('\n').length,
        tokens: [...new Set(offenders)].sort(),
        className: className.trim(),
      });
    }
  }
  return violations;
}

describe('HeroUI Button 样式门禁', () => {
  it('业务层不得用 className 改写 Button 的高度/内距/字号/字重/圆角/底色/边框/阴影', () => {
    const violations = findButtonStyleOverrides();
    const report = violations
      .map((v) => `  ${v.file}:${v.line}  [${v.tokens.join(', ')}]  ${v.className}`)
      .join('\n');
    expect(report, `发现 ${violations.length} 处按钮样式覆盖：\n${report}`).toBe('');
  });
});