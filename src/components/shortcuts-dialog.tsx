import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useUi } from '@/store/ui';

/**
 * ? 键盘快捷键面板（Linear 式 `?` 帮助弹层）：
 * Base UI Dialog 受控于 useUi.shortcutsOpen（由 Shell 全局快捷键层开合）；
 * 两组固定内容 —— 导航 / 列表；每行说明在左、键位胶囊在右；Esc 或点击遮罩关闭。
 */

/** 单行说明 + 键位序列（数组内多键表示"或"的关系，如 j 或 ↓） */
interface ShortcutRow {
  keys: string[];
  label: string;
}

/** 导航组：g 前缀序列与全局动作（实现均在 Shell 的全局 keydown 层） */
const NAV_ROWS: ShortcutRow[] = [
  { keys: ['g', 'o'], label: '总览' },
  { keys: ['g', 'i'], label: '当前迭代' },
  { keys: ['g', 'b'], label: '集成分支' },
  { keys: ['g', 's'], label: '设置' },
  { keys: ['⌘K'], label: '命令面板' },
  { keys: ['⌘←'], label: '后退' },
  { keys: ['Esc'], label: '关闭或后退' },
];

/** 列表组：迭代页工作项列表的光标移动与打开（实现归 IterationView，此处仅展示） */
const LIST_ROWS: ShortcutRow[] = [
  { keys: ['j', '↓'], label: '下一项' },
  { keys: ['k', '↑'], label: '上一项' },
  { keys: ['↵'], label: '打开' },
  { keys: ['[', ']'], label: '上一页 / 下一页' },
];

/** 键位胶囊（与 command-menu 底部提示同款形态） */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1 font-mono text-[11px] leading-4 text-muted-foreground">
      {children}
    </kbd>
  );
}

/** 一组快捷键：组标题 + 说明/键位行 */
function ShortcutGroup({ title, rows }: { title: string; rows: ShortcutRow[] }) {
  return (
    <div>
      <p className="px-4 pb-1 pt-4 text-xs font-medium text-muted-foreground">{title}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.label} className="flex h-8 items-center justify-between px-4 text-sm">
            <span>{row.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {row.keys.map((key, i) => (
                <span key={key} className="flex items-center gap-1">
                  {i > 0 && <span className="text-xs text-muted-foreground">或</span>}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setShortcutsOpen}>
      <DialogPrimitive.Portal>
        {/* 遮罩：与 ui/dialog.tsx 的 DialogOverlay 同款（浅黑 + 轻模糊） */}
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        {/* 居中卡片：p-0 由内部分区自带留白；不渲染关闭按钮，Esc / 点遮罩即关 */}
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover pb-2 text-popover-foreground shadow-level-2 ring-1 ring-black/8 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
          {/* 可见标题即 DialogTitle（避免 sr-only + 可见文字造成的读屏重复播报） */}
          <DialogPrimitive.Title className="flex h-12 shrink-0 items-center border-b border-border px-4 text-sm font-medium">
            键盘快捷键
          </DialogPrimitive.Title>
          <div className="max-h-[min(480px,80vh)] overflow-y-auto">
            <ShortcutGroup title="导航" rows={NAV_ROWS} />
            <ShortcutGroup title="列表" rows={LIST_ROWS} />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
