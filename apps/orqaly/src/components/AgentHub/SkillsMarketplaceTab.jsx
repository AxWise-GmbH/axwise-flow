/**
 * SkillsMarketplaceTab — Browse, preview, install, and create agent skill packs.
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  Alert,
  Checkbox,
  FormControlLabel,
  FormGroup,
  CircularProgress,
  alpha,
  useTheme,
  Popover,
  Tooltip,
  Rating,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FormDialog from '../Common/FormDialog';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ClearIcon from '@mui/icons-material/Clear';
import {
  listSkills,
  installSkill,
  createSkill,
  getSkill,
  getAgentsUsingSkill,
} from '../../services/agentSkillsService';
import { submitRating, getMyRating, getAggregate } from '../../services/ratingsService';
import SkillForgeDialog from './SkillForgeDialog';
import { getAgents } from '../../services/agentHubService';
import { SKILL_CATEGORIES } from '../../config/bundledSkills';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

import AppIcon from '../icons/AppIcon';

/* ── Icon map ─────────────────────────────────────────────────────────── */
const ICON_MAP = {
  psychology: PsychologyOutlinedIcon,
  code: CodeOutlinedIcon,
  business: BusinessOutlinedIcon,
  article: ArticleOutlinedIcon,
  analytics: AnalyticsOutlinedIcon,
  settings: SettingsOutlinedIcon,
  lightbulb: LightbulbOutlinedIcon,
  extension: ExtensionOutlinedIcon,
};

function SkillIcon({ icon, sx }) {
  const Icon = ICON_MAP[icon] || ExtensionOutlinedIcon;
  return <AppIcon fallback={Icon} sx={sx} />;
}

function getCategoryColor(categoryValue) {
  const cat = SKILL_CATEGORIES.find((c) => c.value === categoryValue);
  return cat?.color || '#888';
}

function getCategoryLabel(categoryValue) {
  const cat = SKILL_CATEGORIES.find((c) => c.value === categoryValue);
  return cat?.label || categoryValue;
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMon = Math.round(diffDay / 30);
  if (diffMon < 12) return `${diffMon}mo ago`;
  return `${Math.round(diffMon / 12)}y ago`;
}

export default function SkillsMarketplaceTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  /* ── State ───────────────────────────────────────────────────────────── */
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'bundled' | 'community'
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [agents, setAgents] = useState([]);

  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSkill, setPreviewSkill] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewAgents, setPreviewAgents] = useState([]);
  const [myReview, setMyReview] = useState({ stars: 0, comment: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewAggregate, setReviewAggregate] = useState({ avg: 0, count: 0 });

  // Install dialog
  const [installOpen, setInstallOpen] = useState(false);
  const [installSkillData, setInstallSkillData] = useState(null);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [installing, setInstalling] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    category: 'ops',
    tags: '',
    content: '',
  });
  const [creating, setCreating] = useState(false);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importSkills, setImportSkills] = useState([]);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

  // Forge dialog
  const [forgeOpen, setForgeOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  /* ── Load skills ─────────────────────────────────────────────────────── */
  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (categoryFilter) params.category = categoryFilter;
      if (search) params.search = search;
      const data = await listSkills(params);
      setSkills(Array.isArray(data) ? data : []);
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    try {
      const list = getAgents();
      setAgents(Array.isArray(list) ? list : []);
    } catch {
      setAgents([]);
    }
  }, []);

  /* ── Preview ─────────────────────────────────────────────────────────── */
  const openPreview = async (skill) => {
    setPreviewSkill(skill);
    setPreviewAgents([]);
    setMyReview({ stars: 0, comment: '' });
    setReviewAggregate({ avg: skill.rating_avg || 0, count: skill.rating_count || 0 });
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const [full, agentsUsing, mine, agg] = await Promise.all([
        getSkill(skill.id).catch(() => null),
        getAgentsUsingSkill(skill.id).catch(() => []),
        getMyRating('skill', skill.id).catch(() => null),
        getAggregate('skill', skill.id).catch(() => null),
      ]);
      if (full) setPreviewSkill(full);
      setPreviewAgents(Array.isArray(agentsUsing) ? agentsUsing : []);
      if (mine) setMyReview({ stars: mine.rating || 0, comment: mine.comment || '' });
      if (agg) setReviewAggregate({ avg: agg.avg || 0, count: agg.count || 0 });
    } finally {
      setPreviewLoading(false);
    }
  };
  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewSkill(null);
    setPreviewAgents([]);
    setMyReview({ stars: 0, comment: '' });
    setReviewAggregate({ avg: 0, count: 0 });
  };

  const handleSubmitReview = async () => {
    if (!previewSkill || !myReview.stars) return;
    setReviewSubmitting(true);
    try {
      const res = await submitRating({
        target_type: 'skill',
        target_id: previewSkill.id,
        stars: myReview.stars,
        comment: myReview.comment?.trim() || undefined,
      });
      setReviewAggregate({ avg: res.avg || 0, count: res.count || 0 });
      setToast({ open: true, message: 'Review saved', severity: 'success' });
      // Update the card in the grid immediately
      setSkills((prev) =>
        prev.map((s) =>
          s.id === previewSkill.id
            ? { ...s, rating_avg: res.avg || 0, rating_count: res.count || 0 }
            : s
        )
      );
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setReviewSubmitting(false);
    }
  };

  /* ── Install flow ────────────────────────────────────────────────────── */
  const openInstall = (skill) => {
    setInstallSkillData(skill);
    setSelectedAgents([]);
    setInstallOpen(true);
  };
  const closeInstall = () => {
    setInstallOpen(false);
    setInstallSkillData(null);
    setSelectedAgents([]);
  };

  const handleAgentToggle = (agentId) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleInstall = async () => {
    if (!installSkillData || selectedAgents.length === 0) return;
    setInstalling(true);
    try {
      for (const agentId of selectedAgents) {
        await installSkill(agentId, installSkillData.id);
      }
      setToast({
        open: true,
        message: `Installed "${installSkillData.name}" on ${selectedAgents.length} agent(s)`,
        severity: 'success',
      });
      closeInstall();
      fetchSkills();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setInstalling(false);
    }
  };

  /* ── Create flow ─────────────────────────────────────────────────────── */
  const openCreate = () => {
    setCreateForm({ name: '', description: '', category: 'ops', tags: '', content: '' });
    setCreateOpen(true);
  };
  const closeCreate = () => {
    setCreateOpen(false);
  };

  const handleCreate = async () => {
    if (!createForm.name || !createForm.content) {
      setToast({ open: true, message: 'Name and content are required', severity: 'warning' });
      return;
    }
    setCreating(true);
    try {
      const tags = createForm.tags
        ? createForm.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      await createSkill({ ...createForm, tags });
      setToast({ open: true, message: `Skill "${createForm.name}" created`, severity: 'success' });
      closeCreate();
      fetchSkills();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setCreating(false);
    }
  };

  /* ── Import flow ─────────────────────────────────────────────────────── */
  const openImport = () => {
    setImportSkills([]);
    setImportError('');
    setImportResults(null);
    setImportOpen(true);
  };
  const closeImport = () => {
    setImportOpen(false);
    setImportSkills([]);
    setImportError('');
    setImportResults(null);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportResults(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const arr = Array.isArray(parsed) ? parsed : [parsed];

        // Validate each skill
        const errors = [];
        arr.forEach((s, i) => {
          if (!s.name) errors.push(`Skill ${i + 1}: missing "name"`);
          if (!s.content) errors.push(`Skill ${i + 1}: missing "content"`);
        });

        if (errors.length > 0) {
          setImportError(errors.join('\n'));
          setImportSkills([]);
        } else {
          setImportSkills(arr);
        }
      } catch {
        setImportError('Invalid JSON file. Please check the file format.');
        setImportSkills([]);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleImport = async () => {
    if (importSkills.length === 0) return;
    setImporting(true);
    const results = { success: 0, failed: 0, errors: [] };
    try {
      for (const skill of importSkills) {
        try {
          const tags = Array.isArray(skill.tags)
            ? skill.tags
            : skill.tags
              ? String(skill.tags)
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
              : [];
          await createSkill({
            name: skill.name,
            description: skill.description || '',
            category: skill.category || 'ops',
            tags,
            content: skill.content,
            icon: skill.icon || 'extension',
          });
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push(`"${skill.name}": ${err.message}`);
        }
      }
      setImportResults(results);
      if (results.success > 0) {
        setToast({
          open: true,
          message: `Imported ${results.success} skill(s) successfully`,
          severity: 'success',
        });
        fetchSkills();
      }
    } finally {
      setImporting(false);
    }
  };

  /* ── Portal target for Filters button — rendered in the Agent Hub tabs row ─ */
  const [portalNode, setPortalNode] = useState(null);
  useEffect(() => {
    const findSlot = () => {
      const node = document.getElementById('skills-tab-actions-slot');
      if (node) setPortalNode(node);
    };
    findSlot();
    // Slot mounts slightly after this component — retry a few frames.
    const id = requestAnimationFrame(findSlot);
    return () => cancelAnimationFrame(id);
  }, []);

  const filtersButton = (
    <>
      {categoryFilter && (
        <Chip
          label={getCategoryLabel(categoryFilter)}
          size="small"
          onDelete={() => setCategoryFilter('')}
          deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
          sx={{
            height: 24,
            fontSize: '0.7rem',
            fontWeight: 600,
            display: { xs: 'none', md: 'inline-flex' },
          }}
        />
      )}
      {search && (
        <Chip
          label={`"${search.length > 12 ? search.slice(0, 12) + '…' : search}"`}
          size="small"
          onDelete={() => setSearch('')}
          deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
          sx={{
            height: 24,
            fontSize: '0.7rem',
            fontWeight: 600,
            display: { xs: 'none', md: 'inline-flex' },
          }}
        />
      )}
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontWeight: 600,
          fontSize: '0.7rem',
          display: { xs: 'none', sm: 'inline' },
        }}
      >
        {skills.length} skill{skills.length !== 1 ? 's' : ''}
      </Typography>
      <Tooltip title="Search, filter & actions">
        <Button
          onClick={(e) => setFilterAnchor(e.currentTarget)}
          variant="outlined"
          size="small"
          startIcon={
            <AppIcon name="TuneRounded" fallback={TuneRoundedIcon} sx={{ fontSize: 18 }} />
          }
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2.5,
            minWidth: { xs: 40, sm: 'auto' },
            height: 36,
            px: { xs: 0.75, sm: 1.75 },
            borderColor:
              search || categoryFilter ? alpha(theme.palette.primary.main, 0.4) : 'divider',
            color: search || categoryFilter ? 'primary.main' : 'text.secondary',
            bgcolor:
              search || categoryFilter ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
            '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.75 } },
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontSize: '0.8rem' }}>
            Filters
          </Box>
        </Button>
      </Tooltip>
    </>
  );

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <Box>
      {portalNode && createPortal(filtersButton, portalNode)}
      {/* Filter Popover */}
      <Popover
        open={Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              minWidth: 320,
              maxWidth: 380,
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            },
          },
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2.5,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name="TuneRounded"
              fallback={TuneRoundedIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Skills
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Search, filter & actions
            </Typography>
          </Box>
        </Box>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Search
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 16 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Category
            </Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                displayEmpty
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Categories</MenuItem>
                {SKILL_CATEGORIES.map((cat) => (
                  <MenuItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Source
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {[
                { v: 'all', l: 'All' },
                { v: 'bundled', l: 'Bundled' },
                { v: 'community', l: 'Community' },
              ].map((opt) => (
                <Chip
                  key={opt.v}
                  label={opt.l}
                  size="small"
                  clickable
                  color={sourceFilter === opt.v ? 'primary' : 'default'}
                  variant={sourceFilter === opt.v ? 'filled' : 'outlined'}
                  onClick={() => setSourceFilter(opt.v)}
                  sx={{ fontSize: '0.7rem', fontWeight: 600 }}
                />
              ))}
            </Box>
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Actions
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  <AppIcon
                    name="FileUploadOutlined"
                    fallback={FileUploadOutlinedIcon}
                    sx={{ fontSize: 14 }}
                  />
                }
                onClick={() => {
                  setFilterAnchor(null);
                  openImport();
                }}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  fontSize: '0.72rem',
                }}
              >
                Import
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  <AppIcon
                    name="AddCircleOutline"
                    fallback={AddCircleOutlineIcon}
                    sx={{ fontSize: 14 }}
                  />
                }
                onClick={() => {
                  setFilterAnchor(null);
                  openCreate();
                }}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  fontSize: '0.72rem',
                }}
              >
                Create
              </Button>
              <Button
                variant="contained"
                size="small"
                color="primary"
                startIcon={
                  <AppIcon
                    name="AutoFixHighOutlined"
                    fallback={AutoFixHighOutlinedIcon}
                    sx={{ fontSize: 14 }}
                  />
                }
                onClick={() => {
                  setFilterAnchor(null);
                  setForgeOpen(true);
                }}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2,
                  fontSize: '0.72rem',
                }}
              >
                Forge (AI)
              </Button>
            </Box>
          </Box>
        </Box>
      </Popover>
      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      )}
      {/* Skills grid */}
      {!loading &&
        (() => {
          const displayed = skills.filter((s) => {
            if (sourceFilter === 'bundled') return s.is_bundled === true;
            if (sourceFilter === 'community') return s.is_bundled === false;
            return true;
          });
          return (
            <Grid container spacing={2}>
              {displayed.map((skill) => (
                <Grid key={skill.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 2,
                      transition: 'border-color 0.2s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        boxShadow: createHoverGlowShadow(theme),
                      },
                    }}
                  >
                    {/* Header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: alpha(getCategoryColor(skill.category), 0.12),
                        }}
                      >
                        <SkillIcon
                          icon={skill.icon}
                          sx={{ color: getCategoryColor(skill.category), fontSize: 22 }}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="subtitle2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                            {skill.name}
                          </Typography>
                          <Tooltip
                            title={
                              skill.scan_report?.passed === true
                                ? 'Passed the prompt-injection safety scan'
                                : skill.scan_report
                                  ? 'Flagged by the safety scan'
                                  : 'Scan pending'
                            }
                          >
                            <Box
                              component="span"
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                flexShrink: 0,
                                bgcolor:
                                  skill.scan_report?.passed === true
                                    ? 'success.main'
                                    : skill.scan_report
                                      ? 'warning.main'
                                      : 'grey.500',
                              }}
                            />
                          </Tooltip>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          by {skill.author || 'Orqaly'}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Description */}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 1.5,
                        flex: 1,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {skill.description}
                    </Typography>

                    {/* Category + source + tags */}
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                      <Chip
                        label={getCategoryLabel(skill.category)}
                        size="small"
                        sx={{
                          bgcolor: alpha(getCategoryColor(skill.category), 0.12),
                          color: getCategoryColor(skill.category),
                          fontWeight: 600,
                          fontSize: '0.7rem',
                        }}
                      />
                      {skill.is_bundled && (
                        <Chip
                          label="Bundled"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', fontWeight: 700 }}
                        />
                      )}
                      {(skill.tags || []).slice(0, 2).map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      ))}
                    </Box>

                    {/* Footer */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mt: 'auto',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {skill.install_count || 0} installs
                        </Typography>
                        {skill.rating_count > 0 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontWeight: 600 }}
                          >
                            · ⭐ {Number(skill.rating_avg).toFixed(1)} ({skill.rating_count})
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" onClick={() => openPreview(skill)} title="Preview">
                          <AppIcon
                            name="VisibilityOutlined"
                            fallback={VisibilityOutlinedIcon}
                            fontSize="small"
                          />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => openInstall(skill)}
                          title="Install"
                          sx={{ color: getCategoryColor(skill.category) }}
                        >
                          <AppIcon
                            name="DownloadOutlined"
                            fallback={DownloadOutlinedIcon}
                            fontSize="small"
                          />
                        </IconButton>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          );
        })()}
      {/* Empty state */}
      {!loading && skills.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AppIcon
            name="ExtensionOutlined"
            fallback={ExtensionOutlinedIcon}
            sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
          />
          <Typography color="text.secondary">
            No skills found. Try a different search or category.
          </Typography>
        </Box>
      )}
      {/* ── Preview Dialog ──────────────────────────────────────────────── */}
      <FormDialog
        open={previewOpen}
        onClose={closePreview}
        title={previewSkill?.name || 'Skill Preview'}
        icon={ExtensionOutlinedIcon}
        maxWidth="md"
        actions={
          <>
            <Button onClick={closePreview}>Close</Button>
            <Button
              variant="contained"
              onClick={() => {
                closePreview();
                if (previewSkill) openInstall(previewSkill);
              }}
            >
              Install
            </Button>
          </>
        }
      >
        {/* Full description */}
        {previewSkill?.description && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, lineHeight: 1.6 }}>
            {previewSkill.description}
          </Typography>
        )}

        {/* Meta strip: author · version · installs · updated */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            mb: 2,
            color: 'text.secondary',
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
            by {previewSkill?.author || 'Orqaly'}
          </Typography>
          {previewSkill?.version && (
            <>
              <Box sx={{ width: 2, height: 2, bgcolor: 'text.disabled', borderRadius: '50%' }} />
              <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>
                v{previewSkill.version}
              </Typography>
            </>
          )}
          <Box sx={{ width: 2, height: 2, bgcolor: 'text.disabled', borderRadius: '50%' }} />
          <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>
            {previewSkill?.install_count || 0} installs
          </Typography>
          {reviewAggregate.count > 0 && (
            <>
              <Box sx={{ width: 2, height: 2, bgcolor: 'text.disabled', borderRadius: '50%' }} />
              <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600 }}>
                ⭐ {reviewAggregate.avg} · {reviewAggregate.count} review
                {reviewAggregate.count === 1 ? '' : 's'}
              </Typography>
            </>
          )}
          {previewSkill?.updated_at && (
            <>
              <Box sx={{ width: 2, height: 2, bgcolor: 'text.disabled', borderRadius: '50%' }} />
              <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>
                updated {formatRelativeTime(previewSkill.updated_at)}
              </Typography>
            </>
          )}
          {previewSkill?.is_bundled && (
            <Chip
              label="Bundled"
              size="small"
              color="primary"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
            />
          )}
          {previewSkill?.generation_source === 'forge' && (
            <Chip
              label="AI-Forged"
              size="small"
              color="secondary"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
            />
          )}
        </Box>

        {/* Safety scan block */}
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Safety scan
            </Typography>
            {previewSkill?.scan_report ? (
              <Chip
                size="small"
                icon={
                  previewSkill.scan_report.passed ? (
                    <AppIcon
                      name="CheckCircleOutline"
                      fallback={CheckCircleOutlineIcon}
                      sx={{ fontSize: 14 }}
                    />
                  ) : (
                    <AppIcon
                      name="ErrorOutline"
                      fallback={ErrorOutlineIcon}
                      sx={{ fontSize: 14 }}
                    />
                  )
                }
                label={previewSkill.scan_report.passed ? 'Benign' : 'Flagged'}
                color={previewSkill.scan_report.passed ? 'success' : 'warning'}
                variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
              />
            ) : (
              <Chip size="small" label="Scan pending" sx={{ height: 22, fontSize: '0.7rem' }} />
            )}
          </Box>
          {previewSkill?.scan_report && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.75, color: 'text.disabled', fontSize: '0.7rem' }}
            >
              Scanned{' '}
              {previewSkill.scan_report.at
                ? formatRelativeTime(previewSkill.scan_report.at)
                : 'recently'}
              {' · validator '}
              {previewSkill.scan_report.validator_version || 'v1'}
              {previewSkill.scan_report.forge && (
                <>
                  {' '}
                  · red-team {previewSkill.scan_report.forge.red_team_safe}/
                  {previewSkill.scan_report.forge.red_team_total} safe · behaviour{' '}
                  {previewSkill.scan_report.forge.behaviour_pass}/
                  {previewSkill.scan_report.forge.behaviour_total} reflect intent
                </>
              )}
            </Typography>
          )}
          {previewSkill?.scan_report?.passed === false && previewSkill.scan_report.rule && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.5, color: 'warning.main', fontSize: '0.7rem' }}
            >
              Rule: {previewSkill.scan_report.rule}
              {previewSkill.scan_report.excerpt ? ` — "${previewSkill.scan_report.excerpt}"` : ''}
            </Typography>
          )}
        </Box>

        {/* Compatible roles */}
        {Array.isArray(previewSkill?.compatible_roles) &&
          previewSkill.compatible_roles.length > 0 &&
          !(
            previewSkill.compatible_roles.length === 1 && previewSkill.compatible_roles[0] === 'all'
          ) && (
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="overline"
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'text.secondary',
                }}
              >
                Compatible roles
              </Typography>
              <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {previewSkill.compatible_roles.map((role) => (
                  <Chip
                    key={role}
                    size="small"
                    label={role}
                    variant="outlined"
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                ))}
              </Box>
            </Box>
          )}

        {/* All tags */}
        {Array.isArray(previewSkill?.tags) && previewSkill.tags.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Tags
            </Typography>
            <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {previewSkill.tags.map((tag) => (
                <Chip
                  key={tag}
                  size="small"
                  label={tag}
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Installed on your agents */}
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="overline"
            sx={{
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'text.secondary',
            }}
          >
            Installed on your agents
          </Typography>
          <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {previewLoading && previewAgents.length === 0 ? (
              <CircularProgress size={14} />
            ) : previewAgents.length === 0 ? (
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                Not installed on any agent yet.
              </Typography>
            ) : (
              previewAgents.map((a) => (
                <Chip
                  key={a.agent_id}
                  size="small"
                  label={a.display_name}
                  color={a.is_active ? 'primary' : 'default'}
                  variant={a.is_active ? 'filled' : 'outlined'}
                  sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                />
              ))
            )}
          </Box>
        </Box>

        {/* Your review — gated on install */}
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Your review
            </Typography>
            {reviewAggregate.count > 0 && (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                ⭐ {reviewAggregate.avg} · {reviewAggregate.count} review
                {reviewAggregate.count === 1 ? '' : 's'}
              </Typography>
            )}
          </Box>
          {previewAgents.length === 0 ? (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.75, color: 'text.disabled' }}
            >
              Install this skill on an agent before you can review it.
            </Typography>
          ) : (
            <Box sx={{ mt: 0.75 }}>
              <Rating
                value={myReview.stars}
                onChange={(_e, v) => setMyReview((r) => ({ ...r, stars: v || 0 }))}
                size="medium"
                disabled={reviewSubmitting}
              />
              <TextField
                fullWidth
                size="small"
                multiline
                rows={2}
                placeholder="Share what worked / didn't (optional, 280 chars)"
                value={myReview.comment}
                onChange={(e) =>
                  setMyReview((r) => ({ ...r, comment: e.target.value.slice(0, 280) }))
                }
                inputProps={{ maxLength: 280 }}
                sx={{ mt: 1 }}
                disabled={reviewSubmitting}
              />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 1,
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  {myReview.comment.length}/280
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  disabled={reviewSubmitting || !myReview.stars}
                  onClick={handleSubmitReview}
                  startIcon={reviewSubmitting ? <CircularProgress size={12} /> : null}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  {reviewSubmitting ? 'Saving…' : 'Save review'}
                </Button>
              </Box>
            </Box>
          )}
        </Box>

        {/* Content */}
        <Typography
          variant="overline"
          sx={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'text.secondary',
          }}
        >
          Prompt content
        </Typography>
        <Box
          sx={{
            mt: 0.75,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '0.85rem',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            p: 2,
            bgcolor: isDark ? 'grey.900' : 'grey.50',
            borderRadius: 1,
            minHeight: 80,
            display: 'flex',
            alignItems: previewLoading && !previewSkill?.content ? 'center' : 'flex-start',
            justifyContent: previewLoading && !previewSkill?.content ? 'center' : 'flex-start',
          }}
        >
          {previewLoading && !previewSkill?.content ? (
            <CircularProgress size={20} />
          ) : (
            previewSkill?.content || 'No content available.'
          )}
        </Box>
      </FormDialog>
      {/* ── Install Dialog ──────────────────────────────────────────────── */}
      <FormDialog
        open={installOpen}
        onClose={closeInstall}
        title={`Install "${installSkillData?.name || ''}"`}
        icon={DownloadOutlinedIcon}
        maxWidth="xs"
        actions={
          <>
            <Button onClick={closeInstall}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleInstall}
              disabled={installing || selectedAgents.length === 0}
              startIcon={
                installing ? (
                  <CircularProgress size={16} />
                ) : (
                  <AppIcon name="DownloadOutlined" fallback={DownloadOutlinedIcon} />
                )
              }
            >
              {installing ? 'Installing...' : `Install on ${selectedAgents.length} Agent(s)`}
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select agents to install this skill on:
        </Typography>
        {agents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No agents found. Create an agent first.
          </Typography>
        ) : (
          <FormGroup>
            {agents.map((agent) => (
              <FormControlLabel
                key={agent.id}
                control={
                  <Checkbox
                    checked={selectedAgents.includes(agent.id)}
                    onChange={() => handleAgentToggle(agent.id)}
                  />
                }
                label={agent.name || agent.id}
              />
            ))}
          </FormGroup>
        )}
      </FormDialog>
      {/* ── Create Dialog ───────────────────────────────────────────────── */}
      <FormDialog
        open={createOpen}
        onClose={closeCreate}
        title="Create New Skill"
        icon={AddCircleOutlineIcon}
        maxWidth="sm"
        contentDividers={false}
        contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        actions={
          <>
            <Button onClick={closeCreate}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={creating || !createForm.name || !createForm.content}
              startIcon={
                creating ? (
                  <CircularProgress size={16} />
                ) : (
                  <AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />
                )
              }
            >
              {creating ? 'Creating...' : 'Create Skill'}
            </Button>
          </>
        }
      >
        <TextField
          label="Name"
          fullWidth
          value={createForm.name}
          onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
        />
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={createForm.description}
          onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
        />
        <FormControl fullWidth>
          <InputLabel>Category</InputLabel>
          <Select
            value={createForm.category}
            label="Category"
            onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
          >
            {SKILL_CATEGORIES.map((cat) => (
              <MenuItem key={cat.value} value={cat.value}>
                {cat.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Tags (comma-separated)"
          fullWidth
          value={createForm.tags}
          onChange={(e) => setCreateForm((f) => ({ ...f, tags: e.target.value }))}
          placeholder="e.g. analysis, planning, strategy"
        />
        <TextField
          label="Skill Content (Markdown)"
          fullWidth
          multiline
          rows={12}
          value={createForm.content}
          onChange={(e) => setCreateForm((f) => ({ ...f, content: e.target.value }))}
          placeholder="# Skill Title&#10;&#10;Write your skill template in markdown..."
          slotProps={{
            input: {
              sx: { fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '0.85rem' },
            },
          }}
        />
      </FormDialog>
      {/* ── Import Dialog ─────────────────────────────────────────────── */}
      <FormDialog
        open={importOpen}
        onClose={closeImport}
        title="Import Skills"
        icon={FileUploadOutlinedIcon}
        maxWidth="sm"
        contentDividers={false}
        contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        actions={
          <>
            <Button onClick={closeImport}>{importResults ? 'Done' : 'Cancel'}</Button>
            {!importResults && (
              <Button
                variant="contained"
                onClick={handleImport}
                disabled={importing || importSkills.length === 0}
                startIcon={
                  importing ? (
                    <CircularProgress size={16} />
                  ) : (
                    <AppIcon name="FileUploadOutlined" fallback={FileUploadOutlinedIcon} />
                  )
                }
              >
                {importing ? 'Importing...' : `Import ${importSkills.length} Skill(s)`}
              </Button>
            )}
          </>
        }
      >
        <Typography variant="body2" color="text.secondary">
          Upload a JSON file containing one skill or an array of skills. Each skill must have at
          least <code>name</code> and <code>content</code> fields.
        </Typography>

        {/* File input */}
        <Button
          variant="outlined"
          component="label"
          startIcon={<AppIcon name="FileUploadOutlined" fallback={FileUploadOutlinedIcon} />}
          disabled={importing}
        >
          Choose JSON File
          <input type="file" accept=".json,application/json" hidden onChange={handleFileSelect} />
        </Button>

        {/* Parse error */}
        {importError && (
          <Alert
            severity="error"
            icon={<AppIcon name="ErrorOutline" fallback={ErrorOutlineIcon} />}
            sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}
          >
            {importError}
          </Alert>
        )}

        {/* Parsed preview */}
        {importSkills.length > 0 && !importResults && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {importSkills.length} skill(s) ready to import:
            </Typography>
            {importSkills.map((s, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SkillIcon
                    icon={s.icon}
                    sx={{ color: getCategoryColor(s.category || 'ops'), fontSize: 20 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {s.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {getCategoryLabel(s.category || 'ops')} · {s.content?.length || 0} chars
                    </Typography>
                  </Box>
                  <AppIcon
                    name="CheckCircleOutline"
                    fallback={CheckCircleOutlineIcon}
                    sx={{ color: 'success.main', fontSize: 20 }}
                  />
                </Box>
              </Paper>
            ))}
          </Box>
        )}

        {/* Import results */}
        {importResults && (
          <Box>
            <Alert severity={importResults.failed > 0 ? 'warning' : 'success'} sx={{ mb: 1 }}>
              {importResults.success} imported, {importResults.failed} failed
            </Alert>
            {importResults.errors.map((err, i) => (
              <Typography key={i} variant="caption" color="error" sx={{ display: 'block' }}>
                {err}
              </Typography>
            ))}
          </Box>
        )}
      </FormDialog>
      {/* ── Forge Dialog ────────────────────────────────────────────────── */}
      <SkillForgeDialog
        open={forgeOpen}
        onClose={() => setForgeOpen(false)}
        onApproved={(approved) => {
          if (approved) {
            setToast({
              open: true,
              message: 'Forge skill approved and saved',
              severity: 'success',
            });
            fetchSkills();
          } else setToast({ open: true, message: 'Forge skill rejected', severity: 'info' });
        }}
      />
      {/* ── Toast ───────────────────────────────────────────────────────── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          variant="filled"
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
