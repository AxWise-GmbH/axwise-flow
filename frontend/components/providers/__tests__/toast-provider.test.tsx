import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../toast-provider';

// Test component that uses the toast hook
const TestComponent = () => {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast('Test message', { variant: 'success' })}>
      Show Toast
    </button>
  );
};

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('provides toast context to children', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const button = screen.getByText('Show Toast');
    await userEvent.click(button);

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('removes toast after duration', async () => {
    render(
      <ToastProvider defaultDuration={1000}>
        <TestComponent />
      </ToastProvider>
    );

    const button = screen.getByText('Show Toast');
    await userEvent.click(button);

    expect(screen.getByText('Test message')).toBeInTheDocument();

    // Fast-forward time
    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.queryByText('Test message')).not.toBeInTheDocument();
    });
  });

  it('handles multiple toasts', async () => {
    const MultipleToastTest = () => {
      const { showToast } = useToast();
      return (
        <>
          <button
            onClick={() => showToast('First toast', { variant: 'success' })}
          >
            Show First
          </button>
          <button
            onClick={() => showToast('Second toast', { variant: 'error' })}
          >
            Show Second
          </button>
        </>
      );
    };

    render(
      <ToastProvider>
        <MultipleToastTest />
      </ToastProvider>
    );

    await userEvent.click(screen.getByText('Show First'));
    await userEvent.click(screen.getByText('Show Second'));

    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
  });

  it('respects custom positions', async () => {
    const PositionTest = () => {
      const { showToast } = useToast();
      return (
        <button
          onClick={() =>
            showToast('Position test', { position: 'bottom-left' })
          }
        >
          Show Toast
        </button>
      );
    };

    render(
      <ToastProvider>
        <PositionTest />
      </ToastProvider>
    );

    await userEvent.click(screen.getByText('Show Toast'));
    
    const toast = screen.getByText('Position test');
    const toastContainer = toast.parentElement;
    expect(toastContainer).toHaveClass('bottom-4', 'left-4');
  });

  it('throws error when useToast is used outside provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useToast must be used within a ToastProvider');
    
    consoleError.mockRestore();
  });

  it('allows manual dismissal of toasts', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    await userEvent.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Test message')).toBeInTheDocument();

    const dismissButton = screen.getByLabelText('Dismiss');
    await userEvent.click(dismissButton);

    expect(screen.queryByText('Test message')).not.toBeInTheDocument();
  });
});