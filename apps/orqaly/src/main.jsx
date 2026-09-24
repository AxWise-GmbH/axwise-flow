import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
// Inter is served from our own server, not Google Fonts (no visitor data goes to Google).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './index.css';
import App from '@orqaly-app-entry';
import { initSentry } from './lib/sentry';
import { clerkBrowserOptionsFromEnvironment } from './components/Auth/clerk-config';

initSentry();

const clerkOptions = clerkBrowserOptionsFromEnvironment(import.meta.env);
// Branding is local to this client; identity is selected explicitly by build
// configuration, independent of the deployment hostname or display name.
const accountLocalization = import.meta.env.MODE === 'gcp-launch' ? {
  signIn: { start: {
    title: 'Sign in to Orqanix',
    titleCombined: 'Continue to Orqanix',
    subtitle: 'Welcome back. Sign in to continue.',
    subtitleCombined: 'Sign in or create an account to continue.',
  } },
  signUp: { start: {
    title: 'Create your Orqanix account',
    titleCombined: 'Continue to Orqanix',
    subtitle: 'Your account connects your desktop to managed model services.',
    subtitleCombined: 'Sign in or create an account to continue.',
  } },
} : undefined;

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

const clerkProps = {
  ...clerkOptions,
  localization: accountLocalization,
  signInFallbackRedirectUrl: import.meta.env.MODE === 'gcp-launch' ? '/account' : '/home',
  signUpFallbackRedirectUrl: import.meta.env.MODE === 'gcp-launch' ? '/account' : '/home',
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {import.meta.env.MODE === 'gcp-launch' ? (
      // The GCP app starts Clerk itself, only on the pages that need sign-in (GcpApp.jsx).
      <App clerkProps={clerkProps} />
    ) : (
      <ClerkProvider {...clerkProps}>
        <App />
      </ClerkProvider>
    )}
  </StrictMode>
);
