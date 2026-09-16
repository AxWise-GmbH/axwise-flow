import { Box, Typography, useTheme } from '@mui/material';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';

import AppIcon from '../../icons/AppIcon';
import { composerBlockSx, composerInkAlpha } from '../../../theme/composerSurface';

export default function EmptyBlock({ block }) {
  const theme = useTheme();
  const c = block.compact || {};
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1.25,
        borderRadius: 2,
        ...composerBlockSx(theme),
        borderStyle: 'dashed',
      }}
    >
      <AppIcon
        name="InboxRounded"
        fallback={InboxRoundedIcon}
        sx={{ fontSize: 18, color: composerInkAlpha(theme, 0.5) }}
      />
      <Typography
        variant="caption"
        sx={{ color: composerInkAlpha(theme, 0.7), fontSize: '0.78rem' }}
      >
        {c.message || 'No results.'}
      </Typography>
    </Box>
  );
}
