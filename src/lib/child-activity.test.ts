import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildChildCreationActivity, postChildCreationActivity } from './child-activity';
import type { WorkitemChild } from './api';
import * as api from './api';

vi.mock('./api', () => ({
  createWorkitemComment: vi.fn().mockResolvedValue({ success: true }),
}));

const task = (over: Partial<WorkitemChild> = {}): WorkitemChild => ({
  workitemId: 'task-1',
  identifier: 'TASK-101',
  subject: '实现退款申请弹窗与表单校验逻辑',
  category: 'Task',
  status: '待办',
  ...over,
});

const bug = (over: Partial<WorkitemChild> = {}): WorkitemChild => ({
  workitemId: 'bug-1',
  identifier: 'BUG-201',
  subject: '退款金额输入框偶发丢失焦点',
  category: 'Bug',
  status: '待处理',
  ...over,
});

describe('buildChildCreationActivity', () => {
  it('单个任务：补充任务概要与任务状态', () => {
    expect(buildChildCreationActivity([task()], 'Task'))
      .toBe('新增子任务 TASK-101 实现退款申请弹窗与表单校验逻辑，当前状态：待办');
  });

  it('任务缺省状态回退「待办」', () => {
    expect(buildChildCreationActivity([task({ status: undefined })], 'Task'))
      .toContain('当前状态：待办');
  });

  it('批量任务（AI 拆解）：汇总一条，逐行列出概要与状态', () => {
    const text = buildChildCreationActivity([
      task({ workitemId: 'a', identifier: 'TASK-1', subject: '【前端】实现退款界面', status: '待办' }),
      task({ workitemId: 'b', identifier: 'TASK-2', subject: '【后端】提供退款 RPC', status: '进行中' }),
    ], 'Task');
    expect(text.startsWith('AI 拆解创建 2 个子任务：')).toBe(true);
    expect(text).toContain('- TASK-1 【前端】实现退款界面（状态：待办）');
    expect(text).toContain('- TASK-2 【后端】提供退款 RPC（状态：进行中）');
  });

  it('缺陷：仅补充缺陷编号与当前动态（当前状态），不含概要', () => {
    const text = buildChildCreationActivity([bug()], 'Bug');
    expect(text).toBe('新增缺陷 BUG-201，当前动态：待处理');
    expect(text).not.toContain(bug().subject);
  });

  it('缺陷缺省状态回退「待处理」', () => {
    expect(buildChildCreationActivity([bug({ status: '' })], 'Bug'))
      .toContain('当前动态：待处理');
  });

  it('无可发布内容（缺编号与概要）时返回空串', () => {
    expect(buildChildCreationActivity([{ workitemId: 'x' } as WorkitemChild], 'Task')).toBe('');
  });
});

describe('postChildCreationActivity', () => {
  beforeEach(() => {
    vi.mocked(api.createWorkitemComment).mockClear();
  });

  it('以 RICHTEXT 发布评论并返回 true', async () => {
    const ok = await postChildCreationActivity('req-1', [task()], 'Task');
    expect(ok).toBe(true);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    const [workitemId, content, formatType] = vi.mocked(api.createWorkitemComment).mock.calls[0];
    expect(workitemId).toBe('req-1');
    expect(formatType).toBe('RICHTEXT');
    expect(String(content)).toContain('TASK-101');
    expect(String(content)).toContain('<'); // 已转为 HTML 富文本
  });

  it('发布失败不抛出，返回 false（不阻断创建流程）', async () => {
    vi.mocked(api.createWorkitemComment).mockRejectedValueOnce(new Error('云效 400'));
    const ok = await postChildCreationActivity('req-1', [bug()], 'Bug');
    expect(ok).toBe(false);
  });

  it('无父需求 ID 或无内容时直接跳过，不发起请求', async () => {
    expect(await postChildCreationActivity('', [task()], 'Task')).toBe(false);
    expect(await postChildCreationActivity('req-1', [], 'Task')).toBe(false);
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
  });
});
