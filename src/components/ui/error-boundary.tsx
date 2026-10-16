import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center text-xs text-destructive">
          <AlertCircleIcon className="size-5" />
          <p className="font-medium">{this.props.fallbackTitle ?? '渲染发生错误'}</p>
          <p className="text-[11px] text-muted-foreground">{this.state.error?.message || '未知错误'}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 h-7 text-xs"
            onClick={this.handleReset}
          >
            <RefreshCwIcon className="mr-1 size-3" />
            重试
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
