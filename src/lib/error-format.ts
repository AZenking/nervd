// 统一错误文案:把未知异常转成可读的人话;原始错误仅进 console,不再直出 String(e)。
// 审计来源:docs/design-audit-2026-10-10.md C1。

export function humanizeError(err: unknown, fallback = "操作失败,请稍后重试"): string {
  if (err == null) return fallback;
  if (typeof err === "string") {
    const s = err.trim();
    return s || fallback;
  }
  if (err instanceof Error) {
    const s = err.message?.trim();
    return s || fallback;
  }
  if (typeof err === "object" && "message" in (err as Record<string, unknown>)) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return fallback;
}

export function errorLog(scope: string, err: unknown): void {
  console.error(`[nervd] ${scope}:`, err);
}
