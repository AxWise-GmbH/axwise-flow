import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  LinearProgress,
  Alert,
  IconButton,
  Collapse,
  Stack,
  Popover,
  Divider,
  Tooltip,
  useTheme,
  useMediaQuery,
  alpha,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  Dialog,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import CategoryIcon from '@mui/icons-material/Category';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import TimelineIcon from '@mui/icons-material/Timeline';
import PageLayout from '../../components/Common/PageLayout';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import MultiSelectWithSearch from '../../components/Common/MultiSelectWithSearch';
import EmptyState from '../../components/Common/EmptyState';
import { ROWS_PER_PAGE_OPTIONS } from '../../utils/constants';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { extractArchive, packArchive, downloadBlob, isHtmlPath } from '../../utils/archiveUtils';
import { INJECTION_TYPES } from '../../utils/injectionTypes';
import {
  runInjection,
  saveMaterial,
  listMaterials,
  getMaterialDownloadUrl,
  deleteMaterial,
  getCategories,
  addCategory,
  removeCategory,
  setMaterialCategory,
  setMaterialCampaign,
  addMaterialUsedBy,
} from '../../services/injectionHubService';
import { campaignsService } from '../../services/campaignsService';
import { loadAuditLogs } from '../../services/auditLogBackend';
import { partnerService } from '../../services/partnerService';
import { usePartners } from '../../hooks/usePartners';
import { translateArchive, LANGUAGES, SOURCE_AUTO } from '../../services/translationService';
import getUnicodeFlagIcon from 'country-flag-icons/unicode';

import AppIcon from '../../components/icons/AppIcon';

const STEPS = ['Upload archive', 'Campaign & injection', 'Process', 'Save & download'];

export default function InjectionHub() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDark = theme.palette.mode === 'dark';
  const [activeTab, setActiveTab] = useState('inject');
  const [transFile, setTransFile] = useState(null);
  const [transSourceLang, setTransSourceLang] = useState(SOURCE_AUTO);
  const [transTargetLangs, setTransTargetLangs] = useState([]);
  const [transProcessing, setTransProcessing] = useState(false);
  const [transStatus, setTransStatus] = useState('');
  const [transProgress, setTransProgress] = useState(0);
  const [transBlob, setTransBlob] = useState(null);
  const [transError, setTransError] = useState('');
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [materialName, setMaterialName] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [injectionTypeIds, setInjectionTypeIds] = useState([]);
  const [injectionConfig, setInjectionConfig] = useState({});
  const [processing, setProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [entries, setEntries] = useState([]);
  const [modifiedEntries, setModifiedEntries] = useState([]);
  const [mergedBlob, setMergedBlob] = useState(null);
  const [savedMaterial, setSavedMaterial] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [error, setError] = useState('');
  const [showMetrics, setShowMetrics] = useShowMetrics('injection-hub');
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [categoriesAnchor, setCategoriesAnchor] = useState(null);
  const [filters, setFilters] = useState({
    categoryId: '',
    campaignId: '',
    search: '',
    typeFilter: 'All',
  });
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryIdOnSave, setCategoryIdOnSave] = useState('');
  const [libraryViewMode, setLibraryViewMode] = useState('list');
  const [libraryOrderBy, setLibraryOrderBy] = useState('created_at');
  const [libraryOrder, setLibraryOrder] = useState('desc');
  const [usedByAnchorEl, setUsedByAnchorEl] = useState(null);
  const [usedByMaterial, setUsedByMaterial] = useState(null);
  const [addPartnerId, setAddPartnerId] = useState('');
  const [addPartnerLoading, setAddPartnerLoading] = useState(false);
  const { partners: partnersList } = usePartners();

  /* ---- Page Activity Log Dialog ---- */
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter(
        (log) => log.entity === 'Injection' || log.entity === 'InjectionHub'
      );
      setActivityLogs(filtered);
    } catch (_) {
      setActivityLogs([]);
    } finally {
      setActivityLogsLoading(false);
    }
  }, []);

  const closeActivityLog = useCallback(() => {
    setActivityLogOpen(false);
    setActivityLogs([]);
  }, []);

  const formatLogDateTime = (ts) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const getActionColor = (action) => {
    const a = (action || '').toLowerCase();
    if (a.includes('created') || a.includes('create') || a.includes('added') || a.includes('add'))
      return 'success';
    if (a.includes('deleted') || a.includes('delete')) return 'error';
    if (a.includes('updated') || a.includes('saved') || a.includes('save')) return 'info';
    if (a.includes('paused') || a.includes('disabled')) return 'warning';
    return 'default';
  };

  const getUserFromLog = (log) => {
    if (log.user && log.user !== '-') return log.user;
    return '-';
  };

  const getIpFromLog = (log) => {
    const s = log.detailsStructured;
    if (s?.network?.ip) return s.network.ip;
    return '-';
  };

  const loadCampaigns = useCallback(async () => {
    try {
      const list = await campaignsService.list();
      setCampaigns(list || []);
    } catch {
      setCampaigns([]);
    }
  }, []);

  const loadMaterials = useCallback(async () => {
    try {
      const list = await listMaterials();
      setMaterials(list);
    } catch (e) {
      setMaterials([]);
    }
  }, []);

  const loadCategories = useCallback(() => {
    setCategories(getCategories());
  }, []);

  useEffect(() => {
    loadCampaigns();
    loadMaterials();
    loadCategories();
  }, [loadCampaigns, loadMaterials, loadCategories]);

  const filteredMaterials = useMemo(() => {
    let list = materials || [];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (m) =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.campaign_name || '').toLowerCase().includes(q)
      );
    }
    if (filters.typeFilter === 'Injection')
      list = list.filter((m) => (m.injection_config?.material_type || 'injection') === 'injection');
    else if (filters.typeFilter === 'Translation')
      list = list.filter((m) => m.injection_config?.material_type === 'translation');
    if (filters.categoryId) {
      if (filters.categoryId === '_none')
        list = list.filter((m) => !m.injection_config?.category_id);
      else
        list = list.filter((m) => (m.injection_config?.category_id || '') === filters.categoryId);
    }
    if (filters.campaignId) {
      list = list.filter((m) => (m.campaign_id || '') === filters.campaignId);
    }
    return list;
  }, [materials, filters]);

  const libraryDisplayMaterials = useMemo(() => filteredMaterials, [filteredMaterials]);

  const getMaterialTypeLabel = (m) =>
    m?.injection_config?.material_type === 'translation' ? 'Translation' : 'Injection';
  const getMaterialUserEmail = (m) => m?.injection_config?.user_email || '-';
  /** Partners who used this material and when they added it. */
  const getMaterialUsedBy = (m) =>
    m?.used_by && Array.isArray(m.used_by)
      ? m.used_by
      : m?.injection_config?.used_by && Array.isArray(m.injection_config.used_by)
        ? m.injection_config.used_by
        : [];
  const formatDateTime = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };
  /** Last updated / date added: dd/mm/yy - hh:mm:ss */
  const formatLastUpdated = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yy} - ${hh}:${min}:${ss}`;
  };
  function formatRelative(dateStr) {
    if (!dateStr) return '-';
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now - d;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return formatDateTime(dateStr);
  }
  const librarySorted = useMemo(() => {
    const list = [...libraryDisplayMaterials];
    const key = libraryOrderBy;
    const dir = libraryOrder === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return dir;
      if (vb == null) return -dir;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
    return list;
  }, [libraryDisplayMaterials, libraryOrderBy, libraryOrder]);
  const libraryPagination = usePagination(librarySorted, {
    surfaceId: 'injection.libraries',
    defaultRowsPerPage: ROWS_PER_PAGE_OPTIONS[0],
    resetOn: [filters.search, filters.categoryId, filters.campaignId, filters.typeFilter],
  });
  const libraryPaginated = libraryPagination.paginatedData;
  const hasActiveFilters = !!(
    filters.search ||
    filters.categoryId ||
    filters.campaignId ||
    filters.typeFilter !== 'All'
  );

  const metricsOverview = useMemo(() => {
    const total = materials?.length || 0;
    const byCategory = {};
    (materials || []).forEach((m) => {
      const cid = m.injection_config?.category_id || '_none';
      const cname = m.injection_config?.category_name || 'Uncategorized';
      if (!byCategory[cid]) byCategory[cid] = { name: cname, count: 0 };
      byCategory[cid].count += 1;
    });
    const thisMonth = (materials || []).filter((m) => {
      const t = new Date(m.created_at).getTime();
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return t >= start;
    }).length;
    return { total, byCategory: Object.entries(byCategory), thisMonth };
  }, [materials]);

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f && (f.type === 'application/zip' || f.name.toLowerCase().endsWith('.zip'))) {
      setFile(f);
      if (!materialName) setMaterialName(f.name.replace(/\.zip$/i, ''));
      setError('');
    } else if (f) {
      setError('Please select a ZIP file.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && (f.type === 'application/zip' || f.name.toLowerCase().endsWith('.zip'))) {
      setFile(f);
      if (!materialName) setMaterialName(f.name.replace(/\.zip$/i, ''));
      setError('');
    }
  };

  const handleNext = async () => {
    setError('');
    if (step === 0) {
      if (!file) {
        setError('Please upload a ZIP file.');
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      setStep(2);
      setProcessing(true);
      setProcessStatus('Extracting archive...');
      try {
        const extracted = await extractArchive(file);
        setEntries(extracted);
        setProcessStatus('Injecting snippets...');
        await new Promise((r) => setTimeout(r, 300));
        const injections = injectionTypeIds
          .filter((id) => INJECTION_TYPES.some((t) => t.id === id))
          .map((id) => ({ typeId: id, values: injectionConfig[id] || {} }));
        const urlParams = injectionConfig.url_tokens || {};
        const modified = runInjection(extracted, injections, { urlParams });
        setModifiedEntries(modified);
        setProcessStatus('Packing...');
        await new Promise((r) => setTimeout(r, 200));
        const blob = await packArchive(modified);
        setMergedBlob(blob);
        setProcessStatus('Done');
      } catch (e) {
        setError(e?.message || 'Processing failed');
      } finally {
        setProcessing(false);
        setStep(3);
      }
      return;
    }
    if (step === 2) setStep(3);
  };

  const handleSaveAndDownload = async () => {
    if (!mergedBlob || !materialName.trim()) {
      setError('Name the material and ensure processing completed.');
      return;
    }
    setError('');
    try {
      const campaign = campaigns.find((c) => c.id === campaignId);
      const cat = categories.find((c) => c.id === categoryIdOnSave);
      const record = await saveMaterial(mergedBlob, {
        name: materialName.trim(),
        campaignId: campaignId || null,
        campaignName: campaign?.name || campaignName || null,
        injectionTypeIds,
        injectionConfig,
        fileNames: modifiedEntries.map((e) => e.path),
        categoryId: categoryIdOnSave || null,
        categoryName: cat?.name || null,
        materialType: 'injection',
      });
      setSavedMaterial(record);
      downloadBlob(mergedBlob, `${materialName.trim()}-injected.zip`);
      await loadMaterials();
    } catch (e) {
      setError(e?.message || 'Save failed');
    }
  };

  const handleReset = () => {
    setStep(0);
    setFile(null);
    setMaterialName('');
    setCategoryIdOnSave('');
    setEntries([]);
    setModifiedEntries([]);
    setMergedBlob(null);
    setSavedMaterial(null);
    setError('');
  };

  const handleDownloadMaterial = async (material) => {
    const url = await getMaterialDownloadUrl(material);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${material.name || 'material'}.zip`;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleDeleteMaterial = async (material) => {
    if (!window.confirm(`Delete "${material.name}"?`)) return;
    try {
      await deleteMaterial(material);
      await loadMaterials();
    } catch (e) {
      setError(e?.message || 'Delete failed');
    }
  };

  const handleMaterialCategoryChange = async (material, categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    try {
      await setMaterialCategory(material, categoryId || null, cat?.name || null);
      await loadMaterials();
    } catch (e) {
      setError(e?.message || 'Update failed');
    }
  };

  const handleMaterialCampaignChange = async (material, campaignId) => {
    if (material.isDummy) return;
    const campaign = campaigns.find((c) => c.id === campaignId);
    try {
      await setMaterialCampaign(material, campaignId || null, campaign?.name ?? null);
      await loadMaterials();
    } catch (e) {
      setError(e?.message || 'Update failed');
    }
  };

  const handleAddPartnerToMaterial = async () => {
    if (!usedByMaterial || !addPartnerId || usedByMaterial.isDummy) return;
    const partner = (partnersList || []).find((p) => p.id === addPartnerId);
    if (!partner) return;
    setAddPartnerLoading(true);
    setError('');
    try {
      const newMaterial = {
        id: `M-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: usedByMaterial.name,
        type: 'injection',
        uploadedAt: new Date().toISOString().split('T')[0],
        injectionMaterialId: usedByMaterial.id,
        addedAt: new Date().toISOString(),
      };
      const currentMaterials = partner.materials || [];
      await partnerService.update(partner.id, { materials: [newMaterial, ...currentMaterials] });
      await addMaterialUsedBy(usedByMaterial, partner.id, partner.name);
      const list = await listMaterials();
      setMaterials(list);
      const updated = list.find((m) => m.id === usedByMaterial.id);
      if (updated) setUsedByMaterial(updated);
      setAddPartnerId('');
    } catch (e) {
      setError(e?.message || 'Failed to add partner');
    } finally {
      setAddPartnerLoading(false);
    }
  };

  const htmlFiles = modifiedEntries.filter((e) => isHtmlPath(e.path));

  const statCards = [
    {
      label: 'Total materials',
      value: metricsOverview.total,
      helper: 'All saved materials',
      color: theme.palette.primary.main,
      icon: DescriptionOutlinedIcon,
    },
    {
      label: 'Categories',
      value: categories.length,
      helper: 'Structure materials',
      color: theme.palette.info.main,
      icon: CategoryIcon,
    },
    {
      label: 'This month',
      value: metricsOverview.thisMonth,
      helper: 'Created this month',
      color: theme.palette.success.main,
      icon: TrendingUpIcon,
    },
    {
      label: 'Visible',
      value: libraryDisplayMaterials.length,
      helper: 'After filters',
      color: theme.palette.secondary.main,
      icon: FolderOutlinedIcon,
    },
  ];

  return (
    <PageLayout title="Injection" subtitle="" showTitleBlock={false}>
      <BentoCard
        title="Injection"
        subtitle={showMetrics ? `${metricsOverview.total} materials` : undefined}
        icon={IntegrationInstructionsOutlinedIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
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
                  lg: 'repeat(4, minmax(0, 1fr))',
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

        <Box sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Row 1: Tabs (match Workflow – above toolbar) */}
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1.5, pb: 0 }}>
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
                { id: 'inject', label: 'Inject', icon: CodeOutlinedIcon },
                { id: 'translation', label: 'Translate', icon: TranslateOutlinedIcon },
                { id: 'library', label: 'Library', icon: FolderOutlinedIcon },
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
                </Button>
              ))}
            </Box>
          </Box>

          {/* Row 2: Filter, card/table view, categories */}
          <Box
            sx={{
              p: 1.5,
              mb: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Tooltip title="Filters: search, type, category, campaign" placement="bottom" arrow>
              <IconButton
                onClick={(e) => setFilterAnchor(e.currentTarget)}
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
            <ToggleButtonGroup
              value={libraryViewMode}
              exclusive
              onChange={(_, v) => v != null && setLibraryViewMode(v)}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.background.default, 0.8),
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                '& .MuiToggleButton-root': {
                  px: 1.25,
                  py: 0.75,
                  border: 'none',
                  color: 'text.secondary',
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                    color: 'primary.main',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
                  },
                },
              }}
            >
              <ToggleButton value="card" aria-label="Card view">
                <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
              </ToggleButton>
              <ToggleButton value="list" aria-label="List view">
                <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
              </ToggleButton>
            </ToggleButtonGroup>
            <Popover
              open={Boolean(filterAnchor)}
              anchorEl={filterAnchor}
              onClose={() => setFilterAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1.5,
                    p: 0,
                    borderRadius: 3,
                    minWidth: 340,
                    maxWidth: 400,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                  },
                },
              }}
            >
              <Box
                sx={{
                  px: 2.5,
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                    <AppIcon name="FilterList" fallback={FilterListIcon} sx={{ fontSize: 22 }} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      Filters
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block' }}
                    >
                      Search, type, category, campaign
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ p: 2.5, maxHeight: 420, overflowY: 'auto' }}>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Search
                </Typography>
                <TextField
                  size="small"
                  placeholder="Search materials..."
                  value={filters.search}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, search: e.target.value }));
                  }}
                  fullWidth
                  sx={{ mb: 2, '& .MuiInputBase-root': { borderRadius: 2 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AppIcon
                          name="SearchOutlined"
                          fallback={SearchIcon}
                          sx={{ fontSize: 18, color: 'text.secondary' }}
                        />
                      </InputAdornment>
                    ),
                  }}
                />
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Type
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={filters.typeFilter}
                    label="Type"
                    onChange={(e) => {
                      setFilters((prev) => ({ ...prev, typeFilter: e.target.value }));
                    }}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    <MenuItem
                      value="All"
                      sx={{
                        fontWeight: 700,
                        color: 'primary.main',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      All types
                    </MenuItem>
                    <MenuItem value="Injection">Injection</MenuItem>
                    <MenuItem value="Translation">Translation</MenuItem>
                  </Select>
                </FormControl>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Category
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={filters.categoryId || '_all'}
                    label="Category"
                    onChange={(e) => {
                      setFilters((prev) => ({
                        ...prev,
                        categoryId: e.target.value === '_all' ? '' : e.target.value,
                      }));
                    }}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    <MenuItem
                      value="_all"
                      sx={{
                        fontWeight: 700,
                        color: 'primary.main',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      All categories
                    </MenuItem>
                    <MenuItem value="_none">Uncategorized</MenuItem>
                    {categories.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.7rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Campaign
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Campaign</InputLabel>
                  <Select
                    value={filters.campaignId || '_all'}
                    label="Campaign"
                    onChange={(e) => {
                      setFilters((prev) => ({
                        ...prev,
                        campaignId: e.target.value === '_all' ? '' : e.target.value,
                      }));
                    }}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    <MenuItem
                      value="_all"
                      sx={{
                        fontWeight: 700,
                        color: 'primary.main',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      All campaigns
                    </MenuItem>
                    {campaigns.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  fullWidth
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setFilters({ categoryId: '', campaignId: '', search: '', typeFilter: 'All' });
                    setFilterAnchor(null);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Reset filters
                </Button>
              </Box>
            </Popover>
            <Tooltip title="Activity Log" placement="bottom" arrow>
              <IconButton
                onClick={openActivityLog}
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
                aria-label="Activity Log"
              >
                <AppIcon
                  name="History"
                  fallback={HistoryIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
              </IconButton>
            </Tooltip>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Categories – structure materials" placement="bottom" arrow>
              <IconButton
                onClick={(e) => setCategoriesAnchor(e.currentTarget)}
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
                aria-label="Categories"
              >
                <AppIcon
                  name="Category"
                  fallback={CategoryIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
              </IconButton>
            </Tooltip>
          </Box>

          {activeTab === 'inject' && (
            <Paper
              elevation={0}
              sx={{
                p: { xs: 1.5, sm: 2 },
                mt: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Inject tracking into website archive
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Upload a ZIP of your landing or HTML pages, pick a campaign and injection types
                (postback, S2S, URL tokens), then merge and download.
              </Typography>
              {isMobile && (
                <Typography
                  variant="overline"
                  sx={{ display: 'block', mb: 1.5, color: 'text.secondary', fontWeight: 600 }}
                >
                  Step {step + 1} of {STEPS.length}
                </Typography>
              )}
              <Stepper
                activeStep={step}
                orientation={isMobile ? 'vertical' : 'horizontal'}
                sx={{
                  mb: 3,
                  '& .MuiStepLabel-root': { overflow: 'visible' },
                  '& .MuiStepLabel-label': {
                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                    whiteSpace: isMobile ? 'normal' : 'nowrap',
                  },
                }}
              >
                {STEPS.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>

              {error && (
                <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {step === 0 && (
                <Box
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  sx={{
                    border: '2px dashed',
                    borderColor: file ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    p: { xs: 2.5, sm: 4 },
                    textAlign: 'center',
                    bgcolor: file ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
                  }}
                >
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    hidden
                    id="injection-zip"
                    onChange={handleFileSelect}
                  />
                  <label htmlFor="injection-zip">
                    <AppIcon
                      name="CloudUploadOutlined"
                      fallback={CloudUploadOutlinedIcon}
                      sx={{
                        fontSize: { xs: 40, sm: 48 },
                        color: 'text.secondary',
                        cursor: 'pointer',
                      }}
                    />
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
                    >
                      {file
                        ? file.name
                        : 'Click or drag a ZIP file (landing page or WordPress export)'}
                    </Typography>
                  </label>
                </Box>
              )}

              {step === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Material name"
                    value={materialName}
                    onChange={(e) => setMaterialName(e.target.value)}
                    size="small"
                    fullWidth
                    placeholder="e.g. Landing_FB_Lead_Jan"
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel>Campaign</InputLabel>
                    <Select
                      value={campaignId}
                      onChange={(e) => {
                        setCampaignId(e.target.value);
                        const c = campaigns.find((x) => x.id === e.target.value);
                        if (c) setCampaignName(c.name);
                      }}
                      label="Campaign"
                    >
                      <MenuItem value="">None</MenuItem>
                      {campaigns.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {campaigns.length === 0 && (
                    <TextField
                      label="Campaign name (optional)"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      size="small"
                      fullWidth
                      placeholder="e.g. FB Lead Gen"
                    />
                  )}
                  <FormControl size="small" fullWidth>
                    <InputLabel>Injection types</InputLabel>
                    <Select
                      multiple
                      value={injectionTypeIds}
                      onChange={(e) =>
                        setInjectionTypeIds(
                          typeof e.target.value === 'string'
                            ? e.target.value.split(',')
                            : e.target.value
                        )
                      }
                      input={<OutlinedInput label="Injection types" />}
                      renderValue={(sel) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {sel.map((id) => (
                            <Chip
                              key={id}
                              label={INJECTION_TYPES.find((t) => t.id === id)?.name || id}
                              size="small"
                            />
                          ))}
                        </Box>
                      )}
                    >
                      {INJECTION_TYPES.filter((t) => t.snippetTemplate).map((t) => (
                        <MenuItem key={t.id} value={t.id}>
                          {t.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {injectionTypeIds.includes('postback') && (
                    <TextField
                      label="Postback URL (use {click_id}, {campaign_id})"
                      value={injectionConfig.postback?.postback_url ?? ''}
                      onChange={(e) =>
                        setInjectionConfig((c) => ({
                          ...c,
                          postback: { ...(c.postback || {}), postback_url: e.target.value },
                        }))
                      }
                      size="small"
                      fullWidth
                      placeholder="https://track.example.com/postback?click_id={click_id}&campaign={campaign_id}"
                    />
                  )}
                  {injectionTypeIds.some((id) => ['gtm', 'gtm-head'].includes(id)) && (
                    <TextField
                      label="GTM Container ID"
                      value={
                        injectionConfig.gtm?.container_id ??
                        injectionConfig.gtm_head?.container_id ??
                        ''
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setInjectionConfig((c) => ({
                          ...c,
                          gtm: { ...(c.gtm || {}), container_id: v },
                          gtm_head: { ...(c.gtm_head || {}), container_id: v },
                        }));
                      }}
                      size="small"
                      fullWidth
                      placeholder="GTM-XXXXXX"
                    />
                  )}
                </Box>
              )}

              {step === 2 && (
                <Box sx={{ py: 2 }}>
                  <LinearProgress
                    variant={processing ? 'indeterminate' : 'determinate'}
                    value={processing ? undefined : 100}
                    sx={{ height: 8, borderRadius: 2, mb: 2 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {processStatus}
                  </Typography>
                </Box>
              )}

              {step === 3 && !savedMaterial && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Typography variant="subtitle2">
                    Modified files ({modifiedEntries.length})
                  </Typography>
                  <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
                    <List dense>
                      {htmlFiles.slice(0, 20).map((e, i) => (
                        <ListItem key={i}>
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <AppIcon
                              name="CodeOutlined"
                              fallback={CodeOutlinedIcon}
                              fontSize="small"
                              color="primary"
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={e.path}
                            primaryTypographyProps={{ fontSize: '0.85rem' }}
                          />
                        </ListItem>
                      ))}
                      {htmlFiles.length > 20 && (
                        <ListItem>
                          <ListItemText secondary={`+ ${htmlFiles.length - 20} more`} />
                        </ListItem>
                      )}
                    </List>
                  </Paper>
                  <TextField
                    label="Material name"
                    value={materialName}
                    onChange={(e) => setMaterialName(e.target.value)}
                    size="small"
                    fullWidth
                    required
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={categoryIdOnSave}
                      onChange={(e) => setCategoryIdOnSave(e.target.value)}
                      label="Category"
                    >
                      <MenuItem value="">None</MenuItem>
                      {categories.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      onClick={handleSaveAndDownload}
                      disabled={!materialName.trim()}
                    >
                      Save & download
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => downloadBlob(mergedBlob, `${materialName || 'injected'}.zip`)}
                    >
                      Download only
                    </Button>
                  </Box>
                </Box>
              )}

              {step === 3 && savedMaterial && (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <AppIcon
                    name="CheckCircleOutlined"
                    fallback={CheckCircleOutlinedIcon}
                    sx={{ fontSize: 56, color: 'success.main' }}
                  />
                  <Typography variant="h6" sx={{ mt: 1 }}>
                    Saved
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {savedMaterial.name} - ready to monitor by ID
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ mt: 2, textTransform: 'none' }}
                    onClick={handleReset}
                  >
                    Start over
                  </Button>
                </Box>
              )}

              {step < 3 && !savedMaterial && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column-reverse', sm: 'row' },
                    gap: 1.5,
                    justifyContent: 'space-between',
                    mt: 2,
                  }}
                >
                  <Button
                    disabled={step === 0}
                    onClick={() => setStep((s) => s - 1)}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                    fullWidth={isMobile}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outlined"
                    color="primary"
                    size="small"
                    startIcon={
                      <AppIcon
                        name="ArrowForwardOutlined"
                        fallback={ArrowForwardOutlinedIcon}
                        sx={{ fontSize: 18 }}
                      />
                    }
                    onClick={handleNext}
                    disabled={step === 2 && processing}
                    fullWidth={isMobile}
                    sx={{
                      borderRadius: 3,
                      height: 44,
                      minHeight: 44,
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2,
                      borderWidth: 2,
                      '&:hover': { borderWidth: 2 },
                    }}
                  >
                    {step === 2 ? (processing ? 'Processing…' : 'Process') : 'Next'}
                  </Button>
                </Box>
              )}
            </Paper>
          )}

          {activeTab === 'library' && (
            <Box sx={{ px: 1.5, pb: 2 }}>
              {libraryDisplayMaterials.length === 0 ? (
                <Box sx={{ py: 4 }}>
                  <EmptyState
                    icon={DescriptionOutlinedIcon}
                    title="No materials found"
                    description={
                      hasActiveFilters
                        ? 'Try adjusting your filters or search query.'
                        : materials?.length === 0
                          ? 'Run an injection and save to add materials here.'
                          : 'No materials match the current filters.'
                    }
                  />
                </Box>
              ) : (
                <>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      mb: 1.5,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography
                      variant="overline"
                      sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em' }}
                    >
                      Material list
                    </Typography>
                  </Box>
                  {libraryViewMode === 'card' ? (
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          sm: 'repeat(2, 1fr)',
                          lg: 'repeat(3, 1fr)',
                        },
                        gap: 1.5,
                        mb: 2,
                      }}
                    >
                      {libraryPaginated.map((m) => {
                        const isDummy = !!m.isDummy;
                        const typeLabel = getMaterialTypeLabel(m);
                        return (
                          <Paper
                            key={m.id}
                            elevation={0}
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              border: '1px solid',
                              borderColor: 'divider',
                              bgcolor: theme.palette.background.paper,
                              transition: 'border-color 0.2s, box-shadow 0.2s',
                              '&:hover': {
                                borderColor: theme.palette.primary.main,
                                boxShadow: createHoverGlowShadow(theme),
                              },
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                              <Box
                                sx={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 2,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                                  flexShrink: 0,
                                }}
                              >
                                <AppIcon
                                  name="DescriptionOutlined"
                                  fallback={DescriptionOutlinedIcon}
                                  sx={{ fontSize: 18, color: 'primary.main' }}
                                />
                              </Box>
                              <Typography
                                variant="subtitle1"
                                sx={{ fontWeight: 700, lineHeight: 1.3 }}
                              >
                                {m.name}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  Type
                                </Typography>
                                <Chip
                                  label={typeLabel}
                                  size="small"
                                  sx={{ mt: 0.25, fontSize: '0.7rem' }}
                                />
                              </Box>
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  Last updated
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 0.25 }}>
                                  {formatLastUpdated(m.created_at)}
                                </Typography>
                              </Box>
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  Used by
                                </Typography>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={(e) => {
                                    setUsedByAnchorEl(e.currentTarget);
                                    setUsedByMaterial(m);
                                  }}
                                  sx={{ mt: 0.25, textTransform: 'none', fontSize: '0.75rem' }}
                                >
                                  Show
                                </Button>
                              </Box>
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  Created by
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ mt: 0.25, fontFamily: 'monospace', fontSize: '0.8rem' }}
                                >
                                  {getMaterialUserEmail(m)}
                                </Typography>
                              </Box>
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  Category
                                </Typography>
                                <Select
                                  size="small"
                                  value={m.injection_config?.category_id || ''}
                                  onChange={(e) => handleMaterialCategoryChange(m, e.target.value)}
                                  displayEmpty
                                  disabled={isDummy}
                                  sx={{ mt: 0.25, minWidth: 120, fontSize: '0.8rem' }}
                                >
                                  <MenuItem value="">Uncategorized</MenuItem>
                                  {categories.map((c) => (
                                    <MenuItem key={c.id} value={c.id}>
                                      {c.name}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </Box>
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  Campaign
                                </Typography>
                                <Select
                                  size="small"
                                  value={m.campaign_id || ''}
                                  onChange={(e) => handleMaterialCampaignChange(m, e.target.value)}
                                  displayEmpty
                                  disabled={isDummy}
                                  sx={{ mt: 0.25, minWidth: 120, fontSize: '0.8rem' }}
                                >
                                  <MenuItem value="">-</MenuItem>
                                  {campaigns.map((c) => (
                                    <MenuItem key={c.id} value={c.id}>
                                      {c.name}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </Box>
                            </Box>
                            <Box
                              sx={{
                                display: 'flex',
                                gap: 0.5,
                                justifyContent: 'flex-end',
                                mt: 1.5,
                                pt: 1,
                                borderTop: '1px solid',
                                borderColor: 'divider',
                              }}
                            >
                              {m.merged_path && (
                                <IconButton
                                  size="small"
                                  onClick={() => !isDummy && handleDownloadMaterial(m)}
                                  aria-label="Download"
                                  disabled={isDummy}
                                >
                                  <AppIcon
                                    name="DownloadOutlined"
                                    fallback={DownloadOutlinedIcon}
                                    fontSize="small"
                                  />
                                </IconButton>
                              )}
                              <IconButton
                                size="small"
                                onClick={() => !isDummy && handleDeleteMaterial(m)}
                                aria-label="Delete"
                                color="error"
                                disabled={isDummy}
                              >
                                <AppIcon
                                  name="DeleteOutlineOutlined"
                                  fallback={DeleteOutlineOutlinedIcon}
                                  fontSize="small"
                                />
                              </IconButton>
                            </Box>
                          </Paper>
                        );
                      })}
                    </Box>
                  ) : (
                    <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', overflow: 'auto' }}>
                      <Table stickyHeader size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, minWidth: 200 }}>Material</TableCell>
                            <TableCell sx={{ fontWeight: 600, minWidth: 100 }} align="center">
                              Type
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600, minWidth: 130 }} align="center">
                              <TableSortLabel
                                active={libraryOrderBy === 'created_at'}
                                direction={libraryOrderBy === 'created_at' ? libraryOrder : 'desc'}
                                onClick={() => {
                                  setLibraryOrderBy('created_at');
                                  setLibraryOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                                }}
                              >
                                Last updated
                              </TableSortLabel>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600, minWidth: 160 }}>
                              Created by
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600, minWidth: 120 }}>Category</TableCell>
                            <TableCell sx={{ fontWeight: 600, minWidth: 100 }}>Used by</TableCell>
                            <TableCell sx={{ fontWeight: 600, minWidth: 160 }}>Campaign</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, minWidth: 100 }}>
                              Actions
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {libraryPaginated.map((m) => {
                            const isDummy = !!m.isDummy;
                            return (
                              <TableRow key={m.id} hover>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Box
                                      sx={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                                        flexShrink: 0,
                                      }}
                                    >
                                      <AppIcon
                                        name="DescriptionOutlined"
                                        fallback={DescriptionOutlinedIcon}
                                        sx={{ fontSize: 18, color: 'primary.main' }}
                                      />
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          fontWeight: 600,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          maxWidth: 220,
                                        }}
                                      >
                                        {m.name}
                                      </Typography>
                                    </Box>
                                  </Box>
                                </TableCell>
                                <TableCell align="center">
                                  <Chip
                                    label={getMaterialTypeLabel(m)}
                                    size="small"
                                    sx={{
                                      height: 24,
                                      fontSize: '0.7rem',
                                      fontWeight: 600,
                                      bgcolor:
                                        m.injection_config?.material_type === 'translation'
                                          ? alpha(theme.palette.info.main, 0.15)
                                          : alpha(theme.palette.primary.main, 0.12),
                                      color:
                                        m.injection_config?.material_type === 'translation'
                                          ? 'info.main'
                                          : 'primary.main',
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="center">
                                  <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 500, color: 'text.secondary' }}
                                  >
                                    {formatLastUpdated(m.created_at)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <AppIcon
                                      name="PersonOutline"
                                      fallback={PersonOutlineIcon}
                                      sx={{ fontSize: 16, color: 'text.secondary' }}
                                    />
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: 500,
                                        fontSize: '0.8rem',
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {getMaterialUserEmail(m)}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    size="small"
                                    value={m.injection_config?.category_id || ''}
                                    onChange={(e) =>
                                      handleMaterialCategoryChange(m, e.target.value)
                                    }
                                    displayEmpty
                                    disabled={isDummy}
                                    sx={{
                                      minWidth: 120,
                                      fontSize: '0.8rem',
                                      '& .MuiSelect-select': { py: 0.5 },
                                    }}
                                  >
                                    <MenuItem value="">Uncategorized</MenuItem>
                                    {categories.map((c) => (
                                      <MenuItem key={c.id} value={c.id}>
                                        {c.name}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={(e) => {
                                      setUsedByAnchorEl(e.currentTarget);
                                      setUsedByMaterial(m);
                                    }}
                                    sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                                  >
                                    Show
                                  </Button>
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <AppIcon
                                      name="CampaignOutlined"
                                      fallback={CampaignOutlinedIcon}
                                      sx={{ fontSize: 16, color: 'text.secondary' }}
                                    />
                                    <Select
                                      size="small"
                                      value={m.campaign_id || ''}
                                      onChange={(e) =>
                                        handleMaterialCampaignChange(m, e.target.value)
                                      }
                                      displayEmpty
                                      disabled={isDummy}
                                      sx={{
                                        minWidth: 120,
                                        fontSize: '0.8rem',
                                        '& .MuiSelect-select': { py: 0.5 },
                                      }}
                                    >
                                      <MenuItem value="">-</MenuItem>
                                      {campaigns.map((c) => (
                                        <MenuItem key={c.id} value={c.id}>
                                          {c.name}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  {m.merged_path && (
                                    <Tooltip title="Download">
                                      <IconButton
                                        size="small"
                                        onClick={() => !isDummy && handleDownloadMaterial(m)}
                                        aria-label="Download"
                                        disabled={isDummy}
                                      >
                                        <AppIcon
                                          name="DownloadOutlined"
                                          fallback={DownloadOutlinedIcon}
                                          sx={{ fontSize: 18 }}
                                        />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  <Tooltip title="Delete">
                                    <IconButton
                                      size="small"
                                      onClick={() => !isDummy && handleDeleteMaterial(m)}
                                      aria-label="Delete"
                                      color="error"
                                      disabled={isDummy}
                                    >
                                      <AppIcon
                                        name="DeleteOutlineOutlined"
                                        fallback={DeleteOutlineOutlinedIcon}
                                        sx={{ fontSize: 18 }}
                                      />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  <Pagination
                    count={libraryPagination.totalCount}
                    page={libraryPagination.page}
                    rowsPerPage={libraryPagination.rowsPerPage}
                    rowsPerPageOptions={libraryPagination.rowsPerPageOptions}
                    onPageChange={libraryPagination.setPage}
                    onRowsPerPageChange={libraryPagination.setRowsPerPage}
                    onLoadAll={libraryPagination.loadAll}
                    onCollapseAll={libraryPagination.collapseAll}
                    allMode={libraryPagination.allMode}
                    label="materials"
                  />
                </>
              )}
            </Box>
          )}

          <Popover
            open={Boolean(usedByAnchorEl)}
            anchorEl={usedByAnchorEl}
            onClose={() => {
              setUsedByAnchorEl(null);
              setUsedByMaterial(null);
              setAddPartnerId('');
            }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1.5,
                  p: 0,
                  borderRadius: 3,
                  minWidth: 320,
                  maxWidth: 400,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                },
              },
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                Used by
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                {usedByMaterial ? usedByMaterial.name : ''} - partners who added this material
              </Typography>
            </Box>
            {usedByMaterial && !usedByMaterial.isDummy && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
                  <InputLabel>Partner</InputLabel>
                  <Select
                    value={addPartnerId}
                    label="Partner"
                    onChange={(e) => setAddPartnerId(e.target.value)}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="">
                      <em>Select partner</em>
                    </MenuItem>
                    {(partnersList || []).map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name || p.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!addPartnerId || addPartnerLoading}
                  onClick={handleAddPartnerToMaterial}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  {addPartnerLoading ? 'Adding…' : 'Add partner'}
                </Button>
              </Box>
            )}
            <List dense sx={{ maxHeight: 320, overflowY: 'auto', py: 0 }}>
              {usedByMaterial && getMaterialUsedBy(usedByMaterial).length === 0 ? (
                <ListItem>
                  <ListItemText
                    primary="No partners yet"
                    secondary="Select a partner above and click Add partner to link this material."
                  />
                </ListItem>
              ) : (
                usedByMaterial &&
                getMaterialUsedBy(usedByMaterial).map((entry, idx) => (
                  <ListItem key={idx} divider={idx < getMaterialUsedBy(usedByMaterial).length - 1}>
                    <ListItemText
                      primary={entry.partnerName || entry.partner_name || '-'}
                      secondary={formatLastUpdated(entry.addedAt || entry.added_at)}
                      primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                      secondaryTypographyProps={{ fontSize: '0.8rem', color: 'text.secondary' }}
                    />
                  </ListItem>
                ))
              )}
            </List>
          </Popover>

          {activeTab === 'translation' && (
            <Paper
              elevation={0}
              sx={{ p: 2, mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Translate website archive
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Upload a ZIP of HTML (landing, banners, SMM). Select languages and download
                translated archive.
              </Typography>
              {transError && (
                <Alert severity="error" onClose={() => setTransError('')} sx={{ mb: 2 }}>
                  {transError}
                </Alert>
              )}
              {!transBlob ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f?.name?.toLowerCase().endsWith('.zip')) {
                        setTransFile(f);
                        setTransError('');
                      }
                    }}
                    sx={{
                      border: '2px dashed',
                      borderColor: transFile ? 'primary.main' : 'divider',
                      borderRadius: 2,
                      p: 3,
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="file"
                      accept=".zip"
                      hidden
                      id="trans-zip"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setTransFile(f);
                      }}
                    />
                    <label htmlFor="trans-zip">
                      <AppIcon
                        name="CloudUploadOutlined"
                        fallback={CloudUploadOutlinedIcon}
                        sx={{ fontSize: 40, color: 'text.secondary', cursor: 'pointer' }}
                      />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {transFile ? transFile.name : 'Click or drop ZIP (HTML pages)'}
                      </Typography>
                    </label>
                  </Box>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Source language</InputLabel>
                    <Select
                      value={transSourceLang}
                      onChange={(e) => setTransSourceLang(e.target.value)}
                      label="Source language"
                      renderValue={(v) => {
                        if (v === SOURCE_AUTO) return 'Auto-detect';
                        const l = LANGUAGES.find((x) => x.code === v);
                        if (!l) return v;
                        const flag = getUnicodeFlagIcon(l.countryCode);
                        return `${flag} ${l.countryCode} - ${l.countryName}`;
                      }}
                    >
                      <MenuItem value={SOURCE_AUTO}>Auto-detect</MenuItem>
                      {LANGUAGES.map((l) => (
                        <MenuItem key={l.code} value={l.code}>
                          <Box component="span" sx={{ mr: 1 }}>
                            {getUnicodeFlagIcon(l.countryCode)}
                          </Box>
                          {l.countryCode} - {l.countryName}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <MultiSelectWithSearch
                    label="Target languages"
                    placeholder="Country / Geo"
                    size="small"
                    options={LANGUAGES.filter((l) => l.code !== transSourceLang).map((l) => ({
                      value: l.code,
                      label: `${l.countryCode} - ${l.countryName}`,
                      icon: getUnicodeFlagIcon(l.countryCode),
                    }))}
                    value={transTargetLangs}
                    onChange={setTransTargetLangs}
                    maxListHeight={280}
                  />
                  <Button
                    variant="contained"
                    disabled={!transFile || transTargetLangs.length === 0 || transProcessing}
                    onClick={async () => {
                      setTransError('');
                      setTransProcessing(true);
                      try {
                        const entries = await extractArchive(transFile);
                        const translated = await translateArchive(
                          entries,
                          transSourceLang,
                          transTargetLangs,
                          (status, progress) => {
                            setTransStatus(status);
                            setTransProgress(progress);
                          }
                        );
                        const blob = await packArchive(translated);
                        setTransBlob(blob);
                      } catch (e) {
                        setTransError(e?.message || 'Translation failed');
                      } finally {
                        setTransProcessing(false);
                      }
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    {transProcessing ? 'Translating…' : 'Translate'}
                  </Button>
                  {transProcessing && (
                    <Box>
                      <LinearProgress
                        variant="determinate"
                        value={transProgress}
                        sx={{ height: 6, borderRadius: 2 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {transStatus}
                      </Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <AppIcon
                    name="CheckCircleOutlined"
                    fallback={CheckCircleOutlinedIcon}
                    sx={{ fontSize: 48, color: 'success.main' }}
                  />
                  <Typography variant="subtitle1" sx={{ mt: 1 }}>
                    Ready
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    sx={{ mt: 2, textTransform: 'none' }}
                    onClick={() => {
                      downloadBlob(
                        transBlob,
                        `translated-${transFile?.name?.replace(/\.zip$/i, '') || 'archive'}.zip`
                      );
                    }}
                  >
                    Download translated ZIP
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ mt: 2, ml: 1, textTransform: 'none' }}
                    onClick={() => {
                      setTransBlob(null);
                      setTransFile(null);
                      setTransError('');
                    }}
                  >
                    New translation
                  </Button>
                </Box>
              )}
            </Paper>
          )}
        </Box>
      </BentoCard>
      <Popover
        open={Boolean(categoriesAnchor)}
        anchorEl={categoriesAnchor}
        onClose={() => {
          setCategoriesAnchor(null);
          setNewCategoryName('');
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              p: 0,
              borderRadius: 3,
              minWidth: 300,
              maxHeight: '70vh',
              overflow: 'auto',
            },
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            bgcolor: alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <AppIcon
            name="Category"
            fallback={CategoryIcon}
            sx={{ fontSize: 22, color: 'primary.main' }}
          />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Categories
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Structure materials
            </Typography>
          </Box>
        </Box>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              fullWidth
            />
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                if (newCategoryName.trim()) {
                  addCategory(newCategoryName.trim());
                  setNewCategoryName('');
                  loadCategories();
                }
              }}
              sx={{ textTransform: 'none', flexShrink: 0 }}
            >
              Add
            </Button>
          </Box>
          <Divider />
          <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
            {categories.map((c) => (
              <ListItem
                key={c.id}
                secondaryAction={
                  <IconButton
                    size="small"
                    onClick={() => {
                      removeCategory(c.id);
                      loadCategories();
                    }}
                    aria-label="Remove category"
                  >
                    <AppIcon
                      name="DeleteOutlineOutlined"
                      fallback={DeleteOutlineOutlinedIcon}
                      fontSize="small"
                    />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={c.name}
                  secondary={`${(materials || []).filter((m) => (m.injection_config?.category_id || '') === c.id).length} materials`}
                />
              </ListItem>
            ))}
            {categories.length === 0 && (
              <ListItem>
                <ListItemText secondary="No categories yet. Add one above." />
              </ListItem>
            )}
          </List>
        </Box>
      </Popover>
      {/* ===== Activity Log Dialog ===== */}
      <Dialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '80vh' } }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 3,
            py: 2,
            borderBottom: 'none',
            bgcolor: isDark
              ? alpha(theme.palette.primary.main, 0.06)
              : alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <AppIcon
            name="History"
            fallback={HistoryIcon}
            sx={{ color: 'primary.main', fontSize: 24 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
              Injection Activity
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Injection action history
            </Typography>
          </Box>
          <IconButton size="small" onClick={closeActivityLog} sx={{ p: 0.5 }}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
        <Tabs
          value={0}
          sx={{
            px: 3,
            minHeight: 40,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.82rem',
            },
          }}
        >
          <Tab
            icon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`Action Log (${activityLogs.length})`}
          />
        </Tabs>
        <DialogContent sx={{ p: 0 }}>
          {activityLogsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
              <CircularProgress size={32} />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                Loading...
              </Typography>
            </Box>
          ) : activityLogs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
              <AppIcon
                name="History"
                fallback={HistoryIcon}
                sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.95rem' }}>
                No actions recorded yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Actions like creating, editing, and deleting injections will appear here.
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 480 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {['Action', 'User', 'IP Address', 'Date & Time', 'Details'].map((h) => (
                      <TableCell
                        key={h}
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.68rem',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          bgcolor: isDark ? alpha(theme.palette.background.paper, 0.95) : 'grey.50',
                          borderBottom: '2px solid',
                          borderColor: 'divider',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activityLogs.map((log) => (
                    <TableRow key={log.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ py: 1.25 }}>
                        <Chip
                          label={log.action}
                          size="small"
                          color={getActionColor(log.action)}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.68rem',
                            borderRadius: 1.5,
                            height: 24,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
                          {getUserFromLog(log)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.78rem',
                            fontFamily: 'monospace',
                            color: 'text.secondary',
                          }}
                        >
                          {getIpFromLog(log)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                        >
                          {formatLogDateTime(log.timestamp)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.78rem',
                            color: 'text.primary',
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {log.details || '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ flex: 1 }}
          >{`${activityLogs.length} log entr${activityLogs.length !== 1 ? 'ies' : 'y'}`}</Typography>
          <Button
            onClick={closeActivityLog}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
