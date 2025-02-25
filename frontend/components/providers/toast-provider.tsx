'use client';

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type ReactNode,
} from 'react';
import { Toast } from '../toast';
import { nanoid } from 'nanoid';

export type ToastVariant = 'success' | 'error' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

interface ToastOptions {
  variant?: ToastVariant;
  position?: ToastPosition;
  duration?: number;
}

interface ToastData extends ToastOptions {
  id: string;
  message: string;
}

type ToastAction =
  | { type: 'ADD_TOAST'; payload: ToastData }
  | { type: 'REMOVE_TOAST'; payload: string };

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function toastReducer(state: ToastData[], action: ToastAction): ToastData[] {
  switch (action.type) {
    case 'ADD_TOAST':
      return [...state, action.payload];
    case 'REMOVE_TOAST':
      return state.filter(toast => toast.id !== action.payload);
    default:
      return state;
  }
}

interface ToastProviderProps {
  children: ReactNode;
  defaultPosition?: ToastPosition;
  defaultDuration?: number;
}

/**
 * Provider component for managing toast notifications
 */
export function ToastProvider({
  children,
  defaultPosition = 'top-right',
  defaultDuration = 5000,
}: ToastProviderProps): JSX.Element {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = nanoid();
      dispatch({
        type: 'ADD_TOAST',
        payload: {
          id,
          message,
          position: options?.position || defaultPosition,
          duration: options?.duration ?? defaultDuration,
          variant: options?.variant || 'info',
        },
      });
    },
    [defaultPosition, defaultDuration]
  );

  const removeToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          position={toast.position}
          duration={toast.duration}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </ToastContext.Provider>
  );
}

/**
 * Hook for using toast notifications
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}