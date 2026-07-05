'use client';

import { useState, useEffect } from 'react';
import CookieConsent, { Cookies } from 'react-cookie-consent';
import { useTheme } from 'next-themes';

/**
 * Cookie consent banner component
 * Displays a GDPR-compliant cookie consent banner at the bottom of the page
 */
export function CookieConsentBanner(): JSX.Element | null {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Only render client-side to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server
  if (!mounted) return null;

  // Determine colors based on theme
  const isDarkTheme = theme === 'dark';
  
  return (
    <CookieConsent
      location="bottom"
      buttonText="Accept"
      cookieName="axwise-cookie-consent"
      style={{
        background: isDarkTheme ? '#1f2937' : '#f9fafb',
        color: isDarkTheme ? '#f9fafb' : '#1f2937',
        borderTop: `1px solid ${isDarkTheme ? '#374151' : '#e5e7eb'}`,
        zIndex: 9999,
      }}
      buttonStyle={{
        background: '#3b82f6',
        color: 'white',
        fontSize: '14px',
        borderRadius: '4px',
        padding: '8px 16px',
      }}
      declineButtonStyle={{
        background: 'transparent',
        border: '1px solid #3b82f6',
        color: isDarkTheme ? '#f9fafb' : '#1f2937',
        fontSize: '14px',
        borderRadius: '4px',
        padding: '8px 16px',
        marginLeft: '10px',
      }}
      declineButtonText="Decline"
      enableDeclineButton
      expires={365}
      onAccept={() => {
        // Enable analytics or other cookie-dependent features
        window.localStorage.setItem('cookiesAccepted', 'true');
      }}
      onDecline={() => {
        // Disable analytics or other cookie-dependent features
        window.localStorage.setItem('cookiesAccepted', 'false');
      }}
    >
      <div className="text-sm">
        <p>
          This website uses cookies to enhance your experience. By continuing to use this site, you agree to our use of cookies.{' '}
          <a 
            href="/privacy-policy" 
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more
          </a>
        </p>
      </div>
    </CookieConsent>
  );
}

export default CookieConsentBanner;
