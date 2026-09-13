import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import './index.css';
import App from '@orqaly-app-entry';
import { initSentry } from './lib/sentry';

initSentry();

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required for the clean workflow v2 app');
}

// Handle failed dynamic imports (e.g. stale cache after deploy).
// Do NOT auto-reload: repeated reloads can trap mobile browsers in loops.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event?.preventDefault?.();
    // Keep the app stable and let user trigger manual refresh if needed.
    console.error('Chunk preload failed; auto-reload disabled to prevent loop.');
  });
}

// Register the Web Push service worker so Web Push notifications (Phase 1.9)
// can wake the app even when no tab is open. Silent on failure — the rest
// of the app keeps working even without push.
if (
  import.meta.env.MODE !== 'gcp-launch' &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] register failed:', err.message);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInFallbackRedirectUrl="/home"
      signUpFallbackRedirectUrl="/home"
    >
      <App />
    </ClerkProvider>
  </StrictMode>
);
