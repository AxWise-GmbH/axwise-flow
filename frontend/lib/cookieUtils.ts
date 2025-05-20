/**
 * Cookie utility functions
 */

/**
 * Check if cookies have been accepted by the user
 * @returns boolean indicating if cookies are accepted
 */
export function areCookiesAccepted(): boolean {
  // Only run on client side
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Check for cookie consent in localStorage
  const cookiesAccepted = window.localStorage.getItem('cookiesAccepted');
  
  // Check for cookie consent in cookies
  const cookieValue = document.cookie
    .split('; ')
    .find(row => row.startsWith('axwise-cookie-consent='));
    
  return cookiesAccepted === 'true' || !!cookieValue;
}

/**
 * Set a cookie if consent has been given
 * @param name Cookie name
 * @param value Cookie value
 * @param days Days until expiration
 */
export function setCookieIfConsented(name: string, value: string, days: number): void {
  if (!areCookiesAccepted()) {
    return;
  }
  
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

/**
 * Get a cookie value by name
 * @param name Cookie name
 * @returns Cookie value or empty string if not found
 */
export function getCookie(name: string): string {
  if (typeof window === 'undefined') {
    return '';
  }
  
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || '';
  }
  
  return '';
}
