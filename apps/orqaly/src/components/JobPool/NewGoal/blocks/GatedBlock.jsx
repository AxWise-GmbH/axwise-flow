import { useState } from 'react';
import { Box, Collapse, Typography, alpha, useTheme } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GlassIcon from '../../../icons/GlassIcon';

/**
 * A Step 1 block: one compact row that says what the run will use, and opens
 * when you want to change it.
 *
 * Locked is Setup: Auto. The block stays visible holding what Auto picked,
 * rather than disappearing — hiding it would teach nothing about the control
 * and make the jump to Manual feel like a different form. `pointerEvents:none`
 * plus `aria-disabled` keeps its contents out of the tab order.
 *
 * Unlocked is Manual, and it is still a single row until you open it. Rendering
 * all three expanded at once put a full Knowledge Base picker, a tool chooser
 * and a workspace selector on screen simultaneously and pushed the
 * conversation off the top. One row each, open the one you care about.
 */
export default function GatedBlock({
  index,
  title,
  icon,
  iconFallback,
  locked = false,
  summary,
  lockedSummary,
  children,
  // Start open when the block holds something the user must act on — a
  // workspace that failed to load, for instance. An error folded behind a
  // disclosure is an error nobody reads.
  defaultOpen = false,
  'data-testid': testId,
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const expandable = !locked && Boolean(children);
  const expanded = expandable && open;

  return (
    <Box
      data-testid={testId}
      aria-disabled={locked || undefined}
      data-expanded={expanded || undefined}
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: locked ? 'divider' : alpha(theme.palette.primary.main, 0.28),
        bgcolor: locked
          ? alpha(theme.palette.text.primary, 0.02)
          : alpha(theme.palette.primary.main, 0.03),
        opacity: locked ? 0.55 : 1,
        pointerEvents: locked ? 'none' : 'auto',
        transition: 'opacity 200ms ease, border-color 200ms ease, background-color 200ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        overflow: 'hidden',
        textAlign: 'left',
        // An open block takes the full row, so a Knowledge Base picker is not
        // crammed into a third of the width.
        gridColumn: expanded ? '1 / -1' : undefined,
      }}
    >
      <Box
        component={expandable ? 'button' : 'div'}
        type={expandable ? 'button' : undefined}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
        aria-expanded={expandable ? expanded : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          px: { xs: 1.5, sm: 2 },
          py: locked ? 0.9 : 1.05,
          minWidth: 0,
          font: 'inherit',
          textAlign: 'left',
          border: 0,
          background: 'transparent',
          color: 'inherit',
          cursor: expandable ? 'pointer' : 'default',
        }}
      >
        {locked ? (
          <GlassIcon name="LockOutlined" fallback={LockOutlinedIcon} size={16} tone="neutral" />
        ) : (
          icon && <GlassIcon name={icon} fallback={iconFallback} size={16} />
        )}
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: 'text.secondary',
            textTransform: 'uppercase',
            fontSize: '0.68rem',
            minWidth: 0,
          }}
        >
          {index ? `${index} · ${title}` : title}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            ml: 'auto',
            color: locked ? 'text.disabled' : 'primary.main',
            fontWeight: 600,
            fontSize: '0.7rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {locked ? lockedSummary || 'Auto' : summary}
        </Typography>
        {expandable && (
          <GlassIcon
            name="ExpandMore"
            fallback={ExpandMoreIcon}
            size={15}
            tone="neutral"
            sx={{
              flexShrink: 0,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms ease',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        )}
      </Box>

      {/* Locked is one row: the value already sits in the header, so a second
          row restating it only cost height. */}
      {expandable && (
        <Collapse in={expanded} unmountOnExit>
          <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: 1.75, minWidth: 0 }}>{children}</Box>
        </Collapse>
      )}
    </Box>
  );
}
