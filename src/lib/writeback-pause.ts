// 动态回写暂停开关（本地持久化，可在设置里恢复）。
//
// 背景：云效 PAT 不支持编辑工作项评论，滚动评论在多数组织只能降级为新增摘要；
// 在确定最终方案前，默认暂停所有回写（不创建、不更新评论），避免产生噪音。
// 恢复入口：设置 → 变更追溯 → 回写策略 →「动态回写」开关。
const PAUSE_KEY = 'nervd-attribution-writeback-paused';
const PAUSE_CHANGED_EVENT = 'nervd-writeback-pause-changed';

/** 默认暂停：未写入过开关时视为暂停，升级后不会继续产生新动态。 */
export function isWritebackPaused(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const stored = localStorage.getItem(PAUSE_KEY);
    return stored === null ? true : stored === '1';
  } catch {
    return true;
  }
}

export function setWritebackPaused(paused: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PAUSE_KEY, paused ? '1' : '0');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PAUSE_CHANGED_EVENT));
    }
  } catch {
    // 存储不可用时保持当前内存判断，不阻断设置页交互。
  }
}

/** 订阅开关变化，返回取消函数。 */
export function subscribeWritebackPause(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener();
  window.addEventListener(PAUSE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PAUSE_CHANGED_EVENT, handler);
}
