import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 边界内崩溃时的场景说明（如「定时任务编辑器」），帮助定位出错子树 */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 渲染错误兜底边界：捕获子树渲染期异常，以可读面板替代整页白屏，
 * 并提供「重新加载」逃生门（整页 reload，恢复被卸载的 React 根）。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label ?? 'unknown', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <AlertCircleIcon className="size-6 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {this.props.label ? `${this.props.label}渲染出错` : '界面渲染出错'}
          </p>
          <p className="max-w-md break-all font-mono text-xs text-muted-foreground">
            {error.message || String(error)}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="cursor-pointer gap-1.5"
          onPress={() => window.location.reload()}
        >
          <RefreshCwIcon className="size-3.5" />
          重新加载
        </Button>
      </div>
    );
  }
}
