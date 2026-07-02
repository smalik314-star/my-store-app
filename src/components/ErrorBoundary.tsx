import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './common/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center">
          <div className="mb-8 rounded-[2.5rem] bg-danger/10 p-8 text-danger shadow-2xl shadow-danger/5 border border-danger/10 animate-bounce">
            <AlertCircle className="h-20 w-20" />
          </div>
          <h1 className="mb-4 text-3xl font-black text-text tracking-tighter uppercase">System Interrupted</h1>
          <p className="mb-10 max-w-md text-sm font-bold text-text/40 leading-relaxed uppercase tracking-widest">
            An unexpected error has occurred. We've captured the diagnostics and are ready to recover.
          </p>
          <Button
            onClick={() => window.location.reload()}
            leftIcon={<RotateCcw className="h-5 w-5" />}
            className="h-14 px-10 font-black uppercase tracking-[0.2em] text-xs"
          >
            Reboot Application
          </Button>
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-12 w-full max-w-4xl overflow-hidden rounded-[2rem] bg-surface p-8 text-left border border-border shadow-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-text/20 mb-4">Diagnostic Trace</p>
              <div className="overflow-auto max-h-[300px] custom-scrollbar">
                <pre className="text-xs text-danger font-mono leading-relaxed whitespace-pre-wrap">
                  {this.state.error?.stack}
                </pre>
              </div>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
