import { Box } from '@mui/material';

/**
 * YubiKey-style icon: USB security key with rectangular body and gold contact.
 * Matches the sign-in methods screenshot (use currentColor for button text color).
 */
export function YubiKeyIcon({ sx = {}, size = 24 }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        ...sx,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {/* USB key body - rectangular dongle */}
        <rect x="4" y="7" width="10" height="8" rx="1" fill="currentColor" opacity={0.95} />
        {/* Connector / neck */}
        <rect x="14" y="8.5" width="3" height="5" fill="currentColor" opacity={0.95} />
        {/* Gold circular contact at tip */}
        <circle cx="18.5" cy="11" r="2.8" fill="currentColor" opacity={0.9} />
        <circle cx="18.5" cy="11" r="1.2" fill="currentColor" opacity={0.4} />
      </svg>
    </Box>
  );
}

/**
 * Google 2FA icon: circular padlock with stylized G (Google-style).
 * Matches the sign-in methods screenshot.
 */
export function Google2FAIcon({ sx = {}, size = 24 }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        ...sx,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {/* Outer circle (lock frame) */}
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        {/* Shackle */}
        <path d="M8.5 10V8a3.5 3.5 0 117 0v2" stroke="currentColor" strokeWidth="1.4" fill="none" />
        {/* Lock body */}
        <path
          d="M8 11.2h8c.44 0 .8.36.8.8v4c0 .44-.36.8-.8.8H8.8c-.44 0-.8-.36-.8-.8v-4c0-.44.36-.8.8-.8H8z"
          fill="currentColor"
          opacity={0.9}
        />
        {/* Stylized G (Google G) */}
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          fill="currentColor"
          fontSize="7"
          fontWeight="600"
          fontFamily="'Google Sans', 'Roboto', Arial, sans-serif"
        >
          G
        </text>
      </svg>
    </Box>
  );
}
