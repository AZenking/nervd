import * as api from './api';
import type { WorkitemChild } from './api';
import { errorLog } from './error-format';
import { markdownToHtml, sanitizeForYunxiao } from './richtext';

/**
 * 子项（任务/缺陷）创建后向父需求动态补充评论的文案与发布。
 * - 任务：补充任务概要 + 任务状态（AI 批量拆解时汇总一条，避免刷屏）；
 * - 缺陷：仅补充缺陷编号与当前动态（当前状态）；
 * - 全程 best-effort：发布失败不阻断创建流程，仅记录错误日志。
 */

function childStatus(child: WorkitemChild, kind: 'Task' | 'Bug'): string {
  return child.status?.trim() || (kind === 'Bug' ? '待处理' : '待办');
}

/** 生成发布到父需求动态的 Markdown 文案（纯函数，便于测试） */
export function buildChildCreationActivity(
  created: WorkitemChild[],
  kind: 'Task' | 'Bug',
): string {
  const rows = created.filter((child) => child.identifier || child.subject);
  if (rows.length === 0) return '';

  if (kind === 'Bug') {
    // 缺陷：只需补充缺陷的当前动态（编号 + 当前状态）
    return rows
      .map((child) => `新增缺陷 ${child.identifier ?? ''}，当前动态：${childStatus(child, kind)}`)
      .join('\n');
  }

  if (rows.length === 1) {
    const child = rows[0];
    return `新增子任务 ${child.identifier ?? ''} ${child.subject ?? ''}，当前状态：${childStatus(child, kind)}`;
  }

  // 任务批量创建（AI 拆解）：汇总一条动态列出全部任务概要与状态
  const lines = rows.map(
    (child) => `- ${child.identifier ?? ''} ${child.subject ?? ''}（状态：${childStatus(child, kind)}）`,
  );
  return [`AI 拆解创建 ${rows.length} 个子任务：`, ...lines].join('\n');
}

/**
 * 向父需求动态发布子项创建评论（RICHTEXT，经 Emoji 清洗）。
 * @returns 是否成功发布（false = 无可发布内容或发布失败，调用方无需提示阻断）
 */
export async function postChildCreationActivity(
  parentWorkitemId: string,
  created: WorkitemChild[],
  kind: 'Task' | 'Bug',
): Promise<boolean> {
  const text = buildChildCreationActivity(created, kind).trim();
  if (!parentWorkitemId || !text) return false;
  try {
    const html = markdownToHtml(sanitizeForYunxiao(text));
    await api.createWorkitemComment(parentWorkitemId, html, 'RICHTEXT');
    return true;
  } catch (error) {
    errorLog('child-creation-activity', error);
    return false;
  }
}
