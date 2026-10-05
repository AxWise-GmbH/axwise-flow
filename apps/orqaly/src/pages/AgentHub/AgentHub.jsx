import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';

// Lazy-load embedded sub-pages to keep the main Agent Hub bundle small
const PulsePage = lazy(() => import('../Pulse/Pulse.jsx'));
const PromptLabPage = lazy(() => import('../PromptLab/PromptLab.jsx'));
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Button,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Collapse,
  useTheme,
  alpha,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Stack,
  Divider,
  Popover,
  Snackbar,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Tabs,
  Tab,
  CircularProgress,
  Autocomplete,
  useMediaQuery,
  Rating,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BlockIcon from '@mui/icons-material/Block';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import SpeedIcon from '@mui/icons-material/Speed';
import CloseIcon from '@mui/icons-material/Close';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import CategoryIcon from '@mui/icons-material/Category';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import CheckIcon from '@mui/icons-material/Check';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import PageLayout from '../../components/Common/PageLayout';
import FormDialog from '../../components/Common/FormDialog';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import EmptyState from '../../components/Common/EmptyState';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { cardGridColumns } from '../../utils/cardGridColumns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getOrgAgentMap } from '../../services/orgAgentService';
import { getOrgTeamMap } from '../../services/orgTeamService';
import OrgFilterBanner from '../../components/Common/OrgFilterBanner';
import {
  getAgents,
  addAgent,
  updateAgent,
  removeAgent,
  getProjects,
  getAssignments,
  getTasks,
  getKpis,
  getHubDashboard,
  CONNECTION_TYPES,
  getAgentConnections,
  syncAgentsFromSupabase,
} from '../../services/agentHubService';
import { getAgentEmployment, getAgentEmploymentMap } from '../../services/agentEmploymentService';
import AgentEmploymentPanel, {
  fmtEmploymentDate,
} from '../../components/AgentHub/AgentEmploymentPanel';
import {
  createSystemAgent,
  updateSystemAgent,
  loadSystemAgents,
} from '../../services/systemAgentsService';
import { logAction, loadAuditLogs } from '../../services/auditLogBackend';
import { loadPredefinedAgents } from '../../services/predefinedAgentService';
import { PREDEFINED_AGENTS } from '../../config/predefinedAgents';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../config/assistantBrain';
import {
  hasLoadedPredefinedTools,
  hasMcpToolsLoaded,
  loadPredefinedTools,
} from '../../services/predefinedToolService';
import ToolSetupChat from '../../components/AgentHub/ToolSetupChat';
import CreatePulseDialog from '../../components/Pulse/CreatePulseDialog';
import { TEAM_TOOLS } from '../../config/predefinedTools';
import { createWorkflow, updateWorkflow as updateWfService } from '../../services/workflowService';
import { generateTeamSuggestions, SUGGESTION_TYPES } from '../../services/teamSuggestionEngine';
import { useAuth } from '../../context/AuthContext';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import HistoryIcon from '@mui/icons-material/History';
import TimelineIcon from '@mui/icons-material/Timeline';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import SendIcon from '@mui/icons-material/Send';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Slider from '@mui/material/Slider';
import { supabase } from '../../lib/supabase';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { useJobs } from '../../hooks/useJobs';
import { useTeams } from '../../hooks/useTeams';
import { useTools } from '../../hooks/useTools';
import { useTeamTasks } from '../../hooks/useTeamTasks';
import { loadTeamTasks } from '../../services/teamTaskBackend';
import { aggregateAgentTokenStats } from '../../utils/enrichAgentTokenStats';
import { agentMemoryOwnerId, isAgentMemoryEnabled } from '../../utils/agentMemory';
import AgentCostTokenStat from '../../components/Common/AgentCostTokenStat';
import AgentReportsTab from '../../components/AgentReports/AgentReportsTab';
import AgentAvatar from '../../components/AgentHub/AgentAvatar';
import ImportedFromBadge from '../../components/AgentHub/ImportedFromBadge';
import AgentMemoryPanel from '../../components/Common/AgentMemoryPanel';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import {
  getProfile,
  listProfiles,
  seedProfiles,
  generateAvatar,
  upsertProfile,
} from '../../services/agentProfileService';
import { PREDEFINED_AGENT_PROFILES } from '../../config/predefinedAgentProfiles';
import { buildAgentProfile } from '../../services/agentProfileBuilder';
import { getAgentExecutionPersonas } from '../../services/agentExecutionPersonaService';
import PersonPinOutlinedIcon from '@mui/icons-material/PersonPinOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import KnowledgeBase from '../KnowledgeBase/KnowledgeBase';
import AgentBuilderTab from '../../components/AgentBuilder/AgentBuilderTab';
import AgentResumeDialog from '../../components/AgentHub/AgentResumeDialog';
import { printAgentResume } from '../../utils/agentResumePdf';
import MyAgentsTab from '../../components/MyAgents/MyAgentsTab';
import SkillsMarketplaceTab from '../../components/AgentHub/SkillsMarketplaceTab';
import SkillEditorDialog from '../../components/AgentHub/SkillEditorDialog';
import SkillInstallerDialog from '../../components/AgentHub/SkillInstallerDialog';
import CreateAgentDialog from '../../components/AgentHub/CreateAgentDialog';
import ConnectedLibrariesSection from '../../components/AgentHub/ConnectedLibrariesSection';
import {
  getInstalledSkills,
  uninstallSkill,
  updateCustomContent,
  toggleSkill,
  installSkill,
  listSkills,
} from '../../services/agentSkillsService';
import { TEAM_STATUSES_LIST } from '../../services/teamService';
import FavoriteOutlinedIcon from '@mui/icons-material/FavoriteOutlined';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import {
  getAgentRatings,
  submitRating as submitAgentRating,
  deleteRating as deleteAgentRating,
} from '../../services/agentRatingService';
import {
  submitRating as submitRatingNew,
  getMyRating,
  getAggregate,
} from '../../services/ratingsService';

import AppIcon from '../../components/icons/AppIcon';
import { cleanGeneratedPresentationText } from '../../utils/generatedPresentationText.js';

function personaReadableValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return cleanGeneratedPresentationText(String(value)).replaceAll('_', ' ');
  }
  if (Array.isArray(value)) return value.map(personaReadableValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key, item]) => !key.startsWith('_') && item != null && item !== '')
      .map(([key, item]) => {
        const rendered = personaReadableValue(item);
        return rendered ? `${key.replaceAll('_', ' ')}: ${rendered}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}

function personaValueList(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map(personaReadableValue).filter(Boolean);
}

function personaConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric)));
}

function personaBoundaryList(value) {
  return personaValueList(value).filter(
    (item) =>
      !/\b(gemini|openai|anthropic|claude|openrouter|model routing|budget capped|no[- ]tools)\b/i.test(
        item
      )
  );
}

function personaRecordSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.entries(value)
    .filter(([key, item]) => !key.startsWith('_') && item != null && item !== '')
    .map(([key, item]) => {
      const rendered = personaReadableValue(item);
      return rendered ? `${key.replaceAll('_', ' ')}: ${rendered}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

// ── Status config ────────────────────────────────────────────
const STATUS_MAP = {
  available: { label: 'Active', color: 'success', icon: '🟢' },
  paused: { label: 'Paused', color: 'warning', icon: '⏸️' },
  blocked: { label: 'Blocked', color: 'error', icon: '🔴' },
  busy: { label: 'Busy', color: 'info', icon: '🔵' },
  offline: { label: 'Offline', color: 'default', icon: '⚫' },
};

const STATUS_CYCLE = ['available', 'paused', 'blocked'];

/** The server agent-chat contract always uses the persisted agents row ID. */
// eslint-disable-next-line react-refresh/only-export-components
export function agentChatRowId(agent) {
  return agent?._supabase_id || agent?.id || null;
}

/** Never carry another agent's local history or thread into a new request. */
// eslint-disable-next-line react-refresh/only-export-components
export function agentChatRequestContext(agentId, contextAgentId, messages, threadId) {
  if (!agentId || agentId !== contextAgentId) return { history: [], threadId: null };
  return {
    history: Array.isArray(messages) ? messages.slice(-20) : [],
    threadId: threadId || null,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function isCurrentAgentChatRequest(
  requestAgentId,
  requestEpoch,
  activeAgentId,
  activeEpoch
) {
  return Boolean(
    requestAgentId && requestAgentId === activeAgentId && requestEpoch === activeEpoch
  );
}

/** Abort and invalidate a same-agent history read before an interactive send. */
// eslint-disable-next-line react-refresh/only-export-components
export function invalidatePendingAgentChatHistory(historyAbortRef, epochRef) {
  historyAbortRef.current?.abort();
  historyAbortRef.current = null;
  epochRef.current += 1;
  return epochRef.current;
}

/** Parse SSE text while retaining an event name split from its data chunk. */
// eslint-disable-next-line react-refresh/only-export-components
export function consumeAgentChatSseText(state, text) {
  const lines = `${state?.buffer || ''}${text || ''}`.split('\n');
  const buffer = lines.pop() || '';
  let eventType = state?.eventType || '';
  const events = [];

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7);
    } else if (line.startsWith('data: ')) {
      try {
        events.push({ eventType, data: JSON.parse(line.slice(6)) });
      } catch {
        // Ignore malformed data without allowing its event name to bleed into
        // a later valid event.
      }
      eventType = '';
    }
  }

  return { buffer, eventType, events };
}

// ── Workflow Schema constants ────────────────────────────────
export const SCHEMA_PROVIDERS = [
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
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    color: '#5B6EF5',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'glm',
    label: 'GLM',
    color: '#1E88E5',
    models: ['glm-4.6', 'glm-5.1', 'glm-4-plus', 'glm-4', 'glm-4-flash'],
  },
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

export const SCHEMA_TOKEN_COSTS = {
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.0001 },
  'gemma2-9b-it': { input: 0.0002, output: 0.0002 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'claude-opus-5': { input: 0.015, output: 0.075 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.0008, output: 0.004 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-reasoner': { input: 0.00055, output: 0.0022 },
  'glm-5.1': { input: 0.002, output: 0.002 },
  'glm-4.6': { input: 0.0006, output: 0.0022 },
  'glm-4-plus': { input: 0.001, output: 0.001 },
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

function estimateSchemaConst(model, systemPrompt, maxTokens) {
  const costs = SCHEMA_TOKEN_COSTS[model] || SCHEMA_TOKEN_COSTS['glm-5.1'];
  const promptTokens = Math.ceil((systemPrompt || '').length / 4);
  const inputCost = ((promptTokens + 500) / 1000) * costs.input;
  const outputCost = (maxTokens / 1000) * costs.output;
  const perCall = inputCost + outputCost;
  return {
    perCall: Math.round(perCall * 10000) / 10000,
    daily: Math.round(perCall * 100 * 10000) / 10000,
  };
}

/**
 * Convert a Workflow Schema form into React Flow nodes + edges for the visual workflow editor.
 */
function buildAgentWorkflowNodes(schema, agentName) {
  const nodes = [];
  const edges = [];
  const X = 300;
  const Y_STEP = 140;
  let y = 50;
  let nodeIdx = 0;

  const makeId = () => `agent-node-${nodeIdx++}`;

  // Node 1: LLM Provider
  const llmId = makeId();
  const provLabel =
    SCHEMA_PROVIDERS.find((p) => p.id === schema.provider)?.label || schema.provider;
  nodes.push({
    id: llmId,
    type: 'workflow',
    position: { x: X, y },
    data: {
      blockId: 'llm-provider',
      label: `${provLabel}: ${schema.model}`,
      config: {
        provider: schema.provider,
        model: schema.model,
        temperature: schema.temperature,
        max_tokens: schema.max_tokens,
      },
    },
  });
  y += Y_STEP;

  // Node 2: System Prompt
  const promptId = makeId();
  const promptSnippet = (schema.system_prompt || '').slice(0, 50).replace(/\n/g, ' ');
  nodes.push({
    id: promptId,
    type: 'workflow',
    position: { x: X, y },
    data: {
      blockId: 'system-prompt',
      label: 'System Prompt',
      description: promptSnippet ? `${promptSnippet}...` : 'Not set',
      config: { system_prompt: schema.system_prompt },
    },
  });
  edges.push({ id: `e-${llmId}-${promptId}`, source: llmId, target: promptId, type: 'workflow' });
  y += Y_STEP;

  // Node 3: Memory
  const memId = makeId();
  const memLabel =
    MEMORY_TYPES.find((m) => m.value === schema.memory_type)?.label || schema.memory_type;
  nodes.push({
    id: memId,
    type: 'workflow',
    position: { x: X, y },
    data: {
      blockId: 'memory-config',
      label: `Memory: ${memLabel}`,
      description:
        schema.memory_type !== 'none' ? `Window: ${schema.memory_window} msgs` : 'Stateless',
      config: { memory_type: schema.memory_type, memory_window: schema.memory_window },
    },
  });
  edges.push({ id: `e-${promptId}-${memId}`, source: promptId, target: memId, type: 'workflow' });
  y += Y_STEP;

  // Nodes 4–N: Tools (fan-out if multiple, linear if single)
  const toolIds = (schema.tools || []).map((t) =>
    typeof t === 'string' ? t : t?.tool_id || String(t)
  );
  let prevId = memId;

  if (toolIds.length > 0) {
    const fanOut = toolIds.length > 1;
    const toolNodeIds = [];
    toolIds.forEach((toolId, i) => {
      const tid = makeId();
      const xOff = fanOut ? (i - (toolIds.length - 1) / 2) * 180 : 0;
      nodes.push({
        id: tid,
        type: 'workflow',
        position: { x: X + xOff, y },
        data: {
          blockId: 'agent-tool',
          label: toolId.replace(/:/g, ': '),
          config: { tool_id: toolId },
        },
      });
      edges.push({ id: `e-${prevId}-${tid}`, source: prevId, target: tid, type: 'workflow' });
      toolNodeIds.push(tid);
    });
    y += Y_STEP;

    // Merge point: Constraints node connects from all tools
    const constId = makeId();
    nodes.push({
      id: constId,
      type: 'workflow',
      position: { x: X, y },
      data: {
        blockId: 'agent-constraints',
        label: 'Constraints',
        description: `$${schema.constraints?.max_cost_per_day_usd || 5}/day · ${schema.constraints?.max_requests_per_hour || 60} req/hr`,
        config: schema.constraints,
      },
    });
    toolNodeIds.forEach((tid) => {
      edges.push({ id: `e-${tid}-${constId}`, source: tid, target: constId, type: 'workflow' });
    });
    prevId = constId;
    y += Y_STEP;
  } else {
    // No tools - go straight to constraints
    const constId = makeId();
    nodes.push({
      id: constId,
      type: 'workflow',
      position: { x: X, y },
      data: {
        blockId: 'agent-constraints',
        label: 'Constraints',
        description: `$${schema.constraints?.max_cost_per_day_usd || 5}/day · ${schema.constraints?.max_requests_per_hour || 60} req/hr`,
        config: schema.constraints,
      },
    });
    edges.push({ id: `e-${prevId}-${constId}`, source: prevId, target: constId, type: 'workflow' });
    prevId = constId;
    y += Y_STEP;
  }

  // Final: Output node
  const outId = makeId();
  nodes.push({
    id: outId,
    type: 'workflow',
    position: { x: X, y },
    data: { blockId: 'agent-output', label: `Output: ${agentName}`, config: {} },
  });
  edges.push({ id: `e-${prevId}-${outId}`, source: prevId, target: outId, type: 'workflow' });

  return { nodes, edges };
}

// ── Column definitions ───────────────────────────────────────
const COLUMNS = [
  { id: 'agentId', label: 'Agent ID', sortKey: 'agent_id', minWidth: 140 },
  { id: 'name', label: 'Agent Name', sortKey: 'role', minWidth: 160 },
  { id: 'category', label: 'Category', sortKey: 'category', minWidth: 120, align: 'center' },
  { id: 'status', label: 'Status', sortKey: 'availability_status', minWidth: 100, align: 'center' },
  { id: 'dateCreated', label: 'Date Created', sortKey: 'created_at', minWidth: 155 },
  { id: 'lastActive', label: 'Last Active', sortKey: 'updated_at', minWidth: 155 },
  { id: 'projects', label: 'Projects In', minWidth: 180 },
  { id: 'employment', label: 'Employment', minWidth: 180 },
  { id: 'tools', label: 'Tools Used', minWidth: 180 },
  {
    id: 'connectionType',
    label: 'Connection',
    sortKey: 'connection_type',
    minWidth: 120,
    align: 'center',
  },
  { id: 'model', label: 'Model', sortKey: 'connection_id', minWidth: 130, align: 'center' },
  { id: 'usageMetrics', label: 'Usage Metrics', minWidth: 170 },
  { id: 'addedBy', label: 'Added By', minWidth: 150 },
  { id: 'reports', label: 'Reports', minWidth: 80, align: 'center' },
  { id: 'actions', label: '', minWidth: 120, align: 'right' },
];

// ── Helpers ──────────────────────────────────────────────────
function formatTimestamp(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yy} - ${hh}:${mi}:${ss}`;
}

function formatAgentId(id) {
  if (!id) return '-';
  const short = id
    .replace(/^agent-/, '')
    .slice(0, 8)
    .toUpperCase();
  return `AGENT-${short}`;
}

function descendingComparator(a, b, orderBy) {
  const av = a[orderBy] ?? '';
  const bv = b[orderBy] ?? '';
  if (bv < av) return -1;
  if (bv > av) return 1;
  return 0;
}
function getComparator(order, orderBy) {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

// ── Default form ─────────────────────────────────────────────
const DEFAULT_FORM = {
  role: '',
  description: '',
  capabilities: '',
  connection_type: 'api',
  connection_id: '',
  cost_per_task: 0,
  status: 'available',
  roleId: 'role-agent',
  category: '',
};

// Presentation metadata for the role IDs stored on system agents. These values
// describe agents; they do not grant access to the signed-in Clerk user.
const SYSTEM_AGENT_ROLE_OPTIONS = Object.freeze([
  { id: 'role-super-admin', name: 'Super Admin', color: '#D32F2F' },
  { id: 'role-manager', name: 'Admin', color: '#404040' },
  { id: 'role-viewer', name: 'Viewer', color: '#757575' },
  { id: 'role-partner', name: 'Partner', color: '#2E7D32' },
  { id: 'role-agent', name: 'Agent', color: '#7C4DFF' },
  { id: 'role-tools', name: 'Tools', color: '#00897B' },
]);

const CATEGORIES_KEY = 'orch_agent_categories_extra';

// ── Team status colors ───────────────────────────────────────
const TEAM_STATUS_COLORS = {
  active: { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0' },
  paused: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  disbanded: { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' },
};
const TEAM_STATUS_COLORS_DARK = {
  active: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: 'rgba(34,197,94,0.2)' },
  paused: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  disbanded: { bg: 'rgba(148,163,184,0.1)', color: '#94A3B8', border: 'rgba(148,163,184,0.2)' },
};

// ── Team columns ─────────────────────────────────────────────
const TEAM_COLUMNS = [
  { id: 'name', label: 'Team Name', sortKey: 'name', minWidth: 160 },
  { id: 'description', label: 'Description', sortKey: 'description', minWidth: 200 },
  { id: 'agents', label: 'Agents', minWidth: 140, align: 'center' },
  { id: 'jobs', label: 'Jobs', minWidth: 80, align: 'center' },
  { id: 'createdBy', label: 'Created By', sortKey: 'createdByName', minWidth: 130 },
  { id: 'status', label: 'Status', sortKey: 'status', minWidth: 100, align: 'center' },
  { id: 'updated', label: 'Updated', sortKey: 'updatedAt', minWidth: 110, align: 'center' },
  { id: 'actions', label: '', minWidth: 100, align: 'right' },
];

const EMPTY_TEAM_FORM = { name: '', description: '', status: 'active', agents: [] };

// ── Shared helpers (Teams / Concilium) ───────────────────────
function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDateShort(dateStr);
}

function daysAtWork(startedAt) {
  if (!startedAt) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24))
  );
}

function SectionLabel({ icon, label }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      {icon && (
        <Box sx={{ color: 'text.secondary', display: 'flex', '& > *': { fontSize: 18 } }}>
          {icon}
        </Box>
      )}
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          fontSize: '0.8rem',
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          color: 'text.secondary',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function AgentHub() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { simpleMode } = useSimpleMode();
  const [showMetrics, setShowMetrics] = useShowMetrics('agent-hub');
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // ── Tab state (URL-synced) ────────────────────────────────
  const VALID_TABS = ['agents', 'teams', 'knowledge', 'skills', 'my-agents', 'pulse', 'prompt-lab'];
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return VALID_TABS.includes(t) ? t : 'agents';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (VALID_TABS.includes(t)) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = useCallback(
    (value) => {
      setTab(value);
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams]
  );

  // ── Org scope (?org=) - filter agents/teams to one organization ──
  const orgId = searchParams.get('org');
  const orgName = searchParams.get('orgName');
  const [orgAgentIds, setOrgAgentIds] = useState(null);
  const [orgTeamIds, setOrgTeamIds] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setOrgAgentIds(null);
      setOrgTeamIds(null);
      return undefined;
    }
    (async () => {
      const [am, tm] = await Promise.all([
        getOrgAgentMap([orgId]).catch(() => ({})),
        getOrgTeamMap([orgId]).catch(() => ({})),
      ]);
      if (cancelled) return;
      setOrgAgentIds(new Set(am[orgId] || []));
      setOrgTeamIds(new Set(tm[orgId] || []));
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);
  const clearOrgFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('org');
    next.delete('orgName');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── Teams hooks ──────────────────────────────────────────
  const { teams, addTeam, editTeam, removeTeam } = useTeams();
  const { tools: userTools } = useTools();
  const { jobs } = useJobs();
  const { tasks: teamTasks } = useTeamTasks();

  // Data
  const agents = useMemo(() => getAgents(), [reloadKey]);
  const projects = useMemo(() => getProjects(), [reloadKey]);
  const assignments = useMemo(() => getAssignments(), [reloadKey]);
  const tasks = useMemo(() => getTasks(), [reloadKey]);
  const kpis = useMemo(() => getKpis(), [reloadKey]);
  const dashboard = useMemo(() => getHubDashboard(), [reloadKey]);

  // Hydrate agents from Supabase on first load, then seed predefined agents/tools if empty
  useEffect(() => {
    syncAgentsFromSupabase()
      .then(() => {
        const tasks = [];
        // Always run - seeds missing agents, patches system_prompt, dedupes
        tasks.push(loadPredefinedAgents());
        if (!hasLoadedPredefinedTools() || !hasMcpToolsLoaded()) tasks.push(loadPredefinedTools());
        return Promise.all(tasks);
      })
      .then(refresh)
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Role labels/options belong to system agents, not the signed-in user.
  const roles = SYSTEM_AGENT_ROLE_OPTIONS;

  // System agents for "registered" badges
  const [systemAgents, setSystemAgents] = useState([]);
  useEffect(() => {
    loadSystemAgents()
      .then(setSystemAgents)
      .catch(() => {});
  }, [reloadKey]);

  // Deep link: ?detail={agentId} opens agent detail dialog on mount
  useEffect(() => {
    const detailId = searchParams.get('detail');
    if (detailId && agents.length > 0 && !detailAgent) {
      const agent = agents.find((a) => a.id === detailId);
      if (agent) setDetailAgent(agent);
    }
  }, [agents, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // View mode (card / list)
  const VIEW_MODE_KEY = 'orch_agents_view';
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_MODE_KEY);
      return v === 'list' ? 'list' : 'card';
    } catch {
      return 'card';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {}
  }, [viewMode]);

  // Categories
  const [extraCategories, setExtraCategories] = useState(() => {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState('');
  const [categoriesAnchorEl, setCategoriesAnchorEl] = useState(null);

  const existingCategories = useMemo(() => {
    const set = new Set();
    agents.forEach((a) => {
      const c = (a.category && String(a.category).trim()) || null;
      if (c) set.add(c);
    });
    extraCategories.forEach((c) => set.add(c));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [agents, extraCategories]);

  // Table state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [connectionFilter, setConnectionFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [memoryFilter, setMemoryFilter] = useState('All');
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('created_at');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // The "Sync Keys" button and its auto-sync-on-first-load were removed along with
  // the seed-tool-credentials endpoint: they copied the SERVER's .env secrets into
  // each user's `tools.data.apiKey` as plaintext, permanently and ungated. Agents
  // now resolve tool keys per-user at execution time (encrypted vault, with an
  // env fallback that is gated to local dev), so nothing needs to be written to
  // the database to make a tool work.

  const [editDialog, setEditDialog] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [detailAgent, setDetailAgent] = useState(null);
  const [detailActionsAnchor, setDetailActionsAnchor] = useState(null);
  const [agentPulseOpen, setAgentPulseOpen] = useState(false);
  const [detailTab, setDetailTab] = useState(0);
  const [agentMemoryOpen, setAgentMemoryOpen] = useState(false);
  const [detailProfile, setDetailProfile] = useState(null);
  const [detailProfileLoading, setDetailProfileLoading] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);

  // Fill an empty agent's profile with a complete deterministic character sheet.
  const handleGenerateProfile = useCallback(async () => {
    if (!detailAgent) return;
    setGeneratingProfile(true);
    try {
      const agentId = detailAgent._supabase_id || detailAgent.agent_id || detailAgent.id;
      const profile = buildAgentProfile(detailAgent);
      await upsertProfile({ ...profile, agent_id: agentId });
      setDetailProfile(profile); // fill the card immediately
    } catch {
      /* best-effort */
    } finally {
      setGeneratingProfile(false);
    }
  }, [detailAgent]);
  // Employment (org / consilium / assignment dates) for the detail popup + table.
  const [detailEmployment, setDetailEmployment] = useState({ orgs: [], teams: [] });
  const [detailEmploymentLoading, setDetailEmploymentLoading] = useState(false);
  const [employmentMap, setEmploymentMap] = useState({});

  // Employment (org/consilium) per agent for the table "Employment" column.
  // Keyed by whatever id org_agents.agent_id stores; we query all candidate ids.
  useEffect(() => {
    const ids = agents.flatMap((a) => [a.id, a.agent_id, a._supabase_id]).filter(Boolean);
    if (!ids.length) {
      setEmploymentMap({});
      return undefined;
    }
    let cancelled = false;
    getAgentEmploymentMap(ids)
      .then((m) => {
        if (!cancelled) setEmploymentMap(m || {});
      })
      .catch(() => {
        if (!cancelled) setEmploymentMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [agents]);

  // Resolve an agent's employment rows from the map via any of its candidate ids.
  const employmentForAgent = useCallback(
    (agent) => {
      for (const id of [agent.id, agent.agent_id, agent._supabase_id]) {
        if (id && employmentMap[id]?.length) return employmentMap[id];
      }
      return [];
    },
    [employmentMap]
  );
  const [profilesSeeded, setProfilesSeeded] = useState(false);
  const [schemaForm, setSchemaForm] = useState({ ...DEFAULT_SCHEMA });
  const [schemaTools, setSchemaTools] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [schemaMessage, setSchemaMessage] = useState({ type: '', text: '' });
  const [schemaOriginal, setSchemaOriginal] = useState(null);

  // Osja feedback-loop config (migration 109 - lives on `agents` table)
  const [osjaConfig, setOsjaConfig] = useState({
    osja_regen_threshold: 70,
    osja_regen_max_attempts: 1,
    osja_learning_enabled: true,
  });
  const [osjaSaving, setOsjaSaving] = useState(false);

  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [snack, setSnack] = useState(null);

  // Ratings
  const [agentRatings, setAgentRatings] = useState([]);
  const [agentAvgRating, setAgentAvgRating] = useState({ average: 0, count: 0 });
  const [myAgentRating, setMyAgentRating] = useState(null);
  const [myAgentRatingSubmitting, setMyAgentRatingSubmitting] = useState(false);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [ratingForm, setRatingForm] = useState({
    rating: 0,
    comment: '',
    ratingType: 'individual',
    requestId: '',
  });
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  // Resume
  const [resumeDialogAgent, setResumeDialogAgent] = useState(null);

  // Skills (Workflow Schema)
  const [agentSkills, setAgentSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillEditorOpen, setSkillEditorOpen] = useState(null);
  const [skillInstallerOpen, setSkillInstallerOpen] = useState(false);
  const [allBundledSkills, setAllBundledSkills] = useState([]);
  const [installingSkillId, setInstallingSkillId] = useState(null);

  const loadAgentSkills = useCallback(async (agentId) => {
    if (!agentId) return;
    setSkillsLoading(true);
    try {
      const data = await getInstalledSkills(agentId);
      setAgentSkills(Array.isArray(data) ? data : []);
    } catch {
      setAgentSkills([]);
    }
    setSkillsLoading(false);
  }, []);

  // Load the bundled catalog once - used to surface "Recommended for this role".
  useEffect(() => {
    (async () => {
      try {
        const all = await listSkills({});
        setAllBundledSkills(Array.isArray(all) ? all.filter((s) => s.is_bundled === true) : []);
      } catch {
        setAllBundledSkills([]);
      }
    })();
  }, []);

  // ── Load agent profile when detail agent changes ───────────────────────
  useEffect(() => {
    if (!detailAgent) {
      setDetailProfile(null);
      setDetailProfileLoading(false);
      return;
    }
    // Try multiple ID fields: _supabase_id (real DB UUID), agent_id, id
    const supaId = detailAgent._supabase_id || detailAgent.agent_id || detailAgent.id;
    setDetailProfileLoading(true);
    (async () => {
      try {
        try {
          const { data } = await supabase
            .from('agent_profiles')
            .select('*')
            .eq('agent_id', supaId)
            .maybeSingle();
          if (data) {
            setDetailProfile(data);
            return;
          }
        } catch {
          /* continue */
        }
        if (supaId !== detailAgent.id) {
          try {
            const { data } = await supabase
              .from('agent_profiles')
              .select('*')
              .eq('agent_id', detailAgent.id)
              .maybeSingle();
            if (data) {
              setDetailProfile(data);
              return;
            }
          } catch {
            /* continue */
          }
        }
        const agentName = detailAgent.name || detailAgent.role;
        try {
          const { data } = await supabase
            .from('agent_profiles')
            .select('*')
            .eq('display_name', agentName)
            .maybeSingle();
          if (data) {
            setDetailProfile(data);
            return;
          }
        } catch {
          /* continue */
        }
        // Final fallback: predefined profile config (covers seed failures + offline)
        const predef = PREDEFINED_AGENT_PROFILES.find(
          (p) =>
            p.display_name === agentName ||
            p.agentName === detailAgent.name ||
            p.agentName === detailAgent.role
        );
        setDetailProfile(predef || null);
      } finally {
        setDetailProfileLoading(false);
      }
    })();
  }, [detailAgent]);

  // ── Load employment (org/consilium/dates) for the open agent ──────────
  useEffect(() => {
    if (!detailAgent) {
      setDetailEmployment({ orgs: [], teams: [] });
      return;
    }
    const agentId = detailAgent.id || detailAgent.agent_id || detailAgent._supabase_id;
    setDetailEmploymentLoading(true);
    getAgentEmployment(agentId)
      .then((emp) => setDetailEmployment(emp || { orgs: [], teams: [] }))
      .catch(() => setDetailEmployment({ orgs: [], teams: [] }))
      .finally(() => setDetailEmploymentLoading(false));
  }, [detailAgent]);

  // ── Auto-seed predefined profiles on first load ───────────────────────
  useEffect(() => {
    if (profilesSeeded || agents.length === 0) return;
    (async () => {
      try {
        await seedProfiles(PREDEFINED_AGENT_PROFILES);
        setProfilesSeeded(true);
      } catch {
        setProfilesSeeded(true);
      }
    })();
  }, [agents, profilesSeeded]);

  const handleUninstallSkill = useCallback(
    async (skillId) => {
      if (!detailAgent) return;
      const agentId = detailAgent.id || detailAgent.agent_id;
      try {
        await uninstallSkill(agentId, skillId);
        setSnack({ text: 'Skill removed', severity: 'success' });
        loadAgentSkills(agentId);
      } catch (err) {
        setSnack({ text: err.message, severity: 'error' });
      }
    },
    [detailAgent, loadAgentSkills]
  );

  const handleToggleSkill = useCallback(
    async (skillId, isActive) => {
      if (!detailAgent) return;
      const agentId = detailAgent.id || detailAgent.agent_id;
      try {
        await toggleSkill(agentId, skillId, isActive);
        loadAgentSkills(agentId);
      } catch (err) {
        setSnack({ text: err.message, severity: 'error' });
      }
    },
    [detailAgent, loadAgentSkills]
  );

  const handleSaveSkillContent = useCallback(
    async (content) => {
      if (!detailAgent || !skillEditorOpen) return;
      const agentId = detailAgent.id || detailAgent.agent_id;
      try {
        await updateCustomContent(agentId, skillEditorOpen.skill_id, content);
        setSnack({ text: 'Skill content saved', severity: 'success' });
        setSkillEditorOpen(null);
        loadAgentSkills(agentId);
      } catch (err) {
        setSnack({ text: err.message, severity: 'error' });
      }
    },
    [detailAgent, skillEditorOpen, loadAgentSkills]
  );

  const handleResetSkillContent = useCallback(async () => {
    if (!detailAgent || !skillEditorOpen) return;
    const agentId = detailAgent.id || detailAgent.agent_id;
    try {
      await updateCustomContent(agentId, skillEditorOpen.skill_id, null);
      loadAgentSkills(agentId);
    } catch (err) {
      setSnack({ text: err.message, severity: 'error' });
    }
  }, [detailAgent, skillEditorOpen, loadAgentSkills]);

  /* ---- Page Activity Log Dialog ---- */
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => log.entity === 'Agent' || log.entity === 'AgentHub');
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

  // Connection options
  const connectionsByType = useMemo(
    () => getAgentConnections(form.connection_type),
    [form.connection_type]
  );

  // ── Enriched agent data ────────────────────────────────────
  const enrichedAgents = useMemo(() => {
    return agents.map((agent) => {
      const agentAssignments = assignments.filter((a) => a.agent_id === agent.id);
      const agentProjects = agentAssignments
        .map((a) => projects.find((p) => p.id === a.project_id))
        .filter(Boolean);
      const agentTasks = tasks.filter((t) => t.agent_id === agent.id);
      const completedTasks = agentTasks.filter(
        (t) => t.status === 'completed' || t.status === 'evaluated'
      ).length;
      const successRate =
        agentTasks.length > 0 ? Math.round((completedTasks / agentTasks.length) * 100) : 0;
      // Match real tools from /tools page by relevance to agent's role
      const roleText = [
        agent.role,
        agent.category,
        ...(agent.capabilities || []),
        agent.system_prompt?.slice(0, 300),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const scoreToolForAgent = (t) => {
        const haystack = `${t.name} ${t.description || ''} ${t.connectionType || ''}`.toLowerCase();
        const words = roleText.split(/\W+/).filter((w) => w.length > 3);
        return words.reduce((s, word) => s + (haystack.includes(word) ? 1 : 0), 0);
      };
      const toolsUsed = userTools
        .filter((t) => t.status !== 'blocked')
        .map((t) => ({ ...t, _score: scoreToolForAgent(t) }))
        .filter((t) => t._score > 0)
        .sort((a, b) => b._score - a._score)
        .map((t) => t.name);
      const isRegistered = systemAgents.some(
        (sa) =>
          sa.agentHubId === agent.id ||
          (sa.name || '').toLowerCase() === (agent.role || '').toLowerCase()
      );
      const agentIds = [agent.id, agent.agent_id, agent._supabase_id].filter(Boolean);
      const tokenStats = aggregateAgentTokenStats(agentIds, teamTasks, {
        agentName: agent.name || agent.role,
        taskCount: agentTasks.length,
      });

      return {
        ...agent,
        projectsIn: agentProjects,
        toolsUsed,
        taskCount: agentTasks.length,
        completedTasks,
        successRate,
        isRegistered,
        totalTokens: tokenStats.totalTokens,
        tokensPerTask: tokenStats.tokensPerTask,
        llmMetricMeta: tokenStats.metricMeta,
      };
    });
  }, [agents, assignments, projects, tasks, systemAgents, userTools, teamTasks]);

  // ── Filtering & sorting ────────────────────────────────────
  const filtered = useMemo(() => {
    let list = enrichedAgents;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.role || '').toLowerCase().includes(q) ||
          (a.agent_id || '').toLowerCase().includes(q) ||
          (a.capabilities || []).some((c) => c.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'All') {
      list = list.filter((a) => a.availability_status === statusFilter);
    }
    if (connectionFilter !== 'All') {
      list = list.filter((a) => a.connection_type === connectionFilter);
    }
    if (categoryFilter !== 'All') {
      list = list.filter((a) => (a.category || '') === categoryFilter);
    }
    if (memoryFilter !== 'All') {
      list = list.filter((a) => isAgentMemoryEnabled(a.metadata) === (memoryFilter === 'On'));
    }
    if (orgAgentIds) {
      list = list.filter((a) => orgAgentIds.has(a.id) || orgAgentIds.has(a.agent_id));
    }
    return list.sort(getComparator(order, orderBy));
  }, [
    enrichedAgents,
    search,
    statusFilter,
    connectionFilter,
    categoryFilter,
    memoryFilter,
    order,
    orderBy,
    orgAgentIds,
  ]);

  const agentsPagination = usePagination(filtered, {
    surfaceId: 'agentHub.agents',
    defaultRowsPerPage: 10,
    resetOn: [search, statusFilter, connectionFilter, categoryFilter, memoryFilter],
  });
  const paged = agentsPagination.paginatedData;

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = agents.length;
    const active = agents.filter((a) => a.availability_status === 'available').length;
    const paused = agents.filter((a) => a.availability_status === 'paused').length;
    const blocked = agents.filter((a) => a.availability_status === 'blocked').length;
    return { total, active, paused, blocked };
  }, [agents]);

  const statCards = [
    {
      label: 'Total Agents',
      value: stats.total,
      helper: 'Registered in system',
      color: theme.palette.primary.main,
      icon: SmartToyOutlinedIcon,
    },
    {
      label: 'Active',
      value: stats.active,
      helper: 'Available for tasks',
      color: theme.palette.success.main,
      icon: PlayCircleOutlineIcon,
    },
    {
      label: 'Tasks Completed',
      value: dashboard.completedTasks,
      helper: `${dashboard.completionRate}% completion rate`,
      color: theme.palette.info.main,
      icon: TaskAltIcon,
    },
    {
      label: 'Avg KPI Score',
      value: dashboard.averageKpiScore,
      helper: `${dashboard.resourceUtilization}% utilization`,
      color: theme.palette.warning.main,
      icon: SpeedIcon,
    },
  ];

  // ── Handlers ───────────────────────────────────────────────
  const handleSort = (sortKey) => {
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  const handleAdd = async () => {
    const caps = form.capabilities.split(/[,\s]+/).filter(Boolean);
    const record = addAgent({
      role: form.role || 'general',
      description: form.description || '',
      capabilities: caps,
      connection_type: form.connection_type || 'api',
      connection_id: form.connection_id || null,
      cost_per_task: Number(form.cost_per_task) || 0,
      availability_status: form.status || 'available',
      category: form.category || null,
      added_by: user
        ? { uid: user.uid, email: user.email, date: new Date().toISOString() }
        : { uid: null, email: 'manual', date: new Date().toISOString() },
    });
    // Always assign Agent role on creation
    try {
      await createSystemAgent({
        name: (form.role || record.agent_id || 'Agent').trim(),
        type: 'custom',
        roleId: 'role-agent',
        agentHubId: record.id,
      });
    } catch {
      // Best-effort
    }
    setForm({ ...DEFAULT_FORM });
    setAddDialogOpen(false);
    refresh();
    setSnack({ text: 'Agent added', severity: 'success' });
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    const caps = form.capabilities.split(/[,\s]+/).filter(Boolean);
    updateAgent(editDialog.id, {
      role: form.role,
      description: form.description || '',
      capabilities: caps,
      connection_type: form.connection_type,
      connection_id: form.connection_id || null,
      cost_per_task: Number(form.cost_per_task) || 0,
      availability_status: form.status,
      category: form.category || null,
    });
    // Sync system role assignment
    const sa = systemAgents.find(
      (s) =>
        s.agentHubId === editDialog.id ||
        (s.name || '').toLowerCase() === (editDialog.role || '').toLowerCase()
    );
    if (form.roleId && sa) {
      try {
        await updateSystemAgent(sa.id, {
          name: (form.role || editDialog.role || 'Agent').trim(),
          roleId: form.roleId,
        });
      } catch {}
    } else if (form.roleId && !sa) {
      try {
        await createSystemAgent({
          name: (form.role || editDialog.agent_id || 'Agent').trim(),
          type: 'custom',
          roleId: form.roleId,
          agentHubId: editDialog.id,
        });
      } catch {}
    }
    setEditDialog(null);
    setForm({ ...DEFAULT_FORM });
    refresh();
    setSnack({ text: 'Agent updated', severity: 'success' });
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    removeAgent(deleteConfirm.id);
    setDeleteConfirm(null);
    setDetailAgent(null);
    refresh();
    setSnack({ text: 'Agent removed', severity: 'success' });
  };

  const handleToggleStatus = (agent) => {
    const currentIdx = STATUS_CYCLE.indexOf(agent.availability_status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    updateAgent(agent.id, { availability_status: nextStatus });
    refresh();
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(formatAgentId(id)).catch(() => {});
    setSnack({ text: 'Agent ID copied', severity: 'info' });
  };

  const openEdit = (agent) => {
    const sa = systemAgents.find(
      (s) =>
        s.agentHubId === agent.id ||
        (s.name || '').toLowerCase() === (agent.role || '').toLowerCase()
    );
    setForm({
      role: agent.role || '',
      description: agent.description || '',
      capabilities: (agent.capabilities || []).join(', '),
      connection_type: agent.connection_type || 'api',
      connection_id: agent.connection_id || '',
      cost_per_task: agent.cost_per_task || 0,
      status: agent.availability_status || 'available',
      roleId: sa?.roleId || '',
      category: agent.category || '',
    });
    setEditDialog(agent);
    setDetailAgent(null);
  };

  // Category handlers
  const handleAddCategory = useCallback(() => {
    const name = (newCategoryName && String(newCategoryName).trim()) || '';
    if (!name) return;
    const exists = existingCategories.some((c) => c.toLowerCase() === name.toLowerCase());
    if (exists) return;
    setExtraCategories((prev) => {
      const next = [...prev, name].sort((a, b) => a.localeCompare(b));
      try {
        localStorage.setItem(CATEGORIES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setNewCategoryName('');
  }, [newCategoryName, existingCategories]);

  const handleEditCategory = useCallback(
    (oldName, newName) => {
      const name = (newName && String(newName).trim()) || '';
      if (!name || name === oldName) {
        setEditingCategory(null);
        return;
      }
      // Update agents with old category
      agents.forEach((a) => {
        if ((a.category || '').trim() === oldName) {
          updateAgent(a.id, { category: name });
        }
      });
      setExtraCategories((prev) => {
        const next = prev
          .map((c) => (c === oldName ? name : c))
          .filter((c, i, arr) => arr.indexOf(c) === i)
          .sort((a, b) => a.localeCompare(b));
        try {
          localStorage.setItem(CATEGORIES_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      setEditingCategory(null);
      refresh();
    },
    [agents, refresh]
  );

  const handleDeleteCategory = useCallback(
    (categoryName) => {
      agents.forEach((a) => {
        if ((a.category || '').trim() === categoryName) {
          updateAgent(a.id, { category: null });
        }
      });
      setExtraCategories((prev) => {
        const next = prev.filter((c) => c !== categoryName);
        try {
          localStorage.setItem(CATEGORIES_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      setCategoriesAnchorEl(null);
      refresh();
    },
    [agents, refresh]
  );

  const canSubmit =
    form.role?.trim() && (form.connection_id || form.connection_type === 'internal');
  const hasActiveFilters =
    statusFilter !== 'All' ||
    connectionFilter !== 'All' ||
    categoryFilter !== 'All' ||
    memoryFilter !== 'All';

  // ── Detail agent data (enriched) ───────────────────────────
  const detailData = useMemo(() => {
    if (!detailAgent) return null;
    return enrichedAgents.find((a) => a.id === detailAgent.id) || null;
  }, [detailAgent, enrichedAgents]);

  const detailKpis = useMemo(() => {
    if (!detailAgent) return [];
    return kpis.filter((k) => k.entity_type === 'agent' && k.entity_id === detailAgent.id);
  }, [detailAgent, kpis]);

  // ── History tab data ───────────────────────────────────────
  const [agentJobs, setAgentJobs] = useState([]);
  const [agentTeamTasks, setAgentTeamTasks] = useState([]);
  const [agentPersonaGoals, setAgentPersonaGoals] = useState([]);
  const [agentHistory, setAgentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOutputDialog, setHistoryOutputDialog] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all'); // all, goals, communication, time
  const agentExecutionPersonas = useMemo(() => {
    const ids = [detailAgent?._supabase_id, detailAgent?.agent_id, detailAgent?.id].filter(Boolean);
    return getAgentExecutionPersonas(agentTeamTasks, agentPersonaGoals, ids);
  }, [agentTeamTasks, agentPersonaGoals, detailAgent]);

  // ── Chat tab state ────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatThreadId, setChatThreadId] = useState(null);
  const [chatContextAgentId, setChatContextAgentId] = useState(null);
  const chatEndRef = useRef(null);
  const chatEpochRef = useRef(0);
  const chatActiveAgentRef = useRef(null);
  const chatHistoryAbortRef = useRef(null);
  const chatSendAbortRef = useRef(null);
  const chatAgentId = agentChatRowId(detailAgent);

  // Reset synchronously for every canonical row-ID/tab transition and give all
  // async work a request epoch. Slow history reads and in-flight SSE streams
  // from the previous agent are aborted and cannot update the new agent state.
  useEffect(() => {
    const requestAgentId = chatAgentId;
    const requestEpoch = chatEpochRef.current + 1;
    chatEpochRef.current = requestEpoch;
    chatActiveAgentRef.current = requestAgentId;
    chatHistoryAbortRef.current?.abort();
    chatSendAbortRef.current?.abort();

    setChatMessages([]);
    setChatInput('');
    setChatThreadId(null);
    setChatLoading(false);
    setChatContextAgentId(requestAgentId);

    if (detailTab !== 3 || !requestAgentId) return undefined;

    const controller = new AbortController();
    chatHistoryAbortRef.current = controller;
    const isCurrent = () =>
      isCurrentAgentChatRequest(
        requestAgentId,
        requestEpoch,
        chatActiveAgentRef.current,
        chatEpochRef.current
      );

    (async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const res = await fetch(
          `${window.location.origin}/api/app?path=agent-chat&agent_id=${encodeURIComponent(requestAgentId)}`,
          { headers, signal: controller.signal }
        );
        if (!isCurrent()) return;
        if (res.ok) {
          const history = await res.json();
          if (!isCurrent()) return;
          setChatMessages(
            Array.isArray(history)
              ? history.map((m) => ({
                  role: m.sender_type === 'user' ? 'user' : 'agent',
                  content: m.content,
                  name: m.sender_name,
                }))
              : []
          );
        } else if (isCurrent()) {
          setChatMessages([]);
        }
      } catch (error) {
        if (error?.name !== 'AbortError' && isCurrent()) setChatMessages([]);
      } finally {
        if (chatHistoryAbortRef.current === controller) chatHistoryAbortRef.current = null;
      }
    })();

    return () => controller.abort();
  }, [detailTab, chatAgentId]);

  // Send chat message
  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || chatLoading || !chatAgentId) return;
    if (chatContextAgentId !== chatAgentId || chatActiveAgentRef.current !== chatAgentId) {
      return;
    }

    const agentId = chatAgentId;
    // A pending GET for this same agent must not be allowed to resolve after
    // this optimistic user message / SSE stream and replace the live chat.
    const requestEpoch = invalidatePendingAgentChatHistory(chatHistoryAbortRef, chatEpochRef);
    const requestContext = agentChatRequestContext(
      agentId,
      chatContextAgentId,
      chatMessages,
      chatThreadId
    );
    const isCurrent = () =>
      isCurrentAgentChatRequest(
        agentId,
        requestEpoch,
        chatActiveAgentRef.current,
        chatEpochRef.current
      );
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages([...requestContext.history, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    chatSendAbortRef.current?.abort();
    const controller = new AbortController();
    chatSendAbortRef.current = controller;

    try {
      const headers = { 'Content-Type': 'application/json' };
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      if (!isCurrent()) return;

      const res = await fetch(`${window.location.origin}/api/app?path=agent-chat`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          agent_id: agentId,
          message: userMsg,
          history: requestContext.history.map((entry) => ({
            sender_type: entry.role === 'user' ? 'user' : 'agent',
            content: entry.content,
            sender_name: entry.name,
          })),
          thread_id: requestContext.threadId,
        }),
      });
      if (!isCurrent()) return;

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (isCurrent()) {
          setChatMessages((prev) => [
            ...prev,
            { role: 'agent', content: `Error: ${err.error || 'Failed to connect'}` },
          ]);
        }
        return;
      }

      // Parse SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let agentResponse = '';
      let threadId = requestContext.threadId;

      // Add placeholder agent message
      if (isCurrent()) {
        setChatMessages((prev) => [...prev, { role: 'agent', content: '', typing: true }]);
      }

      let sseState = { buffer: '', eventType: '' };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isCurrent()) {
          await reader.cancel().catch(() => {});
          return;
        }
        sseState = consumeAgentChatSseText(sseState, decoder.decode(value, { stream: true }));

        for (const { eventType, data } of sseState.events) {
          if (eventType === 'token' || data.token) {
            agentResponse += data.token || '';
            setChatMessages((prev) => {
              if (!isCurrent()) return prev;
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'agent',
                content: agentResponse,
                typing: true,
              };
              return updated;
            });
          } else if (eventType === 'done' || data.message) {
            agentResponse = data.message || agentResponse;
            threadId = data.thread_id || threadId;
            setChatMessages((prev) => {
              if (!isCurrent()) return prev;
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'agent',
                content: agentResponse,
                name: data.agent_name,
              };
              return updated;
            });
          }
        }
      }

      if (threadId && isCurrent()) setChatThreadId(threadId);
    } catch (err) {
      if (err?.name !== 'AbortError' && isCurrent()) {
        setChatMessages((prev) => [...prev, { role: 'agent', content: `Error: ${err.message}` }]);
      }
    } finally {
      if (chatSendAbortRef.current === controller) chatSendAbortRef.current = null;
      if (isCurrent()) setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatAgentId, chatContextAgentId, chatMessages, chatThreadId]);

  useEffect(() => {
    if (!detailAgent) {
      setAgentJobs([]);
      setAgentTeamTasks([]);
      setAgentPersonaGoals([]);
      setAgentHistory([]);
      setHistoryFilter('all');
      return;
    }
    setHistoryLoading(true);
    (async () => {
      try {
        const agentId = detailAgent.agent_id || detailAgent.id;
        const supaId = detailAgent._supabase_id || agentId;
        const matchedJobs = jobs
          .filter((j) => j.assignedAgentId === agentId || j.assignedAgentId === detailAgent.id)
          .sort(
            (a, b) =>
              new Date(b.createdAt || b.created_at || 0) -
              new Date(a.createdAt || a.created_at || 0)
          );
        setAgentJobs(matchedJobs);

        const allTeamTasks = await loadTeamTasks();
        const agentTaskList = allTeamTasks
          .filter(
            (t) =>
              t.agentId === agentId ||
              t.agentId === detailAgent.id ||
              t.agent_id === agentId ||
              t.agent_id === detailAgent.id
          )
          .sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));
        setAgentTeamTasks(agentTaskList);

        // Load comprehensive history from Supabase
        const timeline = [];
        const ids = [agentId, supaId, detailAgent.id].filter(Boolean);

        const [goalsRes, messagesRes, docsRes, reportsRes, deliverablesRes, personaGoalsRes] =
          await Promise.all([
            // Goals where this agent was executor
            supabase
              .from('goals')
              .select('id, title, status, created_at, spent_usd, iteration')
              .in('executor_id', ids)
              .order('created_at', { ascending: false })
              .limit(50),
            // Goal messages sent by this agent
            supabase
              .from('goal_messages')
              .select('id, goal_id, channel, message_type, content, created_at')
              .in('sender_agent_id', ids)
              .order('created_at', { ascending: false })
              .limit(50),
            // Knowledge docs owned by this agent
            supabase
              .from('knowledge_documents')
              .select('id, title, content_type, category, tags, created_at')
              .eq('owner_type', 'agent')
              .in('owner_id', ids)
              .order('created_at', { ascending: false })
              .limit(50),
            // Agent reports
            supabase
              .from('concilium_agent_reports')
              .select('id, report_type, summary, requests_made, tokens_used, cost_usd, created_at')
              .in('agent_id', ids)
              .order('created_at', { ascending: false })
              .limit(50),
            // Deliverables from goals
            supabase
              .from('deliverables')
              .select('id, goal_id, title, type, status, created_at')
              .in('user_id', ids)
              .order('created_at', { ascending: false })
              .limit(50),
            // Recent RLS-scoped goals containing AxWise review hypotheses.
            supabase
              .from('goals')
              .select('id, title, status, data, created_at, updated_at')
              .not('data', 'is', null)
              .order('updated_at', { ascending: false })
              .limit(100),
          ]);
        setAgentPersonaGoals(personaGoalsRes.data || []);

        // Build unified timeline
        for (const g of goalsRes.data || []) {
          timeline.push({
            type: 'goal',
            data: g,
            time: g.created_at,
            label: g.title,
            status: g.status,
          });
        }
        for (const m of messagesRes.data || []) {
          timeline.push({
            type: 'message',
            data: m,
            time: m.created_at,
            label: m.content?.substring(0, 100),
            channel: m.channel,
            messageType: m.message_type,
          });
        }
        for (const d of docsRes.data || []) {
          timeline.push({
            type: 'document',
            data: d,
            time: d.created_at,
            label: d.title,
            contentType: d.content_type,
          });
        }
        for (const r of reportsRes.data || []) {
          timeline.push({
            type: 'report',
            data: r,
            time: r.created_at,
            label: r.summary?.substring(0, 100),
            reportType: r.report_type,
          });
        }
        for (const dl of deliverablesRes.data || []) {
          timeline.push({
            type: 'deliverable',
            data: dl,
            time: dl.created_at,
            label: dl.title,
            deliverableType: dl.type,
            status: dl.status,
          });
        }
        for (const j of matchedJobs) {
          timeline.push({
            type: 'job',
            data: j,
            time: j.createdAt || j.created_at,
            label: j.description || j.title,
            status: j.status,
          });
        }
        for (const t of agentTaskList) {
          timeline.push({
            type: 'task',
            data: t,
            time: t.created_at || t.createdAt,
            label: t.title || t.description,
            status: t.status,
          });
        }

        timeline.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
        setAgentHistory(timeline);
      } catch {
        /* ignore */
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [detailAgent, jobs]);

  // ── Ratings: load when detail agent opens ───────────────────
  useEffect(() => {
    if (!detailAgent) {
      setAgentRatings([]);
      setAgentAvgRating({ average: 0, count: 0 });
      setShowRatingForm(false);
      setRatingForm({ rating: 0, comment: '', ratingType: 'individual', requestId: '' });
      setMyAgentRating(null);
      return;
    }
    (async () => {
      const agentId = detailAgent.agent_id || detailAgent.id;
      const ratings = await getAgentRatings(agentId);
      setAgentRatings(ratings);
      if (ratings.length > 0) {
        const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
        setAgentAvgRating({
          average: Math.round((sum / ratings.length) * 10) / 10,
          count: ratings.length,
        });
      } else {
        setAgentAvgRating({ average: 0, count: 0 });
      }
      try {
        const mine = await getMyRating('agent', agentId);
        setMyAgentRating(mine?.rating ?? null);
      } catch {
        setMyAgentRating(null);
      }
    })();
  }, [detailAgent]);

  const handleQuickAgentRating = useCallback(
    async (stars) => {
      if (!detailAgent || !stars) return;
      const agentId = detailAgent.agent_id || detailAgent.id;
      setMyAgentRatingSubmitting(true);
      const previous = myAgentRating;
      setMyAgentRating(stars); // optimistic
      try {
        const res = await submitRatingNew({ target_type: 'agent', target_id: agentId, stars });
        if (res && typeof res.avg === 'number') {
          setAgentAvgRating({ average: res.avg, count: res.count });
        } else {
          const agg = await getAggregate('agent', agentId);
          setAgentAvgRating({ average: agg?.avg || 0, count: agg?.count || 0 });
        }
        setSnack({ text: `Rated ${stars}/5`, severity: 'success' });
      } catch (err) {
        setMyAgentRating(previous);
        setSnack({ text: err.message || 'Rating failed', severity: 'error' });
      } finally {
        setMyAgentRatingSubmitting(false);
      }
    },
    [detailAgent, myAgentRating]
  );

  // Completed jobs for this agent that haven't been rated yet
  const ratableRequests = useMemo(() => {
    if (!detailAgent) return [];
    const ratedRequestIds = new Set(agentRatings.map((r) => r.request_id).filter(Boolean));
    return agentJobs.filter(
      (j) => j.status === 'completed' && !ratedRequestIds.has(j.sourceRequestId || j.id)
    );
  }, [detailAgent, agentJobs, agentRatings]);

  const handleSubmitRating = useCallback(async () => {
    if (!detailAgent || ratingForm.rating === 0 || !ratingForm.requestId) return;
    setRatingSubmitting(true);
    try {
      const agentId = detailAgent.agent_id || detailAgent.id;
      const result = await submitAgentRating({
        agentId,
        rating: ratingForm.rating,
        comment: ratingForm.comment,
        ratingType: ratingForm.ratingType,
        requestId: ratingForm.requestId,
      });
      if (result) {
        const updated = [result, ...agentRatings];
        setAgentRatings(updated);
        const sum = updated.reduce((acc, r) => acc + r.rating, 0);
        setAgentAvgRating({
          average: Math.round((sum / updated.length) * 10) / 10,
          count: updated.length,
        });
        setRatingForm({ rating: 0, comment: '', ratingType: 'individual', requestId: '' });
        setShowRatingForm(false);
        setSnack({ severity: 'success', message: 'Rating submitted' });
      }
    } catch {
      /* ignore */
    } finally {
      setRatingSubmitting(false);
    }
  }, [detailAgent, ratingForm, agentRatings]);

  const handleDeleteRating = useCallback(
    async (ratingId) => {
      const ok = await deleteAgentRating(ratingId);
      if (ok) {
        const updated = agentRatings.filter((r) => r.id !== ratingId);
        setAgentRatings(updated);
        if (updated.length > 0) {
          const sum = updated.reduce((acc, r) => acc + r.rating, 0);
          setAgentAvgRating({
            average: Math.round((sum / updated.length) * 10) / 10,
            count: updated.length,
          });
        } else {
          setAgentAvgRating({ average: 0, count: 0 });
        }
      }
    },
    [agentRatings]
  );

  // ── Workflow Schema: load blueprint + tools when detail opens ──
  useEffect(() => {
    if (!detailAgent) {
      setDetailTab(0);
      setSchemaForm({ ...DEFAULT_SCHEMA });
      setSchemaOriginal(null);
      setSchemaMessage({ type: '', text: '' });
      setAgentSkills([]);
      return;
    }
    const agentId = detailAgent.id || detailAgent.agent_id;
    loadAgentSkills(agentId);

    // Load Osja feedback-loop config for this agent (from `agents` table)
    (async () => {
      try {
        const { data: osjaRow } = await supabase
          .from('agents')
          .select('osja_regen_threshold, osja_regen_max_attempts, osja_learning_enabled')
          .eq('id', agentId)
          .maybeSingle();
        if (osjaRow) {
          setOsjaConfig({
            osja_regen_threshold: osjaRow.osja_regen_threshold ?? 70,
            osja_regen_max_attempts: osjaRow.osja_regen_max_attempts ?? 1,
            osja_learning_enabled: osjaRow.osja_learning_enabled !== false,
          });
        } else {
          setOsjaConfig({
            osja_regen_threshold: 70,
            osja_regen_max_attempts: 1,
            osja_learning_enabled: true,
          });
        }
      } catch {
        /* non-critical */
      }
    })();

    let cancelled = false;
    (async () => {
      setSchemaLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers = { Authorization: `Bearer ${token}` };

        // Load available tools
        const tlRes = await fetch('/api/concilium?path=agent-tool-whitelist', { headers }).then(
          (r) => r.json()
        );
        if (!cancelled) setSchemaTools(tlRes.tools || []);

        // Load blueprint if agent has one
        const agent = enrichedAgents.find((a) => a.id === detailAgent.id);
        const bpId = agent?.blueprint_id;
        if (bpId) {
          const bpRes = await fetch(`/api/concilium?path=agent-blueprints&id=${bpId}`, {
            headers,
          }).then((r) => r.json());
          if (!cancelled && bpRes.blueprint) {
            const bp = bpRes.blueprint;
            const loaded = {
              id: bp.id,
              workflow_id: bp.workflow_id || null,
              provider: bp.provider || DEFAULT_LLM_PROVIDER,
              model: bp.model || DEFAULT_LLM_MODEL,
              temperature: bp.temperature ?? 0.3,
              max_tokens: bp.max_tokens || 3000,
              system_prompt:
                bp.system_prompt ||
                agent?.system_prompt ||
                PREDEFINED_AGENTS.find((p) => p.role === agent?.role)?.system_prompt ||
                '',
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
          }
        } else {
          const predefined = PREDEFINED_AGENTS.find((p) => p.role === agent?.role);
          const agentPrompt = agent?.system_prompt || predefined?.system_prompt || '';
          setSchemaForm({ ...DEFAULT_SCHEMA, system_prompt: agentPrompt });
          setSchemaOriginal(null);
        }
      } catch {
        // silent - tools/blueprint load failure is non-fatal
      } finally {
        if (!cancelled) setSchemaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailAgent, enrichedAgents]);

  const schemaAvailableModels = useMemo(
    () => SCHEMA_PROVIDERS.find((p) => p.id === schemaForm.provider)?.models || [],
    [schemaForm.provider]
  );

  const schemaCostEst = useMemo(
    () => estimateSchemaConst(schemaForm.model, schemaForm.system_prompt, schemaForm.max_tokens),
    [schemaForm.model, schemaForm.system_prompt, schemaForm.max_tokens]
  );

  const handleSaveSchema = useCallback(
    async (overrides = {}) => {
      if (!detailAgent) return;
      // `overrides` may be a lightweight { provider, model } patch from autoSaveLlm.
      // Guard against being called directly as an onClick handler (event object).
      const ov =
        overrides && typeof overrides === 'object' && !overrides.nativeEvent ? overrides : {};
      setSchemaSaving(true);
      setSchemaMessage({ type: '', text: '' });
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const agent = enrichedAgents.find((a) => a.id === detailAgent.id);
        const bpId = schemaForm.id || agent?.blueprint_id;
        const agentName = agent?.role || 'Agent';

        const bpBody = {
          name: `${agentName} - Workflow Schema`,
          description: `Auto-generated workflow schema for agent ${agent?.agent_id || agent?.id}`,
          category: agent?.category || 'general',
          system_prompt: schemaForm.system_prompt || 'You are a helpful AI agent.',
          provider: ov.provider ?? schemaForm.provider,
          model: ov.model ?? schemaForm.model,
          temperature: schemaForm.temperature,
          max_tokens: schemaForm.max_tokens,
          tools: schemaForm.tools,
          constraints: {
            ...schemaForm.constraints,
            memory_type: schemaForm.memory_type,
            memory_window: schemaForm.memory_window,
          },
        };

        // Save blueprint
        const method = bpId ? 'PUT' : 'POST';
        const url = bpId
          ? `/api/concilium?path=agent-blueprints&id=${bpId}`
          : '/api/concilium?path=agent-blueprints';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(bpBody),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save schema');

        const savedId = data.blueprint?.id;
        // Project the saved LLM (and any new blueprint link) onto the local agent so
        // the card reflects the blueprint immediately, before the next sync.
        if (agent?.id) {
          const agentUpdates = {
            provider: ov.provider ?? schemaForm.provider,
            model: ov.model ?? schemaForm.model,
          };
          if (savedId && savedId !== agent.blueprint_id) agentUpdates.blueprint_id = savedId;
          updateAgent(agent.id, agentUpdates);
          refresh();
        }

        // Auto-create or update visual workflow
        let wfId = data.blueprint?.workflow_id || schemaForm.workflow_id;
        const { nodes, edges } = buildAgentWorkflowNodes(schemaForm, agentName);

        try {
          if (wfId) {
            await updateWfService(wfId, {
              nodes,
              edges,
              category: 'AI Agents',
              updatedByEmail: user?.email || '',
            });
          } else {
            const wf = await createWorkflow({
              name: `${agentName} Workflow`,
              category: 'AI Agents',
              description: `Visual workflow for agent ${agentName}`,
              nodes,
              edges,
              visibility: 'public',
              updatedByEmail: user?.email || '',
            });
            wfId = wf.id;
            // Link workflow to blueprint
            await fetch(`/api/concilium?path=agent-blueprints&id=${savedId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ workflow_id: wfId }),
            });
          }
        } catch {
          // Workflow creation is non-fatal - blueprint was saved successfully
        }

        setSchemaForm((prev) => ({ ...prev, id: savedId, workflow_id: wfId }));
        setSchemaOriginal(JSON.stringify({ ...schemaForm, id: savedId, workflow_id: wfId }));
        setSchemaMessage({
          type: 'success',
          text: 'Workflow schema saved & visual workflow created.',
        });
      } catch (err) {
        setSchemaMessage({ type: 'error', text: err?.message || 'Failed to save schema.' });
      } finally {
        setSchemaSaving(false);
      }
    },
    [detailAgent, schemaForm, enrichedAgents, refresh, user?.email]
  );

  // Auto-save just the LLM provider/model when a dropdown changes. Lightweight:
  // PATCHes only { provider, model } onto the existing blueprint (no visual-workflow
  // regeneration). If the agent has no blueprint yet, fall back to the full save,
  // which creates one (and defaults the system prompt).
  const autoSaveLlm = useCallback(
    async (provider, model) => {
      if (!detailAgent) return;
      const agent = enrichedAgents.find((a) => a.id === detailAgent.id);
      const bpId = schemaForm.id || agent?.blueprint_id;
      if (!bpId) {
        await handleSaveSchema({ provider, model });
        return;
      }
      setSchemaSaving(true);
      setSchemaMessage({ type: '', text: '' });
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch(`/api/concilium?path=agent-blueprints&id=${bpId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ provider, model }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save LLM');
        // Fold the saved values into the dirty-check baseline so the change
        // doesn't linger as "unsaved".
        setSchemaOriginal((prev) => {
          if (!prev) return prev;
          try {
            return JSON.stringify({ ...JSON.parse(prev), provider, model });
          } catch {
            return prev;
          }
        });
        // The blueprint is now updated (source of truth). Nudge the local agent
        // projection so the card reflects it immediately, before the next sync.
        if (agent?.id) updateAgent(agent.id, { provider, model });
        refresh();
        setSchemaMessage({ type: 'success', text: 'LLM saved.' });
      } catch (err) {
        setSchemaMessage({ type: 'error', text: err?.message || 'Failed to save LLM.' });
      } finally {
        setSchemaSaving(false);
      }
    },
    [detailAgent, schemaForm.id, enrichedAgents, handleSaveSchema, refresh]
  );

  // Save Osja feedback-loop config - writes directly to `agents` table.
  const handleSaveOsja = useCallback(async () => {
    const agentId = detailAgent?.id || detailAgent?.agent_id;
    if (!agentId) return;
    setOsjaSaving(true);
    try {
      await supabase
        .from('agents')
        .update({
          osja_regen_threshold: osjaConfig.osja_regen_threshold,
          osja_regen_max_attempts: osjaConfig.osja_regen_max_attempts,
          osja_learning_enabled: osjaConfig.osja_learning_enabled,
        })
        .eq('id', agentId);
    } finally {
      setOsjaSaving(false);
    }
  }, [detailAgent, osjaConfig]);

  return (
    <PageLayout title="Agents" subtitle="Agent orchestration hub" showTitleBlock={false}>
      <BentoCard
        title="Agents"
        explain
        noTour
        pageInfoPath="/agent-hub"
        subtitle={
          showMetrics
            ? `${stats.total} agents · ${stats.active} active · ${dashboard.completedTasks} tasks completed`
            : undefined
        }
        icon={SmartToyOutlinedIcon}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* ── Metrics ─────────────────────────────────────────── */}
        <Collapse in={showMetrics}>
          <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
            <Box
              data-tour-block="agent-metrics"
              data-tour-label="Agent stats"
              sx={{
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(2, minmax(0, 1fr))',
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

        {/* ── Tab Navigation (Injection-style) ─────────────────── */}
        <Box
          data-tour-block="agent-tabs"
          data-tour-label="Sections"
          sx={{
            px: 1.5,
            pt: 1.5,
            pb: 2.75,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                p: 0.5,
                borderRadius: 3,
                width: 'fit-content',
                minWidth: { md: 'auto' },
              }}
            >
              {[
                { id: 'agents', label: 'Agents', icon: SmartToyOutlinedIcon },
                { id: 'teams', label: 'Teams', icon: Diversity3OutlinedIcon },
                { id: 'knowledge', label: 'Knowledge', icon: StorageOutlinedIcon },
                { id: 'skills', label: 'Skills', icon: AutoFixHighOutlinedIcon },
                { id: 'pulse', label: 'Pulse', icon: FiberManualRecordIcon },
                { id: 'prompt-lab', label: 'Prompt Lab', icon: AutoFixHighOutlinedIcon },
                { id: 'my-agents', label: 'My Agents', icon: FavoriteOutlinedIcon },
              ].map((t) => (
                <Button
                  key={t.id}
                  startIcon={<AppIcon fallback={t.icon} sx={{ fontSize: 18 }} />}
                  onClick={() => handleTabChange(t.id)}
                  sx={{
                    borderRadius: 2.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    px: 2,
                    minHeight: 36,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'all 0.2s',
                    bgcolor: tab === t.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    color: tab === t.id ? 'primary.main' : 'text.secondary',
                    boxShadow:
                      tab === t.id ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
                    '&:hover': {
                      bgcolor:
                        tab === t.id
                          ? alpha(theme.palette.primary.main, 0.15)
                          : alpha(theme.palette.text.primary, 0.05),
                      color: tab === t.id ? 'primary.main' : 'text.primary',
                    },
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </Box>
          </Box>
          {tab === 'skills' && (
            <Box
              id="skills-tab-actions-slot"
              sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}
            />
          )}
        </Box>

        {/* ── Agents Tab Content ────────────────────────────────── */}
        {tab === 'agents' && (
          <>
            <OrgFilterBanner name={orgName} onClear={clearOrgFilter} />
            {/* ── Toolbar ─────────────────────────────────────────── */}
            <Box
              data-tour-block="agent-toolbar"
              data-tour-label="Controls"
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
              <Tooltip
                title="Filters: search, category, status, connection type"
                placement="bottom"
                arrow
              >
                <IconButton
                  onClick={(e) => setFilterAnchorEl(e.currentTarget)}
                  sx={{
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: hasActiveFilters ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    position: 'relative',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <AppIcon
                    name="Tune"
                    fallback={TuneIcon}
                    sx={{
                      fontSize: 20,
                      color: hasActiveFilters ? 'primary.main' : 'text.secondary',
                    }}
                  />
                  {hasActiveFilters && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'error.main',
                      }}
                    />
                  )}
                </IconButton>
              </Tooltip>
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, v) => v != null && setViewMode(v)}
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

              <Tooltip title="Manage categories" placement="bottom" arrow>
                <IconButton
                  onClick={(e) => setCategoriesAnchorEl(e.currentTarget)}
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
              <Tooltip title="Add new agent">
                <IconButton
                  onClick={() => setCreateDialogOpen(true)}
                  sx={{
                    bgcolor: 'background.paper',
                    border: '2px solid',
                    borderColor: alpha(theme.palette.primary.main, 0.5),
                    borderRadius: 2,
                    color: 'primary.main',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* ── Filter Popover ──────────────────────────────────── */}
            <Popover
              open={Boolean(filterAnchorEl)}
              anchorEl={filterAnchorEl}
              onClose={() => setFilterAnchorEl(null)}
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
                      Search, category, status, connection type
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
                  placeholder="Search agents..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
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
                  Category
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={categoryFilter}
                    label="Category"
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
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
                      All Categories
                    </MenuItem>
                    {existingCategories.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
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
                  Status
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                    }}
                    label="Status"
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
                      All Statuses
                    </MenuItem>
                    <MenuItem value="available">Active</MenuItem>
                    <MenuItem value="paused">Paused</MenuItem>
                    <MenuItem value="blocked">Blocked</MenuItem>
                    <MenuItem value="busy">Busy</MenuItem>
                    <MenuItem value="offline">Offline</MenuItem>
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
                  Connection Type
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2 }}>
                  <InputLabel>Connection type</InputLabel>
                  <Select
                    value={connectionFilter}
                    onChange={(e) => {
                      setConnectionFilter(e.target.value);
                    }}
                    label="Connection type"
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
                      All Types
                    </MenuItem>
                    {CONNECTION_TYPES.map((t) => (
                      <MenuItem key={t.value} value={t.value}>
                        {t.label}
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
                    mt: 2,
                  }}
                >
                  Long-Term Memory
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2 }}>
                  <InputLabel>Long-term memory</InputLabel>
                  <Select
                    value={memoryFilter}
                    onChange={(e) => {
                      setMemoryFilter(e.target.value);
                    }}
                    label="Long-term memory"
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
                      All Agents
                    </MenuItem>
                    <MenuItem value="On">Memory active</MenuItem>
                    <MenuItem value="Off">Memory deactivated</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Divider />
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(theme.palette.grey[500], 0.08) }}>
                <Button
                  size="small"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('All');
                    setConnectionFilter('All');
                    setCategoryFilter('All');
                    setMemoryFilter('All');
                    setFilterAnchorEl(null);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, color: 'primary.main' }}
                >
                  Reset filters
                </Button>
              </Box>
            </Popover>

            {/* ── Categories Popover ───────────────────────────────── */}
            <Popover
              open={Boolean(categoriesAnchorEl)}
              anchorEl={categoriesAnchorEl}
              onClose={() => {
                setCategoriesAnchorEl(null);
                setEditingCategory(null);
                setNewCategoryName('');
              }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1.5,
                    p: 0,
                    borderRadius: 3,
                    minWidth: 280,
                    maxWidth: 360,
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
                  Categories
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Add here or when creating an agent. Edit or delete from this list.
                </Typography>
              </Box>
              <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <TextField
                    size="small"
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                    sx={{ flex: 1, '& .MuiInputBase-root': { borderRadius: 2 } }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleAddCategory}
                    disabled={!newCategoryName.trim()}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, minWidth: 56 }}
                  >
                    Add
                  </Button>
                </Box>
              </Box>
              <Box sx={{ py: 1, maxHeight: 320, overflowY: 'auto' }}>
                {existingCategories.length === 0 ? (
                  <Typography variant="body2" sx={{ px: 2, py: 2, color: 'text.secondary' }}>
                    No categories yet. Add one above or when creating an agent.
                  </Typography>
                ) : (
                  existingCategories.map((cat) => {
                    const count = agents.filter((a) => (a.category || '').trim() === cat).length;
                    const isEditing = editingCategory === cat;
                    return (
                      <Box
                        key={cat}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 2,
                          py: 1.25,
                          '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.08) },
                        }}
                      >
                        <AppIcon
                          name="LabelOutlined"
                          fallback={LabelOutlinedIcon}
                          sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0 }}
                        />
                        {isEditing ? (
                          <>
                            <TextField
                              size="small"
                              value={editingCategoryValue}
                              onChange={(e) => setEditingCategoryValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter')
                                  handleEditCategory(cat, editingCategoryValue);
                                if (e.key === 'Escape') setEditingCategory(null);
                              }}
                              autoFocus
                              sx={{
                                flex: 1,
                                '& .MuiInputBase-root': { borderRadius: 2, fontSize: '0.875rem' },
                              }}
                            />
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleEditCategory(cat, editingCategoryValue)}
                              aria-label="Save"
                            >
                              <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => setEditingCategory(null)}
                              aria-label="Cancel"
                            >
                              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
                            </IconButton>
                          </>
                        ) : (
                          <>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {cat}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {count} agent{count !== 1 ? 's' : ''}
                              </Typography>
                            </Box>
                            <Tooltip title="Rename category" arrow>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setEditingCategory(cat);
                                  setEditingCategoryValue(cat);
                                }}
                              >
                                <AppIcon
                                  name="EditOutlined"
                                  fallback={EditOutlinedIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove this category from all agents" arrow>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteCategory(cat)}
                              >
                                <AppIcon
                                  name="DeleteOutline"
                                  fallback={DeleteOutlineIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Popover>

            {/* ── Content ──────────────────────────────────────────── */}
            {filtered.length === 0 ? (
              <Box sx={{ p: 4 }}>
                <EmptyState
                  icon={SmartToyOutlinedIcon}
                  title={agents.length === 0 ? 'No agents yet' : 'No agents match your filters'}
                  description={
                    agents.length === 0
                      ? 'Add your first agent to get started.'
                      : 'Try adjusting your search or filters.'
                  }
                  actionLabel={agents.length === 0 ? 'Add Agent' : 'Clear filters'}
                  onAction={
                    agents.length === 0
                      ? () => setAddDialogOpen(true)
                      : () => {
                          setStatusFilter('All');
                          setConnectionFilter('All');
                          setCategoryFilter('All');
                          setMemoryFilter('All');
                          setSearch('');
                        }
                  }
                />
              </Box>
            ) : (
              <>
                {/* ── Card View ──────────────────────────────────── */}
                {viewMode === 'card' && (
                  <>
                    <Box
                      data-tour-block="agent-content"
                      data-tour-label="Your agents"
                      sx={{
                        p: { xs: 1.25, sm: 1.5 },
                        display: 'grid',
                        gridTemplateColumns: cardGridColumns(simpleMode, {
                          xs: '1fr',
                          sm: 'repeat(2, 1fr)',
                          lg: 'repeat(3, 1fr)',
                        }),
                        gap: 1.5,
                      }}
                    >
                      {paged.map((agent) => {
                        const statusInfo =
                          STATUS_MAP[agent.availability_status] || STATUS_MAP.offline;
                        return (
                          <Paper
                            key={agent.id}
                            elevation={0}
                            onClick={() => setDetailAgent(agent)}
                            sx={{
                              p: 1.5,
                              minWidth: 0,
                              borderRadius: 2,
                              border: '1px solid',
                              borderColor: 'divider',
                              bgcolor: theme.palette.background.paper,
                              cursor: 'pointer',
                              transition:
                                'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.2s ease, box-shadow 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                              '&:hover': {
                                borderColor: theme.palette.primary.main,
                                boxShadow: createHoverGlowShadow(theme),
                                transform: 'translateY(-4px)',
                              },
                            }}
                          >
                            {/* Header */}
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                flexWrap: 'wrap',
                                gap: 1.5,
                                rowGap: 1,
                                mb: 1.25,
                              }}
                            >
                              <AgentAvatar
                                profile={{
                                  display_name: agent.name || agent.role,
                                  headshot_path:
                                    (agent.name || agent.role || '')
                                      .toLowerCase()
                                      .replace(/\s+/g, '-')
                                      .replace(/[^a-z0-9-]/g, '') + '.jpg',
                                }}
                                size="large"
                              />
                              <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
                                <Typography
                                  variant="subtitle1"
                                  sx={{ fontWeight: 700, lineHeight: 1.2 }}
                                  noWrap
                                >
                                  {agent.name && agent.name !== agent.role
                                    ? agent.name
                                    : agent.role || agent.agent_id}
                                </Typography>
                                {agent.name && agent.name !== agent.role && (
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: 'text.secondary',
                                      fontSize: '0.7rem',
                                      display: 'block',
                                      lineHeight: 1.2,
                                    }}
                                    noWrap
                                  >
                                    {agent.role}
                                  </Typography>
                                )}
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    minWidth: 0,
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: 'text.disabled',
                                      fontFamily: 'monospace',
                                      fontSize: '0.6rem',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {formatAgentId(agent.agent_id)}
                                  </Typography>
                                  <ImportedFromBadge importedFrom={agent.imported_from} />
                                </Box>
                              </Box>
                              <Stack
                                direction="row"
                                spacing={0.5}
                                useFlexGap
                                alignItems="center"
                                justifyContent="flex-end"
                                sx={{ flexWrap: 'wrap', rowGap: 0.5, minWidth: 0, ml: 'auto' }}
                              >
                                <Tooltip
                                  title={`Provider: ${agent.provider || DEFAULT_LLM_PROVIDER}`}
                                >
                                  <Chip
                                    size="small"
                                    label={agent.model || DEFAULT_LLM_MODEL}
                                    sx={{
                                      fontWeight: 700,
                                      fontSize: '0.6rem',
                                      height: 22,
                                      maxWidth: '100%',
                                      borderRadius: 1.5,
                                      bgcolor: '#1E88E5',
                                      color: '#fff',
                                      '& .MuiChip-label': {
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      },
                                    }}
                                  />
                                </Tooltip>
                                {agent._type === 'created' && (
                                  <Chip
                                    size="small"
                                    label="Created"
                                    sx={{
                                      height: 22,
                                      fontSize: '0.6rem',
                                      fontWeight: 700,
                                      bgcolor: alpha(theme.palette.info.main, 0.12),
                                      color: 'info.main',
                                      borderRadius: 1.5,
                                    }}
                                  />
                                )}
                                {agent.isRegistered &&
                                  (() => {
                                    const sa = systemAgents.find(
                                      (s) =>
                                        s.agentHubId === agent.id ||
                                        (s.name || '').toLowerCase() ===
                                          (agent.role || '').toLowerCase()
                                    );
                                    const roleName = sa
                                      ? roles.find((r) => r.id === sa.roleId)?.name || 'Registered'
                                      : 'Registered';
                                    return (
                                      <Tooltip title={`System role: ${roleName}`}>
                                        <Chip
                                          size="small"
                                          icon={
                                            <AppIcon
                                              name="ShieldOutlined"
                                              fallback={ShieldOutlinedIcon}
                                              sx={{ fontSize: 14 }}
                                            />
                                          }
                                          label={roleName}
                                          color="success"
                                          variant="outlined"
                                          sx={{
                                            height: 22,
                                            fontSize: '0.6rem',
                                            '& .MuiChip-icon': { ml: 0.5 },
                                          }}
                                        />
                                      </Tooltip>
                                    );
                                  })()}
                                {agent.resume && (
                                  <Tooltip title="View Resume">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setResumeDialogAgent(agent);
                                      }}
                                    >
                                      <AppIcon
                                        name="DescriptionOutlined"
                                        fallback={DescriptionOutlinedIcon}
                                        sx={{ fontSize: 16, color: 'primary.main' }}
                                      />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Stack>
                            </Box>
                            {/* Fields */}
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
                                  Category
                                </Typography>
                                <Box
                                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}
                                >
                                  {agent.category ? (
                                    <>
                                      <AppIcon
                                        name="LabelOutlined"
                                        fallback={LabelOutlinedIcon}
                                        sx={{ fontSize: 16, color: 'text.secondary' }}
                                      />
                                      <Typography variant="body2">{agent.category}</Typography>
                                    </>
                                  ) : (
                                    <Typography variant="body2" color="text.disabled">
                                      -
                                    </Typography>
                                  )}
                                </Box>
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
                                  Connection
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 0.25 }}>
                                  {(
                                    agent.provider ||
                                    agent.connection_type ||
                                    DEFAULT_LLM_PROVIDER
                                  ).toUpperCase()}
                                  {agent.connection_id ? ` · ${agent.connection_id}` : ''}
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
                                  Tools
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                                  {agent.toolsUsed.length === 0 ? (
                                    <Typography variant="body2" color="text.disabled">
                                      -
                                    </Typography>
                                  ) : (
                                    agent.toolsUsed
                                      .slice(0, 4)
                                      .map((t, i) => (
                                        <Chip
                                          key={i}
                                          size="small"
                                          label={t}
                                          variant="outlined"
                                          sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
                                        />
                                      ))
                                  )}
                                  {agent.toolsUsed.length > 4 && (
                                    <Chip
                                      size="small"
                                      label={`+${agent.toolsUsed.length - 4}`}
                                      sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
                                    />
                                  )}
                                </Box>
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
                                  Usage
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 0.25 }}>
                                  Tasks: {agent.taskCount} · Success:{' '}
                                  <Box
                                    component="span"
                                    sx={{
                                      color:
                                        agent.successRate >= 80
                                          ? 'success.main'
                                          : agent.successRate >= 50
                                            ? 'warning.main'
                                            : 'error.main',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {agent.successRate}%
                                  </Box>
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
                                  Projects
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                                  {agent.projectsIn.length === 0 ? (
                                    <Typography variant="body2" color="text.disabled">
                                      -
                                    </Typography>
                                  ) : (
                                    agent.projectsIn.slice(0, 3).map((p) => (
                                      <Chip
                                        key={p.id}
                                        size="small"
                                        label={p.title}
                                        variant="outlined"
                                        sx={{
                                          height: 20,
                                          fontSize: '0.65rem',
                                          maxWidth: 100,
                                          borderRadius: 1,
                                        }}
                                      />
                                    ))
                                  )}
                                  {agent.projectsIn.length > 3 && (
                                    <Chip
                                      size="small"
                                      label={`+${agent.projectsIn.length - 3}`}
                                      sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
                                    />
                                  )}
                                </Box>
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
                                  Added By
                                </Typography>
                                {agent.added_by ? (
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 0.5,
                                      mt: 0.25,
                                    }}
                                  >
                                    <AppIcon
                                      name="PersonOutline"
                                      fallback={PersonOutlineIcon}
                                      sx={{ fontSize: 16, color: 'text.secondary' }}
                                    />
                                    <Typography variant="body2">
                                      {agent.added_by.email || 'Manual'}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      sx={{ color: 'text.secondary', ml: 0.5 }}
                                    >
                                      {formatTimestamp(agent.added_by.date)}
                                    </Typography>
                                  </Box>
                                ) : (
                                  <Typography
                                    variant="body2"
                                    color="text.disabled"
                                    sx={{ mt: 0.25 }}
                                  >
                                    -
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </Paper>
                        );
                      })}
                    </Box>
                    <Pagination
                      count={agentsPagination.totalCount}
                      page={agentsPagination.page}
                      rowsPerPage={agentsPagination.rowsPerPage}
                      rowsPerPageOptions={agentsPagination.rowsPerPageOptions}
                      onPageChange={agentsPagination.setPage}
                      onRowsPerPageChange={agentsPagination.setRowsPerPage}
                      onLoadAll={agentsPagination.loadAll}
                      onCollapseAll={agentsPagination.collapseAll}
                      allMode={agentsPagination.allMode}
                      label="agents"
                    />
                  </>
                )}

                {/* ── List View ──────────────────────────────────── */}
                {viewMode === 'list' && (
                  <>
                    <TableContainer
                      data-tour-block="agent-content"
                      data-tour-label="Your agents"
                      sx={{ maxHeight: 'calc(100vh - 320px)' }}
                    >
                      <Table stickyHeader size="small">
                        <TableHead>
                          <TableRow>
                            {COLUMNS.map((col) => (
                              <TableCell
                                key={col.id}
                                align={col.align || 'left'}
                                sx={{
                                  fontWeight: 700,
                                  minWidth: col.minWidth,
                                  whiteSpace: 'nowrap',
                                  fontSize: '0.75rem',
                                }}
                              >
                                {col.sortKey ? (
                                  <TableSortLabel
                                    active={orderBy === col.sortKey}
                                    direction={orderBy === col.sortKey ? order : 'asc'}
                                    onClick={() => handleSort(col.sortKey)}
                                  >
                                    {col.label}
                                  </TableSortLabel>
                                ) : (
                                  col.label
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {paged.map((agent) => {
                            const statusInfo =
                              STATUS_MAP[agent.availability_status] || STATUS_MAP.offline;
                            return (
                              <TableRow
                                key={agent.id}
                                hover
                                sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                                onClick={() => setDetailAgent(agent)}
                              >
                                {/* Agent ID */}
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Tooltip title="Click to copy">
                                    <Chip
                                      size="small"
                                      label={formatAgentId(agent.agent_id)}
                                      onClick={() => handleCopyId(agent.agent_id)}
                                      icon={
                                        <AppIcon
                                          name="ContentCopy"
                                          fallback={ContentCopyIcon}
                                          sx={{ fontSize: 12 }}
                                        />
                                      }
                                      variant="outlined"
                                      sx={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        borderRadius: 1.5,
                                      }}
                                    />
                                  </Tooltip>
                                </TableCell>
                                {/* Agent Name */}
                                <TableCell>
                                  <Stack direction="row" alignItems="center" spacing={1}>
                                    <AgentAvatar
                                      profile={{
                                        display_name: agent.name || agent.role,
                                        headshot_path:
                                          (agent.name || agent.role || '')
                                            .toLowerCase()
                                            .replace(/\s+/g, '-')
                                            .replace(/[^a-z0-9-]/g, '') + '.jpg',
                                      }}
                                      size="small"
                                    />
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, lineHeight: 1.2 }}
                                      >
                                        {agent.name && agent.name !== agent.role
                                          ? agent.name
                                          : agent.role || agent.agent_id}
                                      </Typography>
                                      {agent.name && agent.name !== agent.role && (
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            color: 'text.secondary',
                                            fontSize: '0.65rem',
                                            display: 'block',
                                            lineHeight: 1.2,
                                          }}
                                        >
                                          {agent.role}
                                        </Typography>
                                      )}
                                    </Box>
                                    {agent.isRegistered &&
                                      (() => {
                                        const sa = systemAgents.find(
                                          (s) =>
                                            s.agentHubId === agent.id ||
                                            (s.name || '').toLowerCase() ===
                                              (agent.role || '').toLowerCase()
                                        );
                                        const roleName = sa
                                          ? roles.find((r) => r.id === sa.roleId)?.name ||
                                            'Registered'
                                          : 'Registered';
                                        return (
                                          <Tooltip title={`System role: ${roleName}`}>
                                            <Chip
                                              size="small"
                                              icon={
                                                <AppIcon
                                                  name="ShieldOutlined"
                                                  fallback={ShieldOutlinedIcon}
                                                  sx={{ fontSize: 12 }}
                                                />
                                              }
                                              label={roleName}
                                              color="success"
                                              variant="outlined"
                                              sx={{
                                                height: 18,
                                                fontSize: '0.6rem',
                                                '& .MuiChip-icon': { ml: 0.5 },
                                              }}
                                            />
                                          </Tooltip>
                                        );
                                      })()}
                                  </Stack>
                                </TableCell>
                                {/* Category */}
                                <TableCell align="center">
                                  {agent.category ? (
                                    <Tooltip title={agent.category}>
                                      <Box
                                        sx={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 0.5,
                                        }}
                                      >
                                        <AppIcon
                                          name="LabelOutlined"
                                          fallback={LabelOutlinedIcon}
                                          sx={{ fontSize: 18, color: 'text.secondary' }}
                                        />
                                        <Typography
                                          variant="caption"
                                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                                        >
                                          {agent.category}
                                        </Typography>
                                      </Box>
                                    </Tooltip>
                                  ) : (
                                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                      -
                                    </Typography>
                                  )}
                                </TableCell>
                                {/* Status */}
                                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                  {agent._type === 'created' && (
                                    <Chip
                                      size="small"
                                      label="Created"
                                      sx={{
                                        height: 20,
                                        fontSize: '0.6rem',
                                        fontWeight: 700,
                                        bgcolor: alpha(theme.palette.info.main, 0.12),
                                        color: 'info.main',
                                      }}
                                    />
                                  )}
                                </TableCell>
                                {/* Date Created */}
                                <TableCell>
                                  <Typography
                                    variant="caption"
                                    sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                                  >
                                    {formatTimestamp(agent.created_at)}
                                  </Typography>
                                </TableCell>
                                {/* Last Active */}
                                <TableCell>
                                  <Typography
                                    variant="caption"
                                    sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                                  >
                                    {formatTimestamp(agent.updated_at)}
                                  </Typography>
                                </TableCell>
                                {/* Projects In */}
                                <TableCell>
                                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                    {agent.projectsIn.length === 0 ? (
                                      <Typography variant="caption" color="text.secondary">
                                        -
                                      </Typography>
                                    ) : (
                                      <>
                                        {agent.projectsIn.slice(0, 3).map((p) => (
                                          <Chip
                                            key={p.id}
                                            size="small"
                                            label={p.title}
                                            variant="outlined"
                                            sx={{
                                              height: 20,
                                              fontSize: '0.65rem',
                                              maxWidth: 100,
                                              borderRadius: 1,
                                            }}
                                          />
                                        ))}
                                        {agent.projectsIn.length > 3 && (
                                          <Chip
                                            size="small"
                                            label={`+${agent.projectsIn.length - 3}`}
                                            sx={{
                                              height: 20,
                                              fontSize: '0.65rem',
                                              borderRadius: 1,
                                            }}
                                          />
                                        )}
                                      </>
                                    )}
                                  </Box>
                                </TableCell>
                                {/* Employment (orgs the agent is hired in) */}
                                <TableCell>
                                  {(() => {
                                    const emp = employmentForAgent(agent);
                                    if (emp.length === 0)
                                      return (
                                        <Typography variant="caption" color="text.secondary">
                                          -
                                        </Typography>
                                      );
                                    return (
                                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                        {emp.slice(0, 2).map((e) => (
                                          <Tooltip
                                            key={`${e.org_id}-${e.assigned_at}`}
                                            title={`${e.org_name}${e.consilium_name ? ` · ${e.consilium_name}` : ''} · assigned ${fmtEmploymentDate(e.assigned_at)}`}
                                            arrow
                                          >
                                            <Chip
                                              size="small"
                                              label={e.org_name}
                                              variant="outlined"
                                              sx={{
                                                height: 20,
                                                fontSize: '0.65rem',
                                                maxWidth: 120,
                                                borderRadius: 1,
                                              }}
                                            />
                                          </Tooltip>
                                        ))}
                                        {emp.length > 2 && (
                                          <Chip
                                            size="small"
                                            label={`+${emp.length - 2}`}
                                            sx={{
                                              height: 20,
                                              fontSize: '0.65rem',
                                              borderRadius: 1,
                                            }}
                                          />
                                        )}
                                      </Box>
                                    );
                                  })()}
                                </TableCell>
                                {/* Tools Used */}
                                <TableCell>
                                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                    {agent.toolsUsed.length === 0 ? (
                                      <Typography variant="caption" color="text.secondary">
                                        -
                                      </Typography>
                                    ) : (
                                      <>
                                        {agent.toolsUsed.slice(0, 3).map((t, i) => (
                                          <Chip
                                            key={i}
                                            size="small"
                                            label={t}
                                            variant="outlined"
                                            sx={{
                                              height: 20,
                                              fontSize: '0.65rem',
                                              maxWidth: 100,
                                              borderRadius: 1,
                                            }}
                                          />
                                        ))}
                                        {agent.toolsUsed.length > 3 && (
                                          <Chip
                                            size="small"
                                            label={`+${agent.toolsUsed.length - 3}`}
                                            sx={{
                                              height: 20,
                                              fontSize: '0.65rem',
                                              borderRadius: 1,
                                            }}
                                          />
                                        )}
                                      </>
                                    )}
                                  </Box>
                                </TableCell>
                                {/* Connection Type */}
                                <TableCell align="center">
                                  <Chip
                                    size="small"
                                    label={(
                                      agent.provider ||
                                      agent.connection_type ||
                                      'glm'
                                    ).toUpperCase()}
                                    color="primary"
                                    variant="outlined"
                                    sx={{
                                      fontWeight: 600,
                                      fontSize: '0.65rem',
                                      borderRadius: 1.5,
                                      height: 22,
                                    }}
                                  />
                                </TableCell>
                                {/* Model */}
                                <TableCell align="center">
                                  <Tooltip
                                    title={`Provider: ${agent.provider || DEFAULT_LLM_PROVIDER}${agent.connection_id ? ` · Connection: ${agent.connection_id}` : ''}`}
                                  >
                                    <Chip
                                      size="small"
                                      label={agent.model || DEFAULT_LLM_MODEL}
                                      sx={{
                                        fontWeight: 700,
                                        fontSize: '0.65rem',
                                        borderRadius: 1.5,
                                        height: 22,
                                        bgcolor: '#1E88E5',
                                        color: '#fff',
                                      }}
                                    />
                                  </Tooltip>
                                </TableCell>
                                {/* Usage Metrics */}
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Box
                                    sx={{ cursor: 'pointer', '&:hover': { opacity: 0.7 } }}
                                    onClick={() => navigate(`/agent-hub/${agent.id}/reports`)}
                                  >
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 600, display: 'block' }}
                                    >
                                      Tasks: {agent.taskCount}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontWeight: 600,
                                        color:
                                          agent.successRate >= 80
                                            ? 'success.main'
                                            : agent.successRate >= 50
                                              ? 'warning.main'
                                              : 'error.main',
                                      }}
                                    >
                                      Success: {agent.successRate}%
                                    </Typography>
                                  </Box>
                                </TableCell>
                                {/* Added By */}
                                <TableCell>
                                  {agent.added_by ? (
                                    <Tooltip
                                      title={`Added on ${formatTimestamp(agent.added_by.date)}`}
                                    >
                                      <Box
                                        sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                                      >
                                        <AppIcon
                                          name="PersonOutline"
                                          fallback={PersonOutlineIcon}
                                          sx={{ fontSize: 16, color: 'text.secondary' }}
                                        />
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              fontWeight: 600,
                                              display: 'block',
                                              lineHeight: 1.2,
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                              maxWidth: 120,
                                            }}
                                          >
                                            {agent.added_by.email || 'Manual'}
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              color: 'text.secondary',
                                              fontSize: '0.6rem',
                                              fontFamily: 'monospace',
                                            }}
                                          >
                                            {formatTimestamp(agent.added_by.date)}
                                          </Typography>
                                        </Box>
                                      </Box>
                                    </Tooltip>
                                  ) : (
                                    <Typography variant="caption" color="text.disabled">
                                      -
                                    </Typography>
                                  )}
                                </TableCell>
                                {/* Reports */}
                                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                  <Tooltip title="View reports">
                                    <IconButton
                                      size="small"
                                      onClick={() => navigate(`/agent-hub/${agent.id}/reports`)}
                                      sx={{ color: 'text.secondary' }}
                                    >
                                      <AppIcon
                                        name="AssessmentOutlined"
                                        fallback={AssessmentOutlinedIcon}
                                        sx={{ fontSize: 18 }}
                                      />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                                {/* Actions */}
                                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                  <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                                    <Tooltip title="Edit">
                                      <IconButton size="small" onClick={() => openEdit(agent)}>
                                        <AppIcon
                                          name="EditOutlined"
                                          fallback={EditOutlinedIcon}
                                          sx={{ fontSize: 17 }}
                                        />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Block">
                                      <IconButton
                                        size="small"
                                        onClick={() => {
                                          updateAgent(agent.id, { availability_status: 'blocked' });
                                          refresh();
                                        }}
                                      >
                                        <AppIcon
                                          name="Block"
                                          fallback={BlockIcon}
                                          sx={{ fontSize: 17 }}
                                        />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Remove">
                                      <IconButton
                                        size="small"
                                        onClick={() => setDeleteConfirm(agent)}
                                        color="error"
                                      >
                                        <AppIcon
                                          name="DeleteOutline"
                                          fallback={DeleteOutlineIcon}
                                          sx={{ fontSize: 17 }}
                                        />
                                      </IconButton>
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <Pagination
                      count={agentsPagination.totalCount}
                      page={agentsPagination.page}
                      rowsPerPage={agentsPagination.rowsPerPage}
                      rowsPerPageOptions={agentsPagination.rowsPerPageOptions}
                      onPageChange={agentsPagination.setPage}
                      onRowsPerPageChange={agentsPagination.setRowsPerPage}
                      onLoadAll={agentsPagination.loadAll}
                      onCollapseAll={agentsPagination.collapseAll}
                      allMode={agentsPagination.allMode}
                      label="agents"
                    />
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Teams Tab Content ──────────────────────────────────── */}
        {tab === 'teams' && (
          <>
            <OrgFilterBanner name={orgName} onClear={clearOrgFilter} />
            <TeamsTab
              teams={orgTeamIds ? teams.filter((t) => orgTeamIds.has(t.id)) : teams}
              addTeam={addTeam}
              editTeam={editTeam}
              removeTeam={removeTeam}
              jobs={jobs}
              user={user}
              theme={theme}
              isDark={isDark}
              openActivityLog={openActivityLog}
            />
          </>
        )}

        {/* ── Agent Reports Tab Content ───────────────────────────── */}
        {tab === 'reports' && <AgentReportsTab />}

        {/* ── Agent Builder Tab Content ──────────────────────────── */}
        {tab === 'builder' && <AgentBuilderTab />}

        {/* ── Knowledge Base Tab Content ──────────────────────────── */}
        {tab === 'knowledge' && <KnowledgeBase embedded showMetrics={showMetrics} />}

        {/* ── Skills Marketplace Tab Content ────────────────────────── */}
        {tab === 'skills' && <SkillsMarketplaceTab />}

        {/* ── My Agents Tab Content ──────────────────────────────── */}
        {tab === 'my-agents' && (
          <MyAgentsTab
            embedded
            showMetrics={showMetrics}
            openActivityLog={openActivityLog}
            onAgentClick={(myAgent) => {
              // Find matching hub agent by ID or role to open detail popup
              const match = agents.find(
                (a) =>
                  a.id === myAgent.agentId ||
                  a.agent_id === myAgent.agentId ||
                  a._supabase_id === myAgent.supabaseId ||
                  (a.role && a.role.toLowerCase() === (myAgent.role || '').toLowerCase())
              );
              if (match) setDetailAgent(match);
            }}
          />
        )}

        {/* ── Pulse Tab Content (embedded) ───────────────────────── */}
        {tab === 'pulse' && (
          <Box>
            <Suspense
              fallback={
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={28} />
                </Box>
              }
            >
              <PulsePage embedded showMetrics={showMetrics} />
            </Suspense>
          </Box>
        )}

        {/* ── Prompt Lab Tab Content (embedded) ──────────────────── */}
        {tab === 'prompt-lab' && (
          <Box>
            <Suspense
              fallback={
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={28} />
                </Box>
              }
            >
              <PromptLabPage embedded showMetrics={showMetrics} />
            </Suspense>
          </Box>
        )}
      </BentoCard>
      {/* ── Agent Detail Popup ────────────────────────────────── */}
      <Dialog
        open={!!detailAgent}
        onClose={() => setDetailAgent(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, border: '1px solid', borderColor: 'divider' } }}
      >
        {detailData &&
          (() => {
            const statusInfo = STATUS_MAP[detailData.availability_status] || STATUS_MAP.offline;
            return (
              <>
                <DialogTitle
                  sx={{
                    fontWeight: 700,
                    fontSize: '1.15rem',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    py: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      flexShrink: 0,
                    }}
                  >
                    <AgentAvatar
                      profile={{
                        display_name: detailData.name || detailData.role,
                        headshot_path:
                          (detailData.name || detailData.role || '')
                            .toLowerCase()
                            .replace(/\s+/g, '-')
                            .replace(/[^a-z0-9-]/g, '') + '.jpg',
                      }}
                      size="medium"
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {detailData.name || detailData.role || detailData.agent_id}
                      </Typography>
                      <Tooltip
                        title={
                          myAgentRating
                            ? `Your rating: ${myAgentRating}/5 - click to change`
                            : 'Click to rate'
                        }
                      >
                        <span>
                          <Rating
                            value={myAgentRating ?? agentAvgRating.average}
                            precision={myAgentRating ? 1 : 0.1}
                            size="small"
                            disabled={myAgentRatingSubmitting}
                            onChange={(_e, val) => {
                              if (val) handleQuickAgentRating(val);
                            }}
                          />
                        </span>
                      </Tooltip>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 600, whiteSpace: 'nowrap' }}
                      >
                        {agentAvgRating.average > 0 ? `${agentAvgRating.average}/5` : ''}
                        {agentAvgRating.count > 0 ? ` (${agentAvgRating.count})` : ''}
                      </Typography>
                    </Box>
                    {detailData.name && detailData.name !== detailData.role && (
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 500 }}
                      >
                        {detailData.role}
                      </Typography>
                    )}
                  </Box>
                  {detailData.isRegistered &&
                    (() => {
                      const sa = systemAgents.find(
                        (s) =>
                          s.agentHubId === detailData.id ||
                          (s.name || '').toLowerCase() === (detailData.role || '').toLowerCase()
                      );
                      const roleName = sa
                        ? roles.find((r) => r.id === sa.roleId)?.name || 'Registered'
                        : 'Registered';
                      return (
                        <Tooltip title={`System role: ${roleName}`}>
                          <Chip
                            size="small"
                            icon={
                              <AppIcon
                                name="ShieldOutlined"
                                fallback={ShieldOutlinedIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            label={roleName}
                            color="success"
                            variant="outlined"
                            sx={{ height: 22, fontSize: '0.68rem', '& .MuiChip-icon': { ml: 0.5 } }}
                          />
                        </Tooltip>
                      );
                    })()}
                  <Tooltip
                    title={
                      isAgentMemoryEnabled(detailAgent?.metadata)
                        ? 'Long-Term Memory · Active'
                        : 'Long-Term Memory · Deactivated'
                    }
                  >
                    <IconButton
                      size="small"
                      onClick={() => setAgentMemoryOpen(true)}
                      sx={{
                        border: '1px solid',
                        borderColor: isAgentMemoryEnabled(detailAgent?.metadata)
                          ? 'success.main'
                          : 'divider',
                        borderRadius: 2,
                        position: 'relative',
                      }}
                    >
                      <AppIcon
                        name="MenuBookOutlined"
                        fallback={MenuBookOutlinedIcon}
                        sx={{
                          fontSize: 16,
                          color: isAgentMemoryEnabled(detailAgent?.metadata)
                            ? 'success.main'
                            : 'inherit',
                        }}
                      />
                      {isAgentMemoryEnabled(detailAgent?.metadata) && (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: 'success.main',
                            border: '1px solid',
                            borderColor: 'background.paper',
                          }}
                        />
                      )}
                    </IconButton>
                  </Tooltip>
                  <IconButton onClick={() => setDetailAgent(null)} size="small">
                    <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
                  </IconButton>
                </DialogTitle>
                <Tabs
                  value={detailTab}
                  onChange={(_, v) => {
                    setDetailTab(v);
                    setSchemaMessage({ type: '', text: '' });
                  }}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  sx={{
                    px: { xs: 0.5, sm: 2.5 },
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    minHeight: 36,
                    '& .MuiTab-root': {
                      minHeight: 36,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: { xs: '0.7rem', sm: '0.82rem' },
                      px: { xs: 1, sm: 1.5 },
                      minWidth: 'auto',
                    },
                    '& .MuiTabs-scrollButtons': { width: 28 },
                  }}
                >
                  <Tab
                    label="Profile"
                    icon={
                      <AppIcon
                        name="PersonPinOutlined"
                        fallback={PersonPinOutlinedIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    iconPosition="start"
                  />
                  <Tab
                    label="Core"
                    icon={
                      <AppIcon
                        name="PsychologyOutlined"
                        fallback={PsychologyOutlinedIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    iconPosition="start"
                  />
                  <Tab
                    label="Activity"
                    icon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 14 }} />}
                    iconPosition="start"
                  />
                  <Tab
                    label="Chat"
                    icon={
                      <AppIcon
                        name="ChatBubbleOutline"
                        fallback={ChatBubbleOutlineIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    iconPosition="start"
                  />
                  <Tab
                    label="Employment"
                    icon={
                      <AppIcon
                        name="WorkOutline"
                        fallback={WorkOutlineIcon}
                        sx={{ fontSize: 14 }}
                      />
                    }
                    iconPosition="start"
                  />
                </Tabs>
                <DialogContent sx={{ p: 0, height: 560, overflowY: 'auto' }}>
                  {detailTab === 0 && (
                    <>
                      {agentExecutionPersonas.length > 0 && (
                        <Box sx={{ px: 2.5, pt: 2 }}>
                          <Typography
                            variant="overline"
                            sx={{
                              fontWeight: 700,
                              color: 'text.secondary',
                              letterSpacing: '0.08em',
                            }}
                          >
                            AxWise goal personas and hypotheses
                          </Typography>
                          <Stack spacing={1.25} sx={{ mt: 0.75 }}>
                            {agentExecutionPersonas.map((item) => (
                              <Paper
                                key={
                                  item.overlayKey ||
                                  `${item.goalId}:${item.agentId}:${item.executionRole}`
                                }
                                variant="outlined"
                                sx={{
                                  p: 1.5,
                                  borderRadius: 2,
                                  borderColor: alpha(theme.palette.primary.main, 0.35),
                                  bgcolor: alpha(theme.palette.primary.main, 0.035),
                                }}
                              >
                                <Stack
                                  direction={{ xs: 'column', sm: 'row' }}
                                  spacing={1}
                                  justifyContent="space-between"
                                >
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                      {personaReadableValue(item.executionPersona.role)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {personaReadableValue(item.goalTitle)}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ display: 'block' }}
                                    >
                                      Agent:{' '}
                                      {personaReadableValue(item.agentName || item.agentId) ||
                                        'Not assigned'}{' '}
                                      · Role:{' '}
                                      {personaReadableValue(
                                        item.executionRole || item.executionPersona.role
                                      )}
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                    {personaConfidencePercent(item.assignment.score) != null && (
                                      <Chip
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                        label={`${personaConfidencePercent(item.assignment.score)}% ${item.authoritative ? 'fit' : 'suggested fit'}`}
                                      />
                                    )}
                                    {item.authoritative && item.assignment.score == null && (
                                      <Chip
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                        label="AxWise assigned · approved"
                                      />
                                    )}
                                    {!item.authoritative && (
                                      <Chip
                                        size="small"
                                        color="warning"
                                        label="Review required · not executable"
                                      />
                                    )}
                                    {personaConfidencePercent(item.customerPersona.confidence) !=
                                      null && (
                                      <Chip
                                        size="small"
                                        variant="outlined"
                                        label={`${personaConfidencePercent(item.customerPersona.confidence)}% context clarity`}
                                      />
                                    )}
                                    <Chip
                                      size="small"
                                      color={
                                        item.customerPersona.trust?.verified ? 'success' : 'warning'
                                      }
                                      variant="outlined"
                                      label={
                                        item.customerPersona.trust?.verified
                                          ? `${item.customerPersona.trust.verified_evidence_count || 0} evidence integrity checks`
                                          : 'Unverified hypothesis'
                                      }
                                    />
                                  </Stack>
                                </Stack>
                                <Divider sx={{ my: 1.25 }} />
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  Customer:{' '}
                                  {personaReadableValue(item.customerPersona.name) ||
                                    'Research-selected customer persona'}
                                </Typography>
                                {(item.customerPersona.decision_role ||
                                  item.customerPersona.selection_eligibility) && (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: 'block' }}
                                  >
                                    Customer role:{' '}
                                    {personaReadableValue(
                                      item.customerPersona.decision_role || 'not classified'
                                    )}
                                    {item.customerPersona.selection_eligibility
                                      ? ` · ${personaReadableValue(item.customerPersona.selection_eligibility)}`
                                      : ''}
                                  </Typography>
                                )}
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                  Communication:{' '}
                                  {personaReadableValue(
                                    item.executionPersona.communication_style
                                  ) || 'Evidence-grounded'}
                                </Typography>
                                {item.executionPersona.mission && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Mission: {personaReadableValue(item.executionPersona.mission)}
                                  </Typography>
                                )}
                                {item.executionPersona.relevant_experience && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Experience:{' '}
                                    {personaReadableValue(
                                      item.executionPersona.relevant_experience
                                    )}
                                  </Typography>
                                )}
                                {personaValueList(item.executionPersona.domain_knowledge).length >
                                  0 && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Domain knowledge:{' '}
                                    {personaValueList(item.executionPersona.domain_knowledge).join(
                                      '; '
                                    )}
                                  </Typography>
                                )}
                                {item.customerPersona.profile?.problem && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Problem scope:{' '}
                                    {personaReadableValue(item.customerPersona.profile.problem)}
                                  </Typography>
                                )}
                                {item.customerPersona.profile?.desired_outcome && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Desired outcome:{' '}
                                    {personaReadableValue(
                                      item.customerPersona.profile.desired_outcome
                                    )}
                                  </Typography>
                                )}
                                {(item.customerPersona.background ||
                                  item.customerPersona.profile?.background) && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Customer background:{' '}
                                    {personaReadableValue(
                                      item.customerPersona.background ||
                                        item.customerPersona.profile.background
                                    )}
                                  </Typography>
                                )}
                                {personaRecordSummary(
                                  item.customerPersona.demographic_details ||
                                    item.customerPersona.profile?.demographic_details ||
                                    item.customerPersona.demographics ||
                                    item.customerPersona.profile?.demographics
                                ) && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Demographics:{' '}
                                    {personaRecordSummary(
                                      item.customerPersona.demographic_details ||
                                        item.customerPersona.profile?.demographic_details ||
                                        item.customerPersona.demographics ||
                                        item.customerPersona.profile?.demographics
                                    )}
                                  </Typography>
                                )}
                                {personaValueList(
                                  item.customerPersona.pain_points ||
                                    item.customerPersona.profile?.pain_points ||
                                    item.customerPersona.pains ||
                                    item.customerPersona.profile?.pains
                                ).length > 0 && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Pain points:{' '}
                                    {personaValueList(
                                      item.customerPersona.pain_points ||
                                        item.customerPersona.profile?.pain_points ||
                                        item.customerPersona.pains ||
                                        item.customerPersona.profile?.pains
                                    ).join('; ')}
                                  </Typography>
                                )}
                                {personaValueList(
                                  item.customerPersona.goals_and_motivations ||
                                    item.customerPersona.profile?.goals_and_motivations ||
                                    item.customerPersona.goals ||
                                    item.customerPersona.profile?.goals
                                ).length > 0 && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Goals & motivations:{' '}
                                    {personaValueList(
                                      item.customerPersona.goals_and_motivations ||
                                        item.customerPersona.profile?.goals_and_motivations ||
                                        item.customerPersona.goals ||
                                        item.customerPersona.profile?.goals
                                    ).join('; ')}
                                  </Typography>
                                )}
                                {personaValueList(
                                  item.customerPersona.triggers ||
                                    item.customerPersona.profile?.triggers ||
                                    item.customerPersona.buying_triggers ||
                                    item.customerPersona.profile?.buying_triggers
                                ).length > 0 && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Triggers:{' '}
                                    {personaValueList(
                                      item.customerPersona.triggers ||
                                        item.customerPersona.profile?.triggers ||
                                        item.customerPersona.buying_triggers ||
                                        item.customerPersona.profile?.buying_triggers
                                    ).join('; ')}
                                  </Typography>
                                )}
                                {personaValueList(
                                  item.executionPersona.output_contract?.expected_outputs ||
                                    item.executionPersona.scope?.success_criteria
                                ).length > 0 && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Success:{' '}
                                    {personaValueList(
                                      item.executionPersona.output_contract?.expected_outputs ||
                                        item.executionPersona.scope?.success_criteria
                                    ).join('; ')}
                                  </Typography>
                                )}
                                {personaValueList(item.executionPersona.required_capabilities)
                                  .length > 0 && (
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    flexWrap="wrap"
                                    useFlexGap
                                    sx={{ mt: 1 }}
                                  >
                                    {personaValueList(item.executionPersona.required_capabilities)
                                      .slice(0, 8)
                                      .map((capability) => (
                                        <Chip key={capability} size="small" label={capability} />
                                      ))}
                                  </Stack>
                                )}
                                {personaValueList(item.executionPersona.capabilities).length >
                                  0 && (
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    flexWrap="wrap"
                                    useFlexGap
                                    sx={{ mt: 1 }}
                                  >
                                    {personaValueList(item.executionPersona.capabilities)
                                      .slice(0, 8)
                                      .map((capability) => (
                                        <Chip key={capability} size="small" label={capability} />
                                      ))}
                                  </Stack>
                                )}
                                {personaValueList(item.executionPersona.methods).length > 0 && (
                                  <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                      Methods
                                    </Typography>
                                    {personaValueList(item.executionPersona.methods)
                                      .slice(0, 5)
                                      .map((method) => (
                                        <Typography
                                          key={method}
                                          variant="caption"
                                          color="text.secondary"
                                          sx={{ display: 'block' }}
                                        >
                                          • {method}
                                        </Typography>
                                      ))}
                                  </Box>
                                )}
                                {personaValueList(item.executionPersona.operating_principles)
                                  .length > 0 && (
                                  <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                      Operating principles
                                    </Typography>
                                    {personaValueList(item.executionPersona.operating_principles)
                                      .slice(0, 5)
                                      .map((principle) => (
                                        <Typography
                                          key={principle}
                                          variant="caption"
                                          color="text.secondary"
                                          sx={{ display: 'block' }}
                                        >
                                          • {principle}
                                        </Typography>
                                      ))}
                                  </Box>
                                )}
                                {personaValueList(item.customerPersona.trust?.limitations).length >
                                  0 && (
                                  <Typography
                                    variant="caption"
                                    color="warning.main"
                                    sx={{ display: 'block', mt: 1 }}
                                  >
                                    Limitation:{' '}
                                    {personaValueList(item.customerPersona.trust.limitations).join(
                                      ' '
                                    )}
                                  </Typography>
                                )}
                                {personaBoundaryList(
                                  item.executionPersona.boundaries ||
                                    item.executionPersona.limitations
                                ).length > 0 && (
                                  <Typography
                                    variant="caption"
                                    color="warning.main"
                                    sx={{ display: 'block', mt: 1 }}
                                  >
                                    Executor boundaries:{' '}
                                    {personaBoundaryList(
                                      item.executionPersona.boundaries ||
                                        item.executionPersona.limitations
                                    ).join(' ')}
                                  </Typography>
                                )}
                                <Typography
                                  variant="caption"
                                  sx={{ display: 'block', mt: 1, color: 'text.disabled' }}
                                >
                                  {item.authoritative
                                    ? 'Authorized goal-scoped overlay'
                                    : 'Synthetic working hypothesis only · cannot assign or execute'}
                                  {' · permanent Agent Hub identity unchanged'}
                                </Typography>
                              </Paper>
                            ))}
                          </Stack>
                        </Box>
                      )}
                      {/* Profile Content - bio, about, contact, actions */}
                      {detailProfileLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                          <CircularProgress size={28} />
                        </Box>
                      ) : detailProfile ? (
                        <Box sx={{ px: 2.5, py: 2 }}>
                          {/* Bio */}
                          {detailProfile.bio && (
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                borderRadius: 2,
                                mb: 2,
                                mx: 2.5,
                                bgcolor: alpha(theme.palette.primary.main, 0.03),
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  fontStyle: 'italic',
                                  color: 'text.secondary',
                                  lineHeight: 1.5,
                                }}
                              >
                                &ldquo;{detailProfile.bio}&rdquo;
                              </Typography>
                            </Paper>
                          )}

                          {/* About & Contact */}
                          <Box
                            sx={{
                              px: 2.5,
                              display: 'grid',
                              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                              gap: 2,
                              mb: 2,
                            }}
                          >
                            <Box>
                              <Typography
                                variant="overline"
                                sx={{
                                  color: 'text.secondary',
                                  fontWeight: 700,
                                  fontSize: '0.7rem',
                                }}
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
                                  <Typography
                                    variant="body2"
                                    sx={{ fontSize: '0.8rem', fontWeight: 500 }}
                                  >
                                    {detailProfile.job_title}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography
                                    variant="caption"
                                    sx={{ color: 'text.disabled', fontWeight: 600 }}
                                  >
                                    Organization
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontSize: '0.8rem', fontWeight: 500 }}
                                  >
                                    {detailProfile.organization}
                                  </Typography>
                                </Box>
                                {detailProfile.location && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography
                                      variant="caption"
                                      sx={{ color: 'text.disabled', fontWeight: 600 }}
                                    >
                                      Location
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{ fontSize: '0.8rem', fontWeight: 500 }}
                                    >
                                      {detailProfile.location}
                                      {detailProfile.timezone ? ` (${detailProfile.timezone})` : ''}
                                    </Typography>
                                  </Box>
                                )}
                                {detailProfile.age && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography
                                      variant="caption"
                                      sx={{ color: 'text.disabled', fontWeight: 600 }}
                                    >
                                      Age
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{ fontSize: '0.8rem', fontWeight: 500 }}
                                    >
                                      {detailProfile.age}
                                      {detailProfile.pronouns ? ` · ${detailProfile.pronouns}` : ''}
                                    </Typography>
                                  </Box>
                                )}
                              </Stack>
                            </Box>
                            <Box>
                              <Typography
                                variant="overline"
                                sx={{
                                  color: 'text.secondary',
                                  fontWeight: 700,
                                  fontSize: '0.7rem',
                                }}
                              >
                                Contact
                              </Typography>
                              <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                                {detailProfile.email && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AppIcon
                                      name="EmailOutlined"
                                      fallback={EmailOutlinedIcon}
                                      sx={{ fontSize: 14, color: 'text.disabled' }}
                                    />
                                    <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                                      {detailProfile.email}
                                    </Typography>
                                  </Box>
                                )}
                                {detailProfile.phone && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AppIcon
                                      name="PhoneOutlined"
                                      fallback={PhoneOutlinedIcon}
                                      sx={{ fontSize: 14, color: 'text.disabled' }}
                                    />
                                    <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                                      {detailProfile.phone}
                                    </Typography>
                                  </Box>
                                )}
                                {detailProfile.linkedin_url && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AppIcon
                                      name="LinkedIn"
                                      fallback={LinkedInIcon}
                                      sx={{ fontSize: 14, color: 'text.disabled' }}
                                    />
                                    <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                                      {detailProfile.linkedin_url}
                                    </Typography>
                                  </Box>
                                )}
                              </Stack>
                            </Box>
                          </Box>

                          {/* Action Buttons */}
                          <Box sx={{ display: 'flex', gap: 1, mb: 2, px: 2.5 }}>
                            <Button
                              variant="contained"
                              startIcon={
                                <AppIcon
                                  name="ChatBubbleOutline"
                                  fallback={ChatBubbleOutlineIcon}
                                  sx={{ fontSize: 16 }}
                                />
                              }
                              onClick={() => setDetailTab(3)}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 600,
                                flex: 1,
                                borderRadius: 2,
                              }}
                            >
                              {isMobile ? 'Chat' : 'Chat Now'}
                            </Button>
                            <Button
                              variant="outlined"
                              startIcon={
                                <AppIcon
                                  name="GroupAddOutlined"
                                  fallback={GroupAddOutlinedIcon}
                                  sx={{ fontSize: 16 }}
                                />
                              }
                              onClick={() =>
                                setSnack({
                                  text: `${detailData?.name || 'Agent'} added to your team`,
                                  severity: 'success',
                                })
                              }
                              sx={{
                                textTransform: 'none',
                                fontWeight: 600,
                                flex: 1,
                                borderRadius: 2,
                              }}
                            >
                              {isMobile ? 'Hire' : 'Hire Agent'}
                            </Button>
                          </Box>

                          {/* Communication Style */}
                          {detailProfile.communication_tone &&
                            Object.keys(detailProfile.communication_tone).length > 0 && (
                              <Box sx={{ px: 2.5, mb: 2 }}>
                                <Typography
                                  variant="overline"
                                  sx={{
                                    color: 'text.secondary',
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                  }}
                                >
                                  Communication Style
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                                  {Object.entries(detailProfile.communication_tone).map(
                                    ([key, val]) => (
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
                                    )
                                  )}
                                </Box>
                              </Box>
                            )}

                          {/* Quick Stats */}
                          <Box
                            sx={{
                              px: 2.5,
                              mb: 2,
                              display: 'grid',
                              gap: 1.25,
                              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                            }}
                          >
                            {[
                              {
                                label: 'Tasks',
                                value: detailData.taskCount,
                                color: theme.palette.primary.main,
                              },
                              {
                                label: 'Completed',
                                value: detailData.completedTasks,
                                color: theme.palette.success.main,
                              },
                              {
                                label: 'Success Rate',
                                value: `${detailData.successRate}%`,
                                color:
                                  detailData.successRate >= 80
                                    ? theme.palette.success.main
                                    : detailData.successRate >= 50
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
                              costUsd={Number(detailData.cost_per_task || 0)}
                              tokens={detailData.tokensPerTask ?? 0}
                              metricMeta={detailData.llmMetricMeta}
                              color={theme.palette.info.main}
                            />
                          </Box>

                          {/* Accordions */}
                          <Box sx={{ px: 2.5 }}>
                            {detailProfile.backstory && (
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
                                  expandIcon={
                                    <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
                                  }
                                  sx={{
                                    minHeight: 36,
                                    '& .MuiAccordionSummary-content': { my: 0.5 },
                                  }}
                                >
                                  <Typography
                                    variant="overline"
                                    sx={{
                                      fontWeight: 700,
                                      fontSize: '0.7rem',
                                      color: 'text.secondary',
                                    }}
                                  >
                                    Backstory
                                  </Typography>
                                </AccordionSummary>
                                <AccordionDetails sx={{ pt: 0 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      color: 'text.secondary',
                                      lineHeight: 1.6,
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    {detailProfile.backstory}
                                  </Typography>
                                </AccordionDetails>
                              </Accordion>
                            )}
                            {Array.isArray(detailProfile.message_templates) &&
                              detailProfile.message_templates.length > 0 && (
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
                                    expandIcon={
                                      <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
                                    }
                                    sx={{
                                      minHeight: 36,
                                      '& .MuiAccordionSummary-content': { my: 0.5 },
                                    }}
                                  >
                                    <Typography
                                      variant="overline"
                                      sx={{
                                        fontWeight: 700,
                                        fontSize: '0.7rem',
                                        color: 'text.secondary',
                                      }}
                                    >
                                      Message Templates ({detailProfile.message_templates.length})
                                    </Typography>
                                  </AccordionSummary>
                                  <AccordionDetails sx={{ pt: 0 }}>
                                    <Stack spacing={1}>
                                      {detailProfile.message_templates.map((tpl, i) => (
                                        <Paper
                                          key={i}
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
                            {detailProfile.behavior_rules &&
                              Object.keys(detailProfile.behavior_rules).length > 0 && (
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
                                    expandIcon={
                                      <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
                                    }
                                    sx={{
                                      minHeight: 36,
                                      '& .MuiAccordionSummary-content': { my: 0.5 },
                                    }}
                                  >
                                    <Typography
                                      variant="overline"
                                      sx={{
                                        fontWeight: 700,
                                        fontSize: '0.7rem',
                                        color: 'text.secondary',
                                      }}
                                    >
                                      Behavior Rules
                                    </Typography>
                                  </AccordionSummary>
                                  <AccordionDetails sx={{ pt: 0 }}>
                                    <Stack spacing={1}>
                                      {detailProfile.behavior_rules.reply_delay_min_sec != null && (
                                        <Box>
                                          <Typography
                                            variant="caption"
                                            sx={{ color: 'text.disabled', fontWeight: 600 }}
                                          >
                                            Reply Delay
                                          </Typography>
                                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                            {detailProfile.behavior_rules.reply_delay_min_sec}s –{' '}
                                            {detailProfile.behavior_rules.reply_delay_max_sec}s
                                          </Typography>
                                        </Box>
                                      )}
                                      {Array.isArray(
                                        detailProfile.behavior_rules.escalation_rules
                                      ) &&
                                        detailProfile.behavior_rules.escalation_rules.length >
                                          0 && (
                                          <Box>
                                            <Typography
                                              variant="caption"
                                              sx={{ color: 'text.disabled', fontWeight: 600 }}
                                            >
                                              Escalates
                                            </Typography>
                                            <Box
                                              sx={{
                                                display: 'flex',
                                                gap: 0.5,
                                                flexWrap: 'wrap',
                                                mt: 0.25,
                                              }}
                                            >
                                              {detailProfile.behavior_rules.escalation_rules.map(
                                                (r) => (
                                                  <Chip
                                                    key={r}
                                                    size="small"
                                                    label={r}
                                                    color="warning"
                                                    variant="outlined"
                                                    sx={{ fontSize: '0.62rem', height: 20 }}
                                                  />
                                                )
                                              )}
                                            </Box>
                                          </Box>
                                        )}
                                      {Array.isArray(
                                        detailProfile.behavior_rules.topics_to_avoid
                                      ) &&
                                        detailProfile.behavior_rules.topics_to_avoid.length > 0 && (
                                          <Box>
                                            <Typography
                                              variant="caption"
                                              sx={{ color: 'text.disabled', fontWeight: 600 }}
                                            >
                                              Avoids
                                            </Typography>
                                            <Box
                                              sx={{
                                                display: 'flex',
                                                gap: 0.5,
                                                flexWrap: 'wrap',
                                                mt: 0.25,
                                              }}
                                            >
                                              {detailProfile.behavior_rules.topics_to_avoid.map(
                                                (t) => (
                                                  <Chip
                                                    key={t}
                                                    size="small"
                                                    label={t}
                                                    color="error"
                                                    variant="outlined"
                                                    sx={{ fontSize: '0.62rem', height: 20 }}
                                                  />
                                                )
                                              )}
                                            </Box>
                                          </Box>
                                        )}
                                    </Stack>
                                  </AccordionDetails>
                                </Accordion>
                              )}
                            {/* Special Details - collapsed agent metadata */}
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
                                sx={{
                                  minHeight: 36,
                                  '& .MuiAccordionSummary-content': { my: 0.5 },
                                }}
                              >
                                <Typography
                                  variant="overline"
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    color: 'text.secondary',
                                  }}
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
                                      {detailData?.category || '-'}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                      Connection
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                      {(
                                        detailData?.provider ||
                                        detailData?.connection_type ||
                                        'glm'
                                      ).toUpperCase()}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                      Model
                                    </Typography>
                                    <Tooltip
                                      title={`Provider: ${detailData?.provider || detailData?.connection_type || DEFAULT_LLM_PROVIDER}`}
                                    >
                                      <Chip
                                        size="small"
                                        label={detailData?.model || DEFAULT_LLM_MODEL}
                                        sx={{
                                          fontWeight: 700,
                                          fontSize: '0.65rem',
                                          height: 22,
                                          bgcolor: '#1E88E5',
                                          color: '#fff',
                                          borderRadius: 1.5,
                                        }}
                                      />
                                    </Tooltip>
                                  </Box>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                      Created
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
                                    >
                                      {formatTimestamp(detailData?.created_at)}
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
                                      {formatTimestamp(detailData?.updated_at)}
                                    </Typography>
                                  </Box>
                                  {detailData?.added_by && (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                        Added By
                                      </Typography>
                                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                        {detailData.added_by.email || 'System'}
                                      </Typography>
                                    </Box>
                                  )}
                                </Stack>
                              </AccordionDetails>
                            </Accordion>
                          </Box>
                        </Box>
                      ) : (
                        <Box sx={{ textAlign: 'center', py: 4, px: 2.5 }}>
                          <Typography variant="body2" color="text.disabled">
                            No profile configured for this agent yet.
                          </Typography>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={handleGenerateProfile}
                            disabled={generatingProfile}
                            sx={{ mt: 2, textTransform: 'none', borderRadius: 2 }}
                          >
                            {generatingProfile ? 'Generating...' : 'Generate profile'}
                          </Button>
                        </Box>
                      )}

                      {/* Ratings & Reviews */}
                      <Divider />
                      <Box sx={{ px: 2.5, py: 2 }}>
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

                        {/* Rating Form */}
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
                                        {j.description || j.title || j.id} - completed
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
                                    ratingForm.rating === 0 ||
                                    !ratingForm.requestId ||
                                    ratingSubmitting
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

                        {/* Recent Reviews */}
                        {agentRatings.length > 0 && (
                          <Stack spacing={1}>
                            {agentRatings.slice(0, 5).map((r) => (
                              <Paper
                                key={r.id}
                                variant="outlined"
                                sx={{ p: 1.25, borderRadius: 1.5 }}
                              >
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
                                      {r.created_at
                                        ? new Date(r.created_at).toLocaleDateString()
                                        : '-'}
                                    </Typography>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDeleteRating(r.id)}
                                      sx={{ ml: 0.5, p: 0.25 }}
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
                            {agentRatings.length > 5 && (
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.secondary', textAlign: 'center' }}
                              >
                                +{agentRatings.length - 5} more reviews
                              </Typography>
                            )}
                          </Stack>
                        )}
                      </Box>

                      {/* KPI Records */}
                      {detailKpis.length > 0 && (
                        <>
                          <Divider />
                          <Box sx={{ px: 2.5, py: 2 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 700,
                                mb: 1.5,
                                textTransform: 'uppercase',
                                fontSize: '0.7rem',
                                letterSpacing: '0.04em',
                                color: 'text.secondary',
                              }}
                            >
                              KPI Records
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {detailKpis.slice(0, 8).map((k) => (
                                <Paper
                                  key={k.id}
                                  variant="outlined"
                                  sx={{
                                    p: 1,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    minWidth: 80,
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: 'text.secondary',
                                      fontWeight: 600,
                                      fontSize: '0.65rem',
                                    }}
                                  >
                                    {k.kpi_name}
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {k.kpi_value}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
                                  >
                                    {k.period_key}
                                  </Typography>
                                </Paper>
                              ))}
                              {detailKpis.length > 8 && (
                                <Paper
                                  variant="outlined"
                                  sx={{
                                    p: 1,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: 60,
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 600, color: 'text.secondary' }}
                                  >
                                    +{detailKpis.length - 8} more
                                  </Typography>
                                </Paper>
                              )}
                            </Box>
                          </Box>
                        </>
                      )}
                    </>
                  )}

                  {/* ── Workflow Schema Tab ─────────────────────────── */}
                  {detailTab === 1 && (
                    <Box sx={{ px: 2.5, py: 2 }}>
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
                                    const models =
                                      SCHEMA_PROVIDERS.find((p) => p.id === prov)?.models || [];
                                    const nextModel = models[0] || '';
                                    setSchemaForm((f) => ({
                                      ...f,
                                      provider: prov,
                                      model: nextModel,
                                    }));
                                    autoSaveLlm(prov, nextModel);
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
                                  onChange={(e) => {
                                    const nextModel = e.target.value;
                                    setSchemaForm((f) => ({ ...f, model: nextModel }));
                                    autoSaveLlm(schemaForm.provider, nextModel);
                                  }}
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
                                  onChange={(_, v) =>
                                    setSchemaForm((f) => ({ ...f, temperature: v }))
                                  }
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
                                  onChange={(_, v) =>
                                    setSchemaForm((f) => ({ ...f, max_tokens: v }))
                                  }
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
                                '& .MuiInputBase-input': {
                                  fontFamily: 'monospace',
                                  fontSize: '0.82rem',
                                },
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
                                        <Typography
                                          variant="caption"
                                          sx={{ color: 'text.secondary' }}
                                        >
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
                                No tools available. Seed tools from the Agent Builder tab.
                              </Typography>
                            ) : (
                              <>
                                {/* Domain Tools - page name + read/write badge */}
                                {(() => {
                                  const domainTools = schemaTools.filter(
                                    (t) => t.category === 'domain'
                                  );
                                  if (domainTools.length === 0) return null;
                                  return (
                                    <Box sx={{ mb: 1.5 }}>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 700,
                                          textTransform: 'uppercase',
                                          color: 'text.secondary',
                                          letterSpacing: '0.04em',
                                          mb: 0.75,
                                          display: 'block',
                                        }}
                                      >
                                        Domain Tools
                                      </Typography>
                                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                        {domainTools.map((t) => {
                                          const isSelected = schemaForm.tools.some(
                                            (st) => st === t.tool_id || st?.tool_id === t.tool_id
                                          );
                                          const [pagePart, permPart] = t.tool_id.split(':');
                                          const pageName =
                                            pagePart.charAt(0).toUpperCase() +
                                            pagePart.slice(1).replace(/-/g, ' ');
                                          const permColor =
                                            permPart === 'write' || permPart === 'submit'
                                              ? 'warning'
                                              : 'info';
                                          return (
                                            <Chip
                                              key={t.tool_id}
                                              size="small"
                                              label={
                                                <Box
                                                  sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 0.4,
                                                  }}
                                                >
                                                  <span style={{ fontSize: '0.72rem' }}>
                                                    {pageName}
                                                  </span>
                                                  <Box
                                                    component="span"
                                                    sx={{
                                                      fontSize: '0.58rem',
                                                      fontWeight: 700,
                                                      px: 0.5,
                                                      py: 0.1,
                                                      borderRadius: 0.75,
                                                      bgcolor: isSelected
                                                        ? alpha(theme.palette[permColor].main, 0.25)
                                                        : alpha(
                                                            theme.palette[permColor].main,
                                                            0.12
                                                          ),
                                                      color: theme.palette[permColor].main,
                                                      lineHeight: 1.4,
                                                    }}
                                                  >
                                                    {permPart}
                                                  </Box>
                                                </Box>
                                              }
                                              variant={isSelected ? 'filled' : 'outlined'}
                                              color={isSelected ? 'success' : 'default'}
                                              onClick={() => {
                                                setSchemaForm((f) => {
                                                  const current = f.tools || [];
                                                  const has = current.some(
                                                    (st) =>
                                                      st === t.tool_id || st?.tool_id === t.tool_id
                                                  );
                                                  return {
                                                    ...f,
                                                    tools: has
                                                      ? current.filter(
                                                          (st) =>
                                                            st !== t.tool_id &&
                                                            st?.tool_id !== t.tool_id
                                                        )
                                                      : [...current, t.tool_id],
                                                  };
                                                });
                                              }}
                                              sx={{
                                                cursor: 'pointer',
                                                borderRadius: 1.5,
                                                height: 26,
                                              }}
                                            />
                                          );
                                        })}
                                      </Box>
                                    </Box>
                                  );
                                })()}

                                {/* Tools - filtered by agent role relevance */}
                                {(() => {
                                  const agent = enrichedAgents.find(
                                    (a) => a.id === detailAgent?.id
                                  );
                                  const roleText = [
                                    agent?.role || '',
                                    agent?.category || '',
                                    ...(agent?.capabilities || []),
                                    agent?.system_prompt?.slice(0, 300) || '',
                                  ]
                                    .join(' ')
                                    .toLowerCase();

                                  const scoreTool = (t) => {
                                    const haystack =
                                      `${t.name} ${t.description || ''} ${t.connectionType || ''}`.toLowerCase();
                                    const words = roleText.split(/\W+/).filter((w) => w.length > 3);
                                    return words.reduce(
                                      (score, word) => score + (haystack.includes(word) ? 1 : 0),
                                      0
                                    );
                                  };

                                  const relevantTools = userTools
                                    .filter((t) => t.status !== 'blocked')
                                    .map((t) => ({ ...t, _score: scoreTool(t) }))
                                    .filter(
                                      (t) =>
                                        t._score > 0 || schemaForm.tools.includes(`tool:${t.id}`)
                                    )
                                    .sort((a, b) => b._score - a._score);

                                  // Always also show already-selected tools even if score=0
                                  const alreadySelected = userTools.filter(
                                    (t) =>
                                      t.status !== 'blocked' &&
                                      schemaForm.tools.includes(`tool:${t.id}`) &&
                                      !relevantTools.find((r) => r.id === t.id)
                                  );

                                  const finalTools = [...relevantTools, ...alreadySelected];

                                  if (finalTools.length === 0) return null;
                                  return (
                                    <Box sx={{ mb: 1.5 }}>
                                      <Box
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 1,
                                          mb: 0.75,
                                        }}
                                      >
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            color: 'text.secondary',
                                            letterSpacing: '0.04em',
                                          }}
                                        >
                                          Tools
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          sx={{ color: 'text.disabled', fontSize: '0.6rem' }}
                                        >
                                          {finalTools.length} relevant to this role
                                        </Typography>
                                      </Box>
                                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                        {finalTools.map((t) => {
                                          const toolKey = `tool:${t.id}`;
                                          const isSelected = schemaForm.tools.includes(toolKey);
                                          return (
                                            <Chip
                                              key={t.id}
                                              size="small"
                                              label={t.name}
                                              variant={isSelected ? 'filled' : 'outlined'}
                                              color={isSelected ? 'success' : 'default'}
                                              onClick={() => {
                                                setSchemaForm((f) => {
                                                  const current = f.tools || [];
                                                  const has = current.includes(toolKey);
                                                  return {
                                                    ...f,
                                                    tools: has
                                                      ? current.filter((st) => st !== toolKey)
                                                      : [...current, toolKey],
                                                  };
                                                });
                                              }}
                                              sx={{
                                                cursor: 'pointer',
                                                fontSize: '0.72rem',
                                                borderRadius: 1.5,
                                              }}
                                            />
                                          );
                                        })}
                                      </Box>
                                    </Box>
                                  );
                                })()}
                              </>
                            )}
                          </Paper>

                          {/* Section 4.5: Skills & Instructions */}
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 2,
                              borderRadius: 2,
                              borderLeft: '4px solid',
                              borderLeftColor: 'secondary.main',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                              <AppIcon
                                name="AutoFixHighOutlined"
                                fallback={AutoFixHighOutlinedIcon}
                                sx={{ fontSize: 20, color: 'secondary.main' }}
                              />
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                Skills & Instructions
                              </Typography>
                              <Box sx={{ flex: 1 }} />
                              <Chip
                                size="small"
                                label={`${agentSkills.filter((s) => s.is_active).length} active`}
                                color="secondary"
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 22 }}
                              />
                            </Box>
                            {skillsLoading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                <CircularProgress size={20} />
                              </Box>
                            ) : agentSkills.length === 0 ? (
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                No skills installed. Add skills to enhance this agent's
                                capabilities.
                              </Typography>
                            ) : (
                              <Stack spacing={0.75} sx={{ mb: 1 }}>
                                {agentSkills.map((inst) => {
                                  const sk = inst.agent_skill_packs || {};
                                  return (
                                    <Paper
                                      key={inst.id}
                                      variant="outlined"
                                      sx={{
                                        p: 1,
                                        borderRadius: 1.5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        opacity: inst.is_active ? 1 : 0.5,
                                        borderColor: inst.is_active
                                          ? 'divider'
                                          : alpha(theme.palette.divider, 0.3),
                                      }}
                                    >
                                      <AppIcon
                                        name="AutoFixHighOutlined"
                                        fallback={AutoFixHighOutlinedIcon}
                                        sx={{ fontSize: 16, color: 'secondary.main' }}
                                      />
                                      <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                          variant="body2"
                                          sx={{ fontWeight: 600, fontSize: '0.78rem' }}
                                          noWrap
                                        >
                                          {sk.name || 'Skill'}
                                          {inst.custom_content && (
                                            <Chip
                                              label="customized"
                                              size="small"
                                              sx={{
                                                ml: 0.5,
                                                fontSize: '0.55rem',
                                                height: 16,
                                                bgcolor: alpha(theme.palette.warning.main, 0.1),
                                                color: 'warning.main',
                                              }}
                                            />
                                          )}
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          sx={{ color: 'text.disabled' }}
                                        >
                                          {sk.category}
                                        </Typography>
                                      </Box>
                                      <Tooltip title={inst.is_active ? 'Disable' : 'Enable'}>
                                        <IconButton
                                          size="small"
                                          onClick={() =>
                                            handleToggleSkill(inst.skill_id, !inst.is_active)
                                          }
                                        >
                                          {inst.is_active ? (
                                            <AppIcon
                                              name="ToggleOnOutlined"
                                              fallback={ToggleOnOutlinedIcon}
                                              sx={{ fontSize: 20, color: 'success.main' }}
                                            />
                                          ) : (
                                            <AppIcon
                                              name="ToggleOffOutlined"
                                              fallback={ToggleOffOutlinedIcon}
                                              sx={{ fontSize: 20, color: 'text.disabled' }}
                                            />
                                          )}
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Edit content">
                                        <IconButton
                                          size="small"
                                          onClick={() => setSkillEditorOpen(inst)}
                                        >
                                          <AppIcon
                                            name="EditOutlined"
                                            fallback={EditOutlinedIcon}
                                            sx={{ fontSize: 15 }}
                                          />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Remove">
                                        <IconButton
                                          size="small"
                                          onClick={() => handleUninstallSkill(inst.skill_id)}
                                          sx={{ color: 'error.main' }}
                                        >
                                          <AppIcon
                                            name="DeleteOutline"
                                            fallback={DeleteOutlineIcon}
                                            sx={{ fontSize: 15 }}
                                          />
                                        </IconButton>
                                      </Tooltip>
                                    </Paper>
                                  );
                                })}
                              </Stack>
                            )}
                            <Button
                              size="small"
                              variant="outlined"
                              color="secondary"
                              startIcon={
                                <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 14 }} />
                              }
                              onClick={() => setSkillInstallerOpen(true)}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: 1.5,
                                fontSize: '0.75rem',
                              }}
                            >
                              Add Skill
                            </Button>

                            {/* Recommended for this role ───────────────────── */}
                            {(() => {
                              const agentRole = detailAgent?.name || detailAgent?.role || '';
                              const installedIds = new Set(agentSkills.map((s) => s.skill_id));
                              const recommended = allBundledSkills
                                .filter((s) => !installedIds.has(s.id))
                                .filter((s) => {
                                  const roles = s.compatible_roles || [];
                                  if (!roles.length) return true;
                                  if (roles.includes('all')) return true;
                                  return roles.some(
                                    (r) =>
                                      r &&
                                      agentRole &&
                                      String(r).toLowerCase() === String(agentRole).toLowerCase()
                                  );
                                })
                                .slice(0, 3);
                              if (recommended.length === 0) return null;
                              return (
                                <Box
                                  sx={{
                                    mt: 2,
                                    pt: 2,
                                    borderTop: '1px dashed',
                                    borderColor: 'divider',
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontWeight: 700,
                                      color: 'text.secondary',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.06em',
                                      fontSize: '0.65rem',
                                    }}
                                  >
                                    Recommended for {agentRole || 'this role'}
                                  </Typography>
                                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                                    {recommended.map((skill) => (
                                      <Paper
                                        key={skill.id}
                                        variant="outlined"
                                        sx={{
                                          p: 1,
                                          borderRadius: 1.5,
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 1,
                                        }}
                                      >
                                        <AppIcon
                                          name="AutoFixHighOutlined"
                                          fallback={AutoFixHighOutlinedIcon}
                                          sx={{ fontSize: 16, color: 'primary.main' }}
                                        />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                          <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600, fontSize: '0.78rem' }}
                                            noWrap
                                          >
                                            {skill.name}
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            sx={{ color: 'text.disabled', fontSize: '0.68rem' }}
                                            noWrap
                                          >
                                            {skill.description}
                                          </Typography>
                                        </Box>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          color="primary"
                                          disabled={installingSkillId === skill.id}
                                          onClick={async () => {
                                            const agentId =
                                              detailAgent?.id || detailAgent?.agent_id;
                                            if (!agentId) return;
                                            setInstallingSkillId(skill.id);
                                            try {
                                              await installSkill(agentId, skill.id);
                                              await loadAgentSkills(agentId);
                                              setSnack({
                                                text: `Installed "${skill.name}"`,
                                                severity: 'success',
                                              });
                                            } catch (err) {
                                              setSnack({ text: err.message, severity: 'error' });
                                            } finally {
                                              setInstallingSkillId(null);
                                            }
                                          }}
                                          sx={{
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            borderRadius: 1.5,
                                            fontSize: '0.68rem',
                                            minWidth: 62,
                                          }}
                                        >
                                          {installingSkillId === skill.id ? '…' : 'Install'}
                                        </Button>
                                      </Paper>
                                    ))}
                                  </Stack>
                                </Box>
                              );
                            })()}
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
                                  startAdornment: (
                                    <InputAdornment position="start">$</InputAdornment>
                                  ),
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

                          {/* Section 6: Quality & Learning (Osja feedback loop) */}
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 2,
                              borderRadius: 2,
                              borderLeft: '4px solid',
                              borderLeftColor: 'secondary.main',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <AppIcon
                                name="PsychologyOutlined"
                                fallback={PsychologyOutlinedIcon}
                                sx={{ fontSize: 20, color: 'secondary.main' }}
                              />
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                Quality & Learning
                              </Typography>
                            </Box>
                            <Typography
                              variant="body2"
                              sx={{
                                color: 'text.secondary',
                                display: 'block',
                                mb: 0.75,
                                fontSize: '0.8rem',
                              }}
                            >
                              After every goal completes, <strong>Osja</strong> (the General
                              Manager) scores each deliverable against the Library Universe and
                              emits an <em>Upgrade / Keep</em> verdict. These controls decide what
                              happens with her critique - whether this agent regenerates low-scoring
                              work automatically, and whether her lessons get saved so the agent
                              improves over time.
                            </Typography>
                            <Box
                              sx={{
                                bgcolor: alpha(theme.palette.secondary.main, 0.06),
                                borderRadius: 1.5,
                                p: 1,
                                mb: 2,
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  display: 'block',
                                  fontSize: '0.7rem',
                                  lineHeight: 1.5,
                                }}
                              >
                                <strong>Osja&apos;s score tiers:</strong> 95–100 library-grade ·
                                85–94 strong · 70–84 competent · &lt;70 needs work. A hard cap of{' '}
                                <strong>3 regens per goal</strong> applies regardless of settings.
                              </Typography>
                            </Box>
                            <Stack spacing={2.5}>
                              {/* Threshold */}
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                                  Auto-regen threshold
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    display: 'block',
                                    mb: 1,
                                    fontSize: '0.72rem',
                                  }}
                                >
                                  If Osja scores a deliverable below this number, the agent
                                  automatically runs it again with her critique injected into the
                                  prompt. Lower = more tolerant (cheaper). Higher = stricter (higher
                                  quality ceiling, more LLM cost).
                                </Typography>
                                <TextField
                                  size="small"
                                  type="number"
                                  label="Score below"
                                  value={osjaConfig.osja_regen_threshold}
                                  onChange={(e) => {
                                    const v = Math.max(
                                      0,
                                      Math.min(100, Number(e.target.value) || 0)
                                    );
                                    setOsjaConfig((p) => ({ ...p, osja_regen_threshold: v }));
                                  }}
                                  sx={{ width: 200 }}
                                  inputProps={{ min: 0, max: 100, step: 5 }}
                                  helperText="Default 70 - regen anything Osja calls 'needs work'"
                                />
                              </Box>

                              {/* Max attempts */}
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                                  Max regen attempts per deliverable
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.secondary',
                                    display: 'block',
                                    mb: 1,
                                    fontSize: '0.72rem',
                                  }}
                                >
                                  How many times a single low-scoring deliverable may be
                                  regenerated. Each attempt is one extra LLM call, so the cost
                                  roughly doubles per retry. Set to{' '}
                                  <strong>0 to fully disable auto-regen</strong> for this agent
                                  (you&apos;ll still get scoring and verdicts, just no automatic
                                  retries).
                                </Typography>
                                <FormControl size="small" sx={{ width: 200 }}>
                                  <InputLabel>Attempts</InputLabel>
                                  <Select
                                    label="Attempts"
                                    value={osjaConfig.osja_regen_max_attempts}
                                    onChange={(e) =>
                                      setOsjaConfig((p) => ({
                                        ...p,
                                        osja_regen_max_attempts: Number(e.target.value),
                                      }))
                                    }
                                  >
                                    <MenuItem value={0}>0 - Off (no auto-regen)</MenuItem>
                                    <MenuItem value={1}>1× - try once (default)</MenuItem>
                                    <MenuItem value={2}>2× - up to two retries</MenuItem>
                                    <MenuItem value={3}>3× - up to three retries</MenuItem>
                                  </Select>
                                </FormControl>
                              </Box>

                              {/* Learning toggle */}
                              <Box>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: 2,
                                  }}
                                >
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                                      Osja lesson capture
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: 'text.secondary',
                                        display: 'block',
                                        fontSize: '0.72rem',
                                      }}
                                    >
                                      When Osja says &ldquo;upgrade&rdquo;, save her critique as a
                                      permanent lesson attached to this agent. On future goals, the
                                      5 most recent lessons are spliced into the agent&apos;s system
                                      prompt so it avoids repeating the same gaps.{' '}
                                      <strong>Turn this off</strong> if you&apos;d rather re-tune
                                      the prompt manually and keep Osja&apos;s verdicts advisory.
                                    </Typography>
                                  </Box>
                                  <ToggleButtonGroup
                                    size="small"
                                    exclusive
                                    value={osjaConfig.osja_learning_enabled ? 'on' : 'off'}
                                    onChange={(_, v) =>
                                      v &&
                                      setOsjaConfig((p) => ({
                                        ...p,
                                        osja_learning_enabled: v === 'on',
                                      }))
                                    }
                                    sx={{ flexShrink: 0 }}
                                  >
                                    <ToggleButton
                                      value="off"
                                      sx={{ textTransform: 'none', px: 1.5 }}
                                    >
                                      Off
                                    </ToggleButton>
                                    <ToggleButton
                                      value="on"
                                      sx={{ textTransform: 'none', px: 1.5 }}
                                    >
                                      On
                                    </ToggleButton>
                                  </ToggleButtonGroup>
                                </Box>
                              </Box>

                              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="secondary"
                                  onClick={handleSaveOsja}
                                  disabled={osjaSaving}
                                  sx={{
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    borderRadius: 2,
                                    minWidth: 140,
                                  }}
                                >
                                  {osjaSaving ? 'Saving...' : 'Save Quality Config'}
                                </Button>
                              </Box>
                            </Stack>
                          </Paper>

                          {/* Connected Libraries (MCP/Composio bindings, per-agent) */}
                          <ConnectedLibrariesSection
                            agentId={
                              detailAgent._supabase_id || detailAgent.agent_id || detailAgent.id
                            }
                          />

                          {/* Save bar */}
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
                            {schemaForm.workflow_id && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="info"
                                startIcon={
                                  <AppIcon
                                    name="OpenInNew"
                                    fallback={OpenInNewIcon}
                                    sx={{ fontSize: 16 }}
                                  />
                                }
                                onClick={() => {
                                  setDetailAgent(null);
                                  navigate('/workflow');
                                }}
                                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                              >
                                Open in Editor
                              </Button>
                            )}
                            {schemaOriginal && JSON.stringify(schemaForm) !== schemaOriginal && (
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={
                                  <AppIcon
                                    name="Restore"
                                    fallback={RestoreIcon}
                                    sx={{ fontSize: 16 }}
                                  />
                                }
                                onClick={() => {
                                  setSchemaForm(JSON.parse(schemaOriginal));
                                  setSchemaMessage({ type: '', text: '' });
                                }}
                                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                              >
                                Discard Changes
                              </Button>
                            )}
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
                              onClick={() => handleSaveSchema()}
                              disabled={schemaSaving}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                borderRadius: 2,
                                minWidth: 120,
                              }}
                            >
                              {schemaSaving ? 'Saving...' : 'Save Schema'}
                            </Button>
                          </Stack>
                        </Stack>
                      )}
                    </Box>
                  )}

                  {/* ── History Tab ────────────────────────────── */}
                  {/* ── Resume Tab ────────────────────────────── */}
                  {detailTab === 2 && (
                    <Box sx={{ px: 2.5, py: 2 }}>
                      {/* Filter buttons */}
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={historyFilter}
                        onChange={(_, v) => v && setHistoryFilter(v)}
                        sx={{
                          mb: 2,
                          display: 'flex',
                          '& .MuiToggleButton-root': {
                            fontSize: '0.7rem',
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 1.5,
                            py: 0.5,
                            flex: 1,
                          },
                        }}
                      >
                        <ToggleButton value="all">All</ToggleButton>
                        <ToggleButton value="goals">Goal Actions</ToggleButton>
                        <ToggleButton value="communication">Communication</ToggleButton>
                        <ToggleButton value="time">Timeline</ToggleButton>
                      </ToggleButtonGroup>

                      {historyLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                          <CircularProgress size={28} />
                        </Box>
                      ) : agentHistory.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 6 }}>
                          <AppIcon
                            name="Timeline"
                            fallback={TimelineIcon}
                            sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
                          />
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                            No Activity Yet
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Assign this agent to a goal or task to start building history.
                          </Typography>
                        </Box>
                      ) : (
                        <>
                          {/* ── GOAL ACTIONS VIEW ─────────────────────────────── */}
                          {historyFilter === 'goals' &&
                            (() => {
                              const goalEntries = agentHistory.filter((e) => e.type === 'goal');
                              if (goalEntries.length === 0)
                                return (
                                  <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <Typography variant="body2" color="text.disabled">
                                      No goal actions yet.
                                    </Typography>
                                  </Box>
                                );
                              return (
                                <Stack spacing={1.5}>
                                  {goalEntries.map((entry) => {
                                    const g = entry.data;
                                    // Find related items for this goal
                                    const relatedMsgs = agentHistory.filter(
                                      (e) => e.type === 'message' && e.data?.goal_id === g.id
                                    );
                                    const relatedTasks = agentHistory.filter(
                                      (e) => e.type === 'task' && e.data?.goal_id === g.id
                                    );
                                    const relatedDocs = agentHistory.filter(
                                      (e) => e.type === 'document'
                                    );
                                    const relatedReports = agentHistory.filter(
                                      (e) => e.type === 'report'
                                    );
                                    const relatedOutputs = agentHistory.filter(
                                      (e) => e.type === 'deliverable' && e.data?.goal_id === g.id
                                    );
                                    const statusColor =
                                      g.status === 'completed'
                                        ? 'success'
                                        : g.status === 'failed'
                                          ? 'error'
                                          : g.status === 'active'
                                            ? 'primary'
                                            : 'default';
                                    return (
                                      <Paper
                                        key={g.id}
                                        variant="outlined"
                                        sx={{ p: 1.5, borderRadius: 2 }}
                                      >
                                        <Box
                                          sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            mb: 0.75,
                                          }}
                                        >
                                          <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                              {g.title}
                                            </Typography>
                                            <Typography
                                              variant="caption"
                                              sx={{
                                                color: 'text.disabled',
                                                fontFamily: 'monospace',
                                                fontSize: '0.6rem',
                                              }}
                                            >
                                              {g.id?.substring(0, 8)}
                                            </Typography>
                                          </Box>
                                          <Chip
                                            size="small"
                                            label={g.status}
                                            color={statusColor}
                                            variant="outlined"
                                            sx={{ fontSize: '0.6rem', height: 20, fontWeight: 700 }}
                                          />
                                        </Box>
                                        <Typography
                                          variant="caption"
                                          sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
                                        >
                                          {g.created_at
                                            ? new Date(g.created_at).toLocaleString()
                                            : '-'}
                                          {g.spent_usd > 0
                                            ? ` · $${Number(g.spent_usd).toFixed(4)}`
                                            : ''}
                                          {g.iteration ? ` · Iteration ${g.iteration}` : ''}
                                        </Typography>
                                        {/* Related items summary */}
                                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                                          {relatedTasks.length > 0 && (
                                            <Chip
                                              size="small"
                                              label={`${relatedTasks.length} tasks`}
                                              sx={{
                                                fontSize: '0.58rem',
                                                height: 18,
                                                bgcolor: alpha(theme.palette.secondary.main, 0.1),
                                              }}
                                            />
                                          )}
                                          {relatedMsgs.length > 0 && (
                                            <Chip
                                              size="small"
                                              label={`${relatedMsgs.length} messages`}
                                              sx={{
                                                fontSize: '0.58rem',
                                                height: 18,
                                                bgcolor: alpha(theme.palette.success.main, 0.1),
                                              }}
                                            />
                                          )}
                                          {relatedDocs.length > 0 && (
                                            <Chip
                                              size="small"
                                              label={`${relatedDocs.length} docs`}
                                              sx={{
                                                fontSize: '0.58rem',
                                                height: 18,
                                                bgcolor: alpha(theme.palette.warning.main, 0.1),
                                              }}
                                            />
                                          )}
                                          {relatedReports.length > 0 && (
                                            <Chip
                                              size="small"
                                              label={`${relatedReports.length} reports`}
                                              sx={{
                                                fontSize: '0.58rem',
                                                height: 18,
                                                bgcolor: alpha(theme.palette.info.main, 0.1),
                                              }}
                                            />
                                          )}
                                          {relatedOutputs.length > 0 && (
                                            <Chip
                                              size="small"
                                              label={`${relatedOutputs.length} outputs`}
                                              sx={{
                                                fontSize: '0.58rem',
                                                height: 18,
                                                bgcolor: alpha(theme.palette.success.main, 0.1),
                                              }}
                                            />
                                          )}
                                        </Box>
                                      </Paper>
                                    );
                                  })}
                                </Stack>
                              );
                            })()}

                          {/* ── COMMUNICATION HISTORY VIEW ────────────────────── */}
                          {historyFilter === 'communication' &&
                            (() => {
                              const msgs = agentHistory.filter((e) => e.type === 'message');
                              if (msgs.length === 0)
                                return (
                                  <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <Typography variant="body2" color="text.disabled">
                                      No communication history yet.
                                    </Typography>
                                  </Box>
                                );
                              // Group by channel
                              const channels = {
                                'team-room': [],
                                'lead-consilium': [],
                                'agent-lead': [],
                                system: [],
                              };
                              for (const m of msgs) {
                                const ch = m.channel || m.data?.channel || 'system';
                                if (!channels[ch]) channels[ch] = [];
                                channels[ch].push(m);
                              }
                              const channelLabels = {
                                'team-room': 'Team Room',
                                'lead-consilium': 'Lead Consilium',
                                'agent-lead': 'Agent Lead',
                                system: 'System',
                              };
                              const channelColors = {
                                'team-room': 'primary',
                                'lead-consilium': 'warning',
                                'agent-lead': 'info',
                                system: 'default',
                              };
                              return (
                                <Stack spacing={2}>
                                  {Object.entries(channels)
                                    .filter(([, items]) => items.length > 0)
                                    .map(([channel, items]) => (
                                      <Box key={channel}>
                                        <Box
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            mb: 1,
                                          }}
                                        >
                                          <Chip
                                            size="small"
                                            label={channelLabels[channel] || channel}
                                            color={channelColors[channel] || 'default'}
                                            sx={{
                                              fontWeight: 700,
                                              fontSize: '0.68rem',
                                              borderRadius: 1.5,
                                            }}
                                          />
                                          <Typography
                                            variant="caption"
                                            sx={{ color: 'text.disabled' }}
                                          >
                                            ({items.length})
                                          </Typography>
                                        </Box>
                                        <Stack spacing={0.75}>
                                          {items.map((m, i) => (
                                            <Paper
                                              key={m.data?.id || i}
                                              variant="outlined"
                                              sx={{
                                                p: 1.25,
                                                borderRadius: 1.5,
                                                borderLeft: '3px solid',
                                                borderLeftColor: `${channelColors[channel] || 'grey'}.main`,
                                              }}
                                            >
                                              <Box
                                                sx={{
                                                  display: 'flex',
                                                  justifyContent: 'space-between',
                                                  mb: 0.25,
                                                }}
                                              >
                                                <Box
                                                  sx={{
                                                    display: 'flex',
                                                    gap: 0.75,
                                                    alignItems: 'center',
                                                  }}
                                                >
                                                  <Chip
                                                    size="small"
                                                    label={
                                                      m.messageType ||
                                                      m.data?.message_type ||
                                                      'text'
                                                    }
                                                    variant="outlined"
                                                    sx={{
                                                      fontSize: '0.55rem',
                                                      height: 16,
                                                      fontWeight: 600,
                                                      borderRadius: 1,
                                                    }}
                                                  />
                                                  {m.data?.goal_id && (
                                                    <Typography
                                                      variant="caption"
                                                      sx={{
                                                        color: 'text.disabled',
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.55rem',
                                                      }}
                                                    >
                                                      Goal: {m.data.goal_id.substring(0, 8)}
                                                    </Typography>
                                                  )}
                                                </Box>
                                                <Typography
                                                  variant="caption"
                                                  sx={{
                                                    color: 'text.disabled',
                                                    fontSize: '0.6rem',
                                                  }}
                                                >
                                                  {m.time ? new Date(m.time).toLocaleString() : '-'}
                                                </Typography>
                                              </Box>
                                              <Typography
                                                variant="body2"
                                                sx={{
                                                  fontSize: '0.78rem',
                                                  color: 'text.secondary',
                                                  lineHeight: 1.5,
                                                }}
                                              >
                                                {m.label || '-'}
                                              </Typography>
                                            </Paper>
                                          ))}
                                        </Stack>
                                      </Box>
                                    ))}
                                </Stack>
                              );
                            })()}

                          {/* ── TIMELINE VIEW (default for 'all' and 'time') ──── */}
                          {(historyFilter === 'all' || historyFilter === 'time') &&
                            (() => {
                              const goals = agentHistory.filter((e) => e.type === 'goal').length;
                              const msgs = agentHistory.filter((e) => e.type === 'message').length;
                              const docs = agentHistory.filter((e) => e.type === 'document').length;
                              const reports = agentHistory.filter(
                                (e) => e.type === 'report'
                              ).length;
                              const deliverables = agentHistory.filter(
                                (e) => e.type === 'deliverable'
                              ).length;
                              const totalJobs = agentJobs.length;
                              const completedJobs = agentJobs.filter(
                                (j) => j.status === 'completed'
                              ).length;
                              const failedJobs = agentJobs.filter(
                                (j) => j.status === 'failed' || j.status === 'cancelled'
                              ).length;
                              const totalCost = agentJobs.reduce(
                                (sum, j) => sum + (Number(j.costUsd) || 0),
                                0
                              );
                              return (
                                <>
                                  <Box
                                    sx={{
                                      display: 'grid',
                                      gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))',
                                      gap: 1,
                                      mb: 2,
                                    }}
                                  >
                                    {[
                                      { label: 'Goals', value: goals, color: 'primary.main' },
                                      { label: 'Jobs', value: totalJobs, color: 'info.main' },
                                      {
                                        label: 'Done',
                                        value: completedJobs,
                                        color: 'success.main',
                                      },
                                      { label: 'Messages', value: msgs, color: 'secondary.main' },
                                      { label: 'Docs', value: docs, color: 'warning.main' },
                                      { label: 'Reports', value: reports, color: 'info.main' },
                                      {
                                        label: 'Output',
                                        value: deliverables,
                                        color: 'success.main',
                                      },
                                    ]
                                      .filter((s) => s.value > 0)
                                      .map((s) => (
                                        <Paper
                                          key={s.label}
                                          elevation={0}
                                          sx={{
                                            p: 0.75,
                                            borderRadius: 1.5,
                                            border: '1px solid',
                                            borderColor: alpha(
                                              theme.palette[s.color.split('.')[0]]?.main || '#888',
                                              0.2
                                            ),
                                            textAlign: 'center',
                                          }}
                                        >
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              fontWeight: 800,
                                              fontSize: '0.95rem',
                                              color: s.color,
                                            }}
                                          >
                                            {s.value}
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              color: 'text.disabled',
                                              fontSize: '0.6rem',
                                              textTransform: 'uppercase',
                                            }}
                                          >
                                            {s.label}
                                          </Typography>
                                        </Paper>
                                      ))}
                                    {totalCost > 0 && (
                                      <Paper
                                        elevation={0}
                                        sx={{
                                          p: 0.75,
                                          borderRadius: 1.5,
                                          border: '1px solid',
                                          borderColor: alpha(theme.palette.warning.main, 0.2),
                                          textAlign: 'center',
                                        }}
                                      >
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            fontWeight: 800,
                                            fontSize: '0.95rem',
                                            color: 'warning.main',
                                          }}
                                        >
                                          ${totalCost.toFixed(4)}
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            color: 'text.disabled',
                                            fontSize: '0.6rem',
                                            textTransform: 'uppercase',
                                          }}
                                        >
                                          Cost
                                        </Typography>
                                      </Paper>
                                    )}
                                  </Box>

                                  {/* Timeline */}
                                  <Box sx={{ position: 'relative', pl: 3 }}>
                                    <Box
                                      sx={{
                                        position: 'absolute',
                                        left: 8,
                                        top: 4,
                                        bottom: 4,
                                        width: 2,
                                        bgcolor: alpha(theme.palette.divider, 0.5),
                                        borderRadius: 1,
                                      }}
                                    />

                                    {(() => {
                                      const TYPE_CONFIG = {
                                        goal: { color: 'primary.main', icon: 'G', prefix: 'Goal' },
                                        job: { color: 'info.main', icon: 'J', prefix: 'Job' },
                                        task: {
                                          color: 'secondary.main',
                                          icon: 'T',
                                          prefix: 'Task',
                                        },
                                        message: {
                                          color: 'success.main',
                                          icon: 'M',
                                          prefix: 'Message',
                                        },
                                        document: {
                                          color: 'warning.main',
                                          icon: 'D',
                                          prefix: 'Document',
                                        },
                                        report: { color: 'info.main', icon: 'R', prefix: 'Report' },
                                        deliverable: {
                                          color: 'success.main',
                                          icon: 'O',
                                          prefix: 'Output',
                                        },
                                      };

                                      // Sort already done in agentHistory
                                      let lastDateLabel = '';
                                      const rendered = [];

                                      // Add agent created event at the end
                                      const allEntries = [...agentHistory];
                                      if (detailData?.created_at) {
                                        allEntries.push({
                                          type: 'event',
                                          time: detailData.created_at,
                                          label: 'Agent created',
                                        });
                                      }
                                      allEntries.sort(
                                        (a, b) => new Date(b.time || 0) - new Date(a.time || 0)
                                      );

                                      for (const entry of allEntries) {
                                        if (entry.time) {
                                          const d = new Date(entry.time);
                                          const today = new Date();
                                          const yesterday = new Date(today);
                                          yesterday.setDate(yesterday.getDate() - 1);
                                          const dateLabel =
                                            d.toDateString() === today.toDateString()
                                              ? 'Today'
                                              : d.toDateString() === yesterday.toDateString()
                                                ? 'Yesterday'
                                                : d.toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                  });
                                          if (dateLabel !== lastDateLabel) {
                                            lastDateLabel = dateLabel;
                                            rendered.push(
                                              <Typography
                                                key={`date-${dateLabel}`}
                                                variant="overline"
                                                sx={{
                                                  display: 'block',
                                                  color: 'text.disabled',
                                                  fontSize: '0.6rem',
                                                  fontWeight: 700,
                                                  letterSpacing: '0.05em',
                                                  mt: rendered.length > 0 ? 1.5 : 0,
                                                  mb: 0.5,
                                                }}
                                              >
                                                {dateLabel}
                                              </Typography>
                                            );
                                          }
                                        }

                                        const cfg = TYPE_CONFIG[entry.type] || {
                                          color: 'text.disabled',
                                          icon: '·',
                                          prefix: '',
                                        };
                                        const statusColor =
                                          entry.status === 'completed' ||
                                          entry.status === 'done' ||
                                          entry.status === 'deployed'
                                            ? 'success.main'
                                            : entry.status === 'failed' ||
                                                entry.status === 'cancelled'
                                              ? 'error.main'
                                              : entry.status === 'active' ||
                                                  entry.status === 'inProgress'
                                                ? 'primary.main'
                                                : cfg.color;

                                        const sub = entry.status
                                          ? `Status: ${entry.status}`
                                          : entry.channel
                                            ? `Channel: ${entry.channel}`
                                            : entry.contentType ||
                                              entry.reportType ||
                                              entry.deliverableType ||
                                              '';
                                        const clickable =
                                          entry.type === 'task' && entry.data?.data?.output;

                                        rendered.push(
                                          <Box
                                            key={`${entry.type}-${entry.data?.id || rendered.length}`}
                                            sx={{
                                              position: 'relative',
                                              mb: 1.5,
                                              cursor: clickable ? 'pointer' : 'default',
                                              '&:hover': clickable
                                                ? {
                                                    bgcolor: alpha(
                                                      theme.palette.primary.main,
                                                      0.04
                                                    ),
                                                    borderRadius: 1.5,
                                                    mx: -1,
                                                    px: 1,
                                                  }
                                                : {},
                                            }}
                                            onClick={
                                              clickable
                                                ? () =>
                                                    setHistoryOutputDialog({
                                                      title: entry.label,
                                                      output: entry.data.data.output,
                                                    })
                                                : undefined
                                            }
                                          >
                                            <Box
                                              sx={{
                                                position: 'absolute',
                                                left: -23,
                                                top: 5,
                                                width: 10,
                                                height: 10,
                                                borderRadius: '50%',
                                                bgcolor: statusColor,
                                                border: '2px solid',
                                                borderColor: 'background.paper',
                                                zIndex: 1,
                                              }}
                                            />
                                            <Box
                                              sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                              }}
                                            >
                                              <Box
                                                sx={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: 0.75,
                                                  minWidth: 0,
                                                }}
                                              >
                                                <Chip
                                                  size="small"
                                                  label={cfg.prefix || entry.type}
                                                  sx={{
                                                    fontSize: '0.55rem',
                                                    height: 18,
                                                    fontWeight: 700,
                                                    borderRadius: 1,
                                                    bgcolor: alpha(
                                                      theme.palette[statusColor.split('.')[0]]
                                                        ?.main || '#888',
                                                      0.12
                                                    ),
                                                    color: statusColor,
                                                  }}
                                                />
                                                <Typography
                                                  variant="body2"
                                                  sx={{ fontWeight: 600, fontSize: '0.8rem' }}
                                                  noWrap
                                                >
                                                  {entry.label || '-'}
                                                </Typography>
                                              </Box>
                                              {entry.time && (
                                                <Typography
                                                  variant="caption"
                                                  sx={{
                                                    color: 'text.disabled',
                                                    fontSize: '0.65rem',
                                                    whiteSpace: 'nowrap',
                                                    ml: 1,
                                                  }}
                                                >
                                                  {formatRelative(entry.time)}
                                                </Typography>
                                              )}
                                            </Box>
                                            {sub && (
                                              <Typography
                                                variant="caption"
                                                sx={{
                                                  color: 'text.secondary',
                                                  fontSize: '0.7rem',
                                                  display: 'block',
                                                  mt: 0.25,
                                                  ml: 5.5,
                                                  lineHeight: 1.5,
                                                }}
                                              >
                                                {sub}
                                              </Typography>
                                            )}
                                          </Box>
                                        );
                                      }
                                      return rendered;
                                    })()}
                                  </Box>
                                </>
                              );
                            })()}
                        </>
                      )}
                    </Box>
                  )}
                  {/* ── Tab 5: Chat ──────────────────────────────── */}
                  {detailTab === 3 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      {/* Messages */}
                      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
                        {chatMessages.length === 0 && !chatLoading && (
                          <Box sx={{ textAlign: 'center', py: 6 }}>
                            <AgentAvatar
                              profile={{
                                display_name: detailData?.name || detailData?.role,
                                headshot_path:
                                  (detailData?.name || detailData?.role || '')
                                    .toLowerCase()
                                    .replace(/\s+/g, '-')
                                    .replace(/[^a-z0-9-]/g, '') + '.jpg',
                              }}
                              size="xl"
                              sx={{ mx: 'auto', mb: 2 }}
                            />
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                              Chat with {detailData?.name || detailData?.role}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              Start a conversation. The agent will respond in character.
                            </Typography>
                          </Box>
                        )}
                        {chatMessages.map((msg, i) => (
                          <Box
                            key={i}
                            sx={{
                              display: 'flex',
                              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                              mb: 1.5,
                            }}
                          >
                            {msg.role === 'agent' && (
                              <AgentAvatar
                                profile={{
                                  display_name: detailData?.name || detailData?.role,
                                  headshot_path:
                                    (detailData?.name || detailData?.role || '')
                                      .toLowerCase()
                                      .replace(/\s+/g, '-')
                                      .replace(/[^a-z0-9-]/g, '') + '.jpg',
                                }}
                                size="small"
                                sx={{ mr: 1, mt: 0.5 }}
                              />
                            )}
                            <Paper
                              elevation={0}
                              sx={{
                                p: 1.25,
                                borderRadius: 2,
                                maxWidth: '75%',
                                bgcolor:
                                  msg.role === 'user'
                                    ? alpha(theme.palette.primary.main, isDark ? 0.2 : 0.12)
                                    : alpha(theme.palette.divider, 0.3),
                                borderTopRightRadius: msg.role === 'user' ? 4 : 16,
                                borderTopLeftRadius: msg.role === 'agent' ? 4 : 16,
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: '0.82rem',
                                  lineHeight: 1.6,
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {msg.content || (msg.typing ? '...' : '')}
                              </Typography>
                            </Paper>
                          </Box>
                        ))}
                        {chatLoading && chatMessages[chatMessages.length - 1]?.role !== 'agent' && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 5 }}>
                            <CircularProgress size={16} />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {detailData?.name || 'Agent'} is typing...
                            </Typography>
                          </Box>
                        )}
                        <div
                          ref={(el) => {
                            chatEndRef.current = el;
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                        />
                      </Box>

                      {/* Input */}
                      <Box
                        sx={{
                          px: 2,
                          py: 1.5,
                          borderTop: '1px solid',
                          borderColor: 'divider',
                          display: 'flex',
                          gap: 1,
                        }}
                      >
                        <TextField
                          size="small"
                          fullWidth
                          placeholder={`Message ${detailData?.name || 'agent'}...`}
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleChatSend();
                            }
                          }}
                          disabled={chatLoading}
                          multiline
                          maxRows={3}
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
                        />
                        <IconButton
                          color="primary"
                          onClick={handleChatSend}
                          disabled={chatLoading || !chatInput.trim()}
                          sx={{ alignSelf: 'flex-end' }}
                        >
                          <AppIcon name="Send" fallback={SendIcon} sx={{ fontSize: 20 }} />
                        </IconButton>
                      </Box>
                    </Box>
                  )}

                  {/* ── Employment Tab ──────────────────────────────── */}
                  {detailTab === 4 && (
                    <Box sx={{ px: 2.5, py: 2 }}>
                      <AgentEmploymentPanel
                        employment={detailEmployment}
                        loading={detailEmploymentLoading}
                      />
                    </Box>
                  )}
                </DialogContent>
                <DialogActions
                  sx={{ px: 2.5, py: 2, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    endIcon={<AppIcon name="ArrowDropDown" fallback={ArrowDropDownIcon} />}
                    onClick={(e) => setDetailActionsAnchor(e.currentTarget)}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                  >
                    Actions
                  </Button>
                  <Menu
                    anchorEl={detailActionsAnchor}
                    open={Boolean(detailActionsAnchor)}
                    onClose={() => setDetailActionsAnchor(null)}
                    slotProps={{
                      paper: {
                        sx: { minWidth: 200, bgcolor: 'background.paper', backgroundImage: 'none' },
                      },
                    }}
                  >
                    <MenuItem
                      onClick={() => {
                        setDetailActionsAnchor(null);
                        openEdit(detailData);
                      }}
                    >
                      <ListItemIcon>
                        <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>Edit</ListItemText>
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setDetailActionsAnchor(null);
                        setDetailAgent(null);
                        navigate(`/agent-hub/${detailData.id}/reports`);
                      }}
                    >
                      <ListItemIcon>
                        <AppIcon
                          name="AssessmentOutlined"
                          fallback={AssessmentOutlinedIcon}
                          fontSize="small"
                        />
                      </ListItemIcon>
                      <ListItemText>Reports</ListItemText>
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setDetailActionsAnchor(null);
                        setAgentPulseOpen(true);
                      }}
                    >
                      <ListItemIcon>
                        <AppIcon
                          name="EventRepeatOutlined"
                          fallback={EventRepeatOutlinedIcon}
                          fontSize="small"
                        />
                      </ListItemIcon>
                      <ListItemText>Add Pulse</ListItemText>
                    </MenuItem>
                    <Divider sx={{ my: 0.5 }} />
                    <MenuItem
                      onClick={() => {
                        setDetailActionsAnchor(null);
                        updateAgent(detailData.id, { availability_status: 'blocked' });
                        refresh();
                        setDetailAgent(null);
                      }}
                    >
                      <ListItemIcon>
                        <AppIcon name="Block" fallback={BlockIcon} fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>Block</ListItemText>
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setDetailActionsAnchor(null);
                        setDeleteConfirm(detailData);
                      }}
                    >
                      <ListItemIcon>
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          fontSize="small"
                          sx={{ color: 'error.main' }}
                        />
                      </ListItemIcon>
                      <ListItemText sx={{ color: 'error.main' }}>Remove</ListItemText>
                    </MenuItem>
                  </Menu>
                  <Box sx={{ flex: 1 }} />
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => setDetailAgent(null)}
                    sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5 }}
                  >
                    Close
                  </Button>
                </DialogActions>
              </>
            );
          })()}
      </Dialog>
      {/* ── History Task Output Dialog ────────────────────────── */}
      <FormDialog
        open={!!historyOutputDialog}
        onClose={() => setHistoryOutputDialog(null)}
        title={historyOutputDialog?.title || 'Task Output'}
        maxWidth="md"
        hideCancel
        cancelLabel="Close"
        primaryLabel="Close"
        onPrimary={() => setHistoryOutputDialog(null)}
      >
        {historyOutputDialog && (
          <Typography
            sx={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              lineHeight: 1.7,
              fontSize: '0.9rem',
            }}
          >
            {historyOutputDialog.output}
          </Typography>
        )}
      </FormDialog>
      {/* ── Add / Edit Agent Dialog ───────────────────────────── */}
      <Dialog
        open={addDialogOpen || !!editDialog}
        onClose={() => {
          setAddDialogOpen(false);
          setEditDialog(null);
          setForm({ ...DEFAULT_FORM });
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, border: '1px solid', borderColor: 'divider' } }}
      >
        <DialogTitle
          sx={{
            fontWeight: 700,
            fontSize: '1.15rem',
            borderBottom: '1px solid',
            borderColor: 'divider',
            py: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <AppIcon
            name="SmartToyOutlined"
            fallback={SmartToyOutlinedIcon}
            color="primary"
            sx={{ fontSize: 26 }}
          />
          {editDialog ? 'Edit Agent' : 'Add Agent'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          <Stack spacing={2}>
            {/* Identity */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}
              >
                Identity
              </Typography>
              <Stack spacing={1.5}>
                <TextField
                  label="Role / Name"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder="e.g. analyst, writer, reviewer"
                  size="small"
                  fullWidth
                  required
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <TextField
                  label="Description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe this agent's purpose, expertise, and what makes it unique. Include background, specializations, workflow approach, and key strengths. Minimum 100 words recommended."
                  size="small"
                  fullWidth
                  multiline
                  rows={5}
                  helperText={`${(form.description || '').trim().split(/\s+/).filter(Boolean).length} words - 100 minimum recommended`}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <TextField
                  label="Capabilities"
                  value={form.capabilities}
                  onChange={(e) => setForm((f) => ({ ...f, capabilities: e.target.value }))}
                  placeholder="Comma-separated (e.g. analysis, copy, summarization)"
                  size="small"
                  fullWidth
                  helperText="Skills or tasks this agent can perform"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <FormControl
                  size="small"
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                >
                  <InputLabel>Category</InputLabel>
                  <Select
                    label="Category"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    <MenuItem value="">
                      <Typography variant="body2" color="text.secondary">
                        No category
                      </Typography>
                    </MenuItem>
                    {existingCategories.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Box>

            <Divider />

            {/* Connection */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  mb: 1,
                  color: 'text.secondary',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <AppIcon name="LinkOutlined" fallback={LinkOutlinedIcon} sx={{ fontSize: 18 }} />{' '}
                Connection
              </Typography>
              <Stack spacing={1.5}>
                <FormControl
                  size="small"
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                >
                  <InputLabel>Connection type</InputLabel>
                  <Select
                    label="Connection type"
                    value={form.connection_type}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, connection_type: e.target.value, connection_id: '' }))
                    }
                  >
                    {CONNECTION_TYPES.map((t) => (
                      <MenuItem key={t.value} value={t.value}>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Typography variant="body2" fontWeight={600}>
                            {t.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t.description}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl
                  size="small"
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                >
                  <InputLabel>Agent connection</InputLabel>
                  <Select
                    label="Agent connection"
                    value={form.connection_id}
                    onChange={(e) => setForm((f) => ({ ...f, connection_id: e.target.value }))}
                  >
                    <MenuItem value="">
                      <Typography variant="body2" color="text.secondary">
                        Select a connection
                      </Typography>
                    </MenuItem>
                    {connectionsByType.map((conn) => (
                      <MenuItem key={conn.id} value={conn.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {conn.name}
                          </Typography>
                          <Chip
                            size="small"
                            label={conn.type}
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.7rem' }}
                          />
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Box>

            <Divider />

            {/* Cost & Status */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}
              >
                Cost & Status
              </Typography>
              <Stack spacing={1.5}>
                <TextField
                  label="Cost per task"
                  type="number"
                  value={form.cost_per_task}
                  onChange={(e) => setForm((f) => ({ ...f, cost_per_task: e.target.value }))}
                  size="small"
                  fullWidth
                  inputProps={{ min: 0, step: 0.01 }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <FormControl
                  size="small"
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                >
                  <InputLabel>Initial status</InputLabel>
                  <Select
                    label="Initial status"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <MenuItem value="available">Active</MenuItem>
                    <MenuItem value="paused">Paused</MenuItem>
                    <MenuItem value="blocked">Blocked</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Box>

            {/* System Role */}
            <Divider />
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  mb: 1,
                  color: 'text.secondary',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <AppIcon
                  name="ShieldOutlined"
                  fallback={ShieldOutlinedIcon}
                  sx={{ fontSize: 18 }}
                />{' '}
                System Role
              </Typography>
              <FormControl
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                <InputLabel>Assign system role</InputLabel>
                <Select
                  label="Assign system role"
                  value={form.roleId}
                  disabled={!editDialog}
                  onChange={(e) => {
                    if (editDialog) setForm((f) => ({ ...f, roleId: e.target.value }));
                  }}
                >
                  {!editDialog ? (
                    <MenuItem value="role-agent">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }}
                        />
                        <Typography variant="body2" fontWeight={600}>
                          Agent
                        </Typography>
                      </Box>
                    </MenuItem>
                  ) : (
                    <>
                      <MenuItem value="">
                        <Typography variant="body2" color="text.secondary">
                          None - hub only
                        </Typography>
                      </MenuItem>
                      {roles.map((r) => (
                        <MenuItem key={r.id} value={r.id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.color }}
                            />
                            <Typography variant="body2" fontWeight={600}>
                              {r.name}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Select>
              </FormControl>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: 'block' }}
              >
                {editDialog
                  ? 'Change the assigned system role.'
                  : 'All new agents are assigned the Agent role by default.'}
              </Typography>
            </Box>

            {/* Resume - Generate */}
            {editDialog && (
              <>
                <Divider />
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 600,
                      mb: 1,
                      color: 'text.secondary',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <AppIcon
                      name="DescriptionOutlined"
                      fallback={DescriptionOutlinedIcon}
                      sx={{ fontSize: 18 }}
                    />{' '}
                    Resume
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 1 }}
                  >
                    {editDialog.resume
                      ? 'Resume exists - regenerate to update from current data.'
                      : "Generate a professional resume from this agent's data."}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={
                      <AppIcon
                        name="AutoFixHighOutlined"
                        fallback={AutoFixHighOutlinedIcon}
                        sx={{ fontSize: 16 }}
                      />
                    }
                    onClick={() => {
                      const caps = form.capabilities
                        ? form.capabilities.split(/[,\s]+/).filter(Boolean)
                        : editDialog.capabilities || [];
                      const kpiData = editDialog.performance_kpis || {};
                      const taskCount = kpiData.total_requests || kpiData.taskCount || 0;
                      const completedTasks = kpiData.completedTasks || taskCount;
                      const successRate =
                        taskCount > 0
                          ? Math.round((completedTasks / taskCount) * 100 * 10) / 10
                          : 0;
                      const costPerTask = Number(
                        form.cost_per_task || editDialog.cost_per_task || 0
                      );
                      const roleName = form.role || editDialog.role || 'Agent';
                      const categoryName = form.category || editDialog.category || '';
                      const desc = form.description || editDialog.description || '';
                      const capsText = caps.length > 0 ? caps.join(', ') : 'general tasks';
                      const summaryParts = [
                        `${roleName} is a professional AI agent${categoryName ? ` operating in the ${categoryName} domain` : ''}, designed to deliver high-quality results across a range of specialized tasks.`,
                        desc ||
                          `This agent brings deep expertise in ${capsText}, combining analytical precision with efficient task execution to meet diverse project requirements.`,
                        caps.length > 0
                          ? `Core competencies include ${capsText}. Each capability has been refined through real-world task execution, ensuring reliable and consistent performance across different scenarios and complexity levels.`
                          : '',
                        taskCount > 0
                          ? `To date, this agent has processed ${taskCount} tasks with ${completedTasks} successfully completed, achieving a ${successRate}% success rate. ${costPerTask > 0 ? `Average cost per task is $${costPerTask.toFixed(4)}, with a total expenditure of $${(costPerTask * taskCount).toFixed(2)}, demonstrating strong cost-efficiency.` : ''} This track record reflects a commitment to delivering dependable outcomes within budget constraints.`
                          : 'This agent is fully operational and ready to accept new assignments. Performance metrics will be tracked and updated automatically as tasks are completed.',
                        'The agent continuously improves through accumulated experience, adapting its approach based on past results to optimize future performance and maintain the highest standards of output quality.',
                      ];
                      const resume = {
                        headline: `${roleName}${categoryName ? ` - ${categoryName} Specialist` : ''}`,
                        summary: summaryParts.filter(Boolean).join(' '),
                        skills: caps,
                        experience: categoryName
                          ? [{ title: categoryName, count: taskCount, successRate }]
                          : [],
                        stats: {
                          totalTasks: taskCount,
                          completedTasks,
                          successRate,
                          avgCostPerTask: costPerTask,
                          totalCostUsd: costPerTask * taskCount,
                        },
                        certifications: [],
                        updatedAt: new Date().toISOString(),
                      };
                      updateAgent(editDialog.id, { resume });
                      setSnack({ text: 'Resume generated', severity: 'success' });
                    }}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                  >
                    Generate Resume
                  </Button>
                </Box>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{ px: 2.5, py: 2, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}
        >
          <Button
            onClick={() => {
              setAddDialogOpen(false);
              setEditDialog(null);
              setForm({ ...DEFAULT_FORM });
            }}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={editDialog ? handleEdit : handleAdd}
            disabled={!canSubmit}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2 }}
          >
            {editDialog ? 'Save Changes' : 'Add Agent'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Agent Resume Dialog ─────────────────────────────── */}
      <AgentResumeDialog
        open={!!resumeDialogAgent}
        onClose={() => setResumeDialogAgent(null)}
        agent={resumeDialogAgent}
      />
      {/* ── Agent Memory Panel ──────────────── */}
      <AgentMemoryPanel
        ownerType="agent"
        ownerId={agentMemoryOwnerId(detailAgent)}
        ownerName={detailAgent?.name || detailAgent?.role}
        open={agentMemoryOpen}
        onClose={() => setAgentMemoryOpen(false)}
        isActivated={isAgentMemoryEnabled(detailAgent?.metadata)}
        activatedAt={detailAgent?.metadata?.long_term_memory_activated_at || null}
        onActivate={async () => {
          if (!detailAgent) return;
          const nextMeta = {
            ...(detailAgent.metadata || {}),
            long_term_memory_enabled: true,
            long_term_memory_activated_at: new Date().toISOString(),
          };
          await updateAgent(detailAgent.id, { metadata: nextMeta });
          setDetailAgent((a) => (a ? { ...a, metadata: nextMeta } : a));
        }}
        onDeactivate={async () => {
          if (!detailAgent) return;
          const nextMeta = {
            ...(detailAgent.metadata || {}),
            long_term_memory_enabled: false,
          };
          await updateAgent(detailAgent.id, { metadata: nextMeta });
          setDetailAgent((a) => (a ? { ...a, metadata: nextMeta } : a));
        }}
      />
      {/* ── Create Agent Dialog (Blueprint-style) ──────────────── */}
      <CreateAgentDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        user={user}
        onCreated={(msg, severity) => {
          setSnack({ text: msg, severity: severity || 'success' });
          refresh();
        }}
      />
      {/* ── Skill Editor Dialog ────────────────────────────── */}
      <SkillEditorDialog
        open={!!skillEditorOpen}
        onClose={() => setSkillEditorOpen(null)}
        skill={skillEditorOpen}
        onSave={handleSaveSkillContent}
        onReset={handleResetSkillContent}
      />
      {/* ── Skill Installer Dialog ─────────────────────────── */}
      <SkillInstallerDialog
        open={skillInstallerOpen}
        onClose={() => setSkillInstallerOpen(false)}
        agentId={detailAgent?.id || detailAgent?.agent_id}
        agentName={detailData?.role || detailData?.name}
        installedSkillIds={agentSkills.map((s) => s.skill_id)}
        onInstalled={() => {
          loadAgentSkills(detailAgent?.id || detailAgent?.agent_id);
          setSnack({ text: 'Skill installed', severity: 'success' });
        }}
      />
      <CreatePulseDialog
        open={agentPulseOpen}
        onClose={() => setAgentPulseOpen(false)}
        lockOwner
        prefill={
          detailData
            ? {
                ownerType: 'agent',
                ownerId: detailData.id,
                ownerName: detailData.name || detailData.role || '',
              }
            : null
        }
        onCreated={() => {
          setAgentPulseOpen(false);
          setSnack({ text: 'Pulse scheduled', severity: 'success' });
        }}
      />
      {/* ── Delete Confirm ────────────────────────────────────── */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Remove Agent</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to remove{' '}
            <strong>{deleteConfirm?.role || deleteConfirm?.agent_id}</strong>? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
      {/* ===== Activity Log Dialog ===== */}
      <FormDialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        title="Agents Activity"
        subtitle="Agent action history"
        icon={HistoryIcon}
        maxWidth="md"
        paperSx={{ maxHeight: '80vh' }}
        contentDividers={false}
        contentSx={{ p: 0 }}
        actions={
          <>
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
          </>
        }
        footerJustify="flex-start"
      >
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
              Actions like adding, editing, and removing agents will appear here.
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
                        sx={{ fontWeight: 700, fontSize: '0.68rem', borderRadius: 1.5, height: 24 }}
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
      </FormDialog>
      {/* ── Snackbar ──────────────────────────────────────────── */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack && (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} variant="filled">
            {snack.text}
          </Alert>
        )}
      </Snackbar>
    </PageLayout>
  );
}

// ══════════════════════════════════════════════════════════════
// SUGGESTION CARD (used by TeamsTab)
// ══════════════════════════════════════════════════════════════
const SUGGESTION_ICON_MAP = {
  new_team: { icon: GroupAddOutlinedIcon, color: 'success' },
  restructure: { icon: BuildOutlinedIcon, color: 'info' },
  cost_downgrade: { icon: TrendingDownIcon, color: 'error' },
  idle_agents: { icon: WarningAmberIcon, color: 'warning' },
};

const PRIORITY_COLORS = { high: 'error', medium: 'warning', low: 'default' };

function SuggestionCard({ suggestion, theme, isDark, onAccept, onDismiss }) {
  const config = SUGGESTION_ICON_MAP[suggestion.type] || SUGGESTION_ICON_MAP.idle_agents;
  const Icon = config.icon;
  const title =
    suggestion.type === 'new_team'
      ? `New Team: ${suggestion.teamName}`
      : suggestion.type === 'cost_downgrade'
        ? `Cost Optimization: ${suggestion.teamName}`
        : suggestion.type === 'restructure'
          ? `Restructure: ${suggestion.teamName}`
          : 'Idle Agents';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        borderLeft: '4px solid',
        borderLeftColor: `${config.color}.main`,
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AppIcon fallback={Icon} sx={{ fontSize: 20, color: `${config.color}.main` }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {title}
        </Typography>
        <Chip
          size="small"
          label={suggestion.priority}
          color={PRIORITY_COLORS[suggestion.priority]}
          sx={{ height: 20, fontWeight: 600, fontSize: '0.6rem', textTransform: 'uppercase' }}
        />
      </Box>
      <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary', fontSize: '0.85rem' }}>
        {suggestion.description}
      </Typography>
      {suggestion.agents && suggestion.agents.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
          {suggestion.agents.slice(0, 6).map((a) => (
            <Chip
              key={a.id || a.agent_id}
              icon={
                <AppIcon
                  name="SmartToyOutlined"
                  fallback={SmartToyOutlinedIcon}
                  sx={{ fontSize: 12 }}
                />
              }
              label={`${a.role || a.agent_id}${a._matchScore ? ` (${a._matchScore}%)` : ''}${a._costTier ? ` · ${a._costTier}` : ''}`}
              size="small"
              variant="outlined"
              sx={{ height: 24, fontWeight: 600, fontSize: '0.65rem' }}
            />
          ))}
        </Box>
      )}
      {suggestion.type === 'cost_downgrade' && suggestion.overqualifiedAgent && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 1.5,
            px: 1.5,
            py: 1,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.error.main, 0.04),
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            Replace &quot;
            {suggestion.overqualifiedAgent.role || suggestion.overqualifiedAgent.agent_id}&quot;
            with &quot;
            {suggestion.cheaperAlternative.role || suggestion.cheaperAlternative.agent_id}&quot;
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Chip
            size="small"
            label={`~${suggestion.savingsPercent}% savings`}
            color="success"
            sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700 }}
          />
        </Box>
      )}
      {suggestion.recommendedAdditions && suggestion.recommendedAdditions.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, mr: 0.5 }}>
            Add:
          </Typography>
          {suggestion.recommendedAdditions.map((a) => (
            <Chip
              key={a.id || a.agent_id}
              size="small"
              variant="outlined"
              color="info"
              label={`${a.role || a.agent_id}${a._matchScore ? ` (${a._matchScore}%)` : ''}`}
              sx={{ height: 22, fontSize: '0.65rem', fontWeight: 600 }}
            />
          ))}
        </Box>
      )}
      <Typography
        variant="caption"
        sx={{
          color: 'text.disabled',
          display: 'block',
          mb: 1.5,
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}
      >
        {suggestion.reasoning}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button
          size="small"
          onClick={onDismiss}
          sx={{ textTransform: 'none', fontSize: '0.75rem', color: 'text.secondary' }}
        >
          Dismiss
        </Button>
        {onAccept && (
          <Button
            size="small"
            variant="contained"
            onClick={onAccept}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 2,
            }}
          >
            Accept &amp; Create
          </Button>
        )}
      </Box>
    </Paper>
  );
}

// ══════════════════════════════════════════════════════════════
// TEAMS TAB
// ══════════════════════════════════════════════════════════════
function TeamsTab({
  teams,
  addTeam,
  editTeam,
  removeTeam,
  jobs,
  user,
  theme,
  isDark,
  openActivityLog,
}) {
  const { simpleMode } = useSimpleMode();

  // ── Filter state ──────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  // ── View mode (cards/table) ───────────────────────────────
  const [viewMode, setViewMode] = useState('cards');

  // ── Sort & pagination ─────────────────────────────────────
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('updatedAt');

  // ── Dialog state ──────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_TEAM_FORM });
  const [saving, setSaving] = useState(false);

  // ── Delete state ──────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Chat / communication state ────────────────────────────
  const [chatDialog, setChatDialog] = useState({ open: false, team: null });
  const [chatInput, setChatInput] = useState('');
  const [toolSetupDialog, setToolSetupDialog] = useState({
    open: false,
    teamName: '',
    toolIds: [],
  });

  // ── Suggestions state ──────────────────────────────────────
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  // ── Agent pool ────────────────────────────────────────────
  const agentPool = useMemo(() => {
    try {
      return getAgents();
    } catch {
      return [];
    }
  }, []);

  // Lookup map to resolve team.agents[] entries back to the full pool agent
  // (which always carries the Eastern European person name → matching headshot file).
  const agentPoolIndex = useMemo(() => {
    const byId = new Map();
    const byRole = new Map();
    for (const a of agentPool) {
      if (a.id) byId.set(a.id, a);
      if (a.agent_id) byId.set(a.agent_id, a);
      if (a.role) byRole.set(a.role.toLowerCase(), a);
    }
    return { byId, byRole };
  }, [agentPool]);

  const resolveAgent = useCallback(
    (ag) => {
      if (!ag) return null;
      return (
        agentPoolIndex.byId.get(ag.id) ||
        agentPoolIndex.byId.get(ag.agent_id) ||
        (ag.role && agentPoolIndex.byRole.get(ag.role.toLowerCase())) ||
        ag
      );
    },
    [agentPoolIndex]
  );

  const agentHeadshotSlug = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // ── Handlers ──────────────────────────────────────────────
  const openCreateDialog = () => {
    setEditingTeam(null);
    setForm({ ...EMPTY_TEAM_FORM });
    setDialogOpen(true);
  };

  const openEditDialog = (team) => {
    setEditingTeam(team);
    setForm({
      name: team.name || '',
      description: team.description || '',
      status: team.status || 'active',
      agents: team.agents || [],
    });
    setDialogOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      if (editingTeam) {
        await editTeam(editingTeam.id, form);
        logAction({
          action: 'Team updated',
          entity: 'Team',
          entityId: editingTeam.id,
          details: `Updated team "${form.name}"`,
          meta: { source: 'agentHub', importance: 'medium', tags: ['update', 'team'] },
        }).catch(() => {});
      } else {
        const created = await addTeam({
          ...form,
          createdById: user?.id || null,
          createdByName: user?.email || 'Unknown',
        });
        if (created) {
          logAction({
            action: 'Team created',
            entity: 'Team',
            entityId: created.id,
            details: `Created team "${form.name}"`,
            meta: { source: 'agentHub', importance: 'medium', tags: ['create', 'team'] },
          }).catch(() => {});
        }
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save team:', err);
    } finally {
      setSaving(false);
    }
  }, [form, editingTeam, saving, editTeam, addTeam, user]);

  const handleSort = (sortKey) => {
    if (!sortKey) return;
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    await removeTeam(deleteConfirm.id);
    logAction({
      action: 'Team deleted',
      entity: 'Team',
      entityId: deleteConfirm.id,
      details: `Deleted team "${deleteConfirm.name}"`,
      meta: { source: 'agentHub', importance: 'high', tags: ['delete', 'team'] },
    }).catch(() => {});
    setDeleteConfirm(null);
  }, [deleteConfirm, removeTeam]);

  const [chatLoading, setChatLoading] = useState(false);

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || !chatDialog.team || chatLoading) return;
    const userMsg = {
      id: `msg-${Date.now()}`,
      text: chatInput.trim(),
      sender: user?.email || 'You',
      timestamp: new Date().toISOString(),
    };
    const existingMessages = chatDialog.team.messages || [];
    const withUser = [...existingMessages, userMsg];
    editTeam(chatDialog.team.id, { messages: withUser });
    setChatDialog((prev) => ({
      ...prev,
      team: { ...prev.team, messages: withUser },
    }));
    setChatInput('');

    // Generate AI team lead response
    setChatLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/app?path=team-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMsg.text,
          team: chatDialog.team,
          history: withUser,
        }),
      });
      const json = await res.json();
      if (res.ok && json.reply) {
        const leadMsg = {
          id: `msg-${Date.now()}-lead`,
          text: json.reply,
          sender: 'Team Lead',
          timestamp: new Date().toISOString(),
        };
        const withLead = [...withUser, leadMsg];
        editTeam(chatDialog.team.id, { messages: withLead });
        setChatDialog((prev) => ({
          ...prev,
          team: { ...prev.team, messages: withLead },
        }));
      }
    } catch {
      // silent - user message is already saved
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatDialog, editTeam, user, chatLoading]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('All');
  };

  // ── Suggestions handlers ───────────────────────────────────
  const handleSuggestions = useCallback(() => {
    const result = generateTeamSuggestions({ agents: agentPool, jobs, teams });
    setSuggestions(result);
    setSuggestionsOpen(true);
  }, [agentPool, jobs, teams]);

  const handleAcceptNewTeam = useCallback(
    async (suggestion) => {
      if (!suggestion.teamName) return;
      const cleanAgents = (suggestion.agents || []).map(
        ({ _model, _costTier, _outputCost, _isAvailable, _matchScore, ...rest }) => rest
      );
      const created = await addTeam({
        name: suggestion.teamName,
        description: suggestion.description,
        status: 'active',
        agents: cleanAgents,
        createdById: user?.id || null,
        createdByName: user?.email || 'Suggestion Engine',
      });
      if (created) {
        logAction({
          action: 'Team created via suggestion',
          entity: 'Team',
          entityId: created.id,
          details: `Auto-created team "${suggestion.teamName}" from suggestion engine`,
          meta: {
            source: 'teamSuggestionEngine',
            importance: 'medium',
            tags: ['create', 'team', 'suggestion'],
          },
        }).catch(() => {});
      }
      setSuggestions((prev) =>
        prev
          ? {
              ...prev,
              suggestions: prev.suggestions.filter((s) => s !== suggestion),
              summary: { ...prev.summary, total: prev.summary.total - 1 },
            }
          : prev
      );
    },
    [addTeam, user]
  );

  const handleDismissSuggestion = useCallback((idx) => {
    setSuggestions((prev) =>
      prev
        ? {
            ...prev,
            suggestions: prev.suggestions.filter((_, i) => i !== idx),
            summary: { ...prev.summary, total: prev.summary.total - 1 },
          }
        : prev
    );
  }, []);

  // ── Derived data ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...teams];
    if (statusFilter !== 'All') list = list.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.id || '').toLowerCase().includes(q) ||
          (t.name || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.createdByName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [teams, search, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const valA = a[orderBy] || '';
      const valB = b[orderBy] || '';
      if (valB < valA) return order === 'desc' ? -1 : 1;
      if (valB > valA) return order === 'desc' ? 1 : -1;
      return 0;
    });
  }, [filtered, order, orderBy]);

  const teamsPagination = usePagination(sorted, {
    surfaceId: 'agentHub.teams',
    defaultRowsPerPage: 10,
    resetOn: [search, statusFilter, viewMode],
  });
  const paginated = teamsPagination.paginatedData;

  const getJobCountForTeam = (teamId) => jobs.filter((j) => j.teamId === teamId).length;

  return (
    <>
      {/* ── Toolbar ──────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          borderBottom: '1px solid',
          borderColor: 'divider',
          p: 1.5,
        }}
      >
        <Tooltip title="Filter teams" placement="bottom" arrow>
          <IconButton
            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
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
              name="Tune"
              fallback={TuneIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
          </IconButton>
        </Tooltip>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v != null && setViewMode(v)}
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
          <ToggleButton value="cards" aria-label="Card view">
            <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
          <ToggleButton value="table" aria-label="Table view">
            <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
        </ToggleButtonGroup>
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
        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="AutoFixHighOutlined" fallback={AutoFixHighOutlinedIcon} />}
          onClick={handleSuggestions}
          disabled={agentPool.length === 0}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            px: 2,
            borderColor: alpha(theme.palette.warning.main, 0.5),
            color: isDark ? 'warning.light' : 'warning.dark',
            '&:hover': {
              bgcolor: alpha(theme.palette.warning.main, 0.08),
              borderColor: 'warning.main',
            },
          }}
        >
          Suggestions
        </Button>
        <Tooltip title="Add new team">
          <IconButton
            onClick={openCreateDialog}
            sx={{
              bgcolor: 'background.paper',
              border: '2px solid',
              borderColor: alpha(theme.palette.primary.main, 0.5),
              borderRadius: 2,
              color: 'primary.main',
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderColor: 'primary.main',
              },
            }}
          >
            <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {/* ── Filter Popover ───────────────────────────────── */}
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => setFilterAnchorEl(null)}
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
        <Box sx={{ px: 2.5, pt: 2.5, pb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AppIcon name="Tune" fallback={TuneIcon} sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Filter Teams
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Narrow down teams by name, status, or agents.
          </Typography>
        </Box>
        <Box sx={{ px: 2.5, pb: 2.5 }}>
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
            fullWidth
            size="small"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
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
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
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
            Status
          </Typography>
          <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => {
                setStatusFilter(e.target.value);
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
                All Statuses
              </MenuItem>
              {TEAM_STATUSES_LIST.map((s) => (
                <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            fullWidth
            variant="outlined"
            size="small"
            onClick={resetFilters}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              color: 'text.secondary',
              borderColor: 'divider',
            }}
          >
            Reset filters
          </Button>
        </Box>
      </Popover>
      {/* ── Content ──────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <Box sx={{ p: 4 }}>
          <EmptyState
            icon={Diversity3OutlinedIcon}
            title="No teams found"
            description={
              search || statusFilter !== 'All'
                ? 'Try adjusting your filters.'
                : 'Create your first team to get started.'
            }
            actionLabel="New Team"
            onAction={openCreateDialog}
          />
        </Box>
      ) : viewMode === 'cards' ? (
        <>
          <Box
            sx={{
              p: { xs: 1.25, sm: 1.5 },
              display: 'grid',
              gap: 2,
              gridTemplateColumns: cardGridColumns(simpleMode, {
                xs: '1fr',
                sm: '1fr 1fr',
                lg: 'repeat(3, 1fr)',
              }),
            }}
          >
            {paginated.map((team) => {
              const sc =
                (isDark ? TEAM_STATUS_COLORS_DARK : TEAM_STATUS_COLORS)[team.status] ||
                (isDark ? TEAM_STATUS_COLORS_DARK : TEAM_STATUS_COLORS).active;
              const jobCount = getJobCountForTeam(team.id);
              const agentCount = team.agents?.length || 0;
              return (
                <Paper
                  key={team.id}
                  elevation={0}
                  onClick={() => openEditDialog(team)}
                  sx={{
                    p: 1.75,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background-color 0.15s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: alpha(theme.palette.primary.main, 0.03),
                    },
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.25,
                    minHeight: 180,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.success.main, 0.12),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <AppIcon
                        name="Diversity3Outlined"
                        fallback={Diversity3OutlinedIcon}
                        sx={{ fontSize: 20, color: 'success.main' }}
                      />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          lineHeight: 1.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {team.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
                      >
                        {team.createdByName || 'System'} · {formatRelative(team.updatedAt)}
                      </Typography>
                    </Box>
                    <Chip
                      label={team.status}
                      size="small"
                      sx={{
                        height: 22,
                        fontWeight: 600,
                        fontSize: '0.65rem',
                        textTransform: 'capitalize',
                        bgcolor: sc.bg,
                        color: sc.color,
                        border: `1px solid ${sc.border}`,
                        flexShrink: 0,
                      }}
                    />
                  </Box>
                  {team.description && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {team.description}
                    </Typography>
                  )}
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 'auto', pt: 0.5 }}
                  >
                    {agentCount > 0 ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        {team.agents.slice(0, 4).map((ag, i) => {
                          const full = resolveAgent(ag);
                          const displayName = full.name || ag.name || full.role || ag.role || '';
                          const slug = agentHeadshotSlug(displayName);
                          return (
                            <Tooltip
                              key={ag.id || `${displayName}-${i}`}
                              title={displayName || 'Agent'}
                              arrow
                            >
                              <Box
                                sx={{
                                  ml: i === 0 ? 0 : -0.75,
                                  border: '2px solid',
                                  borderColor: 'background.paper',
                                  borderRadius: '50%',
                                  display: 'inline-flex',
                                }}
                              >
                                <AgentAvatar
                                  profile={{
                                    display_name: displayName,
                                    headshot_path: slug ? `${slug}.jpg` : undefined,
                                  }}
                                  size="small"
                                />
                              </Box>
                            </Tooltip>
                          );
                        })}
                        {agentCount > 4 && (
                          <Chip
                            label={`+${agentCount - 4}`}
                            size="small"
                            sx={{ ml: 0.5, height: 22, fontWeight: 700, fontSize: '0.65rem' }}
                          />
                        )}
                      </Box>
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
                      >
                        No agents
                      </Typography>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title={`${jobCount} job${jobCount !== 1 ? 's' : ''}`}>
                      <Chip
                        label={jobCount}
                        size="small"
                        sx={{
                          height: 22,
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          color: jobCount > 0 ? 'primary.main' : 'text.disabled',
                        }}
                      />
                    </Tooltip>
                    <Box sx={{ display: 'flex', gap: 0.25 }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => openEditDialog(team)}
                          sx={{ color: 'text.secondary' }}
                        >
                          <AppIcon
                            name="EditOutlined"
                            fallback={EditOutlinedIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Team Chat">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setChatDialog({ open: true, team });
                            setChatInput('');
                          }}
                          sx={{
                            color:
                              (team.messages?.length || 0) > 0 ? 'primary.main' : 'text.secondary',
                          }}
                        >
                          <AppIcon
                            name="ChatBubbleOutline"
                            fallback={ChatBubbleOutlineIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => setDeleteConfirm(team)}
                          sx={{ color: 'error.main' }}
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>
          <Pagination
            count={teamsPagination.totalCount}
            page={teamsPagination.page}
            rowsPerPage={teamsPagination.rowsPerPage}
            rowsPerPageOptions={teamsPagination.rowsPerPageOptions}
            onPageChange={teamsPagination.setPage}
            onRowsPerPageChange={teamsPagination.setRowsPerPage}
            onLoadAll={teamsPagination.loadAll}
            onCollapseAll={teamsPagination.collapseAll}
            allMode={teamsPagination.allMode}
            label="teams"
          />
        </>
      ) : (
        <>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', flex: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {TEAM_COLUMNS.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align || 'left'}
                      sx={{ minWidth: col.minWidth, whiteSpace: 'nowrap', fontWeight: 600 }}
                    >
                      {col.sortKey ? (
                        <TableSortLabel
                          active={orderBy === col.sortKey}
                          direction={orderBy === col.sortKey ? order : 'asc'}
                          onClick={() => handleSort(col.sortKey)}
                        >
                          {col.label}
                        </TableSortLabel>
                      ) : (
                        col.label
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((team) => {
                  const sc =
                    (isDark ? TEAM_STATUS_COLORS_DARK : TEAM_STATUS_COLORS)[team.status] ||
                    (isDark ? TEAM_STATUS_COLORS_DARK : TEAM_STATUS_COLORS).active;
                  const jobCount = getJobCountForTeam(team.id);
                  const agentCount = team.agents?.length || 0;
                  return (
                    <TableRow
                      key={team.id}
                      hover
                      sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                      onClick={() => openEditDialog(team)}
                    >
                      {/* Name */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: 2,
                              bgcolor: alpha(theme.palette.success.main, 0.12),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <AppIcon
                              name="Diversity3Outlined"
                              fallback={Diversity3OutlinedIcon}
                              sx={{ fontSize: 18, color: 'success.main' }}
                            />
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {team.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      {/* Description */}
                      <TableCell>
                        <Tooltip title={team.description}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              maxWidth: 240,
                            }}
                          >
                            {team.description || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Agents */}
                      <TableCell align="center">
                        {agentCount > 0 ? (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.25,
                              justifyContent: 'center',
                            }}
                          >
                            {team.agents.slice(0, 4).map((ag, i) => {
                              const full = resolveAgent(ag);
                              const displayName =
                                full.name || ag.name || full.role || ag.role || '';
                              const slug = agentHeadshotSlug(displayName);
                              return (
                                <Tooltip
                                  key={ag.id || `${displayName}-${i}`}
                                  title={displayName || 'Agent'}
                                  arrow
                                >
                                  <Box
                                    sx={{
                                      ml: i === 0 ? 0 : -0.75,
                                      border: '2px solid',
                                      borderColor: 'background.paper',
                                      borderRadius: '50%',
                                      display: 'inline-flex',
                                    }}
                                  >
                                    <AgentAvatar
                                      profile={{
                                        display_name: displayName,
                                        headshot_path: slug ? `${slug}.jpg` : undefined,
                                      }}
                                      size="small"
                                    />
                                  </Box>
                                </Tooltip>
                              );
                            })}
                            {agentCount > 4 && (
                              <Chip
                                label={`+${agentCount - 4}`}
                                size="small"
                                sx={{ ml: 0.5, height: 24, fontWeight: 700, fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            0
                          </Typography>
                        )}
                      </TableCell>
                      {/* Jobs */}
                      <TableCell align="center">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            color: jobCount > 0 ? 'primary.main' : 'text.disabled',
                          }}
                        >
                          {jobCount}
                        </Typography>
                      </TableCell>
                      {/* Created By */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AppIcon
                            name="PersonOutline"
                            fallback={PersonOutlineIcon}
                            sx={{ fontSize: 16, color: 'text.secondary' }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                            {team.createdByName || 'System'}
                          </Typography>
                        </Box>
                      </TableCell>
                      {/* Status */}
                      <TableCell align="center">
                        <Chip
                          label={team.status}
                          size="small"
                          sx={{
                            height: 26,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            textTransform: 'capitalize',
                            bgcolor: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}
                        />
                      </TableCell>
                      {/* Updated */}
                      <TableCell align="center">
                        <Tooltip title={formatDateShort(team.updatedAt)}>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 500, color: 'text.secondary' }}
                          >
                            {formatRelative(team.updatedAt)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Actions */}
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEditDialog(team)}>
                              <AppIcon
                                name="EditOutlined"
                                fallback={EditOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Setup Tools">
                            <IconButton
                              size="small"
                              onClick={() =>
                                setToolSetupDialog({
                                  open: true,
                                  teamName: team.name,
                                  toolIds: TEAM_TOOLS[team.name] || [],
                                })
                              }
                            >
                              <AppIcon
                                name="BuildOutlined"
                                fallback={BuildOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Team Chat">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setChatDialog({ open: true, team });
                                setChatInput('');
                              }}
                            >
                              <AppIcon
                                name="ChatBubbleOutline"
                                fallback={ChatBubbleOutlineIcon}
                                sx={{
                                  fontSize: 18,
                                  color:
                                    (team.messages?.length || 0) > 0
                                      ? 'primary.main'
                                      : 'text.secondary',
                                }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => setDeleteConfirm(team)}
                              sx={{ color: 'error.main' }}
                            >
                              <AppIcon
                                name="DeleteOutline"
                                fallback={DeleteOutlineIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination
            count={teamsPagination.totalCount}
            page={teamsPagination.page}
            rowsPerPage={teamsPagination.rowsPerPage}
            rowsPerPageOptions={teamsPagination.rowsPerPageOptions}
            onPageChange={teamsPagination.setPage}
            onRowsPerPageChange={teamsPagination.setRowsPerPage}
            onLoadAll={teamsPagination.loadAll}
            onCollapseAll={teamsPagination.collapseAll}
            allMode={teamsPagination.allMode}
            label="teams"
          />
        </>
      )}
      {/* ── Create/Edit Dialog ───────────────────────────── */}
      <FormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingTeam ? 'Edit Team' : 'New Team'}
        subtitle={
          editingTeam ? `ID: ${editingTeam.id}` : 'Create a team of agents to collaborate on jobs'
        }
        icon={Diversity3OutlinedIcon}
        iconVariant="success"
        maxWidth="sm"
        contentSx={{ pt: 3, pb: 1 }}
        actions={
          <>
            <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            {editingTeam && (
              <Button
                onClick={() => {
                  setDialogOpen(false);
                  setChatDialog({ open: true, team: editingTeam });
                  setChatInput('');
                }}
                startIcon={<AppIcon name="ChatBubbleOutline" fallback={ChatBubbleOutlineIcon} />}
                sx={{ textTransform: 'none', color: 'text.secondary' }}
              >
                Chat
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              {saving ? <CircularProgress size={20} /> : 'Save'}
            </Button>
          </>
        }
      >
        <Box sx={{ mt: 1 }}>
          <SectionLabel
            icon={<AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} />}
            label="Team Details"
          />
          <TextField
            fullWidth
            size="small"
            label="Team Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            fullWidth
            size="small"
            label="Description"
            multiline
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <FormControl size="small" fullWidth sx={{ mb: 3 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={form.status}
              label="Status"
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              sx={{ borderRadius: 2 }}
            >
              {TEAM_STATUSES_LIST.map((s) => (
                <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <SectionLabel
            icon={<AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />}
            label="Agent Pool"
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
            Select agents from the pool to form this team.
          </Typography>
          <Autocomplete
            multiple
            options={agentPool}
            getOptionLabel={(o) => {
              const full = resolveAgent(o);
              return full.name || o.name || full.role || o.role || o.agent_id || o.id;
            }}
            value={form.agents}
            onChange={(_, v) => setForm((f) => ({ ...f, agents: v }))}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            renderOption={(props, option) => {
              const { key, ...restProps } = props;
              const full = resolveAgent(option);
              const name = full.name || option.name || '';
              const role = full.role || option.role || option.agent_id || '';
              const slug = agentHeadshotSlug(name || role);
              return (
                <Box component="li" key={key} {...restProps} sx={{ px: 1.25, py: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      width: '100%',
                      minWidth: 0,
                    }}
                  >
                    <AgentAvatar
                      profile={{
                        display_name: name || role,
                        headshot_path: slug ? `${slug}.jpg` : undefined,
                      }}
                      size="small"
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          lineHeight: 1.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name || role}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.7rem',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name && role ? role : option.connection_type || ''}
                        {option.availability_status ? ` · ${option.availability_status}` : ''}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              );
            }}
            renderTags={(value, getTagProps) =>
              value.map((ag, idx) => {
                const full = resolveAgent(ag);
                const name = full.name || ag.name || '';
                const role = full.role || ag.role || ag.agent_id || '';
                const slug = agentHeadshotSlug(name || role);
                const primary = name || role;
                const tagProps = getTagProps({ index: idx });
                return (
                  <Chip
                    {...tagProps}
                    key={ag.id || `${primary}-${idx}`}
                    avatar={
                      <AgentAvatar
                        profile={{
                          display_name: primary,
                          headshot_path: slug ? `${slug}.jpg` : undefined,
                        }}
                        size="small"
                      />
                    }
                    label={
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          lineHeight: 1.1,
                          minWidth: 0,
                          maxWidth: { xs: 120, sm: 180 },
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {primary || 'Agent'}
                        </Typography>
                        {name && role && (
                          <Typography
                            component="span"
                            sx={{
                              fontSize: '0.62rem',
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {role}
                          </Typography>
                        )}
                      </Box>
                    }
                    sx={{
                      height: 40,
                      borderRadius: 2,
                      bgcolor: 'background.default',
                      border: '1px solid',
                      borderColor: 'divider',
                      '& .MuiChip-avatar': { width: 28, height: 28, ml: '6px !important' },
                      '& .MuiChip-avatar .MuiAvatar-root': {
                        width: 28,
                        height: 28,
                        fontSize: '0.72rem',
                        border: 'none',
                      },
                      '& .MuiChip-label': { pl: 1.5, pr: 1, py: 0.25 },
                    }}
                  />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Select Agents"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            )}
            sx={{ mb: 2, '& .MuiAutocomplete-tag': { m: 0.375 } }}
          />
          {agentPool.length === 0 && (
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 2 }}>
              No agents available. Add agents in the Agent Hub first.
            </Typography>
          )}

          {/* ── Job Pool Visibility ──────────────────────── */}
          {editingTeam && (
            <>
              <SectionLabel
                icon={<AppIcon name="WorkOutline" fallback={WorkOutlineIcon} />}
                label="Visible Jobs"
              />
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
              >
                Jobs currently assigned to this team.
              </Typography>
              {(() => {
                const teamJobs = jobs.filter((j) => j.teamId === editingTeam.id);
                return teamJobs.length === 0 ? (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', display: 'block', mb: 2 }}
                  >
                    No jobs assigned to this team yet.
                  </Typography>
                ) : (
                  <Box sx={{ mb: 2 }}>
                    {teamJobs.map((j) => (
                      <Box
                        key={j.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          py: 0.5,
                          px: 1,
                          borderRadius: 1.5,
                          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                        }}
                      >
                        <AppIcon
                          name="WorkOutline"
                          fallback={WorkOutlineIcon}
                          sx={{ fontSize: 16, color: 'primary.main' }}
                        />
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', flex: 1 }}>
                          {j.description?.slice(0, 60) || 'Untitled'}
                        </Typography>
                        <Chip
                          label={j.status}
                          size="small"
                          sx={{
                            height: 20,
                            fontWeight: 600,
                            fontSize: '0.6rem',
                            textTransform: 'capitalize',
                          }}
                        />
                      </Box>
                    ))}
                  </Box>
                );
              })()}
            </>
          )}
        </Box>
      </FormDialog>
      {/* ── Team Chat Dialog ──────────────────────────────── */}
      <FormDialog
        open={chatDialog.open}
        onClose={() => setChatDialog({ open: false, team: null })}
        title="Team Communication"
        subtitle={chatDialog.team?.name}
        icon={ChatBubbleOutlineIcon}
        maxWidth="sm"
        hideFooter
        contentDividers
        contentSx={{ p: 0 }}
      >
        <Box sx={{ minHeight: 300, maxHeight: 400, overflowY: 'auto', px: 2, py: 1.5 }}>
          {(chatDialog.team?.messages || []).length === 0 ? (
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}
            >
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                No messages yet. Start the conversation.
              </Typography>
            </Box>
          ) : (
            (chatDialog.team?.messages || []).map((msg) => {
              const isLead = msg.sender === 'Team Lead';
              return (
                <Box key={msg.id} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                    {isLead ? (
                      <AppIcon
                        name="SmartToyOutlined"
                        fallback={SmartToyOutlinedIcon}
                        sx={{ fontSize: 14, color: 'success.main' }}
                      />
                    ) : (
                      <AppIcon
                        name="PersonOutline"
                        fallback={PersonOutlineIcon}
                        sx={{ fontSize: 14, color: 'primary.main' }}
                      />
                    )}
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: isLead ? 'success.main' : 'primary.main' }}
                    >
                      {msg.sender}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto' }}>
                      {formatRelative(msg.timestamp)}
                    </Typography>
                  </Box>
                  <Paper
                    elevation={0}
                    sx={{
                      py: 1,
                      px: 1.5,
                      borderRadius: 2,
                      bgcolor: isLead
                        ? alpha(theme.palette.success.main, 0.06)
                        : alpha(theme.palette.primary.main, 0.04),
                      border: '1px solid',
                      borderColor: isLead
                        ? alpha(theme.palette.success.main, 0.15)
                        : alpha(theme.palette.divider, 0.5),
                    }}
                  >
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      {msg.text}
                    </Typography>
                  </Paper>
                </Box>
              );
            })
          )}
          {chatLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <AppIcon
                name="SmartToyOutlined"
                fallback={SmartToyOutlinedIcon}
                sx={{ fontSize: 14, color: 'success.main' }}
              />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
                Team Lead
              </Typography>
              <CircularProgress size={12} sx={{ color: 'success.main', ml: 0.5 }} />
            </Box>
          )}
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Type a message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <IconButton
            color="primary"
            onClick={handleSendMessage}
            disabled={!chatInput.trim() || chatLoading}
          >
            {chatLoading ? (
              <CircularProgress size={20} />
            ) : (
              <AppIcon name="Send" fallback={SendIcon} />
            )}
          </IconButton>
        </Box>
      </FormDialog>
      {/* ── Suggestions Dialog ─────────────────────────── */}
      <FormDialog
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        title="Team Suggestions"
        subtitle={
          suggestions?.summary?.analyzed
            ? `Analyzed ${suggestions.summary.agentsAnalyzed} agents, ${suggestions.summary.jobsAnalyzed} jobs, ${suggestions.summary.teamsAnalyzed} teams`
            : 'No analysis available'
        }
        icon={AutoFixHighOutlinedIcon}
        iconVariant="warning"
        maxWidth="md"
        contentDividers={false}
        contentSx={{ p: 0 }}
        primaryLabel="Close"
        onPrimary={() => setSuggestionsOpen(false)}
        hideCancel
      >
        {suggestions?.summary?.analyzed && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              px: 2.5,
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: alpha(theme.palette.background.default, 0.5),
            }}
          >
            <Chip
              size="small"
              label={`${suggestions.summary.unassignedJobs} unassigned jobs`}
              color="info"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
            />
            <Chip
              size="small"
              label={`${suggestions.summary.idleAgents} idle agents`}
              color="warning"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
            />
            <Chip
              size="small"
              label={`${suggestions.summary.newTeamCount} new teams`}
              color="success"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
            />
            <Chip
              size="small"
              label={`${suggestions.summary.costDowngradeCount} cost optimizations`}
              color="error"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
            />
            {suggestions.summary.avgSavingsPercent > 0 && (
              <Chip
                size="small"
                label={`~${suggestions.summary.avgSavingsPercent}% avg savings`}
                color="success"
                variant="filled"
                sx={{ fontWeight: 600, fontSize: '0.7rem' }}
              />
            )}
          </Box>
        )}

        <Box sx={{ px: 2.5, py: 2, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
          {!suggestions || suggestions.suggestions.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <AppIcon
                name="CheckCircleOutline"
                fallback={CheckCircleOutlineIcon}
                sx={{ fontSize: 48, color: 'success.main', mb: 1 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                All Good
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {suggestions?.summary?.reason ||
                  'No team optimizations needed right now. Your teams are well-composed.'}
              </Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {suggestions.suggestions.map((s, idx) => (
                <SuggestionCard
                  key={idx}
                  suggestion={s}
                  theme={theme}
                  isDark={isDark}
                  onAccept={
                    s.type === SUGGESTION_TYPES.NEW_TEAM ? () => handleAcceptNewTeam(s) : undefined
                  }
                  onDismiss={() => handleDismissSuggestion(idx)}
                />
              ))}
            </Stack>
          )}
        </Box>
      </FormDialog>
      {/* ── Delete Confirmation ──────────────────────────── */}
      <FormDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Team?"
        icon={DeleteOutlineIcon}
        iconVariant="warning"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setDeleteConfirm(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteConfirm}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Delete
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary">
          Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This action cannot be
          undone.
        </Typography>
      </FormDialog>
      {/* ── Tool Setup Chat ──────────────────────────────── */}
      <ToolSetupChat
        open={toolSetupDialog.open}
        onClose={() => setToolSetupDialog({ open: false, teamName: '', toolIds: [] })}
        teamName={toolSetupDialog.teamName}
        teamToolIds={toolSetupDialog.toolIds}
      />
    </>
  );
}
