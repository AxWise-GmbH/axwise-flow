import { render, screen } from '@testing-library/react';
import Loading from '../loading';

// Mock the loading spinner component
jest.mock('@/components/loading-spinner', () => ({
  LoadingSpinner: ({
    label,
    size,
    className,
  }: {
    label?: string;
    size?: string;
    className?: string;
  }) => (
    <div
      data-testid="mock-spinner"
      data-size={size}
      data-label={label}
      className={className}
    >
      {label}
    </div>
  ),
}));

describe('Loading Page', () => {
  it('renders loading spinner with correct props', () => {
    render(<Loading />);
    
    const spinner = screen.getByTestId('mock-spinner');
    expect(spinner).toHaveAttribute('data-size', 'lg');
    expect(spinner).toHaveAttribute('data-label', 'Loading...');
    expect(spinner).toHaveClass('mx-auto');
  });

  it('displays loading message', () => {
    render(<Loading />);
    expect(screen.getByText('Processing your request...')).toBeInTheDocument();
  });

  it('applies animation to loading message', () => {
    render(<Loading />);
    const message = screen.getByText('Processing your request...');
    expect(message).toHaveClass('animate-pulse');
  });

  it('uses muted text color for message', () => {
    render(<Loading />);
    const message = screen.getByText('Processing your request...');
    expect(message).toHaveClass('text-muted-foreground');
  });

  it('centers content vertically and horizontally', () => {
    const { container } = render(<Loading />);
    const wrapper = container.firstChild as HTMLElement;
    
    expect(wrapper).toHaveClass(
      'min-h-screen',
      'flex',
      'items-center',
      'justify-center'
    );
  });

  it('has proper padding', () => {
    const { container } = render(<Loading />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('p-4');
  });

  it('maintains text alignment', () => {
    const { container } = render(<Loading />);
    const contentWrapper = container.querySelector('.text-center');
    expect(contentWrapper).toBeInTheDocument();
  });

  it('maintains proper spacing between elements', () => {
    const { container } = render(<Loading />);
    const contentWrapper = container.querySelector('.space-y-4');
    expect(contentWrapper).toBeInTheDocument();
  });
});