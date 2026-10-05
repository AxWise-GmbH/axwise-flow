/**
 * MarketplaceAgentDetailDialog — replicates the AgentHub detail panel
 * for Marketplace agents. Works with both predefined templates and
 * workspace agents (when the agent has been added to workspace).
 *
 * Props: { open, onClose, agent, workspaceAgent, onAdd, isAdded }
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Chip,
  IconButton,
  Button,
  Paper,
  Stack,
  Divider,
  Tabs,
  Tab,
  Collapse,
  TextField,
  Rating,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Slider,
  Alert,
  CircularProgress,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  alpha,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import { getAgentRatings, submitRating, deleteRating } from '../../services/agentRatingService';
import { updateAgent } from '../../services/agentHubService';
import { getAllJobs } from '../../services/jobService';
import { supabase, hasSupabase } from '../../lib/supabase';
import SupervisedUserCircleOutlinedIcon from '@mui/icons-material/SupervisedUserCircleOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WorkOutlineOutlinedIcon from '@mui/icons-material/WorkOutlineOutlined';
import AgentAvatar from '../AgentHub/AgentAvatar';
import AgentCostTokenStat from '../Common/AgentCostTokenStat';
import { loadTeamTasks } from '../../services/teamTaskBackend';
import { getAgentEmployment } from '../../services/agentEmploymentService';
import AgentEmploymentPanel from '../AgentHub/AgentEmploymentPanel';
import { aggregateAgentTokenStats } from '../../utils/enrichAgentTokenStats';

import AppIcon from '../icons/AppIcon';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../config/assistantBrain';

// ── Workflow Schema constants ─────────────────────────────────
const SCHEMA_PROVIDERS = [
  {
    id: 'groq',
    label: 'Groq',
    color: '#F55036',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    color: '#10A37F',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    color: '#D4A574',
    models: ['claude-sonnet-5', 'claude-haiku-4-5'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    color: '#5B6EF5',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  { id: 'glm', label: 'GLM', color: '#1E88E5', models: ['glm-5.1', 'glm-4', 'glm-4-flash'] },
  {
    id: 'gemini',
    label: 'Google Gemini',
    color: '#4285F4',
    models: [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-flash-latest',
      'gemini-pro-latest',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash-lite-preview',
      'gemini-3-pro-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
  },
];

const SCHEMA_TOKEN_COSTS = {
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.0001 },
  'gemma2-9b-it': { input: 0.0002, output: 0.0002 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.0008, output: 0.004 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-reasoner': { input: 0.00055, output: 0.0022 },
  'glm-5.1': { input: 0.002, output: 0.002 },
  'glm-4': { input: 0.001, output: 0.001 },
  'glm-4-flash': { input: 0.0001, output: 0.0001 },
  'gemini-3.8-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.7-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.6-flash': { input: 0.0015, output: 0.0075 },
  'gemini-3.5-flash': { input: 0.0003, output: 0.0025 },
  'gemini-3.1-pro-preview': { input: 0.002, output: 0.012 },
  'gemini-3.5-flash-lite': { input: 0.0001, output: 0.0004 },
  'gemini-3.5-flash-lite-preview': { input: 0.0001, output: 0.0004 },
  'gemini-3-pro-preview': { input: 0.002, output: 0.012 },
  'gemini-3-flash-preview': { input: 0.0003, output: 0.0025 },
  'gemini-pro-latest': { input: 0.00125, output: 0.01 },
  'gemini-flash-latest': { input: 0.0015, output: 0.0075 },
  'gemini-flash-lite-latest': { input: 0.0001, output: 0.0004 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  'gemini-2.5-flash': { input: 0.0003, output: 0.0025 },
  'gemini-2.5-flash-lite': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash-lite': { input: 0.000075, output: 0.0003 },
};

const MEMORY_TYPES = [
  { value: 'conversation', label: 'Conversation', desc: 'Full conversation history' },
  { value: 'entity', label: 'Entity', desc: 'Key entity extraction' },
  { value: 'hybrid', label: 'Hybrid', desc: 'Conversation + entity extraction' },
  { value: 'none', label: 'None', desc: 'Stateless, no memory' },
];

const DEFAULT_SCHEMA = {
  provider: DEFAULT_LLM_PROVIDER,
  model: DEFAULT_LLM_MODEL,
  temperature: 0.3,
  max_tokens: 3000,
  system_prompt: '',
  memory_type: 'conversation',
  memory_window: 10,
  tools: [],
  constraints: { max_cost_per_day_usd: 5, max_requests_per_hour: 60 },
};

function estimateSchemaCost(model, systemPrompt, maxTokens) {
  const costs = SCHEMA_TOKEN_COSTS[model] || SCHEMA_TOKEN_COSTS['llama-3.3-70b-versatile'];
  const promptTokens = Math.ceil((systemPrompt || '').length / 4);
  const inputCost = ((promptTokens + 500) / 1000) * costs.input;
  const outputCost = (maxTokens / 1000) * costs.output;
  const perCall = inputCost + outputCost;
  return { perCall: Math.round(perCall * 10000) / 10000 };
}

// ── Helpers ───────────────────────────────────────────────────
function formatTimestamp(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatAgentId(id) {
  if (!id) return null;
  return `AGENT-${String(id).slice(-8).toUpperCase()}`;
}

const PROVIDER_LABELS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  glm: 'GLM',
  gemini: 'Google Gemini',
  internal: 'Internal',
};

export default function MarketplaceAgentDetailDialog({
  open,
  onClose,
  agent,
  profile,
  workspaceAgent,
  onAdd,
  isAdded,
}) {
  const theme = useTheme();
  const [tab, setTab] = useState(0);

  // Use workspace agent data when available, fall back to template
  const data = workspaceAgent || agent;
  const agentId = data?.agent_id || data?.id;
  const displayName = profile?.display_name || data?.name || data?.role || 'Agent';

  // ── Ratings ─────────────────────────────────────────────────
  const [ratings, setRatings] = useState([]);
  const [avgRating, setAvgRating] = useState({ average: 0, count: 0 });
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [ratingForm, setRatingForm] = useState({
    rating: 0,
    comment: '',
    ratingType: 'individual',
    requestId: '',
  });
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratableRequests, setRatableRequests] = useState([]);

  // ── Workflow Schema ──────────────────────────────────────────
  const [schemaForm, setSchemaForm] = useState({ ...DEFAULT_SCHEMA });
  const [schemaOriginal, setSchemaOriginal] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [schemaMessage, setSchemaMessage] = useState({ type: '', text: '' });
  const [schemaTools, setSchemaTools] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);

  // ── Employment (org / consilium / assignment dates) ─────────
  const [employment, setEmployment] = useState({ orgs: [], teams: [] });
  const [loadingEmployment, setLoadingEmployment] = useState(false);

  const schemaAvailableModels = useMemo(
    () => SCHEMA_PROVIDERS.find((p) => p.id === schemaForm.provider)?.models || [],
    [schemaForm.provider]
  );

  const schemaCostEst = useMemo(
    () => estimateSchemaCost(schemaForm.model, schemaForm.system_prompt, schemaForm.max_tokens),
    [schemaForm.model, schemaForm.system_prompt, schemaForm.max_tokens]
  );

  // ── Load data on open ────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setTab(0);
      setRatings([]);
      setAvgRating({ average: 0, count: 0 });
      setShowRatingForm(false);
      setRatingForm({ rating: 0, comment: '', ratingType: 'individual', requestId: '' });
      setRatableRequests([]);
      setSchemaForm({ ...DEFAULT_SCHEMA });
      setSchemaOriginal(null);
      setSchemaMessage({ type: '', text: '' });
      setSchemaTools([]);
      setTeamTasks([]);
      setEmployment({ orgs: [], teams: [] });
      return;
    }

    loadTeamTasks()
      .then((list) => setTeamTasks(list || []))
      .catch(() => setTeamTasks([]));

    // Employment: where this agent is hired (org + consilium + start date).
    if (agentId) {
      setLoadingEmployment(true);
      getAgentEmployment(agentId)
        .then((emp) => setEmployment(emp || { orgs: [], teams: [] }))
        .catch(() => setEmployment({ orgs: [], teams: [] }))
        .finally(() => setLoadingEmployment(false));
    }

    // Ratings
    if (agentId) {
      (async () => {
        const [agentRatings, jobs] = await Promise.all([
          getAgentRatings(agentId),
          getAllJobs().catch(() => []),
        ]);
        setRatings(agentRatings);
        if (agentRatings.length > 0) {
          const sum = agentRatings.reduce((acc, r) => acc + r.rating, 0);
          setAvgRating({
            average: Math.round((sum / agentRatings.length) * 10) / 10,
            count: agentRatings.length,
          });
        }
        const ratedIds = new Set(agentRatings.map((r) => r.request_id).filter(Boolean));
        setRatableRequests(
          (jobs || []).filter(
            (j) =>
              j.assignedAgentId === agentId &&
              j.status === 'completed' &&
              !ratedIds.has(j.sourceRequestId || j.id)
          )
        );
      })();
    }

    // Workflow Schema
    let cancelled = false;
    (async () => {
      setSchemaLoading(true);
      try {
        if (hasSupabase()) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const token = session?.access_token;
          const headers = { Authorization: `Bearer ${token}` };

          // Load available tools
          const tlRes = await fetch('/api/concilium?path=agent-tool-whitelist', { headers })
            .then((r) => r.json())
            .catch(() => ({ tools: [] }));
          if (!cancelled) setSchemaTools(tlRes.tools || []);

          // Load blueprint if workspace agent
          const bpId = workspaceAgent?.blueprint_id;
          if (bpId) {
            const bpRes = await fetch(`/api/concilium?path=agent-blueprints&id=${bpId}`, {
              headers,
            })
              .then((r) => r.json())
              .catch(() => ({}));
            if (!cancelled && bpRes.blueprint) {
              const bp = bpRes.blueprint;
              const loaded = {
                id: bp.id,
                workflow_id: bp.workflow_id || null,
                provider: bp.provider || DEFAULT_LLM_PROVIDER,
                model: bp.model || DEFAULT_LLM_MODEL,
                temperature: bp.temperature ?? 0.3,
                max_tokens: bp.max_tokens || 3000,
                system_prompt: bp.system_prompt || data?.system_prompt || '',
                memory_type: bp.constraints?.memory_type || 'conversation',
                memory_window: bp.constraints?.memory_window ?? 10,
                tools: bp.tools || [],
                constraints: {
                  max_cost_per_day_usd: bp.constraints?.max_cost_per_day_usd ?? 5,
                  max_requests_per_hour: bp.constraints?.max_requests_per_hour ?? 60,
                },
              };
              setSchemaForm(loaded);
              setSchemaOriginal(JSON.stringify(loaded));
              return;
            }
          }
        }
        // No blueprint — seed from agent system_prompt
        const agentPrompt = data?.system_prompt || '';
        if (!cancelled) {
          setSchemaForm({ ...DEFAULT_SCHEMA, system_prompt: agentPrompt });
          setSchemaOriginal(null);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setSchemaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────
  const handleSubmitRating = useCallback(async () => {
    if (!agentId || ratingForm.rating === 0 || !ratingForm.requestId) return;
    setRatingSubmitting(true);
    try {
      const result = await submitRating({
        agentId,
        rating: ratingForm.rating,
        comment: ratingForm.comment,
        ratingType: ratingForm.ratingType,
        requestId: ratingForm.requestId,
      });
      if (result) {
        const updated = [result, ...ratings];
        setRatings(updated);
        const sum = updated.reduce((acc, r) => acc + r.rating, 0);
        setAvgRating({
          average: Math.round((sum / updated.length) * 10) / 10,
          count: updated.length,
        });
        setRatingForm({ rating: 0, comment: '', ratingType: 'individual', requestId: '' });
        setShowRatingForm(false);
        setRatableRequests((prev) =>
          prev.filter((j) => (j.sourceRequestId || j.id) !== ratingForm.requestId)
        );
      }
    } finally {
      setRatingSubmitting(false);
    }
  }, [agentId, ratingForm, ratings]);

  const handleDeleteRating = useCallback(
    async (ratingId) => {
      const ok = await deleteRating(ratingId);
      if (ok) {
        const updated = ratings.filter((r) => r.id !== ratingId);
        setRatings(updated);
        if (updated.length > 0) {
          const sum = updated.reduce((acc, r) => acc + r.rating, 0);
          setAvgRating({
            average: Math.round((sum / updated.length) * 10) / 10,
            count: updated.length,
          });
        } else {
          setAvgRating({ average: 0, count: 0 });
        }
      }
    },
    [ratings]
  );

  const handleSaveSchema = useCallback(async () => {
    if (!agentId || !hasSupabase()) return;
    setSchemaSaving(true);
    setSchemaMessage({ type: '', text: '' });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const bpId = schemaForm.id;
      const agentName = data?.role || 'Agent';

      const bpBody = {
        name: `${agentName} — Workflow Schema`,
        description: `Auto-generated workflow schema for agent ${agentId}`,
        category: data?.category || 'general',
        system_prompt: schemaForm.system_prompt || 'You are a helpful AI agent.',
        provider: schemaForm.provider,
        model: schemaForm.model,
        temperature: schemaForm.temperature,
        max_tokens: schemaForm.max_tokens,
        tools: schemaForm.tools,
        constraints: {
          ...schemaForm.constraints,
          memory_type: schemaForm.memory_type,
          memory_window: schemaForm.memory_window,
        },
      };

      const url = bpId
        ? `/api/concilium?path=agent-blueprints&id=${bpId}`
        : '/api/concilium?path=agent-blueprints';
      const method = bpId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...bpBody, agent_id: agentId }),
      }).then((r) => r.json());

      if (res.blueprint) {
        const saved = { ...schemaForm, id: res.blueprint.id };
        setSchemaForm(saved);
        setSchemaOriginal(JSON.stringify(saved));
        // Blueprint (source of truth) is saved. Nudge the local agent projection
        // so cards/detail reflect the new LLM immediately, before the next sync.
        if (workspaceAgent?.id) {
          updateAgent(workspaceAgent.id, {
            provider: schemaForm.provider,
            model: schemaForm.model,
          });
        }
        setSchemaMessage({ type: 'success', text: 'Schema saved successfully' });
      } else {
        setSchemaMessage({ type: 'error', text: res.error || 'Failed to save schema' });
      }
    } catch (err) {
      setSchemaMessage({ type: 'error', text: err.message });
    } finally {
      setSchemaSaving(false);
    }
  }, [agentId, schemaForm, data, workspaceAgent]);

  const taskCount = (workspaceAgent || agent)?.taskCount ?? 0;
  const tokenStats = useMemo(() => {
    const src = workspaceAgent || agent;
    if (!src) return { tokensPerTask: 0, metricMeta: {} };
    if (src.tokensPerTask != null && src.llmMetricMeta) {
      return { tokensPerTask: src.tokensPerTask, metricMeta: src.llmMetricMeta };
    }
    const ids = [agentId, src.id, src.agent_id].filter(Boolean);
    const stats = aggregateAgentTokenStats(ids, teamTasks, {
      agentName: src.name || src.role,
      taskCount,
    });
    return { tokensPerTask: stats.tokensPerTask, metricMeta: stats.metricMeta };
  }, [workspaceAgent, agent, agentId, teamTasks, taskCount]);

  if (!agent) return null;

  const statusLabel = data.availability_status || 'available';
  const statusColor =
    statusLabel === 'available' ? 'success' : statusLabel === 'busy' ? 'warning' : 'default';
  const capabilities = Array.isArray(data.capabilities)
    ? data.capabilities
    : data.capabilities
      ? [data.capabilities]
      : [];
  const tools = data.tools || [];
  const formattedId = formatAgentId(agentId);

  // Stat cards
  const completedTasks = data.completedTasks ?? 0;
  const successRate = data.successRate ?? 0;
  const costPerTask = Number(data.cost_per_task || 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, maxHeight: '90vh' } } }}
    >
      {/* ── Header ────────────────────────────────────────────── */}
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 2, pb: 0 }}>
        {profile ? (
          <AgentAvatar profile={profile} size="medium" />
        ) : (
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              flexShrink: 0,
            }}
          >
            <AppIcon
              name="SmartToyOutlined"
              fallback={SmartToyOutlinedIcon}
              color="primary"
              sx={{ fontSize: 22 }}
            />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {displayName}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}
            noWrap
          >
            {data.role}
          </Typography>
          {formattedId && (
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem' }}
            >
              {formattedId}
            </Typography>
          )}
        </Box>
        <Chip
          size="small"
          label={statusLabel.toUpperCase()}
          color={statusColor}
          variant="outlined"
          sx={{ fontWeight: 600, borderRadius: 1.5, mr: 1 }}
        />
        <IconButton onClick={onClose} size="small">
          <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>
      {/* ── Tabs ──────────────────────────────────────────────── */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          px: 2.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 40,
          '& .MuiTab-root': {
            minHeight: 40,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.82rem',
          },
        }}
      >
        <Tab
          label="Profile"
          icon={<AppIcon name="PersonOutline" fallback={PersonOutlineIcon} sx={{ fontSize: 16 }} />}
          iconPosition="start"
        />
        <Tab
          label="Core"
          icon={
            <AppIcon
              name="PsychologyOutlined"
              fallback={PsychologyOutlinedIcon}
              sx={{ fontSize: 16 }}
            />
          }
          iconPosition="start"
        />
        <Tab
          label="Activity"
          icon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 16 }} />}
          iconPosition="start"
        />
        <Tab
          label="Chat"
          icon={
            <AppIcon
              name="ChatBubbleOutline"
              fallback={ChatBubbleOutlineIcon}
              sx={{ fontSize: 16 }}
            />
          }
          iconPosition="start"
        />
        <Tab
          label="Employment"
          icon={
            <AppIcon
              name="WorkOutlineOutlined"
              fallback={WorkOutlineOutlinedIcon}
              sx={{ fontSize: 16 }}
            />
          }
          iconPosition="start"
        />
      </Tabs>
      <DialogContent sx={{ p: 0 }}>
        {/* ── Profile Tab ─────────────────────────────────────── */}
        {tab === 0 && (
          <Box sx={{ px: 2.5, py: 2 }}>
            {profile ? (
              <Box>
                {profile.bio && (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      mb: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.03),
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontStyle: 'italic', color: 'text.secondary', lineHeight: 1.5 }}
                    >
                      &ldquo;{profile.bio}&rdquo;
                    </Typography>
                  </Paper>
                )}

                {/* About & Contact */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                    mb: 2,
                  }}
                >
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}
                    >
                      About
                    </Typography>
                    <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.disabled', fontWeight: 600 }}
                        >
                          Role
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {profile.job_title || data.role}
                        </Typography>
                      </Box>
                      {profile.organization && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.disabled', fontWeight: 600 }}
                          >
                            Organization
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {profile.organization}
                          </Typography>
                        </Box>
                      )}
                      {profile.location && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.disabled', fontWeight: 600 }}
                          >
                            Location
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {profile.location}
                            {profile.timezone ? ` (${profile.timezone})` : ''}
                          </Typography>
                        </Box>
                      )}
                      {profile.age && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.disabled', fontWeight: 600 }}
                          >
                            Age
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {profile.age}
                            {profile.pronouns ? ` · ${profile.pronouns}` : ''}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}
                    >
                      Contact
                    </Typography>
                    <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                      {profile.email && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AppIcon
                            name="EmailOutlined"
                            fallback={EmailOutlinedIcon}
                            sx={{ fontSize: 14, color: 'text.disabled' }}
                          />
                          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                            {profile.email}
                          </Typography>
                        </Box>
                      )}
                      {profile.phone && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AppIcon
                            name="PhoneOutlined"
                            fallback={PhoneOutlinedIcon}
                            sx={{ fontSize: 14, color: 'text.disabled' }}
                          />
                          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                            {profile.phone}
                          </Typography>
                        </Box>
                      )}
                      {profile.linkedin_url && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AppIcon
                            name="LinkedIn"
                            fallback={LinkedInIcon}
                            sx={{ fontSize: 14, color: 'text.disabled' }}
                          />
                          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                            {profile.linkedin_url}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>
                </Box>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Button
                    variant="contained"
                    startIcon={
                      <AppIcon
                        name="ChatBubbleOutline"
                        fallback={ChatBubbleOutlineIcon}
                        sx={{ fontSize: 16 }}
                      />
                    }
                    onClick={() => setTab(3)}
                    sx={{ textTransform: 'none', fontWeight: 600, flex: 1, borderRadius: 2 }}
                  >
                    Chat Now
                  </Button>
                  {isAdded ? (
                    <Chip
                      icon={
                        <AppIcon
                          name="CheckCircleOutline"
                          fallback={CheckCircleOutlineIcon}
                          sx={{ fontSize: 16 }}
                        />
                      }
                      label="In Workspace"
                      color="success"
                      sx={{ fontWeight: 600, flex: 1, height: 36, borderRadius: 2 }}
                    />
                  ) : (
                    <Button
                      variant="outlined"
                      startIcon={
                        <AppIcon
                          name="AddCircleOutline"
                          fallback={AddCircleOutlineIcon}
                          sx={{ fontSize: 16 }}
                        />
                      }
                      onClick={() => {
                        onAdd?.();
                        onClose();
                      }}
                      sx={{ textTransform: 'none', fontWeight: 600, flex: 1, borderRadius: 2 }}
                    >
                      Hire Agent
                    </Button>
                  )}
                </Box>

                {/* Communication Style */}
                {profile.communication_tone &&
                  Object.keys(profile.communication_tone).length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="overline"
                        sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}
                      >
                        Communication Style
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                        {Object.entries(profile.communication_tone).map(([key, val]) => (
                          <Chip
                            key={key}
                            size="small"
                            label={`${key}: ${val}`}
                            variant="outlined"
                            sx={{
                              fontSize: '0.68rem',
                              borderRadius: 1.5,
                              textTransform: 'capitalize',
                            }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                {/* Quick Stats */}
                <Box
                  sx={{
                    mb: 2,
                    display: 'grid',
                    gap: 1.25,
                    gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                  }}
                >
                  {[
                    { label: 'Tasks', value: taskCount, color: theme.palette.primary.main },
                    {
                      label: 'Completed',
                      value: completedTasks,
                      color: theme.palette.success.main,
                    },
                    {
                      label: 'Success Rate',
                      value: `${successRate}%`,
                      color:
                        successRate >= 80
                          ? theme.palette.success.main
                          : successRate >= 50
                            ? theme.palette.warning.main
                            : theme.palette.error.main,
                    },
                  ].map((s) => (
                    <Paper
                      key={s.label}
                      elevation={0}
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: alpha(s.color, 0.2),
                        bgcolor: alpha(s.color, 0.04),
                        textAlign: 'center',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 600 }}
                      >
                        {s.label}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          color: s.color,
                          lineHeight: 1.2,
                        }}
                      >
                        {s.value}
                      </Typography>
                    </Paper>
                  ))}
                  <AgentCostTokenStat
                    costUsd={costPerTask}
                    tokens={tokenStats.tokensPerTask}
                    metricMeta={tokenStats.metricMeta}
                    color={theme.palette.info.main}
                  />
                </Box>

                {/* Accordions */}
                {profile.backstory && (
                  <Accordion
                    disableGutters
                    elevation={0}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '8px !important',
                      mb: 1,
                      '&::before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                      sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                    >
                      <Typography
                        variant="overline"
                        sx={{ fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}
                      >
                        Backstory
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', lineHeight: 1.6, fontSize: '0.8rem' }}
                      >
                        {profile.backstory}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                )}

                {Array.isArray(profile.message_templates) &&
                  profile.message_templates.length > 0 && (
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: '8px !important',
                        mb: 1,
                        '&::before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                        sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                      >
                        <Typography
                          variant="overline"
                          sx={{ fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}
                        >
                          Message Templates ({profile.message_templates.length})
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0 }}>
                        <Stack spacing={1}>
                          {profile.message_templates.map((tpl, i) => (
                            <Paper
                              key={tpl.name || `tpl-${i}`}
                              variant="outlined"
                              sx={{ p: 1.25, borderRadius: 1.5 }}
                            >
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 700, color: 'text.secondary' }}
                              >
                                {tpl.name}
                              </Typography>
                              {tpl.subject && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    display: 'block',
                                    color: 'text.disabled',
                                    fontSize: '0.65rem',
                                  }}
                                >
                                  Subject: {tpl.subject}
                                </Typography>
                              )}
                              <Typography
                                variant="body2"
                                sx={{
                                  mt: 0.5,
                                  fontSize: '0.75rem',
                                  whiteSpace: 'pre-line',
                                  color: 'text.secondary',
                                }}
                              >
                                {tpl.body}
                              </Typography>
                            </Paper>
                          ))}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  )}

                {profile.behavior_rules && Object.keys(profile.behavior_rules).length > 0 && (
                  <Accordion
                    disableGutters
                    elevation={0}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '8px !important',
                      mb: 1,
                      '&::before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                      sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                    >
                      <Typography
                        variant="overline"
                        sx={{ fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}
                      >
                        Behavior Rules
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      <Stack spacing={1}>
                        {profile.behavior_rules.reply_delay_min_sec != null && (
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.disabled', fontWeight: 600 }}
                            >
                              Reply Delay
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              {profile.behavior_rules.reply_delay_min_sec}s –{' '}
                              {profile.behavior_rules.reply_delay_max_sec}s
                            </Typography>
                          </Box>
                        )}
                        {Array.isArray(profile.behavior_rules.escalation_rules) &&
                          profile.behavior_rules.escalation_rules.length > 0 && (
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.disabled', fontWeight: 600 }}
                              >
                                Escalates
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                                {profile.behavior_rules.escalation_rules.map((r) => (
                                  <Chip
                                    key={r}
                                    size="small"
                                    label={r}
                                    color="warning"
                                    variant="outlined"
                                    sx={{ fontSize: '0.62rem', height: 20 }}
                                  />
                                ))}
                              </Box>
                            </Box>
                          )}
                        {Array.isArray(profile.behavior_rules.topics_to_avoid) &&
                          profile.behavior_rules.topics_to_avoid.length > 0 && (
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.disabled', fontWeight: 600 }}
                              >
                                Avoids
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                                {profile.behavior_rules.topics_to_avoid.map((t) => (
                                  <Chip
                                    key={t}
                                    size="small"
                                    label={t}
                                    color="error"
                                    variant="outlined"
                                    sx={{ fontSize: '0.62rem', height: 20 }}
                                  />
                                ))}
                              </Box>
                            </Box>
                          )}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                )}

                {/* Special Details */}
                <Accordion
                  disableGutters
                  elevation={0}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '8px !important',
                    mb: 1,
                    '&::before': { display: 'none' },
                  }}
                >
                  <AccordionSummary
                    expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                    sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                  >
                    <Typography
                      variant="overline"
                      sx={{ fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}
                    >
                      Special Details
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          Category
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {data?.category || '—'}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          Connection
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {(
                            data?.provider ||
                            data?.connection_type ||
                            DEFAULT_LLM_PROVIDER
                          ).toUpperCase()}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          Model
                        </Typography>
                        <Chip
                          size="small"
                          label={data?.model || DEFAULT_LLM_MODEL}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.65rem',
                            height: 22,
                            bgcolor: '#1E88E5',
                            color: '#fff',
                            borderRadius: 1.5,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          Created
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
                        >
                          {formatTimestamp(data?.created_at)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          Last Active
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
                        >
                          {formatTimestamp(data?.updated_at)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          Added By
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {data?.added_by?.email || 'predefined'}
                        </Typography>
                      </Box>
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                {profile.email_signature && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mt: 1.5 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}
                    >
                      Email Signature
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.72rem',
                        whiteSpace: 'pre-line',
                        color: 'text.secondary',
                      }}
                    >
                      {profile.email_signature}
                    </Typography>
                  </Paper>
                )}

                {/* Ratings & Reviews */}
                <Divider sx={{ my: 2 }} />
                <Box>
                  {ratableRequests.length > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                      <Button
                        size="small"
                        startIcon={
                          <AppIcon
                            name="StarOutline"
                            fallback={StarOutlineIcon}
                            sx={{ fontSize: 14 }}
                          />
                        }
                        onClick={() => setShowRatingForm((p) => !p)}
                        sx={{ fontSize: '0.72rem', textTransform: 'none' }}
                      >
                        {showRatingForm ? 'Cancel' : 'Rate this Agent'}
                      </Button>
                    </Box>
                  )}

                  <Collapse in={showRatingForm}>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1.5 }}>
                      <Stack spacing={1.5}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 60 }}
                          >
                            Request
                          </Typography>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={ratingForm.requestId}
                              onChange={(e) =>
                                setRatingForm((p) => ({ ...p, requestId: e.target.value }))
                              }
                              displayEmpty
                              sx={{ fontSize: '0.78rem' }}
                            >
                              <MenuItem value="" disabled>
                                <em>Select completed request</em>
                              </MenuItem>
                              {ratableRequests.map((j) => (
                                <MenuItem
                                  key={j.id}
                                  value={j.sourceRequestId || j.id}
                                  sx={{ fontSize: '0.78rem' }}
                                >
                                  {j.description || j.title || j.id} — completed
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 60 }}
                          >
                            Score
                          </Typography>
                          <Rating
                            value={ratingForm.rating}
                            onChange={(_, v) => setRatingForm((p) => ({ ...p, rating: v }))}
                            size="large"
                          />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 60 }}
                          >
                            Type
                          </Typography>
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={ratingForm.ratingType}
                            onChange={(_, v) =>
                              v && setRatingForm((p) => ({ ...p, ratingType: v }))
                            }
                          >
                            <ToggleButton
                              value="individual"
                              sx={{ fontSize: '0.7rem', textTransform: 'none', px: 1.5 }}
                            >
                              Individual
                            </ToggleButton>
                            <ToggleButton
                              value="team"
                              sx={{ fontSize: '0.7rem', textTransform: 'none', px: 1.5 }}
                            >
                              Team
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                        <TextField
                          size="small"
                          multiline
                          minRows={2}
                          maxRows={4}
                          placeholder="Optional comment..."
                          value={ratingForm.comment}
                          onChange={(e) =>
                            setRatingForm((p) => ({ ...p, comment: e.target.value }))
                          }
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={
                              ratingForm.rating === 0 || !ratingForm.requestId || ratingSubmitting
                            }
                            onClick={handleSubmitRating}
                            sx={{ fontSize: '0.72rem', textTransform: 'none' }}
                          >
                            {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                          </Button>
                        </Box>
                      </Stack>
                    </Paper>
                  </Collapse>

                  {ratings.length > 0 && (
                    <Stack spacing={1}>
                      {ratings.slice(0, 5).map((r) => (
                        <Paper key={r.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Rating value={r.rating} readOnly size="small" />
                              <Chip
                                size="small"
                                label={r.rating_type === 'team' ? 'Team' : 'Individual'}
                                variant="outlined"
                                color={r.rating_type === 'team' ? 'primary' : 'default'}
                                sx={{ fontSize: '0.65rem', height: 20 }}
                              />
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                              >
                                {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                              </Typography>
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteRating(r.id)}
                                sx={{ p: 0.25 }}
                              >
                                <AppIcon
                                  name="DeleteOutline"
                                  fallback={DeleteOutlineIcon}
                                  sx={{ fontSize: 14, color: 'text.secondary' }}
                                />
                              </IconButton>
                            </Box>
                          </Box>
                          {r.comment && (
                            <Typography
                              variant="body2"
                              sx={{ mt: 0.75, fontSize: '0.78rem', color: 'text.secondary' }}
                            >
                              {r.comment}
                            </Typography>
                          )}
                        </Paper>
                      ))}
                      {ratings.length > 5 && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', textAlign: 'center', display: 'block' }}
                        >
                          +{ratings.length - 5} more reviews
                        </Typography>
                      )}
                    </Stack>
                  )}
                </Box>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.disabled">
                  No profile configured for this agent yet.
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* ── Core Tab (Workflow Schema) ───────────────────────── */}
        {tab === 1 && (
          <Box sx={{ px: 2.5, py: 2, maxHeight: 520, overflowY: 'auto' }}>
            {schemaLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={32} />
              </Box>
            ) : (
              <Stack spacing={2.5}>
                {/* Section 1: AI Brain */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor:
                      SCHEMA_PROVIDERS.find((p) => p.id === schemaForm.provider)?.color ||
                      'primary.main',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <AppIcon
                      name="PsychologyOutlined"
                      fallback={PsychologyOutlinedIcon}
                      sx={{ fontSize: 20, color: 'primary.main' }}
                    />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      AI Brain
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Chip
                      size="small"
                      label={`~$${schemaCostEst.perCall}/call`}
                      variant="outlined"
                      color="info"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  </Box>
                  <Stack
                    spacing={2}
                    direction={{ xs: 'column', sm: 'row' }}
                    useFlexGap
                    flexWrap="wrap"
                  >
                    <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
                      <InputLabel>Provider</InputLabel>
                      <Select
                        label="Provider"
                        value={schemaForm.provider}
                        onChange={(e) => {
                          const prov = e.target.value;
                          const models = SCHEMA_PROVIDERS.find((p) => p.id === prov)?.models || [];
                          setSchemaForm((f) => ({ ...f, provider: prov, model: models[0] || '' }));
                        }}
                      >
                        {SCHEMA_PROVIDERS.map((p) => (
                          <MenuItem key={p.id} value={p.id}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  bgcolor: p.color,
                                }}
                              />
                              {p.label}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
                      <InputLabel>Model</InputLabel>
                      <Select
                        label="Model"
                        value={schemaForm.model}
                        onChange={(e) => setSchemaForm((f) => ({ ...f, model: e.target.value }))}
                      >
                        {schemaAvailableModels.map((m) => (
                          <MenuItem key={m} value={m}>
                            {m}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                  <Box
                    sx={{
                      mt: 2,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 2,
                    }}
                  >
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, color: 'text.secondary' }}
                      >
                        Temperature: {schemaForm.temperature}
                      </Typography>
                      <Slider
                        value={schemaForm.temperature}
                        onChange={(_, v) => setSchemaForm((f) => ({ ...f, temperature: v }))}
                        min={0}
                        max={2}
                        step={0.1}
                        size="small"
                        valueLabelDisplay="auto"
                      />
                    </Box>
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, color: 'text.secondary' }}
                      >
                        Max Tokens: {schemaForm.max_tokens}
                      </Typography>
                      <Slider
                        value={schemaForm.max_tokens}
                        onChange={(_, v) => setSchemaForm((f) => ({ ...f, max_tokens: v }))}
                        min={256}
                        max={8192}
                        step={256}
                        size="small"
                        valueLabelDisplay="auto"
                      />
                    </Box>
                  </Box>
                </Paper>

                {/* Section 2: System Prompt */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor: 'warning.main',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <AppIcon
                      name="DescriptionOutlined"
                      fallback={DescriptionOutlinedIcon}
                      sx={{ fontSize: 20, color: 'warning.main' }}
                    />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      System Prompt
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {(schemaForm.system_prompt || '').length} chars
                    </Typography>
                  </Box>
                  <TextField
                    fullWidth
                    multiline
                    rows={6}
                    size="small"
                    value={schemaForm.system_prompt}
                    onChange={(e) =>
                      setSchemaForm((f) => ({ ...f, system_prompt: e.target.value }))
                    }
                    placeholder="You are a helpful AI agent specialized in..."
                    sx={{
                      '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.82rem' },
                    }}
                  />
                </Paper>

                {/* Section 3: Memory */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor: 'info.main',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <AppIcon
                      name="Memory"
                      fallback={MemoryIcon}
                      sx={{ fontSize: 20, color: 'info.main' }}
                    />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Memory
                    </Typography>
                  </Box>
                  <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} useFlexGap>
                    <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
                      <InputLabel>Memory Type</InputLabel>
                      <Select
                        label="Memory Type"
                        value={schemaForm.memory_type}
                        onChange={(e) =>
                          setSchemaForm((f) => ({ ...f, memory_type: e.target.value }))
                        }
                      >
                        {MEMORY_TYPES.map((m) => (
                          <MenuItem key={m.value} value={m.value}>
                            <Box>
                              <Typography variant="body2">{m.label}</Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {m.desc}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {schemaForm.memory_type !== 'none' && (
                      <TextField
                        size="small"
                        type="number"
                        label="Context Window (messages)"
                        value={schemaForm.memory_window}
                        onChange={(e) =>
                          setSchemaForm((f) => ({
                            ...f,
                            memory_window: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                        sx={{ minWidth: 180, flex: 1 }}
                        inputProps={{ min: 1, max: 100 }}
                      />
                    )}
                  </Stack>
                </Paper>

                {/* Section 4: Tools & Capabilities */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor: 'success.main',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <AppIcon
                      name="BuildOutlined"
                      fallback={BuildOutlinedIcon}
                      sx={{ fontSize: 20, color: 'success.main' }}
                    />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Tools & Capabilities
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Chip
                      size="small"
                      label={`${schemaForm.tools.length} selected`}
                      color="success"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  </Box>
                  {schemaTools.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No tools available. Add this agent to your workspace to load tools.
                    </Typography>
                  ) : (
                    ['domain', 'mcp'].map((cat) => {
                      const catTools = schemaTools.filter((t) => t.category === cat);
                      if (catTools.length === 0) return null;
                      return (
                        <Box key={cat} sx={{ mb: 1.5 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: 'text.secondary',
                              letterSpacing: '0.04em',
                              mb: 0.5,
                              display: 'block',
                            }}
                          >
                            {cat === 'domain' ? 'Domain Tools' : 'MCP Tools'}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {catTools.map((t) => {
                              const isSelected = schemaForm.tools.some(
                                (st) => st === t.tool_id || st?.tool_id === t.tool_id
                              );
                              return (
                                <Chip
                                  key={t.tool_id}
                                  size="small"
                                  label={t.tool_name}
                                  variant={isSelected ? 'filled' : 'outlined'}
                                  color={isSelected ? 'success' : 'default'}
                                  onClick={() => {
                                    setSchemaForm((f) => {
                                      const current = f.tools || [];
                                      const has = current.some(
                                        (st) => st === t.tool_id || st?.tool_id === t.tool_id
                                      );
                                      return {
                                        ...f,
                                        tools: has
                                          ? current.filter(
                                              (st) => st !== t.tool_id && st?.tool_id !== t.tool_id
                                            )
                                          : [...current, t.tool_id],
                                      };
                                    });
                                  }}
                                  sx={{ cursor: 'pointer', fontSize: '0.72rem', borderRadius: 1.5 }}
                                />
                              );
                            })}
                          </Box>
                        </Box>
                      );
                    })
                  )}
                </Paper>

                {/* Section 5: Salary Section */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor: 'error.main',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <AppIcon
                      name="ShieldOutlined"
                      fallback={ShieldOutlinedIcon}
                      sx={{ fontSize: 20, color: 'error.main' }}
                    />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Salary Section
                    </Typography>
                  </Box>
                  <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} useFlexGap>
                    <TextField
                      size="small"
                      type="number"
                      label="Max Cost/Day ($)"
                      value={schemaForm.constraints.max_cost_per_day_usd}
                      onChange={(e) =>
                        setSchemaForm((f) => ({
                          ...f,
                          constraints: {
                            ...f.constraints,
                            max_cost_per_day_usd: Number(e.target.value) || 0,
                          },
                        }))
                      }
                      sx={{ flex: 1, minWidth: 160 }}
                      inputProps={{ min: 0, step: 0.5 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Max Requests/Hour"
                      value={schemaForm.constraints.max_requests_per_hour}
                      onChange={(e) =>
                        setSchemaForm((f) => ({
                          ...f,
                          constraints: {
                            ...f.constraints,
                            max_requests_per_hour: Number(e.target.value) || 0,
                          },
                        }))
                      }
                      sx={{ flex: 1, minWidth: 160 }}
                      inputProps={{ min: 0, step: 1 }}
                    />
                  </Stack>
                </Paper>

                {/* Save bar */}
                {/* Section 6: Reporting Structure */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor: 'info.main',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <AppIcon
                      name="SupervisedUserCircleOutlined"
                      fallback={SupervisedUserCircleOutlinedIcon}
                      sx={{ fontSize: 20, color: 'info.main' }}
                    />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Reporting Structure
                    </Typography>
                  </Box>
                  <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} useFlexGap>
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Reports To</InputLabel>
                      <Select
                        value={schemaForm.reports_to || ''}
                        label="Reports To"
                        onChange={(e) =>
                          setSchemaForm((p) => ({ ...p, reports_to: e.target.value }))
                        }
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value="consilium">Consilium Board</MenuItem>
                        <MenuItem value="team-lead">Team Lead</MenuItem>
                        <MenuItem value="user">User (You)</MenuItem>
                        <MenuItem value="supervisor">Supervisor Agent</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Report Schedule</InputLabel>
                      <Select
                        value={schemaForm.report_schedule || 'every_check_in'}
                        label="Report Schedule"
                        onChange={(e) =>
                          setSchemaForm((p) => ({ ...p, report_schedule: e.target.value }))
                        }
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="every_check_in">Every Check-in (5 min)</MenuItem>
                        <MenuItem value="hourly">Hourly</MenuItem>
                        <MenuItem value="daily">Daily</MenuItem>
                        <MenuItem value="on_completion">On Task Completion</MenuItem>
                        <MenuItem value="manual">Manual Only</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                </Paper>

                {/* Section 7: Permissions */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor: 'warning.main',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <AppIcon
                      name="SecurityOutlined"
                      fallback={SecurityOutlinedIcon}
                      sx={{ fontSize: 20, color: 'warning.main' }}
                    />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Permissions
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 1,
                    }}
                  >
                    {[
                      { scope: 'partners', label: 'Partners', read: true, write: true },
                      { scope: 'finances', label: 'Finances', read: true, write: false },
                      { scope: 'dashboard', label: 'Dashboard', read: true, write: false },
                      { scope: 'campaigns', label: 'Campaigns', read: true, write: true },
                      { scope: 'injection', label: 'Injection', read: true, write: true },
                      { scope: 'reports', label: 'Reports', read: true, write: true },
                    ].map((perm) => {
                      const perms = schemaForm.permissions || [];
                      const hasRead = perms.includes(`${perm.scope}:read`);
                      const hasWrite =
                        perms.includes(`${perm.scope}:write`) ||
                        perms.includes(`${perm.scope}:submit`);
                      const togglePerm = (type) => {
                        const key = `${perm.scope}:${type === 'write' && perm.scope === 'reports' ? 'submit' : type}`;
                        const next =
                          hasRead && type === 'read'
                            ? perms.filter((p) => p !== key)
                            : [...perms.filter((p) => p !== key), key];
                        setSchemaForm((p) => ({
                          ...p,
                          permissions:
                            type === 'read' && !hasRead
                              ? [...next]
                              : next.filter((p) =>
                                  p !== key ? true : type === 'read' ? !hasRead : !hasWrite
                                ),
                        }));
                      };
                      return (
                        <Box
                          key={perm.scope}
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5 }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontSize: '0.76rem', fontWeight: 600, flex: 1 }}
                          >
                            {perm.label}
                          </Typography>
                          <Chip
                            label="Read"
                            size="small"
                            color={hasRead ? 'info' : 'default'}
                            variant={hasRead ? 'filled' : 'outlined'}
                            onClick={() => {
                              const key = `${perm.scope}:read`;
                              setSchemaForm((p) => ({
                                ...p,
                                permissions: hasRead
                                  ? (p.permissions || []).filter((x) => x !== key)
                                  : [...(p.permissions || []), key],
                              }));
                            }}
                            sx={{
                              fontSize: '0.6rem',
                              height: 22,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          />
                          {perm.write && (
                            <Chip
                              label="Write"
                              size="small"
                              color={hasWrite ? 'warning' : 'default'}
                              variant={hasWrite ? 'filled' : 'outlined'}
                              onClick={() => {
                                const key = `${perm.scope}:${perm.scope === 'reports' ? 'submit' : 'write'}`;
                                setSchemaForm((p) => ({
                                  ...p,
                                  permissions: hasWrite
                                    ? (p.permissions || []).filter((x) => x !== key)
                                    : [...(p.permissions || []), key],
                                }));
                              }}
                              sx={{
                                fontSize: '0.6rem',
                                height: 22,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </Paper>

                {/* Section 8: Skills */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor: 'success.main',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <AppIcon
                      name="ExtensionOutlined"
                      fallback={ExtensionOutlinedIcon}
                      sx={{ fontSize: 20, color: 'success.main' }}
                    />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Skills & Instructions
                    </Typography>
                    <Chip
                      label={`${(schemaForm.installed_skills || []).length} active`}
                      size="small"
                      variant="outlined"
                      sx={{ ml: 'auto', fontSize: '0.6rem', height: 20 }}
                    />
                  </Box>
                  {(schemaForm.installed_skills || []).length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'text.disabled', mb: 1.5 }}>
                      No skills installed. Add skills to enhance this agent's capabilities.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
                      {(schemaForm.installed_skills || []).map((skill, i) => (
                        <Box
                          key={skill.id || i}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            py: 0.5,
                            px: 0.75,
                            borderRadius: 1.5,
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <AppIcon
                            name="ExtensionOutlined"
                            fallback={ExtensionOutlinedIcon}
                            sx={{
                              fontSize: 14,
                              color: skill.is_active ? 'success.main' : 'text.disabled',
                            }}
                          />
                          <Typography
                            variant="body2"
                            sx={{ fontSize: '0.76rem', fontWeight: 600, flex: 1 }}
                            noWrap
                          >
                            {skill.name || skill.slug || 'Skill'}
                          </Typography>
                          <Chip
                            label={skill.is_active ? 'Active' : 'Off'}
                            size="small"
                            color={skill.is_active ? 'success' : 'default'}
                            variant="outlined"
                            sx={{ fontSize: '0.55rem', height: 18, cursor: 'pointer' }}
                            onClick={() => {
                              const updated = [...(schemaForm.installed_skills || [])];
                              updated[i] = { ...updated[i], is_active: !updated[i].is_active };
                              setSchemaForm((p) => ({ ...p, installed_skills: updated }));
                            }}
                          />
                          <IconButton size="small" sx={{ p: 0.25 }}>
                            <AppIcon
                              name="EditOutlined"
                              fallback={EditOutlinedIcon}
                              sx={{ fontSize: 14, color: 'text.disabled' }}
                            />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={
                      <AppIcon
                        name="AddCircleOutline"
                        fallback={AddCircleOutlineIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    onClick={() => {
                      // Add placeholder skill
                      setSchemaForm((p) => ({
                        ...p,
                        installed_skills: [
                          ...(p.installed_skills || []),
                          {
                            id: `skill-${Date.now()}`,
                            name: 'New Skill',
                            slug: 'new-skill',
                            is_active: true,
                          },
                        ],
                      }));
                    }}
                    sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 1.5 }}
                  >
                    Add Skill
                  </Button>
                </Paper>

                {schemaMessage.text && (
                  <Alert
                    severity={schemaMessage.type || 'info'}
                    onClose={() => setSchemaMessage({ type: '', text: '' })}
                    sx={{ borderRadius: 2 }}
                  >
                    {schemaMessage.text}
                  </Alert>
                )}
                <Stack
                  direction="row"
                  spacing={1.5}
                  justifyContent="flex-end"
                  flexWrap="wrap"
                  useFlexGap
                >
                  {schemaOriginal && JSON.stringify(schemaForm) !== schemaOriginal && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AppIcon name="Undo" fallback={UndoIcon} sx={{ fontSize: 16 }} />}
                      onClick={() => {
                        setSchemaForm(JSON.parse(schemaOriginal));
                        setSchemaMessage({ type: '', text: '' });
                      }}
                      sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                    >
                      Discard Changes
                    </Button>
                  )}
                  {isAdded ? (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={
                        schemaSaving ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <AppIcon
                            name="SaveOutlined"
                            fallback={SaveOutlinedIcon}
                            sx={{ fontSize: 16 }}
                          />
                        )
                      }
                      onClick={handleSaveSchema}
                      disabled={schemaSaving || !schemaForm.system_prompt}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: 2,
                        minWidth: 120,
                      }}
                    >
                      {schemaSaving ? 'Saving...' : 'Save Schema'}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={
                        <AppIcon
                          name="AddCircleOutline"
                          fallback={AddCircleOutlineIcon}
                          sx={{ fontSize: 16 }}
                        />
                      }
                      onClick={() => {
                        onAdd?.();
                        onClose();
                      }}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                    >
                      Add to Workspace to Save
                    </Button>
                  )}
                </Stack>
              </Stack>
            )}
          </Box>
        )}

        {/* ── Activity Tab ─────────────────────────────────────── */}
        {tab === 2 && (
          <Box sx={{ px: 2.5, py: 3 }}>
            {isAdded ? (
              <Stack spacing={1.5}>
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  Activity tracking is live for agents in your workspace. Open the Agent Hub for the
                  full timeline.
                </Alert>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' },
                  }}
                >
                  {[
                    { label: 'Tasks', value: taskCount, color: theme.palette.primary.main },
                    {
                      label: 'Completed',
                      value: completedTasks,
                      color: theme.palette.success.main,
                    },
                    {
                      label: 'Success Rate',
                      value: `${successRate}%`,
                      color: theme.palette.info.main,
                    },
                  ].map((s) => (
                    <Paper
                      key={s.label}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: alpha(s.color, 0.2),
                        bgcolor: alpha(s.color, 0.04),
                        textAlign: 'center',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 600 }}
                      >
                        {s.label}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          color: s.color,
                          lineHeight: 1.2,
                        }}
                      >
                        {s.value}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
                <Button
                  variant="outlined"
                  startIcon={
                    <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 16 }} />
                  }
                  onClick={() => {
                    onClose();
                    window.location.href = `/agent-hub?tab=agents&agent_id=${agentId}`;
                  }}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    alignSelf: 'flex-start',
                  }}
                >
                  Open Activity Timeline in Agent Hub
                </Button>
              </Stack>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <AppIcon
                  name="History"
                  fallback={HistoryIcon}
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }}
                />
                <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                  No activity yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Add this agent to your workspace to start tracking tasks, goals, and
                  communication.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
                  onClick={() => {
                    onAdd?.();
                    onClose();
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Add to Workspace
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* ── Chat Tab ─────────────────────────────────────────── */}
        {tab === 3 && (
          <Box sx={{ px: 2.5, py: 3, textAlign: 'center' }}>
            {isAdded ? (
              <Box>
                <AppIcon
                  name="ChatBubbleOutline"
                  fallback={ChatBubbleOutlineIcon}
                  sx={{ fontSize: 48, color: 'primary.main', mb: 1.5 }}
                />
                <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Chat with {displayName}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Full chat, message history, and Groq-powered streaming live in Agent Hub.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={
                    <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 16 }} />
                  }
                  onClick={() => {
                    onClose();
                    window.location.href = `/agent-hub?tab=agents&agent_id=${agentId}&detail_tab=chat`;
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Open Chat in Agent Hub
                </Button>
              </Box>
            ) : (
              <Box>
                <AppIcon
                  name="ChatBubbleOutline"
                  fallback={ChatBubbleOutlineIcon}
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }}
                />
                <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Chat unavailable
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Add {displayName} to your workspace to start chatting.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
                  onClick={() => {
                    onAdd?.();
                    onClose();
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Add to Workspace
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* ── Employment Tab ───────────────────────────────────── */}
        {tab === 4 && (
          <Box sx={{ px: 2.5, py: 2 }}>
            <AgentEmploymentPanel employment={employment} loading={loadingEmployment} />
          </Box>
        )}
      </DialogContent>
      {/* ── Footer ───────────────────────────────────────────── */}
      <DialogActions sx={{ px: 2.5, pb: 2, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Close
        </Button>
        {!isAdded ? (
          <Button
            variant="contained"
            startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
            onClick={() => {
              onAdd?.();
              onClose();
            }}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Add to Workspace
          </Button>
        ) : (
          <Chip
            icon={
              <AppIcon
                name="CheckCircleOutline"
                fallback={CheckCircleOutlineIcon}
                sx={{ fontSize: 14 }}
              />
            }
            label="In Workspace"
            size="small"
            color="success"
            sx={{ fontWeight: 600, fontSize: '0.78rem', height: 32, px: 0.5 }}
          />
        )}
      </DialogActions>
    </Dialog>
  );
}
