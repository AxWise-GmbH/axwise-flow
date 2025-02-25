import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  /**
   * Size variant of the spinner
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Optional label to display below the spinner
   */
  label?: string;
  /**
   * Optional className for custom styling
   */
  className?: string;
  /**
   * Optional className for custom styling of the label
   */
  labelClassName?: string;
}

/**
 * A loading spinner component with optional label and size variants
 */
export function LoadingSpinner({
  size = 'md',
  label,
  className,
  labelClassName,
}: LoadingSpinnerProps): JSX.Element {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center', className)}
      data-testid="loading-spinner"
    >
      <Loader2
        className={cn(
          'animate-spin text-primary',
          sizeClasses[size]
        )}
        aria-hidden="true"
      />
      {label && (
        <p
          className={cn(
            'mt-2 text-sm text-muted-foreground',
            labelClassName
          )}
        >
          {label}
        </p>
      )}
      <span className="sr-only">
        {label || 'Loading'}
      </span>
    </div>
  );
}

export default LoadingSpinner;