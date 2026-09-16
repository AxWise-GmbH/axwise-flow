import React from 'react';
import { Paper, alpha, useTheme } from '@mui/material';
import PropTypes from 'prop-types';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

/**
 * Enterprise Grade "Glass" Card.
 * Use this as the default container for widgets, forms, and lists.
 */
export default function GlassCard({ children, delay = 0, sx = {}, ...props }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: isDark
          ? alpha(theme.palette.common.white, 0.1)
          : alpha(theme.palette.divider, 0.8),
        background: isDark
          ? `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.6)} 0%, ${alpha(theme.palette.background.paper, 0.4)} 100%)`
          : `linear-gradient(180deg, #FFFFFF 0%, ${alpha('#F8FAFC', 0.8)} 100%)`,
        backdropFilter: 'blur(12px)',
        boxShadow: theme.shadows[1],
        overflow: 'hidden',
        transition:
          'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.2s ease',
        animation: theme.animations?.scaleIn,
        animationDelay: `${delay}s`,
        animationFillMode: 'both',
        '&:hover': {
          boxShadow: createHoverGlowShadow(theme),
          borderColor: theme.palette.primary.main,
          transform: 'translateY(-4px)',
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
}

GlassCard.propTypes = {
  children: PropTypes.node,
  delay: PropTypes.number,
  sx: PropTypes.object,
};
