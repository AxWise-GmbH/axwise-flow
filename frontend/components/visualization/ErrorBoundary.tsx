/**
 * Custom ErrorBoundary Component
 * 
 * A simple error boundary component that catches errors in its children
 * and displays a fallback UI.
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CustomErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to console
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
    
    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render the fallback UI if there's an error
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="p-4 border border-red-300 bg-red-50 rounded-md">
          <h3 className="text-lg font-semibold text-red-700">Something went wrong</h3>
          <p className="text-red-600">{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-md"
          >
            Try again
          </button>
        </div>
      );
    }

    // If there's no error, render the children
    return this.props.children;
  }
}

export default CustomErrorBoundary;
