import { isValidElement } from 'react';
import { Box, Typography, Button, useTheme, alpha } from '@mui/material';

/**
 * Reusable empty state: optional illustration OR icon, title, description,
 * optional primary CTA.
 *
 * Props:
 *  - illustration: a React component reference (preferred — `illustration={MyArt}`)
 *      or an element. When provided, takes precedence over `icon` and renders
 *      large (~180px tall) with the theme primary tint applied via currentColor.
 *  - icon: component reference or element. Shown when `illustration` is not set.
 */
export default function EmptyState({
  illustration,
  icon,
  title = 'No results',
  description,
  actionLabel,
  onAction,
  dense = false,
  sx = {},
}) {
  const theme = useTheme();

  let illustrationNode = null;
  if (illustration) {
    if (isValidElement(illustration)) {
      illustrationNode = illustration;
    } else if (typeof illustration === 'function' || typeof illustration === 'object') {
      const Art = illustration;
      illustrationNode = <Art />;
    }
  }

  let iconNode = null;
  if (!illustrationNode && icon) {
    if (isValidElement(icon)) {
      iconNode = icon;
    } else if (typeof icon === 'function' || typeof icon === 'object') {
      const Icon = icon;
      iconNode = <Icon sx={{ fontSize: dense ? 28 : 48 }} />;
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: dense ? 2 : illustrationNode ? 4 : 6,
        px: dense ? 1.5 : 2,
        borderRadius: dense ? 2 : 3,
        border: '1px dashed',
        borderColor: 'divider',
        bgcolor: dense ? 'transparent' : 'background.default',
        ...sx,
      }}
    >
      {illustrationNode && (
        <Box
          aria-hidden="true"
          sx={{
            color: theme.palette.primary.main,
            mb: 2,
            width: { xs: 180, sm: 220 },
            height: { xs: 180, sm: 220 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `radial-gradient(circle at 50% 50%, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.02)} 60%, transparent 100%)`,
            borderRadius: '50%',
            '& > svg': { width: '100%', height: '100%', display: 'block' },
          }}
        >
          {illustrationNode}
        </Box>
      )}
      {iconNode && (
        <Box sx={{ color: 'text.disabled', mb: dense ? 1 : 2, display: 'flex' }}>{iconNode}</Box>
      )}
      <Typography
        variant={dense ? 'body2' : 'h6'}
        sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}
      >
        {title}
      </Typography>
      {description && (
        <Typography
          variant={dense ? 'caption' : 'body2'}
          color="text.secondary"
          sx={{ mb: dense ? 0 : 2, maxWidth: 420 }}
        >
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button
          variant="contained"
          onClick={onAction}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            bgcolor: 'primary.main',
            '&:hover': { bgcolor: 'primary.dark' },
          }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
