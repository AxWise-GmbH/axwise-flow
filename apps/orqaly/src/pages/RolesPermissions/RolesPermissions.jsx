import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  InputAdornment,
  alpha,
  useTheme,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Button,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  Checkbox,
  Avatar,
  Divider,
  Collapse,
  Alert,
  Paper,
  Menu,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  LinearProgress,
  Popover,
  useMediaQuery,
} from '@mui/material';
// Icons
import SearchIcon from '@mui/icons-material/Search';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import BlockIcon from '@mui/icons-material/Block';
import LockResetIcon from '@mui/icons-material/LockReset';
import NoEncryptionOutlinedIcon from '@mui/icons-material/NoEncryptionOutlined';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DownloadIcon from '@mui/icons-material/Download';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import DeselectIcon from '@mui/icons-material/Deselect';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import TuneIcon from '@mui/icons-material/Tune';
import FilterListIcon from '@mui/icons-material/FilterList';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import GppBadIcon from '@mui/icons-material/GppBad';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import LoginIcon from '@mui/icons-material/Login';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import HistoryIcon from '@mui/icons-material/History';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import BentoCard from '../../components/Common/BentoCard';
import FormDialog from '../../components/Common/FormDialog';
import PageLayout from '../../components/Common/PageLayout';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useAuth } from '../../context/AuthContext';
import PermissionsActionLogTab from './PermissionsActionLogTab';
import { logAction } from '../../services/auditLogBackend';
import { hasSupabase } from '../../lib/supabase';
import { verifyPinRemote } from '../../config/pinAccess';
import {
  PAGE_DEFINITIONS,
  ROLE_TEMPLATES,
  buildTemplateAccess,
  loadRoles,
  createRole,
  updateRole,
  deleteRole,
  duplicateRole,
  loadUsers,
  updateUserRole,
  getLinkedPartnerIdForUser,
  setLinkedPartnerIdForUser,
  blockUser,
  deleteUser as deleteUserSvc,
  disableUser2FA,
  resendPasswordEmail,
  inviteUser,
  bulkAssignRole,
  bulkBlockUsers,
  bulkDeleteUsers,
  buildNoAccess,
} from '../../services/rolesPermissionsService';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import { usePartners } from '../../hooks/usePartners';

import AppIcon from '../../components/icons/AppIcon';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function countEnabledPages(pages = {}) {
  return Object.values(pages).filter((p) => p?.enabled).length;
}

function countEnabledBlocks(pages = {}) {
  let total = 0;
  let enabled = 0;
  Object.values(pages).forEach((p) => {
    if (p?.blocks) {
      Object.values(p.blocks).forEach((v) => {
        total += 1;
        if (v) enabled += 1;
      });
    }
  });
  return { total, enabled };
}

function generateSecurePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  // Guarantee at least one of each required type
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  const all = upper + lower + digits + symbols;
  const extra = Array.from({ length: 10 }, () => all[Math.floor(Math.random() * all.length)]);
  // Shuffle
  const chars = [...required, ...extra];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'success' },
  blocked: { label: 'Blocked', color: 'error' },
  invited: { label: 'Invited', color: 'warning' },
  deleted: { label: 'Deleted', color: 'default' },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function RolesPermissions() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isSupabaseEnabled = hasSupabase();
  const defaultRoleColor = theme.palette.primary.main;
  const { user: currentUser } = useAuth();

  // Login-as state
  const [loginAsLoading, setLoginAsLoading] = useState(null);
  const [loginAsConfirm, setLoginAsConfirm] = useState(null);

  const handleLoginAs = async (targetUser) => {
    if (isSupabaseEnabled) {
      showSnack(
        'Login As is disabled in Supabase mode for security and session consistency.',
        'warning'
      );
      return;
    }
    setLoginAsLoading(targetUser.id);
    try {
      // Look up the user in the local auth store to get their uid
      const raw = localStorage.getItem('orch_auth_users');
      const localUsers = raw ? JSON.parse(raw) : [];
      const found = localUsers.find(
        (u) => u.email?.toLowerCase() === targetUser.email?.toLowerCase()
      );

      if (!found) {
        showSnack(
          `Cannot login as ${targetUser.email} - user has not registered on this platform yet.`,
          'error'
        );
        setLoginAsLoading(null);
        return;
      }

      // SECURITY NOTE: This block only runs in local-auth fallback mode.
      // Supabase mode is fully blocked above (line 215-218) and cannot reach here.
      // In local-auth mode there is no server-side session; impersonation is intentional
      // admin tooling and is scoped to the local machine only (no network tokens are issued).
      // Never extend this pattern to Supabase or any server-managed auth provider.
      const impersonatedSession = {
        uid: found.uid,
        email: found.email,
        displayName: found.displayName || found.email?.split('@')[0] || 'User',
        photoURL: found.photoURL || null,
      };
      localStorage.setItem('orch_auth_session', JSON.stringify(impersonatedSession));

      // Hard reload so AuthContext picks up the new session cleanly
      window.location.href = '/';
    } catch (err) {
      showSnack('Login failed: ' + (err?.message || 'Unknown error'), 'error');
      setLoginAsLoading(null);
      setLoginAsConfirm(null);
    }
  };

  // Data
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showMetrics, setShowMetrics] = useShowMetrics('permissions');

  // Tab
  const [activeTab, setActiveTab] = useState(0);

  // Roles state
  const roleSearch = '';
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    color: defaultRoleColor,
    pages: {},
    templateId: null,
    dataIsolation: false,
    forceSimpleMode: false,
  });
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [expandedPages, setExpandedPages] = useState({});
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState(null);

  // Users state
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    roleId: 'role-viewer',
    linkedPartnerId: '',
  });
  const [inviteShowPassword, setInviteShowPassword] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [usersFilterAnchorEl, setUsersFilterAnchorEl] = useState(null);
  const [successPopup, setSuccessPopup] = useState(null); // { email, password, roleName }
  const [copiedField, setCopiedField] = useState('');
  const [editUserRoleDialog, setEditUserRoleDialog] = useState(null);
  const [editUserRoleValue, setEditUserRoleValue] = useState('');
  const [editLinkedPartnerId, setEditLinkedPartnerId] = useState('');
  const [deleteUserConfirm, setDeleteUserConfirm] = useState(null);
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState(null);
  const [bulkRoleDialog, setBulkRoleDialog] = useState(false);
  const [bulkRoleValue, setBulkRoleValue] = useState('');
  const [snackMessage, setSnackMessage] = useState({ text: '', severity: 'success' });
  const [resetLinkDialog, setResetLinkDialog] = useState(null);

  const { partners } = usePartners();

  // Load data
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u] = await Promise.all([loadRoles(), loadUsers()]);
      setRoles(r);
      setUsers(u.filter((usr) => usr.status !== 'deleted'));
    } catch (err) {
      showSnack('Failed to load data: ' + (err?.message || 'Unknown error'), 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Stats
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'active').length;
    const blocked = users.filter((u) => u.status === 'blocked').length;
    const invited = users.filter((u) => u.status === 'invited').length;
    const superAdmins = users.filter((u) => u.roleId === 'role-super-admin').length;
    return { total, active, blocked, invited, rolesCount: roles.length, superAdmins };
  }, [users, roles]);

  // -----------------------------------------------------------------------
  // Snack
  // -----------------------------------------------------------------------
  const showSnack = (text, severity = 'success') => {
    setSnackMessage({ text, severity });
    setTimeout(() => setSnackMessage({ text: '', severity: 'success' }), 4000);
  };

  const requirePermissionsPin = async () => {
    const entered = window.prompt('Enter security PIN to continue:');
    if (!entered) {
      showSnack('Action cancelled.', 'error');
      return false;
    }
    const valid = await verifyPinRemote(entered);
    if (!valid) {
      showSnack('Invalid PIN. Action cancelled.', 'error');
      return false;
    }
    return true;
  };

  // -----------------------------------------------------------------------
  // Role handlers
  // -----------------------------------------------------------------------

  const openCreateRole = () => {
    setEditingRole(null);
    setSelectedTemplate(null);
    // Start with no access - user explicitly grants
    setRoleForm({
      name: '',
      description: '',
      color: defaultRoleColor,
      pages: buildNoAccess(),
      templateId: null,
      dataIsolation: false,
      forceSimpleMode: false,
    });
    setExpandedPages({});
    setRoleDialogOpen(true);
  };

  const openEditRole = (role) => {
    setEditingRole(role);
    const meta = role.pages?._meta || {};
    setSelectedTemplate(meta.templateId || null);
    setRoleForm({
      name: role.name,
      description: role.description,
      color: role.color || defaultRoleColor,
      pages: JSON.parse(JSON.stringify(role.pages || {})),
      templateId: meta.templateId || null,
      dataIsolation: meta.dataIsolation || false,
      forceSimpleMode: meta.forceSimpleMode || false,
    });
    setExpandedPages({});
    setRoleDialogOpen(true);
  };

  const TEMPLATE_ICONS = {
    CampaignOutlined: CampaignOutlinedIcon,
    BuildOutlined: BuildOutlinedIcon,
    AutoAwesomeOutlined: AutoAwesomeOutlinedIcon,
    HandymanOutlined: HandymanOutlinedIcon,
    PersonOutlined: PersonOutlinedIcon,
  };

  const handleSelectTemplate = (tpl) => {
    const isDeselect = selectedTemplate === tpl.id;
    if (isDeselect) {
      setSelectedTemplate(null);
      setRoleForm((prev) => ({
        ...prev,
        pages: buildNoAccess(),
        templateId: null,
        dataIsolation: false,
        forceSimpleMode: false,
      }));
      return;
    }
    setSelectedTemplate(tpl.id);
    setRoleForm((prev) => ({
      ...prev,
      name: prev.name || tpl.name,
      color: tpl.color,
      pages: buildTemplateAccess(tpl.id),
      templateId: tpl.id,
      dataIsolation: tpl.dataIsolation || false,
      forceSimpleMode: tpl.forceSimpleMode || false,
    }));
  };

  const handleSaveRole = async () => {
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    try {
      if (editingRole) {
        await updateRole(editingRole.id, roleForm);
      } else {
        await createRole(roleForm);
      }
      setRoleDialogOpen(false);
      await refresh();
      showSnack(editingRole ? 'Role updated successfully' : 'Role created successfully');
    } catch (err) {
      showSnack('Error saving role: ' + (err?.message || ''), 'error');
    }
    setActionLoading(false);
  };

  const handleDeleteRole = async () => {
    if (!deleteRoleConfirm) return;
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    try {
      await deleteRole(deleteRoleConfirm.id);
      setDeleteRoleConfirm(null);
      await refresh();
      showSnack('Role deleted');
    } catch (err) {
      showSnack('Cannot delete this role: ' + (err?.message || ''), 'error');
    }
    setActionLoading(false);
  };

  const handleDuplicateRole = async (roleId) => {
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    try {
      await duplicateRole(roleId);
      await refresh();
      showSnack('Role duplicated');
    } catch {
      showSnack('Error duplicating role', 'error');
    }
    setActionLoading(false);
  };

  // Page toggle - grant / deny access
  const togglePageAccess = (pageId) => {
    setRoleForm((prev) => {
      const pages = { ...prev.pages };
      const current = pages[pageId] || { enabled: false, blocks: {} };
      const pageDef = PAGE_DEFINITIONS.find((p) => p.id === pageId);
      if (!current.enabled && pageDef) {
        // Grant access → enable page + all blocks
        pages[pageId] = {
          enabled: true,
          blocks: Object.fromEntries(pageDef.blocks.map((b) => [b.id, true])),
        };
      } else {
        // Deny access → disable page + all blocks
        pages[pageId] = {
          enabled: false,
          blocks: pageDef ? Object.fromEntries(pageDef.blocks.map((b) => [b.id, false])) : {},
        };
      }
      return { ...prev, pages };
    });
  };

  const toggleBlockAccess = (pageId, blockId) => {
    setRoleForm((prev) => {
      const pages = { ...prev.pages };
      const current = pages[pageId] || { enabled: true, blocks: {} };
      const blocks = { ...current.blocks };
      blocks[blockId] = !blocks[blockId];
      pages[pageId] = { ...current, blocks };
      return { ...prev, pages };
    });
  };

  const toggleAllPages = (enable) => {
    setRoleForm((prev) => {
      const pages = {};
      PAGE_DEFINITIONS.forEach((p) => {
        pages[p.id] = {
          enabled: enable,
          blocks: Object.fromEntries(p.blocks.map((b) => [b.id, enable])),
        };
      });
      return { ...prev, pages };
    });
  };

  // -----------------------------------------------------------------------
  // User handlers
  // -----------------------------------------------------------------------

  const handleBlockUser = async (userId) => {
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    try {
      await blockUser(userId);
      await refresh();
      showSnack('User status updated');
    } catch (err) {
      showSnack('Error: ' + (err?.message || ''), 'error');
    }
    setActionLoading(false);
  };

  const handleDeleteUser = async () => {
    if (!deleteUserConfirm) return;
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    try {
      await deleteUserSvc(deleteUserConfirm.id);
      setDeleteUserConfirm(null);
      setSelectedUsers((prev) => prev.filter((id) => id !== deleteUserConfirm.id));
      await refresh();
      showSnack('User removed');
    } catch (err) {
      showSnack('Error: ' + (err?.message || ''), 'error');
    }
    setActionLoading(false);
  };

  const handleDisable2FA = async (userId) => {
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    try {
      await disableUser2FA(userId);
      await refresh();
      showSnack('2FA disabled for user');
    } catch (err) {
      showSnack('Error: ' + (err?.message || ''), 'error');
    }
    setActionLoading(false);
  };

  const handleResendPassword = async (userId) => {
    if (!(await requirePermissionsPin())) return;
    const user = users.find((u) => u.id === userId);
    setActionLoading(true);
    setResetLinkDialog(null);
    try {
      const result = await resendPasswordEmail(userId, user?.email);
      if (result.emailSent === false) {
        // Email was not delivered (no provider configured, domain unverified, or
        // send rejected). Never claim success - surface the real reason and offer
        // the copyable recovery link as a manual fallback when one is available.
        if (result.link) {
          setResetLinkDialog({ link: result.link, email: result.email });
        }
        showSnack(
          result.note ||
            'Email could not be sent. Copy the reset link below and send it to the user.',
          'warning'
        );
      } else {
        showSnack(`Password reset sent to ${result.email}`);
      }
    } catch (err) {
      const msg = err?.message || '';
      const isResendConfig = /verify|domain|RESEND_FROM_EMAIL|not configured/i.test(msg);
      showSnack(
        isResendConfig
          ? "Password reset emails aren't set up yet. An admin can enable them by verifying a domain at resend.com/domains and setting RESEND_FROM_EMAIL in Vercel."
          : 'Error: ' + msg,
        isResendConfig ? 'warning' : 'error'
      );
    }
    setActionLoading(false);
  };

  const handleCopyResetLink = () => {
    if (!resetLinkDialog?.link) return;
    navigator.clipboard
      .writeText(resetLinkDialog.link)
      .then(() => {
        showSnack('Reset link copied to clipboard');
      })
      .catch(() => {
        showSnack('Failed to copy', 'error');
      });
  };

  const handleEditUserRole = async () => {
    if (!editUserRoleDialog || !editUserRoleValue) return;
    if (editUserRoleValue === 'role-partner' && !editLinkedPartnerId) {
      showSnack('Please select a partner to link for the Partner role.', 'error');
      return;
    }
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    try {
      await updateUserRole(
        editUserRoleDialog.id,
        editUserRoleValue,
        editUserRoleValue === 'role-partner' ? editLinkedPartnerId : null
      );
      setEditUserRoleDialog(null);
      await refresh();
      showSnack('User role updated');
    } catch (err) {
      showSnack('Error: ' + (err?.message || ''), 'error');
    }
    setActionLoading(false);
  };

  const handleInviteUser = async () => {
    const { email, password, confirmPassword, roleId, linkedPartnerId } = inviteForm;
    if (!email.trim()) return;
    if (roleId === 'role-partner' && !linkedPartnerId) {
      setInviteError('Please select a partner to link for the Partner role.');
      return;
    }
    // Supabase mode: a blank password means "email them an invitation instead"
    // (the backend picks the branch). Local mode has no mailer, so it still
    // needs one to hand to authRegister().
    if (!password && !isSupabaseEnabled) {
      setInviteError('Please enter a password.');
      return;
    }
    if (password) {
      // Mirrors inviteUserBodySchema (api/_lib/validate.js) so a short password
      // fails here rather than as a server 400.
      if (password.length < 8) {
        setInviteError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setInviteError('Passwords do not match.');
        return;
      }
    }
    if (!(await requirePermissionsPin())) return;
    setInviteError('');
    setActionLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const roleName = roles.find((r) => r.id === roleId)?.name || 'Unassigned';

      if (isSupabaseEnabled) {
        const result = await inviteUser({
          email: normalizedEmail,
          name: normalizedEmail.split('@')[0],
          roleId,
          linkedPartnerId: roleId === 'role-partner' ? linkedPartnerId : undefined,
          password: password || undefined,
        });
        if (result?.userId && roleId === 'role-partner' && linkedPartnerId) {
          setLinkedPartnerIdForUser(result.userId, linkedPartnerId);
        }

        setInviteDialogOpen(false);
        setInviteForm({
          email: '',
          password: '',
          confirmPassword: '',
          roleId: 'role-viewer',
          linkedPartnerId: '',
        });
        setInviteShowPassword(false);
        await refresh();
        if (result?.createdWithPassword) {
          setSuccessPopup({ email: normalizedEmail, password, roleName });
        } else {
          showSnack(`Invitation sent to ${normalizedEmail}`);
        }
        setActionLoading(false);
        return;
      }

      // Local mode only: create with password and keep admin session unchanged.
      const { register: authRegister } = await import('../../lib/auth');
      const currentSession = localStorage.getItem('orch_auth_session');
      await authRegister(normalizedEmail, password, normalizedEmail.split('@')[0]);
      if (currentSession) {
        localStorage.setItem('orch_auth_session', currentSession);
      }
      const newRaw = localStorage.getItem('orch_auth_users');
      const newUsers = newRaw ? JSON.parse(newRaw) : [];
      const created = newUsers.find((u) => u.email === normalizedEmail);
      if (created && roleId) {
        await updateUserRole(
          created.uid,
          roleId,
          roleId === 'role-partner' ? linkedPartnerId : null
        );
      }
      logAction({
        action: 'user_created',
        entity: 'user',
        entityId: created?.uid || normalizedEmail,
        details: {
          summary: `User created: ${normalizedEmail}`,
          email: normalizedEmail,
          roleId,
          source: 'permissions',
        },
      });

      // Close invite dialog, show success popup
      setInviteDialogOpen(false);
      setInviteForm({
        email: '',
        password: '',
        confirmPassword: '',
        roleId: 'role-viewer',
        linkedPartnerId: '',
      });
      setInviteShowPassword(false);
      await refresh();
      setSuccessPopup({ email: normalizedEmail, password, roleName });
    } catch (err) {
      setInviteError(err?.message || 'Failed to create user.');
    }
    setActionLoading(false);
  };

  const handleCopyCredentials = (field) => {
    const { email, password } = successPopup || {};
    const text =
      field === 'all'
        ? `Email: ${email}\nPassword: ${password}`
        : field === 'email'
          ? email
          : password;
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    } catch {
      // Clipboard not available
    }
  };

  // Bulk
  const handleBulkAssignRole = async () => {
    if (!bulkRoleValue || selectedUsers.length === 0) return;
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    await bulkAssignRole(selectedUsers, bulkRoleValue);
    setBulkRoleDialog(false);
    setBulkMenuAnchor(null);
    setSelectedUsers([]);
    await refresh();
    showSnack(`Role assigned to ${selectedUsers.length} users`);
    setActionLoading(false);
  };

  const handleBulkBlock = async () => {
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    await bulkBlockUsers(selectedUsers);
    setBulkMenuAnchor(null);
    setSelectedUsers([]);
    await refresh();
    showSnack('Selected users blocked');
    setActionLoading(false);
  };

  const handleBulkDelete = async () => {
    if (!(await requirePermissionsPin())) return;
    setActionLoading(true);
    await bulkDeleteUsers(selectedUsers);
    setBulkMenuAnchor(null);
    setSelectedUsers([]);
    await refresh();
    showSnack('Selected users removed');
    setActionLoading(false);
  };

  // Export CSV
  const exportUsersCSV = () => {
    const header = 'Name,Email,Role,Status,Last Login,2FA,Provider,Created';
    const rows = filteredUsers.map((u) => {
      const roleName = roles.find((r) => r.id === u.roleId)?.name || 'Unassigned';
      return `"${u.name}","${u.email}","${roleName}","${u.status}","${u.lastLogin || ''}","${u.twoFaEnabled ? 'Yes' : 'No'}","${u.provider || ''}","${u.createdAt}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Selection
  const toggleSelectUser = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map((u) => u.id));
    }
  };

  // Filtered data
  const filteredRoles = useMemo(() => {
    const q = roleSearch.toLowerCase();
    return roles.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
    );
  }, [roles, roleSearch]);

  const filteredUsers = useMemo(() => {
    let list = users;
    const q = userSearch.toLowerCase();
    if (q) {
      list = list.filter(
        (u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
      );
    }
    if (userRoleFilter === '__unassigned__') {
      list = list.filter((u) => !u.roleId);
    } else if (userRoleFilter !== 'all') {
      list = list.filter((u) => u.roleId === userRoleFilter);
    }
    if (userStatusFilter !== 'all') {
      list = list.filter((u) => u.status === userStatusFilter);
    }
    return list;
  }, [users, userSearch, userRoleFilter, userStatusFilter]);

  const allPagesEnabled = useMemo(() => {
    return PAGE_DEFINITIONS.every((p) => roleForm.pages[p.id]?.enabled);
  }, [roleForm.pages]);

  const noPagesEnabled = useMemo(() => {
    return PAGE_DEFINITIONS.every((p) => !roleForm.pages[p.id]?.enabled);
  }, [roleForm.pages]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const getRoleBadgeColor = (roleId) => {
    const role = roles.find((r) => r.id === roleId);
    return role?.color || theme.palette.primary.main;
  };

  const getRoleName = (roleId) => {
    if (!roleId) return 'Unassigned';
    return roles.find((r) => r.id === roleId)?.name || 'Unknown';
  };

  // Stat cards (Partners-style: label, value, helper, icon)
  const statCards = [
    {
      label: 'Total Users',
      value: stats.total,
      helper: 'All registered users',
      color: theme.palette.primary.main,
      icon: GroupsOutlinedIcon,
    },
    {
      label: 'Active',
      value: stats.active,
      helper: 'Currently active users',
      color: theme.palette.success.main,
      icon: CheckCircleOutlineIcon,
    },
    {
      label: 'Blocked',
      value: stats.blocked,
      helper: 'Blocked from access',
      color: theme.palette.error.main,
      icon: BlockIcon,
    },
    {
      label: 'Invited',
      value: stats.invited,
      helper: 'Pending invitations',
      color: theme.palette.warning.main,
      icon: MailOutlineIcon,
    },
    {
      label: 'Roles',
      value: stats.rolesCount,
      helper: 'Defined roles in system',
      color: theme.palette.primary.main,
      icon: ShieldOutlinedIcon,
    },
    {
      label: 'Super Admins',
      value: stats.superAdmins,
      helper: 'Users with full access',
      color: '#D32F2F',
      icon: VerifiedUserIcon,
    },
  ];

  // Permission summary for role form
  const permSummary = useMemo(() => {
    const enabledPages = countEnabledPages(roleForm.pages);
    const { total, enabled } = countEnabledBlocks(roleForm.pages);
    const percent = total > 0 ? Math.round((enabled / total) * 100) : 0;
    return {
      enabledPages,
      totalPages: PAGE_DEFINITIONS.length,
      enabledBlocks: enabled,
      totalBlocks: total,
      percent,
    };
  }, [roleForm.pages]);

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <PageLayout title="Permissions" subtitle="Loading permissions data…" showTitleBlock={false}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Permissions"
      subtitle="Manage user roles and platform permissions"
      showTitleBlock={false}
    >
      {/* Action loading bar */}
      {actionLoading && <LinearProgress sx={{ mb: 1, borderRadius: 2 }} />}
      {/* Snackbar-style alert */}
      <Collapse in={!!snackMessage.text}>
        <Alert
          severity={snackMessage.severity}
          sx={{ mb: 2, borderRadius: 2 }}
          onClose={() => setSnackMessage({ text: '', severity: 'success' })}
        >
          {snackMessage.text}
        </Alert>
      </Collapse>
      <BentoCard
        icon={AdminPanelSettingsOutlinedIcon}
        title="Permissions"
        subtitle={`${roles.length} roles · ${users.length} users`}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* Stat cards - inside block, Partners-style design system */}
        <Collapse in={showMetrics}>
          <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
            <Box
              sx={{
                mb: 2,
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(3, minmax(0, 1fr))',
                  lg: 'repeat(6, minmax(0, 1fr))',
                },
              }}
            >
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Paper
                    key={card.label}
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(card.color, 0.22),
                      background: `linear-gradient(135deg, ${alpha(card.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontWeight: 600 }}
                        >
                          {card.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.35rem',
                            fontWeight: 800,
                            color: 'text.primary',
                            lineHeight: 1.15,
                            mt: 0.45,
                          }}
                        >
                          {card.value}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                        >
                          {card.helper}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: 2,
                          bgcolor: alpha(card.color, 0.16),
                          color: card.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        </Collapse>

        {/* Tabs - same pill design as Workflow */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, pb: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              bgcolor: alpha(theme.palette.text.primary, 0.04),
              p: 0.5,
              borderRadius: 3,
              width: { xs: '100%', md: 'auto' },
            }}
          >
            {[
              { id: 0, label: 'Roles', icon: ShieldOutlinedIcon, count: roles.length },
              { id: 1, label: 'Users', icon: GroupsOutlinedIcon, count: users.length },
              { id: 2, label: 'Log', icon: HistoryIcon },
            ].map((tab) => (
              <Button
                key={tab.id}
                startIcon={<AppIcon fallback={tab.icon} sx={{ fontSize: 18 }} />}
                onClick={() => setActiveTab(tab.id)}
                fullWidth={isMobile}
                sx={{
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  px: 2,
                  minHeight: 36,
                  transition: 'all 0.2s',
                  bgcolor:
                    activeTab === tab.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                  color: activeTab === tab.id ? 'primary.main' : 'text.secondary',
                  boxShadow:
                    activeTab === tab.id
                      ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                      : 'none',
                  '&:hover': {
                    bgcolor:
                      activeTab === tab.id
                        ? alpha(theme.palette.primary.main, 0.15)
                        : alpha(theme.palette.text.primary, 0.05),
                    color: activeTab === tab.id ? 'primary.main' : 'text.primary',
                  },
                }}
              >
                {tab.label}
                {tab.count != null && (
                  <Chip
                    label={tab.count}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      ml: 0.75,
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                )}
              </Button>
            ))}
          </Box>
        </Box>

        {/* ------- ROLES TAB ------- */}
        {activeTab === 0 && (
          <Box sx={{ p: 2.5 }}>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 1.5,
                mb: 2,
                width: '100%',
              }}
            >
              <Box
                sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}
              >
                <Button
                  variant="outlined"
                  color="primary"
                  size="small"
                  startIcon={<AppIcon name="AddOutlined" fallback={AddOutlinedIcon} />}
                  onClick={openCreateRole}
                  sx={{
                    borderRadius: 3,
                    height: 36,
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 2,
                    borderWidth: 2,
                    flexShrink: 0,
                    '&:hover': { borderWidth: 2 },
                  }}
                >
                  Create Role
                </Button>
              </Box>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Role Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">
                      Access Level
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Updated</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRoles.map((role) => {
                    const epages = countEnabledPages(role.pages);
                    const { total: tBlocks, enabled: eBlocks } = countEnabledBlocks(role.pages);
                    const pct = tBlocks > 0 ? Math.round((eBlocks / tBlocks) * 100) : 0;
                    return (
                      <TableRow key={role.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1.5}>
                            <Box
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                bgcolor: role.color || defaultRoleColor,
                                flexShrink: 0,
                              }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {role.name}
                            </Typography>
                            {role.builtIn && (
                              <Chip
                                label="Built-in"
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.65rem' }}
                              />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {role.description}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Stack alignItems="center" spacing={0.5}>
                            <Chip
                              icon={
                                pct === 100 ? (
                                  <AppIcon
                                    name="LockOpen"
                                    fallback={LockOpenIcon}
                                    sx={{ fontSize: 14 }}
                                  />
                                ) : pct === 0 ? (
                                  <AppIcon name="Lock" fallback={LockIcon} sx={{ fontSize: 14 }} />
                                ) : undefined
                              }
                              label={`${epages}/${PAGE_DEFINITIONS.length} pages · ${pct}%`}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.68rem',
                                bgcolor:
                                  pct === 100
                                    ? alpha(theme.palette.success.main, 0.12)
                                    : pct === 0
                                      ? alpha(theme.palette.error.main, 0.12)
                                      : alpha(role.color || defaultRoleColor, 0.12),
                                color:
                                  pct === 100
                                    ? theme.palette.success.main
                                    : pct === 0
                                      ? theme.palette.error.main
                                      : role.color || defaultRoleColor,
                              }}
                            />
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              sx={{
                                width: 60,
                                height: 4,
                                borderRadius: 2,
                                bgcolor: alpha(role.color || defaultRoleColor, 0.1),
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: role.color || defaultRoleColor,
                                  borderRadius: 2,
                                },
                              }}
                            />
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {timeAgo(role.createdAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {timeAgo(role.updatedAt)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit permissions">
                            <IconButton size="small" onClick={() => openEditRole(role)}>
                              <AppIcon
                                name="EditOutlined"
                                fallback={EditOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Duplicate">
                            <IconButton size="small" onClick={() => handleDuplicateRole(role.id)}>
                              <AppIcon
                                name="ContentCopy"
                                fallback={ContentCopyIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                          {role.deletable && (
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteRoleConfirm(role)}
                              >
                                <AppIcon
                                  name="DeleteOutline"
                                  fallback={DeleteOutlineIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredRoles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          No roles found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ------- USERS TAB ------- */}
        {activeTab === 1 && (
          <Box sx={{ p: 2.5 }}>
            {isSupabaseEnabled && users.length <= 1 && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                User list is limited in client-only Supabase mode. You can see the current account,
                but listing all auth users requires a secure backend admin endpoint with a service
                role key.
              </Alert>
            )}
            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
              {/* On mobile: filter icon opens popover with search, role, status, download */}
              {isMobile ? (
                <>
                  <Tooltip title="Filters & export">
                    <IconButton
                      onClick={(e) => setUsersFilterAnchorEl(e.currentTarget)}
                      sx={{
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                        '&:hover': {
                          bgcolor: alpha(theme.palette.primary.main, 0.06),
                          borderColor: 'primary.main',
                        },
                      }}
                      aria-label="Filters"
                    >
                      <AppIcon
                        name="Tune"
                        fallback={TuneIcon}
                        sx={{ fontSize: 20, color: 'text.secondary' }}
                      />
                    </IconButton>
                  </Tooltip>
                  <Popover
                    open={Boolean(usersFilterAnchorEl)}
                    anchorEl={usersFilterAnchorEl}
                    onClose={() => setUsersFilterAnchorEl(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                    slotProps={{
                      paper: {
                        sx: {
                          mt: 1.5,
                          p: 2,
                          borderRadius: 3,
                          minWidth: 300,
                          maxWidth: 360,
                          boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
                        },
                      },
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                      Search & filters
                    </Typography>
                    <TextField
                      size="small"
                      placeholder="Search by name or email…"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      fullWidth
                      sx={{ mb: 1.5 }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <AppIcon
                              name="Search"
                              fallback={SearchIcon}
                              sx={{ fontSize: 18, color: 'text.secondary' }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                      <InputLabel>Role</InputLabel>
                      <Select
                        value={userRoleFilter}
                        onChange={(e) => setUserRoleFilter(e.target.value)}
                        label="Role"
                      >
                        <MenuItem value="all">All Roles</MenuItem>
                        {roles.map((r) => (
                          <MenuItem key={r.id} value={r.id}>
                            {r.name}
                          </MenuItem>
                        ))}
                        <MenuItem value="__unassigned__">Unassigned</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                      <InputLabel>Status</InputLabel>
                      <Select
                        value={userStatusFilter}
                        onChange={(e) => setUserStatusFilter(e.target.value)}
                        label="Status"
                      >
                        <MenuItem value="all">All Status</MenuItem>
                        <MenuItem value="active">Active</MenuItem>
                        <MenuItem value="blocked">Blocked</MenuItem>
                        <MenuItem value="invited">Invited</MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      size="small"
                      fullWidth
                      startIcon={<AppIcon name="Download" fallback={DownloadIcon} />}
                      onClick={() => {
                        exportUsersCSV();
                        setUsersFilterAnchorEl(null);
                      }}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Export CSV
                    </Button>
                  </Popover>
                </>
              ) : (
                <>
                  <TextField
                    size="small"
                    placeholder="Search by name or email…"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <AppIcon
                            name="Search"
                            fallback={SearchIcon}
                            sx={{ fontSize: 18, color: 'text.secondary' }}
                          />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ minWidth: 220, flex: 1, maxWidth: 340 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Role</InputLabel>
                    <Select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                      label="Role"
                    >
                      <MenuItem value="all">All Roles</MenuItem>
                      {roles.map((r) => (
                        <MenuItem key={r.id} value={r.id}>
                          {r.name}
                        </MenuItem>
                      ))}
                      <MenuItem value="__unassigned__">Unassigned</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                      label="Status"
                    >
                      <MenuItem value="all">All Status</MenuItem>
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="blocked">Blocked</MenuItem>
                      <MenuItem value="invited">Invited</MenuItem>
                    </Select>
                  </FormControl>
                  <Tooltip title="Export CSV">
                    <IconButton onClick={exportUsersCSV} size="small">
                      <AppIcon name="Download" fallback={DownloadIcon} sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              <Box sx={{ flex: 1 }} />
              {selectedUsers.length > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AppIcon name="MoreVert" fallback={MoreVertIcon} />}
                  onClick={(e) => setBulkMenuAnchor(e.currentTarget)}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  Bulk ({selectedUsers.length})
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<AppIcon name="PersonAddOutlined" fallback={PersonAddOutlinedIcon} />}
                onClick={() => {
                  setInviteDialogOpen(true);
                  setInviteError('');
                  setInviteForm({
                    email: '',
                    password: '',
                    confirmPassword: '',
                    roleId: 'role-viewer',
                    linkedPartnerId: '',
                  });
                  setInviteShowPassword(false);
                }}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
              >
                Create User
              </Button>
            </Stack>

            {/* Users table */}
            {users.length === 0 ? (
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  textAlign: 'center',
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <AppIcon
                  name="GroupsOutlined"
                  fallback={GroupsOutlinedIcon}
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
                />
                <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 700 }}>
                  No users found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Users will appear here once they register or are invited to the platform.
                </Typography>
              </Paper>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={
                            selectedUsers.length === filteredUsers.length &&
                            filteredUsers.length > 0
                          }
                          indeterminate={
                            selectedUsers.length > 0 && selectedUsers.length < filteredUsers.length
                          }
                          onChange={toggleSelectAll}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">
                        Status
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Last Login</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">
                        2FA
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">
                        Provider
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">
                        Login As
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredUsers.map((user) => {
                      const roleColor = getRoleBadgeColor(user.roleId);
                      const statusCfg = STATUS_CONFIG[user.status] || STATUS_CONFIG.active;
                      return (
                        <TableRow
                          key={user.id}
                          hover
                          selected={selectedUsers.includes(user.id)}
                          sx={{ '&:last-child td': { borderBottom: 0 } }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={selectedUsers.includes(user.id)}
                              onChange={() => toggleSelectUser(user.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={1.5}>
                              <Avatar
                                src={user.avatar || undefined}
                                sx={{
                                  width: 32,
                                  height: 32,
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  bgcolor: alpha(roleColor, 0.15),
                                  color: roleColor,
                                }}
                              >
                                {getInitials(user.name)}
                              </Avatar>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {user.name}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {user.email}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={getRoleName(user.roleId)}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                bgcolor: user.roleId
                                  ? alpha(roleColor, 0.12)
                                  : alpha(theme.palette.warning.main, 0.12),
                                color: user.roleId ? roleColor : theme.palette.warning.main,
                                fontSize: '0.7rem',
                              }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={statusCfg.label}
                              size="small"
                              color={statusCfg.color}
                              variant="outlined"
                              sx={{ fontWeight: 700, fontSize: '0.68rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {timeAgo(user.lastLogin)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            {user.twoFaEnabled ? (
                              <Tooltip title="2FA enabled">
                                <AppIcon
                                  name="VerifiedUser"
                                  fallback={VerifiedUserIcon}
                                  sx={{ fontSize: 18, color: 'success.main' }}
                                />
                              </Tooltip>
                            ) : (
                              <Tooltip title="No 2FA">
                                <AppIcon
                                  name="GppBad"
                                  fallback={GppBadIcon}
                                  sx={{ fontSize: 18, color: 'text.disabled' }}
                                />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={user.provider || 'email'}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', fontWeight: 600, height: 20 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            {currentUser?.email?.toLowerCase() === user.email?.toLowerCase() ? (
                              <Chip
                                label="Current"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ fontSize: '0.65rem', fontWeight: 700, height: 22 }}
                              />
                            ) : user.status === 'blocked' ? (
                              <Tooltip title="Cannot login as blocked user">
                                <span>
                                  <IconButton size="small" disabled>
                                    <AppIcon
                                      name="Login"
                                      fallback={LoginIcon}
                                      sx={{ fontSize: 17, color: 'text.disabled' }}
                                    />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            ) : isSupabaseEnabled ? (
                              <Tooltip title="Login As is available only in local auth mode">
                                <span>
                                  <IconButton size="small" disabled>
                                    <AppIcon
                                      name="Login"
                                      fallback={LoginIcon}
                                      sx={{ fontSize: 17, color: 'text.disabled' }}
                                    />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            ) : (
                              <Tooltip title={`Login as ${user.name}`}>
                                <IconButton
                                  size="small"
                                  color="info"
                                  onClick={() => setLoginAsConfirm(user)}
                                  disabled={!!loginAsLoading}
                                >
                                  {loginAsLoading === user.id ? (
                                    <CircularProgress size={16} />
                                  ) : (
                                    <AppIcon
                                      name="Login"
                                      fallback={LoginIcon}
                                      sx={{ fontSize: 17 }}
                                    />
                                  )}
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Edit role">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setEditUserRoleDialog(user);
                                  setEditUserRoleValue(user.roleId || 'role-viewer');
                                  setEditLinkedPartnerId(
                                    user.roleId === 'role-partner'
                                      ? getLinkedPartnerIdForUser(user.id) || ''
                                      : ''
                                  );
                                }}
                              >
                                <AppIcon
                                  name="ShieldOutlined"
                                  fallback={ShieldOutlinedIcon}
                                  sx={{ fontSize: 17 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Resend password">
                              <IconButton
                                size="small"
                                onClick={() => handleResendPassword(user.id)}
                              >
                                <AppIcon
                                  name="LockReset"
                                  fallback={LockResetIcon}
                                  sx={{ fontSize: 17 }}
                                />
                              </IconButton>
                            </Tooltip>
                            {user.twoFaEnabled && (
                              <Tooltip title="Disable 2FA">
                                <IconButton size="small" onClick={() => handleDisable2FA(user.id)}>
                                  <AppIcon
                                    name="NoEncryptionOutlined"
                                    fallback={NoEncryptionOutlinedIcon}
                                    sx={{ fontSize: 17 }}
                                  />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title={user.status === 'blocked' ? 'Unblock' : 'Block'}>
                              <IconButton
                                size="small"
                                color={user.status === 'blocked' ? 'success' : 'warning'}
                                onClick={() => handleBlockUser(user.id)}
                              >
                                <AppIcon name="Block" fallback={BlockIcon} sx={{ fontSize: 17 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteUserConfirm(user)}
                              >
                                <AppIcon
                                  name="DeleteOutline"
                                  fallback={DeleteOutlineIcon}
                                  sx={{ fontSize: 17 }}
                                />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredUsers.length === 0 && users.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                          <Typography variant="body2" color="text.secondary">
                            No users match your filters
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* ------- ACTION LOG TAB ------- */}
        {activeTab === 2 && <PermissionsActionLogTab />}
      </BentoCard>
      {/* ============================================================ */}
      {/* DIALOGS                                                      */}
      {/* ============================================================ */}
      {/* ---- Create / Edit Role Dialog ---- */}
      <FormDialog
        open={roleDialogOpen}
        onClose={() => setRoleDialogOpen(false)}
        title={editingRole ? `Edit Role: ${editingRole.name}` : 'Create New Role'}
        icon={ShieldOutlinedIcon}
        maxWidth="md"
        primaryLabel={actionLoading ? 'Saving…' : editingRole ? 'Save Changes' : 'Create Role'}
        onPrimary={handleSaveRole}
        primaryDisabled={!roleForm.name.trim() || actionLoading}
        primaryLoading={actionLoading}
      >
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Template picker (create mode only) */}
          {!editingRole && (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Start from template (optional)
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
                {ROLE_TEMPLATES.map((tpl) => {
                  const IconComp = TEMPLATE_ICONS[tpl.icon] || PersonOutlinedIcon;
                  const isActive = selectedTemplate === tpl.id;
                  return (
                    <Paper
                      key={tpl.id}
                      elevation={0}
                      onClick={() => handleSelectTemplate(tpl)}
                      sx={{
                        p: 1.5,
                        minWidth: 120,
                        maxWidth: 150,
                        cursor: 'pointer',
                        borderRadius: 2,
                        border: '2px solid',
                        borderColor: isActive ? tpl.color : 'divider',
                        bgcolor: isActive ? alpha(tpl.color, 0.08) : 'transparent',
                        transition: 'all 0.15s',
                        '&:hover': { borderColor: tpl.color, bgcolor: alpha(tpl.color, 0.04) },
                        textAlign: 'center',
                      }}
                    >
                      <AppIcon
                        fallback={IconComp}
                        sx={{ fontSize: 28, color: tpl.color, mb: 0.5 }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
                        {tpl.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: 10,
                          lineHeight: 1.2,
                          display: 'block',
                          mt: 0.5,
                        }}
                      >
                        {tpl.description}
                      </Typography>
                    </Paper>
                  );
                })}
              </Stack>
              <Divider sx={{ mt: 2 }} />
            </Box>
          )}

          {/* Name & description */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Role Name"
              value={roleForm.name}
              onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))}
              fullWidth
              required
              size="small"
            />
            <TextField
              label="Description"
              value={roleForm.description}
              onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))}
              fullWidth
              size="small"
            />
          </Stack>

          {/* Color picker */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
              Badge Color:
            </Typography>
            {[
              defaultRoleColor,
              '#D32F2F',
              '#1976D2',
              '#757575',
              '#0EA5E9',
              '#10B981',
              '#F59E0B',
              '#EC4899',
            ].map((c) => (
              <Box
                key={c}
                onClick={() => setRoleForm((p) => ({ ...p, color: c }))}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: c,
                  cursor: 'pointer',
                  border: roleForm.color === c ? '3px solid' : '2px solid transparent',
                  borderColor: roleForm.color === c ? 'text.primary' : 'transparent',
                  transition: 'transform 0.15s',
                  '&:hover': { transform: 'scale(1.15)' },
                }}
              />
            ))}
          </Stack>

          <Divider />

          {/* Permission summary bar */}
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: isDark
                ? alpha(roleForm.color || defaultRoleColor, 0.04)
                : alpha(roleForm.color || defaultRoleColor, 0.02),
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Access Summary:
                </Typography>
                <Chip
                  icon={
                    permSummary.percent === 100 ? (
                      <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 14 }} />
                    ) : permSummary.percent === 0 ? (
                      <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 14 }} />
                    ) : undefined
                  }
                  label={`${permSummary.enabledPages}/${permSummary.totalPages} pages`}
                  size="small"
                  sx={{ fontWeight: 700, fontSize: '0.72rem' }}
                  color={
                    permSummary.percent === 100
                      ? 'success'
                      : permSummary.percent === 0
                        ? 'error'
                        : 'default'
                  }
                  variant="outlined"
                />
                <Chip
                  label={`${permSummary.enabledBlocks}/${permSummary.totalBlocks} blocks (${permSummary.percent}%)`}
                  size="small"
                  sx={{ fontWeight: 700, fontSize: '0.72rem' }}
                  variant="outlined"
                />
              </Stack>
              <LinearProgress
                variant="determinate"
                value={permSummary.percent}
                sx={{
                  width: 100,
                  height: 6,
                  borderRadius: 3,
                  bgcolor: alpha(roleForm.color || defaultRoleColor, 0.1),
                  '& .MuiLinearProgress-bar': {
                    bgcolor: roleForm.color || defaultRoleColor,
                    borderRadius: 3,
                  },
                }}
              />
            </Stack>
          </Paper>

          {/* Page access - Grant / Deny */}
          <Box>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1.5 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Grant or Deny Access
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant={allPagesEnabled ? 'contained' : 'outlined'}
                  color="success"
                  startIcon={<AppIcon name="LockOpen" fallback={LockOpenIcon} />}
                  onClick={() => toggleAllPages(true)}
                  disabled={allPagesEnabled}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    borderRadius: 2,
                  }}
                >
                  Grant All
                </Button>
                <Button
                  size="small"
                  variant={noPagesEnabled ? 'contained' : 'outlined'}
                  color="error"
                  startIcon={<AppIcon name="Lock" fallback={LockIcon} />}
                  onClick={() => toggleAllPages(false)}
                  disabled={noPagesEnabled}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    borderRadius: 2,
                  }}
                >
                  Deny All
                </Button>
              </Stack>
            </Stack>

            {PAGE_DEFINITIONS.map((pageDef) => {
              const pageState = roleForm.pages[pageDef.id] || { enabled: false, blocks: {} };
              const isExpanded = expandedPages[pageDef.id] || false;
              const enabledBlocks = pageDef.blocks.filter((b) => pageState.blocks?.[b.id]).length;
              const isGranted = !!pageState.enabled;

              return (
                <Paper
                  key={pageDef.id}
                  elevation={0}
                  sx={{
                    mb: 1,
                    border: '1px solid',
                    borderColor: isGranted
                      ? alpha(theme.palette.success.main, 0.4)
                      : alpha(theme.palette.error.main, 0.2),
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: isGranted
                      ? isDark
                        ? alpha(theme.palette.success.main, 0.04)
                        : alpha(theme.palette.success.main, 0.02)
                      : isDark
                        ? alpha(theme.palette.error.main, 0.02)
                        : 'transparent',
                    transition: 'border-color 0.2s, background-color 0.2s',
                  }}
                >
                  <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1 }}>
                    {/* Grant/Deny toggle */}
                    <Tooltip
                      title={
                        isGranted
                          ? 'Access Granted - click to deny'
                          : 'Access Denied - click to grant'
                      }
                    >
                      <Switch
                        size="small"
                        checked={isGranted}
                        onChange={() => togglePageAccess(pageDef.id)}
                        color="success"
                      />
                    </Tooltip>
                    <Box sx={{ ml: 1, flex: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, opacity: isGranted ? 1 : 0.5 }}
                      >
                        {pageDef.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: isGranted ? 'success.main' : 'error.main', fontWeight: 600 }}
                      >
                        {isGranted ? 'Access Granted' : 'Access Denied'}
                      </Typography>
                    </Box>
                    {isGranted && (
                      <>
                        <Chip
                          icon={
                            enabledBlocks === pageDef.blocks.length ? (
                              <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 12 }} />
                            ) : undefined
                          }
                          label={`${enabledBlocks}/${pageDef.blocks.length} blocks`}
                          size="small"
                          sx={{
                            mr: 1,
                            height: 22,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            bgcolor:
                              enabledBlocks === pageDef.blocks.length
                                ? alpha(theme.palette.success.main, 0.1)
                                : alpha(theme.palette.warning.main, 0.1),
                            color:
                              enabledBlocks === pageDef.blocks.length
                                ? theme.palette.success.main
                                : theme.palette.warning.main,
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={() =>
                            setExpandedPages((prev) => ({
                              ...prev,
                              [pageDef.id]: !prev[pageDef.id],
                            }))
                          }
                        >
                          {isExpanded ? (
                            <AppIcon
                              name="ExpandLess"
                              fallback={ExpandLessIcon}
                              sx={{ fontSize: 18 }}
                            />
                          ) : (
                            <AppIcon
                              name="ExpandMore"
                              fallback={ExpandMoreIcon}
                              sx={{ fontSize: 18 }}
                            />
                          )}
                        </IconButton>
                      </>
                    )}
                  </Stack>
                  <Collapse in={isGranted && isExpanded}>
                    <Divider />
                    <Box sx={{ px: 2, py: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {pageDef.blocks.map((block) => {
                        const granted = !!pageState.blocks?.[block.id];
                        return (
                          <FormControlLabel
                            key={block.id}
                            control={
                              <Checkbox
                                size="small"
                                checked={granted}
                                onChange={() => toggleBlockAccess(pageDef.id, block.id)}
                                color="success"
                              />
                            }
                            label={
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 600,
                                  color: granted ? 'text.primary' : 'text.disabled',
                                  textDecoration: granted ? 'none' : 'line-through',
                                }}
                              >
                                {block.label}
                              </Typography>
                            }
                            sx={{ mr: 2, '& .MuiCheckbox-root': { p: 0.5 } }}
                          />
                        );
                      })}
                    </Box>
                  </Collapse>
                </Paper>
              );
            })}
          </Box>
        </Stack>
      </FormDialog>
      {/* ---- Delete Role Confirmation ---- */}
      <FormDialog
        open={!!deleteRoleConfirm}
        onClose={() => setDeleteRoleConfirm(null)}
        title="Delete Role"
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        contentDividers={false}
        primaryLabel={actionLoading ? 'Deleting…' : 'Delete Role'}
        onPrimary={handleDeleteRole}
        primaryDisabled={actionLoading}
        primaryLoading={actionLoading}
      >
        <Typography>
          Are you sure you want to delete the role <strong>{deleteRoleConfirm?.name}</strong>? Users
          with this role will need to be reassigned.
        </Typography>
      </FormDialog>
      {/* ---- Create User Dialog ---- */}
      <FormDialog
        open={inviteDialogOpen}
        onClose={() => {
          setInviteDialogOpen(false);
          setInviteError('');
        }}
        title="Create New User"
        icon={PersonAddOutlinedIcon}
        maxWidth="sm"
        primaryLabel={
          actionLoading
            ? 'Saving…'
            : isSupabaseEnabled && !inviteForm.password
              ? 'Send Invitation'
              : 'Create User'
        }
        onPrimary={handleInviteUser}
        primaryDisabled={
          !inviteForm.email.trim() ||
          (inviteForm.roleId === 'role-partner' && !inviteForm.linkedPartnerId) ||
          (!isSupabaseEnabled &&
            (!inviteForm.password ||
              !inviteForm.confirmPassword ||
              inviteForm.password !== inviteForm.confirmPassword)) ||
          // Supabase mode: a blank password is valid (invite email). A typed one
          // must still be long enough and match.
          (isSupabaseEnabled &&
            !!inviteForm.password &&
            (inviteForm.password.length < 8 ||
              inviteForm.password !== inviteForm.confirmPassword)) ||
          actionLoading
        }
        primaryLoading={actionLoading}
      >
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {inviteError && (
            <Alert
              severity="error"
              sx={{ borderRadius: 2, whiteSpace: 'pre-line' }}
              onClose={() => setInviteError('')}
            >
              {inviteError}
            </Alert>
          )}

          <TextField
            label="Email Address"
            value={inviteForm.email}
            onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
            fullWidth
            required
            size="small"
            type="email"
            autoFocus
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="EmailOutlined"
                    fallback={EmailOutlinedIcon}
                    sx={{ color: 'text.secondary', fontSize: 20 }}
                  />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label={isSupabaseEnabled ? 'Password (optional)' : 'Password'}
            value={inviteForm.password}
            onChange={(e) => setInviteForm((p) => ({ ...p, password: e.target.value }))}
            fullWidth
            required={!isSupabaseEnabled}
            size="small"
            type={inviteShowPassword ? 'text' : 'password'}
            error={!!inviteForm.password && inviteForm.password.length < 8}
            helperText={
              !isSupabaseEnabled
                ? 'Min 10 chars, uppercase, lowercase, number & symbol'
                : inviteForm.password
                  ? inviteForm.password.length < 8
                    ? 'Password must be at least 8 characters.'
                    : 'User can sign in immediately with this password. Share it securely.'
                  : 'Leave blank to email an invitation. Set a password to create the user immediately.'
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="LockOutlined"
                    fallback={LockOutlinedIcon}
                    sx={{ color: 'text.secondary', fontSize: 20 }}
                  />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Generate secure password">
                    <IconButton
                      size="small"
                      onClick={() => {
                        const pwd = generateSecurePassword();
                        setInviteForm((p) => ({ ...p, password: pwd, confirmPassword: pwd }));
                        setInviteShowPassword(true);
                      }}
                      sx={{ mr: 0.25 }}
                    >
                      <AppIcon name="Autorenew" fallback={AutorenewIcon} sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                  <IconButton
                    size="small"
                    onClick={() => setInviteShowPassword((p) => !p)}
                    edge="end"
                  >
                    {inviteShowPassword ? (
                      <AppIcon
                        name="VisibilityOff"
                        fallback={VisibilityOffIcon}
                        sx={{ fontSize: 20 }}
                      />
                    ) : (
                      <AppIcon name="Visibility" fallback={VisibilityIcon} sx={{ fontSize: 20 }} />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* Nothing to confirm when the password is blank and Supabase will
              send an invitation email instead. */}
          {(!isSupabaseEnabled || !!inviteForm.password) && (
            <TextField
              label="Confirm Password"
              value={inviteForm.confirmPassword}
              onChange={(e) => setInviteForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              fullWidth
              required
              size="small"
              type={inviteShowPassword ? 'text' : 'password'}
              error={
                !!inviteForm.confirmPassword && inviteForm.confirmPassword !== inviteForm.password
              }
              helperText={
                inviteForm.confirmPassword && inviteForm.confirmPassword !== inviteForm.password
                  ? 'Passwords do not match'
                  : ''
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon
                      name="LockOutlined"
                      fallback={LockOutlinedIcon}
                      sx={{ color: 'text.secondary', fontSize: 20 }}
                    />
                  </InputAdornment>
                ),
              }}
            />
          )}

          <Divider />

          <FormControl size="small" fullWidth>
            <InputLabel>Assign Role</InputLabel>
            <Select
              value={inviteForm.roleId}
              onChange={(e) => setInviteForm((p) => ({ ...p, roleId: e.target.value }))}
              label="Assign Role"
            >
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: r.color }} />
                    <span>{r.name}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {inviteForm.roleId === 'role-partner' && (
            <FormControl size="small" fullWidth required>
              <InputLabel>Link to partner</InputLabel>
              <Select
                value={inviteForm.linkedPartnerId || ''}
                onChange={(e) => setInviteForm((p) => ({ ...p, linkedPartnerId: e.target.value }))}
                label="Link to partner"
              >
                <MenuItem value="">Select a partner</MenuItem>
                {partners.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name || p.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </FormDialog>
      {/* ---- Success / Congratulations Popup ---- */}
      {successPopup && (
        <FormDialog
          open={!!successPopup}
          onClose={() => setSuccessPopup(null)}
          title="User Created!"
          subtitle="The account has been created successfully. Share the credentials below with the user."
          icon={CelebrationOutlinedIcon}
          iconVariant="success"
          maxWidth="sm"
          contentDividers={false}
          contentSx={{ pt: 1, px: 3, pb: 3.5 }}
          actions={
            <>
              <Button
                variant="outlined"
                startIcon={
                  copiedField === 'all' ? (
                    <AppIcon name="Check" fallback={CheckIcon} />
                  ) : (
                    <AppIcon name="ContentCopy" fallback={ContentCopyIcon} />
                  )
                }
                onClick={() => handleCopyCredentials('all')}
                color={copiedField === 'all' ? 'success' : 'primary'}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}
              >
                {copiedField === 'all' ? 'Copied!' : 'Copy All Credentials'}
              </Button>
              <Button
                variant="contained"
                onClick={() => setSuccessPopup(null)}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}
              >
                Done
              </Button>
            </>
          }
        >
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: '1px solid',
              borderColor: alpha(theme.palette.success.main, 0.3),
              bgcolor: isDark
                ? alpha(theme.palette.success.main, 0.04)
                : alpha(theme.palette.success.main, 0.02),
            }}
          >
            <Stack spacing={2}>
              {/* Email row */}
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    letterSpacing: 1,
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Email
                </Typography>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {successPopup?.email}
                  </Typography>
                  <Tooltip title={copiedField === 'email' ? 'Copied!' : 'Copy email'}>
                    <IconButton
                      size="small"
                      onClick={() => handleCopyCredentials('email')}
                      color={copiedField === 'email' ? 'success' : 'default'}
                    >
                      {copiedField === 'email' ? (
                        <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 18 }} />
                      ) : (
                        <AppIcon
                          name="ContentCopy"
                          fallback={ContentCopyIcon}
                          sx={{ fontSize: 18 }}
                        />
                      )}
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>

              <Divider />

              {/* Password row */}
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    letterSpacing: 1,
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Password
                </Typography>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {successPopup?.password}
                  </Typography>
                  <Tooltip title={copiedField === 'password' ? 'Copied!' : 'Copy password'}>
                    <IconButton
                      size="small"
                      onClick={() => handleCopyCredentials('password')}
                      color={copiedField === 'password' ? 'success' : 'default'}
                    >
                      {copiedField === 'password' ? (
                        <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 18 }} />
                      ) : (
                        <AppIcon
                          name="ContentCopy"
                          fallback={ContentCopyIcon}
                          sx={{ fontSize: 18 }}
                        />
                      )}
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>

              <Divider />

              {/* Role row */}
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    letterSpacing: 1,
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Assigned Role
                </Typography>
                <Chip
                  label={successPopup?.roleName}
                  size="small"
                  sx={{ fontWeight: 700, fontSize: '0.78rem' }}
                  color="primary"
                />
              </Box>
            </Stack>
          </Paper>
        </FormDialog>
      )}
      {/* ---- Password reset link (manual copy) ---- */}
      <FormDialog
        open={!!resetLinkDialog}
        onClose={() => setResetLinkDialog(null)}
        title="Copy password reset link"
        icon={LockResetIcon}
        maxWidth="sm"
        contentDividers={false}
        actions={
          <>
            <Button
              variant="outlined"
              onClick={() => setResetLinkDialog(null)}
              sx={{ textTransform: 'none' }}
            >
              Close
            </Button>
            <Button
              variant="contained"
              startIcon={<AppIcon name="ContentCopy" fallback={ContentCopyIcon} />}
              onClick={handleCopyResetLink}
              sx={{ textTransform: 'none' }}
            >
              Copy reset link
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Email could not be sent. Copy the link below and share it with{' '}
          <strong>{resetLinkDialog?.email}</strong> so they can reset their password.
        </Typography>
        <TextField
          fullWidth
          size="small"
          value={resetLinkDialog?.link || ''}
          InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
          multiline
          minRows={2}
          sx={{ '& .MuiInputBase-root': { bgcolor: 'action.hover' } }}
        />
      </FormDialog>
      {/* ---- Edit User Role Dialog ---- */}
      <FormDialog
        open={!!editUserRoleDialog}
        onClose={() => setEditUserRoleDialog(null)}
        title={`Change Role for ${editUserRoleDialog?.name || ''}`}
        icon={ShieldOutlinedIcon}
        maxWidth="xs"
        primaryLabel={actionLoading ? 'Updating…' : 'Update Role'}
        onPrimary={handleEditUserRole}
        primaryDisabled={actionLoading}
        primaryLoading={actionLoading}
      >
        <FormControl fullWidth size="small" sx={{ mt: 1 }}>
          <InputLabel>Role</InputLabel>
          <Select
            value={editUserRoleValue}
            onChange={(e) => {
              setEditUserRoleValue(e.target.value);
              if (e.target.value !== 'role-partner') setEditLinkedPartnerId('');
            }}
            label="Role"
          >
            {roles.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.color }} />
                  <span>{r.name}</span>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {editUserRoleValue === 'role-partner' && (
          <FormControl fullWidth size="small" sx={{ mt: 2 }} required>
            <InputLabel>Link to partner</InputLabel>
            <Select
              value={editLinkedPartnerId || ''}
              onChange={(e) => setEditLinkedPartnerId(e.target.value)}
              label="Link to partner"
            >
              <MenuItem value="">Select a partner</MenuItem>
              {partners.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name || p.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </FormDialog>
      {/* ---- Delete User Confirmation ---- */}
      <FormDialog
        open={!!deleteUserConfirm}
        onClose={() => setDeleteUserConfirm(null)}
        title="Delete User"
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        contentDividers={false}
        primaryLabel={actionLoading ? 'Deleting…' : 'Delete User'}
        onPrimary={handleDeleteUser}
        primaryDisabled={actionLoading}
        primaryLoading={actionLoading}
      >
        <Typography>
          Are you sure you want to delete <strong>{deleteUserConfirm?.name}</strong> (
          {deleteUserConfirm?.email})? This action cannot be undone.
        </Typography>
      </FormDialog>
      {/* ---- Login As Confirmation ---- */}
      <FormDialog
        open={!!loginAsConfirm}
        onClose={() => setLoginAsConfirm(null)}
        title="Login As User"
        subtitle="You will be logged out of your current session and logged in as:"
        icon={LoginIcon}
        iconVariant="info"
        maxWidth="xs"
        contentDividers={false}
        actions={
          <>
            <Button onClick={() => setLoginAsConfirm(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="info"
              startIcon={
                loginAsLoading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AppIcon name="Login" fallback={LoginIcon} />
                )
              }
              onClick={() => handleLoginAs(loginAsConfirm)}
              disabled={!!loginAsLoading}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              {loginAsLoading ? 'Switching…' : 'Login As This User'}
            </Button>
          </>
        }
      >
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: isDark
              ? alpha(theme.palette.primary.main, 0.06)
              : alpha(theme.palette.primary.main, 0.03),
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar
              sx={{
                width: 40,
                height: 40,
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                color: theme.palette.primary.main,
                fontWeight: 700,
              }}
            >
              {getInitials(loginAsConfirm?.name)}
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {loginAsConfirm?.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {loginAsConfirm?.email}
              </Typography>
              {loginAsConfirm?.roleId && (
                <Chip
                  label={getRoleName(loginAsConfirm?.roleId)}
                  size="small"
                  sx={{ ml: 1, height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                />
              )}
            </Box>
          </Stack>
        </Paper>
      </FormDialog>
      {/* ---- Bulk Actions Menu ---- */}
      <Menu
        anchorEl={bulkMenuAnchor}
        open={Boolean(bulkMenuAnchor)}
        onClose={() => setBulkMenuAnchor(null)}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 200 } }}
      >
        <MenuItem
          onClick={() => {
            setBulkRoleDialog(true);
            setBulkMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            <AppIcon name="ShieldOutlined" fallback={ShieldOutlinedIcon} fontSize="small" />
          </ListItemIcon>
          <ListItemText>Assign Role</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleBulkBlock}>
          <ListItemIcon>
            <AppIcon name="Block" fallback={BlockIcon} fontSize="small" />
          </ListItemIcon>
          <ListItemText>Block Selected</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleBulkDelete} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <AppIcon
              name="DeleteOutline"
              fallback={DeleteOutlineIcon}
              fontSize="small"
              color="error"
            />
          </ListItemIcon>
          <ListItemText>Delete Selected</ListItemText>
        </MenuItem>
      </Menu>
      {/* ---- Bulk Assign Role Dialog ---- */}
      <FormDialog
        open={bulkRoleDialog}
        onClose={() => setBulkRoleDialog(false)}
        title={`Assign Role to ${selectedUsers.length} Users`}
        icon={GroupsOutlinedIcon}
        maxWidth="xs"
        primaryLabel={actionLoading ? 'Assigning…' : 'Assign Role'}
        onPrimary={handleBulkAssignRole}
        primaryDisabled={!bulkRoleValue || actionLoading}
        primaryLoading={actionLoading}
      >
        <FormControl fullWidth size="small" sx={{ mt: 1 }}>
          <InputLabel>Role</InputLabel>
          <Select
            value={bulkRoleValue}
            onChange={(e) => setBulkRoleValue(e.target.value)}
            label="Role"
          >
            {roles.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.color }} />
                  <span>{r.name}</span>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FormDialog>
    </PageLayout>
  );
}
