import type { CiStageItem } from './api';

export type LogSeverity = 'error' | 'warning' | 'success' | 'stage' | 'command' | 'normal';

export interface AnsiSpan {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export interface ProcessedLogLine {
  lineNumber: number;
  raw: string;
  cleanText: string;
  severity: LogSeverity;
  spans: AnsiSpan[];
  stageName?: string;
}

export interface LogStats {
  totalLines: number;
  errorCount: number;
  warningCount: number;
  firstErrorLine: number | null;
}

// ANSI 颜色映射表
const ANSI_COLOR_MAP: Record<number, string> = {
  30: 'text-zinc-500',
  31: 'text-red-500 dark:text-red-400 font-medium',
  32: 'text-emerald-500 dark:text-emerald-400',
  33: 'text-amber-500 dark:text-amber-400',
  34: 'text-sky-500 dark:text-sky-400',
  35: 'text-purple-500 dark:text-purple-400',
  36: 'text-cyan-500 dark:text-cyan-400',
  37: 'text-zinc-200',
  90: 'text-zinc-400',
  91: 'text-red-400 dark:text-red-300 font-medium',
  92: 'text-emerald-400 dark:text-emerald-300',
  93: 'text-amber-400 dark:text-amber-300',
  94: 'text-sky-400 dark:text-sky-300',
  95: 'text-purple-400 dark:text-purple-300',
  96: 'text-cyan-400 dark:text-cyan-300',
  97: 'text-white',
};

/** 解析包含 ANSI 转义序列的一行文本为带样式的 Span 数组 */
export function parseAnsiSpans(raw: string): AnsiSpan[] {
  // 如果不包含 ANSI 转义序列，直接快速返回
  if (!raw.includes('\u001b[') && !raw.includes('\x1b[')) {
    return [{ text: raw }];
  }

  const spans: AnsiSpan[] = [];
  const ansiRegex = /(?:\u001b\[|\x1b\[)([0-9;]*)m/g;
  let lastIndex = 0;
  let currentClassNames: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(raw)) !== null) {
    const textChunk = raw.slice(lastIndex, match.index);
    if (textChunk) {
      spans.push({
        text: textChunk,
        className: currentClassNames.length ? currentClassNames.join(' ') : undefined,
      });
    }

    const codeStr = match[1] || '0';
    const codes = codeStr.split(';').map((c) => parseInt(c, 10) || 0);

    for (const code of codes) {
      if (code === 0) {
        currentClassNames = [];
      } else if (code === 1) {
        if (!currentClassNames.includes('font-semibold')) currentClassNames.push('font-semibold');
      } else if (code === 2) {
        if (!currentClassNames.includes('opacity-70')) currentClassNames.push('opacity-70');
      } else if (code === 3) {
        if (!currentClassNames.includes('italic')) currentClassNames.push('italic');
      } else if (code === 4) {
        if (!currentClassNames.includes('underline')) currentClassNames.push('underline');
      } else if (ANSI_COLOR_MAP[code]) {
        // 移除旧的前景颜色类并添加新颜色
        currentClassNames = currentClassNames.filter((c) => !c.startsWith('text-'));
        currentClassNames.push(ANSI_COLOR_MAP[code]);
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  const remaining = raw.slice(lastIndex);
  if (remaining) {
    spans.push({
      text: remaining,
      className: currentClassNames.length ? currentClassNames.join(' ') : undefined,
    });
  }

  return spans.length ? spans : [{ text: raw }];
}

/** 剥离 ANSI 转义字符获得纯文本 */
export function stripAnsi(text: string): string {
  return text.replace(/(?:\u001b\[|\x1b\[)[0-9;]*[a-zA-Z]/g, '');
}

/** 判定单行文本的严重级别与类别 */
export function classifyLogLine(cleanLine: string): { severity: LogSeverity; stageName?: string } {
  const line = cleanLine.trim();
  if (!line) return { severity: 'normal' };

  // 1. Jenkins Pipeline / Stage 步骤判定
  const stageMatch = line.match(/\[Pipeline\]\s*\{\s*\(([^\)]+)\)/i)
    || line.match(/\[Pipeline\]\s*Stage:\s*([^\n\r]+)/i)
    || line.match(/===+\s*Stage:\s*([^\n\r=]+)\s*===+/i);
  if (stageMatch) {
    return { severity: 'stage', stageName: stageMatch[1].trim() };
  }
  if (line.startsWith('[Pipeline] stage') || line.startsWith('[Pipeline] // stage')) {
    return { severity: 'stage' };
  }

  // 2. 命令行与 Shell 执行 (如 `+ mvn package`, `$ git checkout`)
  if (/^(\+|\$|>)\s+[a-zA-Z0-9_\-\.\/]/i.test(line)) {
    return { severity: 'command' };
  }

  // 3. 错误与失败 (排除误报如 "0 errors", "0 failed", "errors: 0")
  const isFalsePositiveError = /\b(?:0|no|zero)\s+(?:errors?|failures?)\b/i.test(line)
    || /\b(?:errors?|failures?)\s*:\s*0\b/i.test(line)
    || /\bexit code 0\b/i.test(line);

  if (!isFalsePositiveError) {
    const isError = /\[error\]/i.test(line)
      || /\b(?:fatal|panic|exception|failed|failure)\b/i.test(line)
      || /\berror\s*:\s*/i.test(line)
      || /\berror\s*\[e\d+\]/i.test(line)
      || /\berror\s*TS\d+/i.test(line)
      || /\bnpm\s+ERR!/i.test(line)
      || /\bBUILD\s+FAILED\b/i.test(line);

    if (isError) {
      return { severity: 'error' };
    }
  }

  // 4. 警告 (排除 "0 warnings")
  const isFalsePositiveWarning = /\b(?:0|no|zero)\s+warnings?\b/i.test(line)
    || /\bwarnings?\s*:\s*0\b/i.test(line);

  if (!isFalsePositiveWarning) {
    const isWarning = /\[warn(?:ing)?\]/i.test(line)
      || /\bwarning\s*:\s*/i.test(line)
      || /\b(?:warn|deprecated)\b/i.test(line);

    if (isWarning) {
      return { severity: 'warning' };
    }
  }

  // 5. 成功里程碑
  const isSuccess = /\bBUILD\s+SUCCESS\b/i.test(line)
    || /\b(?:successfully\s+(?:built|tagged|pushed|finished|compiled)|all\s+tests\s+passed)\b/i.test(line)
    || /^Passed:\s+\d+/i.test(line);

  if (isSuccess) {
    return { severity: 'success' };
  }

  return { severity: 'normal' };
}

/** 格式化毫秒耗时为紧凑可读格式 */
export function formatStageDuration(ms?: number): string {
  if (ms == null || ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSecs}s`;
}

/** 处理全部日志文本，生成分行、ANSI 片段、严重度与统计指标 */
export function processLogLines(rawText: string): {
  lines: ProcessedLogLine[];
  stats: LogStats;
  fallbackStages: CiStageItem[];
} {
  if (!rawText) {
    return {
      lines: [],
      stats: { totalLines: 0, errorCount: 0, warningCount: 0, firstErrorLine: null },
      fallbackStages: [],
    };
  }

  const rawLines = rawText.split(/\r?\n/);
  const lines: ProcessedLogLine[] = [];
  const fallbackStages: CiStageItem[] = [];
  const stageSet = new Set<string>();

  let errorCount = 0;
  let warningCount = 0;
  let firstErrorLine: number | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const cleanText = stripAnsi(raw);
    const lineNumber = i + 1;
    const { severity, stageName } = classifyLogLine(cleanText);

    if (severity === 'error') {
      errorCount++;
      if (firstErrorLine === null) {
        firstErrorLine = lineNumber;
      }
    } else if (severity === 'warning') {
      warningCount++;
    }

    if (stageName && !stageSet.has(stageName)) {
      stageSet.add(stageName);
      fallbackStages.push({
        id: `log-stage-${fallbackStages.length + 1}`,
        name: stageName,
        status: 'SUCCESS', // 默认，如果后续出现错误行可被后处理推导
      });
    }

    lines.push({
      lineNumber,
      raw,
      cleanText,
      severity,
      spans: parseAnsiSpans(raw),
      stageName,
    });
  }

  return {
    lines,
    stats: {
      totalLines: rawLines.length,
      errorCount,
      warningCount,
      firstErrorLine,
    },
    fallbackStages,
  };
}
