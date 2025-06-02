/**
 * Research Error Handling Utilities
 * Provides robust error handling and retry logic for frontend research operations.
 */

import { RESEARCH_CONFIG } from '@/lib/config/research-config';

export class ResearchError extends Error {
  constructor(
    message: string,
    public errorCode: string = 'research_error',
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'ResearchError';
  }
}

export class NetworkError extends ResearchError {
  constructor(message?: string) {
    super(
      message || RESEARCH_CONFIG.errorMessages.networkError,
      'network_error',
      5
    );
  }
}

export class ValidationError extends ResearchError {
  constructor(message?: string) {
    super(
      message || RESEARCH_CONFIG.errorMessages.validationError,
      'validation_error'
    );
  }
}

export class RateLimitError extends ResearchError {
  constructor(message?: string, retryAfter: number = 60) {
    super(
      message || RESEARCH_CONFIG.errorMessages.rateLimited,
      'rate_limit_error',
      retryAfter
    );
  }
}

export class ServiceUnavailableError extends ResearchError {
  constructor(message?: string) {
    super(
      message || RESEARCH_CONFIG.errorMessages.serviceUnavailable,
      'service_unavailable',
      30
    );
  }
}

export class SessionExpiredError extends ResearchError {
  constructor(message?: string) {
    super(
      message || RESEARCH_CONFIG.errorMessages.sessionExpired,
      'session_expired'
    );
  }
}

export class ErrorHandler {
  /**
   * Handle API errors and return appropriate user-friendly messages
   */
  static handleApiError(error: any): { message: string; errorCode: string; retryAfter?: number } {
    console.error('API Error:', error);

    // Network errors
    if (!navigator.onLine) {
      return {
        message: 'You appear to be offline. Please check your internet connection.',
        errorCode: 'offline'
      };
    }

    // CSP errors
    if (error instanceof TypeError && error.message.includes('Content Security Policy')) {
      return {
        message: 'Connection blocked by security policy. Please ensure the backend is running on the correct port and try refreshing the page.',
        errorCode: 'csp_error',
        retryAfter: 0
      };
    }

    // Fetch errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        message: RESEARCH_CONFIG.errorMessages.networkError,
        errorCode: 'network_error',
        retryAfter: 5
      };
    }

    // HTTP errors
    if (error.status) {
      switch (error.status) {
        case 400:
          return {
            message: RESEARCH_CONFIG.errorMessages.validationError,
            errorCode: 'validation_error'
          };
        case 429:
          return {
            message: RESEARCH_CONFIG.errorMessages.rateLimited,
            errorCode: 'rate_limit_error',
            retryAfter: 60
          };
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            message: RESEARCH_CONFIG.errorMessages.serviceUnavailable,
            errorCode: 'service_unavailable',
            retryAfter: 30
          };
        default:
          return {
            message: RESEARCH_CONFIG.errorMessages.networkError,
            errorCode: 'api_error',
            retryAfter: 5
          };
      }
    }

    // Custom research errors
    if (error instanceof ResearchError) {
      return {
        message: error.message,
        errorCode: error.errorCode,
        retryAfter: error.retryAfter
      };
    }

    // Generic error
    return {
      message: RESEARCH_CONFIG.errorMessages.networkError,
      errorCode: 'unknown_error',
      retryAfter: 5
    };
  }

  /**
   * Get fallback response based on conversation stage
   */
  static getFallbackResponse(stage: string = 'general'): string {
    const fallbackKey = stage as keyof typeof RESEARCH_CONFIG.fallbackResponses;
    return RESEARCH_CONFIG.fallbackResponses[fallbackKey] || RESEARCH_CONFIG.fallbackResponses.general;
  }
}

/**
 * Retry wrapper for async functions
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = RESEARCH_CONFIG.maxRetries,
  delayMs: number = RESEARCH_CONFIG.retryDelayMs,
  exponentialBackoff: boolean = true
): Promise<T> {
  let lastError: Error;
  let currentDelay = delayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors, client errors, or CSP errors
      if (error instanceof ValidationError ||
          (error as any)?.status >= 400 && (error as any)?.status < 500 ||
          (error instanceof TypeError && error.message.includes('Content Security Policy'))) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw lastError;
      }

      console.warn(`Attempt ${attempt + 1} failed, retrying in ${currentDelay}ms:`, error);

      await new Promise(resolve => setTimeout(resolve, currentDelay));

      if (exponentialBackoff) {
        currentDelay = Math.min(currentDelay * 2, 30000); // Max 30 seconds
      }
    }
  }

  throw lastError!;
}

/**
 * Timeout wrapper for async functions
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = RESEARCH_CONFIG.requestTimeoutMs
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new NetworkError('Request timed out')), timeoutMs)
    )
  ]);
}

/**
 * Safe execution wrapper that catches errors and returns fallback values
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  fallbackValue: T,
  onError?: (error: Error) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('Safe execution failed:', error);
    if (onError) {
      onError(error as Error);
    }
    return fallbackValue;
  }
}

/**
 * Debounce function for user input
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), waitMs);
  };
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Don't retry validation errors or client errors
  if (error instanceof ValidationError) return false;
  if (error?.status >= 400 && error?.status < 500) return false;

  // Don't retry CSP errors
  if (error instanceof TypeError && error.message.includes('Content Security Policy')) return false;

  // Retry network errors, server errors, and timeouts
  return true;
}

/**
 * Format error for user display
 */
export function formatErrorForUser(error: any): string {
  const handled = ErrorHandler.handleApiError(error);
  return handled.message;
}

/**
 * Log error for debugging (only in development)
 */
export function logError(error: any, context?: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`Research Error${context ? ` (${context})` : ''}:`, error);
  }
}
