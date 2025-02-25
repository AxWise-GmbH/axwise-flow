import { render, screen, fireEvent } from '@testing-library/react';
import { mockProcessEnv } from '@/test/test-utils';
import Error from '../error';

describe('Error Page', () => {
  const mockError = {
    name: 'Error',
    message: 'Test error',
    stack: 'Test stack trace'
  } as Error;
  
  const mockReset = jest.fn();
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
  });

  afterEach(() => {
    mockProcessEnv(originalNodeEnv || 'test');
  });

  it('renders error page with required elements', () => {
    render(<Error error={mockError} reset={mockReset} />);

    expect(screen.getByText('Something went wrong!')).toBeInTheDocument();
    expect(
      screen.getByText('An unexpected error occurred. Our team has been notified.')
    ).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Go home')).toBeInTheDocument();
  });

  it('shows error message in development mode', () => {
    mockProcessEnv('development');
    render(<Error error={mockError} reset={mockReset} />);

    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('hides error message in production mode', () => {
    mockProcessEnv('production');
    render(<Error error={mockError} reset={mockReset} />);

    expect(screen.queryByText('Test error')).not.toBeInTheDocument();
  });

  it('calls reset function when try again is clicked', () => {
    render(<Error error={mockError} reset={mockReset} />);

    fireEvent.click(screen.getByText('Try again'));
    expect(mockReset).toHaveBeenCalled();
  });

  it('navigates home when go home is clicked', () => {
    // Mock window.location using defineProperty
    const originalLocation = window.location;
    let locationHref = '';

    Object.defineProperty(window, 'location', {
      configurable: true,
      enumerable: true,
      get() {
        return { ...originalLocation, href: locationHref };
      },
      set(value) {
        locationHref = value.href;
      }
    });

    render(<Error error={mockError} reset={mockReset} />);
    
    fireEvent.click(screen.getByText('Go home'));
    expect(locationHref).toBe('/');

    // Restore window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      enumerable: true,
      value: originalLocation,
      writable: true
    });
  });

  it('logs error to console', () => {
    render(<Error error={mockError} reset={mockReset} />);
    expect(console.error).toHaveBeenCalledWith('Global error:', mockError);
  });

  it('renders error icon', () => {
    render(<Error error={mockError} reset={mockReset} />);
    expect(screen.getByText('Something went wrong!')).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeInTheDocument(); // AlertCircle icon
  });

  it('maintains proper button styling', () => {
    render(<Error error={mockError} reset={mockReset} />);
    
    const tryAgainButton = screen.getByText('Try again').closest('button');
    const goHomeButton = screen.getByText('Go home').closest('button');

    expect(tryAgainButton).toHaveClass('variant-default');
    expect(goHomeButton).toHaveClass('variant-outline');
  });
});