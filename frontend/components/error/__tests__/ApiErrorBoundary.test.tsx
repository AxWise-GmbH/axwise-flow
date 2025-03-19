import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApiErrorBoundary from '../ApiErrorBoundary';

// Mock console.error to prevent test output pollution
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

// Test component that throws an error
function ErrorComponent({ shouldThrow = true }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Component rendered successfully</div>;
}

describe('ApiErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ApiErrorBoundary>
        <div>Test Content</div>
      </ApiErrorBoundary>
    );
    
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
  
  it('catches errors and displays error UI', () => {
    render(
      <ApiErrorBoundary context="TestComponent">
        <ErrorComponent />
      </ApiErrorBoundary>
    );
    
    // Check that error UI is displayed
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    expect(screen.getByText('Component: TestComponent')).toBeInTheDocument();
  });
  
  it('renders custom fallback UI if provided', () => {
    const fallback = <div>Custom Error UI</div>;
    
    render(
      <ApiErrorBoundary fallback={fallback}>
        <ErrorComponent />
      </ApiErrorBoundary>
    );
    
    // Check that custom fallback is displayed
    expect(screen.getByText('Custom Error UI')).toBeInTheDocument();
  });
  
  it('calls onError callback when an error occurs', () => {
    const onError = jest.fn();
    
    render(
      <ApiErrorBoundary onError={onError}>
        <ErrorComponent />
      </ApiErrorBoundary>
    );
    
    // Check that onError was called
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toBe('Test error');
  });
  
  it('only catches errors in its children, not in its siblings', () => {
    const { rerender } = render(
      <>
        <ApiErrorBoundary context="Safe">
          <div>Safe Content</div>
        </ApiErrorBoundary>
        <ApiErrorBoundary context="Error">
          <ErrorComponent />
        </ApiErrorBoundary>
      </>
    );
    
    // Check that safe content is still displayed
    expect(screen.getByText('Safe Content')).toBeInTheDocument();
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    
    // Rerender with shouldThrow = false
    rerender(
      <>
        <ApiErrorBoundary context="Safe">
          <div>Safe Content</div>
        </ApiErrorBoundary>
        <ApiErrorBoundary context="Error">
          <ErrorComponent shouldThrow={false} />
        </ApiErrorBoundary>
      </>
    );
    
    // Check that both components are now displayed
    expect(screen.getByText('Safe Content')).toBeInTheDocument();
    expect(screen.getByText('Component rendered successfully')).toBeInTheDocument();
  });
});
