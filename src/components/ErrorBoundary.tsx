'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-decidarr-dark p-4">
          <div className="max-w-md w-full bg-decidarr-secondary rounded-xl p-6 text-center">
            <div className="text-5xl mb-4">😵</div>
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-gray-400 mb-6">
              The application encountered an unexpected error. Try refreshing the page or click
              the button below to recover.
            </p>

            {this.state.error && (
              <div className="bg-decidarr-dark rounded-lg p-3 mb-4 text-left">
                <p className="text-xs text-decidarr-error font-mono">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-decidarr-primary text-decidarr-dark
                         font-semibold rounded-lg hover:bg-decidarr-accent
                         transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-decidarr-dark text-white
                         font-semibold rounded-lg hover:bg-white/10
                         transition-colors border border-gray-700"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
