import {
  cloneElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface OverflowTooltipProps {
  /** 文本内容 */
  text?: string;
  /** 可选自定义 Tooltip 悬浮展示内容（缺省使用 text 或 children 中的纯文本） */
  tooltip?: ReactNode;
  /** 子元素（若提供则作为文本/内容渲染，缺省为 text） */
  children?: ReactNode;
  /** 文本容器类名（默认包含 truncate；多行请使用 multiline/lineClamp） */
  className?: string;
  /** 文本容器样式 */
  style?: CSSProperties;
  /** Tooltip 弹出方向 */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Tooltip 对齐方式 */
  align?: 'start' | 'center' | 'end';
  /** Tooltip 侧边偏移量 */
  sideOffset?: number;
  /** Tooltip 气泡容器类名 */
  contentClassName?: string;
  /** 容器渲染 HTML 标签，默认 span */
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'div' | 'p';
  /** 以多行高度（scrollHeight/clientHeight）判断溢出，并避免默认 truncate 覆盖换行布局。 */
  multiline?: boolean;
  /** 显式启用多行截断，使用内联 line-clamp。 */
  lineClamp?: number;
  /** Base UI render 组合 API；可传入已有 button/a 或显式 focusable 文本控件。 */
  render?: ReactElement;
}

const FOCUSABLE_ANCESTOR_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"]), [role="listitem"][tabindex], [role="treeitem"][tabindex], [role="row"][tabindex], [role="gridcell"][tabindex], [role="option"][tabindex]';
const ancestorTriggers = new WeakMap<HTMLElement, Map<HTMLElement, AncestorTooltipEntry>>();

type VirtualTooltipEntry = {
  close: () => void;
  evaluate: () => void;
  isOpen: () => boolean;
};

type VirtualInputRegistry = {
  entries: Map<HTMLElement, VirtualTooltipEntry>;
  keyboardActive: boolean;
  markPointer: () => void;
  dispose: () => void;
};

type AncestorTooltipEntry = {
  close: () => void;
  focus: () => boolean;
  isOverflowed: () => boolean;
};

const virtualInputRegistries = new WeakMap<HTMLInputElement, VirtualInputRegistry>();
const VIRTUAL_NAVIGATION_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'PageUp',
  'PageDown',
]);

function createVirtualInputRegistry(input: HTMLInputElement): VirtualInputRegistry {
  const registry: VirtualInputRegistry = {
    entries: new Map<HTMLElement, VirtualTooltipEntry>(),
    keyboardActive: false,
    markPointer: () => {
      registry.keyboardActive = false;
    },
    dispose: () => undefined,
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (VIRTUAL_NAVIGATION_KEYS.has(event.key)) {
      registry.keyboardActive = true;
      queueMicrotask(() => registry.entries.forEach((entry) => entry.evaluate()));
      return;
    }
    if (event.key !== 'Escape') return;
    const hasOpenTooltip = [...registry.entries.values()].some((entry) => entry.isOpen());
    if (!hasOpenTooltip) return;
    event.preventDefault();
    event.stopPropagation();
    registry.keyboardActive = false;
    registry.entries.forEach((entry) => entry.close());
  };
  const handleBlur = () => {
    registry.keyboardActive = false;
    registry.entries.forEach((entry) => entry.close());
  };

  input.addEventListener('keydown', handleKeyDown, true);
  input.addEventListener('pointerdown', registry.markPointer, true);
  input.addEventListener('mousedown', registry.markPointer, true);
  input.addEventListener('blur', handleBlur, true);
  registry.dispose = () => {
    input.removeEventListener('keydown', handleKeyDown, true);
    input.removeEventListener('pointerdown', registry.markPointer, true);
    input.removeEventListener('mousedown', registry.markPointer, true);
    input.removeEventListener('blur', handleBlur, true);
  };
  return registry;
}

function getVirtualInputRegistry(input: HTMLInputElement): VirtualInputRegistry {
  const existing = virtualInputRegistries.get(input);
  if (existing) return existing;
  const created = createVirtualInputRegistry(input);
  virtualInputRegistries.set(input, created);
  return created;
}

function tokenIncludes(value: string | null, token: string | undefined): boolean {
  return Boolean(token && value?.split(/\s+/).includes(token));
}

function findVirtualFocusInput(option: HTMLElement): HTMLInputElement | null {
  const optionId = option.id || undefined;
  const list = option.closest('[role="listbox"], [role="grid"]');
  const listId = list?.id || undefined;
  const candidates = [...document.querySelectorAll<HTMLInputElement>(
    'input[role="combobox"], input[aria-activedescendant], input[aria-controls]',
  )].filter((input) => !input.hasAttribute('aria-hidden') && input.getAttribute('tabindex') !== '-1');
  return candidates.find((input) => tokenIncludes(input.getAttribute('aria-activedescendant'), optionId))
    ?? candidates.find((input) => tokenIncludes(input.getAttribute('aria-controls'), listId))
    ?? (() => {
      const comboboxes = candidates.filter((input) => input.getAttribute('role') === 'combobox');
      return comboboxes.length === 1 ? comboboxes[0] : null;
    })();
}

function findFocusableAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    if (current.matches(FOCUSABLE_ANCESTOR_SELECTOR)) return current;
    current = current.parentElement;
  }
  return null;
}

function hasSemanticTooltipAncestor(element: HTMLElement): boolean {
  let current = element.parentElement;
  while (current) {
    if (current.matches('[data-slot="tooltip-trigger"], [data-base-ui-tooltip-trigger]')) return true;
    current = current.parentElement;
  }
  return false;
}

function hasTooltipContent(value: ReactNode): boolean {
  return value !== null && value !== undefined && value !== false && value !== '';
}

function withDescribedBy(value: string | undefined, id: string, include: boolean): string | undefined {
  const tokens = (value ?? '').split(/\s+/).filter(Boolean).filter((token) => token !== id);
  if (include) tokens.push(id);
  return tokens.length > 0 ? tokens.join(' ') : undefined;
}

function syncDescribedBy(element: HTMLElement, id: string, include: boolean) {
  const current = element.getAttribute('aria-describedby') ?? undefined;
  const next = withDescribedBy(current, id, include);
  if (next) element.setAttribute('aria-describedby', next);
  else element.removeAttribute('aria-describedby');
}

/**
 * 文本溢出优化展示组件：
 * 仅在文本由于容器尺寸受限而发生截断时触发 Tooltip；未截断时保持轻量无气泡。
 * 默认 span 不会生成嵌套 button；组件位于已有 button/a 内时复用祖先焦点。
 */
export function OverflowTooltip({
  text,
  tooltip,
  children,
  className,
  style,
  side = 'top',
  align = 'start',
  sideOffset = 4,
  contentClassName,
  as: Component = 'span',
  multiline = false,
  lineClamp,
  render,
}: OverflowTooltipProps) {
  const ref = useRef<HTMLElement>(null);
  const tooltipId = `overflow-tooltip-${useId().replace(/:/g, '')}`;
  const overflowedRef = useRef(false);
  const [overflowed, setOverflowed] = useState(false);
  const [open, setOpen] = useState(false);

  const content = children ?? text;
  const tipText = tooltip ?? (typeof children === 'string' ? children : text);
  const hasTip = hasTooltipContent(tipText);
  const openRef = useRef(open);
  const hasTipRef = useRef(hasTip);
  const focusOwnerRef = useRef<HTMLElement | null>(null);
  const virtualInputRef = useRef<HTMLInputElement | null>(null);
  const virtualOpenRef = useRef(false);
  openRef.current = open;
  hasTipRef.current = hasTip;
  const hasLineClampClass = className?.split(/\s+/).some((token) => token.startsWith('line-clamp-')) ?? false;
  const isMultiline = multiline || lineClamp !== undefined || hasLineClampClass;

  const closeSiblingTooltips = useCallback(() => {
    const owner = focusOwnerRef.current;
    const current = ref.current;
    if (!owner || !current) return;
    const triggers = ancestorTriggers.get(owner);
    triggers?.forEach((entry, trigger) => {
      if (trigger !== current) entry.close();
    });
  }, []);

  const measureOverflow = useCallback(() => {
    const element = ref.current;
    if (!element) return false;
    // 容差 1px，避免浮点/子像素计算偏差。
    return isMultiline
      ? element.scrollHeight > element.clientHeight + 1
      : element.scrollWidth > element.clientWidth + 1;
  }, [isMultiline]);

  const updateOverflow = useCallback(() => {
    const next = measureOverflow();
    overflowedRef.current = next;
    setOverflowed((previous) => (previous === next ? previous : next));
    if (!next) {
      setOpen(false);
    } else if (hasTipRef.current && typeof document !== 'undefined' && document.activeElement === ref.current) {
      // 尺寸/文本变化时若触发器仍保持焦点，立即补开提示，不要求用户重新 Tab。
      closeSiblingTooltips();
      setOpen(true);
    } else if (next && hasTipRef.current && typeof document !== 'undefined') {
      const owner = focusOwnerRef.current;
      if (owner && document.activeElement === owner) {
        const triggers = ancestorTriggers.get(owner);
        const firstOverflowed = triggers
          ? [...triggers.entries()].find(([, entry]) => entry.isOverflowed())
          : undefined;
        if (!firstOverflowed || firstOverflowed[0] !== ref.current) {
          setOpen(false);
          return next;
        }
        // 尺寸/文本变化后，仍由同一 focus owner 驱动首个溢出文本。
        closeSiblingTooltips();
        setOpen(true);
      }
    }
    return next;
  }, [closeSiblingTooltips, measureOverflow]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    updateOverflow();

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateOverflow) : null;
    resizeObserver?.observe(element);
    const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(updateOverflow) : null;
    mutationObserver?.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    window.addEventListener('resize', updateOverflow);

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [children, className, lineClamp, style, text, tooltip, updateOverflow]);

  // Combobox uses virtual focus: DOM focus stays on the input while the active option is
  // exposed through aria-activedescendant. Observe both data-highlighted and the active id,
  // but only open automatically after a navigation key (pointer highlighting is not enough).
  useLayoutEffect(() => {
    const element = ref.current;
    const option = element?.closest('[role="option"]') as HTMLElement | null;
    if (!element || !option) return undefined;

    let optionObserver: MutationObserver | null = null;
    let inputObserver: MutationObserver | null = null;
    let discoveryObserver: MutationObserver | null = null;
    let registry: VirtualInputRegistry | null = null;
    let input: HTMLInputElement | null = null;

    const closeVirtualTooltip = () => {
      virtualOpenRef.current = false;
      setOpen(false);
      if (virtualInputRef.current) syncDescribedBy(virtualInputRef.current, tooltipId, false);
    };

    const startDiscovery = () => {
      if (discoveryObserver || typeof MutationObserver === 'undefined') return;
      const list = option.closest('[role="listbox"], [role="grid"]');
      const root = list?.parentElement ?? option.parentElement;
      if (!root) return;
      discoveryObserver = new MutationObserver(evaluate);
      discoveryObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-activedescendant', 'aria-controls'],
      });
    };

    const evaluate = () => {
      const nextInput = findVirtualFocusInput(option);
      if (nextInput) discoveryObserver?.disconnect();
      if (nextInput) discoveryObserver = null;
      if (nextInput !== input) {
        inputObserver?.disconnect();
        if (virtualInputRef.current && virtualInputRef.current !== nextInput) {
          syncDescribedBy(virtualInputRef.current, tooltipId, false);
        }
        if (registry) {
          registry.entries.delete(element);
          if (registry.entries.size === 0) {
            registry.dispose();
            virtualInputRegistries.delete(input!);
          }
        }
        input = nextInput;
        const nextRegistry = nextInput ? getVirtualInputRegistry(nextInput) : null;
        registry = nextRegistry;
        virtualInputRef.current = nextInput;
        if (nextInput && nextRegistry) {
          inputObserver = new MutationObserver(evaluate);
          inputObserver.observe(nextInput, {
            attributes: true,
            attributeFilter: ['aria-activedescendant', 'aria-controls'],
          });
          nextRegistry.entries.set(element, { close: closeVirtualTooltip, evaluate, isOpen: () => openRef.current });
        }
      }
      if (!nextInput) startDiscovery();

      const isKeyboardActive = Boolean(
        registry
        && input
        && registry.keyboardActive
        && document.activeElement === input
        && option.hasAttribute('data-highlighted')
        && tokenIncludes(input.getAttribute('aria-activedescendant'), option.id || undefined),
      );
      if (!isKeyboardActive || !hasTipRef.current) {
        if (virtualOpenRef.current) closeVirtualTooltip();
        return;
      }

      if (updateOverflow() && input) {
        registry?.entries.forEach((entry, trigger) => {
          if (trigger !== element) entry.close();
        });
        virtualOpenRef.current = true;
        syncDescribedBy(input, tooltipId, true);
        setOpen(true);
      }
    };

    const handlePointer = () => {
      registry?.markPointer();
      if (virtualOpenRef.current) closeVirtualTooltip();
    };
    option.addEventListener('pointermove', handlePointer, true);
    option.addEventListener('pointerover', handlePointer, true);
    option.addEventListener('pointerdown', handlePointer, true);
    option.addEventListener('mousedown', handlePointer, true);
    optionObserver = new MutationObserver(evaluate);
    optionObserver.observe(option, { attributes: true, attributeFilter: ['data-highlighted', 'id'] });
    evaluate();
    if (!input) startDiscovery();

    return () => {
      optionObserver?.disconnect();
      inputObserver?.disconnect();
      discoveryObserver?.disconnect();
      option.removeEventListener('pointermove', handlePointer, true);
      option.removeEventListener('pointerover', handlePointer, true);
      option.removeEventListener('pointerdown', handlePointer, true);
      option.removeEventListener('mousedown', handlePointer, true);
      if (registry) {
        registry.entries.delete(element);
        if (registry.entries.size === 0 && input) {
          registry.dispose();
          virtualInputRegistries.delete(input);
        }
      }
      closeVirtualTooltip();
      virtualInputRef.current = null;
    };
  }, [tooltipId, updateOverflow]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const ancestor = findFocusableAncestor(element);
    const semanticTooltipAncestor = hasSemanticTooltipAncestor(element);
    if (!ancestor || semanticTooltipAncestor) return undefined;
    focusOwnerRef.current = ancestor;

    let triggers = ancestorTriggers.get(ancestor);
    if (!triggers) {
      triggers = new Map<HTMLElement, AncestorTooltipEntry>();
      ancestorTriggers.set(ancestor, triggers);
    }
    triggers.set(element, {
      close: () => setOpen(false),
      focus: () => {
        const next = updateOverflow();
        if (!next || !hasTipRef.current) return false;
        closeSiblingTooltips();
        setOpen(true);
        return true;
      },
      isOverflowed: () => hasTipRef.current && measureOverflow(),
    });

    const handleAncestorFocus = (event: FocusEvent) => {
      // 同一个 focus owner 内按 DOM 顺序选择第一个实际溢出的文本；
      // 每个 label 的鼠标 hover 仍由各自的 TooltipTrigger 独立处理。
      if (event.target !== ancestor) return;
      if (triggers?.keys().next().value !== element) return;
      for (const entry of triggers.values()) {
        if (entry.focus()) break;
      }
    };
    const handleAncestorBlur = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !ancestor.contains(nextTarget)) {
        setOpen(false);
      }
    };
    const handleAncestorKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !openRef.current) return;
      // 被动提示不是 Esc 层级（AGENTS.md §4.2 的浮层指菜单/下拉/弹窗）：
      // Esc 到达时顺带关闭自身，但不拦截事件，让多选/分栏等真实层级同键响应。
      setOpen(false);
    };

    ancestor.addEventListener('focus', handleAncestorFocus, true);
    ancestor.addEventListener('blur', handleAncestorBlur, true);
    ancestor.addEventListener('keydown', handleAncestorKeyDown, true);
    return () => {
      ancestor.removeEventListener('focus', handleAncestorFocus, true);
      ancestor.removeEventListener('blur', handleAncestorBlur, true);
      ancestor.removeEventListener('keydown', handleAncestorKeyDown, true);
      syncDescribedBy(ancestor, tooltipId, false);
      if (focusOwnerRef.current === ancestor) focusOwnerRef.current = null;
      triggers?.delete(element);
      if (triggers?.size === 0) ancestorTriggers.delete(ancestor);
    };
  }, [closeSiblingTooltips, measureOverflow, tooltipId, updateOverflow]);

  useLayoutEffect(() => {
    const owner = focusOwnerRef.current;
    if (!owner) return undefined;
    syncDescribedBy(owner, tooltipId, open && overflowed && hasTip);
    return () => syncDescribedBy(owner, tooltipId, false);
  }, [hasTip, open, overflowed, tooltipId]);

  const handleTriggerOpenChange = useCallback((nextOpen: boolean) => {
    // Base UI may receive the event before React commits measurement state.
    if (nextOpen && !overflowedRef.current) return;
    if (nextOpen) closeSiblingTooltips();
    setOpen(nextOpen);
  }, [closeSiblingTooltips]);

  const handleTriggerKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    // 同 ancestor 路径：Esc 隐式关闭提示，不作为浮层层级拦截按键。
    if (event.key !== 'Escape' || !openRef.current) return;
    setOpen(false);
  }, []);

  const renderElement = render;
  const renderProps = renderElement?.props as Record<string, unknown> | undefined;
  const triggerDescribedBy = renderProps?.['aria-describedby'] as string | undefined;
  const triggerElement = renderElement
    ? cloneElement(
        renderElement as ReactElement<Record<string, unknown>>,
        { 'aria-describedby': withDescribedBy(triggerDescribedBy, tooltipId, open && overflowed && hasTip) },
        content,
      )
    : <Component aria-describedby={open && overflowed && hasTip ? tooltipId : undefined} />;
  const lineClampStyle: CSSProperties | undefined = lineClamp
    ? {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: lineClamp,
        overflow: 'hidden',
      }
    : undefined;
  return (
    <Tooltip open={open && overflowed && hasTip} onOpenChange={handleTriggerOpenChange}>
      <TooltipTrigger
        ref={ref as unknown as Ref<HTMLButtonElement>}
        render={triggerElement}
        className={cn(
          'inline-block max-w-full align-bottom min-w-0',
          !isMultiline && 'truncate',
          isMultiline && 'whitespace-normal break-words',
          className,
        )}
        style={{ ...lineClampStyle, ...style }}
        onMouseEnter={updateOverflow}
        onFocus={updateOverflow}
        onBlur={() => setOpen(false)}
        onKeyDown={handleTriggerKeyDown}
      >
        {content}
      </TooltipTrigger>
      {overflowed && hasTip && (
        <TooltipContent
          id={tooltipId}
          role="tooltip"
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'max-w-md break-words whitespace-normal text-xs leading-relaxed font-normal shadow-lg',
            contentClassName,
          )}
        >
          {tipText}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
