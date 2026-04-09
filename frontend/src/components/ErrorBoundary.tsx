import { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex items-center justify-center min-h-[300px] p-8">
        <div className="max-w-md w-full rounded-2xl bg-gradient-to-br from-primary-800 to-primary-900 border border-red-500/30 p-8 text-center shadow-xl">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-5">
            <AlertTriangle size={32} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-sm text-neutral-400 mb-1">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <p className="text-xs text-neutral-600 mb-6 font-mono truncate">
            {this.state.error?.name}
          </p>
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary-700 hover:bg-primary-600 border border-primary-600/50 text-sm text-white transition-all"
          >
            <RefreshCw size={15} />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
