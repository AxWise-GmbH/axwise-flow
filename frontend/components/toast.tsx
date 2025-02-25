'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const toastVariants = cva(
  'fixed flex items-center gap-2 p-4 rounded-lg shadow-lg transition-all duration-300 ease-in-out',
  {
    variants: {
      variant: {
        success: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100',
        error: 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100',
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100',
      },
      position: {
        'top-right': 'top-4 right-4',
        'top-left': 'top-4 left-4',
        'bottom-right': 'bottom-4 right-4',
        'bottom-left': 'bottom-4 left-4',
      },
    },
    defaultVariants: {
      variant: 'info',
      position: 'top-right',
    },
  }
);

interface ToastProps extends VariantProps<typeof toastVariants> {
  /**
   * Message to display in the toast
   */
  message: string;
  /**
   * Optional duration in milliseconds (default: 5000)
   */
  duration?: number;
  /**
   * Optional callback when toast is dismissed
   */
  onDismiss?: () => void;
  /**
   * Optional className for custom styling
   */
  className?: string;
}

/**
 * Toast notification component for displaying temporary messages
 */
export function Toast({
  message,
  variant = 'info',
  position = 'top-right',
  duration = 5000,
  onDismiss,
  className,
}: ToastProps): JSX.Element | null {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onDismiss?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onDismiss]);

  if (!isVisible) return null;

  const icons = {
    success: <CheckCircle className="h-5 w-5" />,
    error: <AlertCircle className="h-5 w-5" />,
    info: <Info className="h-5 w-5" />,
  };

  return (
    <div
      role="alert"
      className={cn(toastVariants({ variant, position }), className)}
      data-testid="toast"
    >
      {icons[variant || 'info']}
      <p className="flex-1">{message}</p>
      <button
        onClick={() => {
          setIsVisible(false);
          onDismiss?.();
        }}
        className="text-current opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default Toast;