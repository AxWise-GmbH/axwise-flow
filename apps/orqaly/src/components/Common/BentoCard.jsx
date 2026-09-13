import { useCallback, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Collapse,
  Chip,
  Button,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { PAGE_INFO } from '../../config/pageInfo';
import { slugifyTitle } from '../../config/explainContent';
import PageExplain from './PageExplain';
import { fireConfetti } from '../../utils/confettiCanvas';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import AppIcon from '../icons/AppIcon';

/**
 * Shared bento-style card: icon header strip + content.
 * Used on Settings, Audit Log, Task Manager for a consistent professional look.
 * @param {string} gridArea - CSS grid area (optional)
 * @param {number} minHeight - min-height in px (optional)
 * @param {boolean} noPadding - if true, content box has no padding (optional)
 * @param {boolean} plainHeader - if true, header also drops its bottom divider (flat look).
 *   The header is never accent-tinted regardless of this flag. (optional)
 * @param {boolean} scrollBody - if true, the content area scrolls vertically when it
 *   overflows the card's fixed height (header stays pinned). Off by default. (optional)
 * @param {number} delay - animation delay in seconds (optional)
 * @param {boolean} hideTitle - hide the visible title text (page-wrapper `explain` cards
 *   hide it automatically; the page name now lives in the top bar). (optional)
 */
export default function BentoCard({
  children,
  title,
  subtitle,
  icon: Icon,
  iconName,
  iconColor,
  gridArea,
  minHeight,
  noPadding,
  noHeader,
  plainHeader,
  scrollBody,
  delay = 0,
  action,
  titleWithAction,
  onHeaderClick,
  pageInfoPath,
  tourId,
  noTour,
  explain,
  hideTitle,
  collapsible = false,
  sx = {},
}) {
  const theme = useTheme();
  // Optional "Explain?" help button in the card header (used on page-wrapper cards).
  const explainNode = explain ? <PageExplain /> : null;
  // Page-wrapper header cards (those with `explain`) no longer render their title text -
  // the page name now lives in the top bar. `hideTitle` forces the same for non-explain cards.
  const titleHidden = hideTitle || Boolean(explain);
  // Self-register as an "Explain?" tour block so PageExplain can auto-discover it.
  // `noTour` opts a card out (e.g. a full-page wrapper card that shouldn't be a step).
  const tourBlockId = noTour ? null : tourId || (typeof title === 'string' && title ? slugifyTitle(title) : null);
  const tourAttrs = tourBlockId
    ? {
        'data-tour-block': tourBlockId,
        ...(typeof title === 'string' ? { 'data-tour-label': title } : {}),
        ...(pageInfoPath ? { 'data-tour-info': pageInfoPath } : {}),
      }
    : {};
  const lastConfettiAtRef = useRef(0);
  const [infoExpanded, setInfoExpanded] = useState(false);
  // Compact mode (simple mode / mobile settings): body starts collapsed behind a
  // "More" button so each card shows only its icon, title and description.
  const [contentExpanded, setContentExpanded] = useState(false);
  const pageInfo = pageInfoPath ? PAGE_INFO[pageInfoPath] : null;
  const isDark = theme.palette.mode === 'dark';
  const accent = iconColor || theme.palette.primary.main;
  // In compact (collapsible) mode the expand/collapse control lives in the header,
  // right-aligned next to the title, so each card reads: icon + title + description + "More".
  const moreToggle = collapsible ? (
    <Button
      size="small"
      onClick={() => setContentExpanded((v) => !v)}
      aria-expanded={contentExpanded}
      endIcon={
        <AppIcon
          name="ExpandMoreRounded"
          fallback={ExpandMoreRoundedIcon}
          sx={{
            fontSize: 18,
            transition: 'transform .2s ease',
            transform: contentExpanded ? 'rotate(180deg)' : 'none',
          }}
        />
      }
      sx={{ textTransform: 'none', fontWeight: 700, flexShrink: 0 }}
    >
      {contentExpanded ? 'Less' : 'More'}
    </Button>
  ) : null;
  const headerAction = collapsible ? (
    <>
      {action}
      {moreToggle}
    </>
  ) : action;
  const subtitleIsText = typeof subtitle === 'string' || typeof subtitle === 'number';
  const subtitleText = subtitleIsText ? String(subtitle) : '';
  const metricParts = subtitleText
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':');
      if (idx <= 0) return null;
      return {
        label: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim(),
      };
    })
    .filter((item) => item && item.label && item.value);
  const shouldRenderMetricChips = metricParts.length >= 2;

  const fireIconConfetti = useCallback(
    (event) => {
      const now = Date.now();
      if (now - lastConfettiAtRef.current < 250) return;
      lastConfettiAtRef.current = now;

      const fallback = ['#1B2A4A', '#2E4068', '#5B8DEF', '#7BA8F5'];
      const palette = [
        theme.palette.primary?.main,
        theme.palette.primary?.light,
        theme.palette.primary?.dark,
        theme.palette.secondary?.main,
        accent,
      ].filter(Boolean);

      const hex = /^#[0-9A-Fa-f]{3,8}$/;
      const colors = palette.filter((c) => typeof c === 'string' && hex.test(c));
      const rect = event?.currentTarget?.getBoundingClientRect?.();
      const origin = rect
        ? {
            x: Math.min(0.98, Math.max(0.02, (rect.left + rect.width / 2) / window.innerWidth)),
            y: Math.min(0.95, Math.max(0.05, (rect.top + rect.height / 2) / window.innerHeight)),
          }
        : { x: 0.5, y: 0.35 };
      const opts = {
        spread: 90,
        startVelocity: 36,
        zIndex: 2000002,
        colors: colors.length ? colors : fallback,
        origin,
        disableForReducedMotion: false,
      };
      fireConfetti({ ...opts, particleCount: 110 });
      setTimeout(() => fireConfetti({ ...opts, particleCount: 70, spread: 120, scalar: 0.9 }), 60);
      setTimeout(() => fireConfetti({ ...opts, particleCount: 50, spread: 140, scalar: 0.8 }), 140);
    },
    [accent, theme.palette.primary, theme.palette.secondary]
  );

  return (
    <Paper
      elevation={0}
      {...tourAttrs}
      sx={{
        gridArea,
        // Compact cards hug their content (header + "More") instead of a fixed height.
        minHeight: collapsible ? 'auto' : minHeight || 'auto',
        height: collapsible ? 'auto' : '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: isDark
          ? alpha(theme.palette.background.paper, 0.6)
          : theme.palette.background.paper,
        overflow: 'hidden',
        transition:
          'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.2s ease, box-shadow 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        animation: theme.animations?.scaleIn,
        animationDelay: `${delay}s`,
        animationFillMode: 'both',
        '&:hover': {
          borderColor: isDark ? alpha(accent, 0.3) : alpha(accent, 0.25),
          boxShadow: createHoverGlowShadow(theme),
          transform: 'translateY(-4px)',
        },
        ...sx,
      }}
    >
      {!noHeader && (
        <Box
          onClick={onHeaderClick}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
            px: { xs: 1.25, sm: 1.5 },
            py: 1.25,
            borderBottom: plainHeader ? 'none' : '1px solid',
            borderColor: 'divider',
            bgcolor: 'transparent',
            ...(onHeaderClick && { cursor: 'pointer' }),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
            <Box
              component="button"
              type="button"
              onClick={fireIconConfetti}
              onPointerDown={fireIconConfetti}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  fireIconConfetti(event);
                }
              }}
              aria-label={`${title} celebration`}
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(accent, 0.12),
                color: accent,
                border: 'none',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, box-shadow 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: `0 0 0 2px ${alpha(accent, 0.22)}`,
                },
              }}
            >
              {Icon && <AppIcon name={iconName} fallback={Icon} size={22} glassInSimple />}
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                flexWrap: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
            >
              {!titleHidden && (
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, lineHeight: 1.3, flexShrink: 0 }}
                >
                  {title}
                </Typography>
              )}
              {pageInfo && (
                <Tooltip title="Page info">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoExpanded(!infoExpanded);
                    }}
                    sx={{
                      p: 0.25,
                      color: infoExpanded ? 'info.main' : alpha(theme.palette.text.secondary, 0.4),
                      '&:hover': { color: 'info.main' },
                    }}
                  >
                    <AppIcon
                      name="InfoOutlined"
                      fallback={InfoOutlinedIcon}
                      sx={{ fontSize: 16 }}
                    />
                  </IconButton>
                </Tooltip>
              )}
              {titleWithAction && (headerAction || explainNode) && (
                <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {explainNode}
                  {headerAction}
                </Box>
              )}
              {!titleWithAction && <Box sx={{ flex: 1, minWidth: 0 }} />}
            </Box>
            {!titleWithAction && (headerAction || explainNode) && (
              <Box
                sx={{ flexShrink: 0, ml: { xs: 'auto', sm: 0 }, display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                {explainNode}
                {headerAction}
              </Box>
            )}
          </Box>
          <Box sx={{ width: '100%', order: 3, flexBasis: '100%', mt: subtitle ? -0.5 : 0 }}>
            <Box sx={{ pl: 6.5 }}>
              {subtitle &&
                (subtitleIsText ? (
                  shouldRenderMetricChips ? (
                    <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {metricParts.map((item) => (
                        <Box
                          key={item.label}
                          sx={{
                            px: 1,
                            py: 0.35,
                            borderRadius: 1.25,
                            border: '1px solid',
                            borderColor: alpha(theme.palette.divider, 0.9),
                            bgcolor: isDark ? alpha(accent, 0.1) : alpha(accent, 0.08),
                            color: 'text.secondary',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            lineHeight: 1.2,
                          }}
                        >
                          {item.label}: {item.value}
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.25 }}
                    >
                      {subtitle}
                    </Typography>
                  )
                ) : (
                  <Box sx={{ mt: 0.75 }}>{subtitle}</Box>
                ))}
            </Box>
          </Box>
        </Box>
      )}
      {pageInfo && (
        <Collapse in={infoExpanded} unmountOnExit>
          <Box
            sx={{
              px: { xs: 1.25, sm: 1.5 },
              py: 1,
              bgcolor: alpha(theme.palette.info.main, 0.03),
              borderBottom: '1px solid',
              borderColor: alpha(theme.palette.info.main, 0.1),
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.7rem',
                color: 'text.secondary',
                lineHeight: 1.5,
                display: 'block',
                mb: 0.75,
              }}
            >
              {pageInfo.description}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap', mb: 0.5 }}>
              {pageInfo.features.map((f) => (
                <Chip
                  key={f}
                  label={f}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.55rem', fontWeight: 600, borderRadius: 0.75 }}
                />
              ))}
            </Box>
            {pageInfo.schemes && (
              <Typography
                variant="caption"
                component="a"
                href={pageInfo.schemes}
                sx={{
                  fontSize: '0.62rem',
                  color: 'info.main',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.3,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                View Schemes{' '}
                <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 10 }} />
              </Typography>
            )}
          </Box>
        </Collapse>
      )}
      {collapsible ? (
        <Collapse in={contentExpanded} unmountOnExit>
          <Box
            sx={{
              p: noPadding ? 0 : { xs: 1.25, sm: 1.5 },
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {children}
          </Box>
        </Collapse>
      ) : (
        <Box
          sx={{
            p: noPadding ? 0 : { xs: 1.25, sm: 1.5 },
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            ...(scrollBody && {
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-thumb': { borderRadius: 3, bgcolor: 'divider' },
            }),
          }}
        >
          {children}
        </Box>
      )}
    </Paper>
  );
}
