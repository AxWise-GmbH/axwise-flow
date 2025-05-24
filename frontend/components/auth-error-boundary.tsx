'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AuthErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface AuthErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export class AuthErrorBoundary extends Component<AuthErrorBoundaryProps, AuthErrorBoundaryState> {
  constructor(props: AuthErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): AuthErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Authentication error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h1 className="text-2xl font-bold">Authentication Error</h1>
              <p className="text-sm text-muted-foreground">
                We encountered an issue while loading the authentication system.
                This might be a temporary problem.
              </p>
              {this.state.error && (
                <details className="text-xs text-muted-foreground max-w-full">
                  <summary className="cursor-pointer hover:text-foreground">
                    Technical details
                  </summary>
                  <pre className="mt-2 p-2 bg-muted rounded text-left overflow-auto">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
            <div className="space-y-4">
              <Button onClick={this.handleRetry} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.location.href = '/'}
                className="w-full"
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

export default AuthErrorBoundary;
