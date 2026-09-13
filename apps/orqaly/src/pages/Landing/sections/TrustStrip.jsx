import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { resolveAccent } from '../../../theme/enterpriseTheme';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AiOrb from '../../../components/VoiceControl/AiOrb';
import BrandIcon, { getBrandMeta } from './BrandIcon';

const HUB_HEIGHT = 272;
const MOBILE_ORB_SIZE = 121;
const MOBILE_CONNECTOR_HEIGHT = 64;
/** How far connector curves extend into the hub orb (px). */
const MOBILE_LINE_INTO_ORB = Math.round(MOBILE_ORB_SIZE * 0.38);

// ─── Data ───────────────────────────────────────────────────────────────────
function buildItem(slug, name, y, kind) {
  const meta = getBrandMeta(slug);
  return { slug, name, y, tint: `#${meta.hex}`, kind };
}

export const LEFT_ITEMS = [
  buildItem('openai', 'OpenAI', 0.15, 'llm'),
  buildItem('anthropic', 'Anthropic Claude', 0.5, 'llm'),
  buildItem('googlegemini', 'Google Gemini', 0.85, 'llm'),
];

export const RIGHT_ITEMS = [
  buildItem('figma', 'Figma', 0.15, 'tool'),
  buildItem('github', 'GitHub', 0.5, 'tool'),
  buildItem('cloudflare', 'Cloudflare', 0.85, 'tool'),
];

export function connectMessage(item) {
  if (!item) return '';
  const prefix = item.kind === 'llm' ? 'Provider' : 'Tool';
  return `${prefix}: ${item.name} (Added to Core)`;
}

function KindBadge({ kind }) {
  const theme = useTheme();
  const label = kind === 'llm' ? 'LLM' : 'Tool';
  return (
    <Box
      component="span"
      sx={{
        px: 0.85,
        py: 0.35,
        borderRadius: '9999px',
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: 'primary.main',
        bgcolor: alpha(theme.palette.primary.main, 0.12),
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.35),
        flexShrink: 0,
        lineHeight: 1.2,
      }}
    >
      {label}
    </Box>
  );
}

function ConnectConfirmDialog({ item, onClose }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Dialog
      open={Boolean(item)}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: isDark ? alpha('#fff', 0.04) : alpha('#fff', 0.92),
          border: `1px solid ${theme.palette.divider}`,
          backdropFilter: 'saturate(160%) blur(16px)',
          WebkitBackdropFilter: 'saturate(160%) blur(16px)',
          boxShadow: isDark
            ? `0 24px 48px ${alpha('#000', 0.45)}`
            : `0 24px 48px ${alpha('#000', 0.12)}`,
        },
      }}
    >
      <DialogContent sx={{ pt: 3, pb: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <CheckCircleOutlineIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: 'text.primary' }}>
            Added to Core
          </Typography>
        </Stack>
        {item && (
          <>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary', mb: 1 }}>
              {connectMessage(item)}
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.6 }}>
              Routed into your Orqaly orchestration layer.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={onClose}
          variant="contained"
          disableElevation
          sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3 }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddButton({ item, onConnect }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <IconButton
      size="small"
      onClick={(e) => {
        e.stopPropagation();
        onConnect(item);
      }}
      aria-label={`Add ${item.name}`}
      sx={{
        width: 26,
        height: 26,
        borderRadius: 1.25,
        flexShrink: 0,
        bgcolor: isDark ? alpha('#fff', 0.06) : alpha(theme.palette.text.primary, 0.04),
        border: `1px solid ${theme.palette.divider}`,
        color: 'text.secondary',
        transition: 'background 200ms ease, color 200ms ease, border-color 200ms ease',
        '&:hover': {
          bgcolor: alpha(theme.palette.primary.main, 0.15),
          color: theme.palette.primary.main,
          borderColor: alpha(theme.palette.primary.main, 0.35),
        },
      }}
    >
      <AddRoundedIcon sx={{ fontSize: 16 }} />
    </IconButton>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────
function HubCard({ item, side, onConnect, fullWidth = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        width: fullWidth ? '100%' : { md: 240, lg: 270 },
        px: 1.5,
        py: 1.25,
        borderRadius: 2.5,
        bgcolor: isDark ? alpha('#fff', 0.04) : alpha('#fff', 0.85),
        border: `1px solid ${theme.palette.divider}`,
        backdropFilter: 'saturate(160%) blur(12px)',
        WebkitBackdropFilter: 'saturate(160%) blur(12px)',
        boxShadow: isDark
          ? `0 6px 18px ${alpha('#000', 0.35)}`
          : `0 6px 18px ${alpha('#000', 0.06)}`,
        transition:
          'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease',
        '&:hover': {
          transform: side === 'left' ? 'translateX(-3px)' : 'translateX(3px)',
          borderColor: alpha(item.tint, 0.55),
          boxShadow: `0 10px 26px ${alpha(item.tint, 0.22)}`,
          bgcolor: isDark ? alpha(item.tint, 0.08) : alpha(item.tint, 0.04),
        },
      }}
    >
      <BrandIcon slug={item.slug} size={22} tone="#FFFFFF" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '0.95rem',
            color: 'text.primary',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.name}
        </Typography>
      </Box>
      <KindBadge kind={item.kind} />
      <AddButton item={item} onConnect={onConnect} />
    </Stack>
  );
}

// ─── Connectors ─────────────────────────────────────────────────────────────
function pathFromCard({ x, y }, orb) {
  const dx = orb.x - x;
  const dy = orb.y - y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const endX = orb.x - (dx / dist) * orb.r;
  const endY = orb.y - (dy / dist) * orb.r;
  const c1x = x + dx * 0.55;
  const c1y = y;
  const c2x = x + dx * 0.55;
  const c2y = endY;
  return `M ${x} ${y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
}

function ConnectorPaths({ width, height, paths, palette, idPrefix = 'hub' }) {
  if (!width || !height) return null;
  const gradId = `${idPrefix}LineGrad`;
  const gradRevId = `${idPrefix}LineGradReverse`;
  return (
    <svg
      data-testid="hub-connector-svg"
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={alpha(palette.primary, 0.05)} />
          <stop offset="60%" stopColor={alpha(palette.primary, 0.45)} />
          <stop offset="100%" stopColor={alpha(palette.primary, 0.75)} />
        </linearGradient>
        <linearGradient id={gradRevId} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor={alpha(palette.primary, 0.05)} />
          <stop offset="60%" stopColor={alpha(palette.primary, 0.45)} />
          <stop offset="100%" stopColor={alpha(palette.primary, 0.75)} />
        </linearGradient>
      </defs>
      {paths.map((p, i) => {
        const strokeMid =
          p.isLeft === true
            ? `url(#${gradId})`
            : p.isLeft === false
              ? `url(#${gradRevId})`
              : alpha(palette.primary, 0.55);
        const glowWidth = p.isLeft == null ? 5 : 6;
        const lineWidth = p.isLeft == null ? 1.25 : 1.5;
        return (
          <g key={p.key ?? i}>
            <path
              d={p.d}
              stroke={alpha(p.tint, 0.18)}
              strokeWidth={glowWidth}
              fill="none"
              strokeLinecap="round"
              style={{ filter: 'blur(3px)' }}
            />
            <path
              d={p.d}
              stroke={strokeMid}
              strokeWidth={lineWidth}
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={p.d}
              stroke={alpha(palette.primary, 0.95)}
              strokeWidth={lineWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray="3 14"
              style={{ animation: `hubFlow 3.2s linear ${i * 0.22}s infinite` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

function useHubSize(ref, fallbackH) {
  const [size, setSize] = useState({ w: 0, h: fallbackH });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// ─── Center orb ─────────────────────────────────────────────────────────────
function HubOrb({ size }) {
  const greenTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'dark',
          primary: resolveAccent(),
        },
      }),
    []
  );
  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: -size * 0.35,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(var(--app-accent-rgb),0.30) 0%, rgba(var(--app-accent-rgb),0.10) 35%, transparent 70%)',
          filter: 'blur(6px)',
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '1.5px solid rgba(var(--app-accent-rgb),0.35)',
          animation: 'hubRing 3.2s ease-in-out infinite',
          '@keyframes hubRing': {
            '0%, 100%': { opacity: 0.5, transform: 'scale(1)' },
            '50%': { opacity: 0.9, transform: 'scale(1.08)' },
          },
        }}
      />
      <ThemeProvider theme={greenTheme}>
        <AiOrb size={size} state="listening" />
      </ThemeProvider>
    </Box>
  );
}

// ─── Hub Layout (desktop) ───────────────────────────────────────────────────
function HubLayout({ onConnect }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const size = useHubSize(containerRef, HUB_HEIGHT);

  const cardWidth = size.w >= 1200 ? 270 : 240;
  const sideInset = 8;
  const orbSize = 140;
  const leftAnchorX = sideInset + cardWidth;
  const rightAnchorX = size.w - sideInset - cardWidth;
  const orb = { x: size.w / 2, y: size.h / 2, r: orbSize / 2 + 6 };

  const palette = { primary: theme.palette.primary.main };
  const connectorPaths = [
    ...LEFT_ITEMS.map((it) => ({
      key: `l-${it.slug}`,
      d: pathFromCard({ x: leftAnchorX, y: it.y * size.h }, orb),
      tint: it.tint,
      isLeft: true,
    })),
    ...RIGHT_ITEMS.map((it) => ({
      key: `r-${it.slug}`,
      d: pathFromCard({ x: rightAnchorX, y: it.y * size.h }, orb),
      tint: it.tint,
      isLeft: false,
    })),
  ];

  return (
    <Box sx={{ position: 'relative', height: HUB_HEIGHT, width: '100%' }}>
      <Box
        ref={containerRef}
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: HUB_HEIGHT,
          '@keyframes hubFlow': {
            to: { strokeDashoffset: -34 },
          },
        }}
      >
        <ConnectorPaths
          width={size.w}
          height={size.h}
          paths={connectorPaths}
          palette={palette}
          idPrefix="hubDesktop"
        />

        <Box sx={{ position: 'absolute', left: sideInset, top: 0, height: '100%' }}>
          {LEFT_ITEMS.map((it) => (
            <Box
              key={it.slug}
              sx={{
                position: 'absolute',
                top: `${it.y * 100}%`,
                left: 0,
                transform: 'translateY(-50%)',
              }}
            >
              <HubCard item={it} side="left" onConnect={onConnect} />
            </Box>
          ))}
        </Box>

        <Box sx={{ position: 'absolute', right: sideInset, top: 0, height: '100%' }}>
          {RIGHT_ITEMS.map((it) => (
            <Box
              key={it.slug}
              sx={{
                position: 'absolute',
                top: `${it.y * 100}%`,
                right: 0,
                transform: 'translateY(-50%)',
              }}
            >
              <HubCard item={it} side="right" onConnect={onConnect} />
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 2,
          }}
        >
          <HubOrb size={orbSize} />
        </Box>
      </Box>
    </Box>
  );
}

// ─── Mobile vertical connectors (original curved strips) ─────────────────────
function MobileConnectors({ items, direction, intoOrb = MOBILE_LINE_INTO_ORB }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const size = useHubSize(containerRef, MOBILE_CONNECTOR_HEIGHT);

  const { w, h } = size;
  const orbX = w / 2;
  // Target sits inside the real orb (below top strip / above bottom strip).
  const orbY = direction === 'down' ? h + intoOrb : -intoOrb;
  const orbR = 0;

  const anchorY = direction === 'down' ? 0 : h;
  const anchorXs = w ? [w * 0.18, w * 0.5, w * 0.82] : [0, 0, 0];

  const paths = anchorXs.map((x) => {
    const dx = orbX - x;
    const dy = orbY - anchorY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const endX = orbX - (dx / dist) * orbR;
    const endY = orbY - (dy / dist) * orbR;
    const c1x = x;
    const c1y = anchorY + dy * 0.55;
    const c2x = orbX;
    const c2y = anchorY + dy * 0.45;
    return `M ${x} ${anchorY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
  });

  return (
    <Box
      ref={containerRef}
      data-testid="mobile-connector-strip"
      sx={{
        position: 'relative',
        width: '100%',
        height: MOBILE_CONNECTOR_HEIGHT,
        overflow: 'visible',
        zIndex: 1,
        '@keyframes hubFlow': { to: { strokeDashoffset: -34 } },
      }}
    >
      {w > 0 && (
        <svg
          width={w}
          height={h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          {paths.map((d, i) => {
            const tint = items[i]?.tint || theme.palette.primary.main;
            return (
              <g key={i}>
                <path
                  d={d}
                  stroke={alpha(tint, 0.18)}
                  strokeWidth={5}
                  fill="none"
                  strokeLinecap="round"
                  style={{ filter: 'blur(3px)' }}
                />
                <path
                  d={d}
                  stroke={alpha(theme.palette.primary.main, 0.55)}
                  strokeWidth={1.25}
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d={d}
                  stroke={alpha(theme.palette.primary.main, 0.95)}
                  strokeWidth={1.25}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="3 14"
                  style={{ animation: `hubFlow 3.2s linear ${i * 0.22}s infinite` }}
                />
              </g>
            );
          })}
        </svg>
      )}
    </Box>
  );
}

function GridLayout({ onConnect }) {
  return (
    <Stack spacing={1.5} alignItems="stretch" sx={{ width: '100%', maxWidth: 360, mx: 'auto' }}>
      {LEFT_ITEMS.map((it) => (
        <HubCard key={it.slug} item={it} side="left" onConnect={onConnect} fullWidth />
      ))}
      <Box sx={{ position: 'relative', width: '100%' }}>
        <MobileConnectors items={LEFT_ITEMS} direction="down" />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 2,
            mt: `${-MOBILE_LINE_INTO_ORB}px`,
            mb: `${-MOBILE_LINE_INTO_ORB}px`,
          }}
        >
          <HubOrb size={MOBILE_ORB_SIZE} />
        </Box>
        <MobileConnectors items={RIGHT_ITEMS} direction="up" />
      </Box>
      {RIGHT_ITEMS.map((it) => (
        <HubCard key={it.slug} item={it} side="right" onConnect={onConnect} fullWidth />
      ))}
    </Stack>
  );
}

// ─── Section ────────────────────────────────────────────────────────────────
export default function TrustStrip() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const isDark = theme.palette.mode === 'dark';
  const [connectItem, setConnectItem] = useState(null);

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: isDark ? alpha('#fff', 0.015) : alpha(theme.palette.text.primary, 0.015),
        position: 'relative',
        overflow: { xs: 'visible', md: 'hidden' },
        touchAction: 'pan-y',
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: { xs: 6, md: 8 } }}>
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            Integrations
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1.85rem', md: '2.5rem' },
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'text.primary',
              maxWidth: 760,
              letterSpacing: '-0.01em',
            }}
          >
            Plug in any LLM &amp; Tool
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.1rem' },
              color: 'text.secondary',
              maxWidth: 620,
              lineHeight: 1.55,
            }}
          >
            One workspace for everything.
          </Typography>
        </Stack>

        {isDesktop ? (
          <HubLayout onConnect={setConnectItem} />
        ) : (
          <GridLayout onConnect={setConnectItem} />
        )}
      </Container>

      <ConnectConfirmDialog item={connectItem} onClose={() => setConnectItem(null)} />
    </Box>
  );
}
