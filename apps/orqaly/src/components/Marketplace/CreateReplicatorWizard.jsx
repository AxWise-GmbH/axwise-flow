import { useEffect, useMemo, useState } from 'react';
import {
  Stack,
  Typography,
  TextField,
  MenuItem,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Box,
  Chip,
} from '@mui/material';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import FormDialog from '../Common/FormDialog';
import ReplicatorEndpointPicker from './ReplicatorEndpointPicker';
import ManualEndpointEditor from './ManualEndpointEditor';
import { discoverEndpoints, createReplicator } from '../../services/replicatorService';
import { selectEndpointsByPreset } from '../../../lib/replicator/preset-selector.js';

const STEPS = ['Tool', 'Discover', 'Select', 'Name & Save'];

function connectionTypeOf(tool) {
  return tool?.connectionType || tool?.connection_type || '';
}

function slugify(s) {
  return (
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'replicator'
  );
}

function buildBlueprint({ tool, endpoints, selectedIds, slug, displayName, preset }) {
  const selectedSet = new Set(selectedIds);
  const connType = connectionTypeOf(tool);
  const isHttp = connType === 'api';
  const integrationType = isHttp ? 'api' : 'composio';
  const phases = endpoints
    .filter((ep) => selectedSet.has(ep.id))
    .map((ep) => ({
      name: ep.name,
      description: ep.description || '',
      action_kind: isHttp ? 'http' : 'composio_action',
      action_config: isHttp
        ? { method: ep.method, path: ep.path, paramLocations: ep.paramLocations || {} }
        : { actionName: ep.id },
      input_schema: ep.inputSchema || { type: 'object', properties: {} },
      output_hint: { kind: 'auto' },
    }));

  // One page per distinct category, preserving alphabetical order; phases inside a page keep selection order.
  const byCategory = new Map();
  for (const ep of endpoints) {
    if (!selectedSet.has(ep.id)) continue;
    const cat = ep.category || 'General';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    const phase = phases.find((p) => p.action_config.actionName === ep.id);
    if (phase) byCategory.get(cat).push(phase);
  }
  const pages = Array.from(byCategory.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cat, catPhases]) => ({
      slug: slugify(cat),
      title: cat,
      description: null,
      phases: catPhases,
    }));

  return {
    source_tool_id: tool.id,
    slug,
    display_name: displayName,
    integration_type: integrationType,
    status: 'active',
    docs_source: { preset, discovered_count: endpoints.length, selected_count: selectedIds.length },
    pages: pages.length ? pages : [{ slug: 'main', title: 'Main', description: null, phases }],
  };
}

export default function CreateReplicatorWizard({ open, onClose, onCreated, tools }) {
  const eligibleTools = useMemo(
    () =>
      (tools || []).filter((t) => {
        const ct = t.connectionType || t.connection_type;
        return ct === 'composio' || ct === 'api';
      }),
    [tools]
  );

  const [stepIdx, setStepIdx] = useState(0);
  const [toolId, setToolId] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [endpoints, setEndpoints] = useState([]);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [preset, setPreset] = useState('basic');
  const [selectedIds, setSelectedIds] = useState([]);
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [apiSource, setApiSource] = useState('openapi'); // openapi | url | manual
  const [apiPayload, setApiPayload] = useState('');
  const [manualRows, setManualRows] = useState([]);
  const [allowLocalhost, setAllowLocalhost] = useState(false);

  const selectedTool = useMemo(
    () => eligibleTools.find((t) => t.id === toolId) || null,
    [eligibleTools, toolId]
  );

  useEffect(() => {
    if (!open) return undefined;
    setStepIdx(0);
    setToolId('');
    setEndpoints([]);
    setDiscoveryError(null);
    setPreset('basic');
    setSelectedIds([]);
    setSlug('');
    setDisplayName('');
    setSaveError(null);
    setApiSource('openapi');
    setApiPayload('');
    setManualRows([]);
    setAllowLocalhost(false);
    return undefined;
  }, [open]);

  const selectedIntegrationType = connectionTypeOf(selectedTool);

  useEffect(() => {
    if (!endpoints.length) return;
    if (preset === 'custom') return;
    const type = selectedIntegrationType === 'api' ? 'api' : 'composio';
    const ids = selectEndpointsByPreset(endpoints, preset, type);
    setSelectedIds(ids);
  }, [preset, endpoints, selectedIntegrationType]);

  useEffect(() => {
    if (!selectedTool) return;
    if (displayName) return;
    setDisplayName(selectedTool.name || '');
    setSlug(slugify(selectedTool.composioApp || selectedTool.name || ''));
  }, [selectedTool, displayName]);

  const runDiscovery = async () => {
    if (!toolId) return;
    setDiscovering(true);
    setDiscoveryError(null);
    try {
      const args = { toolId };
      if (selectedIntegrationType === 'api') {
        args.source = apiSource;
        if (apiSource === 'manual') args.payload = manualRows;
        else if (apiSource === 'openapi') args.payload = apiPayload;
        else args.payload = apiPayload; // url
        if (apiSource === 'url') args.allowLocalhost = allowLocalhost;
      }
      const data = await discoverEndpoints(args);
      const eps = Array.isArray(data.endpoints) ? data.endpoints : [];
      setEndpoints(eps);
      if (eps.length === 0) {
        setDiscoveryError('No endpoints discovered.');
      } else {
        setStepIdx(2);
      }
    } catch (err) {
      setDiscoveryError(err.message);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const blueprint = buildBlueprint({
        tool: selectedTool,
        endpoints,
        selectedIds,
        slug: slugify(slug),
        displayName: displayName || selectedTool.name || slug,
        preset,
      });
      const { replicatorId } = await createReplicator(blueprint);
      if (onCreated) onCreated(replicatorId, blueprint);
      onClose();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const canNextFrom = () => {
    if (stepIdx === 0) return !!toolId;
    if (stepIdx === 1) return endpoints.length > 0;
    if (stepIdx === 2) return selectedIds.length > 0;
    return slug && displayName;
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Create Replicator"
      icon={AutoFixHighOutlinedIcon}
      maxWidth="md"
      contentSx={{ minHeight: 420, display: 'flex', flexDirection: 'column', gap: 2 }}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            disabled={stepIdx === 0 || saving}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          >
            Back
          </Button>
          {stepIdx < 3 ? (
            <Button
              variant="contained"
              disabled={!canNextFrom()}
              onClick={() => {
                if (stepIdx === 1 && endpoints.length === 0) {
                  runDiscovery();
                } else {
                  setStepIdx((i) => Math.min(3, i + 1));
                }
              }}
            >
              Next
            </Button>
          ) : (
            <Button variant="contained" disabled={!canNextFrom() || saving} onClick={handleSave}>
              {saving ? <CircularProgress size={18} /> : 'Create replicator'}
            </Button>
          )}
        </>
      }
    >
      <Stepper activeStep={stepIdx} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {stepIdx === 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Pick a connected tool. Composio (actions) and HTTP API tools are supported.
          </Typography>
          <TextField
            select
            size="small"
            label="Tool"
            value={toolId}
            onChange={(e) => setToolId(e.target.value)}
            disabled={eligibleTools.length === 0}
            helperText={
              eligibleTools.length === 0
                ? 'No Composio or HTTP API tools connected. Go to /tools to add one.'
                : ''
            }
          >
            {eligibleTools.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}{' '}
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ ml: 1 }}
                  color="text.secondary"
                >
                  ({t.composioApp || t.id})
                </Typography>
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      ) : null}

      {stepIdx === 1 ? (
        <Stack spacing={1.5} alignItems="stretch">
          <Typography variant="body2" color="text.secondary">
            Discover the endpoints available on <strong>{selectedTool?.name}</strong>.
          </Typography>
          {selectedIntegrationType === 'api' ? (
            <>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={apiSource}
                onChange={(_, v) => v && setApiSource(v)}
              >
                <ToggleButton value="openapi">Paste OpenAPI JSON</ToggleButton>
                <ToggleButton value="url">OpenAPI URL</ToggleButton>
                <ToggleButton value="manual">Add endpoints manually</ToggleButton>
              </ToggleButtonGroup>
              {apiSource === 'openapi' ? (
                <TextField
                  multiline
                  minRows={8}
                  maxRows={16}
                  placeholder='{ "openapi": "3.0.0", "paths": { ... } }'
                  value={apiPayload}
                  onChange={(e) => setApiPayload(e.target.value)}
                />
              ) : null}
              {apiSource === 'url' ? (
                <Stack spacing={1}>
                  <TextField
                    size="small"
                    placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
                    value={apiPayload}
                    onChange={(e) => setApiPayload(e.target.value)}
                  />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <input
                      type="checkbox"
                      checked={allowLocalhost}
                      onChange={(e) => setAllowLocalhost(e.target.checked)}
                      id="replicator-allow-localhost"
                    />
                    <Typography
                      component="label"
                      htmlFor="replicator-allow-localhost"
                      variant="caption"
                      color="text.secondary"
                    >
                      Allow localhost / private IPs (dev only)
                    </Typography>
                  </Stack>
                </Stack>
              ) : null}
              {apiSource === 'manual' ? (
                <ManualEndpointEditor rows={manualRows} onChange={setManualRows} />
              ) : null}
            </>
          ) : null}
          <Box>
            <Button variant="contained" onClick={runDiscovery} disabled={discovering}>
              {discovering ? <CircularProgress size={18} /> : 'Discover endpoints'}
            </Button>
          </Box>
          {discoveryError ? <Alert severity="warning">{discoveryError}</Alert> : null}
          {endpoints.length > 0 ? (
            <Chip
              label={`${endpoints.length} endpoints discovered`}
              color="success"
              variant="outlined"
            />
          ) : null}
        </Stack>
      ) : null}

      {stepIdx === 2 ? (
        <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              Choose which endpoints become phase cards in the replicator.
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={preset}
              onChange={(_, v) => v && setPreset(v)}
            >
              <ToggleButton value="basic">Basic</ToggleButton>
              <ToggleButton value="full">Full</ToggleButton>
              <ToggleButton value="custom">Custom</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {preset !== 'custom' ? (
            <Alert severity="info">
              {preset === 'basic'
                ? 'Basic preset selected — system picks popular + read-only actions.'
                : 'Full preset selected — every discovered endpoint included.'}
            </Alert>
          ) : null}
          <Box sx={{ flex: 1, minHeight: 280, display: 'flex' }}>
            <ReplicatorEndpointPicker
              endpoints={endpoints}
              selected={selectedIds}
              onChange={(ids) => {
                setSelectedIds(ids);
                if (preset !== 'custom') setPreset('custom');
              }}
            />
          </Box>
        </Stack>
      ) : null}

      {stepIdx === 3 ? (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Name the replicator. The slug becomes the sidebar group label and URL segment.
          </Typography>
          <TextField
            size="small"
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <TextField
            size="small"
            label="Slug (1 word, lowercase)"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            helperText="Appears in the sidebar as uppercase (e.g. github → GITHUB)."
          />
          {saveError ? <Alert severity="error">{saveError}</Alert> : null}
          <Alert severity="info">
            {selectedIds.length} phase{selectedIds.length === 1 ? '' : 's'} will be created across
            the grouped pages.
          </Alert>
        </Stack>
      ) : null}
    </FormDialog>
  );
}
