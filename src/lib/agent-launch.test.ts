import { describe, expect, it } from 'vitest';
import { buildAgentPrompt, buildCodexLaunchCommand, quoteForShell } from './agent-launch';

describe('agent-launch', () => {
  it('quoteForShell 使用 POSIX 单引号并正确转义内嵌单引号', () => {
    expect(quoteForShell('/tmp/nervd-web')).toBe("'/tmp/nervd-web'");
    expect(quoteForShell("it's a path")).toBe("'it'\\''s a path'");
    expect(quoteForShell('a && rm -rf /')).toBe("'a && rm -rf /'");
  });

  it('buildAgentPrompt 带出编号、父需求与显式提交参数', () => {
    const prompt = buildAgentPrompt({
      identifier: 'TASK-202',
      subject: '前端联调',
      category: 'Task',
      parentIdentifier: 'REQ-101',
      parentSubject: '订单改版',
      iterationName: 'Benz-20261116',
    });
    expect(prompt).toContain('TASK-202');
    expect(prompt).toContain('「前端联调」');
    expect(prompt).toContain('父需求：REQ-101「订单改版」');
    expect(prompt).toContain('当前迭代：Benz-20261116');
    expect(prompt).toContain('--workitem TASK-202 --req REQ-101');
    expect(prompt).toContain('./scripts/read-active-workitem.sh');
    expect(prompt).toContain('./scripts/agent-commit.sh');
    expect(prompt).toContain('Conventional Commits');
  });

  it('需求（无父级）不追加 --req', () => {
    const prompt = buildAgentPrompt({ identifier: 'REQ-101', subject: '订单改版', category: 'Req' });
    expect(prompt).toContain('--workitem REQ-101');
    expect(prompt).not.toContain('--req');
  });

  it('buildCodexLaunchCommand 生成 cd 到仓库并带 prompt 启动 codex 的命令', () => {
    const command = buildCodexLaunchCommand('/tmp/nervd-web', {
      identifier: 'TASK-202',
      subject: '前端联调',
      category: 'Task',
      parentIdentifier: 'REQ-101',
    });
    expect(command.startsWith("cd '/tmp/nervd-web' && codex '")).toBe(true);
    expect(command).toContain('TASK-202');
    expect(command).toContain('--req REQ-101');
  });

  it('仓库路径为空时拒绝生成命令', () => {
    expect(() => buildCodexLaunchCommand('  ', { identifier: 'REQ-1' })).toThrow('仓库路径不能为空');
  });
});