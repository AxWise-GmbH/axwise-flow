/**
 * ApiErrorBoundary Component
 * 
 * This component provides a standardized error boundary for API-related errors.
 * It catches errors that occur during rendering of its children and displays
 * a user-friendly error message.
 * 
 * Usage:
 * <ApiErrorBoundary context="DashboardVisualization">
 *   <ComponentThatMightError />
 * </ApiErrorBoundary>
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Bug } from 'lucide-react';

interface State {
  hasError: boolean;
  error?: Error;
}

interface Props {
  children: ReactNode;
  context?: string;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export class ApiErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`API Error in ${this.props.context || 'component'}:`, error, errorInfo);
    
    // Call onError if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // Return custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Alert variant="destructive" className="m-4">
          <Bug className="h-4 w-4" />
          <AlertTitle>An error occurred</AlertTitle>
          <AlertDescription>
            {this.state.error?.message || 'Failed to render component'}
            {this.props.context && (
              <div className="mt-2 text-xs">Component: {this.props.context}</div>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}

export default ApiErrorBoundary;
