import { Box, Typography, Paper, useTheme } from '@mui/material';
import { PAGE_PADDING, PAGE_BLOCK_MARGIN_X } from '../../utils/constants';
import PageExplain from './PageExplain';

/**
 * Shared page shell: title + subtitle + block container.
 * The block sits 12px from each viewport edge (matching SIDEBAR_INSET) via
 * PAGE_BLOCK_MARGIN_X combined with <main>'s CONTENT_PADDING.
 * @param {boolean} showTitleBlock - If false, the title/subtitle Paper block is hidden (default: true).
 */
export default function PageLayout({
  title,
  subtitle,
  children,
  maxWidth = 'none',
  sx = {},
  action,
  showTitleBlock = true,
  explain = true,
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        pt: 0,
        px: 0,
        pb: PAGE_PADDING,
        maxWidth,
        width: 'auto',
        mx: PAGE_BLOCK_MARGIN_X,
        animation: theme.animations?.fadeInUp,
        ...sx,
      }}
    >
      {showTitleBlock && (title || subtitle || action) && (
        <Paper
          elevation={0}
          sx={{
            mb: 1.5,
            p: { xs: 1, sm: 1.25 },
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: theme.palette.background.paper,
            animation: theme.animations?.scaleIn,
            transformOrigin: 'top left',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 2,
          }}
        >
          <Box>
            {title && (
              <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexShrink: 0 }}>
            {explain && <PageExplain />}
            {action}
          </Box>
        </Paper>
      )}
      <Box sx={{ animation: `${theme.animations?.fadeInUp} 0.1s` }}>{children}</Box>
    </Box>
  );
}
