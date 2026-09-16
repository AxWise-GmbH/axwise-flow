import { Box, Typography, Button, alpha } from '@mui/material';
import { keyframes } from '@mui/system';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import GlassIcon from '../icons/GlassIcon';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { WELCOME_CHAPTERS, WELCOME_OPERATORS } from '../../config/welcomeGuideContent';

import AppIcon from '../icons/AppIcon';

// Shared id so the dialog's aria-labelledby points at the active panel title.
export const TITLE_ID = 'welcome-guide-title';

/* ----------------------------- animations ----------------------------- */

const riseKf = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;
const fadeKf = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// Staggered fade + lift. Use on elements WITHOUT their own hover transform.
export function riseSx(index = 0) {
  return {
    '@media (prefers-reduced-motion: no-preference)': {
      animation: `${riseKf} 360ms cubic-bezier(.22,1,.36,1) both`,
      animationDelay: `${index * 60}ms`,
    },
  };
}

// Staggered fade only (no transform) - safe on elements that animate transform on hover.
export function fadeSx(index = 0) {
  return {
    '@media (prefers-reduced-motion: no-preference)': {
      animation: `${fadeKf} 320ms ease both`,
      animationDelay: `${index * 55}ms`,
    },
  };
}

/* ----------------------------- shared bits ----------------------------- */

export function PanelHeader({ tint, iconName, FallbackIcon, kicker, title }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: 2.5,
          bgcolor: alpha(tint, 0.15),
          color: tint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'rotate(-2deg)',
          flexShrink: 0,
        }}
      >
        <GlassIcon name={iconName} fallback={FallbackIcon} size={26} tone={tint} />
      </Box>
      {kicker && (
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            letterSpacing: '0.10em',
            color: tint,
            textTransform: 'uppercase',
            fontSize: '0.68rem',
          }}
        >
          {kicker}
        </Typography>
      )}
      <Typography
        id={TITLE_ID}
        variant="h5"
        sx={{ fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.01em', mt: -0.5 }}
      >
        {title}
      </Typography>
    </Box>
  );
}

/**
 * Renders a real platform mockup (a Demo component) as an inert, decorative preview.
 * The Demo brings its own card chrome, so we only add a soft radial glow behind it and cap the
 * height. `inert` + `aria-hidden` keep the mockup out of focus order and the a11y tree.
 */
export function MockupFrame({ tint, Demo, maxHeight = 380 }) {
  if (!Demo) return null;
  return (
    <Box
      aria-hidden="true"
      inert
      sx={{ position: 'relative', width: '100%', minWidth: 0, maxWidth: '100%' }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: -10,
          borderRadius: 4,
          background: `radial-gradient(ellipse at center, ${alpha(tint, 0.14)} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'relative',
          maxHeight,
          overflow: 'hidden',
          borderRadius: 4,
          '&::after': {
            content: '""',
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 40,
            background: (t) =>
              `linear-gradient(to bottom, transparent, ${alpha(t.palette.background.paper, 0.9)})`,
            pointerEvents: 'none',
          },
        }}
      >
        <Demo />
      </Box>
    </Box>
  );
}

/* ------------------------------- panels -------------------------------- */

export function ChaptersPanel({ tint, theme, activeChapter, onOpenChapter, onBackToGrid }) {
  const chapter = WELCOME_CHAPTERS.find((ch) => ch.id === activeChapter);

  if (chapter) {
    return (
      <Box>
        <Button
          onClick={onBackToGrid}
          size="small"
          startIcon={<AppIcon name="ArrowBackRounded" fallback={ArrowBackRoundedIcon} />}
          sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary', mb: 1.5 }}
        >
          Back to topics
        </Button>
        <PanelHeader
          tint={tint}
          iconName={chapter.iconName}
          FallbackIcon={chapter.FallbackIcon}
          kicker={chapter.summary}
          title={chapter.title}
        />
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {chapter.body}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, mb: 2.5, fontWeight: 700, color: tint }}>
          {chapter.where}
        </Typography>
        <MockupFrame tint={tint} Demo={chapter.Demo} maxHeight={360} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 800,
          letterSpacing: '0.10em',
          color: tint,
          textTransform: 'uppercase',
          fontSize: '0.68rem',
        }}
      >
        Explore the platform
      </Typography>
      <Typography
        variant="h5"
        sx={{ fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.01em', mt: 0.5, mb: 2 }}
      >
        Tap any topic to open its page
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {WELCOME_CHAPTERS.map((ch, i) => (
          <Box
            key={ch.id}
            role="button"
            tabIndex={0}
            aria-label={`Open ${ch.title}`}
            onClick={() => onOpenChapter(ch.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenChapter(ch.id);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              minWidth: 0,
              p: 1.75,
              borderRadius: 3,
              cursor: 'pointer',
              color: 'text.primary',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              outline: 'none',
              transition: 'border-color .2s ease, box-shadow .2s ease, transform .2s ease',
              '&:hover, &:focus-visible': {
                borderColor: alpha(tint, 0.5),
                boxShadow: createHoverGlowShadow(theme),
                transform: 'translateY(-2px)',
              },
              ...fadeSx(i),
            }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                flexShrink: 0,
                bgcolor: alpha(tint, 0.12),
                color: tint,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GlassIcon name={ch.iconName} fallback={ch.FallbackIcon} size={22} tone={tint} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {ch.title}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', lineHeight: 1.3 }}
              >
                {ch.summary}
              </Typography>
            </Box>
            <AppIcon
              name="ChevronRightRounded"
              fallback={ChevronRightRoundedIcon}
              sx={{ color: alpha(tint, 0.6), flexShrink: 0 }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function OperatorsPanel({ tint, onSetup }) {
  const c = WELCOME_OPERATORS;
  return (
    <Box
      sx={{
        borderRadius: 3,
        p: { xs: 2, sm: 2.5 },
        bgcolor: alpha(tint, 0.04),
        border: '1px dashed',
        borderColor: alpha(tint, 0.3),
      }}
    >
      <PanelHeader
        tint={tint}
        iconName={c.iconName}
        FallbackIcon={c.FallbackIcon}
        kicker={c.kicker}
        title={c.title}
      />
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, mb: 2 }}>
        {c.intro}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '6fr 5fr' },
          gap: { xs: 2, sm: 3 },
          alignItems: 'center',
          mb: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
          {c.points.map((p, i) => (
            <Box key={p.label} sx={riseSx(i)}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {p.label}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                {p.body}
              </Typography>
            </Box>
          ))}
        </Box>
        <MockupFrame tint={tint} Demo={c.Demo} maxHeight={340} />
      </Box>
      <Button
        onClick={onSetup}
        variant="outlined"
        endIcon={<AppIcon name="OpenInNewRounded" fallback={OpenInNewRoundedIcon} />}
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 2,
          px: 2.5,
          borderColor: alpha(tint, 0.4),
          color: 'text.primary',
          '&:hover': { borderColor: tint, bgcolor: alpha(tint, 0.06) },
        }}
      >
        {c.ctaPrimary}
      </Button>
    </Box>
  );
}
