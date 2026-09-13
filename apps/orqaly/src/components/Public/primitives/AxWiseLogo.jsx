import { Box, Typography } from '@mui/material';

export default function AxWiseLogo({ sx = {} }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1.5,
        ...sx,
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          bgcolor: 'text.primary',
          color: 'background.default',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2.5L20.5 7.4V16.6L12 21.5L3.5 16.6V7.4L12 2.5Z"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </svg>
      </Box>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: '1.25rem',
          letterSpacing: '-0.02em',
          color: 'text.primary',
          lineHeight: 1,
        }}
      >
        AxWise
      </Typography>
    </Box>
  );
}
