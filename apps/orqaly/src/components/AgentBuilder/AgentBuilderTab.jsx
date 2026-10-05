/**
 * Agent Builder Tab — visual agent creation and management.
 * Blueprint form + tool picker + cost estimator + template gallery.
 * Renders inside the AgentHub page as a tab.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Paper,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Divider,
  Slider,
  Stack,
  useTheme,
  alpha,
  Collapse,
  Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CategoryIcon from '@mui/icons-material/Category';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FormDialog from '../Common/FormDialog';
import { supabase } from '../../lib/supabase';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import AppIcon from '../icons/AppIcon';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../config/assistantBrain';
// ── Provider & model definitions ────────────────────────────────
const PROVIDERS = [
  {
    id: 'groq',
    label: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
  },
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: ['claude-sonnet-5', 'claude-haiku-4-5'],
  },
  { id: 'deepseek', label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'glm', label: 'GLM', models: ['glm-5.1', 'glm-4', 'glm-4-flash'] },
  {
    id: 'gemini',
    label: 'Google Gemini',
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

// Cost per 1K tokens
const TOKEN_COSTS = {
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
  'gemini-flash-latest': { input: 0.0015, output: 0.0075 },
};

const CATEGORIES = ['general', 'analytics', 'operations', 'marketing', 'finance', 'support'];

// ── Generatable template pool (trend-based, non-overlapping with static templates) ──
// Each candidate targets underrepresented categories, providers, or tool combos.
// Market research 2026: churn prediction, fraud detection, compliance automation,
// multi-agent orchestration, revenue intelligence, partner onboarding, content generation.
const GENERATED_TEMPLATE_POOL = [
  {
    name: 'Churn Predictor',
    category: 'analytics',
    description: 'Detects partners at risk of churning using activity and financial signals',
    system_prompt:
      'You are a churn prediction agent for Orqaly. Analyze partner activity patterns, revenue trends, and engagement signals to identify partners at risk of churning. Flag partners with declining ROI (>20% drop), reduced FTD volume, or extended inactivity. For each at-risk partner, provide a risk score (high/medium/low), the key signals, and a suggested retention action. Submit findings as a structured report.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['partners:read', 'finances:read', 'reports:read', 'reports:submit'],
    temperature: 0.2,
    max_tokens: 4000,
  },
  {
    name: 'Partner Onboarding Assistant',
    category: 'support',
    description: 'Guides new partner setup and validates onboarding completeness',
    system_prompt:
      'You are a partner onboarding assistant. For each new partner, verify that all required fields are populated (contact info, payment details, funnel assignment, team/group). Check for incomplete profiles and generate an onboarding status report. Flag partners stuck in pending status for more than 48 hours. Suggest next steps for each incomplete onboarding.',
    provider: 'glm',
    model: 'glm-4-flash',
    tools: ['partners:read', 'partners:write', 'reports:submit'],
    temperature: 0.1,
    max_tokens: 2000,
  },
  {
    name: 'Revenue Optimizer',
    category: 'finance',
    description: 'Recommends spend reallocation based on ROI analysis across partners',
    system_prompt:
      'You are a revenue optimization agent. Analyze financial data across all partners to identify high-ROI opportunities and underperforming spend. Calculate ROI per partner/group/geo and recommend budget reallocation. Identify partners where incremental spend would yield >2x ROI and partners where spend should be reduced. Generate a weekly optimization report with specific dollar amounts.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['finances:read', 'partners:read', 'campaigns:read', 'reports:submit'],
    temperature: 0.15,
    max_tokens: 4000,
  },
  {
    name: 'Task Orchestrator',
    category: 'general',
    description: 'Creates and assigns tasks based on platform insights and alerts',
    system_prompt:
      'You are a task orchestration agent for Orqaly. Monitor dashboard alerts and partner status changes to automatically create follow-up tasks. Assign tasks to the appropriate boards based on category: finance issues to the finance board, partner issues to the partner board. Include relevant context from the dashboard in each task description. Track task completion via job status.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: [
      'dashboard:read',
      'mcp:manage_task',
      'mcp:list_boards',
      'mcp:get_job_status',
      'reports:submit',
    ],
    temperature: 0.2,
    max_tokens: 2000,
  },
  {
    name: 'Compliance Auditor',
    category: 'operations',
    description: 'Audits partner data and campaign configs for compliance violations',
    system_prompt:
      'You are a compliance auditing agent. Scan partner records for data quality issues: missing required fields, suspicious patterns (duplicate names, invalid geos, mismatched teams). Audit campaign configurations for policy violations. Generate a compliance report with severity levels (critical/warning/info) and recommended remediation actions. Run daily and flag new violations.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['partners:read', 'campaigns:read', 'injection:read', 'reports:submit'],
    temperature: 0.1,
    max_tokens: 3000,
  },
  {
    name: 'Workflow Automator',
    category: 'general',
    description: 'Orchestrates multi-step workflows and manages job pipelines',
    system_prompt:
      'You are a workflow automation agent. Monitor the job queue for pending workflows, manage execution pipelines, and coordinate multi-step processes. Enqueue follow-up jobs based on completed task results. Track workflow progress and report on pipeline health including throughput, failure rates, and bottlenecks.',
    provider: 'glm',
    model: 'glm-4',
    tools: ['mcp:manage_workflow', 'mcp:enqueue_job', 'mcp:get_job_status', 'reports:submit'],
    temperature: 0.1,
    max_tokens: 2000,
  },
  {
    name: 'Partner Health Monitor',
    category: 'support',
    description: 'Monitors partner health scores and escalates deteriorating accounts',
    system_prompt:
      'You are a partner health monitoring agent. Calculate a composite health score for each partner based on: revenue trend (30%), activity frequency (25%), ROI stability (25%), and data completeness (20%). Flag partners whose health score drops below 40/100. Update partner notes with the current health assessment. Create escalation tasks for critically unhealthy partners.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: [
      'partners:read',
      'partners:write',
      'finances:read',
      'mcp:manage_task',
      'reports:submit',
    ],
    temperature: 0.15,
    max_tokens: 3000,
  },
  {
    name: 'Content Curator',
    category: 'marketing',
    description: 'Organizes and optimizes injection materials across campaigns',
    system_prompt:
      'You are a content curation agent. Analyze injection materials to identify gaps in campaign coverage, outdated content, and high-performing material patterns. Cross-reference materials with active campaigns to ensure each campaign has appropriate injection content. Recommend new material categories based on campaign performance data. Update material metadata to improve discoverability.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['injection:read', 'injection:write', 'campaigns:read', 'reports:submit'],
    temperature: 0.3,
    max_tokens: 3000,
  },
  {
    name: 'Anomaly Detector',
    category: 'analytics',
    description: 'Identifies statistical anomalies in financial and partner data',
    system_prompt:
      'You are an anomaly detection agent. Analyze financial and partner metrics to identify statistical outliers: sudden revenue spikes/drops (>2 standard deviations), unusual spending patterns, abnormal conversion rates, or suspicious partner activity. For each anomaly, provide: what was detected, the expected range, the actual value, and the potential impact. Prioritize by severity.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['finances:read', 'partners:read', 'campaigns:read', 'dashboard:read', 'reports:submit'],
    temperature: 0.1,
    max_tokens: 4000,
  },
  {
    name: 'Geo Performance Analyst',
    category: 'analytics',
    description: 'Breaks down performance metrics by geographic region',
    system_prompt:
      'You are a geographic performance analyst. Segment partner and financial data by geo/region to identify top-performing and underperforming markets. Compare metrics across geos: revenue, ROI, partner count, conversion rates. Identify expansion opportunities in high-ROI geos with low partner density. Generate geo heatmap data in your reports.',
    provider: 'glm',
    model: 'glm-4-flash',
    tools: ['partners:read', 'finances:read', 'reports:read', 'reports:submit'],
    temperature: 0.2,
    max_tokens: 3000,
  },
  {
    name: 'Project Coordinator',
    category: 'general',
    description: 'Manages projects and coordinates cross-functional agent activities',
    system_prompt:
      'You are a project coordination agent. Track active projects, their milestones, and completion status. Coordinate tasks across boards, identify blocked items, and generate project status reports. When a project milestone is reached, trigger follow-up workflows. Maintain a clear audit trail of all project changes.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: [
      'mcp:manage_project',
      'mcp:manage_task',
      'mcp:list_boards',
      'mcp:get_job_status',
      'reports:submit',
    ],
    temperature: 0.2,
    max_tokens: 2500,
  },
  {
    name: 'Budget Guardian',
    category: 'finance',
    description: 'Enforces budget limits and alerts on overspend across partners',
    system_prompt:
      'You are a budget enforcement agent. Monitor daily and weekly spend across all partners and campaigns. Alert immediately when any partner exceeds their allocated budget or when total platform spend approaches the daily cap. Calculate burn rate and forecast when budget will be exhausted. Recommend throttling actions for overspending partners.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['finances:read', 'partners:read', 'dashboard:read', 'reports:submit'],
    temperature: 0.05,
    max_tokens: 2000,
  },
  {
    name: 'Campaign Strategist',
    category: 'marketing',
    description: 'Analyzes campaign data to recommend optimization strategies',
    system_prompt:
      'You are a campaign strategy agent. Analyze campaign performance metrics (CTR, CPA, conversion rates, ROI) to develop optimization recommendations. Identify winning campaign patterns and suggest replication strategies. Compare campaign performance across partners and geos. Generate a weekly strategy brief with top 5 actionable recommendations.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['campaigns:read', 'partners:read', 'finances:read', 'dashboard:read', 'reports:submit'],
    temperature: 0.3,
    max_tokens: 4000,
  },
  {
    name: 'Data Quality Agent',
    category: 'operations',
    description: 'Scans and fixes data quality issues across the platform',
    system_prompt:
      'You are a data quality agent. Scan partner records, injection materials, and reports for data quality issues: null/empty required fields, inconsistent formatting, stale data (not updated in 30+ days), and orphaned records. For fixable issues (formatting, missing defaults), apply corrections via write tools. For complex issues, create tasks for manual review.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: [
      'partners:read',
      'partners:write',
      'injection:read',
      'mcp:manage_task',
      'reports:submit',
    ],
    temperature: 0.1,
    max_tokens: 2000,
  },
  {
    name: 'Multi-Agent Coordinator',
    category: 'general',
    description: 'Supervises other agents and coordinates multi-agent workflows',
    system_prompt:
      'You are a multi-agent coordinator for Orqaly. Monitor the status of all active agents via job queue and reports. Identify agents that are stuck, failing, or producing low-quality output. Enqueue corrective jobs, create escalation tasks, and generate a daily agent fleet health report. Coordinate handoffs between agents when multi-step workflows require sequential processing.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: [
      'mcp:get_job_status',
      'mcp:enqueue_job',
      'mcp:manage_task',
      'mcp:list_tools',
      'reports:submit',
    ],
    temperature: 0.2,
    max_tokens: 3000,
  },
];

const BLUEPRINT_TEMPLATES = [
  {
    name: 'Partner Analyzer',
    category: 'analytics',
    description: 'Analyzes partner performance data and generates insights',
    system_prompt:
      'You are a partner analytics agent for Orqaly. Your job is to analyze partner data (revenue, spend, ROI, FTD) and generate actionable insights. Always reference specific numbers and trends. Report findings via the reports:submit tool.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['partners:read', 'finances:read', 'reports:submit'],
    temperature: 0.2,
    max_tokens: 3000,
  },
  {
    name: 'Campaign Monitor',
    category: 'marketing',
    description: 'Monitors campaign performance and alerts on anomalies',
    system_prompt:
      'You are a campaign monitoring agent. Check campaign metrics regularly, identify underperforming campaigns (low CTR, high CPA), and submit alerts. Never modify campaigns without explicit approval.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['campaigns:read', 'reports:submit', 'dashboard:read'],
    temperature: 0.1,
    max_tokens: 2000,
  },
  {
    name: 'Executive Reporter',
    category: 'operations',
    description: 'Generates daily executive summary reports',
    system_prompt:
      'You are an executive reporting agent. Compile data from dashboard, finances, and partner performance into a concise executive summary. Focus on KPIs, trends, and actionable items. Submit via reports:submit.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['dashboard:read', 'finances:read', 'partners:read', 'reports:submit'],
    temperature: 0.3,
    max_tokens: 4000,
  },
  {
    name: 'Injection Manager',
    category: 'operations',
    description: 'Manages injection materials and links them to campaigns',
    system_prompt:
      'You are an injection materials manager. Organize materials by category, link them to campaigns, and maintain metadata. Report any materials that need updating.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['injection:read', 'injection:write', 'campaigns:read', 'reports:submit'],
    temperature: 0.2,
    max_tokens: 2000,
  },
  {
    name: 'Finance Tracker',
    category: 'finance',
    description: 'Tracks financial metrics and alerts on budget deviations',
    system_prompt:
      'You are a financial tracking agent. Monitor revenue, spend, profit and ROI. Alert when ROI drops below targets or spend exceeds budgets. Generate weekly financial summaries.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['finances:read', 'partners:read', 'dashboard:read', 'reports:submit'],
    temperature: 0.1,
    max_tokens: 3000,
  },
];

// ── API helper ──────────────────────────────────────────────────
async function apiCall(path, method = 'GET', body = null) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/concilium?path=${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || `API error ${res.status}`);
  return json;
}

// ── Cost estimator ──────────────────────────────────────────────
function estimateCost(model, systemPrompt, maxTokens) {
  const costs = TOKEN_COSTS[model] || TOKEN_COSTS['llama-3.3-70b-versatile'];
  const promptTokens = Math.ceil((systemPrompt || '').length / 4);
  const inputCost = ((promptTokens + 500) / 1000) * costs.input;
  const outputCost = (maxTokens / 1000) * costs.output;
  const perCall = inputCost + outputCost;
  return {
    perCall: Math.round(perCall * 10000) / 10000,
    hourly: Math.round(perCall * 10 * 10000) / 10000,
    daily: Math.round(perCall * 100 * 10000) / 10000,
  };
}

// ── Main component ──────────────────────────────────────────────
export default function AgentBuilderTab() {
  const theme = useTheme();

  // State
  const [blueprints, setBlueprints] = useState([]);
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editDialog, setEditDialog] = useState(false);
  const [templateDialog, setTemplateDialog] = useState(false);

  // Form state
  const [form, setForm] = useState({
    id: null,
    name: '',
    description: '',
    category: 'general',
    system_prompt: '',
    provider: 'glm',
    model: 'glm-5.1',
    temperature: 0.3,
    max_tokens: 3000,
    tools: [],
    constraints: { max_cost_per_day_usd: 5, max_requests_per_hour: 60 },
    is_template: false,
  });

  const availableModels = useMemo(
    () => PROVIDERS.find((p) => p.id === form.provider)?.models || [],
    [form.provider]
  );

  const costEst = useMemo(
    () => estimateCost(form.model, form.system_prompt, form.max_tokens),
    [form.model, form.system_prompt, form.max_tokens]
  );

  // ── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bpRes, tlRes] = await Promise.all([
        apiCall('agent-blueprints'),
        apiCall('agent-tool-whitelist'),
      ]);
      setBlueprints(bpRes.blueprints || []);
      if ((tlRes.tools || []).length === 0) {
        // Auto-seed if empty
        const seedRes = await apiCall('agent-tool-whitelist&action=seed', 'POST');
        setTools(seedRes.tools || []);
      } else {
        setTools(tlRes.tools || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Form handlers ──────────────────────────────────────────
  const resetForm = () =>
    setForm({
      id: null,
      name: '',
      description: '',
      category: 'general',
      system_prompt: '',
      provider: DEFAULT_LLM_PROVIDER,
      model: DEFAULT_LLM_MODEL,
      temperature: 0.3,
      max_tokens: 3000,
      tools: [],
      constraints: { max_cost_per_day_usd: 5, max_requests_per_hour: 60 },
      is_template: false,
    });

  const openNew = () => {
    resetForm();
    setEditDialog(true);
  };

  const openEdit = (bp) => {
    setForm({
      id: bp.id,
      name: bp.name,
      description: bp.description,
      category: bp.category,
      system_prompt: bp.system_prompt,
      provider: bp.provider,
      model: bp.model,
      temperature: bp.temperature,
      max_tokens: bp.max_tokens,
      tools: bp.tools || [],
      constraints: bp.constraints || {},
      is_template: bp.is_template,
    });
    setEditDialog(true);
  };

  const applyTemplate = (tpl) => {
    setForm({
      id: null,
      name: tpl.name,
      description: tpl.description,
      category: tpl.category,
      system_prompt: tpl.system_prompt,
      provider: tpl.provider,
      model: tpl.model,
      temperature: tpl.temperature,
      max_tokens: tpl.max_tokens,
      tools: tpl.tools,
      constraints: { max_cost_per_day_usd: 5, max_requests_per_hour: 60 },
      is_template: false,
    });
    setTemplateDialog(false);
    setEditDialog(true);
  };

  const handleSave = async (andDeploy = false) => {
    setSaving(true);
    setError(null);
    try {
      let savedBp;
      if (form.id) {
        const { id, ...body } = form;
        const res = await apiCall(`agent-blueprints&id=${id}`, 'PUT', body);
        savedBp = res.blueprint;
        if (!andDeploy) setSuccess('Blueprint updated');
      } else {
        const res = await apiCall('agent-blueprints', 'POST', form);
        savedBp = res.blueprint;
        if (!andDeploy) setSuccess('Blueprint created');
      }
      setEditDialog(false);

      if (andDeploy && savedBp?.id) {
        setDeploying(true);
        try {
          const deployRes = await apiCall('agent-factory', 'POST', { blueprint_id: savedBp.id });
          if (deployRes.error) {
            setError(deployRes.error);
            if (deployRes.errors) setError(deployRes.errors.join(', '));
          } else {
            const msg = deployRes.requires_approval
              ? `Agent "${savedBp.name}" created — pending approval (high-risk tools detected)`
              : `Agent "${savedBp.name}" deployed successfully! Visit the Agents tab to see it.`;
            setSuccess(msg);
          }
        } catch (deployErr) {
          setError(`Blueprint saved but deploy failed: ${deployErr.message}`);
        } finally {
          setDeploying(false);
        }
      }

      await loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiCall(`agent-blueprints&id=${id}`, 'DELETE');
      setSuccess('Blueprint deleted');
      await loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeploy = async (bp) => {
    setDeploying(true);
    setError(null);
    try {
      const res = await apiCall('agent-factory', 'POST', { blueprint_id: bp.id });
      if (res.error) {
        setError(res.error);
        if (res.errors) setError(res.errors.join(', '));
      } else {
        const msg = res.requires_approval
          ? `Agent "${bp.name}" created — pending approval (high-risk tools detected)`
          : `Agent "${bp.name}" deployed! Tracking token: ${res.agent?.tracking_token || 'assigned'}`;
        setSuccess(msg);
        await loadData();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleDuplicate = (bp) => {
    setForm({
      id: null,
      name: `${bp.name} (copy)`,
      description: bp.description,
      category: bp.category,
      system_prompt: bp.system_prompt,
      provider: bp.provider,
      model: bp.model,
      temperature: bp.temperature,
      max_tokens: bp.max_tokens,
      tools: bp.tools || [],
      constraints: bp.constraints || {},
      is_template: false,
    });
    setEditDialog(true);
  };

  const toggleTool = (toolId) => {
    setForm((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter((t) => t !== toolId)
        : [...prev.tools, toolId],
    }));
  };

  // ── Generate template (dedup-aware) ─────────────────────────
  const generateTemplate = useCallback(() => {
    // Collect names + category:tools combos already in use
    const existingNames = new Set([
      ...BLUEPRINT_TEMPLATES.map((t) => t.name.toLowerCase()),
      ...blueprints.map((b) => b.name.toLowerCase()),
    ]);
    const existingCombos = new Set([
      ...BLUEPRINT_TEMPLATES.map((t) => `${t.category}:${[...t.tools].sort().join(',')}`),
      ...blueprints.map((b) => `${b.category}:${[...(b.tools || [])].sort().join(',')}`),
    ]);

    // Filter pool: exclude duplicates by name OR category+tools combo
    const candidates = GENERATED_TEMPLATE_POOL.filter((t) => {
      const nameMatch = existingNames.has(t.name.toLowerCase());
      const comboMatch = existingCombos.has(`${t.category}:${[...t.tools].sort().join(',')}`);
      return !nameMatch && !comboMatch;
    });

    if (candidates.length === 0) {
      setError(
        'All generated templates have already been used. Create a custom blueprint instead.'
      );
      return;
    }

    // Pick a random candidate
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    applyTemplate(pick);
    setSuccess(`Generated: "${pick.name}" — review and customize before saving`);
  }, [blueprints]);

  // ── Tool grouping (with hardcoded fallback) ─────────────────
  const FALLBACK_DOMAIN_TOOLS = [
    {
      tool_id: 'partners:read',
      tool_name: 'Read Partners',
      description: 'List/filter/get partner data',
      risk_level: 'low',
      category: 'domain',
    },
    {
      tool_id: 'partners:write',
      tool_name: 'Write Partners',
      description: 'Update partner fields',
      risk_level: 'medium',
      category: 'domain',
    },
    {
      tool_id: 'finances:read',
      tool_name: 'Read Finances',
      description: 'Financial summaries, revenue, ROI',
      risk_level: 'low',
      category: 'domain',
    },
    {
      tool_id: 'dashboard:read',
      tool_name: 'Read Dashboard',
      description: 'Executive summary, KPIs, trends',
      risk_level: 'low',
      category: 'domain',
    },
    {
      tool_id: 'campaigns:read',
      tool_name: 'Read Campaigns',
      description: 'List campaigns, filter by status',
      risk_level: 'low',
      category: 'domain',
    },
    {
      tool_id: 'campaigns:write',
      tool_name: 'Write Campaigns',
      description: 'Update campaign config',
      risk_level: 'medium',
      category: 'domain',
    },
    {
      tool_id: 'injection:read',
      tool_name: 'Read Injection',
      description: 'List materials and categories',
      risk_level: 'low',
      category: 'domain',
    },
    {
      tool_id: 'injection:write',
      tool_name: 'Write Injection',
      description: 'Create/update material metadata',
      risk_level: 'medium',
      category: 'domain',
    },
    {
      tool_id: 'reports:read',
      tool_name: 'Read Reports',
      description: 'Fetch any report type',
      risk_level: 'low',
      category: 'domain',
    },
    {
      tool_id: 'reports:submit',
      tool_name: 'Submit Report',
      description: 'Submit agent report to Consilium',
      risk_level: 'low',
      category: 'domain',
    },
  ];
  const FALLBACK_MCP_TOOLS = [
    {
      tool_id: 'mcp:agent_check_in',
      tool_name: 'Agent Check-In',
      description: 'Heartbeat check-in',
      risk_level: 'low',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:submit_report',
      tool_name: 'MCP Submit Report',
      description: 'Submit report via MCP',
      risk_level: 'low',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:list_boards',
      tool_name: 'MCP List Boards',
      description: 'List Consilium boards',
      risk_level: 'low',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:manage_task',
      tool_name: 'MCP Manage Tasks',
      description: 'Create/update tasks',
      risk_level: 'medium',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:manage_workflow',
      tool_name: 'MCP Manage Workflows',
      description: 'Create/update workflows',
      risk_level: 'medium',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:manage_project',
      tool_name: 'MCP Manage Projects',
      description: 'Create/update projects',
      risk_level: 'medium',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:execute_tool',
      tool_name: 'MCP Execute Tool',
      description: 'Execute a registered tool',
      risk_level: 'high',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:list_tools',
      tool_name: 'MCP List Tools',
      description: 'List registered tools',
      risk_level: 'low',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:enqueue_job',
      tool_name: 'MCP Enqueue Job',
      description: 'Add job to queue',
      risk_level: 'medium',
      category: 'mcp',
    },
    {
      tool_id: 'mcp:get_job_status',
      tool_name: 'MCP Job Status',
      description: 'Check job status',
      risk_level: 'low',
      category: 'mcp',
    },
  ];

  const apiDomainTools = tools.filter((t) => t.category === 'domain');
  const apiMcpTools = tools.filter((t) => t.category === 'mcp');
  const domainTools = apiDomainTools.length > 0 ? apiDomainTools : FALLBACK_DOMAIN_TOOLS;
  const mcpTools = apiMcpTools.length > 0 ? apiMcpTools : FALLBACK_MCP_TOOLS;

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ px: 2, py: 2 }}>
      {/* Alerts */}
      <Collapse in={!!error}>
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      </Collapse>
      <Collapse in={!!success}>
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2, borderRadius: 2 }}>
          {success}
        </Alert>
      </Collapse>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Typography variant="h6" fontWeight={700}>
          Agent Builder
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<AppIcon name="Category" fallback={CategoryIcon} />}
            onClick={() => setTemplateDialog(true)}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Templates
          </Button>
          <Button
            variant="contained"
            startIcon={<AppIcon name="Add" fallback={AddIcon} />}
            onClick={openNew}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            New
          </Button>
        </Stack>
      </Box>
      {/* Blueprint Grid */}
      {blueprints.length === 0 ? (
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px dashed',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.default, 0.5),
          }}
        >
          <AppIcon
            name="SmartToyOutlined"
            fallback={SmartToyOutlinedIcon}
            sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
          />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No blueprints yet
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            Create a new blueprint or start from a template to build your first agent
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center">
            <Button
              variant="outlined"
              onClick={() => setTemplateDialog(true)}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Browse Templates
            </Button>
            <Button
              variant="contained"
              onClick={openNew}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Create Blueprint
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {blueprints.map((bp) => {
            const bpCost = estimateCost(bp.model, bp.system_prompt, bp.max_tokens);
            return (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={bp.id}>
                <Paper
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'divider',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: createHoverGlowShadow(theme),
                    },
                  }}
                >
                  {/* Header */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      mb: 1.5,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>
                        {bp.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {bp.description}
                      </Typography>
                    </Box>
                    <Chip
                      label={bp.status}
                      size="small"
                      color={
                        bp.status === 'active'
                          ? 'success'
                          : bp.status === 'draft'
                            ? 'default'
                            : 'warning'
                      }
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  </Box>

                  {/* Meta */}
                  <Stack direction="row" spacing={0.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                    <Chip
                      label={bp.provider}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                    <Chip
                      label={bp.model}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                    <Chip
                      label={bp.category}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                    <Chip
                      label={`v${bp.version}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  </Stack>

                  {/* Tools */}
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      Tools ({(bp.tools || []).length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {(bp.tools || []).slice(0, 4).map((t) => (
                        <Chip
                          key={t}
                          label={t}
                          size="small"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      ))}
                      {(bp.tools || []).length > 4 && (
                        <Chip
                          label={`+${bp.tools.length - 4}`}
                          size="small"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      )}
                    </Box>
                  </Box>

                  {/* Cost estimate */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      mb: 2,
                      color: 'text.secondary',
                    }}
                  >
                    <AppIcon name="AttachMoney" fallback={AttachMoneyIcon} sx={{ fontSize: 14 }} />
                    <Typography variant="caption">
                      ~${bpCost.perCall}/call &middot; ~${bpCost.daily}/day
                    </Typography>
                  </Box>

                  {/* Actions */}
                  <Divider sx={{ mb: 1.5 }} />
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEdit(bp)}>
                        <AppIcon
                          name="EditOutlined"
                          fallback={EditOutlinedIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Duplicate">
                      <IconButton size="small" onClick={() => handleDuplicate(bp)}>
                        <AppIcon
                          name="ContentCopy"
                          fallback={ContentCopyIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(bp.id)} color="error">
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Tooltip>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={
                        deploying ? (
                          <CircularProgress size={14} />
                        ) : (
                          <AppIcon
                            name="RocketLaunchOutlined"
                            fallback={RocketLaunchOutlinedIcon}
                            sx={{ fontSize: 16 }}
                          />
                        )
                      }
                      onClick={() => handleDeploy(bp)}
                      disabled={deploying}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        ml: 'auto',
                      }}
                    >
                      Deploy
                    </Button>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
      {/* ── Blueprint Edit Dialog ───────────────────────────────── */}
      <FormDialog
        open={editDialog}
        onClose={() => setEditDialog(false)}
        title={form.id ? 'Edit Blueprint' : 'New Blueprint'}
        icon={SmartToyOutlinedIcon}
        maxWidth="md"
        paperSx={{ maxHeight: '90vh', m: { xs: 1, sm: 4 } }}
        contentSx={{ py: 2, px: { xs: 1.5, sm: 3 } }}
        footerJustify="space-between"
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} />}
              onClick={generateTemplate}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                width: { xs: '100%', sm: 'auto' },
                borderImage: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main || theme.palette.primary.dark}) 1`,
              }}
            >
              Generate
            </Button>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                width: { xs: '100%', sm: 'auto' },
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                gap: 1,
              }}
            >
              <Button onClick={() => setEditDialog(false)} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
              <Button
                variant="outlined"
                onClick={() => handleSave(false)}
                disabled={saving || deploying || !form.name || !form.system_prompt}
                startIcon={
                  saving ? (
                    <CircularProgress size={16} />
                  ) : (
                    <AppIcon name="SaveOutlined" fallback={SaveOutlinedIcon} />
                  )
                }
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                }}
              >
                {form.id ? 'Update' : 'Save'}
              </Button>
              <Button
                variant="contained"
                onClick={() => handleSave(true)}
                disabled={saving || deploying || !form.name || !form.system_prompt}
                startIcon={
                  saving || deploying ? (
                    <CircularProgress size={16} />
                  ) : (
                    <AppIcon name="RocketLaunchOutlined" fallback={RocketLaunchOutlinedIcon} />
                  )
                }
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                }}
              >
                {form.id ? 'Update & Deploy' : 'Deploy'}
              </Button>
            </Stack>
          </>
        }
      >
        <Stack spacing={2.5}>
          {/* Name & Category */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Name"
              fullWidth
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <FormControl sx={{ minWidth: { xs: 0, sm: 160 } }} fullWidth={false}>
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                sx={{ borderRadius: 2 }}
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {/* Description */}
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          {/* System Prompt */}
          <TextField
            label="System Prompt"
            fullWidth
            required
            multiline
            rows={5}
            value={form.system_prompt}
            onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
            helperText={`${form.system_prompt.length} chars (~${Math.ceil(form.system_prompt.length / 4)} tokens)`}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          <Divider />

          {/* Provider & Model */}
          <Typography variant="subtitle2" fontWeight={700}>
            Model Configuration
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl sx={{ minWidth: { xs: 0, sm: 160 } }}>
              <InputLabel>Provider</InputLabel>
              <Select
                label="Provider"
                value={form.provider}
                onChange={(e) => {
                  const p = PROVIDERS.find((pr) => pr.id === e.target.value);
                  setForm((f) => ({ ...f, provider: e.target.value, model: p?.models[0] || '' }));
                }}
                sx={{ borderRadius: 2 }}
              >
                {PROVIDERS.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ flex: 1 }}>
              <InputLabel>Model</InputLabel>
              <Select
                label="Model"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                sx={{ borderRadius: 2 }}
              >
                {availableModels.map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {/* Temperature & Max Tokens */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 2, sm: 3 }}
            alignItems={{ sm: 'center' }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Temperature: {form.temperature}
              </Typography>
              <Slider
                value={form.temperature}
                min={0}
                max={2}
                step={0.1}
                onChange={(_, v) => setForm((f) => ({ ...f, temperature: v }))}
                size="small"
              />
            </Box>
            <TextField
              label="Max Tokens"
              type="number"
              value={form.max_tokens}
              onChange={(e) => setForm((f) => ({ ...f, max_tokens: Number(e.target.value) }))}
              sx={{
                width: { xs: '100%', sm: 150 },
                '& .MuiOutlinedInput-root': { borderRadius: 2 },
              }}
              inputProps={{ min: 100, max: 128000 }}
            />
          </Stack>

          <Divider />

          {/* Tool Picker */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" fontWeight={700}>
              Tools
            </Typography>
            {form.tools.length > 0 && (
              <Chip
                label={`${form.tools.length} selected`}
                size="small"
                color="primary"
                sx={{ fontWeight: 600, fontSize: '0.7rem' }}
              />
            )}
          </Box>

          {/* Domain tools */}
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Typography
              variant="caption"
              fontWeight={700}
              color="text.secondary"
              sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              Domain Tools
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {domainTools.map((t) => {
                const selected = form.tools.includes(t.tool_id);
                const riskColor =
                  t.risk_level === 'medium'
                    ? 'warning'
                    : t.risk_level === 'high'
                      ? 'error'
                      : undefined;
                return (
                  <Tooltip
                    key={t.tool_id}
                    title={`${t.tool_name} — ${t.description}${t.risk_level !== 'low' ? ` (${t.risk_level} risk)` : ''}`}
                    arrow
                  >
                    <Chip
                      label={t.tool_id}
                      size="small"
                      onClick={() => toggleTool(t.tool_id)}
                      color={selected ? 'primary' : riskColor || 'default'}
                      variant={selected ? 'filled' : 'outlined'}
                      icon={
                        t.risk_level !== 'low' ? (
                          <AppIcon
                            name="ShieldOutlined"
                            fallback={ShieldOutlinedIcon}
                            sx={{ fontSize: 14 }}
                          />
                        ) : (
                          <AppIcon
                            name="CheckCircleOutline"
                            fallback={CheckCircleOutlineIcon}
                            sx={{ fontSize: 14, opacity: selected ? 1 : 0.3 }}
                          />
                        )
                      }
                      sx={{
                        cursor: 'pointer',
                        fontWeight: selected ? 700 : 400,
                        transition: 'all 0.15s',
                        ...(selected && { boxShadow: `0 0 0 1px ${theme.palette.primary.main}` }),
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          </Paper>

          {/* MCP tools */}
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Typography
              variant="caption"
              fontWeight={700}
              color="text.secondary"
              sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              MCP Tools
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {mcpTools.map((t) => {
                const selected = form.tools.includes(t.tool_id);
                const riskColor =
                  t.risk_level === 'medium'
                    ? 'warning'
                    : t.risk_level === 'high'
                      ? 'error'
                      : undefined;
                return (
                  <Tooltip
                    key={t.tool_id}
                    title={`${t.tool_name} — ${t.description}${t.risk_level !== 'low' ? ` (${t.risk_level} risk)` : ''}`}
                    arrow
                  >
                    <Chip
                      label={t.tool_id}
                      size="small"
                      onClick={() => toggleTool(t.tool_id)}
                      color={selected ? 'primary' : riskColor || 'default'}
                      variant={selected ? 'filled' : 'outlined'}
                      icon={
                        t.risk_level !== 'low' ? (
                          <AppIcon
                            name="ShieldOutlined"
                            fallback={ShieldOutlinedIcon}
                            sx={{ fontSize: 14 }}
                          />
                        ) : (
                          <AppIcon
                            name="CheckCircleOutline"
                            fallback={CheckCircleOutlineIcon}
                            sx={{ fontSize: 14, opacity: selected ? 1 : 0.3 }}
                          />
                        )
                      }
                      sx={{
                        cursor: 'pointer',
                        fontWeight: selected ? 700 : 400,
                        transition: 'all 0.15s',
                        ...(selected && { boxShadow: `0 0 0 1px ${theme.palette.primary.main}` }),
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          </Paper>

          <Divider />

          {/* Constraints */}
          <Typography variant="subtitle2" fontWeight={700}>
            Constraints
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Max Cost/Day ($)"
              type="number"
              value={form.constraints.max_cost_per_day_usd || 5}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  constraints: { ...f.constraints, max_cost_per_day_usd: Number(e.target.value) },
                }))
              }
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              inputProps={{ min: 0.1, max: 50, step: 0.5 }}
            />
            <TextField
              label="Max Requests/Hour"
              type="number"
              value={form.constraints.max_requests_per_hour || 60}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  constraints: { ...f.constraints, max_requests_per_hour: Number(e.target.value) },
                }))
              }
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              inputProps={{ min: 1, max: 1000 }}
            />
          </Stack>

          {/* Cost Estimate Card */}
          <Paper
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.info.main, 0.05),
              border: '1px solid',
              borderColor: alpha(theme.palette.info.main, 0.2),
            }}
          >
            <Stack direction="row" spacing={3} alignItems="center">
              <AppIcon name="AttachMoney" fallback={AttachMoneyIcon} color="info" />
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  Cost Estimate
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ~${costEst.perCall}/call &middot; ~${costEst.hourly}/hr &middot; ~${costEst.daily}
                  /day
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Stack>
      </FormDialog>
      {/* ── Template Gallery Dialog ──────────────────────────────── */}
      <FormDialog
        open={templateDialog}
        onClose={() => setTemplateDialog(false)}
        title="Blueprint Templates"
        icon={CategoryIcon}
        maxWidth="md"
        footerJustify="space-between"
        actions={
          <>
            <Button
              variant="contained"
              startIcon={<AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} />}
              onClick={generateTemplate}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main || theme.palette.primary.dark})`,
              }}
            >
              Generate
            </Button>
            <Button onClick={() => setTemplateDialog(false)} sx={{ textTransform: 'none' }}>
              Close
            </Button>
          </>
        }
      >
        <Grid container spacing={2}>
          {BLUEPRINT_TEMPLATES.map((tpl, i) => (
            <Grid size={{ xs: 12, sm: 6 }} key={i}>
              <Paper
                onClick={() => applyTemplate(tpl)}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: alpha(theme.palette.primary.main, 0.03),
                  },
                }}
              >
                <Typography variant="subtitle2" fontWeight={700}>
                  {tpl.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 1 }}
                >
                  {tpl.description}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  <Chip
                    label={tpl.provider}
                    size="small"
                    sx={{ fontSize: '0.65rem', height: 20 }}
                  />
                  <Chip label={tpl.model} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
                  <Chip
                    label={tpl.category}
                    size="small"
                    sx={{ fontSize: '0.65rem', height: 20 }}
                  />
                </Stack>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {tpl.tools.map((t) => (
                    <Chip
                      key={t}
                      label={t}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.6rem', height: 18 }}
                    />
                  ))}
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </FormDialog>
    </Box>
  );
}
