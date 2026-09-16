import { useState, useEffect, useMemo } from 'react';
import {
  Button,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  Box,
  Chip,
  IconButton,
  Divider,
  Collapse,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import { startExecution, pollExecution } from '../../services/workflowExecutionService';

import AppIcon from '../icons/AppIcon';

/* ---- Per-block-type validation rules ---- */
const VALIDATION_RULES = {
  trigger: {
    label: 'Trigger',
    required: [],
    optional: ['event'],
    hints: ['Entry point — no config needed. Trigger data flows to next node.'],
  },
  llm: {
    label: 'AI / LLM',
    required: [
      { key: 'provider', label: 'Provider', hint: 'Select: groq, openai, or anthropic' },
      {
        key: 'model',
        label: 'Model',
        hint: 'e.g. gpt-4o, claude-sonnet-5, llama-3.3-70b-versatile',
      },
    ],
    optional: [
      { key: 'prompt', label: 'Prompt' },
      { key: 'systemPrompt', label: 'System Prompt' },
    ],
    hints: ['Requires a valid API key configured on the server for the chosen provider.'],
  },
  http: {
    label: 'HTTP Request',
    required: [{ key: 'url', label: 'URL', hint: 'Full URL including https://' }],
    optional: [
      { key: 'method', label: 'Method' },
      { key: 'headers', label: 'Headers' },
      { key: 'body', label: 'Body' },
    ],
    hints: [],
  },
  webhook: {
    label: 'Webhook',
    required: [{ key: 'url', label: 'URL', hint: 'Webhook endpoint URL' }],
    optional: [{ key: 'method', label: 'Method' }],
    hints: [],
  },
  condition: {
    label: 'Condition',
    required: [],
    optional: [
      { key: 'expression', label: 'Expression' },
      { key: 'field', label: 'Field' },
    ],
    hints: ['Set an expression like "input.score > 80" or use field/operator/value.'],
  },
  transform: {
    label: 'Transform',
    required: [],
    optional: [{ key: 'mapping', label: 'Mapping' }],
    hints: ['If empty, passes input data through unchanged.'],
  },
  delay: {
    label: 'Delay',
    required: [],
    optional: [{ key: 'ms', label: 'Duration (ms)' }],
    hints: ['Defaults to 1000ms. Max 5s in serverless mode.'],
  },
  tool: {
    label: 'Tool',
    required: [
      { key: 'toolId', label: 'Tool ID', hint: 'ID of a registered tool from Agent Hub → Tools' },
    ],
    optional: [{ key: 'payload', label: 'Payload' }],
    hints: [],
  },
  loop: {
    label: 'Loop',
    required: [{ key: 'arrayPath', label: 'Array Path', hint: 'e.g. input.items' }],
    optional: [{ key: 'maxIterations', label: 'Max Iterations' }],
    hints: [],
  },
};

function validateNode(node) {
  const blockType = node.data?.blockType || node.data?.blockId;
  const config = node.data?.config || {};
  const label = node.data?.label || blockType || 'Unknown';
  const rules = VALIDATION_RULES[blockType];

  if (!rules) {
    return {
      nodeId: node.id,
      label,
      blockType: blockType || 'unknown',
      status: 'ok',
      missing: [],
      present: [],
      hints: ['No specific config required.'],
    };
  }

  const missing = [];
  const present = [];

  for (const req of rules.required) {
    const val = config[req.key];
    if (!val || (typeof val === 'string' && !val.trim())) {
      missing.push(req);
    } else {
      present.push({
        ...req,
        value: typeof val === 'string' && val.length > 40 ? val.slice(0, 40) + '...' : val,
      });
    }
  }

  for (const opt of rules.optional) {
    const val = config[opt.key];
    if (val && (typeof val !== 'string' || val.trim())) {
      present.push({
        ...opt,
        value: typeof val === 'string' && val.length > 40 ? val.slice(0, 40) + '...' : val,
      });
    }
  }

  return {
    nodeId: node.id,
    label,
    blockType: blockType || 'unknown',
    status: missing.length > 0 ? 'error' : 'ok',
    missing,
    present,
    hints: rules.hints,
  };
}

function buildExecutionOrder(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map();
  const adj = new Map();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      adj.get(e.source).push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(id);
    for (const next of adj.get(id) || []) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  for (const n of nodes) {
    if (!sorted.includes(n.id)) sorted.push(n.id);
  }

  return sorted.map((id) => nodeMap.get(id)).filter(Boolean);
}

/** Analyze the graph structure for the run report. */
function analyzeGraph(nodes, edges) {
  if (!nodes?.length) return null;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDeg = new Map();
  const outDeg = new Map();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    outDeg.set(n.id, 0);
  }
  for (const e of edges || []) {
    if (nodeMap.has(e.target)) inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
    if (nodeMap.has(e.source)) outDeg.set(e.source, (outDeg.get(e.source) || 0) + 1);
  }

  const entryNodes = nodes.filter((n) => inDeg.get(n.id) === 0);
  const exitNodes = nodes.filter((n) => outDeg.get(n.id) === 0);
  const disconnected = nodes.filter((n) => inDeg.get(n.id) === 0 && outDeg.get(n.id) === 0);
  const branchPoints = nodes.filter((n) => outDeg.get(n.id) > 1);
  const mergePoints = nodes.filter((n) => inDeg.get(n.id) > 1);

  // Count block types
  const typeCounts = {};
  for (const n of nodes) {
    const t = n.data?.blockType || n.data?.blockId || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  // Build connection map: source label -> target label
  const connections = (edges || []).map((e) => {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    return {
      from: src?.data?.label || e.source,
      to: tgt?.data?.label || e.target,
      id: e.data?.connectionId || e.id,
    };
  });

  // Detect if n8n imported
  const hasN8nData = nodes.some((n) => n.data?._n8nType);
  const n8nTypes = hasN8nData
    ? [...new Set(nodes.filter((n) => n.data?._n8nType).map((n) => n.data._n8nType))]
    : [];

  // LLM provider summary
  const llmNodes = nodes.filter((n) => (n.data?.blockType || n.data?.blockId) === 'llm');
  const providers = [...new Set(llmNodes.map((n) => n.data?.config?.provider).filter(Boolean))];
  const models = [
    ...new Set(
      llmNodes
        .map((n) => {
          const m = n.data?.config?.model;
          return typeof m === 'object' ? m?.id || m?.name : m;
        })
        .filter(Boolean)
    ),
  ];

  return {
    entryNodes,
    exitNodes,
    disconnected: disconnected.filter((n) => {
      const t = n.data?.blockType || n.data?.blockId;
      return t !== 'trigger'; // Triggers with 0 in-degree are normal
    }),
    branchPoints,
    mergePoints,
    typeCounts,
    connections,
    hasN8nData,
    n8nTypes,
    llmNodes,
    providers,
    models,
  };
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

/** Small info row used in the workflow info section. */
function InfoRow({ icon, label, value, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4 }}>
      {icon && (
        <Box sx={{ color: 'text.disabled', display: 'flex', alignItems: 'center' }}>{icon}</Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, fontWeight: 600 }}>
        {label}
      </Typography>
      {value != null && (
        <Typography variant="caption" sx={{ fontWeight: 500 }}>
          {value}
        </Typography>
      )}
      {children}
    </Box>
  );
}

/** Collapsible section header. */
function SectionHeader({ label, expanded, onToggle, count, color }) {
  return (
    <Box
      onClick={onToggle}
      sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', py: 0.5 }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: 'text.secondary', flex: 1, letterSpacing: 0.5 }}
      >
        {label}
      </Typography>
      {count != null && (
        <Chip
          label={count}
          size="small"
          sx={{ fontSize: 10, height: 18, mr: 0.5, bgcolor: color || 'action.hover' }}
        />
      )}
      {expanded ? (
        <AppIcon
          name="ExpandLess"
          fallback={ExpandLessIcon}
          sx={{ fontSize: 16, color: 'text.disabled' }}
        />
      ) : (
        <AppIcon
          name="ExpandMore"
          fallback={ExpandMoreIcon}
          sx={{ fontSize: 16, color: 'text.disabled' }}
        />
      )}
    </Box>
  );
}

function NodeValidationRow({ step, index, total }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(step.status === 'error');
  const isError = step.status === 'error';
  const color = isError ? theme.palette.error.main : theme.palette.success.main;
  const Icon = isError ? ErrorOutlineIcon : CheckCircleIcon;

  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          borderRadius: 2,
          cursor: 'pointer',
          bgcolor: alpha(color, 0.06),
          '&:hover': { bgcolor: alpha(color, 0.12) },
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            bgcolor: alpha(color, 0.15),
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </Box>

        <AppIcon fallback={Icon} sx={{ fontSize: 16, color, flexShrink: 0 }} />

        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, fontSize: 13 }}>
          {step.label}
        </Typography>

        <Chip
          label={step.blockType}
          size="small"
          variant="outlined"
          sx={{ fontSize: 10, height: 20 }}
        />

        {isError && (
          <Chip
            label={`${step.missing.length} missing`}
            size="small"
            color="error"
            sx={{ fontSize: 10, height: 20 }}
          />
        )}

        <IconButton size="small" sx={{ p: 0.25 }}>
          {expanded ? (
            <AppIcon name="ExpandLess" fallback={ExpandLessIcon} fontSize="small" />
          ) : (
            <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} fontSize="small" />
          )}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ pl: 5, pr: 1, py: 1 }}>
          {step.missing.length > 0 && (
            <Box sx={{ mb: 1 }}>
              {step.missing.map((m) => (
                <Box
                  key={m.key}
                  sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}
                >
                  <AppIcon
                    name="WarningAmber"
                    fallback={WarningAmberIcon}
                    sx={{ fontSize: 14, color: 'error.main', mt: 0.25 }}
                  />
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>
                      {m.label}
                    </Typography>
                    {m.hint && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', fontSize: 11 }}
                      >
                        {m.hint}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {step.present.length > 0 && (
            <Box sx={{ mb: 1 }}>
              {step.present.map((p) => (
                <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                  <AppIcon
                    name="CheckCircle"
                    fallback={CheckCircleIcon}
                    sx={{ fontSize: 12, color: 'success.main' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {p.label}: <strong>{String(p.value)}</strong>
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {step.hints.map((hint, i) => (
            <Typography
              key={i}
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', fontSize: 11, fontStyle: 'italic' }}
            >
              {hint}
            </Typography>
          ))}

          {isError && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AppIcon
                name="Settings"
                fallback={SettingsIcon}
                sx={{ fontSize: 13, color: 'text.secondary' }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                Click the settings icon on this block in the canvas to configure it.
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
      {index < total - 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.25 }}>
          <Typography sx={{ color: 'text.disabled', fontSize: 14, lineHeight: 1 }}>↓</Typography>
        </Box>
      )}
    </Box>
  );
}

export default function RunWorkflowDialog({
  open,
  onClose,
  workflowId,
  workflowName,
  workflow,
  nodes,
  edges,
  onExecutionStart,
}) {
  const theme = useTheme();
  const [triggerJson, setTriggerJson] = useState('{}');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [showTrigger, setShowTrigger] = useState(false);
  const [validation, setValidation] = useState(null);
  const [showInfo, setShowInfo] = useState(true);
  const [showDataFlow, setShowDataFlow] = useState(false);
  const [showConnections, setShowConnections] = useState(false);

  useEffect(() => {
    if (open && nodes?.length > 0) {
      const ordered = buildExecutionOrder(nodes, edges || []);
      const results = ordered.map((n) => validateNode(n));
      setValidation(results);
    } else if (open) {
      setValidation([]);
    }
  }, [open, nodes, edges]);

  const graph = useMemo(() => analyzeGraph(nodes, edges), [nodes, edges]);

  const errorCount = validation ? validation.filter((v) => v.status === 'error').length : 0;
  const readyCount = validation ? validation.filter((v) => v.status === 'ok').length : 0;
  const totalNodes = validation ? validation.length : 0;

  const handleRun = async () => {
    setError('');
    setResult(null);
    setRunning(true);

    let triggerData = {};
    try {
      triggerData = JSON.parse(triggerJson);
    } catch {
      setError('Invalid JSON in trigger data');
      setRunning(false);
      return;
    }

    try {
      const { job_id } = await startExecution(workflowId, triggerData);
      onExecutionStart?.(job_id);

      pollExecution(job_id, (data) => {
        if (data.status === 'done') {
          setResult(data.result || data);
          setRunning(false);
        } else if (data.status === 'failed') {
          setError(data.error || 'Execution failed');
          setRunning(false);
        }
      });
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  };

  const handleClose = () => {
    if (running) return;
    setError('');
    setResult(null);
    setTriggerJson('{}');
    setShowTrigger(false);
    setValidation(null);
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Run Workflow"
      icon={PlayArrowIcon}
      disableEscapeKeyDown={running}
      actions={
        <>
          <Button
            onClick={handleClose}
            disabled={running}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              variant="contained"
              onClick={handleRun}
              disabled={running || totalNodes === 0}
              startIcon={
                running ? (
                  <CircularProgress size={16} />
                ) : (
                  <AppIcon name="PlayArrow" fallback={PlayArrowIcon} />
                )
              }
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              {running
                ? 'Running...'
                : errorCount > 0
                  ? `Run Anyway (${errorCount} warnings)`
                  : 'Run'}
            </Button>
          )}
        </>
      }
    >
      {/* Workflow name & summary */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <strong>{workflowName || 'Workflow'}</strong> — {totalNodes} node
        {totalNodes !== 1 ? 's' : ''} in execution order
      </Typography>
      {/* Summary chips */}
      {validation && (
        <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
          <Chip
            icon={<AppIcon name="CheckCircle" fallback={CheckCircleIcon} />}
            label={`${readyCount} ready`}
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          {errorCount > 0 && (
            <Chip
              icon={<AppIcon name="ErrorOutline" fallback={ErrorOutlineIcon} />}
              label={`${errorCount} need config`}
              size="small"
              color="error"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          )}
          <Chip
            label={`${(edges || []).length} connections`}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          {graph?.providers?.length > 0 && (
            <Chip
              label={graph.providers.join(', ')}
              size="small"
              variant="outlined"
              color="primary"
              sx={{ fontWeight: 600, textTransform: 'capitalize' }}
            />
          )}
        </Box>
      )}
      {/* ============ WORKFLOW INFO SECTION ============ */}
      {workflow && (
        <>
          <SectionHeader
            label="WORKFLOW INFO"
            expanded={showInfo}
            onToggle={() => setShowInfo(!showInfo)}
          />
          <Collapse in={showInfo}>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                mb: 1.5,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.info.main, 0.04),
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.5),
              }}
            >
              <InfoRow
                icon={
                  <AppIcon
                    name="AccountTreeOutlined"
                    fallback={AccountTreeOutlinedIcon}
                    sx={{ fontSize: 14 }}
                  />
                }
                label="Status"
              >
                <Chip
                  label={workflow.enabled !== false ? 'Active' : 'Paused'}
                  size="small"
                  color={workflow.enabled !== false ? 'success' : 'default'}
                  sx={{ fontSize: 10, height: 18 }}
                />
              </InfoRow>

              {workflow.description && (
                <InfoRow
                  icon={
                    <AppIcon
                      name="InfoOutlined"
                      fallback={InfoOutlinedIcon}
                      sx={{ fontSize: 14 }}
                    />
                  }
                  label="Description"
                  value={workflow.description}
                />
              )}

              <InfoRow
                icon={
                  <AppIcon
                    name="CalendarTodayOutlined"
                    fallback={CalendarTodayOutlinedIcon}
                    sx={{ fontSize: 14 }}
                  />
                }
                label="Created"
                value={formatDate(workflow.createdAt)}
              />
              <InfoRow
                icon={
                  <AppIcon
                    name="CalendarTodayOutlined"
                    fallback={CalendarTodayOutlinedIcon}
                    sx={{ fontSize: 14 }}
                  />
                }
                label="Updated"
                value={formatDate(workflow.updatedAt)}
              />

              {(workflow.updatedByEmail || workflow.createdBy) && (
                <InfoRow
                  icon={
                    <AppIcon
                      name="PersonOutline"
                      fallback={PersonOutlineIcon}
                      sx={{ fontSize: 14 }}
                    />
                  }
                  label="User"
                  value={workflow.updatedByEmail || workflow.createdBy}
                />
              )}

              {/* Block type breakdown */}
              {graph?.typeCounts && (
                <Box sx={{ mt: 0.75 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                  >
                    Block Types
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {Object.entries(graph.typeCounts).map(([type, count]) => (
                      <Chip
                        key={type}
                        label={`${type} (${count})`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: 10, height: 18, textTransform: 'capitalize' }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {/* LLM details */}
              {graph?.llmNodes?.length > 0 && (
                <Box sx={{ mt: 0.75 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                  >
                    AI / LLM
                  </Typography>
                  {graph.providers.length > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', fontSize: 11 }}>
                      Providers: <strong>{graph.providers.join(', ')}</strong>
                    </Typography>
                  )}
                  {graph.models.length > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', fontSize: 11 }}>
                      Models: <strong>{graph.models.join(', ')}</strong>
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', fontSize: 11 }}
                  >
                    {graph.llmNodes.length} LLM node{graph.llmNodes.length > 1 ? 's' : ''} will call
                    external AI APIs
                  </Typography>
                </Box>
              )}

              {/* n8n import info */}
              {graph?.hasN8nData && (
                <Box sx={{ mt: 0.75 }}>
                  <Chip
                    label="Imported from n8n"
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ fontSize: 10, height: 18, mb: 0.5 }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', fontSize: 11 }}
                  >
                    {graph.n8nTypes.length} n8n node type{graph.n8nTypes.length > 1 ? 's' : ''}{' '}
                    mapped
                  </Typography>
                </Box>
              )}
            </Box>
          </Collapse>
        </>
      )}
      {/* ============ DATA FLOW ANALYSIS ============ */}
      {graph && (
        <>
          <SectionHeader
            label="DATA FLOW ANALYSIS"
            expanded={showDataFlow}
            onToggle={() => setShowDataFlow(!showDataFlow)}
            count={graph.disconnected.length > 0 ? `${graph.disconnected.length} issues` : null}
            color={
              graph.disconnected.length > 0 ? alpha(theme.palette.warning.main, 0.2) : undefined
            }
          />
          <Collapse in={showDataFlow}>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                mb: 1.5,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.background.default, 0.5),
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.5),
              }}
            >
              {/* Entry points */}
              <Box sx={{ mb: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'success.main', display: 'block', fontSize: 11 }}
                >
                  ENTRY POINTS ({graph.entryNodes.length})
                </Typography>
                {graph.entryNodes.map((n) => (
                  <Typography
                    key={n.id}
                    variant="caption"
                    sx={{ display: 'block', fontSize: 11, pl: 1 }}
                  >
                    {n.data?.label || n.id}
                    <Chip
                      label={n.data?.blockType || n.data?.blockId || '?'}
                      size="small"
                      sx={{ fontSize: 9, height: 16, ml: 0.5 }}
                    />
                  </Typography>
                ))}
              </Box>

              {/* Exit points */}
              <Box sx={{ mb: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'info.main', display: 'block', fontSize: 11 }}
                >
                  EXIT POINTS ({graph.exitNodes.length})
                </Typography>
                {graph.exitNodes.map((n) => (
                  <Typography
                    key={n.id}
                    variant="caption"
                    sx={{ display: 'block', fontSize: 11, pl: 1 }}
                  >
                    {n.data?.label || n.id}
                    <Chip
                      label={n.data?.blockType || n.data?.blockId || '?'}
                      size="small"
                      sx={{ fontSize: 9, height: 16, ml: 0.5 }}
                    />
                  </Typography>
                ))}
              </Box>

              {/* Branch / merge points */}
              {graph.branchPoints.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: 'warning.main', display: 'block', fontSize: 11 }}
                  >
                    BRANCH POINTS ({graph.branchPoints.length})
                  </Typography>
                  {graph.branchPoints.map((n) => (
                    <Typography
                      key={n.id}
                      variant="caption"
                      sx={{ display: 'block', fontSize: 11, pl: 1 }}
                    >
                      {n.data?.label || n.id} — splits into multiple paths
                    </Typography>
                  ))}
                </Box>
              )}

              {graph.mergePoints.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: 'secondary.main',
                      display: 'block',
                      fontSize: 11,
                    }}
                  >
                    MERGE POINTS ({graph.mergePoints.length})
                  </Typography>
                  {graph.mergePoints.map((n) => (
                    <Typography
                      key={n.id}
                      variant="caption"
                      sx={{ display: 'block', fontSize: 11, pl: 1 }}
                    >
                      {n.data?.label || n.id} — receives from multiple nodes
                    </Typography>
                  ))}
                </Box>
              )}

              {/* Disconnected nodes warning */}
              {graph.disconnected.length > 0 && (
                <Alert severity="warning" sx={{ py: 0.25, px: 1, fontSize: 11, mt: 0.5 }}>
                  {graph.disconnected.length} disconnected node
                  {graph.disconnected.length > 1 ? 's' : ''}:{' '}
                  {graph.disconnected.map((n) => n.data?.label || n.id).join(', ')}. Connect them or
                  remove to avoid skipped execution.
                </Alert>
              )}
            </Box>
          </Collapse>
        </>
      )}
      {/* ============ CONNECTION MAP ============ */}
      {graph?.connections?.length > 0 && (
        <>
          <SectionHeader
            label="CONNECTION MAP"
            expanded={showConnections}
            onToggle={() => setShowConnections(!showConnections)}
            count={graph.connections.length}
          />
          <Collapse in={showConnections}>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                mb: 1.5,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.background.default, 0.5),
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.5),
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {graph.connections.map((c, i) => (
                <Box
                  key={c.id || i}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}
                >
                  <Chip
                    label={i + 1}
                    size="small"
                    sx={{
                      fontSize: 9,
                      height: 16,
                      minWidth: 20,
                      bgcolor: alpha(theme.palette.success.main, 0.12),
                      color: 'success.main',
                      fontWeight: 700,
                    }}
                  />
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11 }}>
                    {c.from}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>
                    →
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11 }}>
                    {c.to}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Collapse>
        </>
      )}
      <Divider sx={{ my: 1 }} />
      {/* ============ EXECUTION ORDER ============ */}
      {validation && validation.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              mb: 1,
              display: 'block',
              letterSpacing: 0.5,
            }}
          >
            EXECUTION ORDER
          </Typography>
          {validation.map((step, i) => (
            <NodeValidationRow key={step.nodeId} step={step} index={i} total={validation.length} />
          ))}
        </Box>
      )}
      {validation && validation.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No nodes in this workflow. Add blocks to the canvas first.
        </Alert>
      )}
      {errorCount > 0 && !running && !result && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {errorCount} node{errorCount > 1 ? 's need' : ' needs'} configuration. Click the{' '}
          <AppIcon
            name="Settings"
            fallback={SettingsIcon}
            sx={{ fontSize: 14, verticalAlign: 'middle', mx: 0.25 }}
          />{' '}
          icon on each block in the canvas to set missing fields. You can still run, but those nodes
          may fail.
        </Alert>
      )}
      <Divider sx={{ my: 1 }} />
      {/* Trigger data (collapsible) */}
      <Box
        onClick={() => setShowTrigger(!showTrigger)}
        sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 1 }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: 'text.secondary', flex: 1, letterSpacing: 0.5 }}
        >
          TRIGGER DATA (optional)
        </Typography>
        {showTrigger ? (
          <AppIcon
            name="ExpandLess"
            fallback={ExpandLessIcon}
            sx={{ fontSize: 16, color: 'text.disabled' }}
          />
        ) : (
          <AppIcon
            name="ExpandMore"
            fallback={ExpandMoreIcon}
            sx={{ fontSize: 16, color: 'text.disabled' }}
          />
        )}
      </Box>
      <Collapse in={showTrigger}>
        <TextField
          label="Trigger Data (JSON)"
          multiline
          rows={3}
          fullWidth
          value={triggerJson}
          onChange={(e) => setTriggerJson(e.target.value)}
          disabled={running}
          sx={{ mb: 2 }}
          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
        />
      </Collapse>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {running && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Running workflow...
          </Typography>
        </Box>
      )}
      {result && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Result
            </Typography>
            <Chip
              label={result.status || 'completed'}
              color={
                result.status === 'completed' || result.status === 'done' ? 'success' : 'default'
              }
              size="small"
            />
          </Box>
          <Box
            sx={{
              bgcolor: alpha(theme.palette.common.black, 0.03),
              borderRadius: 2,
              p: 2,
              maxHeight: 200,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(result, null, 2)}
          </Box>
        </Box>
      )}
    </FormDialog>
  );
}
