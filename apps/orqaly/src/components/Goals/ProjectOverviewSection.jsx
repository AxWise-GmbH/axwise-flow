/**
 * ProjectOverviewSection — consistent section header + body wrapper used
 * by the Result/Report tabs. Accepts an icon, label, and children.
 *
 * When `collapsible` is true, the body collapses by default and toggles on
 * header click. Open state defaults to `defaultOpen` (false). Non-collapsible
 * sections always render their body (current behaviour, unchanged).
 *
 * Icon props (prefer glassIconName for glassmorphism):
 *   glassIconName — string name from glassIconMap (e.g. "Build"). Renders
 *                   a GlassIcon tile. Falls back to `icon` when unmapped.
 *   glassIconFallback — optional MUI icon component used when the name is
 *                       not mapped in the glass pack.
 *   icon           — legacy: emoji string or React node. Still supported
 *                   but produces a plain text span, not a glass tile.
 */
import { useState } from 'react';
import { Box, Typography, Collapse, alpha, useTheme } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GlassIcon from '../icons/GlassIcon';

export default function ProjectOverviewSection({
  icon,
  label,
  children,
  dense = false,
  collapsible = false,
  defaultOpen = false,
  glassIconName,
  glassIconFallback,
}) {
  const theme = useTheme();
  const G = theme.palette.primary.main;
  const [open, setOpen] = useState(defaultOpen);

  const handleToggle = () => {
    if (collapsible) setOpen((prev) => !prev);
  };

  // Determine the icon element to render.
  const iconElement = glassIconName ? (
    <GlassIcon name={glassIconName} fallback={glassIconFallback} size={18} tone="brand" />
  ) : icon ? (
    <Box component="span" sx={{ fontSize: '0.95rem', lineHeight: 1 }}>
      {icon}
    </Box>
  ) : null;

  return (
    <Box sx={{ mb: dense ? 2 : 3 }}>
      {/* Section header — clickable when collapsible */}
      <Box
        onClick={handleToggle}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : -1}
        onKeyDown={(e) => {
          if (!collapsible) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          mb: 1,
          pb: 0.75,
          borderBottom: '1px solid',
          borderColor: alpha(G, 0.15),
          cursor: collapsible ? 'pointer' : 'default',
          userSelect: collapsible ? 'none' : 'auto',
          transition: 'border-color 0.15s ease',
          '&:hover': collapsible ? { borderColor: alpha(G, 0.4) } : undefined,
          outline: 'none',
          '&:focus-visible': collapsible ? { borderColor: G } : undefined,
        }}
      >
        {iconElement}
        <Typography
          sx={{
            fontSize: '0.66rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: G,
            flex: collapsible ? 1 : undefined,
          }}
        >
          {label}
        </Typography>
        {collapsible && (
          <GlassIcon
            name="ExpandMore"
            fallback={ExpandMoreIcon}
            size={18}
            tone="brand"
            sx={{
              color: alpha(G, 0.7),
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        )}
      </Box>
      {/* Section body — always visible when not collapsible */}
      {collapsible ? (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <Box sx={{ pl: { xs: 0, sm: 0.5 }, pt: 0.25 }}>{children}</Box>
        </Collapse>
      ) : (
        <Box sx={{ pl: { xs: 0, sm: 0.5 } }}>{children}</Box>
      )}
    </Box>
  );
}
