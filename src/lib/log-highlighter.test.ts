import { describe, expect, it } from 'vitest';
import {
  parseAnsiSpans,
  stripAnsi,
  classifyLogLine,
  formatStageDuration,
  processLogLines,
} from './log-highlighter';

describe('log-highlighter', () => {
  it('parses ANSI colored spans correctly', () => {
    const raw = '\u001b[31mError message\u001b[0m and \u001b[32mSuccess message\u001b[0m';
    const spans = parseAnsiSpans(raw);
    expect(spans.length).toBe(3);
    expect(spans[0].text).toBe('Error message');
    expect(spans[0].className).toContain('text-red-500');
    expect(spans[1].text).toBe(' and ');
    expect(spans[2].text).toBe('Success message');
    expect(spans[2].className).toContain('text-emerald-500');
  });

  it('strips ANSI escape sequences cleanly', () => {
    const raw = '\u001b[1;33mWARNING\u001b[0m: deprecated package';
    expect(stripAnsi(raw)).toBe('WARNING: deprecated package');
  });

  it('classifies log line severity and ignores false positives', () => {
    expect(classifyLogLine('[ERROR] Compilation failed').severity).toBe('error');
    expect(classifyLogLine('npm ERR! code ELIFECYCLE').severity).toBe('error');
    expect(classifyLogLine('Tests: 10 passed, 0 errors, 0 failures').severity).not.toBe('error');
    expect(classifyLogLine('Finished with exit code 0').severity).not.toBe('error');

    expect(classifyLogLine('[WARN] package is deprecated').severity).toBe('warning');
    expect(classifyLogLine('Found 0 warnings in 12 files').severity).not.toBe('warning');

    expect(classifyLogLine('BUILD SUCCESS in 12s').severity).toBe('success');
    expect(classifyLogLine('+ mvn clean package').severity).toBe('command');
    expect(classifyLogLine('[Pipeline] { (Checkout SCM)').severity).toBe('stage');
    expect(classifyLogLine('[Pipeline] { (Checkout SCM)').stageName).toBe('Checkout SCM');
  });

  it('formats duration nicely', () => {
    expect(formatStageDuration(350)).toBe('350ms');
    expect(formatStageDuration(4500)).toBe('5s');
    expect(formatStageDuration(75000)).toBe('1m 15s');
    expect(formatStageDuration(undefined)).toBe('');
  });

  it('processes full log lines and aggregates stats', () => {
    const log = [
      '[Pipeline] { (Declarative: Checkout)',
      '+ git checkout master',
      '[INFO] Compiling sources...',
      '[WARN] React 19 deprecation',
      '[ERROR] TypeScript check failed: cannot find name "foo"',
      'BUILD FAILED',
    ].join('\n');

    const result = processLogLines(log);
    expect(result.stats.totalLines).toBe(6);
    expect(result.stats.errorCount).toBe(2);
    expect(result.stats.warningCount).toBe(1);
    expect(result.stats.firstErrorLine).toBe(5);
    expect(result.fallbackStages.length).toBe(1);
    expect(result.fallbackStages[0].name).toBe('Declarative: Checkout');
  });
});
