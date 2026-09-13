import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  IconButton,
  Checkbox,
  Snackbar,
  Alert,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../config/assistantBrain';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import Rating from '@mui/material/Rating';
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import MarketplaceToolbar from './MarketplaceToolbar';
import RatingCommentDialog from './RatingCommentDialog';
import MarketplaceAgentDetailDialog from './MarketplaceAgentDetailDialog';
import BulkActivateAgentsDialog from './BulkActivateAgentsDialog';
import AgentAvatar from '../AgentHub/AgentAvatar';
import useMarketplaceSearch from '../../hooks/useMarketplaceSearch';
import useImportedLibraries from '../../hooks/useImportedLibraries';
import { ImportFromButton } from './ImportLibraryDialog';
import usePagination from '../../hooks/usePagination';
import { deriveFacetOptions, mergeFacetOptions } from '../../utils/facetOptions';
import { PREDEFINED_AGENTS } from '../../config/predefinedAgents';
import { PREDEFINED_AGENT_PROFILES } from '../../config/predefinedAgentProfiles';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { getAgents, addAgent } from '../../services/agentHubService';
import { deriveImportedFrom } from '../../services/agentImportMaterializer';
import { registerAgentsInKb } from '../../services/knowledgeBaseService';
import { seedProfiles } from '../../services/agentProfileService';
import { buildAgentProfile } from '../../services/agentProfileBuilder';
import {
  getAllRatings,
  saveRating,
  syncRatingsFromDB,
} from '../../services/marketplaceRatingService';

import AppIcon from '../icons/AppIcon';

const CATEGORIES = [
  { value: 'Founder', label: 'Founder', color: '#7C3AED' },
  { value: 'Development', label: 'Development', color: '#2563EB' },
  { value: 'Marketing & Sales', label: 'Marketing & Sales', color: '#D97706' },
  { value: 'Operations', label: 'Operations', color: '#059669' },
];

const PROVIDER_LABELS = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  glm: 'GLM',
};

const PROVIDER_CONFIG = Object.entries(PROVIDER_LABELS).map(([value, label]) => ({ value, label }));

const FACETS = [
  { key: 'connection_type', label: 'Connection', field: 'connection_type' },
  { key: 'capabilities', label: 'Capabilities', field: 'capabilities', array: true },
];

const SORT_OPTIONS = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'cost', label: 'Cost (low → high)' },
  { value: 'newest', label: 'Newest' },
];

function getCategoryColor(category) {
  return CATEGORIES.find((c) => c.value === category)?.color || '#10B981';
}

function roleSlug(role) {
  return String(role || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeMarketplaceAgentLlm(agent) {
  const hasCompletePair = Boolean(agent?.provider && agent?.model);
  const provider = hasCompletePair ? agent.provider : DEFAULT_LLM_PROVIDER;
  const model = hasCompletePair ? agent.model : DEFAULT_LLM_MODEL;
  return {
    ...agent,
    provider,
    model,
    connection_type: hasCompletePair ? agent.connection_type || provider : provider,
  };
}

export default function MarketplaceAgentsTab() {
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [workspaceAgents, setWorkspaceAgents] = useState([]);
  const [previewAgent, setPreviewAgent] = useState(null);
  const [adding, setAdding] = useState(null);
  const [ratings, setRatings] = useState(() => getAllRatings());
  const [ratingDialog, setRatingDialog] = useState({ open: false, id: '', name: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Load workspace agents + sync ratings from DB on mount
  useEffect(() => {
    const agents = getAgents();
    setWorkspaceAgents(agents);
    setLoading(false);
    syncRatingsFromDB().then((synced) => setRatings(synced));
  }, []);

  // Profile lookup by role (for Eastern European personas, photos, bios)
  const profilesByRole = useMemo(() => {
    const map = {};
    for (const p of PREDEFINED_AGENT_PROFILES) {
      if (!p.role) continue;
      // Derive headshot_path from display_name when missing
      // (photos in /team-headshots/ are named like "viktorija-sirko.jpg")
      let headshot_path = p.headshot_path;
      if (!headshot_path && p.display_name) {
        const slug = p.display_name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        headshot_path = `${slug}.jpg`;
      }
      map[p.role] = { ...p, headshot_path };
    }
    return map;
  }, []);

  // Build template list with IDs + merged profile data
  const templates = useMemo(
    () =>
      PREDEFINED_AGENTS.map((a, i) => {
        const profile = profilesByRole[a.role];
        return normalizeMarketplaceAgentLlm({
          ...a,
          _id: `predefined-${i}`,
          name: a.role,
          profile,
        });
      }),
    [profilesByRole]
  );

  const workspaceByRole = useMemo(() => {
    const map = {};
    for (const a of workspaceAgents) map[a.role] = a;
    return map;
  }, [workspaceAgents]);

  // Auto-open the agent detail dialog when navigated with ?role=<slug>
  // (e.g. from the Marketplace landing page pill marquee).
  useEffect(() => {
    const slug = searchParams.get('role');
    if (!slug || previewAgent) return;
    const match = templates.find((t) => roleSlug(t.role) === slug);
    if (match) setPreviewAgent(match);
  }, [searchParams, templates, previewAgent]);

  const handleClosePreview = useCallback(() => {
    setPreviewAgent(null);
    if (searchParams.get('role')) {
      const next = new URLSearchParams(searchParams);
      next.delete('role');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const workspaceRoles = useMemo(
    () => new Set(workspaceAgents.map((a) => a.role)),
    [workspaceAgents]
  );

  const formatTemplateAgentId = useCallback(
    (agent) => {
      const ws = workspaceByRole[agent.role];
      if (ws?.agent_id) return `AGENT-${String(ws.agent_id).slice(-8).toUpperCase()}`;
      if (ws?.id) return `AGENT-${String(ws.id).slice(-8).toUpperCase()}`;
      // Deterministic pseudo-ID for templates (role-based hash)
      let hash = 0;
      for (let i = 0; i < agent.role.length; i++) {
        hash = Math.trunc(hash * 31 + agent.role.codePointAt(i));
      }
      return `AGENT-${Math.abs(hash).toString(16).slice(0, 8).toUpperCase().padEnd(8, '0')}`;
    },
    [workspaceByRole]
  );

  const { importedItems } = useImportedLibraries('agents');
  const mergedItems = useMemo(
    () => [...templates, ...importedItems.map(normalizeMarketplaceAgentLlm)],
    [templates, importedItems]
  );

  const searchOptions = useMemo(() => ({ facets: FACETS }), []);
  const facetOptions = useMemo(
    () => ({
      connection_type: mergeFacetOptions(
        deriveFacetOptions(mergedItems, 'connection_type'),
        PROVIDER_CONFIG
      ),
      capabilities: deriveFacetOptions(mergedItems, 'capabilities', { array: true }),
    }),
    [mergedItems]
  );

  const {
    filteredItems,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
    resultCount,
    facets,
    facetFilters,
    toggleFacetValue,
    clearAllFacets,
    facetKey,
  } = useMarketplaceSearch(
    mergedItems,
    ['role', 'description', 'capabilities'],
    'category',
    searchOptions
  );

  const pagination = usePagination(filteredItems, {
    surfaceId: 'marketplace.agents',
    defaultRowsPerPage: 12,
    resetOn: [searchQuery, categoryFilter, sortBy, facetKey],
  });

  const handleAdd = useCallback(async (agent) => {
    setAdding(agent._id);
    try {
      addAgent({
        role: agent.role,
        description: agent.description,
        capabilities: agent.capabilities,
        connection_type: agent.connection_type,
        provider: agent.provider,
        model: agent.model,
        connection_id: '',
        input_format: 'text',
        output_format: 'text',
        constraints: {},
        performance_kpis: {},
        availability_status: 'available',
        cost_per_task: agent.cost_per_task || 0,
        category: agent.category?.toLowerCase() || 'general',
        system_prompt: agent.system_prompt || '',
        imported_from: deriveImportedFrom(agent),
      });
      setWorkspaceAgents(getAgents());
      setToast({ open: true, message: `${agent.role} added to workspace`, severity: 'success' });
      // Best-effort, deferred so the agent row lands in Supabase first (addAgent's
      // upsert is async, and both lookups match by role): register the persona in
      // the KB, and seed a full deterministic profile so the card isn't empty.
      setTimeout(() => {
        registerAgentsInKb([
          { role: agent.role, title: agent.name || agent.role, content: agent.system_prompt || '' },
        ]).catch(() => {});
        seedProfiles([buildAgentProfile(agent)]).catch(() => {});
      }, 1500);
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setAdding(null);
    }
  }, []);

  // Bulk-activate imported agents (see agentImportMaterializer.js) — lets a
  // whole imported library go straight to fully-formed Agent Hub cards
  // instead of clicking "Add" once per persona.
  const agentKey = useCallback(
    (agent) => (agent._imported ? `${agent._sourceId}:${agent._id}` : agent._id),
    []
  );

  const toggleSelected = useCallback(
    (agent) => {
      const key = agentKey(agent);
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [agentKey]
  );

  const selectedAgents = useMemo(
    () => mergedItems.filter((a) => selectedKeys.has(agentKey(a))),
    [mergedItems, selectedKeys, agentKey]
  );

  const selectableImportedCount = useMemo(
    () => importedItems.filter((a) => !workspaceRoles.has(a.role)).length,
    [importedItems, workspaceRoles]
  );

  const handleSelectAllImported = useCallback(() => {
    setSelectedKeys(
      new Set(importedItems.filter((a) => !workspaceRoles.has(a.role)).map(agentKey))
    );
  }, [importedItems, workspaceRoles, agentKey]);

  const handleBulkComplete = useCallback((result) => {
    setWorkspaceAgents(getAgents());
    setSelectedKeys(new Set());
    if (!result?.error) {
      setToast({
        open: true,
        message: `${result.createdCount} agent${result.createdCount === 1 ? '' : 's'} activated${
          result.skippedCount ? `, ${result.skippedCount} skipped` : ''
        }`,
        severity: 'success',
      });
    }
  }, []);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={40} sx={{ mb: 3, borderRadius: 2 }} />
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 6, lg: 4 }}>
              <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2.5 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      <MarketplaceToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={CATEGORIES}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOptions={SORT_OPTIONS}
        placeholder="Search agents..."
        resultCount={resultCount}
        totalCount={mergedItems.length}
        facets={facets}
        facetFilters={facetFilters}
        facetOptions={facetOptions}
        onToggleFacet={toggleFacetValue}
        onClearFacets={clearAllFacets}
        actionButton={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ImportFromButton category="agents" />
            {selectableImportedCount > 0 && (
              <Button
                size="small"
                variant="outlined"
                onClick={handleSelectAllImported}
                sx={{ textTransform: 'none' }}
              >
                Select all imported ({selectableImportedCount})
              </Button>
            )}
          </Box>
        }
      />
      {selectedKeys.size > 0 && (
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.06),
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedKeys.size} agent{selectedKeys.size === 1 ? '' : 's'} selected
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" onClick={() => setSelectedKeys(new Set())}>
              Clear
            </Button>
            <Button size="small" variant="contained" onClick={() => setBulkDialogOpen(true)}>
              Activate {selectedKeys.size}
            </Button>
          </Box>
        </Paper>
      )}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={SmartToyOutlinedIcon}
          title="No agents found"
          description="Try different keywords or clear your filters."
        />
      ) : (
        <>
          <Grid container spacing={2}>
            {pagination.paginatedData.map((agent, idx) => {
              const catColor = getCategoryColor(agent.category);
              const isAdded = workspaceRoles.has(agent.role);
              const ws = workspaceByRole[agent.role];
              const profile = agent.profile;
              const displayName = profile?.display_name || ws?.name || agent.role;
              const agentIdLabel = formatTemplateAgentId(agent);
              const toolsList = Array.isArray(agent.tools) ? agent.tools : [];
              const toolsShown = toolsList.slice(0, 4);
              const toolsOverflow = Math.max(0, toolsList.length - toolsShown.length);
              const taskCount = ws?.taskCount ?? 0;
              const successRate = ws?.successRate ?? 0;
              let successColor = theme.palette.error.main;
              if (successRate >= 80) successColor = theme.palette.success.main;
              else if (successRate >= 50) successColor = theme.palette.warning.main;
              const modelLabel = agent.model || DEFAULT_LLM_MODEL;
              const providerColor =
                (agent.connection_type || DEFAULT_LLM_PROVIDER) === DEFAULT_LLM_PROVIDER
                  ? '#4285F4'
                  : theme.palette.primary.main;

              return (
                <Grid
                  key={agent._imported ? `${agent._sourceId}:${agent._id}` : agent._id}
                  size={{ xs: 12, sm: 6, md: 6, lg: 4 }}
                >
                  <Paper
                    elevation={0}
                    onClick={() => setPreviewAgent(agent)}
                    sx={{
                      p: 2,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(catColor, 0.18),
                      background: `linear-gradient(135deg, ${alpha(catColor, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                      transition: 'all 0.2s ease-in-out',
                      cursor: 'pointer',
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: 'translateY(-2px)',
                        boxShadow: createHoverGlowShadow(theme),
                      },
                      animation: theme.animations?.fadeInUp,
                      animationDelay: `${Math.min(idx * 50, 400)}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    {/* Header: checkbox + avatar + name + role + agent id + model badge */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
                      {!isAdded && (
                        <Checkbox
                          size="small"
                          checked={selectedKeys.has(agentKey(agent))}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelected(agent)}
                          sx={{ p: 0.5, mt: -0.5, ml: -0.5 }}
                        />
                      )}
                      <AgentAvatar profile={profile} size="medium" />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body1"
                          sx={{ fontWeight: 700, lineHeight: 1.2 }}
                          noWrap
                        >
                          {displayName}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}
                          noWrap
                        >
                          {agent.role}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.disabled',
                            fontFamily: 'monospace',
                            fontSize: '0.65rem',
                          }}
                        >
                          {agentIdLabel}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          gap: 0.5,
                        }}
                      >
                        <Chip
                          label={modelLabel}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            bgcolor: alpha(providerColor, 0.15),
                            color: providerColor,
                            borderRadius: 1.5,
                          }}
                        />
                        {agent._imported && (
                          <Chip
                            label="Imported"
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.58rem',
                              fontWeight: 600,
                              bgcolor: alpha(theme.palette.secondary.main, 0.14),
                              color: 'secondary.main',
                            }}
                          />
                        )}
                      </Box>
                    </Box>

                    {/* Category */}
                    <Box sx={{ mb: 1.25 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: '0.04em',
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Category
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AppIcon
                          name="LabelOutlined"
                          fallback={LabelOutlinedIcon}
                          sx={{ fontSize: 14, color: catColor }}
                        />
                        <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 500 }}>
                          {agent.category || '—'}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Connection */}
                    <Box sx={{ mb: 1.25 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: '0.04em',
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Connection
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 500 }}>
                        {PROVIDER_LABELS[agent.connection_type] || agent.connection_type}
                      </Typography>
                    </Box>

                    {/* Tools */}
                    {toolsList.length > 0 && (
                      <Box sx={{ mb: 1.25 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            fontSize: '0.62rem',
                            letterSpacing: '0.04em',
                            display: 'block',
                            mb: 0.5,
                          }}
                        >
                          Tools
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {toolsShown.map((t) => (
                            <Chip
                              key={t}
                              label={t}
                              size="small"
                              sx={{
                                fontSize: '0.62rem',
                                height: 20,
                                bgcolor: alpha(theme.palette.text.primary, 0.05),
                                maxWidth: 160,
                              }}
                            />
                          ))}
                          {toolsOverflow > 0 && (
                            <Chip
                              label={`+${toolsOverflow}`}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.62rem', height: 20 }}
                            />
                          )}
                        </Box>
                      </Box>
                    )}

                    {/* Usage */}
                    <Box sx={{ mb: 1.25 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: '0.04em',
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Usage
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 500 }}>
                        Tasks: {taskCount} ·{' '}
                        <Box
                          component="span"
                          sx={{
                            color: taskCount > 0 ? successColor : 'error.main',
                            fontWeight: 600,
                          }}
                        >
                          Success: {successRate}%
                        </Box>
                      </Typography>
                    </Box>

                    {/* Projects */}
                    <Box sx={{ mb: 1.25 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: '0.04em',
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Projects
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.82rem', color: 'text.disabled' }}
                      >
                        —
                      </Typography>
                    </Box>

                    {/* Added by */}
                    <Box sx={{ mb: 1.25 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          fontSize: '0.62rem',
                          letterSpacing: '0.04em',
                          display: 'block',
                          mb: 0.25,
                        }}
                      >
                        Added by
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AppIcon
                          name="PersonOutline"
                          fallback={PersonOutlineIcon}
                          sx={{ fontSize: 14, color: 'text.secondary' }}
                        />
                        <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
                          predefined
                        </Typography>
                      </Box>
                    </Box>

                    {/* Rating (kept) */}
                    {ratings[agent._id]?.rating && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <Rating
                          value={ratings[agent._id].rating}
                          size="small"
                          readOnly
                          sx={{ '& .MuiRating-iconFilled': { color: '#F59E0B' } }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 600 }}
                        >
                          {ratings[agent._id].rating}
                        </Typography>
                      </Box>
                    )}

                    {/* Footer: cost + actions */}
                    <Box
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mt: 'auto',
                        pt: 1,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: catColor }}>
                          ${agent.cost_per_task?.toFixed(2)}/task
                        </Typography>
                        {isAdded && (
                          <IconButton
                            size="small"
                            onClick={() =>
                              setRatingDialog({ open: true, id: agent._id, name: agent.role })
                            }
                            sx={{ p: 0.25 }}
                          >
                            <AppIcon
                              name="StarRounded"
                              fallback={StarRoundedIcon}
                              sx={{
                                fontSize: 16,
                                color: ratings[agent._id]?.rating ? '#F59E0B' : 'text.disabled',
                              }}
                            />
                          </IconButton>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {isAdded ? (
                          <Chip
                            icon={
                              <AppIcon
                                name="CheckCircleOutline"
                                fallback={CheckCircleOutlineIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            label="Added"
                            size="small"
                            color="success"
                            sx={{ height: 30, fontWeight: 600, fontSize: '0.72rem' }}
                          />
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={
                              <AppIcon
                                name="AddCircleOutline"
                                fallback={AddCircleOutlineIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            onClick={() => handleAdd(agent)}
                            disabled={adding === agent._id}
                            sx={{
                              fontSize: '0.72rem',
                              textTransform: 'none',
                              minWidth: 'auto',
                              px: 1.5,
                              borderRadius: 2,
                            }}
                          >
                            {adding === agent._id ? 'Adding...' : 'Add'}
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
          <Pagination
            count={pagination.totalCount}
            page={pagination.page}
            rowsPerPage={pagination.rowsPerPage}
            rowsPerPageOptions={pagination.rowsPerPageOptions}
            onPageChange={pagination.setPage}
            onRowsPerPageChange={pagination.setRowsPerPage}
            onLoadAll={pagination.loadAll}
            onCollapseAll={pagination.collapseAll}
            allMode={pagination.allMode}
            label="agents"
            dense
          />
        </>
      )}
      {/* Agent Detail Dialog — full AgentHub-style panel */}
      <MarketplaceAgentDetailDialog
        open={!!previewAgent}
        onClose={handleClosePreview}
        agent={previewAgent}
        profile={previewAgent?.profile}
        workspaceAgent={previewAgent ? workspaceByRole[previewAgent.role] : null}
        isAdded={!!previewAgent && workspaceRoles.has(previewAgent.role)}
        onAdd={() => previewAgent && handleAdd(previewAgent)}
      />
      {/* Bulk Activate Dialog */}
      <BulkActivateAgentsDialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        agents={selectedAgents}
        onComplete={handleBulkComplete}
      />
      {/* Rating Dialog */}
      <RatingCommentDialog
        open={ratingDialog.open}
        onClose={() => setRatingDialog({ open: false, id: '', name: '' })}
        itemName={ratingDialog.name}
        currentRating={ratings[ratingDialog.id]?.rating}
        currentComment={ratings[ratingDialog.id]?.comment}
        onSave={(r, c) => {
          saveRating(ratingDialog.id, r, c, 'agent');
          setRatings(getAllRatings());
          setToast({ open: true, message: 'Rating saved', severity: 'success' });
        }}
      />
      {/* Toast */}
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
