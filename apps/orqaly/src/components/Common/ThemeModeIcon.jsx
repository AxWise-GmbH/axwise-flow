import { Box } from '@mui/material';

/**
 * Combined sun and moon icon for dark/light mode toggle.
 * Sun = light mode, Moon = dark mode — shown together to indicate theme switch.
 */
export default function ThemeModeIcon({ mode, sx = {}, ...props }) {
  const isLight = mode === 'light';
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        ...sx,
      }}
      {...props}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1.25em"
        height="1.25em"
        style={{ flexShrink: 0 }}
      >
        {/* Sun: circle + rays */}
        <circle cx="12" cy="12" r="4" opacity={isLight ? 1 : 0.4} />
        <line x1="12" y1="2" x2="12" y2="4" opacity={isLight ? 1 : 0.4} />
        <line x1="12" y1="20" x2="12" y2="22" opacity={isLight ? 1 : 0.4} />
        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" opacity={isLight ? 1 : 0.4} />
        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" opacity={isLight ? 1 : 0.4} />
        <line x1="2" y1="12" x2="4" y2="12" opacity={isLight ? 1 : 0.4} />
        <line x1="20" y1="12" x2="22" y2="12" opacity={isLight ? 1 : 0.4} />
        <line x1="6.34" y1="17.66" x2="4.93" y2="19.07" opacity={isLight ? 1 : 0.4} />
        <line x1="19.07" y1="4.93" x2="17.66" y2="6.34" opacity={isLight ? 1 : 0.4} />
        {/* Moon: crescent */}
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" opacity={isLight ? 0.5 : 1} />
      </svg>
    </Box>
  );
}
