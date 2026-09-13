import { Box, Typography, Link } from '@mui/material';

export default function ContactCell({ partner }) {
  const telegramGroupLabel = partner.telegramGroup
    ? partner.telegramGroup.replace(/^https?:\/\//, '')
    : '-';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.2 }}>
      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem', lineHeight: 1.3 }}>
        {partner.telegramNick}
      </Typography>
      {partner.telegramGroup ? (
        <Link
          href={partner.telegramGroup}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          sx={{
            fontSize: '0.72rem',
            color: 'primary.main',
            wordBreak: 'break-all',
            lineHeight: 1.2,
          }}
        >
          {telegramGroupLabel}
        </Link>
      ) : (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          -
        </Typography>
      )}
    </Box>
  );
}
