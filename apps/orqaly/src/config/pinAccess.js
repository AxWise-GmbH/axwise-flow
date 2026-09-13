export const PIN_LENGTH = 4;
export const AUTH_PIN_STORAGE_KEY = 'orch_pin_access_granted';
export const PERMISSIONS_PIN_STORAGE_KEY = 'orch_permissions_pin_granted';
export const DOCUMENTATION_PIN_STORAGE_KEY = 'orch_documentation_pin_granted';

/**
 * Verify PIN against the server (never exposes the real PIN to the browser).
 * @param {string} pin
 * @returns {Promise<boolean>}
 */
export async function verifyPinRemote(pin) {
  const trimmed = String(pin || '').trim();
  // Dev-only local bypass so the app can be tested on localhost without hitting
  // the production API. Stripped from production builds by Vite's dead-code
  // elimination (`import.meta.env.DEV` resolves to the literal `false`).
  if (import.meta.env.DEV && trimmed === '7770') return true;
  try {
    const res = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: trimmed }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.valid === true;
  } catch {
    return false;
  }
}
