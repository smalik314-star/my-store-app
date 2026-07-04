import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    // Check if it's a chunk/dynamic import loading error
    const errorStr = error?.toString() || '';
    const isChunkError = 
      errorStr.includes('Failed to fetch dynamically imported module') ||
      errorStr.includes('Loading chunk') ||
      errorStr.includes('error loading chunk');
      
    if (isChunkError) {
      const chunkErrorKey = 'last_chunk_error_reload';
      const lastReload = sessionStorage.getItem(chunkErrorKey);
      const now = Date.now();
      
      // Prevent infinite reloading loops by only reloading if we haven't in the last 10 seconds
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem(chunkErrorKey, String(now));
        console.warn('Chunk loading/fetch error detected. Auto-reloading to fetch latest assets...');
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-6 flex justify-center">
              <div className="h-20 w-20 rounded-[2.5rem] bg-red-500/10 flex items-center justify-center text-red-500">
                <AlertCircle size={40} />
              </div>
            </div>
            
            <h1 className="text-3xl font-black text-text tracking-tight uppercase mb-2">
              Something went wrong
            </h1>
            
            <p className="text-sm font-bold text-text/40 mb-8">
              An unexpected error occurred. We've logged the details and our team will look into it.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-8 p-4 bg-red-500/5 rounded-2xl text-left overflow-auto max-h-40 border border-red-500/10">
                <p className="text-xs font-mono text-red-500 font-bold">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                onClick={() => window.location.reload()}
                leftIcon={<RotateCcw size={18} />}
              >
                Try Again
              </Button>
              <Button 
                variant="secondary"
                onClick={this.handleReset}
                leftIcon={<Home size={18} />}
              >
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
