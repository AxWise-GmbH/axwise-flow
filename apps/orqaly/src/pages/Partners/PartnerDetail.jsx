import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  IconButton,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Stack,
  Divider,
  MenuItem,
  Grid,
  Card,
  CardContent,
  useTheme,
  alpha,
  Popover,
  Select,
  FormControl,
  InputLabel,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Badge,
  Tabs,
  Tab,
  Autocomplete,
  Tooltip as MuiTooltip,
  FormLabel,
  RadioGroup,
  Radio,
  CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/DownloadOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import generatePartnerReport from './../../utils/generatePartnerReport';
import {
  ResponsiveContainer,
  BarChart,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { partnerService } from '../../services/partnerService';
import { logChange as logPartnerChange } from '../../services/partnerHistoryService';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import FormDialog from '../../components/Common/FormDialog';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import FunnelStatusBadge from './components/FunnelStatusBadge';
import MaterialDialog from './components/UploadMaterialDialog';
import MeetingsSection from '../Meetings/components/MeetingsSection';
import MeetingActionsBlock from '../Meetings/components/MeetingActionsBlock';
import HistoryBlock from './components/HistoryBlock';
import AddPaymentDialog from './components/AddPaymentDialog';
import { useMeetings } from '../../hooks/useMeetings';
import { useTaskManager } from '../../context/TaskManagerContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import {
  AGREEMENT_COLORS,
  COUNTRY_FLAGS,
  AGREEMENT_TYPES,
  FUNNEL_STATUSES,
  GROUP_TYPES,
  GROUP_SUBTYPES,
  TRAFFIC_SOURCES,
  TASK_STATUS_LABELS,
  PRIORITY_COLORS,
} from '../../utils/constants';
import { formatCurrency, formatPercent, formatDate } from '../../utils/formatters';
import PriorityBarsIcon from '../../components/Common/PriorityBarsIcon';
import { maybeNotify } from '../../services/emailNotificationDispatcher';

import AppIcon from '../../components/icons/AppIcon';

function SectionHeader({ title, subtitle, action }) {
  return (
    <Box
      sx={{
        mb: 2.5,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 1.5,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'text.primary' }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              fontSize: '0.85rem',
              mt: 0.4,
              display: { xs: 'none', sm: 'block' },
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  );
}

function KeyValueItem({ label, value, color, fullWidth = false, icon }) {
  return (
    <Box sx={{ width: fullWidth ? '100%' : 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        {icon && (
          <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>{icon}</Box>
        )}
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 700,
            fontSize: '0.7rem',
          }}
        >
          {label}
        </Typography>
      </Box>
      <Box sx={{ minHeight: 24, display: 'flex', alignItems: 'center' }}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: color || 'text.primary', fontSize: '0.98rem' }}
          >
            {value}
          </Typography>
        ) : (
          value
        )}
      </Box>
    </Box>
  );
}

// ... (helper functions remain the same)
const getCampaignClicks = (campaign) => {
  if (typeof campaign.clicks === 'number') return campaign.clicks;
  if (campaign.cr > 0) return Math.round(campaign.ftd / (campaign.cr / 100));
  return 0;
};

const getPartnerClicksTotal = (partner) =>
  (partner.campaigns || []).reduce((sum, campaign) => sum + getCampaignClicks(campaign), 0);

const getFinanceSummary = (partner) => {
  return {
    total: Number(partner.finance?.total || 0),
    paid: Number(partner.finance?.paid || 0),
    debt: Number(partner.finance?.debt || 0),
  };
};

const shortName = (name = '') => (name.length > 14 ? `${name.slice(0, 14)}...` : name);
const renderAngledCampaignTick = ({ x, y, payload }) => {
  const fullName = String(payload?.value || '');
  const label = shortName(fullName);
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{fullName}</title>
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="end"
        fill="#64748B"
        fontSize={11}
        transform="rotate(-28)"
      >
        {label}
      </text>
    </g>
  );
};
const formatDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (num) => String(num).padStart(2, '0');
  return `${formatDate(date.toISOString())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatPaymentDateTime = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatMonthYear = (date = new Date()) =>
  `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

const parseMonthYear = (value) => {
  const match = String(value || '')
    .trim()
    .match(/^(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return {
    month,
    year,
    key: `${year}-${String(month).padStart(2, '0')}`,
    label: `${String(month).padStart(2, '0')}/${year}`,
  };
};

const hashString = (input = '') => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const NETWORKS = ['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'];
const getCampaignNetwork = (campaign) => {
  if (campaign.affiliateNetwork) return campaign.affiliateNetwork;
  const idStr = String(campaign.id || campaign.name || '');
  const index = hashString(idStr) % NETWORKS.length;
  return NETWORKS[index];
};

const materialMatchesNetwork = (material, network) => {
  if (network === 'All') return true;
  const nets =
    material.affiliateNetworks || (material.affiliateNetwork ? [material.affiliateNetwork] : []);
  if (nets.length > 0) {
    return nets.includes(network);
  }
  const idStr = String(material.id || material.name || '');
  const fallbackIndex = hashString(idStr) % NETWORKS.length;
  return NETWORKS[fallbackIndex] === network;
};

const monthsDiffFromNow = (year, month) => {
  const now = new Date();
  return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
};

const getCampaignMetricsForPeriod = (campaign, period) => {
  const yyyymm = period.key;
  const monthYear = period.label;

  if (Array.isArray(campaign.monthlyStats)) {
    const exact = campaign.monthlyStats.find(
      (m) =>
        m?.period === yyyymm || m?.month === yyyymm || m?.month === monthYear || m?.key === yyyymm
    );
    if (exact) {
      const ftd = Number(exact.ftd ?? campaign.ftd ?? 0);
      const clicks = Number(exact.clicks ?? getCampaignClicks(campaign));
      const cr = Number(exact.cr ?? campaign.cr ?? 0);
      return { ftd, clicks, cr };
    }
  }

  if (campaign.metricsByMonth && typeof campaign.metricsByMonth === 'object') {
    const exact = campaign.metricsByMonth[yyyymm] || campaign.metricsByMonth[monthYear];
    if (exact) {
      const ftd = Number(exact.ftd ?? campaign.ftd ?? 0);
      const clicks = Number(exact.clicks ?? getCampaignClicks(campaign));
      const cr = Number(exact.cr ?? campaign.cr ?? 0);
      return { ftd, clicks, cr };
    }
  }

  const baseFtd = Number(campaign.ftd || 0);
  const baseClicks = Number(getCampaignClicks(campaign));
  const baseCr = Number(campaign.cr || 0);
  const diff = monthsDiffFromNow(period.year, period.month);

  if (diff === 0) {
    return { ftd: baseFtd, clicks: baseClicks, cr: baseCr };
  }

  const seed = hashString(`${campaign.id || campaign.name || 'campaign'}-${yyyymm}`);
  const factor = 0.62 + (seed % 71) / 100;
  const crFactor = 0.8 + (seed % 31) / 100;
  return {
    ftd: Math.max(0, Math.round(baseFtd * factor)),
    clicks: Math.max(0, Math.round(baseClicks * factor)),
    cr: Math.max(0, Number((baseCr * crFactor).toFixed(2))),
  };
};

const getFinanceForPeriod = (partner, finance, period, selectedNetwork = 'All') => {
  let tx = Array.isArray(partner.financeTransactions) ? partner.financeTransactions : [];
  if (selectedNetwork !== 'All') {
    tx = tx.filter((t) => (t.affiliateNetwork || 'ClickDealer') === selectedNetwork);
  }
  const txInPeriod = tx.filter((t) => {
    const dt = new Date(t.datetime || t.date || t.time || 0);
    return dt.getFullYear() === period.year && dt.getMonth() + 1 === period.month;
  });

  if (txInPeriod.length > 0) {
    const paid = txInPeriod.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const total = paid;
    return {
      total: Number(total.toFixed(2)),
      paid: Number(paid.toFixed(2)),
      debt: Number(Math.max(0, total - paid).toFixed(2)),
    };
  }

  // No transactions for this period - return zeros
  return { total: 0, paid: 0, debt: 0 };
};

const getCampaignRoiCacForPeriod = ({ campaign, period, partnerRoi = 0, partnerCac = 0 }) => {
  const yyyymm = period.key;
  const monthYear = period.label;
  const readMonthly = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const roi = Number(payload.roi);
    const cac = Number(payload.cac);
    if (Number.isFinite(roi) && Number.isFinite(cac)) {
      return { roi, cac, source: 'monthly' };
    }
    return null;
  };

  if (Array.isArray(campaign.monthlyStats)) {
    const exact = campaign.monthlyStats.find(
      (m) =>
        m?.period === yyyymm || m?.month === yyyymm || m?.month === monthYear || m?.key === yyyymm
    );
    const monthly = readMonthly(exact);
    if (monthly) return monthly;
  }

  if (campaign.metricsByMonth && typeof campaign.metricsByMonth === 'object') {
    const exact = campaign.metricsByMonth[yyyymm] || campaign.metricsByMonth[monthYear];
    const monthly = readMonthly(exact);
    if (monthly) return monthly;
  }

  const ftd = Number(campaign.ftd || 0);
  const spend = Number(campaign.spend || 0);
  const revenue = Number(campaign.revenue || 0);
  if (spend > 0) {
    const roi = ((revenue - spend) / spend) * 100;
    const cac = ftd > 0 ? spend / ftd : 0;
    return {
      roi: Number(roi.toFixed(2)),
      cac: Number(cac.toFixed(2)),
      source: 'campaign-finance',
    };
  }

  if (Number.isFinite(Number(campaign.roi)) && Number.isFinite(Number(campaign.cac))) {
    return {
      roi: Number(Number(campaign.roi).toFixed(2)),
      cac: Number(Number(campaign.cac).toFixed(2)),
      source: 'campaign-static',
    };
  }

  // Deterministic fallback from partner-level values for demo/empty datasets.
  const baseRoi = Number.isFinite(Number(partnerRoi)) ? Number(partnerRoi) : 0;
  const baseCac = Number.isFinite(Number(partnerCac)) ? Number(partnerCac) : 0;
  const seed = hashString(`${campaign.id || campaign.name || 'campaign'}-${yyyymm}`);
  const roiFactor = 0.78 + (seed % 47) / 100; // 0.78..1.24
  const cacFactor = 0.82 + (seed % 39) / 100; // 0.82..1.20
  const fallbackRoi = baseRoi !== 0 ? baseRoi * roiFactor : 40 + (seed % 120);
  const fallbackCac = baseCac !== 0 ? baseCac * cacFactor : 12 + (seed % 35);
  return {
    roi: Number(fallbackRoi.toFixed(2)),
    cac: Number(fallbackCac.toFixed(2)),
    source: 'generated-fallback',
  };
};

// Tasks block - use same config as Tasks page Kanban
const TASK_COLUMNS = ['todo', 'inProgress', 'done'];
const statusConfigLight = {
  todo: { bg: '#FEF2F2', color: '#EF4444', border: '#FECACA', label: 'Not Started' },
  inProgress: { bg: '#FFF7ED', color: '#F59E0B', border: '#FED7AA', label: 'In Progress' },
  done: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', label: 'Completed' },
};
const statusConfigDark = {
  todo: { bg: null, color: '#F87171', border: 'rgba(248, 113, 113, 0.25)', label: 'Not Started' },
  inProgress: {
    bg: null,
    color: '#FBBF24',
    border: 'rgba(251, 191, 36, 0.25)',
    label: 'In Progress',
  },
  done: { bg: null, color: '#4ADE80', border: 'rgba(74, 222, 128, 0.25)', label: 'Completed' },
};
const priorityConfigLight = {
  high: { color: '#EF4444', bg: '#FEE2E2', label: 'High' },
  medium: { color: '#F59E0B', bg: '#FEF3C7', label: 'Medium' },
  low: { color: '#10B981', bg: '#D1FAE5', label: 'Low' },
};
const priorityConfigDark = {
  high: { color: '#F87171', bg: 'rgba(239, 68, 68, 0.15)', label: 'High' },
  medium: { color: '#FBBF24', bg: 'rgba(245, 158, 11, 0.15)', label: 'Medium' },
  low: { color: '#4ADE80', bg: 'rgba(34, 197, 94, 0.15)', label: 'Low' },
};

const PARTNER_DETAIL_BLOCKS = [
  { id: 'information', label: 'Information' },
  { id: 'performance', label: 'Performance' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'history', label: 'History' },
  { id: 'finance', label: 'Finance' },
  { id: 'materials', label: 'Materials' },
  { id: 'links', label: 'Links' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'taskManager', label: 'Tasks' },
];

const VISIBLE_BLOCKS_STORAGE_KEY = 'partnerDetailVisibleBlocks';

function getDefaultVisibleBlocks() {
  return PARTNER_DETAIL_BLOCKS.reduce((acc, { id }) => ({ ...acc, [id]: true }), {});
}

function loadVisibleBlocks() {
  try {
    const raw = localStorage.getItem(VISIBLE_BLOCKS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const defaults = getDefaultVisibleBlocks();
      return { ...defaults, ...parsed };
    }
  } catch (_) {}
  return getDefaultVisibleBlocks();
}

function saveVisibleBlocks(blocks) {
  try {
    localStorage.setItem(VISIBLE_BLOCKS_STORAGE_KEY, JSON.stringify(blocks));
  } catch (_) {}
}

export default function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const meetingsSectionRef = useRef(null);
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [selectedNetwork, setSelectedNetwork] = useState('All');
  const [networkAnchorEl, setNetworkAnchorEl] = useState(null);
  const [addTeamDialogOpen, setAddTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  // Meetings
  const {
    meetings,
    loading: meetingsLoading,
    createMeeting,
    finishRecording,
    uploadRecording,
    updateMeeting,
    deleteMeeting,
    refetch: refetchMeetings,
  } = useMeetings(id);
  const [materialDialog, setMaterialDialog] = useState({
    open: false,
    partner: null,
    material: null,
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addLinkDialogOpen, setAddLinkDialogOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [editForm, setEditForm] = useState({
    team: '',
    teams: [],
    newTeamName: '',
    group: 'Webmaster',
    agreement: 'Revshare',
    funnelStatus: 'Contacted',
    telegramNick: '',
    telegramGroup: '',
    trafficSources: '',
    geos: '',
    description: '',
    category: 'Gambling',
  });
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkDescription, setNewLinkDescription] = useState('');
  const [newLinkNetwork, setNewLinkNetwork] = useState('');
  const [addPaymentDialogOpen, setAddPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [visibleBlocks, setVisibleBlocks] = useState(() => loadVisibleBlocks());
  const [selectedTask, setSelectedTask] = useState(null);
  const [linkDetailLink, setLinkDetailLink] = useState(null);
  const [linkDetailDraft, setLinkDetailDraft] = useState({
    url: '',
    description: '',
    affiliateNetwork: 'ClickDealer',
  });
  const [linksListDialogOpen, setLinksListDialogOpen] = useState(false);
  const [openMeetingId, setOpenMeetingId] = useState(null);
  const [meetingActionRequest, setMeetingActionRequest] = useState(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const { openTaskManager } = useTaskManager();
  const { pushNotification } = useNotifications();
  const partnerAccess = usePartnerAccessOptional();
  const isPartnerRole = partnerAccess?.isPartnerRole ?? false;

  const showSuccess = useCallback(
    (title, message) => {
      pushNotification(title, message);
    },
    [pushNotification]
  );

  // Link detail dialog uses an explicit "Save changes" CTA (no auto-save on blur).
  useEffect(() => {
    if (!linkDetailLink) {
      setLinkDetailDraft({ url: '', description: '', affiliateNetwork: 'ClickDealer' });
      return;
    }
    setLinkDetailDraft({
      url: linkDetailLink.url || '',
      description: linkDetailLink.description || '',
      affiliateNetwork: linkDetailLink.affiliateNetwork || 'ClickDealer',
    });
  }, [linkDetailLink]);

  const setBlockVisible = useCallback((blockId, visible) => {
    setVisibleBlocks((prev) => {
      const next = { ...prev, [blockId]: visible };
      saveVisibleBlocks(next);
      return next;
    });
  }, []);

  const fetchPartner = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await partnerService.getById(id);
      setPartner(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPartner();
  }, [fetchPartner]);

  // Partner role: only allow viewing the linked partner
  useEffect(() => {
    if (
      partnerAccess?.isPartnerRole &&
      partnerAccess?.linkedPartnerId &&
      id &&
      id !== partnerAccess.linkedPartnerId
    ) {
      navigate('/partners', { replace: true });
    }
  }, [partnerAccess?.isPartnerRole, partnerAccess?.linkedPartnerId, id, navigate]);

  // Re-fetch when partner data is invalidated (e.g. tasks changed on Tasks page)
  useEffect(() => {
    const onInvalidated = () => fetchPartner();
    window.addEventListener('orch-partners-invalidated', onInvalidated);
    return () => window.removeEventListener('orch-partners-invalidated', onInvalidated);
  }, [fetchPartner]);

  // Auto-select first team when partner loads
  useEffect(() => {
    if (partner?.teams?.length && !activeTeamId) {
      setActiveTeamId(null); // null = "All Teams" view
    }
  }, [partner, activeTeamId]);

  const handleAddTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    try {
      const updated = await partnerService.addTeam(id, { name });
      setPartner(updated);
      setNewTeamName('');
      setAddTeamDialogOpen(false);
      // Select the newly created team
      const newTeam = updated.teams?.[updated.teams.length - 1];
      if (newTeam) setActiveTeamId(newTeam.id);
    } catch (err) {
      console.error('Failed to add team:', err);
    }
  };

  const handleRemoveTeam = async (teamId) => {
    if (!window.confirm('Remove this team? All team data will be lost.')) return;
    try {
      const updated = await partnerService.removeTeam(id, teamId);
      setPartner(updated);
      if (activeTeamId === teamId) setActiveTeamId(null);
    } catch (err) {
      console.error('Failed to remove team:', err);
    }
  };

  const handleArchiveCurrentPartner = useCallback(async () => {
    if (!partner?.id) return;
    setArchiving(true);
    setArchiveConfirmOpen(false);
    navigate('/partners');
    partnerService
      .archive(partner.id, 'Archived from Partner details page')
      .then(() => {
        logPartnerChange(
          partner.id,
          { status: 'Active' },
          { status: 'Archived' },
          'Partner archived'
        ).catch(() => {});
      })
      .catch((e) => {
        console.warn('[PartnerDetail] archive failed:', e);
      })
      .finally(() => {
        setArchiving(false);
      });
  }, [partner, navigate]);

  const handleCreateFinancePayment = useCallback(
    async (partnerId, paymentInput) => {
      if (!partner || partner.id !== partnerId) return;
      const existingTransactions = Array.isArray(partner.financeTransactions)
        ? partner.financeTransactions
        : [];
      const newPayment = {
        id: `${partner.id}-pay-${Date.now()}`,
        ...paymentInput,
      };
      const financeTransactions = [newPayment, ...existingTransactions];
      const paid = financeTransactions.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const total = paid;
      const debt = 0;
      await partnerService.update(partnerId, {
        financeTransactions,
        finance: { total, paid, debt },
      });
      await fetchPartner();
      setAddPaymentDialogOpen(false);
      showSuccess(
        'Payment Added',
        `Payment of $${Number(paymentInput.amount || 0).toFixed(2)} has been recorded.`
      );
      maybeNotify('partner_payment_received', {
        partner: partner.name || partner.information?.name || partnerId,
        amount: paymentInput.amount,
        type: paymentInput.type,
        description: paymentInput.description,
      });
      logPartnerChange(
        partnerId,
        { payment: '(none)' },
        {
          payment: `${paymentInput.type || 'Payment'}: $${Number(paymentInput.amount || 0).toFixed(2)}`,
        },
        'Finance payment added'
      )
        .then(() => setHistoryRefreshKey((k) => k + 1))
        .catch(() => {});
    },
    [partner, fetchPartner, showSuccess]
  );

  const handleEditFinancePayment = useCallback(
    async (partnerId, paymentInput) => {
      if (!partner || partner.id !== partnerId || !paymentInput.id) return;
      const existingTransactions = Array.isArray(partner.financeTransactions)
        ? partner.financeTransactions
        : [];
      const financeTransactions = existingTransactions.map((p) =>
        p.id === paymentInput.id ? { ...p, ...paymentInput } : p
      );
      const paid = financeTransactions.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      await partnerService.update(partnerId, {
        financeTransactions,
        finance: { total: paid, paid, debt: 0 },
      });
      await fetchPartner();
      setEditingPayment(null);
      showSuccess(
        'Payment Updated',
        `Payment has been updated to $${Number(paymentInput.amount || 0).toFixed(2)}.`
      );
      logPartnerChange(
        partnerId,
        { payment: 'edited' },
        {
          payment: `${paymentInput.description || 'Payment'}: $${Number(paymentInput.amount || 0).toFixed(2)}`,
        },
        'Finance payment updated'
      )
        .then(() => setHistoryRefreshKey((k) => k + 1))
        .catch(() => {});
    },
    [partner, fetchPartner, showSuccess]
  );

  const handleDeleteFinancePayment = useCallback(
    async (partnerId, paymentId) => {
      if (!partner || partner.id !== partnerId) return;
      const existingTransactions = Array.isArray(partner.financeTransactions)
        ? partner.financeTransactions
        : [];
      const deletedPayment = existingTransactions.find((p) => p.id === paymentId);
      const financeTransactions = existingTransactions.filter((p) => p.id !== paymentId);
      const paid = financeTransactions.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      await partnerService.update(partnerId, {
        financeTransactions,
        finance: { total: paid, paid, debt: 0 },
      });
      await fetchPartner();
      setEditingPayment(null);
      showSuccess('Payment Deleted', 'Payment has been removed successfully.');
      logPartnerChange(
        partnerId,
        {
          payment: `${deletedPayment?.description || 'Payment'}: $${Number(deletedPayment?.amount || 0).toFixed(2)}`,
        },
        { payment: '(deleted)' },
        'Finance payment deleted'
      )
        .then(() => setHistoryRefreshKey((k) => k + 1))
        .catch(() => {});
    },
    [partner, fetchPartner, showSuccess]
  );

  // Scroll to meetings section if hash is #meetings
  useEffect(() => {
    if (location.hash === '#meetings' && !loading && partner && meetingsSectionRef.current) {
      setTimeout(() => {
        meetingsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [location.hash, loading, partner]);

  // Handle meeting actions from navigation state (e.g. voice commands/history links).
  useEffect(() => {
    const stateMeetingId = location.state?.openMeetingId;
    const stateMeetingAction = location.state?.meetingAction;
    const stateMeetingActionNonce = location.state?.meetingActionNonce;
    const stateMeetingTitle = location.state?.meetingTitle;
    if (!stateMeetingId && !stateMeetingAction) return;

    if (stateMeetingId) {
      setOpenMeetingId(stateMeetingId);
    }
    if (stateMeetingAction) {
      setMeetingActionRequest({
        action: stateMeetingAction,
        title: stateMeetingTitle || '',
        nonce: stateMeetingActionNonce || Date.now(),
      });
    }
    if (meetingsSectionRef.current) {
      setTimeout(
        () => meetingsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        200
      );
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, navigate, location.pathname]);

  const handleSaveMaterial = async (partnerId, materialData) => {
    const currentPartner =
      partner && partner.id === partnerId ? partner : await partnerService.getById(partnerId);
    if (!currentPartner) return;

    let updatedMaterials;
    if (materialData.id) {
      // Update existing
      updatedMaterials = (currentPartner.materials || []).map((m) =>
        m.id === materialData.id ? { ...m, ...materialData } : m
      );
    } else {
      // Add new
      const newMaterial = {
        ...materialData,
        id: `M-${Math.floor(100 + Math.random() * 900)}`,
        uploadedAt: new Date().toISOString().split('T')[0],
      };
      updatedMaterials = [newMaterial, ...(currentPartner.materials || [])];
    }

    await partnerService.update(partnerId, { materials: updatedMaterials });
    const refreshed = await partnerService.getById(partnerId);
    setPartner(refreshed);
    showSuccess(
      'Material Saved',
      `Material "${materialData.name || 'Untitled'}" has been ${materialData.id ? 'updated' : 'added'}.`
    );
  };

  const handleDeleteMaterial = async (materialId) => {
    if (!partner) return;
    const currentMaterials = partner.materials || [];
    const updatedMaterials = currentMaterials.filter((m) => m.id !== materialId);
    await partnerService.update(partner.id, { materials: updatedMaterials });
    const refreshed = await partnerService.getById(partner.id);
    setPartner(refreshed);
    showSuccess('Material Deleted', 'Material has been removed successfully.');
    logPartnerChange(
      id,
      { materials: currentMaterials.length },
      { materials: updatedMaterials.length },
      `Deleted material`
    )
      .then(() => setHistoryRefreshKey((k) => k + 1))
      .catch(() => {});
  };

  const openEditDialog = () => {
    if (!partner) return;
    const sources = partner.trafficSources || [partner.trafficSource].filter(Boolean);
    const geos = partner.geos || [partner.geo].filter(Boolean);
    setEditForm({
      team: partner.team || '',
      teams: (partner.teams || []).map((t) => ({ id: t.id, name: t.name })),
      newTeamName: '',
      group: partner.group || 'Webmaster',
      agreement: partner.agreement || 'Revshare',
      funnelStatus: partner.funnelStatus || 'Contacted',
      telegramNick: partner.telegramNick || '',
      telegramGroup: partner.telegramGroup || '',
      trafficSources: sources,
      geos,
      description: partner.description || '',
      category: partner.category || 'Gambling',
    });
    setEditDialogOpen(true);
  };

  const handleSaveDetailFields = async () => {
    try {
      const finalTrafficSources = editForm.trafficSources.length ? editForm.trafficSources : ['FB'];
      const finalGeos = editForm.geos.length ? editForm.geos : ['BR'];

      // Reconcile teams: rename existing, add new, remove deleted
      const existingTeams = partner.teams || [];
      const editedTeams = editForm.teams || [];

      // Build updated teams array preserving data for teams that still exist
      const updatedTeams = editedTeams.map((et) => {
        const existing = existingTeams.find((t) => t.id === et.id);
        if (existing) {
          // Keep existing team data, but sync traffic/geo from the dialog
          // so partner-level GEO changes persist even when `teams` is sent.
          const existingTrafficGeo = existing.trafficGeo || {
            trafficSources: ['FB'],
            geos: ['BR'],
          };
          return {
            ...existing,
            name: et.name,
            trafficGeo: {
              ...existingTrafficGeo,
              trafficSources: finalTrafficSources,
              geos: finalGeos,
            },
          };
        }
        // New team (added in the dialog)
        return {
          id: et.id,
          name: et.name,
          trafficGeo: { trafficSources: finalTrafficSources, geos: finalGeos },
          campaigns: { items: [] },
          performance: {
            campaignsActive: 0,
            campaignsTotal: 0,
            ftdTotal: 0,
            crAvg: 0,
            clicksTotal: 0,
            roi: 0,
            cac: 0,
          },
          finance: { summary: { total: 0, paid: 0, debt: 0 }, transactions: [] },
          links: { items: [] },
          materials: { items: [] },
        };
      });

      const updates = {
        team: editedTeams[0]?.name || editForm.team.trim(),
        teams: updatedTeams,
        group: editForm.group,
        groupSubtype: GROUP_SUBTYPES[editForm.group] || '',
        agreement: editForm.agreement,
        funnelStatus: editForm.funnelStatus,
        telegramNick: editForm.telegramNick.trim(),
        telegramGroup: editForm.telegramGroup.trim(),
        trafficSources: finalTrafficSources,
        trafficSource: finalTrafficSources[0],
        geos: finalGeos,
        geo: finalGeos[0],
        description: editForm.description.trim(),
        category: editForm.category || 'Gambling',
      };

      // Capture old values for history diff (only trackable fields)
      const oldValues = {
        team: partner.team || '',
        group: partner.group || '',
        agreement: partner.agreement || '',
        funnelStatus: partner.funnelStatus || '',
        telegramNick: partner.telegramNick || '',
        telegramGroup: partner.telegramGroup || '',
        trafficSources: partner.trafficSources || [],
        geos: partner.geos || [],
        description: partner.description || '',
      };
      const newValues = {
        team: updates.team,
        group: updates.group,
        agreement: updates.agreement,
        funnelStatus: updates.funnelStatus,
        telegramNick: updates.telegramNick,
        telegramGroup: updates.telegramGroup,
        trafficSources: updates.trafficSources,
        geos: updates.geos,
        description: updates.description,
      };

      const updated = await partnerService.update(id, updates);
      setPartner(updated);
      setEditDialogOpen(false);
      showSuccess('Partner Updated', 'Partner information has been saved successfully.');

      // Log change to partner history and refresh the history block
      logPartnerChange(id, oldValues, newValues, 'Updated partner details')
        .then(() => setHistoryRefreshKey((k) => k + 1))
        .catch(() => {});
    } catch (err) {
      pushNotification(
        'Partner Detail',
        err?.message || 'Failed to save partner changes.',
        'error'
      );
    }
  };

  const handleTaskDragEnd = async (result) => {
    if (!result.destination || !partner) return;

    const sourceCol = result.source.droppableId;
    const destCol = result.destination.droppableId;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    const grouped = {
      todo: relatedTasks.filter((task) => task.status === 'todo'),
      inProgress: relatedTasks.filter((task) => task.status === 'inProgress'),
      done: relatedTasks.filter((task) => task.status === 'done'),
    };

    const sourceList = [...(grouped[sourceCol] || [])];
    const destList = sourceCol === destCol ? sourceList : [...(grouped[destCol] || [])];
    const moved = sourceList[sourceIndex];
    if (!moved) return;

    sourceList.splice(sourceIndex, 1);
    const movedWithNextStatus = sourceCol === destCol ? moved : { ...moved, status: destCol };
    destList.splice(destIndex, 0, movedWithNextStatus);

    grouped[sourceCol] = sourceCol === destCol ? destList : sourceList;
    grouped[destCol] = destList;

    const reorderedRelated = [
      ...(grouped.todo || []),
      ...(grouped.inProgress || []),
      ...(grouped.done || []),
    ];
    const relatedIds = new Set(relatedTasks.map((task) => task.id));
    const unaffectedTasks = (partner.tasks || []).filter((task) => !relatedIds.has(task.id));
    const nextTasks = [...reorderedRelated, ...unaffectedTasks];

    const updated = await partnerService.updateTasks(partner.id, nextTasks);
    setPartner(updated);
  };

  const handleTaskFieldChange = (field, value) => {
    setSelectedTask((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSaveTaskChanges = async () => {
    if (!selectedTask || !partner) return;
    if (selectedTask.isNew) {
      const tmBaseId = `TMB-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const taskId = `T-${partner.id}-${Date.now()}`;
      const now = new Date().toISOString();
      const newTask = {
        id: taskId,
        taskId,
        taskManagerBaseId: tmBaseId,
        partnerId: partner.id,
        title: selectedTask.title || 'New Task',
        priority: selectedTask.priority || 'medium',
        status: selectedTask.status || 'todo',
        assignedTo: selectedTask.assignedTo || '',
        deadline: selectedTask.deadline || '',
        estimate: selectedTask.estimate || '',
        description: selectedTask.description || '',
        userId: partner.userId || '',
        createdAt: now,
        affiliateNetwork: selectedTask.affiliateNetwork || 'ClickDealer',
      };
      const currentTasks = partner.tasks || [];
      const updated = await partnerService.updateTasks(partner.id, [...currentTasks, newTask]);
      setPartner(updated);
      showSuccess('Task Created', `Task "${newTask.title}" has been added.`);
      logPartnerChange(
        id,
        { tasks: currentTasks.length },
        { tasks: currentTasks.length + 1, addedTask: newTask.title },
        `Created task: ${newTask.title}`
      )
        .then(() => setHistoryRefreshKey((k) => k + 1))
        .catch(() => {});
      setSelectedTask(null);
      return;
    }
    const relatedIds = new Set(relatedTasks.map((t) => t.id));
    const unaffectedTasks = (partner.tasks || []).filter((t) => !relatedIds.has(t.id));
    const updatedRelated = relatedTasks.map((t) =>
      t.id === selectedTask.id ? { ...t, ...selectedTask } : t
    );
    const nextTasks = [...updatedRelated, ...unaffectedTasks];
    const updated = await partnerService.updateTasks(partner.id, nextTasks);
    setPartner(updated);
    setSelectedTask(null);
  };

  const handleDeleteTask = async () => {
    if (!selectedTask || !partner) return;
    const taskIdToRemove = selectedTask.id || selectedTask.taskId;
    const currentTasks = partner.tasks || [];
    const idx = currentTasks.findIndex(
      (t) => t.id === taskIdToRemove || t.taskId === taskIdToRemove
    );
    if (idx === -1) {
      setSelectedTask(null);
      return;
    }
    const nextTasks = currentTasks.slice(0, idx).concat(currentTasks.slice(idx + 1));
    const updated = await partnerService.updateTasks(partner.id, nextTasks);
    setPartner(updated);
    setSelectedTask(null);
  };

  const handleAddLink = async () => {
    const nextUrl = newLinkUrl.trim();
    if (!nextUrl || !partner) return;
    const nowIso = new Date().toISOString();
    const existingLinks = Array.isArray(partner.links) ? partner.links : [];
    const nextDescription = newLinkDescription.trim();
    const nextLinks = [
      {
        id: `L-${Date.now()}`,
        url: nextUrl,
        status: 'Perfect',
        description: nextDescription,
        campaign: '',
        affiliateNetwork: newLinkNetwork || 'ClickDealer',
        testedAt: formatDateTime(nowIso),
        uptimeDate: formatDate(nowIso),
      },
      ...existingLinks,
    ];
    const updated = await partnerService.update(partner.id, {
      links: nextLinks,
    });
    setPartner(updated);
    showSuccess('Link Added', 'New link has been added to monitoring.');
    logPartnerChange(
      id,
      { links: existingLinks.length },
      { links: nextLinks.length, addedUrl: nextUrl },
      `Added link: ${nextUrl}`
    )
      .then(() => setHistoryRefreshKey((k) => k + 1))
      .catch(() => {});
    setNewLinkUrl('');
    setNewLinkDescription('');
    setNewLinkNetwork('');
    setAddLinkDialogOpen(false);
  };

  const handleUpdateLink = async (linkItem, patch) => {
    if (!partner) return;
    // Optimistic update for the open dialog (keeps select/text fields responsive).
    setLinkDetailLink((prev) => (prev ? { ...prev, ...patch } : prev));

    const normalizeLink = (item, i) =>
      typeof item === 'string' ? { id: `partner-link-${i}`, url: item } : item;
    const linkKey = (item) => item?.id || item?.url || '';

    const existingLinks = (Array.isArray(partner.links) ? partner.links : []).map(normalizeLink);
    const targetKey = linkKey(linkItem);
    const nextLinkRow = { ...linkItem, ...patch };
    const foundIdx = existingLinks.findIndex((item) => linkKey(item) === targetKey);
    const nextLinks =
      foundIdx >= 0
        ? existingLinks.map((item) => (linkKey(item) === targetKey ? { ...item, ...patch } : item))
        : [nextLinkRow, ...existingLinks];
    const updated = await partnerService.update(partner.id, {
      links: nextLinks,
    });
    setPartner(updated);
    // Ensure the detail popup shows the latest saved data (ids, normalized fields, etc.)
    setLinkDetailLink((prev) => {
      if (!prev) return prev;
      const updatedLinks = Array.isArray(updated.links) ? updated.links : [];
      const normalizedUpdated = updatedLinks.map(normalizeLink);
      const refreshed = normalizedUpdated.find((item) => linkKey(item) === targetKey);
      return refreshed ? { ...prev, ...refreshed } : prev;
    });
    showSuccess('Link Updated', 'Link information has been saved.');
    return updated;
  };

  const handleDeleteLink = async (linkItem) => {
    if (!partner || !linkItem) return;
    const normalizeLink = (item, i) =>
      typeof item === 'string' ? { id: `partner-link-${i}`, url: item } : item;
    const linkKey = (item) => item?.id || item?.url || '';

    const ok = window.confirm(
      'Delete this monitored link?\n\nThis will remove it from the partner monitoring list.'
    );
    if (!ok) return;

    const existingLinks = (Array.isArray(partner.links) ? partner.links : []).map(normalizeLink);
    const targetKey = linkKey(linkItem);
    const nextLinks = existingLinks.filter((item) => linkKey(item) !== targetKey);

    // If the deleted link is used as a campaign regionLink, clear it.
    const nextCampaigns = (partner.campaigns || []).map((campaign) => {
      const matchesByName = linkItem.campaign && campaign.name === linkItem.campaign;
      const matchesByUrl = linkItem.url && campaign.regionLink === linkItem.url;
      if (!matchesByName && !matchesByUrl) return campaign;
      return {
        ...campaign,
        ...(campaign.regionLink ? { regionLink: '' } : {}),
        ...(campaign.comment ? { comment: '' } : {}),
      };
    });

    const updated = await partnerService.update(partner.id, {
      links: nextLinks,
      campaigns: nextCampaigns,
    });
    setPartner(updated);
    setLinkDetailLink((prev) => (prev && linkKey(prev) === targetKey ? null : prev));
    showSuccess('Link Deleted', 'Link has been removed from monitoring.');
    logPartnerChange(
      id,
      { links: existingLinks.length },
      { links: nextLinks.length, deletedUrl: linkItem.url || '' },
      `Deleted link: ${linkItem.url || ''}`
    )
      .then(() => setHistoryRefreshKey((k) => k + 1))
      .catch(() => {});
  };

  const handleTestNow = async (link) => {
    const nowIso = new Date().toISOString();
    const draftPatch = {
      ...(linkDetailDraft.url.trim() && linkDetailDraft.url.trim() !== (link.url || '')
        ? { url: linkDetailDraft.url.trim() }
        : {}),
      ...(linkDetailDraft.description !== (link.description || '')
        ? { description: linkDetailDraft.description }
        : {}),
      ...(linkDetailDraft.affiliateNetwork !== (link.affiliateNetwork || '')
        ? { affiliateNetwork: linkDetailDraft.affiliateNetwork }
        : {}),
    };
    await handleUpdateLink(link, {
      ...draftPatch,
      testedAt: formatDateTime(nowIso),
      uptimeDate: formatDate(nowIso),
    });
  };

  // Selected period (does not depend on partner) - must be before any early return so hook order is stable
  const selectedPeriod = useMemo(() => {
    const label = `${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
    return {
      month: selectedMonth,
      year: selectedYear,
      key: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`,
      label,
    };
  }, [selectedMonth, selectedYear]);

  const financePayments = useMemo(() => {
    if (!partner) return [];
    let transactions = Array.isArray(partner.financeTransactions)
      ? partner.financeTransactions
      : [];
    if (selectedNetwork !== 'All') {
      transactions = transactions.filter(
        (payment) => (payment.affiliateNetwork || 'ClickDealer') === selectedNetwork
      );
    }
    return transactions.filter((payment) => {
      const dt = new Date(payment.datetime || payment.date || payment.time || 0);
      return dt.getFullYear() === selectedPeriod.year && dt.getMonth() + 1 === selectedPeriod.month;
    });
  }, [partner, selectedPeriod, selectedNetwork]);

  const scopedCampaigns = useMemo(() => {
    if (!partner) return [];
    const teams = partner.teams || [];
    const activeTeam = teams.find((t) => t.id === activeTeamId) || null;
    return activeTeam ? activeTeam.campaigns?.items || [] : partner.campaigns || [];
  }, [partner, activeTeamId]);

  const campaigns = useMemo(() => {
    let list = scopedCampaigns;
    if (selectedNetwork !== 'All') {
      list = list.filter((c) => getCampaignNetwork(c) === selectedNetwork);
    }
    return list;
  }, [scopedCampaigns, selectedNetwork]);

  const relatedTasks = useMemo(() => {
    if (!partner) return [];
    let list = (partner.tasks || []).filter(
      (task) => !task.userId || task.userId === partner.userId
    );
    if (selectedNetwork !== 'All') {
      list = list.filter((task) => (task.affiliateNetwork || 'ClickDealer') === selectedNetwork);
    }
    return list;
  }, [partner, selectedNetwork]);

  const materials = useMemo(() => {
    if (!partner) return [];
    let list = partner.materials || [];
    if (selectedNetwork !== 'All') {
      list = list.filter((m) => materialMatchesNetwork(m, selectedNetwork));
    }
    return list;
  }, [partner, selectedNetwork]);

  if (loading) return <LoadingSpinner message="Loading partner details..." />;
  if (error)
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Partner not found: {error}
      </Alert>
    );
  if (!partner) return null;

  const agColors = AGREEMENT_COLORS[partner.agreement] || {};
  const trafficList = partner.trafficSources || [partner.trafficSource].filter(Boolean);
  // Teams
  const teams = partner.teams || [];
  const activeTeam = teams.find((t) => t.id === activeTeamId) || null;

  // When viewing a specific team, scope data to that team; otherwise show all (aggregated)
  const scopedTrafficSources = activeTeam
    ? activeTeam.trafficGeo?.trafficSources || []
    : partner.trafficSources || [partner.trafficSource].filter(Boolean);
  const scopedGeos = activeTeam
    ? activeTeam.trafficGeo?.geos || []
    : partner.geos || [partner.geo].filter(Boolean);
  const scopedFinance = activeTeam
    ? activeTeam.finance || { summary: { total: 0, paid: 0, debt: 0 }, transactions: [] }
    : null;
  const scopedLinks = activeTeam ? activeTeam.links?.items || [] : null;
  const scopedMaterials = activeTeam ? activeTeam.materials?.items || [] : null;

  const geoList = scopedGeos;
  const clicksTotal = activeTeam
    ? scopedCampaigns.reduce((sum, c) => sum + getCampaignClicks(c), 0)
    : getPartnerClicksTotal(partner);
  const finance = activeTeam
    ? {
        total: Number(scopedFinance.summary?.total || 0),
        paid: Number(scopedFinance.summary?.paid || 0),
        debt: Number(scopedFinance.summary?.debt || 0),
      }
    : getFinanceSummary(partner);
  const campaignOptions = campaigns.map((campaign) => campaign.name).filter(Boolean);
  const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const previousPeriod = (() => {
    const isJanuary = selectedMonth === 1;
    const month = isJanuary ? 12 : selectedMonth - 1;
    const year = isJanuary ? selectedYear - 1 : selectedYear;
    return {
      month,
      year,
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${String(month).padStart(2, '0')}/${year}`,
    };
  })();
  const deltaPercent = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };
  const periodizedCampaigns = campaigns.map((campaign) => ({
    campaign,
    metrics: getCampaignMetricsForPeriod(campaign, selectedPeriod),
  }));
  const previousPeriodizedCampaigns = campaigns.map((campaign) => ({
    campaign,
    metrics: getCampaignMetricsForPeriod(campaign, previousPeriod),
  }));
  const campaignPerformanceData = periodizedCampaigns.map(({ campaign, metrics }) => ({
    fullName: campaign.name,
    ftd: metrics.ftd,
    clicks: metrics.clicks,
  }));
  const crTrendData = periodizedCampaigns.map(({ campaign, metrics }, idx) => ({
    index: idx + 1,
    fullName: campaign.name,
    cr: metrics.cr,
  }));
  const financePeriod = getFinanceForPeriod(partner, finance, selectedPeriod, selectedNetwork);
  const campaignRoiCacData = periodizedCampaigns.map(({ campaign, metrics }) => {
    const roiCac = getCampaignRoiCacForPeriod({
      campaign,
      period: selectedPeriod,
      partnerRoi: partner.roi,
      partnerCac: partner.cac,
    });
    return {
      fullName: campaign.name,
      cac: roiCac.cac,
      roi: roiCac.roi,
      source: roiCac.source,
      ftd: Number(metrics.ftd || 0),
      clicks: Number(metrics.clicks || 0),
    };
  });

  const linksFromPartner = (Array.isArray(partner.links) ? partner.links : []).filter((item) => {
    if (selectedNetwork === 'All') return true;
    const net =
      item && typeof item === 'object' && item.affiliateNetwork
        ? item.affiliateNetwork
        : 'ClickDealer';
    return net === selectedNetwork;
  });
  const linksFromCampaigns = campaigns
    .filter((campaign) => Boolean(campaign.regionLink))
    .map((campaign, idx) => ({
      id: `campaign-link-${idx}`,
      url: campaign.regionLink,
      campaign: campaign.name || '',
      affiliateNetwork: getCampaignNetwork(campaign),
      description: campaign.comment || 'Campaign landing page',
    }));
  const normalizedPartnerLinks = linksFromPartner
    .map((item, idx) => {
      if (typeof item === 'string')
        return { id: `partner-link-${idx}`, url: item, affiliateNetwork: 'ClickDealer' };
      if (item && typeof item === 'object' && item.url) return item;
      return null;
    })
    .filter(Boolean);
  const linksFromMaterials = materials.flatMap((m, mIdx) =>
    (m.links || []).map((url, lIdx) => ({
      id: `material-link-${m.id}-${lIdx}`,
      url,
      description: `From material: ${m.name}`,
      campaign: (m.campaignNames || [])[0] || '',
      affiliateNetwork: m.affiliateNetworks?.[0] || m.affiliateNetwork || 'ClickDealer',
    }))
  );
  const linkCandidates = [...normalizedPartnerLinks, ...linksFromCampaigns, ...linksFromMaterials]
    .filter((item) => Boolean(item?.url))
    .reduce((acc, item) => {
      const existing = acc.find((x) => x.url === item.url);
      if (!existing) {
        acc.push(item);
      } else {
        if (!existing.campaign && item.campaign) existing.campaign = item.campaign;
        if (!existing.description && item.description) {
          // If existing description is generic, overwrite it. Otherwise keep it.
          if (existing.description === 'Campaign landing page' && item.description) {
            existing.description = item.description;
          }
        }
      }
      return acc;
    }, []);
  const monitoredLinks = linkCandidates.map((item, idx) => ({
    id: item.id || `link-${idx}`,
    url: item.url,
    status: item.status || 'Perfect',
    description: item.description || '',
    campaign: item.campaign || '',
    testedAt: item.testedAt || '',
    uptimeDate: item.uptimeDate || '',
  }));
  const currentTotals = {
    clicks: periodizedCampaigns.reduce((sum, { metrics }) => sum + metrics.clicks, 0),
    ftd: periodizedCampaigns.reduce((sum, { metrics }) => sum + metrics.ftd, 0),
    avgCr: periodizedCampaigns.length
      ? periodizedCampaigns.reduce((sum, { metrics }) => sum + metrics.cr, 0) /
        periodizedCampaigns.length
      : 0,
  };
  const previousTotals = {
    clicks: previousPeriodizedCampaigns.reduce((sum, { metrics }) => sum + metrics.clicks, 0),
    ftd: previousPeriodizedCampaigns.reduce((sum, { metrics }) => sum + metrics.ftd, 0),
    avgCr: previousPeriodizedCampaigns.length
      ? previousPeriodizedCampaigns.reduce((sum, { metrics }) => sum + metrics.cr, 0) /
        previousPeriodizedCampaigns.length
      : 0,
  };
  const linksStatusSummary = monitoredLinks.reduce(
    (acc, link) => {
      if (link.status === 'Perfect') acc.perfect += 1;
      else if (link.status === 'Have errors') acc.errors += 1;
      else acc.notWorking += 1;
      return acc;
    },
    { perfect: 0, errors: 0, notWorking: 0 }
  );
  const linksTotalCount = monitoredLinks.length;
  const linksHealthScore =
    linksTotalCount > 0 ? Math.round((linksStatusSummary.perfect / linksTotalCount) * 100) : 0;
  const materialsCovered = materials.filter(
    (item) => (item.campaignNames || []).length > 0 && (item.links || []).length > 0
  ).length;
  const materialsCoverage =
    materials.length > 0 ? Math.round((materialsCovered / materials.length) * 100) : 0;
  const topCampaignByFtd = [...periodizedCampaigns].sort(
    (a, b) => (b.metrics.ftd || 0) - (a.metrics.ftd || 0)
  )[0];
  const lowCrCampaigns = periodizedCampaigns
    .filter(({ metrics }) => metrics.cr < 1.2)
    .map(({ campaign, metrics }) => ({ name: campaign.name, cr: metrics.cr }))
    .slice(0, 5);
  const staleLinks = monitoredLinks.filter((item) => {
    const tested = new Date(item.testedAt);
    if (Number.isNaN(tested.getTime())) return false;
    return (Date.now() - tested.getTime()) / 86400000 > 7;
  });
  const weakMaterials = materials.filter(
    (item) => (item.campaignNames || []).length === 0 || (item.links || []).length === 0
  );
  const reportInsights = [];
  if (lowCrCampaigns.length > 0) {
    reportInsights.push({
      type: 'warning',
      title: 'Low CR campaigns',
      detail: `${lowCrCampaigns.length} campaign(s) below 1.2% CR.`,
    });
  }
  if (linksStatusSummary.notWorking > 0 || linksStatusSummary.errors > 0) {
    reportInsights.push({
      type: linksStatusSummary.notWorking > 0 ? 'critical' : 'warning',
      title: 'Problematic links',
      detail: `${linksStatusSummary.notWorking} not working, ${linksStatusSummary.errors} with errors.`,
    });
  }
  if (staleLinks.length > 0) {
    reportInsights.push({
      type: 'warning',
      title: 'Stale link tests',
      detail: `${staleLinks.length} link(s) not tested in the last 7 days.`,
    });
  }
  if (weakMaterials.length > 0) {
    reportInsights.push({
      type: 'warning',
      title: 'Materials missing coverage',
      detail: `${weakMaterials.length} material(s) missing campaigns or links.`,
    });
  }
  const reportRecommendations = [];
  if (lowCrCampaigns.length > 0)
    reportRecommendations.push('Review creatives and targeting for low-CR campaigns.');
  if (linksStatusSummary.notWorking > 0)
    reportRecommendations.push('Fix broken links and retest immediately.');
  if (staleLinks.length > 0) reportRecommendations.push('Schedule weekly link monitoring checks.');
  if (weakMaterials.length > 0)
    reportRecommendations.push('Attach campaign mapping and links to all materials.');
  if (reportRecommendations.length === 0) {
    reportRecommendations.push('Performance is stable; continue current optimization cadence.');
  }
  const reportComparison = {
    currentPeriod: selectedPeriod.label,
    previousPeriod: previousPeriod.label,
    metrics: [
      {
        label: 'Clicks',
        current: currentTotals.clicks,
        previous: previousTotals.clicks,
        deltaPercent: deltaPercent(currentTotals.clicks, previousTotals.clicks),
      },
      {
        label: 'FTD',
        current: currentTotals.ftd,
        previous: previousTotals.ftd,
        deltaPercent: deltaPercent(currentTotals.ftd, previousTotals.ftd),
      },
      {
        label: 'Avg CR%',
        current: currentTotals.avgCr,
        previous: previousTotals.avgCr,
        deltaPoints: currentTotals.avgCr - previousTotals.avgCr,
      },
      {
        label: 'Links Perfect',
        current: linksStatusSummary.perfect,
        previous: null,
        deltaPercent: null,
      },
    ],
  };
  const hasCritical = linksStatusSummary.notWorking > 0;
  const hasWarning =
    !hasCritical &&
    (lowCrCampaigns.length > 0 ||
      staleLinks.length > 0 ||
      weakMaterials.length > 0 ||
      linksStatusSummary.errors > 0);
  const reportSummary = {
    activeCampaigns:
      periodizedCampaigns.filter(({ metrics }) => metrics.ftd > 0 || metrics.clicks > 0).length ||
      partner.campaignsActive,
    totalClicks: currentTotals.clicks,
    totalFtd: currentTotals.ftd,
    avgCr: currentTotals.avgCr,
    topCampaign: topCampaignByFtd?.campaign?.name || '-',
    linksHealthScore,
    materialsCoverage,
    status: hasCritical ? 'Critical' : hasWarning ? 'Warning' : 'Healthy',
  };
  const reportMetadata = {
    partnerId: partner.userId,
    selectedPeriod: selectedPeriod.label,
    generatedAt: new Date().toISOString(),
    campaignCount: campaigns.length,
    materialsCount: materials.length,
    linksCount: monitoredLinks.length,
    notes: campaigns.some((c) => !Array.isArray(c.monthlyStats) && !c.metricsByMonth)
      ? ['Some campaign period metrics use fallback values due to missing monthly source data.']
      : [],
  };
  const healthTone =
    reportSummary.status === 'Critical'
      ? { bg: alpha(theme.palette.error.main, 0.12), color: 'error.main' }
      : reportSummary.status === 'Warning'
        ? { bg: alpha(theme.palette.warning.main, 0.14), color: 'warning.dark' }
        : { bg: alpha(theme.palette.success.main, 0.14), color: 'success.main' };

  const headerKpis = [
    {
      label: 'Active Campaigns',
      value: reportSummary.activeCampaigns || 0,
      icon: (
        <AppIcon name="CampaignOutlined" fallback={CampaignOutlinedIcon} sx={{ fontSize: 17 }} />
      ),
      tone: theme.palette.primary.main,
      helper: `${campaigns.length} total campaigns`,
    },
    {
      label: 'Period Clicks',
      value: currentTotals.clicks.toLocaleString(),
      icon: (
        <AppIcon name="TouchAppOutlined" fallback={TouchAppOutlinedIcon} sx={{ fontSize: 17 }} />
      ),
      tone: theme.palette.primary.main,
      helper: selectedPeriod.label,
    },
    {
      label: 'Period FTD',
      value: currentTotals.ftd.toLocaleString(),
      icon: (
        <AppIcon name="PersonAddOutlined" fallback={PersonAddOutlinedIcon} sx={{ fontSize: 17 }} />
      ),
      tone: theme.palette.success.main,
      helper: selectedPeriod.label,
    },
    {
      label: 'Outstanding Debt',
      value: formatCurrency(financePeriod.debt || 0),
      icon: <AppIcon name="PaidOutlined" fallback={PaidOutlinedIcon} sx={{ fontSize: 17 }} />,
      tone: theme.palette.warning.main,
      helper: 'Finance balance',
    },
    {
      label: 'Meetings',
      value: (meetings || []).length,
      icon: <AppIcon name="Schedule" fallback={ScheduleIcon} sx={{ fontSize: 17 }} />,
      tone: theme.palette.primary.main,
      helper: 'Recorded and planned',
    },
    {
      label: 'Links Health',
      value: `${linksHealthScore}%`,
      icon: (
        <AppIcon name="ShowChartOutlined" fallback={ShowChartOutlinedIcon} sx={{ fontSize: 17 }} />
      ),
      tone: theme.palette.success.main,
      helper: `${linksStatusSummary.perfect}/${linksTotalCount} healthy`,
    },
  ];

  return (
    <Box sx={{ p: { xs: 0.75, sm: 1, md: 1.25 }, maxWidth: 1400, mx: 'auto' }}>
      <Paper
        variant="outlined"
        sx={{
          mb: 2,
          p: { xs: 1.25, sm: 1.5 },
          borderRadius: 3,
          bgcolor: alpha(theme.palette.background.paper, 0.98),
          backgroundImage: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.09)} 0%, ${alpha(theme.palette.background.paper, 0.97)} 46%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
          borderColor: alpha(theme.palette.primary.main, 0.22),
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: { xs: 1, sm: 2 },
            mb: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: { xs: 1, sm: 2 },
              minWidth: 0,
              flex: 1,
            }}
          >
            <IconButton
              onClick={() => navigate('/partners')}
              size="small"
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                flexShrink: 0,
                mt: 0.25,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <AppIcon
                name="ArrowBack"
                fallback={ArrowBackIcon}
                sx={{ fontSize: { xs: 18, sm: 20 } }}
              />
            </IconButton>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  letterSpacing: '-0.5px',
                  fontSize: { xs: '1.15rem', sm: '1.5rem', md: '2rem' },
                  lineHeight: 1.2,
                  mb: 0.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {partner.name}
              </Typography>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}
              >
                <Chip
                  label={partner.userId}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    height: { xs: 22, sm: 24 },
                    fontSize: { xs: '0.68rem', sm: '0.75rem' },
                  }}
                />
                <Chip
                  label={partner.group}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    borderRadius: 1.5,
                    height: { xs: 22, sm: 24 },
                    fontSize: { xs: '0.68rem', sm: '0.75rem' },
                    bgcolor:
                      partner.group === 'Webmaster'
                        ? alpha(theme.palette.primary.main, 0.1)
                        : alpha(theme.palette.success.main, 0.1),
                    color: partner.group === 'Webmaster' ? 'primary.main' : 'success.main',
                  }}
                />
                <Chip
                  label={reportSummary.status}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    borderRadius: 1.5,
                    height: { xs: 22, sm: 24 },
                    fontSize: { xs: '0.68rem', sm: '0.75rem' },
                    bgcolor: healthTone.bg,
                    color: healthTone.color,
                  }}
                />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.72rem', sm: '0.8125rem' } }}
              >
                Registered {formatDate(partner.registrationDate)} • {partner.team}
              </Typography>
            </Box>
          </Box>

          {/* Unified Filter Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: 'text.secondary',
                fontSize: { xs: '0.75rem', sm: '0.8125rem' },
              }}
            >
              {selectedPeriod.label}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={(e) => setNetworkAnchorEl(e.currentTarget)}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: 'divider',
                color: 'text.secondary',
                height: 38,
                px: 1.5,
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
            >
              Select Network: {selectedNetwork === 'All' ? 'All' : selectedNetwork}
            </Button>
            <Popover
              open={Boolean(networkAnchorEl)}
              anchorEl={networkAnchorEl}
              onClose={() => setNetworkAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    p: 1,
                    borderRadius: 2.5,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    minWidth: 160,
                  },
                },
              }}
            >
              <Stack spacing={0.5}>
                {['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'].map((net) => (
                  <Button
                    key={net}
                    size="small"
                    onClick={() => {
                      setSelectedNetwork(net);
                      setNetworkAnchorEl(null);
                    }}
                    sx={{
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      fontWeight: selectedNetwork === net ? 700 : 500,
                      bgcolor:
                        selectedNetwork === net
                          ? alpha(theme.palette.primary.main, 0.1)
                          : 'transparent',
                      color: selectedNetwork === net ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {net}
                  </Button>
                ))}
                <Divider sx={{ my: 0.5 }} />
                <Button
                  size="small"
                  onClick={() => {
                    setSelectedNetwork('All');
                    setNetworkAnchorEl(null);
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontWeight: selectedNetwork === 'All' ? 700 : 500,
                    color: 'text.secondary',
                  }}
                >
                  Show All
                </Button>
              </Stack>
            </Popover>

            <Badge
              variant="dot"
              color="primary"
              invisible={Object.values(visibleBlocks).every(Boolean)}
              sx={{ '& .MuiBadge-dot': { right: 6, top: 6 } }}
            >
              <IconButton
                onClick={(e) => setFilterAnchorEl(e.currentTarget)}
                size="small"
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  width: { xs: 34, sm: 40 },
                  height: { xs: 34, sm: 40 },
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    borderColor: 'primary.main',
                  },
                }}
                aria-label="Page controls"
              >
                <AppIcon
                  name="Tune"
                  fallback={TuneIcon}
                  sx={{ fontSize: { xs: 18, sm: 20 }, color: 'text.secondary' }}
                />
              </IconButton>
            </Badge>
            <Popover
              open={Boolean(filterAnchorEl)}
              anchorEl={filterAnchorEl}
              onClose={() => setFilterAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1.5,
                    p: 0,
                    borderRadius: 3,
                    minWidth: 320,
                    maxWidth: 360,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                  },
                },
              }}
            >
              {/* Header */}
              <Box
                sx={{
                  px: 2.5,
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  Page controls
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}
                >
                  Period, blocks visibility & report
                </Typography>
              </Box>

              {/* Section: Select Period */}
              <Box sx={{ px: 2.5, py: 2 }}>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                  }}
                >
                  Select period
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1.5 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Month</InputLabel>
                    <Select
                      value={selectedMonth}
                      label="Month"
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      sx={{ borderRadius: 2, fontWeight: 600 }}
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <MenuItem key={idx} value={idx + 1}>
                          {name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Year</InputLabel>
                    <Select
                      value={selectedYear}
                      label="Year"
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      sx={{ borderRadius: 2, fontWeight: 600 }}
                    >
                      {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                        <MenuItem key={y} value={y}>
                          {y}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              <Divider />

              {/* Section: Show blocks */}
              <Box sx={{ px: 2.5, py: 2 }}>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                  }}
                >
                  Show blocks
                </Typography>
                <Stack sx={{ mt: 1.5, gap: 0.25 }}>
                  {PARTNER_DETAIL_BLOCKS.filter(
                    (b) => !isPartnerRole || b.id !== 'taskManager'
                  ).map(({ id, label }) => (
                    <FormControlLabel
                      key={id}
                      control={
                        <Checkbox
                          size="small"
                          checked={!!visibleBlocks[id]}
                          onChange={(e) => setBlockVisible(id, e.target.checked)}
                          sx={{ py: 0.25 }}
                        />
                      }
                      label={label}
                      sx={{
                        '& .MuiFormControlLabel-label': { fontSize: '0.875rem', fontWeight: 500 },
                      }}
                    />
                  ))}
                </Stack>
              </Box>

              <Divider />

              {/* Section: Download Report */}
              <Box sx={{ px: 2.5, py: 2, bgcolor: alpha(theme.palette.grey[50], 0.5) }}>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                  }}
                >
                  Export
                </Typography>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={
                    <AppIcon
                      name="PictureAsPdf"
                      fallback={PictureAsPdfIcon}
                      sx={{ fontSize: 18 }}
                    />
                  }
                  onClick={async () => {
                    await generatePartnerReport({
                      partner,
                      periodLabel: selectedPeriod.label,
                      selectedPeriod,
                      periodizedCampaigns,
                      campaignPerformanceData,
                      crTrendData,
                      financePeriod,
                      monitoredLinks,
                      MONTH_NAMES,
                      reportSummary,
                      reportComparison,
                      reportInsights,
                      reportRecommendations,
                      reportMetadata,
                    });
                    setFilterAnchorEl(null);
                  }}
                  sx={{
                    mt: 1.5,
                    py: 1.25,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                  }}
                >
                  Download Report
                </Button>
              </Box>
            </Popover>
          </Box>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
              xl: 'repeat(6, minmax(0, 1fr))',
            },
            gap: 1,
          }}
        >
          {headerKpis.map((item) => (
            <Paper
              key={item.label}
              elevation={0}
              sx={{
                p: 1.2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(item.tone, 0.24),
                background: `linear-gradient(135deg, ${alpha(item.tone, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
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
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    {item.label}
                  </Typography>
                  <Typography
                    sx={{ mt: 0.3, fontWeight: 800, fontSize: '1.02rem', lineHeight: 1.2 }}
                  >
                    {item.value}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {item.helper}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.5,
                    bgcolor: alpha(item.tone, 0.18),
                    color: item.tone,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      </Paper>
      {/* Teams selector */}
      {teams.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            mb: 2.5,
            borderRadius: 3,
            bgcolor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2.5,
              pt: 2,
              pb: 0.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AppIcon
                name="GroupsOutlined"
                fallback={GroupsOutlinedIcon}
                sx={{ fontSize: 20, color: 'primary.main' }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                Teams
              </Typography>
              <Chip
                label={teams.length}
                size="small"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
              />
            </Box>
            <Button
              size="small"
              startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 16 }} />}
              onClick={() => setAddTeamDialogOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', borderRadius: 2 }}
            >
              Add team
            </Button>
          </Box>
          <Tabs
            value={activeTeamId === null ? 0 : teams.findIndex((t) => t.id === activeTeamId) + 1}
            onChange={(_, idx) => {
              if (idx === 0) setActiveTeamId(null);
              else setActiveTeamId(teams[idx - 1]?.id || null);
            }}
            variant="scrollable"
            scrollButtons="auto"
            TabIndicatorProps={{ style: { display: 'none' } }}
            sx={{
              px: 1.5,
              pb: 1.5,
              minHeight: 36,
              '& .MuiTabs-flexContainer': { gap: 0.75 },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                minHeight: 32,
                fontSize: '0.8rem',
                borderRadius: '16px',
                px: 2,
                py: 0.5,
                color: 'text.secondary',
                transition: 'all 0.2s ease',
                '&:hover': { bgcolor: 'action.hover' },
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': { bgcolor: 'primary.dark' },
                },
              },
            }}
          >
            <Tab label="All Teams" />
            {teams.map((team) => (
              <Tab
                key={team.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {team.name}
                    {activeTeamId === team.id && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTeam(team.id);
                        }}
                        sx={{
                          p: 0.25,
                          ml: 0.25,
                          color: 'inherit',
                          opacity: 0.7,
                          '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.15)' },
                        }}
                      >
                        <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                }
              />
            ))}
          </Tabs>
        </Paper>
      )}
      {/* Add Team Dialog */}
      <FormDialog
        open={addTeamDialogOpen}
        onClose={() => {
          setAddTeamDialogOpen(false);
          setNewTeamName('');
        }}
        title="Add new team"
        icon={GroupsOutlinedIcon}
        maxWidth="xs"
        primaryLabel="Add"
        onPrimary={handleAddTeam}
        primaryDisabled={!newTeamName.trim()}
      >
        <TextField
          autoFocus
          margin="dense"
          label="Team name"
          fullWidth
          size="small"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
        />
      </FormDialog>
      {/* Bento grid - 12 cols desktop, 6 cols tablet, 1 col mobile; equal-width pairs (6-6); stretch rows; 20px gap */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(6, 1fr)', md: 'repeat(12, 1fr)' },
          gap: 2.5,
          alignItems: 'stretch',
        }}
      >
        {/* 1. Information - row 1 left (6 cols), tablet 3 cols */}
        {visibleBlocks.information && (
          <Paper
            variant="outlined"
            sx={{
              gridColumn: { xs: '1 / -1', sm: 'span 3', md: 'span 6' },
              p: { xs: 1.5, sm: 1.75, md: 2 },
              borderRadius: 3,
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 280,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                mb: { xs: 1.5, sm: 2 },
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 1.5,
              }}
            >
              <Box>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: '1.05rem', sm: '1.1rem' },
                    color: 'text.primary',
                  }}
                >
                  Information
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                    mt: 0.4,
                    lineHeight: 1.4,
                  }}
                >
                  Core partner profile with contacts, traffic, geo, agreement, funnel and finance
                  overview.
                </Typography>
              </Box>
              {!isPartnerRole && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={openEditDialog}
                  startIcon={
                    <AppIcon
                      name="EditOutlined"
                      fallback={EditOutlinedIcon}
                      sx={{ fontSize: 18 }}
                    />
                  }
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                    minHeight: { xs: 40, sm: 36 },
                    px: { xs: 1.5, sm: 1.75 },
                  }}
                >
                  Edit fields
                </Button>
              )}
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                gap: { xs: 1.75, sm: 2 },
                rowGap: { xs: 1.5, sm: 1.75 },
                mb: 2,
              }}
            >
              <KeyValueItem label="Team" value={partner.team || '-'} />
              <KeyValueItem label="Group" value={partner.group || '-'} />
              <KeyValueItem label="Category" value={partner.category || 'Gambling'} />
              <KeyValueItem
                label="Agreement"
                value={
                  <Chip
                    label={partner.agreement}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      bgcolor: agColors.bg,
                      color: agColors.color,
                      borderRadius: 2,
                      height: 26,
                    }}
                  />
                }
              />
              <KeyValueItem
                label="Funnel Status"
                value={<FunnelStatusBadge status={partner.funnelStatus} />}
              />
              <KeyValueItem
                label="Contact (Nick)"
                value={
                  partner.telegramNick ? `@${String(partner.telegramNick).replace(/^@/, '')}` : '-'
                }
              />
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Contact (Group)
                </Typography>
                <Typography
                  component="a"
                  href={partner.telegramGroup || '#'}
                  target="_blank"
                  rel="noreferrer"
                  variant="body2"
                  sx={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: { xs: '0.9rem', sm: '0.875rem' },
                    color: partner.telegramGroup ? 'primary.main' : 'text.primary',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: partner.telegramGroup ? 'underline' : 'none' },
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {partner.telegramGroup || '-'}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Geo
                </Typography>
                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{ flexWrap: 'wrap', gap: 0.5 }}
                  useFlexGap
                >
                  {geoList.length ? (
                    geoList.map((code) => (
                      <Chip
                        key={code}
                        label={`${COUNTRY_FLAGS[code] || ''} ${code}`}
                        size="small"
                        sx={{ fontWeight: 600, borderRadius: 2, height: 26 }}
                      />
                    ))
                  ) : (
                    <Typography variant="body2" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      -
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Traffic Sources
                </Typography>
                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{ flexWrap: 'wrap', gap: 0.5 }}
                  useFlexGap
                >
                  {trafficList.length ? (
                    trafficList.map((src) => (
                      <Chip
                        key={src}
                        label={src}
                        size="small"
                        sx={{ fontWeight: 600, borderRadius: 2, height: 26 }}
                      />
                    ))
                  ) : (
                    <Typography variant="body2" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      -
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  display: 'block',
                  mb: 0.5,
                }}
              >
                Description
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: partner.description ? 'text.primary' : 'text.secondary',
                  fontSize: { xs: '0.9rem', sm: '0.875rem' },
                  lineHeight: 1.55,
                  bgcolor: (theme) => alpha(theme.palette.divider, 0.08),
                  borderRadius: 2,
                  p: { xs: 1.25, sm: 1.5 },
                  fontStyle: partner.description ? 'normal' : 'italic',
                  flex: 1,
                  minHeight: 52,
                }}
              >
                {partner.description || 'No description added yet.'}
              </Typography>
            </Box>
          </Paper>
        )}

        {/* 2. History - row 1 right (6 cols), tablet 3 cols */}
        {visibleBlocks.history && partner && (
          <Paper
            variant="outlined"
            sx={{
              gridColumn: { xs: '1 / -1', sm: 'span 3', md: 'span 6' },
              p: { xs: 1.5, md: 2 },
              borderRadius: 3,
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 280,
              overflow: 'hidden',
            }}
          >
            <HistoryBlock
              partnerId={partner.id}
              partnerName={partner.name}
              partner={partner}
              meetingsCount={meetings?.length ?? 0}
              financeDebt={financePeriod?.debt ?? 0}
              refreshKey={historyRefreshKey}
              onOpenMeeting={(meetingId) => {
                setOpenMeetingId(meetingId);
                setTimeout(
                  () =>
                    meetingsSectionRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    }),
                  150
                );
              }}
              onOpenTaskManager={isPartnerRole ? undefined : openTaskManager}
            />
          </Paper>
        )}

        {/* 3. Performance - full width (12 cols) */}
        {visibleBlocks.performance && (
          <Paper
            variant="outlined"
            sx={{
              gridColumn: { xs: '1 / -1', sm: 'span 6', md: 'span 12' },
              p: { xs: 1.5, md: 2 },
              borderRadius: 3,
              bgcolor: 'background.paper',
              overflow: 'hidden',
            }}
          >
            <SectionHeader
              title="Performance"
              subtitle={`Campaign KPIs and finance metrics for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}.`}
            />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, 1fr)',
                  md: 'repeat(4, 1fr)',
                  lg: 'repeat(6, 1fr)',
                },
                gap: 3,
                mb: 4,
              }}
            >
              <KeyValueItem
                label="Active Campaigns"
                value={
                  periodizedCampaigns.filter(({ metrics }) => metrics.ftd > 0 || metrics.clicks > 0)
                    .length || partner.campaignsActive
                }
                icon={
                  <AppIcon
                    name="CampaignOutlined"
                    fallback={CampaignOutlinedIcon}
                    sx={{ fontSize: 18, opacity: 0.85 }}
                  />
                }
              />
              <KeyValueItem
                label="Clicks"
                value={periodizedCampaigns
                  .reduce((sum, { metrics }) => sum + metrics.clicks, 0)
                  .toLocaleString()}
                icon={
                  <AppIcon
                    name="TouchAppOutlined"
                    fallback={TouchAppOutlinedIcon}
                    sx={{ fontSize: 18, opacity: 0.85 }}
                  />
                }
              />
              <KeyValueItem
                label="Total FTD"
                value={periodizedCampaigns.reduce((sum, { metrics }) => sum + metrics.ftd, 0)}
                icon={
                  <AppIcon
                    name="PersonAddOutlined"
                    fallback={PersonAddOutlinedIcon}
                    sx={{ fontSize: 18, opacity: 0.85 }}
                  />
                }
              />
              <KeyValueItem
                label="Avg CR%"
                value={formatPercent(
                  periodizedCampaigns.length > 0
                    ? periodizedCampaigns.reduce((sum, { metrics }) => sum + metrics.cr, 0) /
                        periodizedCampaigns.length
                    : 0
                )}
                icon={
                  <AppIcon
                    name="ShowChartOutlined"
                    fallback={ShowChartOutlinedIcon}
                    sx={{ fontSize: 18, opacity: 0.85 }}
                  />
                }
              />
              <KeyValueItem
                label="CAC"
                value={(() => {
                  const totalFtd = periodizedCampaigns.reduce(
                    (sum, { metrics }) => sum + metrics.ftd,
                    0
                  );
                  return totalFtd > 0 ? formatCurrency(financePeriod.total / totalFtd) : '-';
                })()}
                icon={
                  <AppIcon
                    name="PaidOutlined"
                    fallback={PaidOutlinedIcon}
                    sx={{ fontSize: 18, opacity: 0.85 }}
                  />
                }
              />
              <KeyValueItem
                label="ROI"
                value={(() => {
                  const roi =
                    financePeriod.total > 0
                      ? ((financePeriod.paid - financePeriod.total) / financePeriod.total) * 100
                      : 0;
                  return `${roi > 0 ? '+' : ''}${formatPercent(roi)}`;
                })()}
                color={financePeriod.paid >= financePeriod.total ? 'success.main' : 'error.main'}
                icon={
                  <AppIcon
                    name="TrendingUpOutlined"
                    fallback={TrendingUpOutlinedIcon}
                    sx={{ fontSize: 18, opacity: 0.85 }}
                  />
                }
              />
            </Box>
          </Paper>
        )}

        {/* 3. Meetings */}
        {visibleBlocks.meetings && partner && (
          <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'span 6', md: 'span 12' } }}>
            <MeetingActionsBlock
              meetings={meetings}
              partner={partner}
              partnerId={id}
              onPartnerRefetch={fetchPartner}
              onMeetingsRefetch={refetchMeetings}
            />
            <Paper
              ref={meetingsSectionRef}
              id="meetings"
              variant="outlined"
              sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 3, mt: 2, bgcolor: 'background.paper' }}
            >
              <MeetingsSection
                meetings={meetings}
                loading={meetingsLoading}
                partnerId={id}
                partnerName={partner?.name}
                onCreateMeeting={createMeeting}
                onUpdateMeeting={updateMeeting}
                onFinishRecording={finishRecording}
                onUploadRecording={uploadRecording}
                onDeleteMeeting={deleteMeeting}
                onRefetch={refetchMeetings}
                initialOpenMeetingId={openMeetingId}
                initialMeetingActionRequest={meetingActionRequest}
                onClearOpenMeetingId={() => setOpenMeetingId(null)}
                onConsumeInitialMeetingActionRequest={() => setMeetingActionRequest(null)}
                onViewTasks={isPartnerRole ? undefined : openTaskManager}
              />
            </Paper>
          </Box>
        )}

        {/* 4. Finance - full width (12 cols) */}
        {visibleBlocks.finance && (
          <Paper
            variant="outlined"
            sx={{
              gridColumn: { xs: '1 / -1', sm: 'span 6', md: 'span 12' },
              p: { xs: 1.5, md: 2 },
              borderRadius: 3,
              bgcolor: 'background.paper',
              overflow: 'hidden',
            }}
          >
            <SectionHeader
              title="Finance"
              subtitle={`Payment data for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}. Same period as above.`}
              action={
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AppIcon name="Add" fallback={AddIcon} />}
                  onClick={() => {
                    setEditingPayment(null);
                    setAddPaymentDialogOpen(true);
                  }}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                >
                  Add payment
                </Button>
              }
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip
                label={`Total: ${formatCurrency(financePeriod.total)}`}
                size="small"
                sx={{ bgcolor: '#F1F5F9', color: '#64748B', fontWeight: 700 }}
              />
              <Chip
                label={`Paid: ${formatCurrency(financePeriod.paid)}`}
                size="small"
                sx={{ bgcolor: '#D1FAE5', color: '#059669', fontWeight: 700 }}
              />
              <Chip
                label={`Debt: ${formatCurrency(financePeriod.debt)}`}
                size="small"
                sx={{ bgcolor: '#FEE2E2', color: '#DC2626', fontWeight: 700 }}
              />
            </Box>
            <TableContainer sx={{ overflow: 'auto' }}>
              <Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { border: 0 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        py: 1.5,
                        px: 1.5,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: (theme) => alpha(theme.palette.divider, 0.08),
                        borderRadius: '14px 0 0 14px',
                      }}
                    >
                      Date/Time
                    </TableCell>
                    <TableCell
                      sx={{
                        py: 1.5,
                        px: 1.5,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: (theme) => alpha(theme.palette.divider, 0.08),
                      }}
                    >
                      Payment Description
                    </TableCell>
                    <TableCell
                      sx={{
                        py: 1.5,
                        px: 1.5,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: (theme) => alpha(theme.palette.divider, 0.08),
                      }}
                    >
                      Type
                    </TableCell>
                    <TableCell
                      sx={{
                        py: 1.5,
                        px: 1.5,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: (theme) => alpha(theme.palette.divider, 0.08),
                      }}
                    >
                      Method
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        py: 1.5,
                        px: 1.5,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: (theme) => alpha(theme.palette.divider, 0.08),
                      }}
                    >
                      Amount
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        py: 1.5,
                        px: 1,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: (theme) => alpha(theme.palette.divider, 0.08),
                        borderRadius: '0 14px 14px 0',
                        width: 70,
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {financePayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 4, textAlign: 'center', border: 0 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                          No payments for this period
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ display: 'block', mt: 0.5 }}
                        >
                          Click &quot;Add payment&quot; to record a new transaction.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    financePayments.map((payment) => (
                      <TableRow
                        key={payment.id}
                        hover
                        sx={{ '&:last-child td': { borderBottom: 0 } }}
                      >
                        <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'top' }}>
                          <Typography variant="caption">
                            {formatPaymentDateTime(payment.datetime)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'top' }}>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {payment.description}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.secondary', fontSize: '0.68rem' }}
                            >
                              {payment.type === 'crypto'
                                ? `Hash: ${payment.hash || 'pending-hash'}`
                                : `Statement: ${payment.statement || 'uploaded'}`}
                            </Typography>
                            {payment.affiliateNetwork && (
                              <Chip
                                label={payment.affiliateNetwork}
                                size="small"
                                variant="outlined"
                                sx={{ height: 16, fontSize: '0.6rem', py: 0, borderRadius: 1 }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'top' }}>
                          <Chip
                            label={payment.type}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.62rem',
                              textTransform: 'uppercase',
                              bgcolor: payment.type === 'crypto' ? '#E0E7FF' : '#ECFEFF',
                              color: payment.type === 'crypto' ? '#4338CA' : '#0E7490',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'top' }}>
                          <Typography variant="caption">{payment.method}</Typography>
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ py: 1.5, px: 1.5, fontWeight: 700, verticalAlign: 'top' }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {payment.type === 'crypto'
                              ? Number(payment.amount).toFixed(6)
                              : Number(payment.amount).toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1, px: 0.5, verticalAlign: 'top' }}>
                          <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center' }}>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setEditingPayment(payment);
                                setAddPaymentDialogOpen(true);
                              }}
                              sx={{
                                p: 0.5,
                                color: 'text.secondary',
                                '&:hover': { color: 'primary.main' },
                              }}
                            >
                              <AppIcon
                                name="EditOutlined"
                                fallback={EditOutlinedIcon}
                                sx={{ fontSize: 16 }}
                              />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setEditingPayment(payment);
                                setAddPaymentDialogOpen(true);
                              }}
                              sx={{
                                p: 0.5,
                                color: 'text.secondary',
                                '&:hover': { color: 'error.main' },
                              }}
                            >
                              <AppIcon
                                name="DeleteOutline"
                                fallback={DeleteIcon}
                                sx={{ fontSize: 16 }}
                              />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* 6. Materials - row 5 left (6 cols), tablet 3 cols */}
        {visibleBlocks.materials && (
          <Paper
            variant="outlined"
            sx={{
              gridColumn: { xs: '1 / -1', sm: 'span 3', md: 'span 6' },
              p: { xs: 1.5, md: 2 },
              borderRadius: 3,
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 280,
              overflow: 'hidden',
            }}
          >
            <SectionHeader
              title="Materials"
              subtitle="Uploaded partner materials and assets."
              action={
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setMaterialDialog({ open: true, partner, material: null })}
                  startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 16 }} />}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    height: 30,
                    whiteSpace: 'nowrap',
                    px: 1.5,
                    minWidth: 'auto',
                    borderColor: 'divider',
                    color: 'text.primary',
                    '&:hover': { borderColor: 'text.secondary', bgcolor: 'transparent' },
                  }}
                >
                  Material
                </Button>
              }
            />
            {materials.length === 0 ? (
              <Box
                sx={{
                  py: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (t) => alpha(t.palette.grey[500], 0.06),
                  borderRadius: 2,
                  border: '1px dashed',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No materials uploaded yet
                </Typography>
              </Box>
            ) : (
              <Stack spacing={0} sx={{ maxHeight: 320, overflowY: 'auto' }}>
                {materials.map((m) => (
                  <Box
                    key={m.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1.25,
                      borderRadius: 2,
                      '&:hover': { bgcolor: (t) => alpha(t.palette.divider, 0.08) },
                      '&:hover .mat-actions': { opacity: 1 },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ fontWeight: 600, fontSize: '0.85rem' }}
                      >
                        {m.name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.7rem' }}
                        >
                          {formatDate(m.uploadedAt)}
                        </Typography>
                        {m.type && (
                          <Chip
                            label={m.type}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              bgcolor: (t) => alpha(t.palette.divider, 0.15),
                              borderRadius: 1,
                            }}
                          />
                        )}
                        {(() => {
                          const nets =
                            m.affiliateNetworks || (m.affiliateNetwork ? [m.affiliateNetwork] : []);
                          return nets.map((net) => (
                            <Chip
                              key={net}
                              label={net}
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                py: 0,
                                borderRadius: 1,
                                borderColor: 'primary.light',
                                color: 'primary.main',
                              }}
                            />
                          ));
                        })()}
                        {(m.links || []).length > 0 && (
                          <Typography
                            variant="caption"
                            color="primary"
                            sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                          >
                            {m.links.length} link{m.links.length !== 1 ? 's' : ''}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Box
                      className="mat-actions"
                      sx={{
                        display: 'flex',
                        gap: 0.25,
                        opacity: 0,
                        transition: 'opacity 0.15s',
                        flexShrink: 0,
                      }}
                    >
                      <IconButton
                        size="small"
                        sx={{ color: 'text.secondary' }}
                        onClick={() => setMaterialDialog({ open: true, partner, material: m })}
                      >
                        <AppIcon
                          name="EditOutlined"
                          fallback={EditOutlinedIcon}
                          sx={{ fontSize: 16 }}
                        />
                      </IconButton>
                      <IconButton
                        size="small"
                        sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                        onClick={() => handleDeleteMaterial(m.id)}
                      >
                        <AppIcon name="DeleteOutline" fallback={DeleteIcon} sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        )}

        {/* 7. Links - compact, no scroll; detail popup on row click */}
        {visibleBlocks.links &&
          (() => {
            const MAX_VISIBLE = 4;
            const visibleLinks = monitoredLinks.slice(0, MAX_VISIBLE);
            const hasMore = monitoredLinks.length > MAX_VISIBLE;
            const truncateUrl = (url, max = 42) =>
              url.length <= max ? url : `${url.slice(0, max)}…`;
            return (
              <Paper
                variant="outlined"
                sx={{
                  gridColumn: { xs: '1 / -1', sm: 'span 3', md: 'span 6' },
                  p: { xs: 2, md: 2.5 },
                  borderRadius: 3,
                  bgcolor: 'background.paper',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <SectionHeader
                  title="Links Monitoring"
                  subtitle="Partner links and campaigns. Click a row to view full details."
                  action={
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => {
                        setNewLinkNetwork(
                          selectedNetwork !== 'All' ? selectedNetwork : 'ClickDealer'
                        );
                        setAddLinkDialogOpen(true);
                      }}
                      startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 16 }} />}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 2,
                        whiteSpace: 'nowrap',
                        px: 1.5,
                        minWidth: 'auto',
                        height: 30,
                        fontSize: '0.75rem',
                      }}
                    >
                      Link
                    </Button>
                  }
                />
                {monitoredLinks.length === 0 ? (
                  <Box
                    sx={{
                      py: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: (t) => alpha(t.palette.grey[500], 0.06),
                      borderRadius: 2,
                      border: '1px dashed',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No links yet
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Table
                      size="small"
                      sx={{
                        '& .MuiTableCell-root': { border: 0, py: 1, px: 1.5 },
                        '& .MuiTableRow-root': { cursor: 'pointer' },
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.7rem',
                              color: 'text.secondary',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              pb: 0.5,
                            }}
                          >
                            URL
                          </TableCell>
                          <TableCell
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.7rem',
                              color: 'text.secondary',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              pb: 0.5,
                            }}
                          >
                            Affiliate Network
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.7rem',
                              color: 'text.secondary',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              pb: 0.5,
                            }}
                          >
                            Actions
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {visibleLinks.map((link) => (
                          <TableRow
                            key={link.id}
                            hover
                            onClick={() => setLinkDetailLink(link)}
                            sx={{ '&:last-child td': { borderBottom: 0 } }}
                          >
                            <TableCell>
                              <Typography
                                component="a"
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                variant="body2"
                                onClick={(e) => e.stopPropagation()}
                                sx={{
                                  fontWeight: 500,
                                  color: 'primary.main',
                                  textDecoration: 'none',
                                  '&:hover': { textDecoration: 'underline' },
                                  display: 'block',
                                  maxWidth: 220,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {truncateUrl(link.url, 38)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 500, fontSize: '0.8rem' }}
                              >
                                {link.affiliateNetwork || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                                <IconButton
                                  size="small"
                                  sx={{ color: 'text.secondary' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLinkDetailLink(link);
                                  }}
                                >
                                  <AppIcon
                                    name="EditOutlined"
                                    fallback={EditOutlinedIcon}
                                    sx={{ fontSize: 16 }}
                                  />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  sx={{
                                    color: 'text.secondary',
                                    '&:hover': { color: 'error.main' },
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteLink(link);
                                  }}
                                >
                                  <AppIcon
                                    name="DeleteOutline"
                                    fallback={DeleteIcon}
                                    sx={{ fontSize: 16 }}
                                  />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {hasMore && (
                      <Button
                        size="small"
                        fullWidth
                        onClick={() => setLinksListDialogOpen(true)}
                        sx={{ mt: 1, textTransform: 'none', fontWeight: 600 }}
                      >
                        View all ({monitoredLinks.length} links)
                      </Button>
                    )}
                  </>
                )}
              </Paper>
            );
          })()}

        {/* Link detail popup */}
        {linkDetailLink && (
          <FormDialog
            open={!!linkDetailLink}
            onClose={() => setLinkDetailLink(null)}
            title="Link details"
            icon={CampaignOutlinedIcon}
            maxWidth="sm"
            actions={
              <>
                <Button onClick={() => setLinkDetailLink(null)}>Close</Button>
                <Button
                  startIcon={<AppIcon name="DeleteOutline" fallback={DeleteIcon} />}
                  onClick={() => handleDeleteLink(linkDetailLink)}
                  sx={{ textTransform: 'none', fontWeight: 600, color: 'error.main' }}
                >
                  Delete
                </Button>
                <Button
                  variant="outlined"
                  onClick={async () => {
                    const patch = {};
                    const nextUrl = linkDetailDraft.url.trim();
                    if (nextUrl && nextUrl !== (linkDetailLink.url || '')) patch.url = nextUrl;
                    if (linkDetailDraft.description !== (linkDetailLink.description || ''))
                      patch.description = linkDetailDraft.description;
                    if (
                      linkDetailDraft.affiliateNetwork !== (linkDetailLink.affiliateNetwork || '')
                    )
                      patch.affiliateNetwork = linkDetailDraft.affiliateNetwork;
                    if (Object.keys(patch).length === 0) return;
                    await handleUpdateLink(linkDetailLink, patch);
                  }}
                  disabled={
                    linkDetailDraft.url.trim() === (linkDetailLink.url || '') &&
                    linkDetailDraft.description === (linkDetailLink.description || '') &&
                    linkDetailDraft.affiliateNetwork === (linkDetailLink.affiliateNetwork || '')
                  }
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Save changes
                </Button>
                <Button
                  variant="contained"
                  onClick={() => {
                    handleTestNow(linkDetailLink);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Test now
                </Button>
              </>
            }
          >
            <Stack spacing={2}>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
                >
                  URL
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  value={linkDetailDraft.url}
                  placeholder="https://..."
                  onChange={(e) => setLinkDetailDraft((prev) => ({ ...prev, url: e.target.value }))}
                  sx={{ mt: 0.5, '& .MuiInputBase-root': { fontSize: '0.875rem' } }}
                />
                {linkDetailDraft.url && (
                  <Typography
                    component="a"
                    href={linkDetailDraft.url}
                    target="_blank"
                    rel="noreferrer"
                    variant="caption"
                    sx={{
                      display: 'inline-block',
                      mt: 0.75,
                      color: 'primary.main',
                      wordBreak: 'break-all',
                    }}
                  >
                    Open in new tab
                  </Typography>
                )}
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
                >
                  Description
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={linkDetailDraft.description}
                  placeholder="Add description..."
                  onChange={(e) =>
                    setLinkDetailDraft((prev) => ({ ...prev, description: e.target.value }))
                  }
                  sx={{ mt: 0.5, '& .MuiInputBase-root': { fontSize: '0.875rem' } }}
                />
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
                >
                  Affiliate Network
                </Typography>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={linkDetailDraft.affiliateNetwork || 'ClickDealer'}
                  onChange={(e) =>
                    setLinkDetailDraft((prev) => ({ ...prev, affiliateNetwork: e.target.value }))
                  }
                  sx={{ mt: 0.5 }}
                >
                  {['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'].map((net) => (
                    <MenuItem key={net} value={net}>
                      {net}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
                >
                  Testing status
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  {linkDetailLink.status === 'Perfect' ? (
                    <Chip
                      size="small"
                      label="Perfect"
                      sx={{ bgcolor: '#D1FAE5', color: '#059669', fontWeight: 700 }}
                    />
                  ) : linkDetailLink.status === 'Have errors' ? (
                    <Chip
                      size="small"
                      label="Have errors"
                      sx={{ bgcolor: '#FEF3C7', color: '#D97706', fontWeight: 700 }}
                    />
                  ) : (
                    <Chip
                      size="small"
                      label={linkDetailLink.status}
                      sx={{ bgcolor: '#FEE2E2', color: '#DC2626', fontWeight: 700 }}
                    />
                  )}
                </Box>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    Testing date
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 500 }}>
                    {linkDetailLink.testedAt || 'Not tested yet'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    Uptime date
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 500 }}>
                    {linkDetailLink.uptimeDate || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </Stack>
          </FormDialog>
        )}

        {/* View all links dialog (when more than MAX_VISIBLE) */}
        <FormDialog
          open={linksListDialogOpen}
          onClose={() => setLinksListDialogOpen(false)}
          title={`All links (${monitoredLinks.length})`}
          icon={CampaignOutlinedIcon}
          maxWidth="sm"
          primaryLabel="Close"
          onPrimary={() => setLinksListDialogOpen(false)}
          hideCancel
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                  }}
                >
                  URL
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                  }}
                >
                  Affiliate Network
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                  }}
                >
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {monitoredLinks.map((link) => (
                <TableRow
                  key={link.id}
                  hover
                  onClick={() => {
                    setLinkDetailLink(link);
                    setLinksListDialogOpen(false);
                  }}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        maxWidth: 280,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {link.url}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{link.affiliateNetwork || '-'}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                      <IconButton
                        size="small"
                        sx={{ color: 'text.secondary' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLinkDetailLink(link);
                          setLinksListDialogOpen(false);
                        }}
                      >
                        <AppIcon
                          name="EditOutlined"
                          fallback={EditOutlinedIcon}
                          sx={{ fontSize: 16 }}
                        />
                      </IconButton>
                      <IconButton
                        size="small"
                        sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLink(link);
                        }}
                      >
                        <AppIcon name="DeleteOutline" fallback={DeleteIcon} sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </FormDialog>

        {/* 8. Tasks - full width (12 cols), same design as Tasks page (hidden for Partner role) */}
        {visibleBlocks.taskManager && !isPartnerRole && (
          <Paper
            variant="outlined"
            sx={{
              gridColumn: { xs: '1 / -1', sm: 'span 6', md: 'span 12' },
              borderRadius: 3,
              bgcolor: 'background.paper',
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              '&:hover': {
                borderColor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === 'dark' ? 0.3 : 0.25
                ),
                boxShadow: createHoverGlowShadow(theme),
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2.5,
                py: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor:
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.primary.main, 0.06)
                    : alpha(theme.palette.primary.main, 0.04),
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                }}
              >
                <AppIcon name="Assignment" fallback={AssignmentIcon} sx={{ fontSize: 22 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  Tasks
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.25 }}
                >
                  Tasks related to {partner.userId}.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="contained"
                startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 16 }} />}
                onClick={() =>
                  setSelectedTask({
                    isNew: true,
                    title: '',
                    priority: 'medium',
                    status: 'todo',
                    assignedTo: '',
                    deadline: '',
                    estimate: '',
                    description: '',
                    affiliateNetwork: selectedNetwork !== 'All' ? selectedNetwork : 'ClickDealer',
                  })
                }
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                  px: 1.5,
                  minWidth: 'auto',
                  height: 30,
                  fontSize: '0.75rem',
                }}
              >
                Create Task
              </Button>
            </Box>
            <Box sx={{ p: { xs: 1.5, md: 2 } }}>
              {relatedTasks.length === 0 ? (
                <Box
                  sx={{
                    p: 4,
                    textAlign: 'center',
                    bgcolor: 'background.default',
                    borderRadius: 2,
                    border: '1px dashed',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    No tasks found for this user.
                  </Typography>
                </Box>
              ) : (
                <DragDropContext onDragEnd={handleTaskDragEnd}>
                  <Box sx={{ display: 'flex', gap: 3, overflowX: 'auto', pb: 2, minHeight: 420 }}>
                    {TASK_COLUMNS.map((col) => {
                      const config = (
                        theme.palette.mode === 'dark' ? statusConfigDark : statusConfigLight
                      )[col];
                      const colTasks = relatedTasks.filter((task) => task.status === col);
                      return (
                        <Paper
                          key={col}
                          elevation={0}
                          sx={{
                            flex: '0 0 340px',
                            bgcolor: config.bg ?? theme.palette.background.paper,
                            borderRadius: 3,
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            border: `1px solid ${config.border}`,
                          }}
                        >
                          <Box
                            sx={{
                              p: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              borderBottom: `1px solid ${config.border}`,
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography
                                variant="subtitle1"
                                sx={{ fontWeight: 700, color: config.color }}
                              >
                                {config.label}
                              </Typography>
                              <Chip
                                label={colTasks.length}
                                size="small"
                                sx={{
                                  height: 24,
                                  fontWeight: 700,
                                  borderRadius: 2,
                                  bgcolor:
                                    theme.palette.mode === 'dark'
                                      ? 'rgba(255,255,255,0.08)'
                                      : 'background.paper',
                                  color: config.color,
                                  border:
                                    theme.palette.mode === 'dark'
                                      ? '1px solid rgba(255,255,255,0.08)'
                                      : 'none',
                                }}
                              />
                            </Box>
                          </Box>
                          <Droppable droppableId={col}>
                            {(provided, snapshot) => (
                              <Box
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                sx={{
                                  flex: 1,
                                  p: 1.5,
                                  overflowY: 'auto',
                                  transition: 'background-color 0.2s',
                                  bgcolor: snapshot.isDraggingOver
                                    ? alpha(config.color, 0.05)
                                    : 'transparent',
                                }}
                              >
                                {colTasks.map((task, index) => {
                                  const pConfig = (
                                    theme.palette.mode === 'dark'
                                      ? priorityConfigDark
                                      : priorityConfigLight
                                  )[task.priority || 'low'];
                                  return (
                                    <Draggable
                                      key={`${partner.id}-${task.id}`}
                                      draggableId={`${partner.id}-${task.id}`}
                                      index={index}
                                    >
                                      {(dragProvided, dragSnapshot) => (
                                        <Card
                                          ref={dragProvided.innerRef}
                                          {...dragProvided.draggableProps}
                                          {...dragProvided.dragHandleProps}
                                          onClick={() => setSelectedTask(task)}
                                          elevation={dragSnapshot.isDragging ? 8 : 0}
                                          sx={{
                                            mb: 1.5,
                                            borderRadius: 2,
                                            border: '1px solid',
                                            borderColor: dragSnapshot.isDragging
                                              ? 'primary.main'
                                              : 'divider',
                                            cursor: 'grab',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                              borderColor: 'primary.light',
                                              transform: 'translateY(-2px)',
                                              boxShadow: createHoverGlowShadow(theme),
                                            },
                                          }}
                                        >
                                          <CardContent sx={{ p: '16px !important' }}>
                                            <Box
                                              sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                mb: 1,
                                              }}
                                            >
                                              <Chip
                                                label={task.assignedTo || 'Unassigned'}
                                                size="small"
                                                sx={{
                                                  height: 20,
                                                  fontSize: '0.7rem',
                                                  maxWidth: 120,
                                                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                                                  color: 'primary.main',
                                                  fontWeight: 600,
                                                }}
                                              />
                                              <Chip
                                                icon={<PriorityBarsIcon color={pConfig.color} />}
                                                label={(task.priority || 'low').toUpperCase()}
                                                size="small"
                                                sx={{
                                                  height: 28,
                                                  fontSize: '0.75rem',
                                                  px: 0.5,
                                                  bgcolor: pConfig.bg,
                                                  color: pConfig.color,
                                                  fontWeight: 700,
                                                  borderRadius: 2,
                                                  border: '2px solid',
                                                  borderColor: pConfig.color,
                                                  '& .MuiChip-icon': { ml: 0.5 },
                                                  '& .MuiChip-label': { px: 0.75 },
                                                }}
                                              />
                                            </Box>

                                            <Typography
                                              variant="subtitle2"
                                              sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.3 }}
                                            >
                                              {task.title}
                                            </Typography>

                                            <Typography
                                              variant="body2"
                                              color="text.secondary"
                                              sx={{
                                                mb: 1.5,
                                                fontSize: '0.8rem',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                              }}
                                            >
                                              {task.description || 'No description'}
                                            </Typography>

                                            <Divider sx={{ my: 1 }} />

                                            <Box
                                              sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                mt: 1,
                                              }}
                                            >
                                              <Box
                                                sx={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: 0.5,
                                                }}
                                              >
                                                <AppIcon
                                                  name="PersonOutline"
                                                  fallback={PersonOutlineIcon}
                                                  sx={{ fontSize: 16, color: 'text.secondary' }}
                                                />
                                                <Typography
                                                  variant="caption"
                                                  color="text.secondary"
                                                >
                                                  {task.assignedTo || 'Unassigned'}
                                                </Typography>
                                              </Box>
                                              {task.deadline && (
                                                <Box
                                                  sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 0.5,
                                                  }}
                                                >
                                                  <AppIcon
                                                    name="CalendarToday"
                                                    fallback={CalendarTodayIcon}
                                                    sx={{ fontSize: 14, color: 'text.secondary' }}
                                                  />
                                                  <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                  >
                                                    {task.deadline}
                                                  </Typography>
                                                </Box>
                                              )}
                                            </Box>
                                          </CardContent>
                                        </Card>
                                      )}
                                    </Draggable>
                                  );
                                })}
                                {provided.placeholder}
                              </Box>
                            )}
                          </Droppable>
                        </Paper>
                      );
                    })}
                  </Box>
                </DragDropContext>
              )}
            </Box>
          </Paper>
        )}

        {/* 9. Analytics - full width (12 cols) */}
        {visibleBlocks.analytics && (
          <Paper
            variant="outlined"
            sx={{
              gridColumn: { xs: '1 / -1', sm: 'span 6', md: 'span 12' },
              p: { xs: 1.5, md: 2 },
              borderRadius: 3,
              bgcolor: 'background.paper',
              overflow: 'hidden',
            }}
          >
            <SectionHeader
              title="Analytics"
              subtitle={`Visual campaign and finance analysis for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}.`}
            />

            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                alignItems: 'start',
              }}
            >
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                  Campaign Performance
                </Typography>
                <Box sx={{ height: 260, width: '100%' }}>
                  <ResponsiveContainer>
                    <BarChart data={campaignPerformanceData} barSize={24}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis
                        dataKey="fullName"
                        tick={renderAngledCampaignTick}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        height={74}
                        tickMargin={10}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: '#F1F5F9' }}
                        labelFormatter={(label) => label}
                        contentStyle={{
                          borderRadius: 8,
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Bar dataKey="ftd" name="FTD" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="clicks" name="Clicks" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                  ROI & CAC by Campaign
                </Typography>
                <Box sx={{ height: 260, width: '100%' }}>
                  <ResponsiveContainer>
                    <ComposedChart data={campaignRoiCacData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis
                        dataKey="fullName"
                        tick={renderAngledCampaignTick}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        height={74}
                        tickMargin={10}
                      />
                      <YAxis
                        yAxisId="cac"
                        tickFormatter={(v) => `$${Math.round(v)}`}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                      />
                      <YAxis
                        yAxisId="roi"
                        orientation="right"
                        tickFormatter={(v) => `${Math.round(v)}%`}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                      />
                      <Tooltip
                        labelFormatter={(label) => label}
                        formatter={(value, name, entry) => {
                          if (name === 'CAC') return [formatCurrency(Number(value || 0)), 'CAC'];
                          if (name === 'ROI') return [`${Number(value || 0).toFixed(2)}%`, 'ROI'];
                          if (name === 'Source') return [value, 'Data source'];
                          return [value, name];
                        }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const row = payload[0]?.payload || {};
                          return (
                            <Box
                              sx={{
                                bgcolor: 'background.paper',
                                border: '1px solid #E2E8F0',
                                borderRadius: 2,
                                p: 1.25,
                                boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 700,
                                  color: 'text.primary',
                                  display: 'block',
                                  mb: 0.5,
                                }}
                              >
                                {label}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ color: '#0369A1', display: 'block' }}
                              >
                                CAC: {formatCurrency(Number(row.cac || 0))}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ color: '#7C3AED', display: 'block' }}
                              >
                                ROI: {Number(row.roi || 0).toFixed(2)}%
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}
                              >
                                Source: {row.source || '-'}
                              </Typography>
                            </Box>
                          );
                        }}
                        contentStyle={{
                          borderRadius: 8,
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend verticalAlign="top" height={24} iconType="circle" />
                      <Bar
                        yAxisId="cac"
                        dataKey="cac"
                        name="CAC"
                        fill="#0EA5E9"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                      <Line
                        yAxisId="roi"
                        type="monotone"
                        dataKey="roi"
                        name="ROI"
                        stroke="#8B5CF6"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#8B5CF6', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Box>
                <Stack direction="row" spacing={1} justifyContent="center">
                  <Chip
                    label={`Avg CAC: ${formatCurrency(
                      campaignRoiCacData.length
                        ? campaignRoiCacData.reduce((sum, item) => sum + item.cac, 0) /
                            campaignRoiCacData.length
                        : 0
                    )}`}
                    size="small"
                    sx={{
                      bgcolor: alpha('#0EA5E9', 0.1),
                      color: '#0369A1',
                      fontWeight: 700,
                      borderRadius: 1.5,
                      height: 24,
                      fontSize: '0.72rem',
                    }}
                  />
                  <Chip
                    label={`Avg ROI: ${
                      campaignRoiCacData.length
                        ? `${(
                            campaignRoiCacData.reduce((sum, item) => sum + item.roi, 0) /
                            campaignRoiCacData.length
                          ).toFixed(2)}%`
                        : '0.00%'
                    }`}
                    size="small"
                    sx={{
                      bgcolor: alpha('#8B5CF6', 0.1),
                      color: '#7C3AED',
                      fontWeight: 700,
                      borderRadius: 1.5,
                      height: 24,
                      fontSize: '0.72rem',
                    }}
                  />
                </Stack>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                  CR% Trend by Campaign
                </Typography>
                <Box sx={{ height: 260, width: '100%' }}>
                  <ResponsiveContainer>
                    <LineChart data={crTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis
                        dataKey="fullName"
                        tick={renderAngledCampaignTick}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        height={74}
                        tickMargin={10}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        labelFormatter={(label) => label}
                        formatter={(value) => `${value}%`}
                      />
                      <Line
                        type="monotone"
                        dataKey="cr"
                        stroke="#8B5CF6"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#8B5CF6', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </Box>
          </Paper>
        )}
      </Box>
      {/* Create / Edit Task popup - matches Tasks page layout */}
      {selectedTask && partner && (
        <FormDialog
          open={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          title={selectedTask.isNew ? 'Create Task' : 'Edit Task'}
          icon={selectedTask.isNew ? AddIcon : EditOutlinedIcon}
          maxWidth="sm"
          footerJustify="space-between"
          actions={
            <>
              {!selectedTask.isNew && (
                <Button
                  onClick={handleDeleteTask}
                  color="error"
                  startIcon={<AppIcon name="DeleteOutline" fallback={DeleteIcon} />}
                  sx={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'none' }}
                >
                  Delete
                </Button>
              )}
              <Box sx={{ display: 'flex', gap: 1.5, ml: selectedTask.isNew ? 'auto' : 0 }}>
                <Button
                  onClick={() => setSelectedTask(null)}
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                    textTransform: 'none',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveTaskChanges}
                  variant="contained"
                  disableElevation
                  disabled={selectedTask.isNew && !selectedTask.title?.trim()}
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    borderRadius: 2,
                    textTransform: 'none',
                  }}
                >
                  {selectedTask.isNew ? 'Create Task' : 'Save Changes'}
                </Button>
              </Box>
            </>
          }
        >
          <Stack spacing={3.5}>
            <TextField
              label="Task Title"
              fullWidth
              value={selectedTask.title || ''}
              onChange={(e) => handleTaskFieldChange('title', e.target.value)}
              variant="outlined"
              size="small"
              InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem' },
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                    <AppIcon name="Assignment" fallback={AssignmentIcon} sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2.5 }}>
              <FormControl
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                <InputLabel
                  shrink
                  id="partner-detail-task-priority-label"
                  sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
                >
                  Priority
                </InputLabel>
                <Select
                  labelId="partner-detail-task-priority-label"
                  value={selectedTask.priority || 'medium'}
                  label="Priority"
                  onChange={(e) => handleTaskFieldChange('priority', e.target.value)}
                  displayEmpty
                  sx={{ fontSize: '0.9375rem' }}
                  renderValue={(value) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AppIcon
                        name="FlagOutlined"
                        fallback={FlagOutlinedIcon}
                        sx={{ fontSize: 17, color: 'text.secondary' }}
                      />
                      <span>
                        {(value || 'medium').charAt(0).toUpperCase() + (value || 'medium').slice(1)}
                      </span>
                    </Box>
                  )}
                >
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
              <FormControl
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                <InputLabel
                  shrink
                  id="partner-detail-task-network-label"
                  sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
                >
                  Affiliate Network
                </InputLabel>
                <Select
                  labelId="partner-detail-task-network-label"
                  value={selectedTask.affiliateNetwork || 'ClickDealer'}
                  label="Affiliate Network"
                  onChange={(e) => handleTaskFieldChange('affiliateNetwork', e.target.value)}
                  displayEmpty
                  sx={{ fontSize: '0.9375rem' }}
                >
                  {['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'].map((net) => (
                    <MenuItem key={net} value={net}>
                      {net}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Deadline"
                type="date"
                fullWidth
                size="small"
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                value={selectedTask.deadline || ''}
                onChange={(e) => handleTaskFieldChange('deadline', e.target.value)}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon
                        name="CalendarToday"
                        fallback={CalendarTodayIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
              <TextField
                label="Assigned To"
                fullWidth
                size="small"
                value={selectedTask.assignedTo || ''}
                onChange={(e) => handleTaskFieldChange('assignedTo', e.target.value)}
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon
                        name="PersonOutline"
                        fallback={PersonOutlineIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                label="Estimate"
                fullWidth
                size="small"
                value={selectedTask.estimate || ''}
                onChange={(e) => handleTaskFieldChange('estimate', e.target.value)}
                placeholder="e.g. 4h"
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon name="Schedule" fallback={ScheduleIcon} sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>

            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={4}
              size="small"
              value={selectedTask.description || ''}
              onChange={(e) => handleTaskFieldChange('description', e.target.value)}
              InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem', py: 1.25 },
                startAdornment: (
                  <InputAdornment
                    position="start"
                    sx={{ color: 'text.secondary', alignSelf: 'flex-start', mt: 1.5, mr: 0 }}
                  >
                    <AppIcon
                      name="NotesOutlined"
                      fallback={NotesOutlinedIcon}
                      sx={{ fontSize: 18 }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <Box
              sx={{
                pt: 2,
                px: 2,
                pb: 2,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.12),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
                <AppIcon
                  name="InfoOutlined"
                  fallback={InfoOutlinedIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  System Info
                </Typography>
              </Box>
              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary', mr: 0.5 }}>
                    ID:
                  </Box>
                  {selectedTask.isNew ? 'New' : selectedTask.taskId || selectedTask.id || '-'}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary', mr: 0.5 }}>
                    Partner:
                  </Box>
                  {partner?.name || '-'}
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </FormDialog>
      )}
      <Paper
        variant="outlined"
        sx={{
          mb: 2.5,
          borderRadius: 3,
          p: { xs: 1.25, sm: 1.5 },
          borderColor: alpha(theme.palette.error.main, 0.25),
          bgcolor: alpha(theme.palette.error.main, 0.03),
        }}
      >
        <SectionHeader
          title="Archive partner process"
          subtitle="Use this when the account should be removed from active operations but retained for governance and traceability."
          action={
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={
                <AppIcon name="DeleteOutline" fallback={DeleteIcon} sx={{ fontSize: 16 }} />
              }
              onClick={() => setArchiveConfirmOpen(true)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
            >
              Delete partner
            </Button>
          }
        />
        <Stack spacing={0.8}>
          <Typography variant="body2" color="text.secondary">
            The partner is moved to archive, hidden from the active Partners list, and can be
            audited later.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Related actions and history are preserved to maintain full accountability.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This action does not hard-delete records from the database.
          </Typography>
        </Stack>
      </Paper>
      {/* Add Link Dialog */}
      <FormDialog
        open={addLinkDialogOpen}
        onClose={() => setAddLinkDialogOpen(false)}
        title="Add Link"
        icon={AddIcon}
        maxWidth="sm"
        primaryLabel="Add Link"
        onPrimary={handleAddLink}
        primaryDisabled={!newLinkUrl.trim()}
      >
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            label="URL"
            size="small"
            fullWidth
            placeholder="https://example.com/landing"
            value={newLinkUrl}
            onChange={(e) => setNewLinkUrl(e.target.value)}
          />
          <TextField
            label="Description"
            size="small"
            fullWidth
            placeholder="Main offer LP for testing"
            value={newLinkDescription}
            onChange={(e) => setNewLinkDescription(e.target.value)}
          />
          <TextField
            select
            label="Affiliate Network"
            size="small"
            fullWidth
            value={newLinkNetwork}
            onChange={(e) => setNewLinkNetwork(e.target.value)}
          >
            {['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'].map((net) => (
              <MenuItem key={net} value={net}>
                {net}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </FormDialog>
      {/* Edit Dialog */}
      <FormDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit Partner Details"
        icon={EditOutlinedIcon}
        maxWidth="sm"
        primaryLabel="Save Changes"
        onPrimary={handleSaveDetailFields}
      >
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {/* Teams management */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, fontSize: '0.85rem', mb: 1, color: 'text.primary' }}
            >
              Teams
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {(editForm.teams || []).map((team, idx) => (
                <Box
                  key={team.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.75,
                    px: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      width: 20,
                      textAlign: 'center',
                    }}
                  >
                    {idx + 1}
                  </Typography>
                  <TextField
                    size="small"
                    variant="standard"
                    value={team.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditForm((prev) => ({
                        ...prev,
                        teams: prev.teams.map((t) => (t.id === team.id ? { ...t, name: val } : t)),
                      }));
                    }}
                    sx={{
                      flex: 1,
                      '& .MuiInput-input': { fontSize: '0.85rem', fontWeight: 600, py: 0.25 },
                    }}
                    InputProps={{ disableUnderline: false }}
                  />
                  <MuiTooltip title="Remove team">
                    <IconButton
                      size="small"
                      onClick={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          teams: prev.teams.filter((t) => t.id !== team.id),
                        }))
                      }
                      sx={{
                        p: 0.5,
                        color: 'error.main',
                        opacity: 0.6,
                        '&:hover': { opacity: 1 },
                      }}
                    >
                      <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 16 }} />
                    </IconButton>
                  </MuiTooltip>
                </Box>
              ))}
              {editForm.teams.length === 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ py: 1, textAlign: 'center' }}
                >
                  No teams yet. Add one below.
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                size="small"
                placeholder="New team name..."
                value={editForm.newTeamName}
                onChange={(e) => setEditForm((prev) => ({ ...prev, newTeamName: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editForm.newTeamName.trim()) {
                    e.preventDefault();
                    setEditForm((prev) => ({
                      ...prev,
                      teams: [
                        ...prev.teams,
                        {
                          id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                          name: prev.newTeamName.trim(),
                        },
                      ],
                      newTeamName: '',
                    }));
                  }
                }}
                sx={{ flex: 1 }}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={!editForm.newTeamName.trim()}
                onClick={() =>
                  setEditForm((prev) => ({
                    ...prev,
                    teams: [
                      ...prev.teams,
                      {
                        id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        name: prev.newTeamName.trim(),
                      },
                    ],
                    newTeamName: '',
                  }))
                }
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, minWidth: 80 }}
                startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 16 }} />}
              >
                Add
              </Button>
            </Box>
          </Box>

          <Divider />

          {/* Group Type - radio buttons matching creation dialog */}
          <FormControl>
            <FormLabel sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Group Type</FormLabel>
            <RadioGroup
              row
              value={editForm.group}
              onChange={(e) => setEditForm((prev) => ({ ...prev, group: e.target.value }))}
            >
              {GROUP_TYPES.map((type) => (
                <FormControlLabel
                  key={type}
                  value={type}
                  control={<Radio size="small" />}
                  label={
                    <Typography variant="body2">
                      {type} {GROUP_SUBTYPES[type] ? `(${GROUP_SUBTYPES[type]})` : ''}
                    </Typography>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>

          {/* Category / Industry */}
          <FormControl>
            <FormLabel sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Category / Industry</FormLabel>
            <RadioGroup
              row
              value={editForm.category || 'Gambling'}
              onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
            >
              {['Gambling', 'Ecommerce', 'Fintech'].map((cat) => (
                <FormControlLabel
                  key={cat}
                  value={cat}
                  control={<Radio size="small" />}
                  label={<Typography variant="body2">{cat}</Typography>}
                />
              ))}
            </RadioGroup>
          </FormControl>

          {/* Traffic Sources - multi-select Autocomplete matching creation dialog */}
          <Autocomplete
            multiple
            blurOnSelect
            options={TRAFFIC_SOURCES}
            value={editForm.trafficSources || []}
            onChange={(_, nextValues) =>
              setEditForm((prev) => ({ ...prev, trafficSources: nextValues }))
            }
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox checked={selected} size="small" sx={{ mr: 1 }} />
                {option}
              </li>
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, idx) => (
                <Chip size="small" label={option} {...getTagProps({ index: idx })} key={option} />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Traffic Sources"
                size="small"
                placeholder={editForm.trafficSources?.length ? '' : 'Choose one or more'}
              />
            )}
          />

          {/* Geo / Country - multi-select Autocomplete matching creation dialog */}
          <Autocomplete
            multiple
            blurOnSelect
            options={Object.keys(COUNTRY_FLAGS).map((code) => ({
              code,
              label: `${COUNTRY_FLAGS[code] || ''} ${code}`.trim(),
            }))}
            value={(editForm.geos || []).map((code) => ({
              code,
              label: `${COUNTRY_FLAGS[code] || ''} ${code}`.trim(),
            }))}
            onChange={(_, nextValues) =>
              setEditForm((prev) => ({ ...prev, geos: nextValues.map((item) => item.code) }))
            }
            isOptionEqualToValue={(opt, val) => opt.code === val.code}
            getOptionLabel={(opt) => opt.label}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox checked={selected} size="small" sx={{ mr: 1 }} />
                {option.label}
              </li>
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, idx) => (
                <Chip
                  size="small"
                  label={option.label}
                  {...getTagProps({ index: idx })}
                  key={option.code}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Country / Geo"
                size="small"
                placeholder={editForm.geos?.length ? '' : 'Choose one or more'}
              />
            )}
          />

          {/* Agreement Type - radio buttons matching creation dialog */}
          <FormControl>
            <FormLabel sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Agreement Type</FormLabel>
            <RadioGroup
              row
              value={editForm.agreement}
              onChange={(e) => setEditForm((prev) => ({ ...prev, agreement: e.target.value }))}
            >
              {AGREEMENT_TYPES.map((type) => (
                <FormControlLabel
                  key={type}
                  value={type}
                  control={<Radio size="small" />}
                  label={<Typography variant="body2">{type}</Typography>}
                />
              ))}
            </RadioGroup>
          </FormControl>

          {/* Funnel Status - Autocomplete dropdown matching creation dialog */}
          <Autocomplete
            disablePortal
            options={FUNNEL_STATUSES}
            value={editForm.funnelStatus}
            onChange={(_, value) =>
              setEditForm((prev) => ({ ...prev, funnelStatus: value || FUNNEL_STATUSES[0] }))
            }
            renderInput={(params) => <TextField {...params} label="Funnel Status" size="small" />}
          />

          <Divider />

          {/* Contact fields */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="Telegram Nick"
              size="small"
              value={editForm.telegramNick}
              onChange={(e) => setEditForm((prev) => ({ ...prev, telegramNick: e.target.value }))}
              placeholder="@nickname"
            />
            <TextField
              label="Telegram Group URL"
              size="small"
              value={editForm.telegramGroup}
              onChange={(e) => setEditForm((prev) => ({ ...prev, telegramGroup: e.target.value }))}
              placeholder="https://t.me/group_name"
            />
          </Box>

          <TextField
            label="Description"
            size="small"
            fullWidth
            multiline
            minRows={3}
            placeholder="Brief description of this partner..."
            value={editForm.description}
            onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </Stack>
      </FormDialog>
      <MaterialDialog
        open={materialDialog.open}
        onClose={() => setMaterialDialog({ open: false, partner: null, material: null })}
        partner={materialDialog.partner}
        material={materialDialog.material}
        onSave={handleSaveMaterial}
      />
      {partner && (
        <AddPaymentDialog
          open={addPaymentDialogOpen}
          onClose={() => {
            setAddPaymentDialogOpen(false);
            setEditingPayment(null);
          }}
          partner={partner}
          payment={editingPayment}
          onSubmit={editingPayment ? handleEditFinancePayment : handleCreateFinancePayment}
          onDelete={handleDeleteFinancePayment}
        />
      )}
      <FormDialog
        open={archiveConfirmOpen}
        onClose={() => setArchiveConfirmOpen(false)}
        title="Archive this partner?"
        icon={DeleteIcon}
        iconVariant="error"
        maxWidth="xs"
        contentDividers={false}
        actions={
          <>
            <Button onClick={() => setArchiveConfirmOpen(false)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleArchiveCurrentPartner}
              disabled={archiving}
              startIcon={archiving ? <CircularProgress size={16} color="inherit" /> : null}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {archiving ? 'Archiving...' : 'Yes, archive partner'}
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary">
          Are you sure you want to archive <strong>{partner?.name || 'this partner'}</strong>?
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.2 }}>
          The account will be removed from active views, while related history/actions remain
          available for audit.
        </Typography>
      </FormDialog>
    </Box>
  );
}
