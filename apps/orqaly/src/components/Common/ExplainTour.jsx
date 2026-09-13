import { useEffect } from 'react';
import { Box, Button, Chip, Portal, Typography, useTheme } from '@mui/material';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import GlassCard from './GlassCard';
import { HEADER_HEIGHT, SIDEBAR_INSET } from '../../utils/constants';

import AppIcon from '../icons/AppIcon';

// Pin the popup just below the app header (matches the layout's header offset).
const HEADER_OFFSET = HEADER_HEIGHT + SIDEBAR_INSET + 8;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Reusable in-page guided tour. Steps through a page's currently visible blocks
 * (`steps`, ordered `[{ id, label }]`), scrolling each into view and showing a
 * fixed top-right popup that explains its data source, behaviour and setup needs
 * plus a primary call-to-action. Per-block copy comes from the `content` map
 * (`{ [blockId]: { title, how, source, needs[], cta } }`), passed by each page.
 *
 * The active block's glow is driven by the host page (it owns the block wrappers,
 * see `explainGlowSx`); this component pins the popup and routes the CTA. Targets
 * are found via `[data-tour-block="<id>"]` markers placed by the host. The parent
 * drives `stepIndex` and is told to advance/retreat/close/act via callbacks.
 */
export default function ExplainTour({
  open,
  steps = [],
  stepIndex = 0,
  content: contentMap = {},
  onNext,
  onBack,
  onClose,
  onAction,
}) {
  const theme = useTheme();

  const step = steps[stepIndex] || null;
  const total = steps.length;
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= total - 1;
  const content = step ? contentMap[step.id] : null;
  const cta = content?.cta || null;

  // On each step change, scroll the target block into view so the glow is visible
  // while the (fixed) popup stays anchored to the top-right corner.
  useEffect(() => {
    if (!open || !step) return;
    const el = document.querySelector(`[data-tour-block="${step.id}"]`);
    if (!el) {
      // A visible block went missing (e.g. layout changed mid-tour) - skip it.
      onNext?.();
      return;
    }
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [open, step, stepIndex, onNext]);

  // Escape closes the tour.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !step) return null;

  return (
    <Portal>
      {/* Transparent click-catcher: clicking outside the popup closes the tour.
          No backdrop colour - the active block is highlighted with a glow, not a dim. */}
      <Box
        onClick={onClose}
        sx={{ position: 'fixed', inset: 0, zIndex: theme.zIndex.modal, cursor: 'default' }}
      />
      {/* Fixed popup pinned just below the header (top-right) so it stays visible
          while the page scrolls and never lands on the block it describes.
          Portaled to <body> so `position: fixed` is relative to the viewport even
          when an ancestor (entrance animations) has a transform. */}
      <Box
        sx={{
          position: 'fixed',
          top: { xs: 12, md: `${HEADER_OFFSET}px` },
          right: { xs: 12, md: 24 },
          width: 340,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: { xs: 'calc(100vh - 24px)', md: `calc(100vh - ${HEADER_OFFSET + 24}px)` },
          overflowY: 'auto',
          zIndex: theme.zIndex.modal + 1,
        }}
      >
        <GlassCard sx={{ p: 2, '&:hover': { transform: 'none' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <AppIcon
              name="HelpOutlineRounded"
              fallback={HelpOutlineRoundedIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }}>
              {content?.title || step.label}
            </Typography>
            <Chip
              label={`${stepIndex + 1} / ${total}`}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontWeight: 700 }}
            />
          </Box>

          {content ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Section label="What it shows" body={content.how} />
              <Section label="Where the data comes from" body={content.source} />
              {Array.isArray(content.needs) && content.needs.length > 0 && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                    }}
                  >
                    What it needs
                  </Typography>
                  <Box
                    component="ul"
                    sx={{
                      m: 0,
                      mt: 0.5,
                      pl: 2.25,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.25,
                    }}
                  >
                    {content.needs.map((n, i) => (
                      <Typography key={i} component="li" variant="body2" color="text.secondary">
                        {n}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {step.label}
            </Typography>
          )}

          {cta && (
            <Button
              fullWidth
              variant="contained"
              size="small"
              onClick={() => onAction?.(cta)}
              sx={{ mt: 2, textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              {cta.label}
            </Button>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: cta ? 1 : 2 }}>
            <Button size="small" color="inherit" onClick={onClose} sx={{ mr: 'auto' }}>
              Skip
            </Button>
            <Button size="small" onClick={onBack} disabled={isFirst}>
              Back
            </Button>
            <Button size="small" variant="outlined" onClick={onNext}>
              {isLast ? 'Done' : 'Next'}
            </Button>
          </Box>
        </GlassCard>
      </Box>
    </Portal>
  );
}

function Section({ label, body }) {
  if (!body) return null;
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        {body}
      </Typography>
    </Box>
  );
}
