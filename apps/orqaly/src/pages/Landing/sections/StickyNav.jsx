import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Collapse,
  Container,
  Divider,
  Drawer,
  Fade,
  IconButton,
  MenuItem,
  Popover,
  Popper,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import XIcon from '@mui/icons-material/X';
import GitHubIcon from '@mui/icons-material/GitHub';
import YouTubeIcon from '@mui/icons-material/YouTube';
import CircleIcon from '@mui/icons-material/Circle';
import LanguageIcon from '@mui/icons-material/Language';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import { createElement } from 'react';
import AiOrb from '../../../components/VoiceControl/AiOrb';
import { PERSONAS } from '../../../data/personas';
import { CONTROL_NAV_SLUG_ORDER, INSTRUMENTS_BY_GROUP } from '../../../data/instruments';
import { lookupMuiFallback, DEFAULT_FALLBACK } from '../../../components/icons/muiFallbackMap';
import { releaseBodyScrollLock } from '../../../utils/mobileTouchScroll';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import AppIcon from '../../../components/icons/AppIcon';

// Per-slug short menu taglines. Kept here (not in instruments.js) because
// they are tuned for narrow menu rows, not the longer page-hero subtitles.
const PRODUCT_SUB = {
  'knowledge-base': 'Your shared agent memory',
  workflow: 'Trigger, chain, branch, observe',
  'task-manager': 'Tasks agents can finish',
  projects: 'Outcomes, scoped and tracked',
  reports: 'Reports that write themselves',
  dashboards: 'Charts built by description',
  replicators: 'Spin up sites in one click',
  'simple-mode': 'Card-first UI for everyday operators',
  organizations: 'Develop scalable agent structures.',
  consilium: 'AI-Powered Decision Layer',
  agents: 'Choose agent, create team, improve skills.',
  requests: 'Manage goals in one place.',
  tools: 'Connectors with permissions',
  communicator: 'All communications in one place.',
};

const MARKETPLACE_NAV_LINK = {
  label: 'Marketplace',
  desc: 'Buy, install, publish, earn',
  iconName: 'StorefrontRounded',
  to: '/marketplace-preview',
};

const EARN_NAV_LINK = {
  label: 'Earn Program',
  desc: 'Find your category and start earning today.',
  iconName: 'SavingsOutlined',
  to: '/earn',
};

const CONTROL_NAV_LABEL_OVERRIDES = {
  requests: 'Request',
};

function mapControlNavLink(it) {
  return {
    label: CONTROL_NAV_LABEL_OVERRIDES[it.slug] ?? it.label,
    desc: PRODUCT_SUB[it.slug],
    iconName: it.iconName,
    to: `/control/${it.slug}`,
  };
}

/** Control Point column: primary pages, then Marketplace, Simple Mode, Earn. */
function buildControlPointNavLinks() {
  const simpleModeIndex = CONTROL_NAV_SLUG_ORDER.indexOf('simple-mode');
  const primary = INSTRUMENTS_BY_GROUP.control.slice(0, simpleModeIndex);
  const tail = INSTRUMENTS_BY_GROUP.control.slice(simpleModeIndex);
  return [...primary.map(mapControlNavLink), MARKETPLACE_NAV_LINK, ...tail.map(mapControlNavLink)];
}

const PERSONA_SUB = {
  healthcare: 'Voice triage, intake, reminders',
  'real-estate': 'Lead reply in under a minute',
  ecommerce: 'Orders, suppliers, support',
  restaurants: 'Housekeeping, room service, partners',
  education: 'Summaries, paths, knowledge base',
  legal: 'Ecosystem, reports, encrypted vault',
  marketing: 'SMM packs, metrics, partner traffic',
  creators: 'Studio stack: research to metrics',
  freelancers: 'Proposals, invoices, follow-ups',
  manufacturing: 'Supplier inbox, QC, inventory',
};

const NAV = [
  {
    id: 'product',
    label: 'Product',
    width: 780,
    columns: [
      {
        heading: 'Control Point',
        subheading: 'Manage the system',
        links: buildControlPointNavLinks(),
      },
      {
        heading: 'Instruments',
        subheading: 'Organize the work',
        links: INSTRUMENTS_BY_GROUP.instruments.map((it) => ({
          label: it.label,
          desc: PRODUCT_SUB[it.slug],
          iconName: it.iconName,
          to: `/instruments/${it.slug}`,
        })),
      },
    ],
    footer: { label: 'Compare every surface →', to: '/instruments/knowledge-base' },
  },
  {
    id: 'solutions',
    label: 'Solutions',
    width: 760,
    columns: [
      {
        heading: 'By industry',
        subheading: 'Pre-tuned for these teams',
        links: PERSONAS.slice(0, 5).map((p) => ({
          label: p.label,
          desc: PERSONA_SUB[p.slug],
          iconName: p.iconName,
          to: `/solutions/${p.slug}`,
        })),
      },
      {
        heading: '',
        subheading: '',
        links: PERSONAS.slice(5).map((p) => ({
          label: p.label,
          desc: PERSONA_SUB[p.slug],
          iconName: p.iconName,
          to: `/solutions/${p.slug}`,
        })),
      },
    ],
    footer: { label: 'See all industries →', to: '/solutions/healthcare' },
  },
  { id: 'pricing', label: 'Pricing', to: '/pricing' },
  {
    id: 'resources',
    label: 'Resources',
    width: 560,
    columns: [
      {
        heading: 'Learn',
        subheading: 'How it works',
        links: [
          {
            label: 'Docs',
            desc: 'Get started in 5 minutes',
            iconName: 'MenuBookOutlined',
            to: '/docs',
          },
          {
            label: 'FAQ',
            desc: 'Every common question answered',
            iconName: 'HelpOutlineOutlined',
            to: '/faq',
          },
          {
            label: 'Security',
            desc: 'How we protect your data',
            iconName: 'ShieldOutlined',
            to: '/security',
          },
        ],
      },
      {
        heading: 'Company',
        subheading: 'Who we are',
        links: [
          {
            label: 'About',
            desc: 'Our mission and team',
            iconName: 'AutoAwesomeOutlined',
            to: '/about',
          },
          { label: 'Contact', desc: 'Talk to a human', iconName: 'EmailOutlined', to: '/contact' },
        ],
      },
    ],
  },
];

// Slow ambient orb cluster. Six green orbs of varying sizes drift on
// independent (prime-ish) loops so paths never re-sync. Reduced-motion
// users see a static cluster.
const CLUSTER_ORBS = [
  { size: 26, top: 11, left: 27, dur: 29, delay: -3, dx: 8, dy: 6 },
  { size: 20, top: 4, left: 6, dur: 23, delay: -7, dx: 12, dy: 8 },
  { size: 16, top: 22, left: 52, dur: 19, delay: -11, dx: 14, dy: 10 },
  { size: 12, top: 2, left: 44, dur: 17, delay: -5, dx: 16, dy: 12 },
  { size: 10, top: 26, left: 4, dur: 13, delay: -9, dx: 18, dy: 14 },
  { size: 8, top: 30, left: 64, dur: 11, delay: -2, dx: 18, dy: 16 },
];

function NavOrbCluster() {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative',
        width: 80,
        height: 48,
        overflow: 'visible',
        flexShrink: 0,
        '@keyframes navOrbDrift0': {
          '0%, 100%': { transform: 'translate(0, 0)', opacity: 0.7 },
          '50%': {
            transform: `translate(${CLUSTER_ORBS[0].dx}px, ${CLUSTER_ORBS[0].dy}px)`,
            opacity: 1,
          },
        },
        '@keyframes navOrbDrift1': {
          '0%, 100%': { transform: `translate(${CLUSTER_ORBS[1].dx}px, 0)`, opacity: 0.55 },
          '50%': {
            transform: `translate(-${CLUSTER_ORBS[1].dx}px, ${CLUSTER_ORBS[1].dy}px)`,
            opacity: 0.95,
          },
        },
        '@keyframes navOrbDrift2': {
          '0%, 100%': { transform: `translate(0, ${CLUSTER_ORBS[2].dy}px)`, opacity: 0.5 },
          '50%': {
            transform: `translate(${CLUSTER_ORBS[2].dx}px, -${CLUSTER_ORBS[2].dy}px)`,
            opacity: 0.9,
          },
        },
        '@keyframes navOrbDrift3': {
          '0%, 100%': { transform: `translate(-${CLUSTER_ORBS[3].dx}px, 0)`, opacity: 0.45 },
          '50%': {
            transform: `translate(${CLUSTER_ORBS[3].dx}px, ${CLUSTER_ORBS[3].dy}px)`,
            opacity: 0.85,
          },
        },
        '@keyframes navOrbDrift4': {
          '0%, 100%': { transform: `translate(0, -${CLUSTER_ORBS[4].dy}px)`, opacity: 0.5 },
          '50%': {
            transform: `translate(${CLUSTER_ORBS[4].dx}px, ${CLUSTER_ORBS[4].dy}px)`,
            opacity: 0.8,
          },
        },
        '@keyframes navOrbDrift5': {
          '0%, 100%': {
            transform: `translate(${CLUSTER_ORBS[5].dx}px, ${CLUSTER_ORBS[5].dy}px)`,
            opacity: 0.45,
          },
          '50%': {
            transform: `translate(-${CLUSTER_ORBS[5].dx}px, -${CLUSTER_ORBS[5].dy}px)`,
            opacity: 0.75,
          },
        },
      }}
    >
      {CLUSTER_ORBS.map((o, idx) => (
        <Box
          key={idx}
          sx={{
            position: 'absolute',
            top: `${o.top}px`,
            left: `${o.left}px`,
            width: `${o.size}px`,
            height: `${o.size}px`,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, var(--app-accent-light) 0%, var(--app-accent) 55%, rgba(var(--app-accent-rgb), 0) 75%)`,
            boxShadow: `0 0 ${o.size * 0.8}px rgba(var(--app-accent-rgb), 0.45)`,
            animation: `navOrbDrift${idx} ${o.dur}s ease-in-out ${o.delay}s infinite`,
            willChange: 'transform, opacity',
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              opacity: 1,
            },
          }}
        />
      ))}
    </Box>
  );
}

const BURGER_LINE_GAP_PX = 5;
const BURGER_LINE_WIDTH_PX = 16;
const BURGER_LINE_HEIGHT_PX = 2;

/** Two-line burger for the mobile drawer; animates to an X when the drawer is open. */
function MobileMenuBurgerIcon({ pressed, open, reduceMotion }) {
  const lineTransition = reduceMotion
    ? 'none'
    : 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), width 220ms ease, opacity 200ms ease';

  const lineTransform = (index) => {
    if (reduceMotion) return 'none';
    if (open) {
      const offset = BURGER_LINE_GAP_PX / 2 + BURGER_LINE_HEIGHT_PX / 2;
      return index === 0
        ? `translateY(${offset}px) rotate(45deg)`
        : `translateY(-${offset}px) rotate(-45deg)`;
    }
    if (pressed) {
      return index === 0 ? 'scaleX(0.82) translateY(1px)' : 'scaleX(0.82) translateY(-1px)';
    }
    return 'none';
  };

  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${BURGER_LINE_GAP_PX}px`,
        width: 18,
        height: 18,
      }}
    >
      {[0, 1].map((index) => (
        <Box
          key={index}
          sx={{
            width: BURGER_LINE_WIDTH_PX,
            height: BURGER_LINE_HEIGHT_PX,
            borderRadius: 999,
            bgcolor: 'currentColor',
            transformOrigin: 'center',
            transition: lineTransition,
            transform: lineTransform(index),
            opacity: pressed && !open ? 0.82 : 1,
          }}
        />
      ))}
    </Box>
  );
}

function MobileMenuTrigger({ open, onToggle }) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const handleClick = () => {
    onToggle();
    if (reduceMotion) return;
    setPressed(true);
    window.setTimeout(() => setPressed(false), 240);
  };

  return (
    <IconButton
      size="small"
      onClick={handleClick}
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      sx={{
        color: 'text.primary',
        width: 36,
        height: 36,
        p: 0.75,
        borderRadius: 1.5,
        border: `1px solid ${alpha(theme.palette.divider, 0.55)}`,
        bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.06 : 0.04),
        transition: reduceMotion
          ? 'background-color 180ms ease, border-color 180ms ease'
          : 'transform 220ms cubic-bezier(0.4, 0, 0.2, 1), background-color 180ms ease, border-color 180ms ease',
        transform: !reduceMotion && pressed ? 'scale(0.9)' : 'scale(1)',
        '&:hover': {
          bgcolor: alpha(theme.palette.primary.main, 0.08),
          borderColor: alpha(theme.palette.primary.main, 0.35),
        },
        ...(!reduceMotion && {
          '&:active': { transform: 'scale(0.9)' },
        }),
      }}
    >
      <MobileMenuBurgerIcon
        pressed={!reduceMotion && pressed}
        open={open}
        reduceMotion={reduceMotion}
      />
    </IconButton>
  );
}

// Small flat icon tile used inside menu rows. Picks the right MUI icon by
// name via the same fallback map LandingGlassIcon uses, so any name passed
// from the data files renders correctly.
function MenuIconTile({ iconName, size = 18 }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const Icon = lookupMuiFallback(iconName) || DEFAULT_FALLBACK;
  return (
    <Box
      className="menu-tile"
      sx={{
        width: 36,
        height: 36,
        borderRadius: 1.75,
        bgcolor: alpha(primary, 0.1),
        color: 'primary.main',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background-color 180ms ease, transform 180ms ease',
      }}
    >
      {createElement(Icon, { sx: { fontSize: size, display: 'block' } })}
    </Box>
  );
}

function MenuRow({ link, onClose }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      component={RouterLink}
      to={link.to}
      onClick={onClose}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        p: 1.15,
        borderRadius: 2,
        textDecoration: 'none',
        color: 'text.primary',
        border: '1px solid transparent',
        transition: 'background-color 180ms ease, border-color 180ms ease, transform 180ms ease',
        '&:hover': {
          bgcolor: alpha(primary, 0.08),
          borderColor: alpha(primary, 0.22),
          '& .menu-tile': {
            bgcolor: alpha(primary, 0.2),
            transform: 'scale(1.06)',
          },
          '& .menu-arrow': {
            opacity: 1,
            transform: 'translateX(2px)',
          },
        },
        '&:focus-visible': {
          outline: `2px solid ${alpha(primary, 0.55)}`,
          outlineOffset: 2,
        },
      }}
    >
      <MenuIconTile iconName={link.iconName} />
      <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'text.primary' }}>
            {link.label}
          </Typography>
          <ArrowForwardIcon
            className="menu-arrow"
            sx={{
              fontSize: 14,
              color: 'primary.main',
              opacity: 0,
              transform: 'translateX(-2px)',
              transition: 'opacity 180ms ease, transform 180ms ease',
            }}
          />
        </Stack>
        {link.desc && (
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.45 }}>
            {link.desc}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function MegaMenu({ anchorEl, open, onClose, onCancelClose, item }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  if (!item?.columns) return null;

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom-start"
      transition
      disablePortal={false}
      modifiers={[{ name: 'offset', options: { offset: [-16, 6] } }]}
      sx={{ zIndex: 1200 }}
    >
      {({ TransitionProps }) => (
        <Fade {...TransitionProps} timeout={prefersReducedMotion ? 0 : 180}>
          <Box
            onMouseEnter={onCancelClose}
            onMouseLeave={onClose}
            sx={{
              minWidth: item.width || (item.columns.length > 2 ? 700 : 460),
              p: 1.5,
              mt: 1,
              borderRadius: 3,
              bgcolor: isDark
                ? alpha(theme.palette.background.paper, 0.78)
                : alpha(theme.palette.background.paper, 0.92),
              border: `1px solid ${alpha(theme.palette.divider, isDark ? 0.9 : 1)}`,
              boxShadow: isDark
                ? `0 30px 60px ${alpha(theme.palette.common.black, 0.45)}, 0 2px 10px ${alpha(theme.palette.common.black, 0.18)}`
                : `0 24px 60px ${alpha(theme.palette.common.black, 0.18)}, 0 2px 8px ${alpha(theme.palette.common.black, 0.06)}`,
              backdropFilter: 'saturate(180%) blur(18px)',
              WebkitBackdropFilter: 'saturate(180%) blur(18px)',
              // Invisible hover bridge above the panel so the cursor doesn't
              // fall into a gap between trigger and popper.
              '&::before': {
                content: '""',
                position: 'absolute',
                top: -16,
                left: 0,
                right: 0,
                height: 16,
              },
            }}
          >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'stretch' }}>
              {item.columns.map((col, idx) => (
                <Stack key={idx} spacing={0.75} sx={{ flex: 1, minWidth: 240 }}>
                  {col.heading && (
                    <Stack spacing={0.25} sx={{ px: 1.25, pt: 0.75, pb: 0.5 }}>
                      <Typography
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'primary.main',
                        }}
                      >
                        {col.heading}
                      </Typography>
                      {col.subheading && (
                        <Typography
                          sx={{ fontSize: '0.74rem', color: 'text.secondary', lineHeight: 1.3 }}
                        >
                          {col.subheading}
                        </Typography>
                      )}
                    </Stack>
                  )}
                  <Stack spacing={0.15}>
                    {col.links.map((link) => (
                      <MenuRow key={link.to + link.label} link={link} onClose={onClose} />
                    ))}
                  </Stack>
                </Stack>
              ))}
            </Stack>
            {item.footer && (
              <>
                <Divider sx={{ my: 1.25, mx: 1, borderColor: alpha(theme.palette.divider, 0.7) }} />
                <Box
                  component={RouterLink}
                  to={item.footer.to}
                  onClick={onClose}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mx: 1.25,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 999,
                    textDecoration: 'none',
                    color: 'primary.main',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                    transition:
                      'color 180ms ease, transform 180ms ease, background-color 180ms ease, border-color 180ms ease',
                    '&:hover': {
                      color: 'primary.dark',
                      transform: 'translateX(2px)',
                      bgcolor: alpha(theme.palette.primary.main, 0.14),
                      borderColor: alpha(theme.palette.primary.main, 0.4),
                    },
                  }}
                >
                  {item.footer.label}
                </Box>
              </>
            )}
          </Box>
        </Fade>
      )}
    </Popper>
  );
}

function DesktopNavItem({ item, activeId, onOpen, onClose, isOpen }) {
  const theme = useTheme();
  const isHash = item.to?.startsWith('/#');
  const localId = isHash ? item.to.slice(2) : null;
  const isActive = activeId && localId === activeId;

  const triggerSx = {
    textDecoration: 'none',
    color: isActive ? 'text.primary' : 'text.secondary',
    fontSize: '0.92rem',
    fontWeight: 600,
    cursor: 'pointer',
    py: 0.75,
    px: 1.25,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.4,
    transition: 'color 180ms ease, background-color 180ms ease',
    position: 'relative',
    '&:hover': {
      color: 'text.primary',
      bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.06 : 0.045),
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: -2,
      height: 2,
      borderRadius: 2,
      bgcolor: 'primary.main',
      transform: isActive ? 'scaleX(1)' : 'scaleX(0)',
      transformOrigin: 'left',
      transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1)',
    },
  };

  if (item.columns) {
    const trigger = (e) => onOpen(item.id, e.currentTarget);
    return (
      <Box
        component="button"
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onMouseEnter={trigger}
        onFocus={trigger}
        onClick={trigger}
        sx={{
          ...triggerSx,
          background: 'transparent',
          border: 'none',
          font: 'inherit',
          '&:focus-visible': {
            outline: `2px solid ${alpha(theme.palette.primary.main, 0.55)}`,
            outlineOffset: 4,
            borderRadius: 4,
          },
        }}
      >
        {item.label}
        <ExpandMoreIcon
          sx={{
            fontSize: 18,
            opacity: 0.7,
            transition: 'transform 180ms ease',
            transform: isOpen ? 'rotate(180deg)' : 'none',
          }}
        />
      </Box>
    );
  }

  return (
    <Box component={RouterLink} to={item.to} onClick={onClose} sx={triggerSx}>
      {item.label}
    </Box>
  );
}

function useActiveAnchor() {
  const [activeId, setActiveId] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveId(null);
      return undefined;
    }
    const ids = [
      'features',
      'voice',
      'problem',
      'how-it-works',
      'personas',
      'consilium',
      'token-tracking',
      'pricing',
      'earn',
      'tech',
      'faq',
    ];
    const zones = ids
      .map((id) => document.querySelector(`[data-orb-section="${id}"]`))
      .filter(Boolean);
    if (!zones.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const id = visible.target.getAttribute('data-orb-section');
          setActiveId(id);
        }
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: [0.1, 0.4, 0.8] }
    );
    zones.forEach((z) => observer.observe(z));
    return () => observer.disconnect();
  }, [location.pathname]);

  return activeId;
}

const SOCIAL_LINKS = [
  { Icon: LinkedInIcon, label: 'LinkedIn', href: '#' },
  { Icon: XIcon, label: 'X (Twitter)', href: '#' },
  { Icon: GitHubIcon, label: 'GitHub', href: '#' },
  { Icon: YouTubeIcon, label: 'YouTube', href: '#' },
];

export default function StickyNav({ onPrimaryCta }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menuId, setMenuId] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const hoverTimer = useRef(null);
  const activeId = useActiveAnchor();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMenuId(null);
    setAnchorEl(null);
  }, [location.pathname]);

  useEffect(() => {
    // body scroll lock while drawer is open (iOS-safe: position fixed + restore scroll)
    if (!open || typeof document === 'undefined') return undefined;
    const scrollY = window.scrollY;
    const { style } = document.body;
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
    style.overflow = 'hidden';
    return () => {
      releaseBodyScrollLock({ restoreY: scrollY });
    };
  }, [open]);

  useEffect(() => () => releaseBodyScrollLock(), []);

  const openMenu = useCallback((id, el) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setAnchorEl(el || null);
    setMenuId(id);
  }, []);

  const closeMenu = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setMenuId(null);
      setAnchorEl(null);
    }, 400);
  }, []);

  const cancelClose = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleGetStarted = useCallback(
    (e) => {
      e?.preventDefault?.();
      if (onPrimaryCta) onPrimaryCta();
      else navigate('/signup');
      setOpen(false);
    },
    [onPrimaryCta, navigate]
  );

  const activeItem = NAV.find((i) => i.id === menuId);

  return (
    <>
      {/* Skip-to-content link */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: 8,
          top: 8,
          p: 1,
          bgcolor: 'background.paper',
          color: 'primary.main',
          fontWeight: 700,
          fontSize: '0.85rem',
          borderRadius: 1,
          textDecoration: 'none',
          zIndex: 2000,
          transform: 'translateY(-200%)',
          '&:focus': { transform: 'translateY(0)' },
        }}
      >
        Skip to content
      </Box>

      <Box
        component="header"
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          py: isMobile ? (scrolled ? 0.85 : 1) : scrolled ? 0.75 : 1.25,
          backdropFilter: isMobile
            ? scrolled
              ? 'saturate(180%) blur(18px)'
              : 'saturate(140%) blur(10px)'
            : scrolled
              ? 'saturate(180%) blur(18px)'
              : 'none',
          WebkitBackdropFilter: isMobile
            ? scrolled
              ? 'saturate(180%) blur(18px)'
              : 'saturate(140%) blur(10px)'
            : scrolled
              ? 'saturate(180%) blur(18px)'
              : 'none',
          bgcolor: isMobile
            ? alpha(theme.palette.background.default, scrolled ? 0.84 : 0.62)
            : scrolled
              ? alpha(theme.palette.background.default, 0.78)
              : 'transparent',
          borderBottom: isMobile
            ? `1px solid ${alpha(theme.palette.divider, scrolled ? 0.9 : 0.4)}`
            : scrolled
              ? `1px solid ${alpha(theme.palette.divider, 0.9)}`
              : '1px solid transparent',
          transition:
            'padding 220ms ease, background-color 220ms ease, border-color 220ms ease, backdrop-filter 220ms ease',
        }}
        onMouseLeave={closeMenu}
      >
        <Container maxWidth="lg">
          <Stack
            direction="row"
            alignItems="center"
            justifyContent={isMobile && open ? 'flex-end' : 'space-between'}
          >
            <Box
              component={RouterLink}
              to="/"
              aria-label="Orqaly - home"
              sx={{
                display: isMobile && open ? 'none' : 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                textDecoration: 'none',
              }}
            >
              <NavOrbCluster />
            </Box>

            {!isMobile && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                {NAV.map((item) => (
                  <DesktopNavItem
                    key={item.id}
                    item={item}
                    activeId={activeId}
                    isOpen={menuId === item.id}
                    onOpen={openMenu}
                    onClose={() => {
                      setMenuId(null);
                      setAnchorEl(null);
                    }}
                  />
                ))}
              </Stack>
            )}

            <Stack direction="row" spacing={1.25} alignItems="center">
              {!isMobile && (
                <Button
                  component={RouterLink}
                  to="/login"
                  variant="text"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.92rem',
                    textTransform: 'none',
                    color: 'text.secondary',
                    borderRadius: 999,
                    px: 1.75,
                    py: 0.75,
                    transition: 'color 180ms ease, background-color 180ms ease',
                    '&:hover': {
                      color: 'text.primary',
                      bgcolor: alpha(
                        theme.palette.text.primary,
                        theme.palette.mode === 'dark' ? 0.06 : 0.045
                      ),
                    },
                  }}
                >
                  Log in
                </Button>
              )}
              {isMobile && <MobileMenuTrigger open={open} onToggle={() => setOpen((v) => !v)} />}
            </Stack>
          </Stack>
        </Container>
      </Box>

      {!isMobile && activeItem && (
        <MegaMenu
          anchorEl={anchorEl}
          open={Boolean(menuId) && Boolean(anchorEl)}
          onClose={closeMenu}
          onCancelClose={cancelClose}
          item={activeItem}
        />
      )}

      <MobileDrawer open={open} onClose={() => setOpen(false)} onGetStarted={handleGetStarted} />
    </>
  );
}

const NAV_ICONS = {
  product: ExtensionOutlinedIcon,
  solutions: AccountTreeOutlinedIcon,
  pricing: SellOutlinedIcon,
  resources: MenuBookOutlinedIcon,
};

const LANG_OPTIONS = [
  { code: 'EN', label: 'English' },
  { code: 'LV', label: 'Latviešu' },
  { code: 'RU', label: 'Русский' },
];

// TODO: wire to react-i18next when localisation work begins. For now the
// selection is display-only and stored locally so we can demo the popover.
function readStoredLang() {
  if (typeof window === 'undefined') return 'EN';
  try {
    const v = localStorage.getItem('orchestratori_lang');
    return LANG_OPTIONS.some((o) => o.code === v) ? v : 'EN';
  } catch {
    return 'EN';
  }
}

// eslint-disable-next-line no-unused-vars
function MobileDrawer({ open, onClose, onGetStarted }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [lang, setLang] = useState(readStoredLang);
  const [langAnchor, setLangAnchor] = useState(null);
  const pickLang = (code) => {
    setLang(code);
    setLangAnchor(null);
    try {
      localStorage.setItem('orchestratori_lang', code);
    } catch {
      /* private */
    }
  };

  const iconCircleSx = {
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: isDark ? alpha(theme.palette.background.paper, 0.55) : alpha('#ffffff', 0.7),
    border: '1px solid',
    borderColor: isDark ? alpha('#ffffff', 0.1) : alpha(theme.palette.divider, 0.6),
    backdropFilter: 'saturate(180%) blur(12px)',
    WebkitBackdropFilter: 'saturate(180%) blur(12px)',
    boxShadow: isDark
      ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
      : 'inset 0 1px 0 rgba(255,255,255,0.7)',
    color: 'primary.main',
  };

  const glassCardSx = {
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: isDark
      ? alpha(theme.palette.background.paper, 0.5)
      : alpha(theme.palette.background.paper, 0.7),
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  };

  const tileBaseSx = {
    ...glassCardSx,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    p: 1.25,
    gap: 1,
    color: 'text.primary',
    textAlign: 'left',
    transition: 'transform .15s ease, background .15s ease, border-color .15s ease',
    '&:hover': {
      transform: 'translateY(-1px)',
      bgcolor: isDark
        ? alpha(theme.palette.background.paper, 0.7)
        : alpha(theme.palette.background.paper, 0.92),
      borderColor: alpha(theme.palette.primary.main, 0.4),
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
      '&:hover': { transform: 'none' },
    },
  };

  const pillSx = {
    px: 1,
    py: 0.4,
    borderRadius: '9999px',
    fontSize: '0.68rem',
    fontWeight: 700,
    color: 'primary.main',
    bgcolor: alpha(theme.palette.primary.main, 0.12),
    border: '1px solid',
    borderColor: alpha(theme.palette.primary.main, 0.35),
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{ disableScrollLock: true }}
      PaperProps={{
        sx: {
          width: { xs: '92vw', sm: 360 },
          maxWidth: 400,
          bgcolor: 'background.default',
        },
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          p: 1.25,
          gap: 1,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="flex-end"
          sx={{ mb: 0.25, minHeight: 36 }}
        >
          <IconButton onClick={onClose} aria-label="Close menu" size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack
          spacing={1}
          sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', pb: 1 }}
        >
          {NAV.map((item) => (
            <DrawerNavCard
              key={item.id}
              item={item}
              IconComp={NAV_ICONS[item.id]}
              iconCircleSx={iconCircleSx}
              tileBaseSx={tileBaseSx}
              glassCardSx={glassCardSx}
              onLink={onClose}
            />
          ))}

          <Box sx={{ ...glassCardSx, p: 1.25 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={0.25}>
                {SOCIAL_LINKS.map(({ Icon, label, href }) => (
                  <IconButton
                    key={label}
                    component="a"
                    href={href}
                    aria-label={label}
                    size="small"
                    sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                  >
                    <AppIcon fallback={Icon} fontSize="small" />
                  </IconButton>
                ))}
              </Stack>
              <Box
                component={RouterLink}
                to="/status"
                onClick={onClose}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  textDecoration: 'none',
                  fontSize: '0.78rem',
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary' },
                }}
              >
                <CircleIcon sx={{ fontSize: 9, color: '#10B981' }} />
                Status
              </Box>
            </Stack>
          </Box>
        </Stack>

        {/* Language selector - sits directly above the login CTA */}
        <Box sx={{ ...glassCardSx, p: 0.5, mb: 1 }}>
          <Button
            onClick={(e) => setLangAnchor(e.currentTarget)}
            size="small"
            startIcon={<LanguageIcon sx={{ fontSize: 16 }} />}
            sx={{
              color: 'text.secondary',
              textTransform: 'none',
              fontWeight: 600,
              width: '100%',
              justifyContent: 'flex-start',
              pl: 1.25,
              py: 0.75,
            }}
            aria-haspopup="listbox"
            aria-expanded={langAnchor ? 'true' : 'false'}
          >
            {lang}
          </Button>
        </Box>

        <Popover
          open={Boolean(langAnchor)}
          anchorEl={langAnchor}
          onClose={() => setLangAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          slotProps={{
            paper: {
              sx: {
                mt: -0.5,
                minWidth: 160,
                borderRadius: 2,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              },
            },
          }}
        >
          {LANG_OPTIONS.map((opt) => (
            <MenuItem
              key={opt.code}
              selected={opt.code === lang}
              onClick={() => pickLang(opt.code)}
              sx={{ py: 1 }}
            >
              <Box sx={{ minWidth: 32, fontWeight: 700 }}>{opt.code}</Box>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {opt.label}
              </Typography>
            </MenuItem>
          ))}
        </Popover>

        <ButtonBase
          component={RouterLink}
          to="/login"
          onClick={onClose}
          focusRipple
          sx={tileBaseSx}
        >
          <Box aria-hidden sx={iconCircleSx}>
            <LoginOutlinedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.15 }}>
              Log in
            </Typography>
            <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary', lineHeight: 1.2 }}>
              Access your workspace
            </Typography>
          </Box>
          <Box sx={pillSx}>Sign in →</Box>
        </ButtonBase>
      </Box>
    </Drawer>
  );
}

function DrawerNavCard({ item, IconComp, iconCircleSx, tileBaseSx, glassCardSx, onLink }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = Boolean(item.columns);
  const Icon = IconComp || ExtensionOutlinedIcon;

  if (!hasChildren) {
    return (
      <ButtonBase component={RouterLink} to={item.to} onClick={onLink} focusRipple sx={tileBaseSx}>
        <Box aria-hidden sx={iconCircleSx}>
          <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.15 }}>
            {item.label}
          </Typography>
        </Box>
        <ExpandMoreIcon
          sx={{ fontSize: 20, color: 'text.secondary', transform: 'rotate(-90deg)' }}
        />
      </ButtonBase>
    );
  }

  return (
    <Box sx={glassCardSx}>
      <ButtonBase
        focusRipple
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          p: 1.25,
          gap: 1,
          color: 'text.primary',
          textAlign: 'left',
        }}
      >
        <Box aria-hidden sx={iconCircleSx}>
          <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.15 }}>
            {item.label}
          </Typography>
        </Box>
        <ExpandMoreIcon
          sx={{
            fontSize: 20,
            color: 'text.secondary',
            transition: 'transform 180ms ease',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        />
      </ButtonBase>
      <Collapse in={expanded} timeout={180}>
        <Stack spacing={1.25} sx={{ px: 0.5, pb: 1, pt: 0 }}>
          {item.columns.map((col, idx) => (
            <Stack key={col.heading || `col-${idx}`} spacing={0.25}>
              {col.heading && (
                <Stack spacing={0.25} sx={{ px: 0.75, pt: idx === 0 ? 0 : 0.5, pb: 0.25 }}>
                  <Typography
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'primary.main',
                    }}
                  >
                    {col.heading}
                  </Typography>
                  {col.subheading && (
                    <Typography
                      sx={{ fontSize: '0.74rem', color: 'text.secondary', lineHeight: 1.3 }}
                    >
                      {col.subheading}
                    </Typography>
                  )}
                </Stack>
              )}
              <Stack spacing={0.15}>
                {col.links.map((link) => (
                  <MenuRow key={link.to + link.label} link={link} onClose={onLink} />
                ))}
              </Stack>
            </Stack>
          ))}
          {item.footer && (
            <Box
              component={RouterLink}
              to={item.footer.to}
              onClick={onLink}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                mx: 0.75,
                mt: 0.25,
                px: 1.25,
                py: 0.75,
                borderRadius: 999,
                textDecoration: 'none',
                color: 'primary.main',
                fontWeight: 700,
                fontSize: '0.82rem',
                bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.22)}`,
              }}
            >
              {item.footer.label}
            </Box>
          )}
        </Stack>
      </Collapse>
    </Box>
  );
}
