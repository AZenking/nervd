import { describe, expect, it } from 'vitest';
import { buildLogAccordionSections } from './log-accordion';
import { processLogLines } from './log-highlighter';

describe('log-accordion', () => {
  it('groups named pipeline stages and keeps the preamble', () => {
    const lines = processLogLines([
      'checkout requested',
      '[Pipeline] { (Checkout SCM)',
      '+ git checkout master',
      '[Pipeline] { (Build)',
      '[ERROR] compilation failed',
    ].join('\n')).lines;

    const sections = buildLogAccordionSections(lines, [
      { id: 'checkout', name: 'Checkout SCM', status: 'SUCCESS' },
      { id: 'build', name: 'Build', status: 'FAILED' },
    ]);

    expect(sections.map((section) => section.name)).toEqual(['准备日志', 'Checkout SCM', 'Build']);
    expect(sections[1].lines).toHaveLength(2);
    expect(sections[2].errorCount).toBe(1);
    expect(sections[2].status).toBe('FAILED');
  });

  it('uses metadata order when only unnamed pipeline stage markers exist', () => {
    const lines = processLogLines([
      '[Pipeline] stage',
      '+ git checkout master',
      '[Pipeline] // stage',
      '[Pipeline] stage',
      '+ pnpm test',
    ].join('\n')).lines;

    const sections = buildLogAccordionSections(lines, [
      { id: 'checkout', name: 'Checkout', status: 'SUCCESS' },
      { id: 'test', name: 'Test', status: 'RUNNING' },
    ]);

    expect(sections.map((section) => section.name)).toEqual(['Checkout', 'Test']);
    expect(sections[0].lines.map((line) => line.cleanText)).toEqual([
      '[Pipeline] stage',
      '+ git checkout master',
      '[Pipeline] // stage',
    ]);
    expect(sections[1].status).toBe('RUNNING');
  });

  it('does not invent stage boundaries when the log has no markers', () => {
    const lines = processLogLines(['plain output', 'BUILD SUCCESS'].join('\n')).lines;
    const sections = buildLogAccordionSections(lines, [
      { id: 'build', name: 'Build', status: 'SUCCESS' },
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('完整日志');
    expect(sections[0].lines).toHaveLength(2);
  });
});
