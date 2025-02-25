import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../loading-spinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    const label = 'Processing data...';
    render(<LoadingSpinner label={label} />);
    
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('applies size classes correctly', () => {
    const { rerender } = render(<LoadingSpinner size="sm" />);
    const getSpinnerIcon = () => screen.getByTestId('loading-spinner').querySelector('svg');
    
    // Small size
    expect(getSpinnerIcon()).toHaveClass('h-4', 'w-4');
    
    // Medium size (default)
    rerender(<LoadingSpinner size="md" />);
    expect(getSpinnerIcon()).toHaveClass('h-8', 'w-8');
    
    // Large size
    rerender(<LoadingSpinner size="lg" />);
    expect(getSpinnerIcon()).toHaveClass('h-12', 'w-12');
  });

  it('applies custom classes', () => {
    const className = 'test-class';
    const labelClassName = 'label-class';
    render(
      <LoadingSpinner
        className={className}
        labelClassName={labelClassName}
        label="Test"
      />
    );
    
    expect(screen.getByTestId('loading-spinner')).toHaveClass(className);
    expect(screen.getByText('Test')).toHaveClass(labelClassName);
  });

  it('has proper accessibility attributes', () => {
    render(<LoadingSpinner label="Loading data" />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    
    // Icon should be aria-hidden
    const icon = spinner.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    
    // Should have visually hidden text
    expect(screen.getByText('Loading data', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('maintains proper animation classes', () => {
    render(<LoadingSpinner />);
    
    const icon = screen.getByTestId('loading-spinner').querySelector('svg');
    expect(icon).toHaveClass('animate-spin');
  });
});