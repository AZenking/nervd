import { Chip } from '@/components/ui/chip';
import { StatusIcon } from '@/components/status-icon';
import { CI_STATUS_MAP } from '@/lib/ci';

/**
 * 全工程统一状态徽章：使用 HeroUI 原生 Chip 呈现状态语义。
 * 连接 / 读写策略 / CI 运行 / 合并请求 / 迭代 / 工作项状态共用同一套语义分组与图形，
 * 原始英文状态（SUCCESS/RUNNING/…）统一翻译，中文状态（进行中/未开始/…）原样透传。
 */
export type StatusTone = 'ok' | 'run' | 'fail' | 'idle';

export interface StatusMeta {
  tone: StatusTone;
  label: string;
}

const TONE_TO_COLOR: Record<StatusTone, 'success' | 'warning' | 'danger' | 'default'> = {
  ok: 'success',
  run: 'warning',
  fail: 'danger',
  idle: 'default',
};

/** 规范状态表：英文原始状态与内部令牌 → 分组 + 中文标签 */
const CANONICAL: Record<string, StatusMeta> = {
  // CI / 流水线运行枚举（统一自 src/lib/ci.ts 共享引用）
  ...CI_STATUS_MAP,
  // 合并请求
  MERGED: { tone: 'ok', label: '已合并' },
  OPEN: { tone: 'run', label: '开启中' },
  OTHER: { tone: 'idle', label: '其他' },
  // 云效连接
  CONNECTED: { tone: 'ok', label: '已连接' },
  CONNECT_FAIL: { tone: 'fail', label: '连接失败' },
  CONNECTING: { tone: 'run', label: '连接中' },
  // 写操作策略
  WRITABLE: { tone: 'ok', label: '可写' },
  READONLY: { tone: 'idle', label: '只读' },
};

/** 中文状态关键词分组（云效工作项 / 迭代状态名透传展示） */
function toneOfChinese(status: string): StatusTone {
  if (/失败|错误|阻塞|异常|不稳定|超时/.test(status)) return 'fail';
  if (/完成|成功|通过|已解决|已关闭|已发布|已合并|已修复|结束|已结束|归档|已归档/.test(status)) return 'ok';
  if (/进行|运行|处理中|开发中|开启|加载|构建|等待|排队/.test(status)) return 'run';
  return 'idle';
}

/** 任意原始状态 → 语义分组 + 中文名（空值归为未知，未知英文原样展示） */
export function statusMeta(status?: string | null): StatusMeta {
  const raw = (status ?? '').trim();
  if (!raw || raw === '—') return { tone: 'idle', label: '未知' };
  const canonical = CANONICAL[raw.toUpperCase()];
  if (canonical) return canonical;
  return { tone: toneOfChinese(raw), label: raw };
}

/** 连接状态（store: 'ok' | 'fail' | 其他=连接中）→ 规范令牌 */
export function connectionStatus(connection?: string): string {
  return connection === 'ok' ? 'CONNECTED' : connection === 'fail' ? 'CONNECT_FAIL' : 'CONNECTING';
}

/** 统一状态徽章：使用 HeroUI 原生 Chip 呈现状态语义 */
export function StatusBadge({
  status,
  label,
  size = 'default',
  variant = 'soft',
  className,
}: {
  status?: string | null;
  /** 覆盖默认中文翻译（如统计格的「全部通过」） */
  label?: string;
  size?: 'default' | 'sm';
  variant?: 'soft' | 'primary' | 'secondary' | 'tertiary';
  className?: string;
}) {
  const meta = statusMeta(status);
  const text = label ?? meta.label;
  const color = TONE_TO_COLOR[meta.tone] ?? 'default';

  return (
    <Chip
      size={size === 'sm' ? 'sm' : 'md'}
      color={color}
      variant={variant}
      title={status && status.trim() !== text ? status.trim() : undefined}
      className={className}
    >
      <StatusIcon status={status} className={size === 'sm' ? 'size-3 shrink-0' : 'size-3.5 shrink-0'} />
      <Chip.Label className="truncate">{text}</Chip.Label>
    </Chip>
  );
}
