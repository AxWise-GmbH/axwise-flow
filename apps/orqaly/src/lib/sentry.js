/**
 * Sentry initialization — optional error tracking.
 * Set VITE_SENTRY_DSN in .env to enable. Does nothing if DSN is missing.
 */
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN || '';

let initialized = false;

export function initSentry() {
  if (initialized || !DSN) return;
  initialized = true;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE || 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Don't send in development
      if (import.meta.env.DEV) return null;
      return event;
    },
  });
}

export function captureError(error, context) {
  if (!initialized) {
    console.error('[sentry] Not initialized, logging locally:', error);
    return;
  }
  Sentry.captureException(error, { extra: context });
}

export { Sentry };
