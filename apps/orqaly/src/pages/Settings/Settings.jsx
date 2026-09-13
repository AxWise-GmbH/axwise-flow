import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  alpha,
  useTheme,
  InputAdornment,
  IconButton,
  Alert,
  CircularProgress,
  Stack,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  DialogContentText,
  Paper,
  Portal,
  Tabs,
  Tab,
  Tooltip,
  useMediaQuery,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import LooksOneOutlinedIcon from '@mui/icons-material/LooksOneOutlined';
import LooksTwoOutlinedIcon from '@mui/icons-material/LooksTwoOutlined';
import Looks3OutlinedIcon from '@mui/icons-material/Looks3Outlined';
import Looks4OutlinedIcon from '@mui/icons-material/Looks4Outlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LanguageIcon from '@mui/icons-material/Language';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import BrandingWatermarkOutlinedIcon from '@mui/icons-material/BrandingWatermarkOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import SecurityIcon from '@mui/icons-material/Security';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useNavigate } from 'react-router-dom';
import * as auth from '../../lib/auth';
import { logAction } from '../../services/auditLogBackend';
import { YubiKeyIcon, Google2FAIcon } from '../../components/Common/SignInMethodIcons';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import { DESIGN_SYSTEM_COLORS, COLOR_USAGE } from '../../theme/designSystem';
import GemIcon, { GEMS, gemToDataUri } from '../../components/Common/GemIcon';
import * as profileData from '../../services/profileDataBackend';
import { loadAuditLogs } from '../../services/auditLogBackend';
import Logo from '../../components/Common/Logo';
import FormDialog from '../../components/Common/FormDialog';
import PageLayout from '../../components/Common/PageLayout';
import SettingsTabRail from './SettingsTabRail';
import SettingsTabPanel from './SettingsTabPanel';
import SettingsSearch from './SettingsSearch';
import { SETTINGS_TABS, SETTINGS_SECTION_DEFS } from './settingsSections';
import useSettingsTab from './useSettingsTab';
import useProfileTabBodies from './tabs/ProfileTab';
import { auroraHeaderSx } from '../../theme/settingsMotion';
import { SIMPLE_DOCK_CLEARANCE_PX } from '../../components/Layout/SimpleDock';
import EmptyState from '../../components/Common/EmptyState';
import PublicPageSettingsPanel from '../../components/Settings/PublicPageSettingsPanel';
import PaymentMethodsSection from '../../components/Settings/PaymentMethodsSection';
import MeetingsCalendarPanel from './MeetingsCalendarPanel';
import { supabase, hasSupabase } from '../../lib/supabase';
import publicBookingService from '../../services/publicBookingService';
import {
  EMAIL_ACTION_CATEGORIES,
  CHANNEL_KEY,
  getChannelPrefs,
  getVisibleCategoryEntries,
  loadPreferencesWithMeta as loadEmailPrefsWithMeta,
  savePreferences as saveEmailPrefs,
} from '../../services/emailNotificationPreferences';
import { invalidatePrefsCache } from '../../services/emailNotificationDispatcher';
import { loadRoles, getRoleIdForUser } from '../../services/rolesPermissionsService';
import { useNotifications } from '../../context/NotificationContext';
import AiOrb from '../../components/VoiceControl/AiOrb';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { SettingsViewOptionsButton, useSettingsBlockLayout } from './SettingsViewOptions';
import PagesVisibilityPanel from './PagesVisibilityPanel';
import AxwiseOverlayControls from './AxwiseOverlayControls';
import DataKnowledgeCard from '../Assistant/cards/DataKnowledgeCard';
import ContactsCard from '../Assistant/cards/ContactsCard';
import ConversationHistoryCard from '../Assistant/cards/ConversationHistoryCard';
import { ASSISTANT_TIER_H } from '../Assistant/assistantTemplates';
import { useSettingsDataOverview } from '../../hooks/useSettingsDataOverview';
import AppIcon from '../../components/icons/AppIcon';

// Sample icons shown in the Preferences "Icon set" live preview strip. Each pairs
// a canonical MUI name (mapped in iconSetMap) with its MUI fallback component.
const ICON_SET_PREVIEW = [
  { name: 'PaletteOutlined', Comp: PaletteOutlinedIcon },
  { name: 'SmartToyOutlined', Comp: SmartToyOutlinedIcon },
  { name: 'GroupsOutlined', Comp: GroupsOutlinedIcon },
  { name: 'BuildOutlined', Comp: BuildOutlinedIcon },
  { name: 'SearchOutlined', Comp: SearchOutlinedIcon },
  { name: 'FolderOutlined', Comp: FolderOutlinedIcon },
  { name: 'BarChartOutlined', Comp: BarChartOutlinedIcon },
  { name: 'RocketLaunchOutlined', Comp: RocketLaunchOutlinedIcon },
  { name: 'NotificationsOutlined', Comp: NotificationsOutlinedIcon },
  { name: 'AutoAwesomeOutlined', Comp: AutoAwesomeOutlinedIcon },
];
const VOICE_SETTINGS_STORAGE_KEY = 'orch_voice_settings';
const VOICE_SETTINGS_UPDATED_EVENT = 'orch_voice_settings_updated';

// Branding logo constraints - keep the data-URL small enough for localStorage.
const BRAND_LOGO_MAX_BYTES = 1024 * 1024; // 1 MB source cap
const BRAND_LOGO_MAX_DIM = 128; // px; raster logos are downscaled to this
const BRAND_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

// Read a logo File into a compact data-URL. Raster images are downscaled to
// BRAND_LOGO_MAX_DIM via canvas; SVGs are read as-is (canvas rasterization is lossy).
function readBrandLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    if (!BRAND_LOGO_TYPES.includes(file.type))
      return reject(new Error('Use a PNG, JPG, SVG, or WebP image.'));
    if (file.size > BRAND_LOGO_MAX_BYTES) return reject(new Error('Image must be under 1 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    if (file.type === 'image/svg+xml') {
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image.'));
      img.onload = () => {
        const scale = Math.min(1, BRAND_LOGO_MAX_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not available.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// 317px = ASSISTANT_TIER_H.short - the same fixed height these 3 cards render at
// on the Assistant Console. Imported, not duplicated, so the two surfaces can't
// drift out of sync.
const DATA_OVERVIEW_CARD_H = ASSISTANT_TIER_H.short;

function SettingsSaveBar({ saving, onSave }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const G = theme.palette.primary.main;

  // Renders in normal document flow, directly below the last settings section -
  // not a fixed overlay, so it never covers content while scrolling.
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isMobile ? 'stretch' : 'center',
        mt: 2,
        animation: 'saveBarSlideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        '@keyframes saveBarSlideUp': {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: isMobile ? '100%' : 'auto',
          minWidth: isMobile ? 'auto' : 340,
          maxWidth: isMobile ? '100%' : 480,
          px: { xs: 2, sm: 2.5 },
          py: { xs: 1, sm: 1.25 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: alpha(G, isDark ? 0.3 : 0.2),
          bgcolor: isDark
            ? alpha(theme.palette.background.paper, 0.85)
            : alpha(theme.palette.background.paper, 0.95),
          backdropFilter: 'blur(20px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1.5, sm: 2 },
          boxShadow: isDark
            ? `0 12px 40px ${alpha('#000', 0.55)}, 0 0 0 1px ${alpha(G, 0.08)} inset`
            : `0 12px 40px ${alpha('#000', 0.12)}, 0 0 0 1px ${alpha(G, 0.06)} inset`,
        }}
      >
        {/* Unsaved dot + label */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: G,
              flexShrink: 0,
              boxShadow: `0 0 8px ${alpha(G, 0.6)}`,
              animation: 'saveBarPulse 2s ease-in-out infinite',
              '@keyframes saveBarPulse': {
                '0%, 100%': { boxShadow: `0 0 6px ${alpha(G, 0.4)}` },
                '50%': { boxShadow: `0 0 12px ${alpha(G, 0.8)}` },
              },
            }}
          />
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {saving ? 'Saving your changes…' : 'Unsaved changes'}
          </Typography>
        </Box>

        {/* Save button */}
        <Button
          variant="contained"
          size="small"
          onClick={onSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            px: { xs: 2.5, sm: 3 },
            py: 0.85,
            flexShrink: 0,
            minWidth: { xs: 100, sm: 130 },
            boxShadow: `0 4px 16px ${alpha(G, 0.3)}`,
            '&:hover': {
              boxShadow: `0 6px 22px ${alpha(G, 0.45)}`,
            },
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Paper>
    </Box>
  );
}

function AdvancedSettings() {
  const navigate = useNavigate();
  const dataOverview = useSettingsDataOverview();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const supabaseAuthEnabled = hasSupabase();
  const {
    toggleColorMode,
    primaryColor,
    setPrimaryColor,
    motivationEnabled,
    setMotivationEnabled,
    motivationLanguage,
    setMotivationLanguage,
    logoDefaultPage,
    setLogoDefaultPage,
    devMode,
    setDevMode,
    iconSet,
    setIconSet,
    brandName,
    setBrandName,
    brandSubtitle,
    setBrandSubtitle,
    brandLogo,
    setBrandLogo,
  } = useThemeMode();
  const brandLogoInputRef = useRef(null);
  const [brandLogoError, setBrandLogoError] = useState('');
  const handleBrandLogoFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setBrandLogoError('');
      try {
        const dataUrl = await readBrandLogoFile(file);
        setBrandLogo(dataUrl);
        logAction({
          action: 'branding_changed',
          entity: 'Settings',
          entityId: '-',
          details: 'Sidebar logo updated',
          meta: { source: 'settings', importance: 'low', tags: ['branding', 'logo'] },
        });
      } catch (err) {
        setBrandLogoError(err?.message || 'Could not use that image.');
      }
    },
    [setBrandLogo]
  );
  const { user } = useAuth();
  const { pushNotification } = useNotifications();
  const partnerAccess = usePartnerAccessOptional();
  const isPartnerRole = partnerAccess?.isPartnerRole ?? false;
  const canAccessFinances =
    partnerAccess?.roleId === 'role-super-admin' || partnerAccess?.roleId === 'role-manager';
  const { simpleMode, toggleSimpleMode } = useSimpleMode();
  // Pages the current user's role can access — used to role-scope the
  // notification catalog. null = not resolved yet → show all (fail open).
  const [accessiblePageIds, setAccessiblePageIds] = useState(null);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showLetsTalkBar, setShowLetsTalkBar] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.showLetsTalkBar);
    } catch {
      return false;
    }
  });
  const [emailPrefs, setEmailPrefs] = useState({});
  const [emailPrefsLoaded, setEmailPrefsLoaded] = useState(false);
  const [emailPrefsSaving, setEmailPrefsSaving] = useState(false);
  const [emailPrefsMessage, setEmailPrefsMessage] = useState({ type: '', text: '' });
  const [emailPrefsSyncState, setEmailPrefsSyncState] = useState({
    source: 'defaults',
    warning: '',
  });
  const [telegram, setTelegram] = useState('');
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [noteDetail, setNoteDetail] = useState(null);
  const [noteDetailText, setNoteDetailText] = useState('');
  const [todoDetail, setTodoDetail] = useState(null);
  const [todoDetailText, setTodoDetailText] = useState('');
  const [todoDetailDone, setTodoDetailDone] = useState(false);
  const [profileDataLoading, setProfileDataLoading] = useState(false);
  const [profileDataError, setProfileDataError] = useState(null);
  const [profileNotesTodoTab, setProfileNotesTodoTab] = useState(0);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [meetingsConfigured, setMeetingsConfigured] = useState(() => {
    try {
      return localStorage.getItem('orch_meetings_setup_done') === 'true';
    } catch {
      return false;
    }
  });
  const [meetingSetupOpen, setMeetingSetupOpen] = useState(false);
  const [meetingSetupBusy, setMeetingSetupBusy] = useState(false);
  const [meetingSchedulerDialogOpen, setMeetingSchedulerDialogOpen] = useState(false);
  const [copyLinkBusy, setCopyLinkBusy] = useState(false);
  const [copyLinkMessage, setCopyLinkMessage] = useState(null);
  const [copyLinkUrl, setCopyLinkUrl] = useState(null);

  // Meetings calendar is "configured" once the user has picked a template or
  // opened custom setup (remembered locally), or already has a booking profile.
  const markMeetingsConfigured = useCallback(() => {
    try {
      localStorage.setItem('orch_meetings_setup_done', 'true');
    } catch {
      /* ignore */
    }
    setMeetingsConfigured(true);
  }, []);

  useEffect(() => {
    if (meetingsConfigured || !supabaseAuthEnabled) return undefined;
    let cancelled = false;
    publicBookingService
      .hasBookingProfile()
      .then((has) => {
        if (!cancelled && has) markMeetingsConfigured();
      })
      .catch(() => {
        /* not signed in / table missing - stays not-configured until setup */
      });
    return () => {
      cancelled = true;
    };
  }, [meetingsConfigured, supabaseAuthEnabled, markMeetingsConfigured]);

  const handleUseTemplate = useCallback(async () => {
    setMeetingSetupBusy(true);
    try {
      // Provisions the default Mon-Fri 9-5 booking profile. Best-effort: the
      // local calendar still works without a profile (e.g. when signed out).
      if (supabaseAuthEnabled) await publicBookingService.getOrCreateProfile();
    } catch {
      /* ignore - fall through to marking configured */
    } finally {
      setMeetingSetupBusy(false);
      setMeetingSetupOpen(false);
      markMeetingsConfigured();
    }
  }, [supabaseAuthEnabled, markMeetingsConfigured]);

  const handleCustomSetup = useCallback(() => {
    markMeetingsConfigured();
    setMeetingSetupOpen(false);
    navigate('/settings/booking');
  }, [markMeetingsConfigured, navigate]);
  const [archivedItems, setArchivedItems] = useState([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'note'|'todo', id: string, text: string }
  const [archiveConfirm, setArchiveConfirm] = useState(null); // { type: 'note'|'todo', id: string, text: string }
  const [actionLogs, setActionLogs] = useState([]);
  const [loadingActionLogs, setLoadingActionLogs] = useState(false);
  const [archiveDialogTab, setArchiveDialogTab] = useState(0);

  const truncate = (str, max = 25) => (str.length <= max ? str : `${str.slice(0, max)}…`);

  const userId = user?.uid;

  const loadProfileData = useCallback(async () => {
    if (!userId) return;
    // Reset the localStorage fallback flag so we always try Supabase first
    profileData.resetProfileStorageFlag();
    setProfileDataLoading(true);
    setProfileDataError(null);
    try {
      const [notesData, todosData] = await Promise.all([
        profileData.loadNotes(userId),
        profileData.loadTodos(userId),
      ]);
      setNotes(notesData);
      setTodos(todosData);
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to load notes and tasks.');
    } finally {
      setProfileDataLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSavingProfile(true);
    try {
      await auth.updateProfile({ displayName: displayName.trim(), telegram: telegram.trim() });
      pushNotification('Settings', 'Profile saved successfully.');
      await logAction({
        action: 'profile_updated',
        entity: 'Settings',
        entityId: userId,
        details: 'Profile settings saved.',
        meta: { source: 'settings', importance: 'low' },
      });
    } catch (err) {
      pushNotification('Settings', err?.message || 'Failed to save profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  /* ---- Email notification preferences ---- */
  const loadEmailNotifPrefs = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await loadEmailPrefsWithMeta(userId);
      setEmailPrefs(result.prefs);
      setEmailPrefsSyncState({ source: result.source, warning: result.warning || '' });
    } catch {
      // ignore – defaults are applied
      setEmailPrefsSyncState({ source: 'defaults', warning: '' });
    } finally {
      setEmailPrefsLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    loadEmailNotifPrefs();
  }, [loadEmailNotifPrefs]);

  const handleEmailPrefToggle = (actionKey) => {
    setEmailPrefs((prev) => ({ ...prev, [actionKey]: !prev[actionKey] }));
    setEmailPrefsMessage({ type: '', text: '' });
  };

  const handleEmailPrefsCategoryToggle = (categoryKey) => {
    const cat = EMAIL_ACTION_CATEGORIES[categoryKey];
    if (!cat) return;
    const actionKeys = Object.keys(cat.actions);
    const allOn = actionKeys.every((k) => emailPrefs[k]);
    setEmailPrefs((prev) => {
      const next = { ...prev };
      actionKeys.forEach((k) => {
        next[k] = !allOn;
      });
      return next;
    });
    setEmailPrefsMessage({ type: '', text: '' });
  };

  const handleSaveEmailPrefs = async () => {
    if (!userId) return;
    setEmailPrefsSaving(true);
    setEmailPrefsMessage({ type: '', text: '' });
    try {
      const saveResult = await saveEmailPrefs(userId, emailPrefs, {
        requireRemote: supabaseAuthEnabled,
      });
      invalidatePrefsCache();
      await logAction({
        action: 'email_prefs_updated',
        entity: 'Settings',
        entityId: '-',
        details: `Email notification preferences updated (${Object.values(emailPrefs).filter(Boolean).length} enabled)`,
        meta: { source: 'settings', importance: 'medium', tags: ['notifications', 'email'] },
      });
      if (saveResult.savedToSupabase) {
        setEmailPrefsSyncState({ source: 'supabase', warning: '' });
        setEmailPrefsMessage({
          type: 'success',
          text: 'Email notification preferences saved and synced to database.',
        });
      } else {
        setEmailPrefsSyncState({ source: 'localStorage', warning: saveResult.warning || '' });
        setEmailPrefsMessage({
          type: 'success',
          text: saveResult.warning || 'Preferences were saved locally only.',
        });
      }
    } catch (err) {
      setEmailPrefsMessage({ type: 'error', text: err?.message || 'Failed to save preferences.' });
    } finally {
      setEmailPrefsSaving(false);
    }
  };

  /* ---- Role-scope the notification catalog ---- */
  useEffect(() => {
    let active = true;
    (async () => {
      if (!userId) return;
      try {
        const roles = await loadRoles();
        const roleId = partnerAccess?.roleId || getRoleIdForUser(userId);
        const role = roles.find((r) => r.id === roleId);
        if (!role?.pages) {
          if (active) setAccessiblePageIds(null); // unknown role → show all
          return;
        }
        const ids = new Set(
          Object.entries(role.pages)
            .filter(([, access]) => access?.enabled)
            .map(([pageId]) => pageId)
        );
        if (active) setAccessiblePageIds(ids);
      } catch {
        if (active) setAccessiblePageIds(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, partnerAccess?.roleId]);

  const visibleCategoryEntries = useMemo(
    () => getVisibleCategoryEntries(accessiblePageIds),
    [accessiblePageIds]
  );

  const visibleActionKeys = useMemo(
    () => visibleCategoryEntries.flatMap(([, cat]) => Object.keys(cat.actions)),
    [visibleCategoryEntries]
  );

  /* ---- Delivery channels (email / in-app) ---- */
  const channels = getChannelPrefs(emailPrefs);
  const handleChannelToggle = (channel) => {
    setEmailPrefs((prev) => {
      const current = getChannelPrefs(prev);
      return { ...prev, [CHANNEL_KEY]: { ...current, [channel]: !current[channel] } };
    });
    setEmailPrefsMessage({ type: '', text: '' });
  };

  const emailPrefsEnabledCount = visibleActionKeys.filter((k) => emailPrefs[k]).length;
  const emailPrefsTotalCount = visibleActionKeys.length;
  const emailPrefsSyncLabel =
    emailPrefsSyncState.source === 'supabase'
      ? 'Synced to database'
      : emailPrefsSyncState.source === 'localStorage'
        ? 'Local-only fallback'
        : 'Defaults loaded';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [changingPassword, setChangingPassword] = useState(false);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [google2FADialogOpen, setGoogle2FADialogOpen] = useState(false);
  const [yubiKeyDialogOpen, setYubiKeyDialogOpen] = useState(false);
  const [google2FAQRDataUrl, setGoogle2FAQRDataUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpFactorId, setTotpFactorId] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpVerifying, setTotpVerifying] = useState(false);
  const [totpMessage, setTotpMessage] = useState({ type: '', text: '' });
  const [totpShowSecret, setTotpShowSecret] = useState(false);
  const [yubiFactorId, setYubiFactorId] = useState('');
  const [yubiFactorName, setYubiFactorName] = useState('');
  const [yubiEnabled, setYubiEnabled] = useState(false);
  const [yubiBusy, setYubiBusy] = useState(false);
  const [yubiMessage, setYubiMessage] = useState({ type: '', text: '' });
  const canUseWebAuthn =
    typeof window !== 'undefined' && window.isSecureContext && !!window.PublicKeyCredential;

  // ── Access PIN state (super admin only) ────────────────────
  const isSuperAdmin = partnerAccess?.roleId === 'role-super-admin';
  const [pinValue, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMessage, setPinMessage] = useState({ type: '', text: '' });

  const handleSetupPin = async () => {
    setPinMessage({ type: '', text: '' });
    if (!pinValue || pinValue.length < 4) {
      setPinMessage({ type: 'error', text: 'PIN must be at least 4 digits.' });
      return;
    }
    if (!/^\d+$/.test(pinValue)) {
      setPinMessage({ type: 'error', text: 'PIN must contain only digits.' });
      return;
    }
    if (pinValue !== pinConfirm) {
      setPinMessage({ type: 'error', text: 'PIN and confirmation do not match.' });
      return;
    }
    setPinSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/app?path=setup-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ pin: pinValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPinMessage({ type: 'success', text: 'Access PIN updated successfully.' });
        setPinValue('');
        setPinConfirm('');
        logAction({
          action: 'Access PIN updated',
          entity: 'Settings',
          details: 'Super admin updated the global access PIN.',
          meta: { source: 'settings', importance: 'high', tags: ['security', 'pin'] },
        }).catch(() => {});
      } else {
        setPinMessage({ type: 'error', text: data.error || 'Failed to update PIN.' });
      }
    } catch (err) {
      setPinMessage({ type: 'error', text: err?.message || 'Failed to update PIN.' });
    } finally {
      setPinSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMessage({ type: '', text: '' });
    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Current password is required.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    setChangingPassword(true);
    try {
      await auth.updatePassword(newPassword, currentPassword);
      await logAction({
        action: 'Password updated',
        entity: 'Settings',
        entityId: '-',
        details: 'User changed password',
        meta: {
          source: 'settings',
          importance: 'high',
          tags: ['security', 'password'],
        },
      });
      import('./../../services/emailNotificationDispatcher')
        .then((mod) => mod.maybeNotify('password_changed', {}))
        .catch(() => {});
      setPasswordMessage({
        type: 'success',
        text: 'Password updated successfully. You can sign in with your new password.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err?.message || 'Failed to update password.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    setPasswordMessage({ type: '', text: '' });
    try {
      await auth.linkGoogle();
      await logAction({
        action: 'google_linked',
        entity: 'Settings',
        entityId: '-',
        details: 'Google account linking initiated',
        meta: { source: 'settings', importance: 'high', tags: ['security', 'google'] },
      });
      setPasswordMessage({
        type: 'success',
        text: 'Google account linking initiated. Complete the OAuth flow in the opened tab.',
      });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err?.message || 'Could not link Google.' });
    } finally {
      setLinkingGoogle(false);
    }
  };

  const refreshSecurityStatus = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const status = await auth.getSecurityStatus();
      setGoogleLinked(!!status.googleLinked);
      setTotpEnabled(!!status.totpEnabled);
      const firstTotp = status.totpFactors?.[0];
      setTotpFactorId(firstTotp?.id ?? firstTotp?.factor_id ?? '');
      setYubiEnabled(!!status.webauthnEnabled);
      const firstWebAuthn = status.webauthnFactors?.[0];
      setYubiFactorId(firstWebAuthn?.id ?? firstWebAuthn?.factor_id ?? '');
      setYubiFactorName(firstWebAuthn?.friendly_name ?? firstWebAuthn?.friendlyName ?? 'YubiKey');
    } catch {
      // Ignore status polling errors to keep settings page usable.
    }
  }, [user?.uid]);

  useEffect(() => {
    refreshSecurityStatus();
  }, [refreshSecurityStatus]);

  const startGoogle2FASetup = useCallback(async () => {
    setTotpMessage({ type: '', text: '' });
    setGoogle2FAQRDataUrl('');
    setTotpSecret('');
    setTotpCode('');
    if (!user?.uid) {
      setTotpMessage({ type: 'error', text: 'Sign in is required before enabling 2FA.' });
      return;
    }
    setTotpLoading(true);
    try {
      let enrollment;
      try {
        enrollment = await auth.createTotpEnrollment('Google Authenticator');
      } catch (enrollErr) {
        // If a factor with this name already exists, delete it and retry
        if (
          String(enrollErr?.message || '')
            .toLowerCase()
            .includes('already exists')
        ) {
          await auth.deleteMfaFactorViaAdmin();
          enrollment = await auth.createTotpEnrollment('Google Authenticator');
        } else {
          throw enrollErr;
        }
      }
      if (!enrollment?.factorId) throw new Error('Failed to create TOTP enrollment factor.');
      setTotpFactorId(enrollment.factorId);
      if (enrollment.secret) setTotpSecret(enrollment.secret);
      if (enrollment.qrCodeSvg) {
        const svg = enrollment.qrCodeSvg.trim();
        const dataUrl = svg.startsWith('<')
          ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
          : svg;
        setGoogle2FAQRDataUrl(dataUrl);
      } else if (enrollment.uri) {
        const url = await QRCode.toDataURL(enrollment.uri, { width: 200, margin: 2 });
        setGoogle2FAQRDataUrl(url);
      }
      if (!enrollment.qrCodeSvg && !enrollment.uri && enrollment.secret) {
        setTotpMessage({
          type: 'success',
          text: 'Enter the secret key below in Google Authenticator (Add account → Enter a setup key), then enter the 6-digit code.',
        });
      } else {
        setTotpMessage({
          type: 'success',
          text: 'Scan the QR code in Google Authenticator, then enter the 6-digit code below.',
        });
      }
    } catch (err) {
      setTotpMessage({
        type: 'error',
        text: err?.message || 'Could not start Google Authenticator setup.',
      });
    } finally {
      setTotpLoading(false);
    }
  }, [user?.uid]);

  const handleVerifyGoogle2FA = useCallback(async () => {
    if (!totpFactorId) {
      setTotpMessage({ type: 'error', text: 'Start setup first to generate a valid factor.' });
      return;
    }
    if (!/^\d{6}$/.test(String(totpCode || '').trim())) {
      setTotpMessage({ type: 'error', text: 'Enter a valid 6-digit verification code.' });
      return;
    }
    setTotpVerifying(true);
    setTotpMessage({ type: '', text: '' });
    try {
      const challengeId = await auth.createTotpChallenge(totpFactorId);
      await auth.verifyTotpCode({ factorId: totpFactorId, challengeId, code: totpCode });
      setTotpEnabled(true);
      await logAction({
        action: 'totp_enabled',
        entity: 'Settings',
        entityId: '-',
        details: 'Google Authenticator 2FA enabled',
        meta: { source: 'settings', importance: 'high', tags: ['security', '2fa'] },
      });
      setTotpMessage({
        type: 'success',
        text: 'Google Authenticator 2FA is now enabled for your account.',
      });
      await refreshSecurityStatus();
    } catch (err) {
      setTotpMessage({
        type: 'error',
        text: err?.message || 'Could not verify the Google Authenticator code.',
      });
    } finally {
      setTotpVerifying(false);
    }
  }, [totpCode, totpFactorId, refreshSecurityStatus]);

  const handleDisableGoogle2FA = useCallback(async () => {
    setTotpVerifying(true);
    try {
      // Try direct unenroll (requires aal2); fall back to admin endpoint which works at aal1
      if (totpFactorId) {
        try {
          await auth.disableTotpFactor(totpFactorId);
        } catch {
          await auth.deleteMfaFactorViaAdmin();
        }
      } else {
        await auth.deleteMfaFactorViaAdmin();
      }
      setTotpEnabled(false);
      setTotpFactorId('');
      setGoogle2FAQRDataUrl('');
      setTotpCode('');
      await logAction({
        action: 'totp_disabled',
        entity: 'Settings',
        entityId: '-',
        details: 'Google Authenticator 2FA disabled',
        meta: { source: 'settings', importance: 'high', tags: ['security', '2fa'] },
      });
      setTotpMessage({ type: 'success', text: 'Google Authenticator 2FA has been disabled.' });
      await refreshSecurityStatus();
    } catch (err) {
      setTotpMessage({
        type: 'error',
        text: err?.message || 'Could not disable Google Authenticator 2FA.',
      });
    } finally {
      setTotpVerifying(false);
    }
  }, [totpFactorId, refreshSecurityStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!google2FADialogOpen || totpEnabled || totpLoading || google2FAQRDataUrl) return;
    startGoogle2FASetup();
  }, [google2FADialogOpen, totpEnabled, totpLoading, google2FAQRDataUrl, startGoogle2FASetup]);

  const handleRegisterYubiKey = useCallback(async () => {
    setYubiMessage({ type: '', text: '' });
    if (!user?.uid) {
      setYubiMessage({ type: 'error', text: 'Sign in is required before registering a YubiKey.' });
      return;
    }
    if (!canUseWebAuthn) {
      setYubiMessage({
        type: 'error',
        text: 'YubiKey registration requires a secure browser context (HTTPS) with WebAuthn support.',
      });
      return;
    }
    setYubiBusy(true);
    try {
      const enrollment = await auth.createWebAuthnEnrollment('YubiKey');
      if (!enrollment?.factorId) throw new Error('Could not create a YubiKey factor.');
      setYubiFactorId(enrollment.factorId);
      await auth.verifyWebAuthnFactor(enrollment.factorId);
      setYubiEnabled(true);
      await logAction({
        action: 'yubikey_registered',
        entity: 'Settings',
        entityId: '-',
        details: 'YubiKey security key registered',
        meta: { source: 'settings', importance: 'high', tags: ['security', 'yubikey'] },
      });
      setYubiMessage({
        type: 'success',
        text: 'YubiKey has been registered and verified successfully.',
      });
      await refreshSecurityStatus();
    } catch (err) {
      setYubiMessage({ type: 'error', text: err?.message || 'Failed to register YubiKey.' });
    } finally {
      setYubiBusy(false);
    }
  }, [canUseWebAuthn, refreshSecurityStatus, user?.uid]);

  const handleVerifyYubiKey = useCallback(async () => {
    setYubiMessage({ type: '', text: '' });
    if (!yubiFactorId) {
      setYubiMessage({
        type: 'error',
        text: 'No YubiKey factor found for this account. Register one first.',
      });
      return;
    }
    if (!canUseWebAuthn) {
      setYubiMessage({
        type: 'error',
        text: 'YubiKey verification requires WebAuthn support in a secure browser context.',
      });
      return;
    }
    setYubiBusy(true);
    try {
      await auth.verifyWebAuthnFactor(yubiFactorId);
      setYubiMessage({ type: 'success', text: 'YubiKey verification successful.' });
    } catch (err) {
      setYubiMessage({ type: 'error', text: err?.message || 'YubiKey verification failed.' });
    } finally {
      setYubiBusy(false);
    }
  }, [canUseWebAuthn, yubiFactorId]);

  const handleDisableYubiKey = useCallback(async () => {
    if (!yubiFactorId) return;
    setYubiBusy(true);
    setYubiMessage({ type: '', text: '' });
    try {
      await auth.disableWebAuthnFactor(yubiFactorId);
      setYubiEnabled(false);
      setYubiFactorId('');
      setYubiFactorName('');
      await logAction({
        action: 'yubikey_removed',
        entity: 'Settings',
        entityId: '-',
        details: 'YubiKey security key removed',
        meta: { source: 'settings', importance: 'high', tags: ['security', 'yubikey'] },
      });
      setYubiMessage({ type: 'success', text: 'YubiKey security key has been removed.' });
      await refreshSecurityStatus();
    } catch (err) {
      setYubiMessage({ type: 'error', text: err?.message || 'Could not remove YubiKey.' });
    } finally {
      setYubiBusy(false);
    }
  }, [refreshSecurityStatus, yubiFactorId]);

  const addNote = async () => {
    const t = newNote.trim();
    if (!t || !userId) return;
    try {
      const note = await profileData.addNote(userId, t);
      setNotes((prev) => [note, ...prev]);
      setNewNote('');
      pushNotification('Settings', `Note added: "${t.length > 40 ? `${t.slice(0, 40)}…` : t}"`);
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to add note.');
    }
  };

  const archiveNote = async (id) => {
    if (!userId) return;
    try {
      await profileData.archiveNote(userId, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setArchiveConfirm(null);
      // Reload action logs if archive dialog is open
      if (archiveDialogOpen) {
        await loadActionLogs();
      }
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to archive note.');
    }
  };

  const deleteNote = async (id) => {
    if (!userId) return;
    try {
      await profileData.deleteNote(userId, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to delete note.');
    }
  };

  const handleArchiveNoteClick = (note) => {
    setArchiveConfirm({ type: 'note', id: note.id, text: note.text });
  };

  const handleDeleteNoteClick = (note) => {
    setDeleteConfirm({ type: 'note', id: note.id, text: note.text });
  };

  const startEditNote = (note) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  };

  const saveEditNote = async () => {
    if (editingNoteId == null || !userId) return;
    const text = editingNoteText.trim();
    try {
      await profileData.updateNote(userId, editingNoteId, text || undefined);
      setNotes((prev) =>
        prev.map((n) => (n.id === editingNoteId ? { ...n, text: text || n.text } : n))
      );
      setEditingNoteId(null);
      setEditingNoteText('');
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to update note.');
    }
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteText('');
  };

  const addTodo = async () => {
    const t = newTodo.trim();
    if (!t || !userId) return;
    try {
      const todo = await profileData.addTodo(userId, t, false);
      setTodos((prev) => [todo, ...prev]);
      setNewTodo('');
      pushNotification('Settings', `Task added: "${t.length > 40 ? `${t.slice(0, 40)}…` : t}"`);
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to add task.');
    }
  };

  const toggleTodo = async (id) => {
    if (!userId) return;
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    try {
      await profileData.updateTodo(userId, id, { done: !todo.done });
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to update task.');
    }
  };

  const archiveTodo = async (id) => {
    if (!userId) return;
    try {
      await profileData.archiveTodo(userId, id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setArchiveConfirm(null);
      // Reload action logs if archive dialog is open
      if (archiveDialogOpen) {
        await loadActionLogs();
      }
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to archive task.');
    }
  };

  const deleteTodo = async (id) => {
    if (!userId) return;
    try {
      await profileData.deleteTodo(userId, id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to delete task.');
    }
  };

  const handleArchiveTodoClick = (todo) => {
    setArchiveConfirm({ type: 'todo', id: todo.id, text: todo.text });
  };

  const handleDeleteTodoClick = (todo) => {
    setDeleteConfirm({ type: 'todo', id: todo.id, text: todo.text });
  };

  const handleArchiveConfirm = () => {
    if (!archiveConfirm) return;
    if (archiveConfirm.type === 'note') {
      archiveNote(archiveConfirm.id);
    } else {
      archiveTodo(archiveConfirm.id);
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'note') {
      deleteNote(deleteConfirm.id);
    } else {
      deleteTodo(deleteConfirm.id);
    }
  };

  const startEditTodo = (todo) => {
    setEditingTodoId(todo.id);
    setEditingTodoText(todo.text);
  };

  const saveEditTodo = async () => {
    if (editingTodoId == null || !userId) return;
    const text = editingTodoText.trim();
    try {
      await profileData.updateTodo(userId, editingTodoId, { text: text || undefined });
      setTodos((prev) =>
        prev.map((t) => (t.id === editingTodoId ? { ...t, text: text || t.text } : t))
      );
      setEditingTodoId(null);
      setEditingTodoText('');
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to update task.');
    }
  };

  const cancelEditTodo = () => {
    setEditingTodoId(null);
    setEditingTodoText('');
  };

  const openNoteDetail = (note) => {
    setNoteDetail(note);
    setNoteDetailText(note.text);
  };

  const closeNoteDetail = () => {
    setNoteDetail(null);
    setNoteDetailText('');
  };

  const saveNoteDetail = async () => {
    if (!noteDetail || !userId) return;
    const text = noteDetailText.trim();
    try {
      await profileData.updateNote(userId, noteDetail.id, text || undefined);
      setNotes((prev) =>
        prev.map((n) => (n.id === noteDetail.id ? { ...n, text: text || n.text } : n))
      );
      closeNoteDetail();
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to update note.');
    }
  };

  const deleteNoteInDetail = async () => {
    if (noteDetail) {
      handleDeleteNoteClick(noteDetail);
      closeNoteDetail();
    }
  };

  const archiveNoteInDetail = () => {
    if (noteDetail) {
      handleArchiveNoteClick(noteDetail);
      closeNoteDetail();
    }
  };

  const openTodoDetail = (todo) => {
    setTodoDetail(todo);
    setTodoDetailText(todo.text);
    setTodoDetailDone(!!todo.done);
  };

  const closeTodoDetail = () => {
    setTodoDetail(null);
    setTodoDetailText('');
    setTodoDetailDone(false);
  };

  const saveTodoDetail = async () => {
    if (!todoDetail || !userId) return;
    const text = todoDetailText.trim();
    try {
      await profileData.updateTodo(userId, todoDetail.id, {
        text: text || undefined,
        done: todoDetailDone,
      });
      setTodos((prev) =>
        prev.map((t) =>
          t.id === todoDetail.id ? { ...t, text: text || t.text, done: todoDetailDone } : t
        )
      );
      closeTodoDetail();
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to update task.');
    }
  };

  const archiveTodoInDetail = () => {
    if (todoDetail) {
      handleArchiveTodoClick(todoDetail);
      closeTodoDetail();
    }
  };

  const deleteTodoInDetail = () => {
    if (todoDetail) {
      handleDeleteTodoClick(todoDetail);
      closeTodoDetail();
    }
  };

  const loadActionLogs = useCallback(async () => {
    if (!userId) return;
    setLoadingActionLogs(true);
    try {
      // Try to load from audit logs first
      let auditLogs = [];
      try {
        const allLogs = await loadAuditLogs({ limit: 1000 });
        auditLogs = allLogs.filter((log) => log.entity === 'Profile');
      } catch (err) {
        console.warn('Audit logs not available:', err);
      }

      // Also create logs from current notes/todos data
      const dataLogs = [];

      // Add creation logs from notes
      notes.forEach((note) => {
        if (note.createdAt) {
          dataLogs.push({
            id: `note_created_${note.id}`,
            action: 'Note Created',
            entity: 'Profile',
            entityId: note.id,
            timestamp: note.createdAt,
            details: note.text,
            itemType: 'note',
          });
        }
      });

      // Add creation logs from todos
      todos.forEach((todo) => {
        if (todo.createdAt) {
          dataLogs.push({
            id: `todo_created_${todo.id}`,
            action: 'Task Created',
            entity: 'Profile',
            entityId: todo.id,
            timestamp: todo.createdAt,
            details: todo.text,
            itemType: 'todo',
          });
        }
      });

      // Add archived items logs
      archivedItems.forEach((item) => {
        if (item.createdAt) {
          dataLogs.push({
            id: `${item.id}_archived`,
            action: profileNotesTodoTab === 0 ? 'Note Archived' : 'Task Archived',
            entity: 'Profile',
            entityId: item.id,
            timestamp: item.createdAt,
            details: item.text,
            itemType: profileNotesTodoTab === 0 ? 'note' : 'todo',
          });
        }
      });

      // Combine and deduplicate
      const allLogs = [...auditLogs, ...dataLogs];
      const uniqueLogs = allLogs.reduce((acc, log) => {
        if (!acc.find((l) => l.id === log.id)) {
          acc.push(log);
        }
        return acc;
      }, []);

      // Sort by timestamp
      const sortedLogs = uniqueLogs
        .map((log) => ({
          ...log,
          actionType: log.action.toLowerCase(),
          itemType:
            log.itemType ||
            (log.details?.includes('note') || log.action.includes('Note') ? 'note' : 'todo'),
        }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setActionLogs(sortedLogs);
    } catch (err) {
      console.warn('Failed to load action logs:', err);
      setActionLogs([]);
    } finally {
      setLoadingActionLogs(false);
    }
  }, [userId, notes, todos, archivedItems, profileNotesTodoTab]);

  // `kind` is 0 for notes, 1 for tasks. Notes and the todo list are two
  // sections now rather than two pills over one list, so the caller says which
  // archive it wants instead of the dialog reading a shared tab index.
  const openArchiveDialog = async (kind = profileNotesTodoTab) => {
    if (!userId) return;
    setProfileNotesTodoTab(kind);
    setArchiveDialogOpen(true);
    setArchiveDialogTab(0); // Reset to first tab
    setLoadingArchived(true);
    try {
      if (kind === 0) {
        const archived = await profileData.loadArchivedNotes(userId);
        setArchivedItems(archived);
      } else {
        const archived = await profileData.loadArchivedTodos(userId);
        setArchivedItems(archived);
      }
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to load archived items.');
    } finally {
      setLoadingArchived(false);
    }
    // Load action logs after archived items are loaded
    await loadActionLogs();
  };

  const closeArchiveDialog = () => {
    setArchiveDialogOpen(false);
    setArchivedItems([]);
    setArchiveDialogTab(0);
  };

  const unarchiveNote = async (id) => {
    if (!userId) return;
    try {
      await profileData.unarchiveNote(userId, id);
      // Remove from archived list
      setArchivedItems((prev) => prev.filter((item) => item.id !== id));
      // Reload notes to show it in the main list
      await loadProfileData();
      // Reload action logs
      await loadActionLogs();
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to unarchive note.');
    }
  };

  const unarchiveTodo = async (id) => {
    if (!userId) return;
    try {
      await profileData.unarchiveTodo(userId, id);
      // Remove from archived list
      setArchivedItems((prev) => prev.filter((item) => item.id !== id));
      // Reload todos to show it in the main list
      await loadProfileData();
      // Reload action logs
      await loadActionLogs();
    } catch (err) {
      setProfileDataError(err?.message || 'Failed to unarchive task.');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const handlePrimaryColorChange = (color) => {
    const previous = primaryColor;
    setPrimaryColor(color);
    if (color !== previous) {
      logAction({
        action: 'primary_color_changed',
        entity: 'Settings',
        entityId: '-',
        details: `Primary color changed to ${color || 'default'}`,
        meta: {
          source: 'settings',
          importance: 'low',
          tags: ['preferences', 'color'],
          previous,
          newValue: color,
        },
      });
    }
  };

  /* ---- Settings Action Log: state & loaders ---- */
  const [settingsActionLogs, setSettingsActionLogs] = useState([]);
  const [settingsLogsLoading, setSettingsLogsLoading] = useState(false);
  const [settingsLogsFilter, setSettingsLogsFilter] = useState('all');
  const [settingsLogsLimit, setSettingsLogsLimit] = useState(25);

  const loadSettingsLogs = useCallback(async () => {
    setSettingsLogsLoading(true);
    try {
      const { loadSettingsActionLogs } = await import('../../services/auditLogBackend');
      const logs = await loadSettingsActionLogs({ limit: 200 });
      setSettingsActionLogs(logs);
    } catch (err) {
      console.warn('Failed to load settings action logs:', err);
      setSettingsActionLogs([]);
    } finally {
      setSettingsLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettingsLogs();
  }, [loadSettingsLogs]);

  const filteredSettingsLogs = settingsActionLogs.filter((log) => {
    if (settingsLogsFilter === 'all') return true;
    const tags = log.detailsStructured?.tags || [];
    return tags.includes(settingsLogsFilter);
  });

  const visibleSettingsLogs = filteredSettingsLogs.slice(0, settingsLogsLimit);

  const formatRelativeTime = (dateString) => {
    if (!dateString) return '-';
    try {
      const now = new Date();
      const date = new Date(dateString);
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay === 1) return 'yesterday';
      if (diffDay < 30) return `${diffDay}d ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const getCountryFlag = (countryCode) => {
    if (!countryCode || countryCode.length !== 2) return '';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
  };

  const getActionChipColor = (action) => {
    const a = (action || '').toLowerCase();
    if (
      a.includes('password') ||
      a.includes('totp') ||
      a.includes('yubikey') ||
      a.includes('google_linked')
    )
      return 'error';
    if (a.includes('email') || a.includes('notification')) return 'info';
    if (
      a.includes('color') ||
      a.includes('telegram') ||
      a.includes('motivation') ||
      a.includes('language') ||
      a.includes('logo_default')
    )
      return 'success';
    return 'default';
  };

  const persistShowLetsTalkBar = useCallback(async (checked) => {
    if (typeof window === 'undefined') return;
    let current = {};
    try {
      const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      current = raw ? JSON.parse(raw) : {};
    } catch {
      current = {};
    }

    const next = {
      ...(current && typeof current === 'object' ? current : {}),
      showLetsTalkBar: checked,
    };
    window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    // Same-tab sync: MainLayout listens for this custom event to update TopBar immediately.
    window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_UPDATED_EVENT, { detail: next }));

    try {
      await logAction({
        action: 'ui_lets_talk_bar_toggled',
        entity: 'Settings',
        entityId: '-',
        details: checked ? 'Enabled Lets talk bar in header' : 'Disabled Lets talk bar in header',
        meta: { source: 'settings', importance: 'low', tags: ['ui', 'voice'] },
      });
    } catch {
      // Non-blocking: local UI preference should still apply even if logging fails.
    }
  }, []);

  // The rail's tabs. Hiding and reordering - simple mode's view options - now
  // apply to the rail itself, so a hidden section is a tab that is not offered
  // rather than a card scrolled past. Advanced simply starts with more of them.
  const baseSections = useMemo(
    () => SETTINGS_SECTION_DEFS.filter((section) => !(section.partnerHidden && isPartnerRole)),
    [isPartnerRole]
  );
  const {
    hiddenSections,
    sectionOrder,
    sortableKeys,
    labels,
    navSections: layoutNavSections,
    toggleSection,
    reorderSections,
    showAllSections,
    hideAllSections,
    resetLayout,
  } = useSettingsBlockLayout(baseSections);
  const visibleNavSections = simpleMode ? layoutNavSections : baseSections;
  const tabIds = useMemo(
    () => visibleNavSections.map((section) => section.id),
    [visibleNavSections]
  );
  // The full definitions (blocks and all) for the tabs the rail is showing -
  // what search is allowed to look through.
  const visibleTabs = useMemo(
    () => tabIds.map((id) => SETTINGS_TABS.find((tab) => tab.id === id)).filter(Boolean),
    [tabIds]
  );

  // Which tab is on screen, and how the rail and search move between them.
  const { activeTab, focusBlockKey, selectTab, clearFocus } = useSettingsTab(tabIds);
  const activeTabDef = useMemo(
    () => SETTINGS_TABS.find((tab) => tab.id === activeTab) || null,
    [activeTab]
  );

  // What the blocks' `done` predicates read to decide whether to show a tick.
  const settingsBlockContext = useMemo(
    () => ({
      profile: { displayName, telegram },
      notes,
      todos,
      branding: { appName: brandName, subtitle: brandSubtitle, logo: brandLogo },
      security: { has2FA: totpEnabled },
      prefs: { primaryColor },
      notifications: { emailPrefs },
    }),
    [
      displayName,
      telegram,
      notes,
      todos,
      brandName,
      brandSubtitle,
      brandLogo,
      totpEnabled,
      primaryColor,
      emailPrefs,
    ]
  );

  // Preferences, as the five decisions it is rather than one long card. The
  // controls are the same ones, moved: each block keeps the JSX it always had.
  const preferencesBodies = {
    interface: (
      <Stack spacing={2}>
        {/* Interface mode toggle */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.25,
            borderRadius: 2,
            bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
            border: '1px solid',
            borderColor: (t) => alpha(t.palette.primary.main, 0.12),
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Interface mode
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {simpleMode
                ? 'Simple - streamlined for everyday use'
                : 'Advanced - full admin dashboard'}
            </Typography>
          </Box>
          <Chip
            label={simpleMode ? 'Simple' : 'Advanced'}
            size="small"
            color={simpleMode ? 'default' : 'primary'}
            onClick={() => {
              toggleSimpleMode();
              navigate('/home');
            }}
            sx={{ fontWeight: 700, cursor: 'pointer' }}
          />
        </Box>

        {/* Appearance - light / dark theme */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.25,
            borderRadius: 2,
            bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
            border: '1px solid',
            borderColor: (t) => alpha(t.palette.primary.main, 0.12),
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Appearance
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isDark
                ? 'Dark - easier on the eyes in low light'
                : 'Light - bright, high-contrast theme'}
            </Typography>
          </Box>
          <Chip
            label={isDark ? 'Dark' : 'Light'}
            size="small"
            color={isDark ? 'primary' : 'default'}
            onClick={toggleColorMode}
            sx={{ fontWeight: 700, cursor: 'pointer' }}
          />
        </Box>
      </Stack>
    ),
    icons: (
      <>
        {/* Icon set - thin-line icon style for advanced mode */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderRadius: 2,
            bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
            border: '1px solid',
            borderColor: (t) => alpha(t.palette.primary.main, 0.12),
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                {simpleMode
                  ? 'Switch to Advanced mode to apply outline / filled icons'
                  : 'Outline (thin line) or Filled (solid) icon style'}
              </Typography>
            </Box>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="icon-set-label">Icon set</InputLabel>
              <Select
                labelId="icon-set-label"
                value={iconSet}
                label="Icon set"
                onChange={(e) => {
                  const set = e.target.value;
                  setIconSet(set);
                  logAction({
                    action: 'icon_set_changed',
                    entity: 'Settings',
                    entityId: '-',
                    details: `Icon set changed to ${set}`,
                    meta: {
                      source: 'settings',
                      importance: 'low',
                      tags: ['preferences', 'ui'],
                      newValue: set,
                    },
                  });
                }}
              >
                <MenuItem value="mui">MUI (default)</MenuItem>
                <MenuItem value="outline">Outline (thin line)</MenuItem>
                <MenuItem value="filled">Filled (solid)</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Live preview - reflects the selected set immediately */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              mt: 1.5,
              flexWrap: 'wrap',
              color: 'primary.main',
            }}
          >
            {ICON_SET_PREVIEW.map(({ name, Comp }) => (
              <AppIcon key={name} name={name} fallback={Comp} size={24} />
            ))}
          </Box>

          {/* Browse the full advanced / simple icon galleries */}
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
            <Chip
              label="Advanced icons"
              size="small"
              variant="outlined"
              onClick={() => navigate('/mui-icons')}
              sx={{ fontWeight: 600, cursor: 'pointer' }}
            />
            <Chip
              label="Simple icons"
              size="small"
              variant="outlined"
              onClick={() => navigate('/icon-library')}
              sx={{ fontWeight: 600, cursor: 'pointer' }}
            />
          </Box>
        </Box>

        <Divider />

        <Box>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <AppIcon name="PaletteOutlined" fallback={PaletteOutlinedIcon} sx={{ fontSize: 18 }} />
            Design system colors
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
            {['primary', 'secondary', 'success', 'warning', 'error'].map((key) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.5,
                    bgcolor: theme.palette[key]?.main || theme.palette.primary.main,
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: 1,
                  }}
                />
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                  >
                    {key}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', fontSize: '0.65rem' }}
                  >
                    {COLOR_USAGE[key]?.join(', ') || '-'}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        {!isPartnerRole && (
          <Box
            sx={{
              p: 2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: (t) =>
                alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.14 : 0.06),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (t) =>
                    alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.1),
                  border: '1px solid',
                  borderColor: (t) =>
                    alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.35 : 0.25),
                  flexShrink: 0,
                }}
              >
                <AiOrb state="idle" size={26} disableFloat />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    AI assistant bar
                  </Typography>
                  <Chip
                    size="small"
                    label={showLetsTalkBar ? 'Visible in header' : 'Hidden by default'}
                    variant={showLetsTalkBar ? 'filled' : 'outlined'}
                    color={showLetsTalkBar ? 'success' : 'default'}
                    sx={{ fontWeight: 700 }}
                  />
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.25, maxWidth: 520 }}
                >
                  Controls the “Let&apos;s talk” bar in the top header. Keep it hidden for a cleaner
                  UI; enable it if you use voice/command mode often.
                </Typography>
              </Box>
              <Switch
                checked={showLetsTalkBar}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowLetsTalkBar(checked);
                  persistShowLetsTalkBar(checked);
                }}
                inputProps={{ 'aria-label': 'Show Lets talk bar in header' }}
              />
            </Box>
          </Box>
        )}
      </>
    ),
    accent: (
      <>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Change the main accent color. Affects buttons, links, chips, and highlights.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
            {GEMS.map((gem) => {
              const isSelected =
                primaryColor && primaryColor.toLowerCase() === gem.accent.toLowerCase();
              return (
                <Tooltip key={gem.key} title={`${gem.name} (${gem.accent})`}>
                  <Box
                    role="button"
                    aria-label={`Use ${gem.name} accent color`}
                    onClick={() => handlePrimaryColorChange(gem.accent)}
                    sx={{
                      width: 40,
                      height: 40,
                      p: 0.5,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      bgcolor: isSelected ? 'action.selected' : 'transparent',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, transform 0.15s',
                      '&:hover': { transform: 'scale(1.08)', borderColor: 'primary.main' },
                    }}
                  >
                    <GemIcon gem={gem.key} size={28} />
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <input
              type="color"
              value={primaryColor || (isDark ? '#10B981' : '#1B2A4A')}
              onChange={(e) => handlePrimaryColorChange(e.target.value)}
              style={{
                width: 36,
                height: 28,
                borderRadius: 6,
                border: '1px solid #ccc',
                cursor: 'pointer',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Custom color
            </Typography>
          </Box>
        </Box>
      </>
    ),
    behaviour: (
      <>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
          <AppIcon
            name="AutoAwesomeOutlined"
            fallback={AutoAwesomeOutlinedIcon}
            sx={{ fontSize: 16, color: 'text.secondary' }}
          />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Logo click behaviour
          </Typography>
        </Stack>

        {/* Motivation toggle */}
        <FormControlLabel
          control={
            <Switch
              checked={motivationEnabled}
              onChange={(e) => {
                const val = e.target.checked;
                setMotivationEnabled(val);
                logAction({
                  action: 'motivation_toggled',
                  entity: 'Settings',
                  entityId: '-',
                  details: val ? 'Motivation enabled' : 'Motivation disabled',
                  meta: {
                    source: 'settings',
                    importance: 'low',
                    tags: ['preferences', 'motivation'],
                    newValue: val,
                  },
                });
              }}
              color="primary"
              size="small"
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.82rem' }}>
                Confetti & motivation
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                {motivationEnabled
                  ? 'Logo shows confetti and a quote'
                  : 'Logo navigates to page below'}
              </Typography>
            </Box>
          }
          sx={{ alignItems: 'flex-start', ml: 0, mt: 0.5, mb: 0.5 }}
        />

        {/* Default page - visible only when motivation is OFF */}
        {!motivationEnabled && (
          <Box sx={{ ml: 4.5, mb: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel id="logo-default-page-label">Navigate to</InputLabel>
              <Select
                labelId="logo-default-page-label"
                value={logoDefaultPage}
                label="Navigate to"
                onChange={(e) => {
                  const page = e.target.value;
                  setLogoDefaultPage(page);
                  logAction({
                    action: 'logo_default_page_changed',
                    entity: 'Settings',
                    entityId: '-',
                    details: `Logo default page changed to ${page}`,
                    meta: {
                      source: 'settings',
                      importance: 'low',
                      tags: ['preferences', 'navigation'],
                      newValue: page,
                    },
                  });
                }}
              >
                <MenuItem value="/home">Home</MenuItem>
                <MenuItem value="/dashboard">Dashboard</MenuItem>
                <MenuItem value="/partners">Partners</MenuItem>
                {!isPartnerRole && <MenuItem value="/task-manager">Tasks</MenuItem>}
                {!isPartnerRole && <MenuItem value="/workflow">Workflow</MenuItem>}
                {!isPartnerRole && <MenuItem value="/projects">Projects</MenuItem>}
                {!isPartnerRole && canAccessFinances && (
                  <MenuItem value="/finances">Finances</MenuItem>
                )}
                {!isPartnerRole && <MenuItem value="/notification-center">AI Recommend</MenuItem>}
                <MenuItem value="/settings">Settings</MenuItem>
                <MenuItem value="/settings/booking">Booking Settings</MenuItem>
                {!isPartnerRole && <MenuItem value="/audit-log">Activity Log</MenuItem>}
                <MenuItem value="/reports">Reports</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}
      </>
    ),
    language: (
      <>
        {/* Language selector - compact chips */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{ ml: 4.5, mt: 0.5, flexWrap: 'wrap' }}
        >
          <AppIcon
            name="Language"
            fallback={LanguageIcon}
            sx={{ fontSize: 14, color: 'text.secondary' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            Language
          </Typography>
          {[
            { value: 'en', label: 'EN' },
            { value: 'ru', label: 'RU' },
          ].map((lang) => (
            <Chip
              key={lang.value}
              label={lang.label}
              size="small"
              variant={motivationLanguage === lang.value ? 'filled' : 'outlined'}
              color={motivationLanguage === lang.value ? 'primary' : 'default'}
              onClick={() => {
                if (motivationLanguage !== lang.value) {
                  setMotivationLanguage(lang.value);
                  logAction({
                    action: 'motivation_language_changed',
                    entity: 'Settings',
                    entityId: '-',
                    details: `Motivation language changed to ${lang.label}`,
                    meta: {
                      source: 'settings',
                      importance: 'low',
                      tags: ['preferences', 'language'],
                      newValue: lang.value,
                    },
                  });
                }
              }}
              sx={{
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 22,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            />
          ))}
        </Stack>
      </>
    ),
  };

  // Branding: what the sidebar is called, and the mark beside it.
  const brandingBodies = {
    identity: (
      <Stack spacing={2}>
        {/* Compact "what / how / where" callout */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.05),
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Replaces the logo, name and subtitle at the top of the left sidebar. Upload a square
            image and edit the text below. Saved to this browser only - leave a field empty to keep
            the default.
          </Typography>
        </Box>

        <TextField
          label="App name"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="Orchestrator"
          size="small"
          fullWidth
          inputProps={{ maxLength: 40 }}
        />
        <TextField
          label="Subtitle"
          value={brandSubtitle}
          onChange={(e) => setBrandSubtitle(e.target.value)}
          placeholder="Admin Dashboard"
          size="small"
          fullWidth
          inputProps={{ maxLength: 60 }}
        />

        {(brandName || brandSubtitle || brandLogo) && (
          <Box>
            <Button
              variant="text"
              size="small"
              color="inherit"
              startIcon={<RestoreIcon />}
              onClick={() => {
                setBrandName('');
                setBrandSubtitle('');
                setBrandLogo('');
                setBrandLogoError('');
              }}
            >
              Reset to defaults
            </Button>
          </Box>
        )}
      </Stack>
    ),
    logo: (
      <>
        {/* Logo row: live preview + upload / remove */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
              overflow: 'hidden',
            }}
          >
            {brandLogo ? (
              <Box
                component="img"
                src={brandLogo}
                alt="Logo preview"
                sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <Logo size={26} />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => brandLogoInputRef.current?.click()}
            >
              {brandLogo ? 'Replace logo' : 'Upload logo'}
            </Button>
            {brandLogo && (
              <Button
                variant="text"
                size="small"
                color="inherit"
                onClick={() => {
                  setBrandLogo('');
                  setBrandLogoError('');
                }}
              >
                Remove
              </Button>
            )}
            <input
              ref={brandLogoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              hidden
              onChange={handleBrandLogoFile}
            />
          </Box>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Select one of the Gems to represent you
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {GEMS.map((gem) => {
              const gemUri = gemToDataUri(gem.key);
              const isSelected = brandLogo === gemUri;
              return (
                <Tooltip key={gem.key} title={`${gem.name} - ${gem.cut}`}>
                  <Box
                    role="button"
                    aria-label={`Use ${gem.name} as logo`}
                    onClick={() => {
                      setBrandLogo(gemUri);
                      setBrandLogoError('');
                      logAction({
                        action: 'branding_changed',
                        entity: 'Settings',
                        entityId: '-',
                        details: `Sidebar logo set to ${gem.name} gem`,
                        meta: {
                          source: 'settings',
                          importance: 'low',
                          tags: ['branding', 'logo', 'gem'],
                        },
                      });
                    }}
                    sx={{
                      width: 42,
                      height: 42,
                      p: 0.5,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      bgcolor: isSelected ? 'action.selected' : 'transparent',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, transform 0.15s',
                      '&:hover': {
                        transform: 'scale(1.08)',
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <GemIcon gem={gem.key} size={30} />
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
        {brandLogoError && (
          <Alert severity="error" onClose={() => setBrandLogoError('')} sx={{ borderRadius: 2 }}>
            {brandLogoError}
          </Alert>
        )}
      </>
    ),
  };

  // Security, as the three questions it answers. The PIN and the sign-in methods
  // are role-gated, so their bodies are simply absent for a user who has
  // neither - `SettingsTabPanel` then leaves those sections off the tab rather
  // than showing an empty one.
  const securityBodies = {
    password: (
      <>
        <Box>
          <Stack spacing={1.5} direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap" useFlexGap>
            <TextField
              label="Current password"
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              size="small"
              sx={{ minWidth: 200, flex: 1 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowCurrentPassword((p) => !p)}
                      aria-label="Toggle visibility"
                    >
                      {showCurrentPassword ? (
                        <AppIcon
                          name="VisibilityOffOutlined"
                          fallback={VisibilityOffOutlinedIcon}
                        />
                      ) : (
                        <AppIcon name="VisibilityOutlined" fallback={VisibilityOutlinedIcon} />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="New password"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              size="small"
              sx={{ minWidth: 200, flex: 1 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowNewPassword((p) => !p)}
                      aria-label="Toggle visibility"
                    >
                      {showNewPassword ? (
                        <AppIcon
                          name="VisibilityOffOutlined"
                          fallback={VisibilityOffOutlinedIcon}
                        />
                      ) : (
                        <AppIcon name="VisibilityOutlined" fallback={VisibilityOutlinedIcon} />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              size="small"
              sx={{ minWidth: 200, flex: 1 }}
            />
          </Stack>
          <Button
            variant="outlined"
            size="small"
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword}
            startIcon={<AppIcon name="Security" fallback={SecurityIcon} />}
            sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600 }}
          >
            {changingPassword ? 'Updating…' : 'Update password'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Use at least 10 characters with uppercase, lowercase, number, and symbol.
          </Typography>
        </Box>
        {passwordMessage.text && (
          <Alert
            severity={passwordMessage.type === 'error' ? 'error' : 'success'}
            onClose={() => setPasswordMessage({ type: '', text: '' })}
            sx={{ mt: 1 }}
          >
            {passwordMessage.text}
          </Alert>
        )}
      </>
    ),
    ...(isSuperAdmin
      ? {
          pin: (
            <>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 1.5 }}
                >
                  Set or change the global access PIN required to enter the app.
                </Typography>
                <Stack spacing={1.5} direction={{ xs: 'column', sm: 'row' }} useFlexGap>
                  <TextField
                    label="New PIN"
                    type="password"
                    value={pinValue}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setPinValue(v);
                    }}
                    size="small"
                    inputProps={{ inputMode: 'numeric', maxLength: 8 }}
                    placeholder="4–8 digits"
                    sx={{ minWidth: 140, flex: 1 }}
                  />
                  <TextField
                    label="Confirm PIN"
                    type="password"
                    value={pinConfirm}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setPinConfirm(v);
                    }}
                    size="small"
                    inputProps={{ inputMode: 'numeric', maxLength: 8 }}
                    placeholder="Re-enter PIN"
                    sx={{ minWidth: 140, flex: 1 }}
                  />
                </Stack>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleSetupPin}
                  disabled={pinSaving || !pinValue || pinValue.length < 4}
                  startIcon={<AppIcon name="Security" fallback={SecurityIcon} />}
                  sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600 }}
                >
                  {pinSaving ? 'Saving…' : 'Save PIN'}
                </Button>
                {pinMessage.text && (
                  <Alert
                    severity={pinMessage.type || 'info'}
                    sx={{ mt: 1.5 }}
                    onClose={() => setPinMessage({ type: '', text: '' })}
                  >
                    {pinMessage.text}
                  </Alert>
                )}
              </Box>
            </>
          ),
        }
      : {}),
    ...(!isPartnerRole
      ? {
          signin: (
            <>
              <Box>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="contained"
                    size="medium"
                    startIcon={<Google2FAIcon size={22} />}
                    onClick={() => setGoogle2FADialogOpen(true)}
                    disabled={!supabaseAuthEnabled}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      borderRadius: 2.5,
                      px: 2.5,
                      py: 1.25,
                      bgcolor: 'primary.main',
                      '&:hover': { bgcolor: 'primary.dark' },
                      '&.Mui-disabled': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        opacity: 0.7,
                      },
                    }}
                  >
                    {totpEnabled
                      ? 'Manage Google Authenticator 2FA'
                      : 'Enable Google Authenticator 2FA'}
                  </Button>
                </Stack>
                {supabaseAuthEnabled ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 1 }}
                  >
                    Uses your connected Supabase project. Scan the QR in Google Authenticator (or
                    any TOTP app), then verify once to enable.
                  </Typography>
                ) : (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 1 }}
                  >
                    Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment to enable
                    2FA.
                  </Typography>
                )}
              </Box>
            </>
          ),
        }
      : {}),
  };

  // The remaining tabs, each the same controls it always carried - lifted out of
  // their cards so every tab on this page speaks the setup-panel language.
  const remainingBodies = {
    publicpage: {
      card: (
        <>
          <PublicPageSettingsPanel user={user} />
        </>
      ),
    },
    meetings: {
      calendar: (
        <>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {meetingsConfigured ? (
              <MeetingsCalendarPanel embedded />
            ) : (
              <Box
                sx={{
                  py: 3,
                  px: 2,
                  textAlign: 'center',
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <AppIcon
                  name="EventAvailableOutlined"
                  fallback={EventAvailableOutlinedIcon}
                  sx={{ fontSize: 32, color: 'text.disabled' }}
                />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Meetings aren&apos;t set up yet
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 360 }}>
                  Set up your calendar to start booking meetings with partners and clients.
                </Typography>
                <Button
                  variant="contained"
                  disableElevation
                  onClick={() => setMeetingSetupOpen(true)}
                  startIcon={
                    <AppIcon
                      name="EventAvailable"
                      fallback={EventAvailableOutlinedIcon}
                      sx={{ fontSize: 18 }}
                    />
                  }
                  sx={{ mt: 0.5, textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  Set up meetings
                </Button>
              </Box>
            )}
            {meetingsConfigured && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  flexWrap: 'wrap',
                  pt: 0.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                  <Tooltip
                    title="Copy your public scheduling link (syncs with existing meetings)"
                    placement="bottom"
                    arrow
                  >
                    <Button
                      variant="outlined"
                      size="medium"
                      startIcon={
                        copyLinkBusy ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          <AppIcon
                            name="ContentCopy"
                            fallback={ContentCopyIcon}
                            sx={{ fontSize: 18 }}
                          />
                        )
                      }
                      onClick={async () => {
                        setCopyLinkMessage(null);
                        setCopyLinkUrl(null);
                        setCopyLinkBusy(true);
                        try {
                          const profile = await publicBookingService.getOrCreateProfile();
                          const link =
                            publicBookingService.getScheduleUrl(profile) ||
                            publicBookingService.getPublicBookingUrl(profile?.slug);
                          if (!link) {
                            setCopyLinkMessage(
                              'No booking link yet. Open Booking Settings to configure your availability and generate a link.'
                            );
                            setCopyLinkBusy(false);
                            return;
                          }
                          let copied = false;
                          if (
                            typeof navigator !== 'undefined' &&
                            navigator.clipboard &&
                            typeof navigator.clipboard.writeText === 'function'
                          ) {
                            try {
                              await navigator.clipboard.writeText(link);
                              copied = true;
                            } catch {
                              // fallback below
                            }
                          }
                          if (!copied) {
                            const textarea = document.createElement('textarea');
                            textarea.value = link;
                            textarea.setAttribute('readonly', '');
                            textarea.style.position = 'fixed';
                            textarea.style.left = '-9999px';
                            document.body.appendChild(textarea);
                            textarea.select();
                            try {
                              copied = document.execCommand('copy');
                            } finally {
                              document.body.removeChild(textarea);
                            }
                          }
                          if (copied) {
                            setCopyLinkMessage('Link copied to clipboard.');
                            pushNotification('Meetings', 'Scheduling link copied to clipboard.', {
                              severity: 'success',
                            });
                          } else {
                            setCopyLinkMessage(
                              'Could not copy automatically. Copy the link below.'
                            );
                            setCopyLinkUrl(link);
                          }
                        } catch (e) {
                          const msg = e?.message || '';
                          const isTableMissing =
                            /schema cache|relation|does not exist|booking_profiles/i.test(msg);
                          const friendlyMessage = isTableMissing
                            ? 'Booking is not set up yet. Run the database migration (022_public_scheduling_link) or open Settings → Booking Settings to create your profile.'
                            : msg ||
                              'Set up your booking link in Settings → Booking Settings first.';
                          setCopyLinkMessage(friendlyMessage);
                          pushNotification('Meetings', friendlyMessage, {
                            severity: 'warning',
                          });
                        } finally {
                          setCopyLinkBusy(false);
                        }
                      }}
                      disabled={!supabaseAuthEnabled || copyLinkBusy}
                      sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                    >
                      {copyLinkBusy ? 'Copying…' : 'Copy link'}
                    </Button>
                  </Tooltip>
                  {copyLinkMessage && (
                    <Alert
                      severity={
                        copyLinkUrl
                          ? 'info'
                          : copyLinkMessage.startsWith('Link copied')
                            ? 'success'
                            : 'warning'
                      }
                      onClose={() => {
                        setCopyLinkMessage(null);
                        setCopyLinkUrl(null);
                      }}
                      sx={{ mt: 1 }}
                    >
                      {copyLinkMessage}
                      {copyLinkUrl && (
                        <Typography
                          component="div"
                          variant="body2"
                          sx={{ mt: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}
                        >
                          {copyLinkUrl}
                        </Typography>
                      )}
                    </Alert>
                  )}
                </Box>
                <Tooltip
                  title="Configure availability and public booking link"
                  placement="left"
                  arrow
                >
                  <IconButton
                    onClick={() => setMeetingSchedulerDialogOpen(true)}
                    aria-label="Meeting Scheduler settings"
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: isDark
                        ? alpha(theme.palette.background.default, 0.5)
                        : alpha(theme.palette.primary.main, 0.06),
                      color: 'text.secondary',
                      '&:hover': {
                        bgcolor: isDark
                          ? alpha(theme.palette.primary.main, 0.12)
                          : alpha(theme.palette.primary.main, 0.12),
                        color: 'primary.main',
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <AppIcon
                      name="SettingsOutlined"
                      fallback={SettingsOutlinedIcon}
                      sx={{ fontSize: 22 }}
                    />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
          <FormDialog
            open={meetingSetupOpen}
            onClose={() => !meetingSetupBusy && setMeetingSetupOpen(false)}
            title="Set up meetings"
            subtitle="Choose how to configure your availability"
            icon={EventAvailableOutlinedIcon}
            maxWidth="xs"
            hideFooter
            contentDividers={false}
            contentSx={{ pt: 2.5, pb: 1 }}
          >
            <Stack spacing={1.5}>
              <Button
                fullWidth
                variant="contained"
                disableElevation
                disabled={meetingSetupBusy}
                onClick={handleUseTemplate}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2,
                  py: 1.25,
                  alignItems: 'flex-start',
                  flexDirection: 'column',
                  gap: 0.25,
                }}
              >
                <Box sx={{ fontWeight: 700 }}>
                  {meetingSetupBusy ? 'Setting up…' : 'Use template'}
                </Box>
                <Box sx={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.85 }}>
                  Basic Mon-Fri, 9:00-17:00 availability
                </Box>
              </Button>
              <Button
                fullWidth
                variant="outlined"
                disabled={meetingSetupBusy}
                onClick={handleCustomSetup}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2,
                  py: 1.25,
                  alignItems: 'flex-start',
                  flexDirection: 'column',
                  gap: 0.25,
                }}
              >
                <Box sx={{ fontWeight: 700 }}>Custom setup</Box>
                <Box sx={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.85 }}>
                  Set your own days, hours and booking link
                </Box>
              </Button>
            </Stack>
          </FormDialog>
          <FormDialog
            open={meetingSchedulerDialogOpen}
            onClose={() => setMeetingSchedulerDialogOpen(false)}
            title="Meeting Scheduler"
            subtitle="Configure your weekly availability and booking link"
            icon={EventAvailableOutlinedIcon}
            maxWidth="sm"
            hideFooter
            contentDividers={false}
            contentSx={{ pt: 2.5, pb: 1 }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Set which days and hours you are available for meetings. You can add date overrides
              and share a public booking link so others can book time with you.
            </Typography>
            <Button
              fullWidth
              variant="contained"
              disableElevation
              startIcon={<AppIcon name="SettingsOutlined" fallback={SettingsOutlinedIcon} />}
              onClick={() => {
                setMeetingSchedulerDialogOpen(false);
                navigate('/settings/booking');
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                py: 1.25,
                bgcolor: 'primary.main',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              Open configuration
            </Button>
          </FormDialog>
        </>
      ),
    },
    notifications: {
      inapp: (
        <>
          <Box id="notifications" sx={{ position: 'relative', top: '-72px' }} />
          {/* In-app channel master toggle — when on, subscribed actions
                    also appear in the in-app notification drawer/bell. */}
          <FormControlLabel
            control={
              <Switch
                checked={channels.inapp}
                onChange={() => handleChannelToggle('inapp')}
                color="primary"
                size="medium"
              />
            }
            label="In-app notifications"
          />
        </>
      ),
      email: (
        <>
          {/* Email notification section */}
          <Box sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <AppIcon
                name="EmailOutlined"
                fallback={EmailOutlinedIcon}
                sx={{ fontSize: 18, color: 'text.secondary' }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Email notifications
              </Typography>
              <Switch
                checked={channels.email}
                onChange={() => handleChannelToggle('email')}
                color="primary"
                size="small"
                inputProps={{ 'aria-label': 'Toggle email delivery channel' }}
              />
              <Chip
                label={`${emailPrefsEnabledCount} / ${emailPrefsTotalCount}`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: '0.7rem', height: 22 }}
              />
              <Chip
                label={emailPrefsSyncLabel}
                size="small"
                color={emailPrefsSyncState.source === 'supabase' ? 'success' : 'warning'}
                variant={emailPrefsSyncState.source === 'supabase' ? 'filled' : 'outlined'}
                sx={{ fontWeight: 600, fontSize: '0.66rem', height: 22 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              When enabled, you will receive an email to{' '}
              <strong>{user?.email || 'your account email'}</strong> each time the selected action
              occurs.
            </Typography>
            {emailPrefsSyncState.warning && (
              <>
                <Alert severity="warning" sx={{ mb: 1, borderRadius: 2 }}>
                  {emailPrefsSyncState.warning}
                </Alert>
                {import.meta.env.PROD && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 1.25 }}
                  >
                    Preferences are falling back to local settings, so they may not sync across
                    devices until the database is configured.
                    {String(emailPrefsSyncState.warning || '').includes(
                      '009_email_notification_preferences.sql'
                    ) && (
                      <> Fix: run Supabase migration `009_email_notification_preferences.sql`.</>
                    )}
                  </Typography>
                )}
              </>
            )}

            {emailPrefsLoaded &&
              visibleCategoryEntries.map(([catKey, cat]) => {
                const actionKeys = Object.keys(cat.actions);
                const enabledInCat = actionKeys.filter((k) => emailPrefs[k]).length;
                return (
                  <Accordion
                    key={catKey}
                    disableGutters
                    elevation={0}
                    sx={{
                      '&:before': { display: 'none' },
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '8px !important',
                      mb: 1,
                      overflow: 'hidden',
                      '&.Mui-expanded': { mb: 1 },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                      sx={{
                        minHeight: 44,
                        px: 2,
                        '& .MuiAccordionSummary-content': {
                          my: 0.75,
                          alignItems: 'center',
                          gap: 1,
                        },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                        {cat.label}
                      </Typography>
                      <Chip
                        label={`${enabledInCat} / ${actionKeys.length}`}
                        size="small"
                        color={enabledInCat > 0 ? 'primary' : 'default'}
                        variant={enabledInCat > 0 ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600, fontSize: '0.7rem', height: 20, mr: 1 }}
                      />
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, pb: 1, px: 2 }}>
                      {/* Toggle all in category */}
                      <FormControlLabel
                        control={
                          <Switch
                            checked={enabledInCat === actionKeys.length}
                            indeterminate={enabledInCat > 0 && enabledInCat < actionKeys.length}
                            onChange={() => handleEmailPrefsCategoryToggle(catKey)}
                            color="primary"
                            size="small"
                          />
                        }
                        label={
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, color: 'text.secondary' }}
                          >
                            Toggle all
                          </Typography>
                        }
                        sx={{ mb: 0.5, ml: 0 }}
                      />
                      {Object.entries(cat.actions).map(([actionKey, actionCfg]) => (
                        <FormControlLabel
                          key={actionKey}
                          control={
                            <Switch
                              checked={!!emailPrefs[actionKey]}
                              onChange={() => handleEmailPrefToggle(actionKey)}
                              color="primary"
                              size="small"
                            />
                          }
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                                {actionCfg.label}
                              </Typography>
                              {actionCfg.serverOnly && (
                                <Chip
                                  label="system"
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    height: 16,
                                    fontSize: '0.6rem',
                                    color: 'text.secondary',
                                  }}
                                />
                              )}
                            </Box>
                          }
                          sx={{ display: 'flex', ml: 0, mb: 0 }}
                        />
                      ))}
                    </AccordionDetails>
                  </Accordion>
                );
              })}

            {emailPrefsMessage.text && (
              <Alert
                severity={emailPrefsMessage.type === 'error' ? 'error' : 'success'}
                onClose={() => setEmailPrefsMessage({ type: '', text: '' })}
                sx={{ mt: 1, borderRadius: 2 }}
              >
                {emailPrefsMessage.text}
              </Alert>
            )}

            <Button
              variant="contained"
              size="small"
              onClick={handleSaveEmailPrefs}
              disabled={emailPrefsSaving}
              startIcon={
                <AppIcon name="EmailOutlined" fallback={EmailOutlinedIcon} sx={{ fontSize: 16 }} />
              }
              sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {emailPrefsSaving ? 'Saving…' : 'Save email preferences'}
            </Button>
          </Box>
        </>
      ),
    },
    payments: {
      methods: (
        <>
          <PaymentMethodsSection />
        </>
      ),
    },
    pages: {
      sidebar: (
        <>
          <PagesVisibilityPanel />
        </>
      ),
    },
    axwise: {
      overlay: (
        <>
          <AxwiseOverlayControls />
        </>
      ),
    },
    databaseOverview: {
      storage: (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            <Box sx={{ minWidth: 0, height: { xs: 'auto', sm: DATA_OVERVIEW_CARD_H } }}>
              <DataKnowledgeCard
                data={dataOverview.knowledge}
                onEdit={() => navigate('/knowledge-base')}
              />
            </Box>
            <Box sx={{ minWidth: 0, height: { xs: 'auto', sm: DATA_OVERVIEW_CARD_H } }}>
              <ContactsCard
                contacts={dataOverview.contacts}
                organizations={dataOverview.organizations}
                onEdit={() => navigate('/assistant')}
                onAdd={() => navigate('/assistant')}
              />
            </Box>
            <Box sx={{ minWidth: 0, height: { xs: 'auto', sm: DATA_OVERVIEW_CARD_H } }}>
              <ConversationHistoryCard
                conversations={dataOverview.conversations}
                onViewAll={() => navigate('/communicator')}
              />
            </Box>
          </Box>
        </>
      ),
    },
    onboarding: {
      guide: (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Show the step-by-step onboarding guide again to learn how to create requests, track
            progress, and get results.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              localStorage.removeItem('orchestratori_onboarding_done');
              localStorage.setItem('orchestratori_simple_mode', 'true');
              window.location.href = '/dashboard';
            }}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Show Guide Again
          </Button>
        </>
      ),
    },
    actionlog: {
      log: (
        <>
          <Stack spacing={2} sx={{ width: '100%' }}>
            {/* Filter chips + refresh */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'All' },
                { key: 'security', label: 'Security' },
                { key: 'preferences', label: 'Preferences' },
                { key: 'notifications', label: 'Notifications' },
              ].map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  size="small"
                  variant={settingsLogsFilter === f.key ? 'filled' : 'outlined'}
                  color={settingsLogsFilter === f.key ? 'primary' : 'default'}
                  onClick={() => {
                    setSettingsLogsFilter(f.key);
                    setSettingsLogsLimit(25);
                  }}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    borderRadius: 2,
                    cursor: 'pointer',
                  }}
                />
              ))}
              <Tooltip title="Refresh logs">
                <IconButton
                  size="small"
                  onClick={loadSettingsLogs}
                  disabled={settingsLogsLoading}
                  sx={{ ml: 'auto' }}
                >
                  <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Content */}
            {settingsLogsLoading ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ py: 3, textAlign: 'center' }}
              >
                Loading action log…
              </Typography>
            ) : filteredSettingsLogs.length === 0 ? (
              <Box
                sx={{
                  py: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <AppIcon
                  name="HistoryOutlined"
                  fallback={HistoryOutlinedIcon}
                  sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  No action logs yet
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                  Settings changes will appear here for monitoring and security tracking.
                </Typography>
              </Box>
            ) : (
              <>
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  sx={{ borderRadius: 2, maxHeight: 420, overflow: 'auto' }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1 }}>
                          When
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1 }}>
                          Action
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1 }}>
                          Details
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AppIcon
                              name="LocationOnOutlined"
                              fallback={LocationOnOutlinedIcon}
                              sx={{ fontSize: 14 }}
                            />{' '}
                            Location
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AppIcon
                              name="DevicesOutlined"
                              fallback={DevicesOutlinedIcon}
                              sx={{ fontSize: 14 }}
                            />{' '}
                            Device
                          </Box>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleSettingsLogs.map((log) => {
                        const network = log.detailsStructured?.network || {};
                        const device = log.detailsStructured?.device || {};
                        const flag = getCountryFlag(network.countryCode);
                        const locationText = [network.city, network.country]
                          .filter(Boolean)
                          .join(', ');
                        const deviceText = [device.browser, device.os].filter(Boolean).join(' / ');
                        return (
                          <TableRow
                            key={log.id}
                            hover
                            sx={{ '&:last-child td': { borderBottom: 0 } }}
                          >
                            <TableCell sx={{ py: 0.75, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                              <Tooltip title={formatDateTime(log.timestamp)} placement="top">
                                <Typography
                                  variant="caption"
                                  sx={{ fontSize: '0.78rem', cursor: 'default' }}
                                >
                                  {formatRelativeTime(log.timestamp)}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Chip
                                label={log.action.replace(/_/g, ' ')}
                                size="small"
                                color={getActionChipColor(log.action)}
                                variant="outlined"
                                sx={{
                                  fontWeight: 600,
                                  fontSize: '0.7rem',
                                  height: 22,
                                  textTransform: 'capitalize',
                                }}
                              />
                            </TableCell>
                            <TableCell
                              sx={{
                                py: 0.75,
                                fontSize: '0.78rem',
                                maxWidth: 260,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Tooltip title={log.details || '-'} placement="top">
                                <Typography
                                  variant="caption"
                                  sx={{ fontSize: '0.78rem', cursor: 'default' }}
                                >
                                  {log.details
                                    ? log.details.length > 50
                                      ? `${log.details.slice(0, 50)}…`
                                      : log.details
                                    : '-'}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                            <TableCell sx={{ py: 0.75, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                              {locationText ? (
                                <Typography variant="caption" sx={{ fontSize: '0.78rem' }}>
                                  {flag ? `${flag} ` : ''}
                                  {locationText}
                                </Typography>
                              ) : (
                                <Typography
                                  variant="caption"
                                  color="text.disabled"
                                  sx={{ fontSize: '0.78rem' }}
                                >
                                  -
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell sx={{ py: 0.75, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                              {deviceText ? (
                                <Typography variant="caption" sx={{ fontSize: '0.78rem' }}>
                                  {deviceText}
                                </Typography>
                              ) : (
                                <Typography
                                  variant="caption"
                                  color="text.disabled"
                                  sx={{ fontSize: '0.78rem' }}
                                >
                                  -
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                {filteredSettingsLogs.length > settingsLogsLimit && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setSettingsLogsLimit((prev) => prev + 25)}
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                    >
                      Load more ({filteredSettingsLogs.length - settingsLogsLimit} remaining)
                    </Button>
                  </Box>
                )}
              </>
            )}
          </Stack>
        </>
      ),
    },
    devmode: {
      devmode: (
        <>
          <Stack spacing={1.5} sx={{ width: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 2,
                borderRadius: 2,
                bgcolor: (t) =>
                  devMode
                    ? alpha('#F59E0B', isDark ? 0.08 : 0.05)
                    : alpha(t.palette.text.primary, 0.02),
                border: '1px solid',
                borderColor: devMode ? alpha('#F59E0B', 0.25) : 'divider',
                transition: 'all 0.2s ease',
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Activate Development Mode
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}
                >
                  Adds a dev tasks button to the header and a Development Tasks tab in Tasks. Track
                  page-specific development tasks across all pages in your app.
                </Typography>
              </Box>
              <Switch
                checked={devMode}
                onChange={(e) => setDevMode(e.target.checked)}
                color="warning"
              />
            </Box>
          </Stack>
        </>
      ),
    },
  };

  // Bodies for the tabs that have moved into the setup-panel language. A tab
  // that is not in here yet falls through to its legacy card, which is what
  // lets the page be migrated one tab at a time.
  const profileBodies = useProfileTabBodies({
    profileDataError,
    onDismissProfileError: () => setProfileDataError(null),
    profileDataLoading,
    displayName,
    onDisplayNameChange: setDisplayName,
    email: user?.email || '',
    telegram,
    onTelegramChange: setTelegram,
    notes,
    todos,
    openNotesArchive: () => openArchiveDialog(0),
    openTodosArchive: () => openArchiveDialog(1),
    format: (item) => truncate(item.text),
    noteList: {
      draft: newNote,
      onDraftChange: setNewNote,
      onAdd: addNote,
      editingId: editingNoteId,
      editingText: editingNoteText,
      onEditingTextChange: setEditingNoteText,
      onStartEdit: startEditNote,
      onSaveEdit: saveEditNote,
      onCancelEdit: cancelEditNote,
      onArchive: handleArchiveNoteClick,
      onDelete: handleDeleteNoteClick,
      onOpen: openNoteDetail,
    },
    todoList: {
      draft: newTodo,
      onDraftChange: setNewTodo,
      onAdd: addTodo,
      editingId: editingTodoId,
      editingText: editingTodoText,
      onEditingTextChange: setEditingTodoText,
      onStartEdit: startEditTodo,
      onSaveEdit: saveEditTodo,
      onCancelEdit: cancelEditTodo,
      onArchive: handleArchiveTodoClick,
      onDelete: handleDeleteTodoClick,
      onOpen: openTodoDetail,
      onToggle: toggleTodo,
    },
  });
  const tabBodies = {
    profile: profileBodies,
    preferences: preferencesBodies,
    branding: brandingBodies,
    security: securityBodies,
    ...remainingBodies,
  };

  return (
    <PageLayout
      title="Settings"
      subtitle="Manage your profile, security, and preferences"
      showTitleBlock={false}
      sx={{
        position: 'relative',
        pb: simpleMode ? `${SIMPLE_DOCK_CLEARANCE_PX}px` : { xs: 12, sm: 10 },
        width: '100%',
        maxWidth: simpleMode ? { xs: '100%', sm: 880 } : { xs: '100%', md: 1200 },
        mx: { xs: 0.75, sm: 'auto' },
      }}
    >
      {/* Slow-drifting light behind the rail. Purely decorative, and still under
          `prefers-reduced-motion: reduce` - it stops moving, not glowing. */}
      <Box aria-hidden sx={auroraHeaderSx(theme)} />
      <SettingsTabRail
        sections={visibleNavSections}
        activeId={activeTab}
        onSelect={selectTab}
        sticky
        searchSlot={
          <SettingsSearch tabs={visibleTabs} onPick={(hit) => selectTab(hit.tabId, hit.blockKey)} />
        }
        viewOptionsButton={
          simpleMode ? (
            <SettingsViewOptionsButton
              pinnedLabel={labels.profile || 'Profile'}
              sortableKeys={sortableKeys}
              labels={labels}
              hiddenSections={hiddenSections}
              sectionOrder={sectionOrder}
              onToggle={toggleSection}
              onReorder={reorderSections}
              onShowAll={showAllSections}
              onHideAll={hideAllSections}
              onReset={resetLayout}
            />
          ) : null
        }
      />
      <SettingsTabPanel
        tab={activeTabDef}
        ctx={settingsBlockContext}
        bodies={tabBodies[activeTab] || null}
        focusBlockKey={focusBlockKey}
        onFocusHandled={clearFocus}
      />
      <SettingsSaveBar saving={savingProfile} onSave={handleSaveProfile} />
      {/* Google Authenticator (TOTP) 2FA dialog */}
      <FormDialog
        open={google2FADialogOpen}
        onClose={() => {
          setGoogle2FADialogOpen(false);
          setTotpMessage({ type: '', text: '' });
          setTotpSecret('');
          setTotpShowSecret(false);
        }}
        title="Google Authenticator 2FA"
        subtitle="Protect your account with TOTP-based two-factor authentication"
        headerIcon={<Google2FAIcon size={28} />}
        maxWidth="sm"
        footerLeft={
          totpEnabled ? (
            <Button
              color="error"
              onClick={handleDisableGoogle2FA}
              disabled={totpVerifying}
              sx={{ textTransform: 'none' }}
            >
              Disable 2FA
            </Button>
          ) : null
        }
        actions={
          <>
            <Button
              onClick={startGoogle2FASetup}
              disabled={totpLoading || totpVerifying}
              sx={{ textTransform: 'none' }}
            >
              {totpLoading ? 'Generating…' : 'Regenerate QR'}
            </Button>
            <Button onClick={() => setGoogle2FADialogOpen(false)} sx={{ textTransform: 'none' }}>
              Close
            </Button>
            <Button
              variant="contained"
              onClick={handleVerifyGoogle2FA}
              disabled={totpVerifying || !totpFactorId || !/^\d{6}$/.test(String(totpCode || ''))}
              startIcon={<Google2FAIcon size={20} />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {totpVerifying ? 'Verifying…' : 'Verify & Enable'}
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Protect your account with TOTP-based two-factor authentication. Scan the QR code in Google
          Authenticator and verify once.
        </Typography>
        {totpMessage.text && (
          <Alert severity={totpMessage.type === 'error' ? 'error' : 'success'} sx={{ mb: 2 }}>
            {totpMessage.text}
          </Alert>
        )}
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
              <AppIcon
                name="LooksOneOutlined"
                fallback={LooksOneOutlinedIcon}
                color="primary"
                fontSize="small"
              />
            </ListItemIcon>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Install Google Authenticator
              </Typography>
              <Typography variant="body2" color="text.secondary" component="span">
                Download the app on your phone: Google Authenticator for{' '}
                <Box
                  component="a"
                  href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: 'primary.main' }}
                >
                  Android
                </Box>{' '}
                or{' '}
                <Box
                  component="a"
                  href="https://apps.apple.com/app/google-authenticator/id388497605"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: 'primary.main' }}
                >
                  iOS
                </Box>
                .
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
              <AppIcon
                name="LooksTwoOutlined"
                fallback={LooksTwoOutlinedIcon}
                color="primary"
                fontSize="small"
              />
            </ListItemIcon>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Scan the QR code
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Open Google Authenticator, tap the <strong>+</strong> sign, then choose{' '}
                <strong>Scan a QR code</strong>.
              </Typography>
              {google2FAQRDataUrl ? (
                <Box
                  component="img"
                  src={google2FAQRDataUrl}
                  alt="QR code for Google Authenticator"
                  sx={{
                    width: 200,
                    height: 200,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 200,
                    height: 200,
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {totpLoading ? 'Generating QR…' : 'Click Regenerate QR to start'}
                  </Typography>
                </Box>
              )}
              {totpSecret && (
                <Box sx={{ mt: 1.5 }}>
                  <Button
                    size="small"
                    variant="text"
                    startIcon={
                      <AppIcon
                        name="ExpandMore"
                        fallback={ExpandMoreIcon}
                        sx={{ transform: totpShowSecret ? 'rotate(180deg)' : undefined }}
                      />
                    }
                    onClick={() => setTotpShowSecret((s) => !s)}
                    sx={{ textTransform: 'none', fontSize: '0.8rem' }}
                  >
                    {totpShowSecret ? 'Hide' : "Can't scan? Enter key manually"}
                  </Button>
                  {totpShowSecret && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <Typography
                        component="code"
                        sx={{
                          flex: 1,
                          p: 1,
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                          fontSize: '0.75rem',
                          wordBreak: 'break-all',
                          userSelect: 'all',
                        }}
                      >
                        {totpSecret}
                      </Typography>
                      <IconButton
                        size="small"
                        title="Copy secret"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(totpSecret)
                            .then(() => pushNotification('Security', 'Secret copied to clipboard'))
                            .catch(() => {});
                        }}
                      >
                        <AppIcon name="ContentCopy" fallback={ContentCopyIcon} fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
              <AppIcon
                name="Looks3Outlined"
                fallback={Looks3OutlinedIcon}
                color="primary"
                fontSize="small"
              />
            </ListItemIcon>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Enter the verification code
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Enter the 6-digit code currently shown in your authenticator app.
              </Typography>
              <TextField
                size="small"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 }}
                sx={{ width: 160 }}
              />
            </Box>
          </Box>
        </Stack>
      </FormDialog>
      {/* YubiKey setup instruction dialog */}
      <FormDialog
        open={yubiKeyDialogOpen}
        onClose={() => {
          setYubiKeyDialogOpen(false);
          setYubiMessage({ type: '', text: '' });
        }}
        title="YubiKey security key"
        subtitle="Use a hardware security key with WebAuthn"
        headerIcon={<YubiKeyIcon size={28} />}
        maxWidth="sm"
        footerLeft={
          yubiEnabled ? (
            <Button
              color="error"
              onClick={handleDisableYubiKey}
              disabled={yubiBusy}
              sx={{ textTransform: 'none' }}
            >
              Remove key
            </Button>
          ) : null
        }
        actions={
          <>
            {yubiEnabled && (
              <Button
                onClick={handleVerifyYubiKey}
                disabled={yubiBusy || !canUseWebAuthn}
                sx={{ textTransform: 'none' }}
              >
                {yubiBusy ? 'Waiting…' : 'Test key'}
              </Button>
            )}
            <Button onClick={() => setYubiKeyDialogOpen(false)} sx={{ textTransform: 'none' }}>
              Close
            </Button>
            <Button
              variant="contained"
              startIcon={<YubiKeyIcon size={20} />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
              onClick={handleRegisterYubiKey}
              disabled={yubiBusy || !supabaseAuthEnabled || !canUseWebAuthn}
            >
              {yubiBusy
                ? 'Waiting for key…'
                : yubiEnabled
                  ? 'Register another key'
                  : 'Register now'}
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Use a hardware security key with WebAuthn for strong phishing-resistant authentication.
        </Typography>
        {yubiMessage.text && (
          <Alert severity={yubiMessage.type === 'error' ? 'error' : 'success'} sx={{ mb: 2 }}>
            {yubiMessage.text}
          </Alert>
        )}
        {!canUseWebAuthn && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This browser/device does not support secure WebAuthn registration here. Use a modern
            browser over HTTPS.
          </Alert>
        )}
        {yubiEnabled && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Security key enabled{yubiFactorName ? ` (${yubiFactorName})` : ''}.
          </Alert>
        )}
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
              <AppIcon
                name="LooksOneOutlined"
                fallback={LooksOneOutlinedIcon}
                color="primary"
                fontSize="small"
              />
            </ListItemIcon>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Prepare your key
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Insert your YubiKey (USB) or keep it ready to tap (NFC). Stay on this page.
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
              <AppIcon
                name="LooksTwoOutlined"
                fallback={LooksTwoOutlinedIcon}
                color="primary"
                fontSize="small"
              />
            </ListItemIcon>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Start registration
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Click <strong>Register now</strong>. Your browser will open a passkey/security-key
                prompt.
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
              <AppIcon
                name="Looks3Outlined"
                fallback={Looks3OutlinedIcon}
                color="primary"
                fontSize="small"
              />
            </ListItemIcon>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Confirm with your key
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Touch the YubiKey sensor (and enter PIN if requested) to complete enrollment.
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
              <AppIcon
                name="Looks4Outlined"
                fallback={Looks4OutlinedIcon}
                color="primary"
                fontSize="small"
              />
            </ListItemIcon>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Keep backup access
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Register a second key or keep TOTP enabled so you can still sign in if the key is
                lost.
              </Typography>
            </Box>
          </Box>
        </Stack>
      </FormDialog>
      {/* Note detail popup */}
      <FormDialog
        open={!!noteDetail}
        onClose={closeNoteDetail}
        title="Note"
        icon={NoteAddOutlinedIcon}
        maxWidth="sm"
        contentDividers={false}
        footerLeft={
          <Button
            onClick={archiveNoteInDetail}
            color="warning"
            size="small"
            startIcon={<AppIcon name="ArchiveOutlined" fallback={ArchiveOutlinedIcon} />}
            sx={{ textTransform: 'none' }}
          >
            Archive
          </Button>
        }
        actions={
          <>
            <Button
              onClick={deleteNoteInDetail}
              color="error"
              size="small"
              startIcon={<AppIcon name="Close" fallback={CloseIcon} />}
              sx={{ textTransform: 'none' }}
            >
              Delete
            </Button>
            <Button onClick={closeNoteDetail} size="small" sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={saveNoteDetail}
              size="small"
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Save
            </Button>
          </>
        }
      >
        <TextField
          multiline
          minRows={4}
          maxRows={12}
          fullWidth
          value={noteDetailText}
          onChange={(e) => setNoteDetailText(e.target.value)}
          placeholder="Note content…"
          variant="outlined"
          size="small"
          sx={{ mt: 0.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </FormDialog>
      {/* Todo detail popup */}
      <FormDialog
        open={!!todoDetail}
        onClose={closeTodoDetail}
        title="Task"
        icon={PlaylistAddCheckIcon}
        maxWidth="sm"
        contentDividers={false}
        footerLeft={
          <Button
            onClick={archiveTodoInDetail}
            color="warning"
            size="small"
            startIcon={<AppIcon name="ArchiveOutlined" fallback={ArchiveOutlinedIcon} />}
            sx={{ textTransform: 'none' }}
          >
            Archive
          </Button>
        }
        actions={
          <>
            <Button
              onClick={deleteTodoInDetail}
              color="error"
              size="small"
              startIcon={<AppIcon name="Close" fallback={CloseIcon} />}
              sx={{ textTransform: 'none' }}
            >
              Delete
            </Button>
            <Button onClick={closeTodoDetail} size="small" sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={saveTodoDetail}
              size="small"
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Save
            </Button>
          </>
        }
      >
        <FormControlLabel
          control={
            <Checkbox
              checked={todoDetailDone}
              onChange={(e) => setTodoDetailDone(e.target.checked)}
              color="primary"
            />
          }
          label="Completed"
          sx={{ display: 'block', mb: 1.5 }}
        />
        <TextField
          fullWidth
          value={todoDetailText}
          onChange={(e) => setTodoDetailText(e.target.value)}
          placeholder="Task description…"
          variant="outlined"
          size="small"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </FormDialog>
      {/* Archive dialog */}
      <FormDialog
        open={archiveDialogOpen}
        onClose={closeArchiveDialog}
        title={`Archive - ${profileNotesTodoTab === 0 ? 'Notes' : 'Tasks'}`}
        icon={ArchiveOutlinedIcon}
        maxWidth="md"
        contentDividers={false}
        contentSx={{ p: 0, pt: 0, px: 0, pb: 0 }}
        primaryLabel="Close"
        onPrimary={closeArchiveDialog}
        hideCancel
      >
        {/* Tabs Section - Always Visible */}
        <Box
          sx={{
            borderBottom: '2px solid',
            borderColor: 'divider',
            bgcolor: isDark ? alpha(theme.palette.background.default, 0.5) : 'grey.50',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          <Tabs
            value={archiveDialogTab}
            onChange={(_, newValue) => setArchiveDialogTab(newValue)}
            variant="fullWidth"
            sx={{
              '& .MuiTabs-indicator': {
                height: 3,
                bgcolor: 'primary.main',
              },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                minHeight: 56,
                fontSize: '0.9rem',
                color: 'text.secondary',
                borderRight: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderRight: 'none' },
                '&.Mui-selected': {
                  color: 'primary.main',
                  fontWeight: 700,
                  bgcolor: isDark
                    ? alpha(theme.palette.primary.main, 0.1)
                    : alpha(theme.palette.primary.main, 0.05),
                },
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                },
              },
            }}
          >
            <Tab
              label="Archived Items"
              icon={
                <AppIcon
                  name="ArchiveOutlined"
                  fallback={ArchiveOutlinedIcon}
                  sx={{ fontSize: 18 }}
                />
              }
              iconPosition="start"
            />
            <Tab
              label="Action Log"
              icon={<AppIcon name="Restore" fallback={RestoreIcon} sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
          </Tabs>
        </Box>

        <Box sx={{ maxHeight: 400, overflow: 'auto', minHeight: 200 }}>
          {/* Archived Items Tab */}
          <Box
            sx={{
              display: archiveDialogTab === 0 ? 'block' : 'none',
              p: archiveDialogTab === 0 ? 2 : 0,
            }}
          >
            {loadingArchived ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ py: 2, textAlign: 'center' }}
              >
                Loading archived items…
              </Typography>
            ) : archivedItems.length === 0 ? (
              <Box
                sx={{
                  py: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <AppIcon
                  name="ArchiveOutlined"
                  fallback={ArchiveOutlinedIcon}
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  No archived items
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                  Archived items will appear here
                </Typography>
              </Box>
            ) : (
              <List dense>
                {archivedItems.map((item) => (
                  <ListItem
                    key={item.id}
                    secondaryAction={
                      <Tooltip title="Unarchive">
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() =>
                            profileNotesTodoTab === 0
                              ? unarchiveNote(item.id)
                              : unarchiveTodo(item.id)
                          }
                          aria-label="Unarchive"
                          sx={{ color: 'primary.main' }}
                        >
                          <AppIcon name="Restore" fallback={RestoreIcon} sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    }
                    sx={{
                      py: 1.5,
                      px: 2,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                          {item.text}
                        </Typography>
                      }
                      secondary={
                        <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            Created: {formatDate(item.createdAt)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Status:{' '}
                            {profileNotesTodoTab === 1 && item.status
                              ? `${item.status} / Archived`
                              : 'Archived'}
                          </Typography>
                        </Stack>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {/* Action Log Tab */}
          <Box sx={{ display: archiveDialogTab === 1 ? 'block' : 'none', p: 2 }}>
            {loadingActionLogs ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ py: 2, textAlign: 'center' }}
              >
                Loading action log…
              </Typography>
            ) : actionLogs.length === 0 ? (
              <Box
                sx={{
                  py: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  No action logs
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                  Action history will appear here
                </Typography>
              </Box>
            ) : (
              <TableContainer sx={{ maxHeight: 350, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{ fontWeight: 700, fontSize: '0.85rem', bgcolor: 'background.paper' }}
                      >
                        Action
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, fontSize: '0.85rem', bgcolor: 'background.paper' }}
                      >
                        Type
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, fontSize: '0.85rem', bgcolor: 'background.paper' }}
                      >
                        Details
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, fontSize: '0.85rem', bgcolor: 'background.paper' }}
                      >
                        Date & Time
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {actionLogs.map((log) => {
                      const getActionColor = (action) => {
                        const actionLower = action.toLowerCase();
                        if (actionLower.includes('created')) return 'success';
                        if (actionLower.includes('archived')) return 'warning';
                        if (actionLower.includes('unarchived')) return 'info';
                        if (actionLower.includes('deleted')) return 'error';
                        if (actionLower.includes('updated')) return 'primary';
                        return 'default';
                      };

                      const getActionLabel = (action) => {
                        const actionLower = action.toLowerCase();
                        if (actionLower.includes('note created')) return 'Note Created';
                        if (actionLower.includes('task created')) return 'Task Created';
                        if (actionLower.includes('note archived')) return 'Note Archived';
                        if (actionLower.includes('task archived')) return 'Task Archived';
                        if (actionLower.includes('note unarchived')) return 'Note Unarchived';
                        if (actionLower.includes('task unarchived')) return 'Task Unarchived';
                        if (actionLower.includes('note deleted')) return 'Note Deleted';
                        if (actionLower.includes('task deleted')) return 'Task Deleted';
                        if (actionLower.includes('note updated')) return 'Note Updated';
                        if (actionLower.includes('task updated')) return 'Task Updated';
                        return action;
                      };

                      return (
                        <TableRow key={log.id} hover>
                          <TableCell>
                            <Chip
                              label={getActionLabel(log.action)}
                              color={getActionColor(log.action)}
                              size="small"
                              sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={log.itemType === 'note' ? 'Note' : 'Task'}
                              variant="outlined"
                              size="small"
                              sx={{ fontSize: '0.75rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="caption"
                              sx={{ fontSize: '0.8rem', color: 'text.secondary' }}
                            >
                              {log.details || log.entityId || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="caption"
                              sx={{ fontSize: '0.8rem', color: 'text.secondary' }}
                            >
                              {formatDateTime(log.timestamp)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Box>
      </FormDialog>
      {/* Archive Confirmation Dialog */}
      <FormDialog
        open={!!archiveConfirm}
        onClose={() => setArchiveConfirm(null)}
        title={`Archive ${archiveConfirm?.type === 'note' ? 'note' : 'task'}?`}
        icon={ArchiveOutlinedIcon}
        iconVariant="warning"
        maxWidth="xs"
        contentDividers={false}
        actions={
          <>
            <Button
              onClick={() => setArchiveConfirm(null)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="warning"
              onClick={handleArchiveConfirm}
              startIcon={<AppIcon name="ArchiveOutlined" fallback={ArchiveOutlinedIcon} />}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Archive
            </Button>
          </>
        }
      >
        <DialogContentText sx={{ color: 'text.primary', fontSize: '0.9rem', mb: 1 }}>
          Are you sure you want to archive this {archiveConfirm?.type === 'note' ? 'note' : 'task'}?
        </DialogContentText>
        <Box
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            borderRadius: 2,
            p: 1.5,
            mt: 1.5,
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.85rem' }}
          >
            "
            {archiveConfirm?.text
              ? archiveConfirm.text.length > 60
                ? `${archiveConfirm.text.slice(0, 60)}…`
                : archiveConfirm.text
              : 'Untitled'}
            "
          </Typography>
        </Box>
        <DialogContentText sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 1.5 }}>
          The {archiveConfirm?.type === 'note' ? 'note' : 'task'} will be moved to the archive and
          hidden from the main list. You can view it later in the Archive dialog.
        </DialogContentText>
      </FormDialog>
      {/* Delete Confirmation Dialog */}
      <FormDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={`Delete ${deleteConfirm?.type === 'note' ? 'note' : 'task'}?`}
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        contentDividers={false}
        actions={
          <>
            <Button
              onClick={() => setDeleteConfirm(null)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteConfirm}
              startIcon={<AppIcon name="Close" fallback={CloseIcon} />}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Delete
            </Button>
          </>
        }
      >
        <DialogContentText sx={{ color: 'text.primary', fontSize: '0.9rem', mb: 1 }}>
          Are you sure you want to permanently delete this{' '}
          {deleteConfirm?.type === 'note' ? 'note' : 'task'}?
        </DialogContentText>
        <Box
          sx={{
            bgcolor: alpha(theme.palette.error.main, 0.04),
            borderRadius: 2,
            p: 1.5,
            mt: 1.5,
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.85rem' }}
          >
            "
            {deleteConfirm?.text
              ? deleteConfirm.text.length > 60
                ? `${deleteConfirm.text.slice(0, 60)}…`
                : deleteConfirm.text
              : 'Untitled'}
            "
          </Typography>
        </Box>
        <DialogContentText
          sx={{ color: 'error.main', fontSize: '0.85rem', mt: 1.5, fontWeight: 500 }}
        >
          ⚠️ This action cannot be undone. The {deleteConfirm?.type === 'note' ? 'note' : 'task'}{' '}
          will be permanently removed.
        </DialogContentText>
      </FormDialog>
    </PageLayout>
  );
}

export default function Settings() {
  return <AdvancedSettings />;
}
