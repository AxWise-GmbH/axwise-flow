/**
 * CreateAgentDialog — Blueprint-style dialog for creating a new agent directly
 * in the Agents tab. Matches the Builder's "New Blueprint" form layout.
 * Created agents get _type: 'created' and do NOT appear in the Marketplace.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
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
  Stack,
  Divider,
  Slider,
  CircularProgress,
  useTheme,
  alpha,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { supabase } from '../../lib/supabase';
import { addAgent } from '../../services/agentHubService';
import { createSystemAgent } from '../../services/systemAgentsService';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../config/assistantBrain';

import AppIcon from '../icons/AppIcon';

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

const DOMAIN_TOOLS = [
  { tool_id: 'partners:read', tool_name: 'Read Partners', risk_level: 'low' },
  { tool_id: 'partners:write', tool_name: 'Write Partners', risk_level: 'medium' },
  { tool_id: 'finances:read', tool_name: 'Read Finances', risk_level: 'low' },
  { tool_id: 'dashboard:read', tool_name: 'Read Dashboard', risk_level: 'low' },
  { tool_id: 'campaigns:read', tool_name: 'Read Campaigns', risk_level: 'low' },
  { tool_id: 'campaigns:write', tool_name: 'Write Campaigns', risk_level: 'medium' },
  { tool_id: 'injection:read', tool_name: 'Read Injection', risk_level: 'low' },
  { tool_id: 'injection:write', tool_name: 'Write Injection', risk_level: 'medium' },
  { tool_id: 'reports:read', tool_name: 'Read Reports', risk_level: 'low' },
  { tool_id: 'reports:submit', tool_name: 'Submit Report', risk_level: 'low' },
];

const MCP_TOOLS = [
  { tool_id: 'mcp:agent_check_in', tool_name: 'Agent Check-In', risk_level: 'low' },
  { tool_id: 'mcp:submit_report', tool_name: 'MCP Submit Report', risk_level: 'low' },
  { tool_id: 'mcp:list_boards', tool_name: 'MCP List Boards', risk_level: 'low' },
  { tool_id: 'mcp:manage_task', tool_name: 'MCP Manage Tasks', risk_level: 'medium' },
  { tool_id: 'mcp:manage_workflow', tool_name: 'MCP Manage Workflows', risk_level: 'medium' },
  { tool_id: 'mcp:manage_project', tool_name: 'MCP Manage Projects', risk_level: 'medium' },
  { tool_id: 'mcp:execute_tool', tool_name: 'MCP Execute Tool', risk_level: 'high' },
  { tool_id: 'mcp:list_tools', tool_name: 'MCP List Tools', risk_level: 'low' },
  { tool_id: 'mcp:enqueue_job', tool_name: 'MCP Enqueue Job', risk_level: 'medium' },
  { tool_id: 'mcp:get_job_status', tool_name: 'MCP Job Status', risk_level: 'low' },
];

const GENERATED_TEMPLATES = [
  {
    name: 'Churn Predictor',
    category: 'analytics',
    description: 'Detects partners at risk of churning',
    system_prompt:
      'You are a churn prediction agent. Analyze partner activity patterns, revenue trends, and engagement signals to identify at-risk partners.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['partners:read', 'finances:read', 'reports:submit'],
    temperature: 0.2,
    max_tokens: 4000,
  },
  {
    name: 'Revenue Optimizer',
    category: 'finance',
    description: 'Recommends spend reallocation based on ROI',
    system_prompt:
      'You are a revenue optimization agent. Analyze financial data across partners to identify high-ROI opportunities and recommend budget reallocation.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['finances:read', 'partners:read', 'reports:submit'],
    temperature: 0.15,
    max_tokens: 4000,
  },
  {
    name: 'Campaign Monitor',
    category: 'marketing',
    description: 'Tracks campaign performance and suggests optimizations',
    system_prompt:
      'You are a campaign monitoring agent. Track live campaign metrics, detect anomalies, and suggest optimization actions.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['campaigns:read', 'reports:submit'],
    temperature: 0.3,
    max_tokens: 3000,
  },
  {
    name: 'Compliance Auditor',
    category: 'operations',
    description: 'Audits data for compliance violations',
    system_prompt:
      'You are a compliance auditing agent. Scan partner records and campaign configs for policy violations and data quality issues.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['partners:read', 'campaigns:read', 'reports:submit'],
    temperature: 0.1,
    max_tokens: 3000,
  },
  {
    name: 'Task Orchestrator',
    category: 'general',
    description: 'Creates and assigns tasks based on insights',
    system_prompt:
      'You are a task orchestration agent. Monitor alerts and status changes to automatically create and assign follow-up tasks.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['dashboard:read', 'mcp:manage_task', 'reports:submit'],
    temperature: 0.2,
    max_tokens: 2000,
  },
  {
    name: 'Partner Onboarding',
    category: 'support',
    description: 'Guides new partner setup and validates completeness',
    system_prompt:
      'You are a partner onboarding assistant. Verify required fields, check for incomplete profiles, and suggest next steps.',
    provider: 'glm',
    model: 'glm-5.1',
    tools: ['partners:read', 'partners:write', 'reports:submit'],
    temperature: 0.1,
    max_tokens: 2000,
  },
];

const DEFAULT_FORM = {
  name: '',
  description: '',
  category: 'general',
  system_prompt: '',
  provider: DEFAULT_LLM_PROVIDER,
  model: DEFAULT_LLM_MODEL,
  temperature: 0.3,
  max_tokens: 3000,
  tools: [],
};

const RISK_COLORS = { low: 'success', medium: 'warning', high: 'error' };

async function apiCall(path, method = 'GET', body = null) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/concilium?path=${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || `API error ${res.status}`);
  return json;
}

export default function CreateAgentDialog({ open, onClose, user, onCreated }) {
  const theme = useTheme();
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState(null);

  useEffect(() => {
    if (open) setForm({ ...DEFAULT_FORM });
  }, [open]);

  const availableModels = useMemo(
    () => PROVIDERS.find((p) => p.id === form.provider)?.models || [],
    [form.provider]
  );

  const costEst = useMemo(() => {
    const costs = TOKEN_COSTS[form.model] || TOKEN_COSTS['llama-3.3-70b-versatile'];
    const promptTokens = Math.ceil((form.system_prompt || '').length / 4);
    const inputCost = ((promptTokens + 500) / 1000) * costs.input;
    const outputCost = (form.max_tokens / 1000) * costs.output;
    const perCall = inputCost + outputCost;
    return {
      perCall: Math.round(perCall * 10000) / 10000,
      daily: Math.round(perCall * 100 * 10000) / 10000,
    };
  }, [form.model, form.system_prompt, form.max_tokens]);

  const toggleTool = (toolId) => {
    setForm((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter((t) => t !== toolId)
        : [...prev.tools, toolId],
    }));
  };

  const canSubmit = form.name.trim() && form.system_prompt.trim();

  const handleGenerate = useCallback(() => {
    const pick = GENERATED_TEMPLATES[Math.floor(Math.random() * GENERATED_TEMPLATES.length)];
    setForm({ ...DEFAULT_FORM, ...pick });
  }, []);

  const handleSave = async (andDeploy = false) => {
    if (andDeploy) setDeploying(true);
    else setSaving(true);
    try {
      // Save blueprint first
      const bpRes = await apiCall('agent-blueprints', 'POST', {
        ...form,
        constraints: { max_cost_per_day_usd: 5, max_requests_per_hour: 60 },
        is_template: false,
      });

      if (andDeploy && bpRes.blueprint?.id) {
        // Deploy via agent factory
        await apiCall('agent-factory', 'POST', { blueprint_id: bpRes.blueprint.id });
      }

      // Also add to local workspace with _type: 'created'
      const record = addAgent({
        role: form.name,
        description: form.description,
        capabilities: form.tools,
        connection_type: form.provider,
        connection_id: form.model,
        provider: form.provider,
        model: form.model,
        cost_per_task: costEst.perCall,
        availability_status: 'available',
        category: form.category,
        system_prompt: form.system_prompt,
        _type: 'created',
        added_by: user
          ? { uid: user.uid, email: user.email, date: new Date().toISOString() }
          : { uid: null, email: 'manual', date: new Date().toISOString() },
      });

      try {
        await createSystemAgent({
          name: form.name.trim(),
          type: 'custom',
          roleId: 'role-agent',
          agentHubId: record.id,
        });
      } catch {
        // best-effort
      }

      onCreated(
        andDeploy ? `Agent "${form.name}" created & deployed` : `Agent "${form.name}" created`
      );
      onClose();
    } catch (err) {
      onCreated(err.message, 'error');
    } finally {
      setSaving(false);
      setDeploying(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      title="New Agent"
      icon={SmartToyOutlinedIcon}
      paperSx={{ maxHeight: '90vh', m: { xs: 1, sm: 4 } }}
      contentSx={{ py: 2, px: { xs: 1.5, sm: 3 } }}
      actions={
        <>
          <Button
            variant="outlined"
            size="small"
            endIcon={<AppIcon name="ArrowDropDown" fallback={ArrowDropDownIcon} />}
            onClick={(e) => setActionsAnchor(e.currentTarget)}
            disabled={saving || deploying}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            {saving ? 'Saving...' : deploying ? 'Deploying...' : 'Actions'}
          </Button>
          <Menu
            anchorEl={actionsAnchor}
            open={Boolean(actionsAnchor)}
            onClose={() => setActionsAnchor(null)}
            slotProps={{
              paper: {
                sx: { minWidth: 200, bgcolor: 'background.paper', backgroundImage: 'none' },
              },
            }}
          >
            <MenuItem
              onClick={() => {
                setActionsAnchor(null);
                handleGenerate();
              }}
            >
              <ListItemIcon>
                <AppIcon
                  name="AutoAwesome"
                  fallback={AutoAwesomeIcon}
                  fontSize="small"
                  sx={{ color: 'success.main' }}
                />
              </ListItemIcon>
              <ListItemText>Generate</ListItemText>
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              onClick={() => {
                setActionsAnchor(null);
                handleSave(false);
              }}
              disabled={!canSubmit}
            >
              <ListItemIcon>
                <AppIcon name="SaveOutlined" fallback={SaveOutlinedIcon} fontSize="small" />
              </ListItemIcon>
              <ListItemText>Save</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                setActionsAnchor(null);
                handleSave(true);
              }}
              disabled={!canSubmit}
            >
              <ListItemIcon>
                <AppIcon
                  name="RocketLaunchOutlined"
                  fallback={RocketLaunchOutlinedIcon}
                  fontSize="small"
                  sx={{ color: 'primary.main' }}
                />
              </ListItemIcon>
              <ListItemText>Deploy</ListItemText>
            </MenuItem>
          </Menu>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
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
            sx={FORM_FIELD_SX}
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
          sx={FORM_FIELD_SX}
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
          sx={FORM_FIELD_SX}
        />

        <Divider />

        {/* Model Configuration */}
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
            sx={{ width: { xs: '100%', sm: 150 }, ...FORM_FIELD_SX }}
            inputProps={{ min: 100, max: 128000 }}
          />
        </Stack>

        <Divider />

        {/* Tools */}
        <Box>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
          >
            <Typography variant="subtitle2" fontWeight={700}>
              Tools
            </Typography>
            {form.tools.length > 0 && (
              <Chip
                size="small"
                label={`${form.tools.length} selected`}
                color="primary"
                sx={{ fontSize: '0.7rem', height: 22 }}
              />
            )}
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Domain
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
            {DOMAIN_TOOLS.map((t) => (
              <Chip
                key={t.tool_id}
                label={t.tool_name}
                size="small"
                color={form.tools.includes(t.tool_id) ? RISK_COLORS[t.risk_level] : 'default'}
                variant={form.tools.includes(t.tool_id) ? 'filled' : 'outlined'}
                onClick={() => toggleTool(t.tool_id)}
                sx={{ cursor: 'pointer', fontSize: '0.7rem', height: 24 }}
              />
            ))}
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            MCP
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {MCP_TOOLS.map((t) => (
              <Chip
                key={t.tool_id}
                label={t.tool_name}
                size="small"
                color={form.tools.includes(t.tool_id) ? RISK_COLORS[t.risk_level] : 'default'}
                variant={form.tools.includes(t.tool_id) ? 'filled' : 'outlined'}
                onClick={() => toggleTool(t.tool_id)}
                sx={{ cursor: 'pointer', fontSize: '0.7rem', height: 24 }}
              />
            ))}
          </Box>
        </Box>

        {/* Cost estimate */}
        {form.system_prompt && (
          <Typography variant="caption" color="text.secondary">
            Estimated: ~${costEst.perCall}/call · ~${costEst.daily}/day
          </Typography>
        )}
      </Stack>
    </FormDialog>
  );
}
