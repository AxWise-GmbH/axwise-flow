import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error', error, errorInfo);
    this.setState({ errorInfo });
    
    // Log to your analytics or monitoring service
    // logErrorToService(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return this.props.fallback || (
        <div className="error-boundary p-6 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-lg m-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-rose-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-rose-800 dark:text-rose-300">Something went wrong</h3>
              <div className="mt-2">
                <p className="text-sm text-rose-700 dark:text-rose-400">
                  {this.state.error?.toString() || 'An unexpected error occurred'}
                </p>
                
                {/* Technical Details (expandable) */}
                <details className="mt-3">
                  <summary className="text-sm font-medium cursor-pointer text-rose-600 dark:text-rose-400 hover:underline">
                    Technical Details
                  </summary>
                  <div className="mt-2 p-2 bg-rose-100 dark:bg-rose-900 rounded text-sm font-mono text-rose-800 dark:text-rose-300 overflow-auto max-h-48">
                    <p className="whitespace-pre-wrap break-words">
                      {this.state.error?.stack || 'No stack trace available'}
                    </p>
                    {this.state.errorInfo && (
                      <p className="mt-2 whitespace-pre-wrap break-words">
                        {this.state.errorInfo.componentStack || 'No component stack available'}
                      </p>
                    )}
                  </div>
                </details>
                
                {/* Action Buttons */}
                <div className="mt-4 flex space-x-3">
                  <button
                    onClick={this.handleReset}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md"
                  >
                    <svg className="mr-1.5 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Try Again
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-md"
                  >
                    <svg className="mr-1.5 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reload Page
                  </button>
                </div>
                
                {/* Common Issues and Solutions */}
                <div className="mt-6 p-3 bg-white dark:bg-gray-800 rounded border border-rose-200 dark:border-rose-800">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Common Solutions:</h4>
                  <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 space-y-1 list-disc pl-5">
                    <li>Check your API key and make sure it has the correct permissions</li>
                    <li>Verify your internet connection</li>
                    <li>Try refreshing the page or clearing your browser cache</li>
                    <li>If the problem persists, try using a different browser</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 