import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * 全工程统一状态徽章：shadcn Badge = 状态指示灯 + 中文名。
 * 连接 / 读写策略 / CI 运行 / 合并请求 / 迭代 / 工作项状态共用同一套语义分组与配色，
 * 原始英文状态（SUCCESS/RUNNING/…）统一翻译，中文状态（进行中/未开始/…）原样透传。
 */
export type StatusTone = 'ok' | 'run' | 'fail' | 'idle';

export interface StatusMeta {
  tone: StatusTone;
  label: string;
}

/** 规范状态表：英文原始状态与内部令牌 → 分组 + 中文标签 */
const CANONICAL: Record<string, StatusMeta> = {
  // CI / 流水线运行
  SUCCESS: { tone: 'ok', label: '成功' },
  FINISH: { tone: 'ok', label: '成功' },
  PASSED: { tone: 'ok', label: '成功' },
  RUNNING: { tone: 'run', label: '运行中' },
  WAITING: { tone: 'run', label: '等待中' },
  FAIL: { tone: 'fail', label: '失败' },
  FAILURE: { tone: 'fail', label: '失败' },
  FAILED: { tone: 'fail', label: '失败' },
  ERROR: { tone: 'fail', label: '失败' },
  UNSTABLE: { tone: 'fail', label: '不稳定' },
  CANCELED: { tone: 'idle', label: '已取消' },
  ABORTED: { tone: 'idle', label: '已中止' },
  QUEUED: { tone: 'idle', label: '排队中' },
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
  if (/进行|运行|处理中|开发中|开启|加载/.test(status)) return 'run';
  if (/完成|成功|通过|已解决|已关闭|已发布|已合并|已修复/.test(status)) return 'ok';
  if (/失败|错误|阻塞|异常/.test(status)) return 'fail';
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

const TONE_DOT: Record<StatusTone, string> = {
  ok: 'bg-sig-ok',
  run: 'bg-sig-run animate-sig-pulse',
  fail: 'bg-sig-fail',
  idle: 'bg-sig-idle',
};

const TONE_VARIANT: Record<StatusTone, 'secondary' | 'destructive' | 'outline'> = {
  ok: 'secondary',
  run: 'secondary',
  fail: 'destructive',
  idle: 'outline',
};

/** 统一状态徽章：指示灯颜色随语义分组，RUNNING 带呼吸脉冲；label 可覆盖默认翻译 */
export function StatusBadge({
  status,
  label,
  size = 'default',
  className,
}: {
  status?: string | null;
  /** 覆盖默认中文翻译（如统计格的「全部通过」） */
  label?: string;
  size?: 'default' | 'sm';
  className?: string;
}) {
  const meta = statusMeta(status);
  const text = label ?? meta.label;
  return (
    <Badge
      variant={TONE_VARIANT[meta.tone]}
      title={status && status.trim() !== text ? status.trim() : undefined}
      className={cn(size === 'sm' && 'h-5 gap-1 px-1.5 text-[11px]', 'max-w-full', className)}
    >
      {/* D3：状态点靠描边取得边缘（绿点白底 2.94:1），不换色、不加新色值 */}
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full ring-1 ring-black/10', TONE_DOT[meta.tone])}
      />
      <span className="truncate">{text}</span>
    </Badge>
  );
}
