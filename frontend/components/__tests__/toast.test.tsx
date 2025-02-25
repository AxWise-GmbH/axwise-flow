import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from '../toast';

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders with message', () => {
    render(<Toast message="Test message" />);
    
    expect(screen.getByText('Test message')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('applies correct variant styles', () => {
    const { rerender } = render(<Toast message="Test" variant="success" />);
    expect(screen.getByRole('alert')).toHaveClass('bg-green-100');

    rerender(<Toast message="Test" variant="error" />);
    expect(screen.getByRole('alert')).toHaveClass('bg-red-100');

    rerender(<Toast message="Test" variant="info" />);
    expect(screen.getByRole('alert')).toHaveClass('bg-blue-100');
  });

  it('applies correct position classes', () => {
    const { rerender } = render(<Toast message="Test" position="top-right" />);
    expect(screen.getByRole('alert')).toHaveClass('top-4', 'right-4');

    rerender(<Toast message="Test" position="top-left" />);
    expect(screen.getByRole('alert')).toHaveClass('top-4', 'left-4');

    rerender(<Toast message="Test" position="bottom-right" />);
    expect(screen.getByRole('alert')).toHaveClass('bottom-4', 'right-4');

    rerender(<Toast message="Test" position="bottom-left" />);
    expect(screen.getByRole('alert')).toHaveClass('bottom-4', 'left-4');
  });

  it('auto-dismisses after duration', async () => {
    const onDismiss = jest.fn();
    render(<Toast message="Test" duration={1000} onDismiss={onDismiss} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Fast-forward time
    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  it('can be dismissed manually', async () => {
    const onDismiss = jest.fn();
    render(<Toast message="Test" onDismiss={onDismiss} />);

    const dismissButton = screen.getByLabelText('Dismiss');
    await userEvent.click(dismissButton);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('displays correct icon based on variant', () => {
    const { rerender } = render(<Toast message="Test" variant="success" />);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();

    rerender(<Toast message="Test" variant="error" />);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();

    rerender(<Toast message="Test" variant="info" />);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const customClass = 'custom-test-class';
    render(<Toast message="Test" className={customClass} />);
    
    expect(screen.getByRole('alert')).toHaveClass(customClass);
  });

  it('does not auto-dismiss with duration of 0', async () => {
    render(<Toast message="Test" duration={0} />);

    // Fast-forward time significantly
    jest.advanceTimersByTime(10000);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});