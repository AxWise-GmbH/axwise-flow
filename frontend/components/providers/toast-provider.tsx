'use client';

// Compatibility shim that bridges the legacy toast-provider API to ShadCN's toast
import type { ReactNode } from 'react';
import { useToast as useShadToast, toast as shadToast } from '@/components/ui/use-toast';

export type ToastVariant = 'success' | 'error' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

interface ToastOptions {
  variant?: ToastVariant;
  position?: ToastPosition; // ignored in shim
  duration?: number; // ignored in shim (use Toaster default)
}

interface LegacyToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
  // Keep parity with shadcn in case callers check these
  toast?: typeof shadToast;
  dismiss?: (toastId?: string) => void;
}

interface ToastProviderProps {
  children: ReactNode;
  defaultPosition?: ToastPosition; // ignored
  defaultDuration?: number; // ignored
}

// Legacy Provider: no-op wrapper since <Toaster /> is already rendered in app/layout.tsx
export function ToastProvider({ children }: ToastProviderProps): JSX.Element {
  return <>{children}</>;
}

// Legacy hook that exposes showToast using ShadCN under the hood
export function useToast(): LegacyToastContextValue {
  const { toast, dismiss } = useShadToast();

  const showToast = (message: string, options?: ToastOptions): void => {
    const isError = options?.variant === 'error';
    toast({ description: message, variant: isError ? 'destructive' : 'default' });
  };

  return { showToast, toast: shadToast, dismiss };
}