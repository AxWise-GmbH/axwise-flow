/**
 * Error Utilities
 * 
 * This file contains utility functions for error handling throughout the application.
 */

/**
 * Standard error structure for tracking errors across the application
 */
export interface AppError {
  timestamp: number;
  message: string;
  stack?: string;
  code?: string;
  context?: string;
}

/**
 * Creates a standardized error object from various error types
 * @param error The error to format
 * @param context Optional context information about where the error occurred
 * @returns A standardized AppError object
 */
export function createAppError(error: unknown, context?: string): AppError {
  const timestamp = Date.now();
  
  // Handle Error objects
  if (error instanceof Error) {
    return {
      timestamp,
      message: error.message,
      stack: error.stack,
      context,
    };
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return {
      timestamp,
      message: error,
      context,
    };
  }
  
  // Handle API response errors
  if (error && typeof error === 'object' && 'status' in error && 'data' in error) {
    const apiError = error as { status: number; data: any };
    return {
      timestamp,
      message: apiError.data?.message || `API Error: ${apiError.status}`,
      code: apiError.status.toString(),
      context,
    };
  }
  
  // Handle unknown errors
  return {
    timestamp,
    message: 'An unknown error occurred',
    context,
  };
}

/**
 * Formats an error message for display to the user
 * @param error The error to format
 * @returns A user-friendly error message
 */
export function formatErrorMessage(error: AppError | Error | string | unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (isAppError(error)) {
    return error.message;
  }
  
  return 'An unknown error occurred';
}

/**
 * Type guard to check if an object is an AppError
 */
export function isAppError(obj: unknown): obj is AppError {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'timestamp' in obj &&
    'message' in obj
  );
}

/**
 * Logs an error to the console with a standardized format
 * @param error The error to log
 * @param context Optional context information about where the error occurred
 */
export function logError(error: unknown, context?: string): void {
  const appError = createAppError(error, context);
  console.error(`[${new Date(appError.timestamp).toISOString()}] ${appError.context ? `[${appError.context}] ` : ''}Error: ${appError.message}`);
  
  if (appError.stack) {
    console.error(appError.stack);
  }
}
