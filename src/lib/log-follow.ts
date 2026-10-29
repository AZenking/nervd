export interface LogScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const BOTTOM_TOLERANCE_PX = 2;

export function updateLogFollowState(
  isFollowingLatest: boolean,
  previous: LogScrollMetrics | null,
  current: LogScrollMetrics,
): boolean {
  const movedUp = previous !== null
    && current.scrollTop < previous.scrollTop
    && current.scrollHeight >= previous.scrollHeight;

  if (movedUp) return false;

  const distanceToBottom = current.scrollHeight - current.clientHeight - current.scrollTop;
  return distanceToBottom <= BOTTOM_TOLERANCE_PX ? true : isFollowingLatest;
}
