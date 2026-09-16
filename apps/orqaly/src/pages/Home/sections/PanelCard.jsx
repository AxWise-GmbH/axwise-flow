import { Box, Typography, Chip, useTheme } from '@mui/material';
import GlassCard from '../../../components/Common/GlassCard';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import { useHomeMode } from '../HomeModeContext';

/**
 * Shared fixed body height for the data blocks (Goals/Loops/Activity/Chat/Data
 * Operations) so they line up at one consistent height — matching the demo
 * look — and scroll internally when there is more data. Tune here once.
 */
export const HOME_BLOCK_BODY_HEIGHT = { xs: 300, md: 340 };

/**
 * Glass panel with an optional title/subtitle header and action slot.
 * Used as the surface for every Home section. The card keeps GlassCard's hover
 * glow but drops the translateY lift (too busy when ~10 panels share a page).
 *
 * `bodyHeight` fixes the content area to a set height (flex column) so paired
 * panels align and overflowing content scrolls inside the panel.
 */
export default function PanelCard({
  title,
  subtitle,
  action,
  children,
  className,
  delay = 0,
  bodyHeight,
  sx = {},
}) {
  const { demo } = useHomeMode();
  const theme = useTheme();
  return (
    <GlassCard
      delay={delay}
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        p: 1.5,
        height: '100%',
        minWidth: 0,
        // Keep GlassCard's hover glow + border, but drop the translateY lift
        // (too busy when ~10 panels share the page). Re-state the glow here
        // because sx's shallow merge replaces the whole '&:hover' key.
        '&:hover': {
          boxShadow: createHoverGlowShadow(theme),
          borderColor: theme.palette.primary.main,
          transform: 'none',
        },
        ...sx,
      }}
    >
      {(title || action) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  {title}
                </Typography>
                {demo && (
                  <Chip
                    label="DEMO"
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ height: 16, fontSize: '0.58rem', fontWeight: 800, letterSpacing: 0.4 }}
                  />
                )}
              </Box>
            )}
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Box>
      )}
      {bodyHeight != null ? (
        <Box sx={{ height: bodyHeight, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </Box>
      ) : (
        children
      )}
    </GlassCard>
  );
}
