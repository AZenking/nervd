import { Modal } from '@heroui/react';
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
  { keys: ['g', 'r'], label: '最近查看' },
  { keys: ['g', 'i'], label: '当前迭代' },
  { keys: ['g', 'b'], label: '集成分支' },
  { keys: ['g', 'c'], label: '定时任务' },
  { keys: ['g', 's'], label: '设置' },
  { keys: ['⌘K'], label: '命令面板' },
  { keys: ['⌘B'], label: '快速构建 / 重新触发流水线' },
  { keys: ['⌘[', '⌘←'], label: '后退' },
  { keys: ['⌘]'], label: '前进' },
  { keys: ['⌘,'], label: '打开设置' },
  { keys: ['⌘F'], label: '搜索当前视图（无搜索框时打开命令面板）' },
  { keys: ['⌘R'], label: '刷新当前视图' },
  { keys: ['Esc'], label: '取消选择或关闭浮层、分栏' },
];

/** 列表组：迭代页工作项列表的光标移动与打开（实现归 IterationView，此处仅展示） */
const LIST_ROWS: ShortcutRow[] = [
  { keys: ['j', '↓'], label: '下一项' },
  { keys: ['k', '↑'], label: '上一项' },
  { keys: ['↵'], label: '打开' },
  { keys: ['⌘A'], label: '选择当前页' },
  { keys: ['[', ']'], label: '上一页 / 下一页' },
];

/** 布局组：分栏分隔线键盘调整（实现归 ui/resizable.tsx，此处仅展示） */
const LAYOUT_ROWS: ShortcutRow[] = [
  { keys: ['←→'], label: '聚焦分隔线后调整分栏宽度（±8px）' },
  { keys: ['⇧←→'], label: '大幅调整分栏宽度（±32px）' },
  { keys: ['双击'], label: '分隔线恢复默认宽度' },
  { keys: ['Esc'], label: '窄窗详情中返回列表' },
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
          <li key={row.label} className="flex h-8 items-center justify-between px-4 text-sm text-foreground">
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
    <Modal isOpen={open} onOpenChange={setShortcutsOpen}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="p-0 overflow-hidden sm:max-w-[480px]">
            <Modal.Header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 py-0">
              <Modal.Heading className="text-sm font-medium">
                键盘快捷键
              </Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>
            <Modal.Body className="p-0 max-h-[min(480px,80vh)] overflow-y-auto">
              <ShortcutGroup title="导航" rows={NAV_ROWS} />
              <ShortcutGroup title="列表" rows={LIST_ROWS} />
              <ShortcutGroup title="布局" rows={LAYOUT_ROWS} />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
