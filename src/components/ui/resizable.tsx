// 可拖动分栏分隔线（Linear 式 1px hairline 拖拽手柄）：
// - 透明命中区 w-2（8px）配 -ml-1 居中于面板边界，可见部分为 1px 竖线（bg-border，hover/拖动中 bg-primary/40）。
// - 默认自带 `absolute inset-y-0 z-10 -ml-1 w-2`：消费方只需给出左锚点（className/style 的 left），
//   命中区即在边界两侧各延伸 4px，可见线正落在边界上；定位细节见组件下方说明。
// - 无障碍：role="separator" + aria-valuemin/max/now + tabIndex=0，方向键（Shift ×4）/Home/End 调整，双击复位。
// - 严禁 data-tauri-drag-region：该元素是交互控件，不是窗口拖拽区。
import { useRef, useState } from 'react';
import type {
  CSSProperties,
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from '@/lib/utils';

export interface PaneSeparatorProps {
  /** 可访问名称，需含尺寸范围，如 "调整工作项列表宽度，280 到 480 像素" */
  'aria-label': string;
  value: number;
  min: number;
  max: number;
  /** 拖动/键盘调整后的建议宽度（未 clamp，由 store 负责钳制与持久化） */
  onChange: (px: number) => void;
  /** 双击恢复默认宽度 */
  onReset: () => void;
  /** 拖动增大方向：'right'（默认，分隔线在面板右缘，向右拖增大）；'left'（分隔线在面板左缘，向左拖增大） */
  growDirection?: 'left' | 'right';
  /** 键盘单次步长（像素），默认 8；按住 Shift ×4 */
  step?: number;
  className?: string;
  style?: CSSProperties;
}

const clampToRange = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

interface DragSession {
  pointerId: number;
  startX: number;
  startValue: number;
  lastDelta: number;
  /** 拖动前 body 的内联样式原值，pointerup/cancel 时恢复 */
  previousCursor: string;
  previousUserSelect: string;
}

/**
 * 面板分隔线（垂直）。默认样式/定位约定：
 * - 根元素 `absolute inset-y-0 z-10 -ml-1 w-2`：8px 命中区以消费方给定的 left 锚点为中心左右各 4px。
 * - 可见 1px 线是内部子元素，对齐命中区中心（即锚点边界），hover / focus-visible / 拖动中增强为 bg-primary/40。
 * - 消费方通过 className/style 提供 left（如 `left-[var(--sidebar-width)]` 或 style={{ left: sidebarWidth }}）；
 *   若需右锚点定位请自行覆盖 -ml-1（如换成 -translate-x-1/2）。
 */
export function PaneSeparator({
  'aria-label': ariaLabel,
  value,
  min,
  max,
  onChange,
  onReset,
  growDirection = 'right',
  step = 8,
  className,
  style,
}: PaneSeparatorProps): JSX.Element {
  const [dragging, setDragging] = useState(false);
  const sessionRef = useRef<DragSession | null>(null);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const body = document.body;
    sessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: value,
      lastDelta: 0,
      previousCursor: body.style.cursor,
      previousUserSelect: body.style.userSelect,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    // 拖动期间全局 col-resize 光标 + 禁止选中文本；原值已存入 session，结束时恢复。
    body.style.cursor = 'col-resize';
    body.style.userSelect = 'none';
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const delta = event.clientX - session.startX;
    if (delta === session.lastDelta) return;
    session.lastDelta = delta;
    // 'left'：分隔线在面板左缘，向左拖增大 → 增量取反；建议值不 clamp，交由 store 钳制。
    onChange(session.startValue + (growDirection === 'right' ? delta : -delta));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针捕获已被浏览器释放（如点数取消）时忽略。
    }
    document.body.style.cursor = session.previousCursor;
    document.body.style.userSelect = session.previousUserSelect;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // 组件聚焦时隔离全局单键快捷键（迭代页 j/k 等）；带修饰键的组合（⌘K、⌘← 后退）继续放行。
    if (!event.metaKey && !event.ctrlKey && !event.altKey) event.stopPropagation();
    const magnitude = step * (event.shiftKey ? 4 : 1);
    // 'right'（默认）：ArrowRight 增大；'left'：ArrowLeft 增大。
    const sign = growDirection === 'right' ? 1 : -1;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        onChange(value + sign * magnitude);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        onChange(value - sign * magnitude);
        break;
      case 'Home':
        event.preventDefault();
        onChange(min);
        break;
      case 'End':
        event.preventDefault();
        onChange(max);
        break;
      default:
        // Enter/Space 等保持无操作且不阻止默认，避免影响可访问性。
        break;
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(clampToRange(value, min, max))}
      tabIndex={0}
      className={cn(
        'group/pane-separator absolute inset-y-0 z-10 -ml-1 w-2 cursor-col-resize touch-none select-none outline-none',
        'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/30',
        className,
      )}
      style={style}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors',
          'group-hover/pane-separator:bg-primary/40 group-focus-visible/pane-separator:bg-primary/40',
          dragging && 'bg-primary/40',
        )}
      />
    </div>
  );
}
