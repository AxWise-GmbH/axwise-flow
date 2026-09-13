import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import QRCode from 'qrcode';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import LaunchOutlinedIcon from '@mui/icons-material/LaunchOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import AlternateEmailOutlinedIcon from '@mui/icons-material/AlternateEmailOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { logAction } from '../../services/auditLogBackend';
import {
  buildDefaultPublicPage,
  getPublicPageUrl,
  loadUserPublicPage,
  normalizeSlug,
  PUBLIC_PAGE_TEMPLATES,
  saveUserPublicPage,
} from '../../services/publicPageService';
import { downloadPageAsHtml } from '../../services/publicPageExport';
import publicBookingService from '../../services/publicBookingService';
import { hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

const SOCIAL_FIELDS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/handle' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/page' },
  { key: 'x', label: 'X / Twitter', placeholder: 'https://x.com/handle' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/profile' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@handle' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@channel' },
];

const CONTACT_FIELDS = [
  { key: 'email', label: 'Email', placeholder: 'hello@company.com' },
  { key: 'phone', label: 'Phone', placeholder: '+1 000 000 0000' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: '+1 000 000 0000' },
];

const slugRegex = /^[a-z0-9-]{3,40}$/;

const ACCENT_PRESETS = [
  { label: 'Navy', value: '#1B2A4A' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Violet', value: '#7C3AED' },
  { label: 'Rose', value: '#E11D48' },
  { label: 'Orange', value: '#EA580C' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Teal', value: '#0D9488' },
  { label: 'Slate', value: '#475569' },
];

function SectionToggle({ icon: Icon, label, badge, open, onToggle }) {
  const theme = useTheme();
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.75,
        px: 1.25,
        borderRadius: 2,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Icon sx={{ fontSize: 17, color: 'text.secondary' }} />
      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, fontSize: '0.8125rem' }}>
        {label}
      </Typography>
      {badge && (
        <Chip
          size="small"
          label={badge}
          variant="outlined"
          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
        />
      )}
      <AppIcon
        name="ExpandMoreRounded"
        fallback={ExpandMoreRoundedIcon}
        sx={{
          fontSize: 18,
          color: 'text.secondary',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      />
    </Box>
  );
}

export default function PublicPageSettingsPanel({ user }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const userId = user?.uid;
  const [draft, setDraft] = useState(() => buildDefaultPublicPage(user));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [openSections, setOpenSections] = useState({});

  const toggle = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    let active = true;
    if (!userId) {
      setDraft(buildDefaultPublicPage(user));
      return undefined;
    }
    setLoading(true);
    setMessage({ type: '', text: '' });
    loadUserPublicPage(userId, user)
      .then((page) => {
        if (active) setDraft(page);
      })
      .catch((err) => {
        if (active) setMessage({ type: 'error', text: err?.message || 'Failed to load.' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, user]);

  const normalizedSlug = normalizeSlug(draft.slug);
  const publicUrl = useMemo(() => getPublicPageUrl(normalizedSlug), [normalizedSlug]);
  const slugValid = slugRegex.test(normalizedSlug);

  const updateField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));
  const updateSocial = (key, value) =>
    setDraft((prev) => ({ ...prev, social: { ...(prev.social || {}), [key]: value } }));
  const updateContact = (key, value) =>
    setDraft((prev) => ({ ...prev, contact: { ...(prev.contact || {}), [key]: value } }));

  const socialCount = SOCIAL_FIELDS.filter((f) => draft.social?.[f.key]).length;
  const contactCount = CONTACT_FIELDS.filter((f) => draft.contact?.[f.key]).length;

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 2 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateField('photoUrl', reader.result);
      setMessage({ type: 'success', text: 'Photo added. Save to apply.' });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!userId) return;
    setMessage({ type: '', text: '' });
    setSaving(true);
    try {
      const payload = { ...draft, slug: normalizedSlug };
      const saved = await saveUserPublicPage(userId, payload, user);
      setDraft(saved);
      setMessage({ type: 'success', text: 'Public page saved.' });
      await logAction({
        action: 'public_page_updated',
        entity: 'Settings',
        entityId: userId,
        details: `Public page saved (slug: ${saved.slug}, published: ${saved.isPublished ? 'yes' : 'no'})`,
        meta: {
          source: 'settings',
          importance: 'medium',
          tags: ['public-page', 'settings'],
          slug: saved.slug,
          template: saved.templateKey,
          published: saved.isPublished,
        },
      });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async () => {
    if (!userId) return;
    if (!slugValid || !normalizedSlug) {
      setMessage({ type: 'error', text: 'Enter a valid slug first.' });
      return;
    }
    if (!draft.isPublished) {
      setMessage({ type: 'error', text: 'Turn on "Published" and save first.' });
      return;
    }
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = { ...draft, slug: normalizedSlug, isPublished: true };
      const saved = await saveUserPublicPage(userId, payload, user);
      setDraft(saved);
      const urlToCopy = getPublicPageUrl(normalizedSlug);
      await navigator.clipboard.writeText(urlToCopy);
      setMessage({ type: 'success', text: 'Link copied. Page is live for anyone with the link.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not save or copy.' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLink = async () => {
    if (!userId) return;
    if (!slugValid || !normalizedSlug) {
      setMessage({
        type: 'error',
        text: 'Enter a valid slug (3–40 chars: a-z, 0-9, hyphens) first.',
      });
      return;
    }
    if (!draft.isPublished) {
      setMessage({
        type: 'error',
        text: 'Turn on "Published" and save so the link works for everyone.',
      });
      return;
    }
    setMessage({ type: '', text: '' });
    setSaving(true);
    try {
      const payload = { ...draft, slug: normalizedSlug, isPublished: true };
      const saved = await saveUserPublicPage(userId, payload, user);
      setDraft(saved);
      const urlToOpen = getPublicPageUrl(normalizedSlug);
      window.open(urlToOpen, '_blank', 'noopener,noreferrer');
      setMessage({
        type: 'success',
        text: 'Link opened. Your page is live for anyone with the link.',
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err?.message || 'Could not save. Try saving again, then open the link.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportHtml = () => {
    const page = { ...draft, slug: normalizedSlug || draft.slug };
    const filename = (normalizedSlug || 'digital-business-card') + '-business-card.html';
    downloadPageAsHtml(page, filename);
    setMessage({ type: 'success', text: 'HTML file downloaded. Host it on any domain.' });
  };

  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const generateQr = useCallback(async () => {
    if (!publicUrl || !slugValid) return;
    try {
      const url = await QRCode.toDataURL(publicUrl, {
        width: 512,
        margin: 2,
        color: { dark: isDark ? '#ffffff' : '#1B2A4A', light: '#00000000' },
      });
      setQrDataUrl(url);
      setQrDialogOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Could not generate QR code.' });
    }
  }, [publicUrl, slugValid, isDark]);

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `public-page-${normalizedSlug}-qr.png`;
    a.click();
  };

  return (
    <Stack spacing={0}>
      {loading && (
        <Typography variant="caption" color="text.secondary" sx={{ py: 1 }}>
          Loading...
        </Typography>
      )}
      {message.text && (
        <Alert
          severity={message.type === 'error' ? 'error' : 'success'}
          onClose={() => setMessage({ type: '', text: '' })}
          sx={{ borderRadius: 2, mb: 1 }}
        >
          {message.text}
        </Alert>
      )}
      {/* Status bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.25,
          borderRadius: 2,
          border: '1px solid',
          borderColor: draft.isPublished ? alpha(theme.palette.success.main, 0.35) : 'divider',
          bgcolor: draft.isPublished
            ? alpha(theme.palette.success.main, isDark ? 0.1 : 0.04)
            : alpha(theme.palette.action.hover, 0.3),
          mb: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Chip
              size="small"
              label={draft.isPublished ? 'Published' : 'Draft'}
              color={draft.isPublished ? 'success' : 'default'}
              variant={draft.isPublished ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }}
            />
            {slugValid && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
              >
                /p/{normalizedSlug}
              </Typography>
            )}
          </Box>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={!!draft.isPublished}
              onChange={(e) => updateField('isPublished', e.target.checked)}
              color="success"
              size="small"
            />
          }
          label=""
          sx={{ m: 0 }}
        />
        {draft.isPublished && slugValid && (
          <>
            <Tooltip title="QR code">
              <IconButton size="small" onClick={generateQr}>
                <AppIcon
                  name="QrCode2Outlined"
                  fallback={QrCode2OutlinedIcon}
                  sx={{ fontSize: 16 }}
                />
              </IconButton>
            </Tooltip>
            <Tooltip title="Copy link">
              <IconButton size="small" onClick={handleCopyLink}>
                <AppIcon
                  name="ContentCopyOutlined"
                  fallback={ContentCopyOutlinedIcon}
                  sx={{ fontSize: 16 }}
                />
              </IconButton>
            </Tooltip>
            <Tooltip title="Open page">
              <IconButton size="small" onClick={handleOpenLink}>
                <AppIcon
                  name="LaunchOutlined"
                  fallback={LaunchOutlinedIcon}
                  sx={{ fontSize: 16 }}
                />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title="Export HTML for other domain">
          <IconButton size="small" onClick={handleExportHtml}>
            <AppIcon
              name="DownloadOutlined"
              fallback={DownloadOutlinedIcon}
              sx={{ fontSize: 16 }}
            />
          </IconButton>
        </Tooltip>
      </Box>
      {/* Core fields: slug + template + title (always visible, compact) */}
      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mb: 1 }}
      >
        <TextField
          label="Slug"
          value={draft.slug}
          onChange={(e) => updateField('slug', e.target.value)}
          size="small"
          fullWidth
          error={Boolean(draft.slug) && !slugValid}
          helperText={!slugValid && draft.slug ? '3-40 chars: a-z, 0-9, hyphens' : ''}
          InputProps={{ sx: { fontSize: '0.8125rem' } }}
          InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
        />
        <TextField
          label="Template"
          value={draft.templateKey}
          onChange={(e) => updateField('templateKey', e.target.value)}
          select
          size="small"
          fullWidth
          InputProps={{ sx: { fontSize: '0.8125rem' } }}
          InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
        >
          {PUBLIC_PAGE_TEMPLATES.map((tpl) => (
            <MenuItem key={tpl.key} value={tpl.key}>
              {tpl.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Page title"
          value={draft.title}
          onChange={(e) => updateField('title', e.target.value)}
          size="small"
          fullWidth
          InputProps={{ sx: { fontSize: '0.8125rem' } }}
          InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
        />
        <TextField
          label="Subtitle"
          value={draft.subtitle}
          onChange={(e) => updateField('subtitle', e.target.value)}
          size="small"
          fullWidth
          InputProps={{ sx: { fontSize: '0.8125rem' } }}
          InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
        />
      </Box>
      {/* Features on card */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', mb: 1.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mr: 0.5 }}>
          Features on card:
        </Typography>
        {draft.showScheduleMeeting && draft.bookingSlug && (
          <Chip
            size="small"
            icon={
              <AppIcon
                name="EventAvailableOutlined"
                fallback={EventAvailableOutlinedIcon}
                sx={{ fontSize: 14 }}
              />
            }
            label="Schedule a meeting"
            color="primary"
            variant="filled"
            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
          />
        )}
        {socialCount > 0 && (
          <Chip
            size="small"
            label={`Social (${socialCount})`}
            variant="outlined"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
        {contactCount > 0 && (
          <Chip
            size="small"
            label={`Contact (${contactCount})`}
            variant="outlined"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
        {!(draft.showScheduleMeeting && draft.bookingSlug) &&
          socialCount === 0 &&
          contactCount === 0 && (
            <Typography variant="caption" color="text.secondary">
              None yet. Add scheduling or links below.
            </Typography>
          )}
      </Box>
      {/* Collapsible sections */}
      <Stack
        spacing={0}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          '& > *:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
        }}
      >
        {/* Schedule a meeting — feature */}
        <Box>
          <SectionToggle
            icon={EventAvailableOutlinedIcon}
            label="Schedule a meeting"
            badge={draft.showScheduleMeeting && draft.bookingSlug ? 'On' : null}
            open={!!openSections.scheduling}
            onToggle={() => toggle('scheduling')}
          />
          <Collapse in={!!openSections.scheduling}>
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!draft.showScheduleMeeting}
                    onChange={(e) => updateField('showScheduleMeeting', e.target.checked)}
                    color="primary"
                    size="medium"
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Show &quot;Schedule a Meeting&quot; button on my card
                  </Typography>
                }
                sx={{ mb: 1.5, display: 'flex', alignItems: 'center' }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.55 }}>
                When on, visitors see a button that opens your scheduling page. They pick a date and
                time and the meeting is added to your calendar. Use the same slug as in Settings →
                Booking Settings.
              </Typography>
              <TextField
                label="Booking page slug"
                value={draft.bookingSlug ?? ''}
                onChange={(e) => updateField('bookingSlug', e.target.value)}
                size="small"
                fullWidth
                placeholder="e.g. john-meetings"
                helperText="Your scheduling page will be: /book/[slug]"
                InputProps={{
                  sx: {
                    fontSize: '0.875rem',
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.background.paper, 0.6),
                    '&.Mui-focused': { bgcolor: 'background.paper' },
                  },
                }}
                InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                sx={{ mb: 1.5 }}
              />
              {draft.bookingSlug && (
                <Box
                  sx={{
                    py: 1.25,
                    px: 1.5,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.main, isDark ? 0.12 : 0.08),
                    border: '1px solid',
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                    mb: 1.5,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}
                  >
                    Your scheduling link
                  </Typography>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ flexWrap: 'wrap', gap: 0.5 }}
                  >
                    <Typography
                      variant="body2"
                      component="code"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.8125rem',
                        wordBreak: 'break-all',
                        color: 'primary.main',
                        fontWeight: 600,
                      }}
                    >
                      {typeof window !== 'undefined'
                        ? `${window.location.origin}/book/${normalizeSlug(draft.bookingSlug)}`
                        : `/book/${normalizeSlug(draft.bookingSlug)}`}
                    </Typography>
                    <Tooltip title="Copy link">
                      <IconButton
                        size="small"
                        onClick={() => {
                          const url =
                            typeof window !== 'undefined'
                              ? `${window.location.origin}/book/${normalizeSlug(draft.bookingSlug)}`
                              : `/book/${normalizeSlug(draft.bookingSlug)}`;
                          navigator.clipboard?.writeText(url);
                        }}
                        sx={{ color: 'primary.main' }}
                      >
                        <AppIcon
                          name="ContentCopyOutlined"
                          fallback={ContentCopyOutlinedIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  <AppIcon
                    name="CalendarMonthOutlined"
                    fallback={CalendarMonthOutlinedIcon}
                    sx={{ fontSize: 16 }}
                  />
                }
                onClick={() => window.open('/settings/booking', '_self')}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
              >
                Open Booking Settings to set up or copy link
              </Button>
            </Box>
          </Collapse>
        </Box>

        {/* Appearance: photo + accent color */}
        <Box>
          <SectionToggle
            icon={PaletteOutlinedIcon}
            label="Appearance"
            badge={
              [draft.photoUrl, draft.accentColor].filter(Boolean).length
                ? `${[draft.photoUrl, draft.accentColor].filter(Boolean).length} set`
                : null
            }
            open={!!openSections.appearance}
            onToggle={() => toggle('appearance')}
          />
          <Collapse in={!!openSections.appearance}>
            <Box sx={{ px: 1.25, pb: 1.25 }}>
              {/* Photo */}
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, display: 'block', mb: 0.75, color: 'text.secondary' }}
              >
                Profile photo
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: '2px dashed',
                    borderColor: draft.photoUrl ? 'primary.main' : 'divider',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: draft.photoUrl
                      ? 'transparent'
                      : alpha(theme.palette.action.hover, 0.3),
                    flexShrink: 0,
                  }}
                >
                  {draft.photoUrl ? (
                    <img
                      src={draft.photoUrl}
                      alt="Profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <AppIcon
                      name="PhotoCameraOutlined"
                      fallback={PhotoCameraOutlinedIcon}
                      sx={{ fontSize: 22, color: 'text.disabled' }}
                    />
                  )}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    component="label"
                    startIcon={
                      <AppIcon
                        name="PhotoCameraOutlined"
                        fallback={PhotoCameraOutlinedIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      borderRadius: 2,
                      fontSize: '0.75rem',
                      mr: 0.75,
                    }}
                  >
                    Upload
                    <input type="file" accept="image/*" hidden onChange={handlePhotoUpload} />
                  </Button>
                  {draft.photoUrl && (
                    <Tooltip title="Remove photo">
                      <IconButton
                        size="small"
                        onClick={() => updateField('photoUrl', '')}
                        sx={{ color: 'error.main' }}
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          sx={{ fontSize: 16 }}
                        />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.25 }}
                  >
                    JPG, PNG, max 2 MB. Shown on public page.
                  </Typography>
                </Box>
              </Box>

              {/* Accent color */}
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, display: 'block', mb: 0.75, color: 'text.secondary' }}
              >
                Accent color
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                {ACCENT_PRESETS.map((preset) => (
                  <Tooltip key={preset.value} title={preset.label}>
                    <Box
                      onClick={() => updateField('accentColor', preset.value)}
                      sx={{
                        width: 26,
                        height: 26,
                        borderRadius: 1.5,
                        bgcolor: preset.value,
                        border: '2px solid',
                        borderColor:
                          draft.accentColor === preset.value ? 'text.primary' : 'transparent',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, transform 0.15s',
                        '&:hover': { transform: 'scale(1.12)', borderColor: 'text.secondary' },
                      }}
                    />
                  </Tooltip>
                ))}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                  <input
                    type="color"
                    value={draft.accentColor || '#1B2A4A'}
                    onChange={(e) => updateField('accentColor', e.target.value)}
                    style={{
                      width: 28,
                      height: 26,
                      borderRadius: 6,
                      border: '1px solid #ccc',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                  {draft.accentColor && (
                    <Tooltip title="Reset to default">
                      <IconButton size="small" onClick={() => updateField('accentColor', '')}>
                        <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                Applies to buttons, links, and header on your public page.
              </Typography>
            </Box>
          </Collapse>
        </Box>

        {/* Company & Website */}
        <Box>
          <SectionToggle
            icon={BusinessOutlinedIcon}
            label="Company & Website"
            badge={
              [draft.companyName, draft.companyDescription, draft.companyWebsite].filter(Boolean)
                .length
                ? `${[draft.companyName, draft.companyDescription, draft.companyWebsite].filter(Boolean).length} set`
                : null
            }
            open={!!openSections.company}
            onToggle={() => toggle('company')}
          />
          <Collapse in={!!openSections.company}>
            <Stack spacing={2} sx={{ px: 1.5, pb: 1.5 }}>
              {/* Company name — bold at top */}
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.primary', display: 'block', mb: 0.75 }}
                >
                  Company name
                </Typography>
                <TextField
                  value={draft.companyName ?? ''}
                  onChange={(e) => updateField('companyName', e.target.value)}
                  placeholder="e.g. Acme Inc."
                  size="small"
                  fullWidth
                  InputProps={{
                    sx: {
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.background.paper, 0.6),
                      '&.Mui-focused': { bgcolor: 'background.paper' },
                    },
                  }}
                />
              </Box>

              {/* Description — framed light block */}
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.primary', display: 'block', mb: 0.75 }}
                >
                  Description
                </Typography>
                <TextField
                  value={draft.companyDescription ?? ''}
                  onChange={(e) => updateField('companyDescription', e.target.value)}
                  placeholder="Short description of your company or offer"
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={4}
                  InputProps={{
                    sx: {
                      fontSize: '0.875rem',
                      borderRadius: 2,
                      bgcolor: isDark
                        ? alpha(theme.palette.common.white, 0.06)
                        : alpha(theme.palette.common.black, 0.04),
                      border: '1px solid',
                      borderColor: isDark ? alpha(theme.palette.common.white, 0.12) : 'divider',
                      py: 1,
                      '&.Mui-focused': {
                        borderColor: 'primary.main',
                        bgcolor: isDark
                          ? alpha(theme.palette.common.white, 0.08)
                          : alpha(theme.palette.common.black, 0.03),
                      },
                    },
                  }}
                  sx={{ '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}
                />
              </Box>

              {/* URL — input + button to open */}
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.primary', display: 'block', mb: 0.75 }}
                >
                  URL
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="stretch">
                  <TextField
                    value={draft.companyWebsite ?? ''}
                    onChange={(e) => updateField('companyWebsite', e.target.value)}
                    placeholder="https://company.com"
                    size="small"
                    fullWidth
                    InputProps={{
                      sx: {
                        fontSize: '0.875rem',
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.background.paper, 0.6),
                        '&.Mui-focused': { bgcolor: 'background.paper' },
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    size="medium"
                    href={
                      draft.companyWebsite
                        ? draft.companyWebsite.startsWith('http')
                          ? draft.companyWebsite
                          : `https://${draft.companyWebsite}`
                        : undefined
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    disabled={!draft.companyWebsite?.trim()}
                    startIcon={
                      <AppIcon
                        name="LaunchOutlined"
                        fallback={LaunchOutlinedIcon}
                        sx={{ fontSize: 18 }}
                      />
                    }
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      borderRadius: 2,
                      minWidth: { xs: '100%', sm: 120 },
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Open link
                  </Button>
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  Shown as a button on your card; visitors go to this URL.
                </Typography>
              </Box>
            </Stack>
          </Collapse>
        </Box>

        {/* Telegram */}
        <Box>
          <SectionToggle
            icon={AlternateEmailOutlinedIcon}
            label="Telegram"
            badge={
              [draft.telegramHandle, draft.telegramGroup].filter(Boolean).length
                ? `${[draft.telegramHandle, draft.telegramGroup].filter(Boolean).length} set`
                : null
            }
            open={!!openSections.telegram}
            onToggle={() => toggle('telegram')}
          />
          <Collapse in={!!openSections.telegram}>
            <Box
              sx={{
                px: 1.25,
                pb: 1.25,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1,
              }}
            >
              <TextField
                label="Username"
                value={draft.telegramHandle}
                onChange={(e) => updateField('telegramHandle', e.target.value)}
                placeholder="@username"
                size="small"
                fullWidth
                InputProps={{ sx: { fontSize: '0.8125rem' } }}
                InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
              />
              <TextField
                label="Group URL"
                value={draft.telegramGroup}
                onChange={(e) => updateField('telegramGroup', e.target.value)}
                placeholder="https://t.me/group"
                size="small"
                fullWidth
                InputProps={{ sx: { fontSize: '0.8125rem' } }}
                InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
              />
            </Box>
          </Collapse>
        </Box>

        {/* Contact */}
        <Box>
          <SectionToggle
            icon={ContactPhoneOutlinedIcon}
            label="Contact"
            badge={contactCount ? `${contactCount} / ${CONTACT_FIELDS.length}` : null}
            open={!!openSections.contact}
            onToggle={() => toggle('contact')}
          />
          <Collapse in={!!openSections.contact}>
            <Box
              sx={{
                px: 1.25,
                pb: 1.25,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
                gap: 1,
              }}
            >
              {CONTACT_FIELDS.map((item) => (
                <TextField
                  key={item.key}
                  label={item.label}
                  value={draft.contact?.[item.key] || ''}
                  onChange={(e) => updateContact(item.key, e.target.value)}
                  placeholder={item.placeholder}
                  size="small"
                  fullWidth
                  InputProps={{ sx: { fontSize: '0.8125rem' } }}
                  InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
                />
              ))}
            </Box>
          </Collapse>
        </Box>

        {/* Social Media */}
        <Box>
          <SectionToggle
            icon={ShareOutlinedIcon}
            label="Social Media"
            badge={socialCount ? `${socialCount} / ${SOCIAL_FIELDS.length}` : null}
            open={!!openSections.social}
            onToggle={() => toggle('social')}
          />
          <Collapse in={!!openSections.social}>
            <Box
              sx={{
                px: 1.25,
                pb: 1.25,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1,
              }}
            >
              {SOCIAL_FIELDS.map((item) => (
                <TextField
                  key={item.key}
                  label={item.label}
                  value={draft.social?.[item.key] || ''}
                  onChange={(e) => updateSocial(item.key, e.target.value)}
                  placeholder={item.placeholder}
                  size="small"
                  fullWidth
                  InputProps={{ sx: { fontSize: '0.8125rem' } }}
                  InputLabelProps={{ sx: { fontSize: '0.8125rem' } }}
                />
              ))}
            </Box>
          </Collapse>
        </Box>
      </Stack>
      {/* Save button */}
      <Box sx={{ pt: 1.5 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={
            <AppIcon name="SaveOutlined" fallback={SaveOutlinedIcon} sx={{ fontSize: 16 }} />
          }
          onClick={handleSave}
          disabled={saving || !slugValid}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
      {/* QR Code dialog */}
      <Dialog
        open={qrDialogOpen}
        onClose={() => setQrDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            fontWeight: 700,
            fontSize: '1rem',
            pb: 0.5,
          }}
        >
          <AppIcon name="QrCode2Outlined" fallback={QrCode2OutlinedIcon} sx={{ fontSize: 22 }} />
          QR Code
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" onClick={() => setQrDialogOpen(false)}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
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
                alt="QR code for public page"
                style={{ width: 220, height: 220, imageRendering: 'pixelated' }}
              />
            </Box>
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 0.5, fontFamily: 'monospace' }}
          >
            {publicUrl}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Scan this QR code to open your public page
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
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              Download PNG
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
              onClick={handleCopyLink}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              Copy link
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
