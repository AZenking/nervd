import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 边界内崩溃时的场景说明（如「定时任务编辑器」），帮助定位出错子树 */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack?: string | null;
}

/**
 * 渲染错误兜底边界：捕获子树渲染期异常，以可读面板替代整页白屏，
 * 并提供「重新加载」逃生门（整页 reload，恢复被卸载的 React 根）。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label ?? 'unknown', error, info.componentStack);
    try {
      localStorage.setItem(
        'nervd_last_error_details',
        JSON.stringify({
          time: new Date().toISOString(),
          label: this.props.label,
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
        })
      );
    } catch {
      // ignore
    }
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return (
      <Alert status="danger" className="min-h-40 flex-col items-center justify-center text-center">
        <Alert.Indicator />
        <Alert.Content className="items-center">
          <Alert.Title>
            {this.props.label ? `${this.props.label}渲染出错` : '界面渲染出错'}
          </Alert.Title>
          <Alert.Description className="max-w-md break-words font-mono text-xs">
            {error.message || String(error)}
          </Alert.Description>
          {componentStack && (
            <pre className="max-h-60 max-w-2xl overflow-auto rounded bg-surface-secondary p-2 text-left font-mono text-[11px] text-foreground/80">
              {componentStack}
            </pre>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onPress={() => window.location.reload()}
          >
            <RefreshCwIcon className="size-3.5" />
            重新加载
          </Button>
        </Alert.Content>
      </Alert>
    );
  }
}
