import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  TextField,
  Typography,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';

import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import DashboardGrid from '../../components/Dashboards/DashboardGrid';
import DashboardFilterBar from '../../components/Dashboards/DashboardFilterBar';
import BlockConfigDrawer from '../../components/Dashboards/BlockConfigDrawer';
import AutoPromptDialog from '../../components/Dashboards/AutoPromptDialog';
import { computeBentoLayout } from '../../components/Dashboards/bentoLayout';
import { BLOCK_REGISTRY } from '../../components/Dashboards/blockRegistry';
import useDashboardData from '../../hooks/useDashboardData';
import { getDashboard, updateDashboard } from '../../services/dashboardService';

import AppIcon from '../../components/icons/AppIcon';

function makeBlockId() {
  return `b-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultBlock(type) {
  const base = {
    id: makeBlockId(),
    type,
    title: BLOCK_REGISTRY[type]?.label || 'New block',
  };
  if (type === 'markdown') {
    return { ...base, body: '## New section\n\nAdd context here.' };
  }
  return {
    ...base,
    data: { dataset: 'goals', measure: { agg: 'count' } },
  };
}

export default function DashboardEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [dashboard, setDashboard] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState({ version: 1, layout: [], blocks: [], global_filters: {} });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  const [addMenu, setAddMenu] = useState(null);
  const [configuringBlock, setConfiguringBlock] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [autoDialogOpen, setAutoDialogOpen] = useState(searchParams.get('auto') === '1');

  const [globalFilters, setGlobalFilters] = useState({
    time_range: { kind: 'last_n_days', value: 30 },
  });

  const initialLoadRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getDashboard(id)
      .then((d) => {
        if (!alive) return;
        setDashboard(d);
        setTitle(d.title || '');
        setDescription(d.description || '');
        setConfig(d.config || { version: 1, layout: [], blocks: [], global_filters: {} });
        initialLoadRef.current = true;
      })
      .catch((e) => alive && setError(e.message || 'Failed to load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  // Warn on unload if dirty
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Auto-save with 3s debounce when dirty
  useEffect(() => {
    if (!dirty || saving || !initialLoadRef.current) return undefined;
    const t = setTimeout(() => {
      handleSave();
    }, 3000);
    return () => clearTimeout(t);
    // handleSave is stable through useCallback below; including it triggers
    // a re-arm loop because its deps include `config`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, config, title, description]);

  const blocks = useMemo(() => config.blocks || [], [config.blocks]);
  const layout = useMemo(() => config.layout || [], [config.layout]);

  const { resultsById, loading: dataLoading, refresh } = useDashboardData(blocks, globalFilters);

  const handleAddBlock = useCallback(
    (type) => {
      setAddMenu(null);
      const newBlock = defaultBlock(type);
      const nextBlocks = [...blocks, newBlock];
      // Re-flow the entire dashboard so the new block lands in a sensible spot
      // and existing blocks pack tightly. User can drag afterwards if they want.
      const newLayout = computeBentoLayout(nextBlocks);
      setConfig({ ...config, blocks: nextBlocks, layout: newLayout });
      setDirty(true);
      setConfiguringBlock(newBlock);
    },
    [blocks, config]
  );

  const handleAutoArrange = useCallback(() => {
    if (!blocks.length) return;
    const newLayout = computeBentoLayout(blocks);
    setConfig((prev) => ({ ...prev, layout: newLayout }));
    setDirty(true);
  }, [blocks]);

  const handleLayoutChange = useCallback(
    (newLayout) => {
      if (!initialLoadRef.current) return;
      // Only mark dirty if anything actually changed
      const changed = newLayout.some((item) => {
        const prev = layout.find((l) => l.i === item.i);
        return (
          !prev || prev.x !== item.x || prev.y !== item.y || prev.w !== item.w || prev.h !== item.h
        );
      });
      if (!changed && newLayout.length === layout.length) return;
      setConfig((prev) => ({
        ...prev,
        layout: newLayout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
      }));
      setDirty(true);
    },
    [layout]
  );

  const handleBlockAction = useCallback(
    (action, block) => {
      if (action === 'configure') {
        setConfiguringBlock(block);
        return;
      }
      if (action === 'duplicate') {
        const copy = { ...block, id: makeBlockId(), title: `${block.title} (copy)` };
        const nextBlocks = [...blocks, copy];
        setConfig((prev) => ({
          ...prev,
          blocks: nextBlocks,
          layout: computeBentoLayout(nextBlocks),
        }));
        setDirty(true);
        return;
      }
      if (action === 'delete') {
        if (!window.confirm(`Delete block "${block.title}"?`)) return;
        setConfig((prev) => ({
          ...prev,
          blocks: prev.blocks.filter((b) => b.id !== block.id),
          layout: prev.layout.filter((l) => l.i !== block.id),
        }));
        setDirty(true);
      }
    },
    [blocks]
  );

  const handleSaveConfiguredBlock = useCallback((updatedBlock) => {
    setConfig((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)),
    }));
    setDirty(true);
    setConfiguringBlock(null);
  }, []);

  const handleAutoApply = useCallback(
    (newConfig) => {
      setConfig(newConfig);
      setDirty(true);
      if (searchParams.get('auto')) {
        const next = new URLSearchParams(searchParams);
        next.delete('auto');
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, setSearchParams]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateDashboard(id, {
        title: title.trim(),
        description: description.trim() || null,
        config,
      });
      setDashboard(updated);
      setDirty(false);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [id, title, description, config]);

  const blockTypes = useMemo(() => Object.entries(BLOCK_REGISTRY), []);

  if (loading) {
    return (
      <PageLayout showTitleBlock={false}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      </PageLayout>
    );
  }
  if (!dashboard) {
    return (
      <PageLayout showTitleBlock={false}>
        <EmptyState
          title="Couldn't load dashboard"
          description={error || 'Dashboard not found.'}
          actionLabel="Back to list"
          onAction={() => navigate('/dashboards')}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={`Editing: ${title || 'Untitled'}`}
      subtitle="Drag, resize, and configure blocks. Save when you're done."
    >
      <BentoCard
        title={title || 'Untitled dashboard'}
        subtitle={dirty ? 'Unsaved changes' : 'All changes saved'}
        icon={DashboardCustomizeIcon}
        iconColor={theme.palette.primary.main}
        action={
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            <Button
              size="small"
              startIcon={!isMobile ? <AppIcon name="ArrowBack" fallback={ArrowBackIcon} /> : null}
              onClick={() => {
                if (dirty && !window.confirm('Discard unsaved changes?')) return;
                navigate('/dashboards');
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {isMobile ? (
                <AppIcon name="ArrowBack" fallback={ArrowBackIcon} fontSize="small" />
              ) : (
                'Back'
              )}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                !isMobile ? <AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} /> : null
              }
              onClick={() => setAutoDialogOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {isMobile ? (
                <AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} fontSize="small" />
              ) : (
                'Auto-build'
              )}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                !isMobile ? <AppIcon name="AutoFixHigh" fallback={AutoFixHighIcon} /> : null
              }
              onClick={handleAutoArrange}
              disabled={!blocks.length}
              title="Pack blocks into a tight bento grid"
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {isMobile ? (
                <AppIcon name="AutoFixHigh" fallback={AutoFixHighIcon} fontSize="small" />
              ) : (
                'Auto-arrange'
              )}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={!isMobile ? <AppIcon name="Add" fallback={AddIcon} /> : null}
              onClick={(e) => setAddMenu(e.currentTarget)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {isMobile ? <AppIcon name="Add" fallback={AddIcon} fontSize="small" /> : 'Add block'}
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={
                saving ? (
                  <CircularProgress size={14} />
                ) : (
                  <AppIcon name="Save" fallback={SaveIcon} />
                )
              }
              onClick={handleSave}
              disabled={saving || !dirty}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Save
            </Button>
          </Box>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' },
              gap: 1.5,
            }}
          >
            <TextField
              size="small"
              label="Title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
            <TextField
              size="small"
              label="Description (optional)"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
            />
          </Box>

          <DashboardFilterBar
            filters={globalFilters}
            onChange={setGlobalFilters}
            onRefresh={refresh}
          />

          {error && (
            <Box
              sx={{
                p: 1.25,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.error.main, 0.08),
                border: `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
              }}
            >
              <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                {error}
              </Typography>
            </Box>
          )}

          <DashboardGrid
            blocks={blocks}
            layout={layout}
            resultsById={resultsById}
            loading={dataLoading}
            editable
            onLayoutChange={handleLayoutChange}
            onBlockAction={handleBlockAction}
          />
        </Box>
      </BentoCard>
      <Menu anchorEl={addMenu} open={Boolean(addMenu)} onClose={() => setAddMenu(null)}>
        {blockTypes.map(([type, def]) => (
          <MenuItem key={type} onClick={() => handleAddBlock(type)}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {def.label}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
      <BlockConfigDrawer
        open={Boolean(configuringBlock)}
        block={configuringBlock}
        onClose={() => setConfiguringBlock(null)}
        onSave={handleSaveConfiguredBlock}
      />
      <AutoPromptDialog
        open={autoDialogOpen}
        currentConfig={blocks.length ? config : null}
        onClose={() => {
          setAutoDialogOpen(false);
          if (searchParams.get('auto')) {
            const next = new URLSearchParams(searchParams);
            next.delete('auto');
            setSearchParams(next, { replace: true });
          }
        }}
        onApply={handleAutoApply}
      />
    </PageLayout>
  );
}
