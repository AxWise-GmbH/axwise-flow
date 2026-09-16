/**
 * Dashboards list page.
 *
 * Layout: PageLayout(showTitleBlock=false) > BentoCard{ header + tabs + toolbar + grid|list }
 *
 * Toolbar from left → right:
 *   - Search field
 *   - View toggle (card | list)        → persists to localStorage('dashboards.viewMode')
 *   - Activity log icon button         → opens DashboardActivityDialog
 *   - New button                       → opens NewDashboardDialog (Build/Generate tabs)
 *
 * The dialog combines the old "+ New dashboard" + "✨ Auto-build" buttons.
 *
 * localStorage keys:
 *   - 'dashboards.viewMode'      'card' | 'list'
 *   - 'dashboards.newDialogTab'  'build' | 'generate' (managed by NewDashboardDialog)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  TextField,
  CircularProgress,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import GroupIcon from '@mui/icons-material/Group';

import PageLayout from '../../components/Common/PageLayout';
import PillTabStrip from '../../components/Common/PillTabStrip';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import DashboardCard from '../../components/Dashboards/DashboardCard';
import DashboardListView from '../../components/Dashboards/DashboardListView';
import NewDashboardDialog from '../../components/Dashboards/NewDashboardDialog';
import DashboardActivityDialog from '../../components/Dashboards/DashboardActivityDialog';
import {
  listDashboards,
  deleteDashboard,
  duplicateDashboard,
  listTemplates,
  forkTemplate,
} from '../../services/dashboardService';

import AppIcon from '../../components/icons/AppIcon';

const TABS = [
  { key: 'mine', label: 'My dashboards' },
  { key: 'shared', label: 'Shared with me' },
  { key: 'templates', label: 'Templates' },
];

const VIEW_MODE_KEY = 'dashboards.viewMode';

function TemplateCard({ tpl, onFork }) {
  const theme = useTheme();
  const blockCount = tpl.config?.blocks?.length || 0;
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 1.75 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        height: '100%',
        '&:hover': {
          borderColor: alpha(theme.palette.secondary.main, 0.4),
          transform: 'translateY(-2px)',
          boxShadow: `0 6px 24px ${alpha(theme.palette.secondary.main, 0.08)}`,
        },
      }}
    >
      <Box
        sx={{
          height: 80,
          borderRadius: 2,
          mb: 0.5,
          background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.15)} 0%, ${alpha(theme.palette.primary.main, 0.08)} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.palette.secondary.main,
        }}
      >
        <AppIcon
          name="DashboardCustomize"
          fallback={DashboardCustomizeIcon}
          sx={{ fontSize: 32 }}
        />
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
        {tpl.title}
      </Typography>
      {tpl.description && (
        <Typography variant="caption" color="text.secondary">
          {tpl.description}
        </Typography>
      )}
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          flexWrap: 'wrap',
          alignItems: 'center',
          mt: 'auto',
          pt: 1,
        }}
      >
        <Chip
          size="small"
          label={`${blockCount} blocks`}
          sx={{ height: 22, fontWeight: 600, fontSize: '0.65rem' }}
        />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          onClick={() => onFork(tpl)}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            py: 0.4,
            px: 1.25,
            fontSize: '0.75rem',
          }}
        >
          Fork
        </Button>
      </Box>
    </Paper>
  );
}

export default function DashboardList({ embedded = false } = {}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgFilter = searchParams.get('org_id') || '';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const Wrapper = embedded ? Box : PageLayout;
  const wrapperProps = embedded ? { sx: { width: '100%' } } : { showTitleBlock: false };

  const [tab, setTab] = useState('mine');
  const [owned, setOwned] = useState([]);
  const [shared, setShared] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'card';
    try {
      return window.localStorage.getItem(VIEW_MODE_KEY) || 'card';
    } catch {
      return 'card';
    }
  });

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, tpls] = await Promise.all([listDashboards(), listTemplates()]);
      setOwned(list?.owned || []);
      setShared(list?.shared || []);
      setTemplates(tpls || []);
    } catch (err) {
      console.warn('Failed to load dashboards', err);
      setOwned([]);
      setShared([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filtered = useCallback(
    (list) => {
      const q = search.trim().toLowerCase();
      if (!q) return list;
      return list.filter(
        (d) => d.title?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q)
      );
    },
    [search]
  );

  const handleAction = useCallback(
    async (action, d) => {
      if (action === 'open') {
        const qs = orgFilter ? `?org_id=${encodeURIComponent(orgFilter)}` : '';
        navigate(`/dashboards/${d.id}${qs}`);
        return;
      }
      if (action === 'duplicate') {
        try {
          const copy = await duplicateDashboard(d.id);
          setOwned((prev) => [copy, ...prev]);
        } catch (err) {
          console.warn(err);
        }
        return;
      }
      if (action === 'delete') {
        if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
        try {
          await deleteDashboard(d.id);
          setOwned((prev) => prev.filter((x) => x.id !== d.id));
        } catch (err) {
          console.warn(err);
        }
      }
    },
    [navigate, orgFilter]
  );

  const handleFork = useCallback(
    async (tpl) => {
      try {
        const created = await forkTemplate(tpl.id);
        navigate(`/dashboards/${created.id}/edit`);
      } catch (err) {
        console.warn(err);
      }
    },
    [navigate]
  );

  const handleCreated = useCallback(
    (created, { auto }) => {
      setNewDialogOpen(false);
      navigate(`/dashboards/${created.id}/edit${auto ? '?auto=1' : ''}`);
    },
    [navigate]
  );

  const tabBar = (
    <PillTabStrip
      radius={2.5}
      gap={0.5}
      sx={{
        px: 0,
        pt: 0,
        pb: 0,
        width: { xs: '100%', sm: 'fit-content' },
        flexShrink: { sm: 0 },
      }}
    >
      {TABS.map((t) => {
        const active = t.key === tab;
        const count =
          t.key === 'mine' ? owned.length : t.key === 'shared' ? shared.length : templates.length;
        return (
          <Button
            key={t.key}
            onClick={() => setTab(t.key)}
            size="small"
            sx={{
              minHeight: 34,
              px: { xs: 1.25, sm: 1.75 },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: { xs: '0.72rem', sm: '0.78rem' },
              color: active ? 'primary.main' : 'text.secondary',
              bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
              boxShadow: active ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
              flexShrink: 0,
              gap: 0.75,
              '&:hover': {
                bgcolor: active
                  ? alpha(theme.palette.primary.main, 0.14)
                  : alpha(theme.palette.text.primary, 0.04),
              },
            }}
          >
            {t.label}
            <Chip
              label={count}
              size="small"
              sx={{
                height: 18,
                fontWeight: 700,
                fontSize: '0.62rem',
                bgcolor: active
                  ? alpha(theme.palette.primary.main, 0.2)
                  : alpha(theme.palette.text.primary, 0.06),
                color: active ? 'primary.main' : 'text.secondary',
              }}
            />
          </Button>
        );
      })}
    </PillTabStrip>
  );

  const tabContent = useMemo(() => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      );
    }

    if (tab === 'mine') {
      const list = filtered(owned);
      if (!owned.length) {
        return (
          <EmptyState
            icon={DashboardCustomizeIcon}
            title="No dashboards yet"
            description="Click New to start blank or let AI describe one for you."
            actionLabel="Create your first dashboard"
            onAction={() => setNewDialogOpen(true)}
          />
        );
      }
      if (!list.length) {
        return (
          <EmptyState
            icon={SearchIcon}
            title="No matches"
            description={`No dashboards match "${search}".`}
          />
        );
      }
      if (viewMode === 'list') {
        return (
          <DashboardListView
            dashboards={list}
            onOpen={(d) => handleAction('open', d)}
            onAction={handleAction}
          />
        );
      }
      return (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: { xs: 1.25, sm: 1.5 },
          }}
        >
          {list.map((d) => (
            <DashboardCard
              key={d.id}
              dashboard={d}
              onOpen={(x) => handleAction('open', x)}
              onAction={handleAction}
            />
          ))}
        </Box>
      );
    }

    if (tab === 'shared') {
      const list = filtered(shared);
      if (!list.length) {
        return (
          <EmptyState
            icon={GroupIcon}
            title="Nothing shared with you yet"
            description="Dashboards shared via groups will appear here."
          />
        );
      }
      if (viewMode === 'list') {
        return (
          <DashboardListView
            dashboards={list}
            onOpen={(d) => handleAction('open', d)}
            onAction={handleAction}
            isShared
          />
        );
      }
      return (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: { xs: 1.25, sm: 1.5 },
          }}
        >
          {list.map((d) => (
            <DashboardCard
              key={d.id}
              dashboard={d}
              isShared
              sharedCanEdit={d.can_edit}
              onOpen={(x) => handleAction('open', x)}
              onAction={handleAction}
            />
          ))}
        </Box>
      );
    }

    // templates
    const list = filtered(templates);
    if (!list.length) {
      return (
        <EmptyState
          icon={DashboardCustomizeIcon}
          title="No templates available"
          description="Templates appear once migration 142/143 is applied."
        />
      );
    }
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
          gap: { xs: 1.25, sm: 1.5 },
        }}
      >
        {list.map((t) => (
          <TemplateCard key={t.id} tpl={t} onFork={handleFork} />
        ))}
      </Box>
    );
  }, [
    tab,
    loading,
    owned,
    shared,
    templates,
    filtered,
    search,
    viewMode,
    handleAction,
    handleFork,
  ]);

  return (
    <Wrapper {...wrapperProps}>
      <BentoCard
        title="Dashboards"
        subtitle={`${owned.length} owned · ${shared.length} shared · ${templates.length} templates`}
        icon={DashboardCustomizeIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        plainHeader
        explain
        noTour
      >
        {/* Toolbar row (Projects-style): view toggle + activity log, then the primary action */}
        <Box
          sx={{
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_e, v) => v != null && setViewMode(v)}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.background.default, 0.8),
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              '& .MuiToggleButton-root': {
                px: 1.25,
                py: 0.6,
                border: 'none',
                color: 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.15),
                  color: 'primary.main',
                },
              },
            }}
          >
            <ToggleButton value="card" aria-label="Card view">
              <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
            <ToggleButton value="list" aria-label="List view">
              <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Activity log" arrow>
            <IconButton
              onClick={() => setActivityOpen(true)}
              size="small"
              aria-label="Activity log"
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
            >
              <AppIcon
                name="History"
                fallback={HistoryIcon}
                sx={{ fontSize: 18, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="contained"
            startIcon={!isMobile ? <AppIcon name="Add" fallback={AddIcon} /> : null}
            onClick={() => setNewDialogOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            {isMobile ? <AppIcon name="Add" fallback={AddIcon} fontSize="small" /> : 'New'}
          </Button>
        </Box>
        {/* Categories (tab bar) + search row, directly under header strip */}
        <Box
          sx={{
            p: { xs: 1.25, sm: 1.5 },
            display: 'flex',
            gap: 1.25,
            alignItems: 'center',
            flexDirection: { xs: 'column', sm: 'row' },
          }}
        >
          {tabBar}
          {orgFilter && (
            <Chip
              label="Organization filter"
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700, fontSize: '0.68rem', flexShrink: 0 }}
            />
          )}
          <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
          <TextField
            size="small"
            placeholder="Search dashboards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <AppIcon
                  name="Search"
                  fallback={SearchIcon}
                  fontSize="small"
                  sx={{ mr: 0.75, color: 'text.secondary' }}
                />
              ),
            }}
            sx={{
              width: { xs: '100%', sm: 260 },
              '& .MuiOutlinedInput-root': { borderRadius: 2 },
            }}
          />
        </Box>
        <Box sx={{ borderTop: 1, borderColor: 'divider' }} />
        <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>{tabContent}</Box>
      </BentoCard>
      <NewDashboardDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        onCreated={handleCreated}
      />
      <DashboardActivityDialog open={activityOpen} onClose={() => setActivityOpen(false)} />
    </Wrapper>
  );
}
