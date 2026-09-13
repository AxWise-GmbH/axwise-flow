/**
 * BaseBlock — shared chrome for every chat block.
 *
 * Renders a compact glass card with:
 *   - left icon
 *   - header (title + optional meta chips)
 *   - 1–2 metadata lines (caller-supplied via children)
 *   - chevron toggle (only if expandedNode present)
 *   - "Open ↗" button (only if entityType + onOpen present)
 *
 * Optional `expandedNode` renders below the compact view on expand.
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Chip,
  Collapse,
  useTheme,
  alpha,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

import AppIcon from '../../icons/AppIcon';
import {
  composerAccent,
  composerBlockSx,
  composerInk,
  composerInkAlpha,
  composerSurfaceTone,
} from '../../../theme/composerSurface';

export default function BaseBlock({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  chips = [],
  metaLines = [],
  expandedNode = null,
  block,
  onOpen,
  defaultExpanded = false,
  children,
}) {
  const theme = useTheme();
  const isDark = composerSurfaceTone(theme) === 'dark';
  const { main } = theme.palette.primary;
  const accent = composerAccent(theme);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const canExpand = !!expandedNode;
  const canOpen = !!block?.entityType && typeof onOpen === 'function';
  const handleOpen = (e) => {
    e?.stopPropagation?.();
    if (!canOpen) return;
    onOpen({
      type: block.entityType,
      entityId: block.entityId,
      deepLink: block.deepLink,
      block,
    });
  };

  return (
    <Box
      sx={{
        borderRadius: 2,
        ...composerBlockSx(theme),
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
        transition: 'all 0.15s',
        '&:hover': {
          borderColor: alpha(main, 0.25),
          bgcolor: isDark ? alpha('#000000', 0.32) : composerInkAlpha(theme, 0.06),
        },
      }}
    >
      <Box
        onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          p: 1.25,
          cursor: canExpand ? 'pointer' : 'default',
        }}
      >
        {Icon && (
          <Box
            sx={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(iconColor || main, 0.16),
              color: iconColor || accent,
            }}
          >
            <Icon sx={{ fontSize: 20 }} />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              flexWrap: 'wrap',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: composerInk(theme),
                fontWeight: 600,
                fontSize: { xs: '0.82rem', sm: '0.88rem' },
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {title}
            </Typography>
            {chips.map((c, i) =>
              c ? (
                <Chip
                  key={`chip-${i}`}
                  size="small"
                  label={c.label}
                  sx={{
                    height: 16,
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    bgcolor: alpha(c.color || accent, 0.18),
                    color: c.color || accent,
                    border: '1px solid',
                    borderColor: alpha(c.color || accent, 0.3),
                    '& .MuiChip-label': { px: 0.6 },
                  }}
                />
              ) : null
            )}
          </Box>
          {subtitle && (
            <Typography
              variant="caption"
              sx={{
                color: composerInkAlpha(theme, 0.55),
                fontSize: { xs: '0.7rem', sm: '0.72rem' },
                lineHeight: 1.3,
                display: 'block',
                mt: 0.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </Typography>
          )}
          {metaLines.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
              {metaLines.filter(Boolean).map((line, i) => (
                <Typography
                  key={`ml-${i}`}
                  variant="caption"
                  sx={{
                    color: composerInkAlpha(theme, 0.45),
                    fontSize: '0.7rem',
                  }}
                >
                  {line}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
        {canExpand && (
          <IconButton
            size="small"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            sx={{
              color: composerInkAlpha(theme, 0.5),
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            }}
          >
            <AppIcon name="ExpandMoreRounded" fallback={ExpandMoreRoundedIcon} fontSize="small" />
          </IconButton>
        )}
      </Box>
      {children}
      {canExpand && (
        <Collapse in={expanded} timeout={200} unmountOnExit>
          <Box
            sx={{
              px: 1.5,
              pb: 1.5,
              pt: 0.5,
              borderTop: '1px solid',
              borderColor: composerInkAlpha(theme, 0.06),
            }}
          >
            {expandedNode}
            {canOpen && (
              <Box sx={{ mt: 1.25, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  startIcon={
                    <AppIcon
                      name="OpenInNewRounded"
                      fallback={OpenInNewRoundedIcon}
                      sx={{ fontSize: 14 }}
                    />
                  }
                  onClick={handleOpen}
                  sx={{
                    fontSize: '0.72rem',
                    color: accent,
                    textTransform: 'none',
                    fontWeight: 600,
                    py: 0.25,
                    px: 1,
                    minWidth: 0,
                    '&:hover': { bgcolor: alpha(main, 0.12) },
                  }}
                >
                  Open
                </Button>
              </Box>
            )}
          </Box>
        </Collapse>
      )}
      {!canExpand && canOpen && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            px: 1.25,
            pb: 0.75,
          }}
        >
          <Button
            size="small"
            startIcon={
              <AppIcon
                name="OpenInNewRounded"
                fallback={OpenInNewRoundedIcon}
                sx={{ fontSize: 14 }}
              />
            }
            onClick={handleOpen}
            sx={{
              fontSize: '0.7rem',
              color: alpha(accent, 0.85),
              textTransform: 'none',
              fontWeight: 600,
              py: 0,
              px: 0.75,
              minWidth: 0,
              '&:hover': { bgcolor: alpha(main, 0.1), color: accent },
            }}
          >
            Open
          </Button>
        </Box>
      )}
    </Box>
  );
}

/** Format a timestamp as a friendly relative string ("2h ago", "yesterday"). */
export function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.round(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

/** Map a freeform status string to a chip color from theme. */
export function statusColor(theme, status) {
  const s = String(status || '').toLowerCase();
  const tone = (name) =>
    composerSurfaceTone(theme) === 'dark' ? theme.palette[name].light : theme.palette[name].main;
  if (/(done|completed|active|success|enabled|approved)/.test(s)) return tone('success');
  if (/(progress|execute|running|planning|in-?motion)/.test(s)) return tone('info');
  if (/(awaiting|review|pending|paused|hold)/.test(s)) return tone('warning');
  if (/(failed|error|rejected|critical|archived|deleted)/.test(s)) return tone('error');
  return composerAccent(theme);
}
