import { Box, Typography, Chip, useTheme, alpha } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Shared frame for a wizard step: topic (eyebrow) + title + optional description,
 * a "Done" chip when complete, then the step's content.
 */
export default function StepShell({ topic, title, description, done, children }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            letterSpacing: '0.10em',
            color: tint,
            textTransform: 'uppercase',
            fontSize: '0.66rem',
          }}
        >
          {topic}
        </Typography>
        {done && (
          <Chip
            size="small"
            icon={<AppIcon name="CheckCircleRounded" fallback={CheckCircleRoundedIcon} />}
            label="Done"
            sx={{
              height: 20,
              fontWeight: 700,
              fontSize: '0.62rem',
              color: 'success.main',
              bgcolor: alpha(theme.palette.success.main, 0.14),
              '& .MuiChip-icon': { color: 'success.main', fontSize: 14 },
            }}
          />
        )}
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>
          {description}
        </Typography>
      )}
      <Box sx={{ mt: 2 }}>{children}</Box>
    </Box>
  );
}
