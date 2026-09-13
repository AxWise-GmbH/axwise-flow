import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  Fade,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
  Zoom,
  alpha,
  useTheme,
} from '@mui/material';
import QRCode from 'qrcode';
import LaunchOutlinedIcon from '@mui/icons-material/LaunchOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';
import LanguageIcon from '@mui/icons-material/Language';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import InstagramIcon from '@mui/icons-material/Instagram';
import FacebookOutlinedIcon from '@mui/icons-material/FacebookOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import YouTubeIcon from '@mui/icons-material/YouTube';
import { loadPublishedPublicPageBySlug } from '../../services/publicPageService';

import AppIcon from '../../components/icons/AppIcon';

const SOCIAL_ICONS = {
  instagram: InstagramIcon,
  facebook: FacebookOutlinedIcon,
  linkedin: LinkedInIcon,
  youtube: YouTubeIcon,
  x: LaunchOutlinedIcon,
  tiktok: LaunchOutlinedIcon,
};

const SOCIAL_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X / Twitter',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

/* PIN-style scenario icons (same as PinGate) */
const FaceScanIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M9 4.5C8 4.5 7 5 7 6M15 4.5C16 4.5 17 5 17 6" strokeLinecap="round" />
      <path d="M8 14C8.5 15.5 10 16.5 12 16.5C14 16.5 15.5 15.5 16 14" strokeLinecap="round" />
      <rect x="4" y="3" width="16" height="18" rx="5" strokeOpacity="0.5" />
    </svg>
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: color,
        boxShadow: `0 0 8px ${color}`,
        opacity: 0.8,
        animation: 'faceScan 2s linear infinite',
        '@keyframes faceScan': {
          '0%': { transform: 'translateY(4px)', opacity: 0 },
          '10%': { opacity: 1 },
          '90%': { opacity: 1 },
          '100%': { transform: 'translateY(36px)', opacity: 0 },
        },
      }}
    />
  </Box>
);
const VoiceAnalysisIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h1a4 4 0 0 0 4-4v-1" />
      <path d="M12 4a3 3 0 0 1 2.8 4" />
      <path d="M12 20a3 3 0 0 0 2.8-4" />
    </svg>
    {[1, 2, 3].map((i) => (
      <Box
        key={i}
        component="span"
        sx={{
          position: 'absolute',
          right: 2 - i * 4,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 4,
          height: 12 + i * 6,
          borderRadius: 2,
          bgcolor: color,
          opacity: 0.6,
          animation: 'soundWave 1.2s ease-in-out infinite',
          animationDelay: `${i * 0.15}s`,
          '@keyframes soundWave': {
            '0%, 100%': { height: 8 + i * 4, opacity: 0.3 },
            '50%': { height: 16 + i * 8, opacity: 1 },
          },
        }}
      />
    ))}
  </Box>
);
const AiBrainIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
    {[
      { top: '30%', left: '30%' },
      { top: '40%', left: '70%' },
      { top: '65%', left: '40%' },
      { top: '60%', left: '60%' },
    ].map((pos, i) => (
      <Box
        key={i}
        sx={{
          position: 'absolute',
          ...pos,
          width: 4,
          height: 4,
          borderRadius: '50%',
          bgcolor: color,
          boxShadow: `0 0 6px ${color}`,
          animation: 'nodePulse 2s ease-in-out infinite',
          animationDelay: `${i * 0.5}s`,
          '@keyframes nodePulse': {
            '0%, 100%': { transform: 'scale(1)', opacity: 0.4 },
            '50%': { transform: 'scale(2)', opacity: 1 },
          },
        }}
      />
    ))}
  </Box>
);
const ProcessingIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.93 4.93l2.83 2.83" />
      <path d="M16.24 16.24l2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.93 19.07l2.83-2.83" />
      <path d="M16.24 7.76l2.83-2.83" />
    </svg>
    <Box
      sx={{
        position: 'absolute',
        inset: -4,
        border: `2px dashed ${color}`,
        borderRadius: '50%',
        opacity: 0.5,
        animation: 'spinSlow 4s linear infinite',
        '@keyframes spinSlow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      }}
    />
  </Box>
);
const ScanCompleteIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        boxShadow: `0 0 15px ${color}`,
        animation: 'pulseSuccess 2s infinite',
        '@keyframes pulseSuccess': {
          '0%': { opacity: 0.2, transform: 'scale(0.8)' },
          '50%': { opacity: 0.6, transform: 'scale(1.1)' },
          '100%': { opacity: 0.2, transform: 'scale(0.8)' },
        },
      }}
    />
  </Box>
);
const IdentityKnownIcon = ({ color }) => (
  <Box sx={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 6,
        height: 6,
        bgcolor: color,
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        boxShadow: `0 0 12px ${color}`,
        animation: 'eyeScan 3s infinite',
        '@keyframes eyeScan': {
          '0%, 100%': { boxShadow: `0 0 5px ${color}` },
          '50%': { boxShadow: `0 0 20px ${color}, 0 0 40px ${color}` },
        },
      }}
    />
  </Box>
);

const AI_SCENARIO_ICONS = [
  FaceScanIcon,
  VoiceAnalysisIcon,
  AiBrainIcon,
  ProcessingIcon,
  ScanCompleteIcon,
  IdentityKnownIcon,
];

function getInitials(text) {
  const source = String(text || '').trim();
  if (!source) return 'P';
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

/** Layout config per template - each template has a distinct layoutStyle for clearly different visuals. */
function getTemplateConfig(templateKey) {
  const key = String(templateKey || 'classic_links').trim();
  const configs = {
    classic_links: {
      layoutStyle: 'default',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: false,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'button',
    },
    company_focus: {
      layoutStyle: 'default',
      heroStyle: 'gradient',
      companyFirst: true,
      socialFirst: false,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'button',
    },
    social_grid: {
      layoutStyle: 'social_grid',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: false,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'button',
    },
    minimal_clean: {
      layoutStyle: 'minimal',
      heroStyle: 'minimal',
      companyFirst: false,
      socialFirst: false,
      compact: false,
      glass: false,
      sectionLabels: false,
      linkStyle: 'minimal',
    },
    bento_cards: {
      layoutStyle: 'bento',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: false,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'bento',
    },
    dark_pro: {
      layoutStyle: 'dark',
      heroStyle: 'solid',
      companyFirst: true,
      socialFirst: false,
      compact: false,
      glass: true,
      sectionLabels: true,
      linkStyle: 'button',
    },
    gradient_hero: {
      layoutStyle: 'default',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: false,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'button',
    },
    social_first: {
      layoutStyle: 'social_first',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: true,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'button',
    },
    professional: {
      layoutStyle: 'professional',
      heroStyle: 'solid',
      companyFirst: true,
      socialFirst: false,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'button',
    },
    glass: {
      layoutStyle: 'glass',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: false,
      compact: false,
      glass: true,
      sectionLabels: true,
      linkStyle: 'button',
    },
    bold_statement: {
      layoutStyle: 'bold',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: false,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'button',
    },
    creator: {
      layoutStyle: 'creator',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: true,
      compact: false,
      glass: false,
      sectionLabels: true,
      linkStyle: 'pill',
    },
    compact: {
      layoutStyle: 'compact',
      heroStyle: 'gradient',
      companyFirst: false,
      socialFirst: false,
      compact: true,
      glass: false,
      sectionLabels: true,
      linkStyle: 'button',
    },
    ai_designed: {
      layoutStyle: 'ai_designed',
      heroStyle: 'solid',
      companyFirst: false,
      socialFirst: false,
      compact: false,
      glass: true,
      sectionLabels: true,
      linkStyle: 'button',
    },
  };
  return configs[key] || configs.classic_links;
}

function buildStructured(page) {
  if (!page) return { main: [], social: [], contact: [], company: null };

  const main = [];
  const social = [];
  const contact = [];

  // Single website link: prefer main website URL, else company website (avoid duplicate "Techedz" button when company block already shows name)
  const websiteUrl = page.websiteUrl || page.companyWebsite;
  if (websiteUrl) {
    main.push({ key: 'website', label: 'Website', url: websiteUrl, icon: LanguageIcon });
  }

  const handle = String(page.telegramHandle || '')
    .replace(/^@+/, '')
    .trim();
  if (handle) {
    contact.push({
      key: 'telegram',
      label: `@${handle}`,
      url: `https://t.me/${handle}`,
      icon: TelegramIcon,
    });
  }
  if (page.telegramGroup) {
    contact.push({
      key: 'telegram-group',
      label: 'Telegram Group',
      url: page.telegramGroup,
      icon: TelegramIcon,
    });
  }
  if (page.contact?.email) {
    contact.push({
      key: 'email',
      label: page.contact.email,
      url: `mailto:${page.contact.email}`,
      icon: EmailOutlinedIcon,
    });
  }
  if (page.contact?.phone) {
    contact.push({
      key: 'phone',
      label: page.contact.phone,
      url: `tel:${page.contact.phone}`,
      icon: PhoneOutlinedIcon,
    });
  }
  if (page.contact?.whatsapp) {
    const clean = String(page.contact.whatsapp).replace(/[^\d+]/g, '');
    if (clean) {
      contact.push({
        key: 'whatsapp',
        label: 'WhatsApp',
        url: `https://wa.me/${clean.replace(/\+/g, '')}`,
        icon: WhatsAppIcon,
      });
    }
  }

  Object.entries(page.social || {}).forEach(([key, value]) => {
    if (!value) return;
    const Icon = SOCIAL_ICONS[key] || LaunchOutlinedIcon;
    social.push({ key, label: SOCIAL_LABELS[key] || key, url: value, icon: Icon });
  });

  const company =
    page.companyName || page.companyDescription
      ? { name: page.companyName, description: page.companyDescription }
      : null;

  return { main, social, contact, company };
}

function LinkButton({ item, accent, linkStyle = 'button', neonGlow = false }) {
  const Icon = item.icon;
  if (linkStyle === 'minimal') {
    return (
      <Box
        component="a"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          py: 1,
          px: 0,
          color: accent,
          textDecoration: 'none',
          borderBottom: '1px solid',
          borderColor: 'divider',
          fontSize: '0.9375rem',
          fontWeight: 500,
          transition: 'color 0.2s',
          '&:hover': { color: 'primary.main' },
        }}
      >
        <AppIcon fallback={Icon} sx={{ fontSize: 20, color: 'text.secondary' }} />
        {item.label}
      </Box>
    );
  }
  if (linkStyle === 'bento') {
    return (
      <Box
        component="a"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          p: 1.5,
          borderRadius: 2,
          border: '2px solid',
          borderColor: alpha(accent, 0.3),
          bgcolor: alpha(accent, 0.06),
          color: 'text.primary',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          transition: 'all 0.2s',
          '&:hover': { borderColor: accent, bgcolor: alpha(accent, 0.12) },
        }}
      >
        <AppIcon fallback={Icon} sx={{ fontSize: 22, color: accent }} />
        {item.label}
      </Box>
    );
  }
  const isPill = linkStyle === 'pill';
  const neonSx = neonGlow
    ? {
        border: '1px solid',
        borderColor: alpha(accent, 0.5),
        bgcolor: alpha(accent, 0.08),
        color: '#fff',
        boxShadow: `0 0 15px ${alpha(accent, 0.35)}, inset 0 0 20px ${alpha(accent, 0.06)}`,
        animation: 'neonPulse 2.5s ease-in-out infinite',
        '@keyframes neonPulse': {
          '0%, 100%': {
            boxShadow: `0 0 15px ${alpha(accent, 0.35)}, inset 0 0 20px ${alpha(accent, 0.06)}`,
          },
          '50%': {
            boxShadow: `0 0 22px ${alpha(accent, 0.5)}, 0 0 30px ${alpha(accent, 0.2)}, inset 0 0 20px ${alpha(accent, 0.08)}`,
          },
        },
        '&:hover': {
          bgcolor: alpha(accent, 0.18),
          borderColor: accent,
          boxShadow: `0 0 20px ${alpha(accent, 0.5)}, 0 0 35px ${alpha(accent, 0.25)}`,
          transform: 'translateY(-2px)',
        },
      }
    : {};
  return (
    <Button
      component="a"
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      variant="contained"
      fullWidth
      startIcon={<AppIcon fallback={Icon} sx={{ fontSize: 18 }} />}
      sx={{
        textTransform: 'none',
        fontWeight: 600,
        borderRadius: isPill ? 9999 : 2.5,
        py: 1.15,
        px: 2.5,
        fontSize: '0.875rem',
        bgcolor: neonGlow ? undefined : accent,
        color: '#fff',
        boxShadow: neonGlow ? undefined : `0 2px 8px ${alpha(accent, 0.25)}`,
        transition:
          'transform 0.2s ease, box-shadow 0.2s, border-color 0.2s, background-color 0.2s',
        '&:hover': neonGlow
          ? undefined
          : {
              bgcolor: accent,
              filter: 'brightness(0.92)',
              transform: 'translateY(-1px)',
              boxShadow: `0 4px 16px ${alpha(accent, 0.35)}`,
            },
        ...neonSx,
      }}
    >
      {item.label}
    </Button>
  );
}

function SocialChip({ item, accent, size = 'medium' }) {
  const Icon = item.icon;
  const isLarge = size === 'large';
  return (
    <Tooltip title={item.label} arrow>
      <IconButton
        component="a"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          width: isLarge ? 56 : 44,
          height: isLarge ? 56 : 44,
          border: '1px solid',
          borderColor: alpha(accent, 0.2),
          color: accent,
          transition: 'all 0.15s',
          '&:hover': {
            bgcolor: alpha(accent, 0.1),
            borderColor: accent,
            transform: 'translateY(-2px)',
          },
        }}
      >
        <AppIcon fallback={Icon} sx={{ fontSize: isLarge ? 26 : 20 }} />
      </IconButton>
    </Tooltip>
  );
}

function ContactRow({ item }) {
  const Icon = item.icon;
  return (
    <Box
      component="a"
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        py: 0.75,
        textDecoration: 'none',
        color: 'text.primary',
        borderRadius: 1.5,
        px: 1,
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <AppIcon fallback={Icon} sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
      <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
        {item.label}
      </Typography>
    </Box>
  );
}

export default function PublicProfilePage() {
  const { slug = '' } = useParams();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [scenarioStep, setScenarioStep] = useState(0);
  const [scenarioPhase, setScenarioPhase] = useState('scan'); // 'scan' | 'i_know' | 'rotating'
  const [rotatingPhraseIndex, setRotatingPhraseIndex] = useState(0);
  const [typewriterLen, setTypewriterLen] = useState(0);

  const AI_SCENARIO_LABELS = [
    'BIOMETRIC SCAN',
    'VOICE ANALYSIS',
    'NEURAL SYNC',
    'PROCESSING',
    'SCAN COMPLETE',
    'AI DESIGNED',
  ];
  const ROTATING_PHRASES = [
    'Searching For Relevant Data',
    'Downloading : Archives',
    'Transferring : Data',
    'Analysing : Object',
    "I'll be monitoring you from now.",
  ];

  useEffect(() => {
    if (page?.templateKey !== 'ai_designed') return;
    let intervalId;
    intervalId = setInterval(() => {
      setScenarioStep((s) => {
        if (s >= 4) {
          if (intervalId) clearInterval(intervalId);
          setScenarioPhase('i_know');
          return 5;
        }
        return s + 1;
      });
    }, 2500);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [page?.templateKey]);

  useEffect(() => {
    if (page?.templateKey !== 'ai_designed' || scenarioPhase !== 'i_know') return;
    const to = setTimeout(() => {
      setScenarioPhase('rotating');
      setTypewriterLen(0);
      setRotatingPhraseIndex(0);
    }, 5000);
    return () => clearTimeout(to);
  }, [page?.templateKey, scenarioPhase]);

  useEffect(() => {
    if (page?.templateKey !== 'ai_designed' || scenarioPhase !== 'rotating') return;
    const phrase = ROTATING_PHRASES[rotatingPhraseIndex];
    if (typewriterLen >= phrase.length) {
      const pause = setTimeout(() => {
        setRotatingPhraseIndex((i) => (i + 1) % ROTATING_PHRASES.length);
        setTypewriterLen(0);
      }, 2200);
      return () => clearTimeout(pause);
    }
    const tick = setInterval(() => setTypewriterLen((n) => n + 1), 80);
    return () => clearInterval(tick);
  }, [page?.templateKey, scenarioPhase, rotatingPhraseIndex, typewriterLen]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await loadPublishedPublicPageBySlug(slug);
        if (!active) return;
        if (!data) {
          setPage(null);
          setError(
            "This public page is not available. If you're the owner, go to Settings → Digital Business Card, turn on Published, click Save, then try the link again."
          );
          return;
        }
        setPage(data);
      } catch (err) {
        if (!active) return;
        setPage(null);
        setError(err?.message || 'Could not load this public page.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  const { main, social, contact, company } = useMemo(() => buildStructured(page), [page]);
  const templateConfig = useMemo(() => getTemplateConfig(page?.templateKey), [page?.templateKey]);
  const accent = page?.accentColor || '#1B2A4A';
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const hasLinks =
    main.length > 0 ||
    social.length > 0 ||
    contact.length > 0 ||
    (page?.showScheduleMeeting !== false && Boolean(page?.bookingSlug));
  const layoutStyle = templateConfig.layoutStyle || 'default';
  const pageBg =
    layoutStyle === 'dark'
      ? '#0a0a0f'
      : layoutStyle === 'glass'
        ? `linear-gradient(160deg, ${alpha(accent, 0.15)} 0%, ${alpha(accent, 0.05)} 50%, #f0f4f8 100%)`
        : layoutStyle === 'minimal'
          ? '#fafafa'
          : theme.palette.mode === 'dark'
            ? '#0C1117'
            : '#F4F6F9';
  const socialChipSize =
    layoutStyle === 'social_first' || layoutStyle === 'creator' ? 'large' : 'medium';

  const openQr = useCallback(async () => {
    if (!pageUrl) return;
    try {
      const url = await QRCode.toDataURL(pageUrl, {
        width: 512,
        margin: 2,
        color: { dark: isDark ? '#ffffff' : '#1B2A4A', light: '#00000000' },
      });
      setQrDataUrl(url);
      setQrOpen(true);
    } catch {
      /* silent */
    }
  }, [pageUrl, isDark]);

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${slug || 'page'}-qr.png`;
    a.click();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 8, px: 2 }}>
        <Box sx={{ maxWidth: 480, mx: 'auto' }}>
          <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
            {error}
          </Alert>
        </Box>
      </Box>
    );
  }

  const isAiDesigned = layoutStyle === 'ai_designed';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: isAiDesigned ? '#050505' : layoutStyle === 'glass' ? 'transparent' : pageBg,
        background: isAiDesigned
          ? `
            radial-gradient(circle at 50% 0%, ${alpha(accent, 0.18)} 0%, transparent 50%),
            linear-gradient(0deg, transparent 24%, ${alpha(accent, 0.03)} 25%, ${alpha(accent, 0.03)} 26%, transparent 27%, transparent 74%, ${alpha(accent, 0.03)} 75%, ${alpha(accent, 0.03)} 76%, transparent 77%, transparent),
            linear-gradient(90deg, transparent 24%, ${alpha(accent, 0.03)} 25%, ${alpha(accent, 0.03)} 26%, transparent 27%, transparent 74%, ${alpha(accent, 0.03)} 75%, ${alpha(accent, 0.03)} 76%, transparent 77%, transparent)
          `
          : layoutStyle === 'glass'
            ? pageBg
            : undefined,
        backgroundSize: isAiDesigned ? '100% 100%, 60px 60px, 60px 60px' : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: templateConfig.compact ? { xs: 1.5, sm: 2 } : { xs: 2, sm: 5 },
        px: 2,
      }}
    >
      {/* Card */}
      <Zoom in style={{ transitionDelay: isAiDesigned ? '150ms' : '0ms' }}>
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: layoutStyle === 'bento' ? 520 : 440,
            borderRadius:
              layoutStyle === 'creator'
                ? 5
                : layoutStyle === 'minimal'
                  ? 2
                  : templateConfig.glass
                    ? 3
                    : 4,
            overflow: 'hidden',
            border: '1px solid',
            borderColor:
              layoutStyle === 'dark'
                ? alpha('#fff', 0.06)
                : layoutStyle === 'minimal'
                  ? alpha('#000', 0.06)
                  : isDark
                    ? alpha('#fff', 0.08)
                    : alpha('#000', 0.08),
            boxShadow:
              layoutStyle === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.5)'
                : layoutStyle === 'minimal'
                  ? '0 1px 3px rgba(0,0,0,0.04)'
                  : isDark
                    ? '0 8px 32px rgba(0,0,0,0.4)'
                    : '0 8px 32px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
            bgcolor:
              layoutStyle === 'dark'
                ? '#151520'
                : layoutStyle === 'minimal'
                  ? '#ffffff'
                  : undefined,
            ...(templateConfig.glass && {
              bgcolor: layoutStyle === 'dark' ? alpha('#1a1a24', 0.9) : alpha('#fff', 0.8),
              backdropFilter: 'blur(16px)',
            }),
            ...(isAiDesigned && {
              border: '1px solid',
              borderColor: alpha(accent, 0.25),
              bgcolor: alpha('#0A0A0A', 0.92),
              backdropFilter: 'blur(20px)',
              boxShadow: `0 0 40px ${alpha('#000', 0.6)}, inset 0 0 0 1px ${alpha(accent, 0.08)}`,
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: accent,
                boxShadow: `0 0 12px ${accent}`,
              },
            }),
          }}
        >
          {/* Hero header */}
          <Box
            sx={{
              position: 'relative',
              pt: isAiDesigned
                ? 3
                : layoutStyle === 'bold'
                  ? 6
                  : templateConfig.heroStyle === 'minimal'
                    ? 3
                    : 5,
              pb: isAiDesigned
                ? 2.5
                : layoutStyle === 'bold'
                  ? 4
                  : templateConfig.heroStyle === 'minimal'
                    ? 2
                    : 3,
              px: 3,
              textAlign: 'center',
              background: isAiDesigned
                ? `linear-gradient(180deg, ${alpha(accent, 0.22)} 0%, ${alpha(accent, 0.08)} 100%)`
                : templateConfig.heroStyle === 'minimal'
                  ? 'transparent'
                  : layoutStyle === 'dark'
                    ? alpha(accent, 0.25)
                    : templateConfig.heroStyle === 'solid'
                      ? accent
                      : `linear-gradient(135deg, ${accent} 0%, ${alpha(accent, 0.75)} 100%)`,
            }}
          >
            {/* AI Designed: top row with scenario + actions */}
            {isAiDesigned && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                  }}
                >
                  <Box sx={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                    {scenarioPhase === 'scan' &&
                      AI_SCENARIO_ICONS.map((Icon, i) => (
                        <Box
                          key={i}
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            opacity: scenarioStep === i ? 1 : 0,
                            transition: 'opacity 0.4s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <AppIcon fallback={Icon} color={accent} />
                        </Box>
                      ))}
                    {(scenarioPhase === 'i_know' || scenarioPhase === 'rotating') && (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <IdentityKnownIcon color={accent} />
                      </Box>
                    )}
                    {scenarioPhase === 'scan' && (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: -1,
                          borderRadius: '50%',
                          borderTop: `2px solid ${accent}`,
                          borderRight: '2px solid transparent',
                          animation: 'aiSpin 2.5s linear infinite',
                          '@keyframes aiSpin': {
                            from: { transform: 'rotate(0deg)' },
                            to: { transform: 'rotate(360deg)' },
                          },
                        }}
                      />
                    )}
                  </Box>
                  {scenarioPhase === 'scan' && (
                    <Fade in key={scenarioStep}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: alpha('#fff', 0.88),
                          letterSpacing: '0.12em',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {AI_SCENARIO_LABELS[scenarioStep]}
                      </Typography>
                    </Fade>
                  )}
                  {scenarioPhase === 'i_know' && (
                    <Fade in>
                      <Typography
                        variant="caption"
                        sx={{
                          color: alpha('#fff', 0.9),
                          letterSpacing: '0.14em',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        I KNOW WHO YOU ARE
                      </Typography>
                    </Fade>
                  )}
                  {scenarioPhase === 'rotating' && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha('#fff', 0.88),
                        letterSpacing: '0.06em',
                        fontWeight: 600,
                        display: 'block',
                        minHeight: 20,
                        fontFamily: 'monospace',
                      }}
                    >
                      {ROTATING_PHRASES[rotatingPhraseIndex].slice(0, typewriterLen)}
                      <Box
                        component="span"
                        sx={{
                          animation: 'blink 0.8s step-end infinite',
                          '@keyframes blink': { '50%': { opacity: 0 } },
                        }}
                      >
                        |
                      </Box>
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  <Tooltip title={copied ? 'Copied!' : 'Copy link'} arrow>
                    <IconButton
                      size="small"
                      onClick={handleCopy}
                      sx={{
                        color: alpha('#fff', 0.75),
                        '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.12) },
                      }}
                    >
                      <AppIcon
                        name="ContentCopyOutlined"
                        fallback={ContentCopyOutlinedIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="QR code" arrow>
                    <IconButton
                      size="small"
                      onClick={openQr}
                      sx={{
                        color: alpha('#fff', 0.75),
                        '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.12) },
                      }}
                    >
                      <AppIcon
                        name="QrCode2Outlined"
                        fallback={QrCode2OutlinedIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            )}

            {/* Top-right actions (non–AI Designed) */}
            {!isAiDesigned && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  display: 'flex',
                  gap: 0.5,
                  ...(templateConfig.heroStyle === 'minimal' && {
                    color: 'text.secondary',
                    '& .MuiIconButton-root': {
                      color: 'text.secondary',
                      '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
                    },
                  }),
                }}
              >
                <Tooltip title={copied ? 'Copied!' : 'Copy link'} arrow>
                  <IconButton
                    size="small"
                    onClick={handleCopy}
                    sx={
                      templateConfig.heroStyle !== 'minimal'
                        ? {
                            color: alpha('#fff', 0.7),
                            '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.15) },
                          }
                        : {}
                    }
                  >
                    <AppIcon
                      name="ContentCopyOutlined"
                      fallback={ContentCopyOutlinedIcon}
                      sx={{ fontSize: 17 }}
                    />
                  </IconButton>
                </Tooltip>
                <Tooltip title="QR code" arrow>
                  <IconButton
                    size="small"
                    onClick={openQr}
                    sx={
                      templateConfig.heroStyle !== 'minimal'
                        ? {
                            color: alpha('#fff', 0.7),
                            '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.15) },
                          }
                        : {}
                    }
                  >
                    <AppIcon
                      name="QrCode2Outlined"
                      fallback={QrCode2OutlinedIcon}
                      sx={{ fontSize: 17 }}
                    />
                  </IconButton>
                </Tooltip>
              </Box>
            )}

            {/* Avatar + atomic orbits (AI Designed) or plain Avatar */}
            {isAiDesigned ? (
              <Box
                sx={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 140,
                  height: 140,
                  mx: 'auto',
                  mb: 1.5,
                }}
              >
                {/* Orbital rings + electrons (neon atom) */}
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    border: `1px solid ${alpha(accent, 0.5)}`,
                    boxShadow: `0 0 12px ${alpha(accent, 0.4)}, inset 0 0 12px ${alpha(accent, 0.08)}`,
                    animation: 'atomOrbit1 6s linear infinite',
                    '@keyframes atomOrbit1': { to: { transform: 'rotate(360deg)' } },
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -5,
                      left: '50%',
                      marginLeft: -5,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: accent,
                      boxShadow: `0 0 10px ${accent}, 0 0 20px ${alpha(accent, 0.7)}, 0 0 30px ${alpha(accent, 0.4)}`,
                    }}
                  />
                </Box>
                <Box
                  sx={{
                    position: 'absolute',
                    width: 120,
                    height: 90,
                    left: '50%',
                    top: '50%',
                    marginLeft: -60,
                    marginTop: -45,
                    borderRadius: '50%',
                    border: `1px solid ${alpha(accent, 0.45)}`,
                    boxShadow: `0 0 10px ${alpha(accent, 0.35)}`,
                    transform: 'rotate(55deg)',
                    animation: 'atomOrbit2 8s linear infinite reverse',
                    '@keyframes atomOrbit2': { to: { transform: 'rotate(55deg) rotate(360deg)' } },
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -4,
                      left: '50%',
                      marginLeft: -4,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: accent,
                      boxShadow: `0 0 8px ${accent}, 0 0 16px ${alpha(accent, 0.6)}`,
                    }}
                  />
                </Box>
                <Box
                  sx={{
                    position: 'absolute',
                    width: 100,
                    height: 110,
                    left: '50%',
                    top: '50%',
                    marginLeft: -50,
                    marginTop: -55,
                    borderRadius: '50%',
                    border: `1px solid ${alpha(accent, 0.4)}`,
                    boxShadow: `0 0 10px ${alpha(accent, 0.3)}`,
                    transform: 'rotate(-38deg)',
                    animation: 'atomOrbit3 7s linear infinite',
                    '@keyframes atomOrbit3': { to: { transform: 'rotate(-38deg) rotate(360deg)' } },
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -4,
                      left: '50%',
                      marginLeft: -4,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: accent,
                      boxShadow: `0 0 8px ${accent}, 0 0 14px ${alpha(accent, 0.6)}`,
                    }}
                  />
                </Box>
                {page.photoUrl ? (
                  <Avatar
                    src={page.photoUrl}
                    alt={page.title}
                    sx={{
                      width: 80,
                      height: 80,
                      position: 'relative',
                      zIndex: 1,
                      border: `2px solid ${alpha(accent, 0.5)}`,
                      boxShadow: `0 0 24px ${alpha(accent, 0.25)}, 0 0 48px ${alpha(accent, 0.12)}`,
                      animation: 'atomNucleusPulse 3s ease-in-out infinite',
                      '@keyframes atomNucleusPulse': {
                        '0%, 100%': {
                          boxShadow: `0 0 24px ${alpha(accent, 0.25)}, 0 0 48px ${alpha(accent, 0.12)}`,
                        },
                        '50%': {
                          boxShadow: `0 0 32px ${alpha(accent, 0.4)}, 0 0 64px ${alpha(accent, 0.2)}`,
                        },
                      },
                    }}
                  />
                ) : (
                  <Avatar
                    sx={{
                      width: 72,
                      height: 72,
                      position: 'relative',
                      zIndex: 1,
                      fontWeight: 700,
                      fontSize: '1.5rem',
                      bgcolor: alpha(accent, 0.3),
                      color: '#fff',
                      border: `2px solid ${alpha(accent, 0.5)}`,
                      boxShadow: `0 0 20px ${alpha(accent, 0.2)}, 0 0 40px ${alpha(accent, 0.1)}`,
                      animation: 'atomNucleusPulse 3s ease-in-out infinite',
                      '@keyframes atomNucleusPulse': {
                        '0%, 100%': {
                          boxShadow: `0 0 20px ${alpha(accent, 0.2)}, 0 0 40px ${alpha(accent, 0.1)}`,
                        },
                        '50%': {
                          boxShadow: `0 0 28px ${alpha(accent, 0.35)}, 0 0 56px ${alpha(accent, 0.18)}`,
                        },
                      },
                    }}
                  >
                    {getInitials(page.title || page.companyName)}
                  </Avatar>
                )}
              </Box>
            ) : page.photoUrl ? (
              <Avatar
                src={page.photoUrl}
                alt={page.title}
                sx={{
                  width: templateConfig.compact ? 64 : 88,
                  height: templateConfig.compact ? 64 : 88,
                  mx: 'auto',
                  mb: 1.5,
                  border: '3px solid',
                  borderColor: alpha('#fff', 0.5),
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                }}
              />
            ) : (
              <Avatar
                sx={{
                  width: templateConfig.compact ? 56 : 80,
                  height: templateConfig.compact ? 56 : 80,
                  mx: 'auto',
                  mb: 1.5,
                  fontWeight: 700,
                  fontSize: templateConfig.compact ? '1.25rem' : '1.75rem',
                  bgcolor: alpha('#fff', 0.2),
                  color: '#fff',
                  border: '2px solid',
                  borderColor: alpha('#fff', 0.3),
                }}
              >
                {getInitials(page.title || page.companyName)}
              </Avatar>
            )}

            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontSize: isAiDesigned ? '1.5rem' : layoutStyle === 'bold' ? '1.75rem' : undefined,
                color:
                  layoutStyle === 'dark' || isAiDesigned
                    ? alpha('#fff', 0.98)
                    : templateConfig.heroStyle === 'minimal'
                      ? 'text.primary'
                      : '#fff',
                letterSpacing: isAiDesigned ? '-0.03em' : '-0.02em',
                lineHeight: 1.2,
              }}
            >
              {page.title}
            </Typography>
            {page.subtitle && (
              <Typography
                variant="body2"
                sx={{
                  color:
                    layoutStyle === 'dark' || isAiDesigned
                      ? alpha('#fff', 0.72)
                      : templateConfig.heroStyle === 'minimal'
                        ? 'text.secondary'
                        : alpha('#fff', 0.8),
                  mt: 0.5,
                  maxWidth: 320,
                  mx: 'auto',
                  lineHeight: 1.5,
                  fontSize: isAiDesigned ? '0.875rem' : undefined,
                }}
              >
                {page.subtitle}
              </Typography>
            )}
          </Box>

          {/* Body */}
          <Box
            sx={{
              px: isAiDesigned ? 3 : templateConfig.compact ? 2 : 3,
              py: isAiDesigned ? 3 : templateConfig.compact ? 1.5 : 2.5,
              ...(isAiDesigned && {
                color: alpha('#fff', 0.92),
                '& .MuiTypography-root': { color: 'inherit' },
                '& .MuiTypography-caption': { color: alpha('#fff', 0.7) },
                '& a': { color: alpha('#fff', 0.9) },
                '& a:hover': { color: '#fff' },
                '& .MuiSvgIcon-root': { color: alpha('#fff', 0.8) },
              }),
            }}
          >
            <Stack spacing={isAiDesigned ? 3 : templateConfig.compact ? 1.5 : 2.5}>
              {templateConfig.socialFirst && !isAiDesigned && social.length > 0 && (
                <Box>
                  {templateConfig.sectionLabels && (
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        mb: 1,
                        display: 'block',
                      }}
                    >
                      Social
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {social.map((item) => (
                      <SocialChip
                        key={item.key}
                        item={item}
                        accent={accent}
                        size={socialChipSize}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {templateConfig.companyFirst && company && (
                <Box
                  sx={{
                    p: isAiDesigned ? 2 : templateConfig.compact ? 1.25 : 1.75,
                    borderRadius: isAiDesigned ? 3 : 2.5,
                    bgcolor: isAiDesigned
                      ? alpha(accent, 0.06)
                      : isDark
                        ? alpha(accent, 0.08)
                        : alpha(accent, 0.04),
                    border: '1px solid',
                    borderColor: isAiDesigned
                      ? alpha(accent, 0.25)
                      : isDark
                        ? alpha(accent, 0.15)
                        : alpha(accent, 0.1),
                    ...(layoutStyle === 'professional' &&
                      !isAiDesigned && { borderLeft: `4px solid ${accent}` }),
                    ...(isAiDesigned && { boxShadow: `0 0 20px ${alpha(accent, 0.08)}` }),
                  }}
                >
                  {company.name && (
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        mb: 0.5,
                        color: isAiDesigned ? '#fff' : undefined,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {company.name}
                    </Typography>
                  )}
                  {company.description && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: isAiDesigned ? alpha('#fff', 0.75) : 'text.secondary',
                        lineHeight: 1.55,
                        fontSize: isAiDesigned ? '0.8125rem' : undefined,
                      }}
                    >
                      {company.description}
                    </Typography>
                  )}
                </Box>
              )}

              {!templateConfig.companyFirst && company && (
                <Box
                  sx={{
                    p: isAiDesigned ? 2 : templateConfig.compact ? 1.25 : 1.75,
                    borderRadius: isAiDesigned ? 3 : 2.5,
                    bgcolor: isAiDesigned
                      ? alpha(accent, 0.06)
                      : isDark
                        ? alpha(accent, 0.08)
                        : alpha(accent, 0.04),
                    border: '1px solid',
                    borderColor: isAiDesigned
                      ? alpha(accent, 0.25)
                      : isDark
                        ? alpha(accent, 0.15)
                        : alpha(accent, 0.1),
                    ...(layoutStyle === 'professional' &&
                      !isAiDesigned && { borderLeft: `4px solid ${accent}` }),
                    ...(isAiDesigned && { boxShadow: `0 0 20px ${alpha(accent, 0.08)}` }),
                  }}
                >
                  {company.name && (
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        mb: 0.5,
                        color: isAiDesigned ? '#fff' : undefined,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {company.name}
                    </Typography>
                  )}
                  {company.description && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: isAiDesigned ? alpha('#fff', 0.75) : 'text.secondary',
                        lineHeight: 1.55,
                        fontSize: isAiDesigned ? '0.8125rem' : undefined,
                      }}
                    >
                      {company.description}
                    </Typography>
                  )}
                </Box>
              )}

              {main.length > 0 &&
                (layoutStyle === 'bento' && !isAiDesigned ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                    {main.map((item) => (
                      <LinkButton
                        key={item.key}
                        item={item}
                        accent={accent}
                        linkStyle={templateConfig.linkStyle}
                        neonGlow={isAiDesigned}
                      />
                    ))}
                  </Box>
                ) : (
                  <Stack spacing={isAiDesigned ? 1.25 : 1}>
                    {main.map((item) => (
                      <LinkButton
                        key={item.key}
                        item={item}
                        accent={accent}
                        linkStyle={templateConfig.linkStyle}
                        neonGlow={isAiDesigned}
                      />
                    ))}
                  </Stack>
                ))}

              {page.showScheduleMeeting !== false && page.bookingSlug && (
                <Button
                  component={Link}
                  to={`/book/${page.bookingSlug}`}
                  variant="contained"
                  fullWidth
                  startIcon={
                    <AppIcon
                      name="EventAvailable"
                      fallback={EventAvailableIcon}
                      sx={{ fontSize: 20 }}
                    />
                  }
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    py: templateConfig.compact ? 1 : 1.35,
                    borderRadius: layoutStyle === 'creator' ? 9999 : 2.5,
                    ...(isAiDesigned
                      ? {
                          border: '1px solid',
                          borderColor: alpha(accent, 0.5),
                          bgcolor: alpha(accent, 0.08),
                          color: '#fff',
                          boxShadow: `0 0 15px ${alpha(accent, 0.35)}, inset 0 0 20px ${alpha(accent, 0.06)}`,
                          animation: 'neonPulse 2.5s ease-in-out infinite',
                          '@keyframes neonPulse': {
                            '0%, 100%': {
                              boxShadow: `0 0 15px ${alpha(accent, 0.35)}, inset 0 0 20px ${alpha(accent, 0.06)}`,
                            },
                            '50%': {
                              boxShadow: `0 0 22px ${alpha(accent, 0.5)}, 0 0 30px ${alpha(accent, 0.2)}, inset 0 0 20px ${alpha(accent, 0.08)}`,
                            },
                          },
                          transition:
                            'transform 0.2s ease, box-shadow 0.2s, border-color 0.2s, background-color 0.2s',
                          '&:hover': {
                            bgcolor: alpha(accent, 0.18),
                            borderColor: accent,
                            boxShadow: `0 0 20px ${alpha(accent, 0.5)}, 0 0 35px ${alpha(accent, 0.25)}`,
                            transform: 'translateY(-2px)',
                          },
                        }
                      : {
                          bgcolor: accent,
                          color: '#fff',
                          boxShadow: `0 2px 12px ${alpha(accent, 0.35)}`,
                          transition: 'transform 0.15s, box-shadow 0.2s',
                          '&:hover': {
                            bgcolor: accent,
                            filter: 'brightness(0.95)',
                            transform: 'translateY(-1px)',
                            boxShadow: `0 4px 20px ${alpha(accent, 0.4)}`,
                          },
                        }),
                  }}
                >
                  Schedule a meeting
                </Button>
              )}

              {!templateConfig.socialFirst && social.length > 0 && (
                <Box>
                  {templateConfig.sectionLabels && (
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: isAiDesigned ? alpha('#fff', 0.6) : 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        mb: 1,
                        display: 'block',
                      }}
                    >
                      Social
                    </Typography>
                  )}
                  <Box
                    sx={{
                      display: layoutStyle === 'social_grid' && !isAiDesigned ? 'grid' : 'flex',
                      gridTemplateColumns:
                        layoutStyle === 'social_grid' && !isAiDesigned
                          ? 'repeat(3, 1fr)'
                          : undefined,
                      flexWrap: 'wrap',
                      gap: isAiDesigned ? 1.25 : 1,
                    }}
                  >
                    {social.map((item) => (
                      <SocialChip
                        key={item.key}
                        item={item}
                        accent={accent}
                        size={socialChipSize}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {contact.length > 0 && (
                <Box
                  sx={{
                    ...(isAiDesigned && {
                      pt: 0.5,
                      borderTop: '1px solid',
                      borderColor: alpha(accent, 0.15),
                    }),
                  }}
                >
                  {templateConfig.sectionLabels && (
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: isAiDesigned ? alpha('#fff', 0.55) : 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        mb: 1.25,
                        display: 'block',
                      }}
                    >
                      Contact
                    </Typography>
                  )}
                  <Stack spacing={isAiDesigned ? 1.25 : 0}>
                    {contact.map((item) => (
                      <ContactRow key={item.key} item={item} />
                    ))}
                  </Stack>
                </Box>
              )}

              {!hasLinks && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: 'center', py: 2 }}
                >
                  No links configured yet.
                </Typography>
              )}
            </Stack>
          </Box>

          {/* Footer */}
          <Box
            sx={{
              px: 3,
              pb: isAiDesigned ? 2.5 : 2,
              pt: isAiDesigned ? 1 : 0.5,
              textAlign: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: isAiDesigned ? alpha('#fff', 0.4) : alpha(theme.palette.text.secondary, 0.5),
                fontSize: isAiDesigned ? '0.7rem' : '0.65rem',
                letterSpacing: isAiDesigned ? '0.04em' : undefined,
              }}
            >
              Powered by Orchestrator
            </Typography>
          </Box>
        </Paper>
      </Zoom>
      {/* QR Code dialog */}
      <Dialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, pt: 2, pb: 0.5 }}>
          <AppIcon
            name="QrCode2Outlined"
            fallback={QrCode2OutlinedIcon}
            sx={{ fontSize: 22, mr: 1, color: accent }}
          />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
            Share this page
          </Typography>
          <IconButton size="small" onClick={() => setQrOpen(false)}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <DialogContent sx={{ textAlign: 'center', pb: 3 }}>
          {qrDataUrl && (
            <Box
              sx={{
                display: 'inline-flex',
                p: 2.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: isDark ? alpha(theme.palette.common.white, 0.05) : '#fff',
                mb: 2,
              }}
            >
              <img
                src={qrDataUrl}
                alt="QR code"
                style={{ width: 200, height: 200, imageRendering: 'pixelated' }}
              />
            </Box>
          )}
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
            {page?.title || 'Public Page'}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 2, fontFamily: 'monospace', fontSize: '0.7rem' }}
          >
            {pageUrl}
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center">
            <Button
              variant="contained"
              size="small"
              startIcon={
                <AppIcon
                  name="DownloadOutlined"
                  fallback={DownloadOutlinedIcon}
                  sx={{ fontSize: 16 }}
                />
              }
              onClick={handleDownloadQr}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                bgcolor: accent,
                '&:hover': { bgcolor: accent, filter: 'brightness(0.9)' },
              }}
            >
              Download
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={
                <AppIcon
                  name="ContentCopyOutlined"
                  fallback={ContentCopyOutlinedIcon}
                  sx={{ fontSize: 16 }}
                />
              }
              onClick={handleCopy}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
