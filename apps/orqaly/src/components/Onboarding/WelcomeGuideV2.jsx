import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  Box,
  IconButton,
  Typography,
  Button,
  Fade,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import GlassIcon from '../icons/GlassIcon';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import {
  MockupFrame,
  PanelHeader,
  ChaptersPanel,
  OperatorsPanel,
  riseSx,
  TITLE_ID,
} from './welcomeGuidePanels';
import { WELCOME_V2_PANELS } from '../../config/welcomeGuideContentV2';

import AppIcon from '../icons/AppIcon';

/**
 * The in-app Welcome Guide pop-up. A guided narrative (Welcome -> Connect Assistant -> Organization
 * & Consilium -> Trust the Process -> View Reports -> Easy Use), each a clean two-column feature row
 * (concise text + a real product mockup), then the Explore hub and the Operators reference panel.
 *
 * Props: open, onClose, onSetup.
 */
export default function WelcomeGuideV2({ open, onClose, onSetup }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const tint = theme.palette.primary.main;

  const [activeStep, setActiveStep] = useState(0);
  const [activeChapter, setActiveChapter] = useState(null);

  useEffect(() => {
    if (open) {
      setActiveStep(0);
      setActiveChapter(null);
    }
  }, [open]);

  const total = WELCOME_V2_PANELS.length;
  const isLast = activeStep === total - 1;
  const isFirst = activeStep === 0;
  const panel = WELCOME_V2_PANELS[activeStep];

  const goToStep = useCallback((i) => {
    setActiveChapter(null);
    setActiveStep(Math.max(0, Math.min(i, WELCOME_V2_PANELS.length - 1)));
  }, []);

  const handleNext = useCallback(() => {
    if (isLast) {
      onClose?.();
      return;
    }
    goToStep(activeStep + 1);
  }, [isLast, onClose, goToStep, activeStep]);

  const handleBack = useCallback(() => {
    if (panel?.kind === 'chapters' && activeChapter) {
      setActiveChapter(null);
      return;
    }
    goToStep(activeStep - 1);
  }, [panel, activeChapter, goToStep, activeStep]);

  const handleSetup = useCallback(() => {
    onClose?.();
    onSetup?.();
  }, [onClose, onSetup]);

  // Final-slide actions: close the guide and fire a window event so the global QuickActionDialogs
  // host opens the real dialog (works no matter which surface launched the guide).
  const handleAction = useCallback(
    (action) => {
      onClose?.();
      window.dispatchEvent(new CustomEvent('orch-quick-action', { detail: { action } }));
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleNext, handleBack]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullScreen={isMobile}
      aria-labelledby={TITLE_ID}
      slotProps={{
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : 4,
            width: isMobile ? '100%' : 880,
            maxWidth: isMobile ? '100%' : 880,
            overflow: 'hidden',
            bgcolor: 'background.paper',
            backgroundImage: `linear-gradient(160deg, ${alpha(tint, 0.12)} 0%, ${alpha(tint, 0)} 55%)`,
            border: '1px solid',
            borderColor: alpha(tint, 0.22),
            boxShadow: `0 20px 60px ${alpha('#000', 0.5)}, 0 0 0 1px ${alpha(tint, 0.1)} inset`,
          },
        },
        backdrop: {
          sx: { backdropFilter: 'blur(6px)', bgcolor: alpha('#000', 0.6) },
        },
      }}
    >
      <IconButton
        aria-label="Close welcome guide"
        onClick={onClose}
        size="small"
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          color: 'text.secondary',
          zIndex: 2,
          '&:hover': { color: 'text.primary', bgcolor: alpha(tint, 0.08) },
        }}
      >
        <GlassIcon name="Close" fallback={CloseRoundedIcon} size={18} tone="neutral" />
      </IconButton>
      <Fade key={`${activeStep}-${activeChapter || 'root'}`} in timeout={240} appear>
        <Box
          sx={{
            px: { xs: 2.5, sm: 4 },
            pt: { xs: 3.5, sm: 4 },
            pb: { xs: 2.5, sm: 3 },
            minHeight: { xs: 'auto', sm: 360 },
            maxHeight: { xs: 'none', sm: '64vh' },
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {panel?.kind === 'story' && <StorySlide tint={tint} content={panel.content} />}
          {panel?.kind === 'chapters' && (
            <ChaptersPanel
              tint={tint}
              theme={theme}
              activeChapter={activeChapter}
              onOpenChapter={setActiveChapter}
              onBackToGrid={() => setActiveChapter(null)}
            />
          )}
          {panel?.kind === 'operators' && <OperatorsPanel tint={tint} onSetup={handleSetup} />}
          {panel?.kind === 'cta' && (
            <CtaSlide tint={tint} content={panel.content} onAction={handleAction} />
          )}
        </Box>
      </Fade>
      <Box
        sx={{ display: 'flex', justifyContent: 'center', gap: 1, py: 0.5, mb: { xs: 1, sm: 1.25 } }}
      >
        {WELCOME_V2_PANELS.map((p, i) => {
          const active = i === activeStep;
          return (
            <Box
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`Go to section ${i + 1} of ${WELCOME_V2_PANELS.length}`}
              onClick={() => goToStep(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  goToStep(i);
                }
              }}
              sx={{
                width: active ? 24 : 8,
                height: 8,
                borderRadius: 999,
                bgcolor: active ? tint : alpha(tint, 0.25),
                cursor: 'pointer',
                transition: 'all .25s cubic-bezier(.22,1,.36,1)',
                outline: 'none',
                '&:hover, &:focus-visible': {
                  bgcolor: active ? tint : alpha(tint, 0.55),
                  boxShadow: `0 0 0 3px ${alpha(tint, 0.15)}`,
                },
              }}
            />
          );
        })}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: { xs: 2, sm: 4 },
          py: { xs: 1.5, sm: 2 },
          borderTop: '1px solid',
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <Button
          onClick={onClose}
          size={isMobile ? 'small' : 'medium'}
          sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600 }}
        >
          {isLast ? 'Close' : 'Skip'}
        </Button>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {(!isFirst || activeChapter) && (
            <Button
              onClick={handleBack}
              variant="outlined"
              size={isMobile ? 'small' : 'medium'}
              startIcon={<AppIcon name="ArrowBackRounded" fallback={ArrowBackRoundedIcon} />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                borderColor: alpha(tint, 0.4),
                color: 'text.primary',
                '&:hover': { borderColor: tint, bgcolor: alpha(tint, 0.06) },
              }}
            >
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            variant="contained"
            size={isMobile ? 'small' : 'medium'}
            endIcon={
              isLast ? undefined : (
                <AppIcon name="ArrowForwardRounded" fallback={ArrowForwardRoundedIcon} />
              )
            }
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              px: 2.5,
              boxShadow: `0 6px 18px ${alpha(tint, 0.3)}`,
            }}
          >
            {isLast ? 'Done' : 'Next'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

/* ------------------------------- story slide -------------------------------- */

function StorySlide({ tint, content: c }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '5fr 7fr' },
        gap: { xs: 3, sm: 5 },
        alignItems: 'center',
      }}
    >
      {/* Left: concise text (staggered entrance) */}
      <Box sx={{ minWidth: 0 }}>
        <Box sx={riseSx(0)}>
          <PanelHeader
            tint={tint}
            iconName={c.iconName}
            FallbackIcon={c.FallbackIcon}
            kicker={c.kicker}
            title={c.title}
          />
        </Box>
        {c.body && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              lineHeight: 1.65,
              mb: c.stages || c.bullets ? 3 : 0,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              ...riseSx(1),
            }}
          >
            {c.body}
          </Typography>
        )}
        {Array.isArray(c.stages) && <StepTimeline tint={tint} stages={c.stages} startIndex={2} />}
        {Array.isArray(c.bullets) && <BulletList tint={tint} bullets={c.bullets} startIndex={2} />}
      </Box>

      {/* Right: the real product mockup is the hero, with a gentle entrance */}
      <Box
        sx={{
          '@media (prefers-reduced-motion: no-preference)': {
            animation: 'wgMockIn 380ms cubic-bezier(.22,1,.36,1) both',
          },
          '@keyframes wgMockIn': {
            from: { opacity: 0, transform: 'translateY(10px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        <MockupFrame
          tint={tint}
          Demo={c.Demo}
          maxHeight={c.mockupMaxHeight || (c.stages ? 430 : 360)}
        />
      </Box>
    </Box>
  );
}

/** Vertical, connected step list (Trust the Process). */
function StepTimeline({ tint, stages, startIndex = 0 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        return (
          <Box key={s.label} sx={{ display: 'flex', gap: 1.75, ...riseSx(startIndex + i) }}>
            {/* Rail: dot + connecting line */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  mt: '5px',
                  borderRadius: '50%',
                  bgcolor: tint,
                  flexShrink: 0,
                  boxShadow: `0 0 0 4px ${alpha(tint, 0.12)}`,
                }}
              />
              {!last && (
                <Box
                  sx={{ width: 2, flex: 1, minHeight: 22, my: 0.75, bgcolor: alpha(tint, 0.22) }}
                />
              )}
            </Box>
            <Box sx={{ pb: last ? 0 : 2.25, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {s.label}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', lineHeight: 1.4 }}
              >
                {s.caption}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Icon-disk + label + sub rows (View Reports). */
function BulletList({ tint, bullets, startIndex = 0 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      {bullets.map((b, i) => (
        <Box
          key={b.label}
          sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start', ...riseSx(startIndex + i) }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              flexShrink: 0,
              bgcolor: alpha(tint, 0.12),
              color: tint,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GlassIcon name={b.iconName} fallback={b.FallbackIcon} size={20} tone={tint} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              {b.label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
              {b.sub}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** Final call-to-action: action cards that close the guide and navigate to each action. */
function CtaSlide({ tint, content: c, onAction }) {
  const theme = useTheme();
  return (
    <Box>
      <Box sx={riseSx(0)}>
        <PanelHeader
          tint={tint}
          iconName={c.iconName}
          FallbackIcon={c.FallbackIcon}
          kicker={c.kicker}
          title={c.title}
        />
      </Box>
      {c.subtitle && (
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ lineHeight: 1.6, mb: 3, ...riseSx(1) }}
        >
          {c.subtitle}
        </Typography>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {c.actions.map((a, i) => (
          <Box
            key={a.id}
            role="button"
            tabIndex={0}
            aria-label={a.label}
            onClick={() => onAction(a.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAction(a.id);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.75,
              minWidth: 0,
              p: 2,
              borderRadius: 3,
              cursor: 'pointer',
              color: 'text.primary',
              border: '1px solid',
              borderColor: alpha(tint, 0.25),
              background: `linear-gradient(150deg, ${alpha(tint, 0.1)} 0%, ${alpha(tint, 0.02)} 60%)`,
              outline: 'none',
              transition: 'border-color .2s ease, box-shadow .2s ease, transform .2s ease',
              '&:hover, &:focus-visible': {
                borderColor: alpha(tint, 0.6),
                boxShadow: createHoverGlowShadow(theme),
                transform: 'translateY(-2px)',
              },
              ...riseSx(2 + i),
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                flexShrink: 0,
                borderRadius: 2.5,
                bgcolor: alpha(tint, 0.16),
                color: tint,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GlassIcon name={a.iconName} fallback={a.FallbackIcon} size={24} tone={tint} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {a.label}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                {a.sub}
              </Typography>
            </Box>
            <AppIcon
              name="ArrowForwardRounded"
              fallback={ArrowForwardRoundedIcon}
              sx={{ color: tint, flexShrink: 0 }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
