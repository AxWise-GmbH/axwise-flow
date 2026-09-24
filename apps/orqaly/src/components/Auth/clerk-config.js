// Explicit build inputs, never window.location, choose the identity environment.
// Keep this module browser-safe so the container build can run the same validation.
export function clerkBrowserOptionsFromEnvironment(environment = {}) {
  const publishableKey = environment.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required for the clean workflow v2 app');
  }
  const target = environment.VITE_CLERK_ENVIRONMENT;
  if (target) {
    if (!['preview', 'production'].includes(target)) {
      throw new Error('VITE_CLERK_ENVIRONMENT must be preview or production');
    }
    const prefix = target === 'production' ? 'pk_live_' : 'pk_test_';
    if (!publishableKey.startsWith(prefix)) {
      throw new Error(`VITE_CLERK_PUBLISHABLE_KEY must use ${prefix} for ${target}`);
    }
    if (environment.VITE_ORQALY_API_ENVIRONMENT !== target) {
      throw new Error('VITE_ORQALY_API_ENVIRONMENT must match VITE_CLERK_ENVIRONMENT');
    }
    const apiUrl = httpsUrl(environment.VITE_ORQALY_API_URL, 'VITE_ORQALY_API_URL');
    if (apiUrl.origin !== environment.VITE_ORQALY_API_URL) {
      throw new Error('VITE_ORQALY_API_URL must be an exact HTTPS origin');
    }
    if (target === 'production'
      && apiUrl.origin === 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app') {
      throw new Error('Production Clerk cannot use the existing preview API');
    }
  }

  return { publishableKey };
}

function httpsUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { /* Report the variable, never its contents. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error(`${name} must be an absolute HTTPS URL without credentials or fragment`);
  }
  return url;
}
