/**
 * PageExplain - a drop-in "Explain?" guide for any page. Renders a help icon in
 * the page header; pressing it auto-discovers the page's blocks (elements marked
 * with `data-tour-block`, incl. every BentoCard) and walks them with the shared
 * ExplainTour popup, illuminating each block in the primary accent.
 *
 * Per-block copy comes from the central registry (explainContent.js) when present,
 * otherwise from the block's own label + its PAGE_INFO entry - so every page has a
 * usable guide with zero bespoke wiring. When a page has no discoverable blocks it
 * falls back to a small page-overview popover from PAGE_INFO.
 *
 *   <PageExplain />                     // uses the current route
 *   <PageExplain pageKey="/tools" />    // explicit route override
 */
import { useState, useCallback, useEffect } from 'react';
import { IconButton, Tooltip, GlobalStyles, Popover, Box, Typography, useTheme } from '@mui/material';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { useLocation, useNavigate } from 'react-router-dom';

import AppIcon from '../icons/AppIcon';
import ExplainTour from './ExplainTour';
import { createHoverGlowShadow, GLOW_SPEC } from '../../theme/hoverGlow';
import { resolveExplain } from '../../config/explainContent';
import { PAGE_INFO, getPageTitle } from '../../config/pageInfo';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Ordered, de-duplicated list of tour blocks currently in the DOM. */
function discoverBlocks() {
  if (typeof document === 'undefined') return [];
  const seen = new Set();
  const steps = [];
  for (const el of document.querySelectorAll('[data-tour-block]')) {
    const id = el.getAttribute('data-tour-block');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    steps.push({
      id,
      label: el.getAttribute('data-tour-label') || id,
      info: el.getAttribute('data-tour-info') || null,
    });
  }
  return steps;
}

function selectById(id) {
  const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
  return document.querySelector(`[data-tour-block="${safe}"]`);
}

function clearGlow() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.explain-active').forEach((el) => el.classList.remove('explain-active'));
}

/** PAGE_INFO for a route, falling back to parent segments. */
function resolvePageInfo(pathname) {
  if (PAGE_INFO[pathname]) return PAGE_INFO[pathname];
  const parts = (pathname || '').split('/').filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const p = `/${parts.join('/')}`;
    if (PAGE_INFO[p]) return PAGE_INFO[p];
  }
  return null;
}

export default function PageExplain({ pageKey, size = 20, sx }) {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState([]);
  const [content, setContent] = useState({});
  const [infoOpen, setInfoOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const route = pageKey || location.pathname;

  const start = useCallback(() => {
    const discovered = discoverBlocks();
    if (!discovered.length) {
      setInfoOpen(true);
      return;
    }
    const registry = resolveExplain(route);
    const map = {};
    for (const s of discovered) {
      const override = registry?.blocks?.[s.id];
      if (override) {
        map[s.id] = override;
      } else {
        const info = s.info ? PAGE_INFO[s.info] : null;
        map[s.id] = {
          title: s.label,
          how: info?.description || `${s.label} - part of this page.`,
          source: '',
          needs: info?.features?.slice(0, 4),
        };
      }
    }
    setContent(map);
    setSteps(discovered);
    setStep(0);
    setOpen(true);
  }, [route]);

  const close = useCallback(() => {
    setOpen(false);
    clearGlow();
  }, []);

  // Illuminate the active block; clean up on close/unmount.
  useEffect(() => {
    if (!open) return undefined;
    clearGlow();
    const id = steps[step]?.id;
    if (id) selectById(id)?.classList.add('explain-active');
    return clearGlow;
  }, [open, step, steps]);

  const onNext = () => setStep((s) => (s >= steps.length - 1 ? (close(), s) : s + 1));
  const onBack = () => setStep((s) => Math.max(0, s - 1));
  const onAction = (cta) => {
    if (cta?.to) navigate(cta.to);
    close();
  };

  const pageInfo = infoOpen ? resolvePageInfo(route) : null;

  return (
    <>
      <Tooltip title="Explain this page" arrow>
        <IconButton
          size="small"
          onClick={(e) => {
            setAnchorEl(e.currentTarget);
            start();
          }}
          aria-label="Explain this page"
          sx={{ color: 'primary.main', ...sx }}
        >
          <AppIcon name="HelpOutlineRounded" fallback={HelpOutlineRoundedIcon} sx={{ fontSize: size }} />
        </IconButton>
      </Tooltip>

      {open && (
        <GlobalStyles
          styles={{
            '.explain-active, .explain-active .MuiPaper-root': {
              borderColor: `${theme.palette.primary.main} !important`,
              boxShadow: `${createHoverGlowShadow(theme)} !important`,
              transition: prefersReducedMotion()
                ? 'none'
                : `box-shadow ${GLOW_SPEC.transitionMs}ms ease, border-color ${GLOW_SPEC.transitionMs}ms ease`,
            },
          }}
        />
      )}

      <ExplainTour
        open={open && steps.length > 0}
        steps={steps}
        stepIndex={step}
        content={content}
        onNext={onNext}
        onBack={onBack}
        onClose={close}
        onAction={onAction}
      />

      {/* Fallback: page with no discoverable blocks - show a page overview. */}
      <Popover
        open={infoOpen}
        anchorEl={anchorEl}
        onClose={() => setInfoOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 320, borderRadius: 2 } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          {pageInfo?.title || getPageTitle(route)}
        </Typography>
        {pageInfo?.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: pageInfo?.features?.length ? 1 : 0 }}>
            {pageInfo.description}
          </Typography>
        )}
        {Array.isArray(pageInfo?.features) && pageInfo.features.length > 0 && (
          <Box component="ul" sx={{ m: 0, pl: 2.25, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {pageInfo.features.slice(0, 6).map((f, i) => (
              <Typography key={i} component="li" variant="body2" color="text.secondary">
                {f}
              </Typography>
            ))}
          </Box>
        )}
        {!pageInfo && (
          <Typography variant="body2" color="text.secondary">
            A guided tour for this page is coming soon.
          </Typography>
        )}
      </Popover>
    </>
  );
}
