import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  alpha,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../../components/Common/FormDialog';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined';
import { parseSketchFile, SUPPORTED_EXTENSIONS, MAX_FILE_BYTES } from './sketchParsers';
import { applyToAgent, createSketchPrompt } from '../../services/sketchPromptService';

import AppIcon from '../../components/icons/AppIcon';

const SOURCE_OPTIONS = [
  { id: 'file', label: 'File upload', icon: DescriptionOutlinedIcon, enabled: true },
  { id: 'api', label: 'API URL', icon: LinkOutlinedIcon, enabled: false },
  { id: 'mcp', label: 'MCP server', icon: HubOutlinedIcon, enabled: false },
  { id: 'paste', label: 'Paste / type', icon: ContentPasteOutlinedIcon, enabled: false },
];

function agentKey(a) {
  return a?._supabase_id || a?.id || null;
}
function agentLabel(a) {
  if (!a) return '';
  const name = a.name || a.role || 'Agent';
  const role = a.role && a.name ? a.role : null;
  return role ? `${name} - ${role}` : name;
}

export default function SketchImportDialog({
  open,
  onClose,
  agents = [],
  existingPromptId = null,
}) {
  const theme = useTheme();
  const [source, setSource] = useState('file');
  const [fileError, setFileError] = useState('');
  const [parseResult, setParseResult] = useState(null); // { prompts: [...] } from parseSketchFile
  const [activeIdx, setActiveIdx] = useState(0);
  const [editable, setEditable] = useState([]); // [{ name, description, content, sourceMeta }]
  const [agent, setAgent] = useState(null);
  const [applyNow, setApplyNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const agentOptions = useMemo(() => agents.filter(agentKey), [agents]);
  const isRetarget = !!existingPromptId;

  const resetParse = () => {
    setParseResult(null);
    setActiveIdx(0);
    setEditable([]);
    setFileError('');
  };

  const handleFiles = useCallback((files) => {
    setFileError('');
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`File is too large (> ${(MAX_FILE_BYTES / 1_000_000).toFixed(0)} MB).`);
      return;
    }
    const name = file.name || '';
    const lower = name.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      setFileError(`Unsupported file type. Use ${SUPPORTED_EXTENSIONS.join(', ')}.`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setFileError('Could not read file.');
    reader.onload = () => {
      const text = String(reader.result || '');
      const result = parseSketchFile(name, text);
      if (!result.ok) {
        setFileError(result.error);
        return;
      }
      setParseResult(result);
      setActiveIdx(0);
      setEditable(
        result.prompts.map((p) => ({
          name: p.name,
          description: p.description || '',
          content: p.content,
          sourceMeta: p.sourceMeta || {},
        }))
      );
    };
    reader.readAsText(file);
  }, []);

  const handleFileInput = (e) => handleFiles(e.target.files);
  const openPicker = () => fileInputRef.current?.click();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const updateField = (field, value) => {
    setEditable((prev) => {
      const next = prev.slice();
      next[activeIdx] = { ...next[activeIdx], [field]: value };
      return next;
    });
  };

  const activePrompt = editable[activeIdx];
  const canSave =
    !saving &&
    activePrompt &&
    activePrompt.name.trim() &&
    activePrompt.content.trim() &&
    (!applyNow || !!agent);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError('');
    try {
      if (isRetarget) {
        if (!agent) throw new Error('Pick an agent to apply to.');
        await applyToAgent(existingPromptId, agentKey(agent));
        onClose?.({ saved: true, applied: true });
        return;
      }
      const targetId = applyNow && agent ? agentKey(agent) : null;
      for (const p of editable) {
        await createSketchPrompt({
          name: p.name,
          description: p.description || null,
          content: p.content,
          sourceType: 'file',
          sourceMeta: p.sourceMeta || {},
          agentId: targetId,
          tags: Array.isArray(p.sourceMeta?.tags) ? p.sourceMeta.tags : [],
        });
      }
      onClose?.({ saved: true, applied: !!targetId });
    } catch (err) {
      setSaveError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={!!open}
      onClose={() => onClose?.({ saved: false })}
      maxWidth="md"
      title={isRetarget ? 'Apply prompt to an agent' : 'Import prompt'}
      icon={CloudUploadOutlinedIcon}
      primaryLabel={isRetarget ? 'Apply to agent' : applyNow ? 'Save & apply' : 'Save draft'}
      onPrimary={handleSave}
      primaryDisabled={!canSave}
    >
      {!isRetarget && (
        <>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}
          >
            SOURCE
          </Typography>
          <FormControl sx={{ mb: 1.5 }}>
            <RadioGroup row value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <FormControlLabel
                    key={opt.id}
                    value={opt.id}
                    disabled={!opt.enabled}
                    control={<Radio size="small" />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AppIcon fallback={Icon} sx={{ fontSize: 16 }} />
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {opt.label}
                        </Typography>
                        {!opt.enabled && (
                          <Chip
                            label="Soon"
                            size="small"
                            sx={{ height: 16, fontSize: '0.55rem', ml: 0.5 }}
                          />
                        )}
                      </Box>
                    }
                    sx={{ mr: 2 }}
                  />
                );
              })}
            </RadioGroup>
          </FormControl>

          <Divider sx={{ mb: 1.5 }} />

          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}
          >
            UPLOAD
          </Typography>
          <Box
            onClick={openPicker}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? 'primary.main' : alpha(theme.palette.text.primary, 0.2),
              borderRadius: 2,
              p: 2,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
              transition: 'background-color 0.15s, border-color 0.15s',
              mb: 1.25,
            }}
          >
            <AppIcon
              name="CloudUploadOutlined"
              fallback={CloudUploadOutlinedIcon}
              sx={{ fontSize: 28, color: 'text.disabled', mb: 0.5 }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
              Drop a file here or click to browse
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', fontSize: '0.68rem', display: 'block' }}
            >
              Supported: {SUPPORTED_EXTENSIONS.join(', ')} · max{' '}
              {(MAX_FILE_BYTES / 1_000_000).toFixed(0)} MB
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_EXTENSIONS.join(',')}
              onChange={handleFileInput}
              hidden
            />
          </Box>
          {fileError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {fileError}
            </Alert>
          )}
        </>
      )}
      {!isRetarget && parseResult && parseResult.prompts.length > 0 && (
        <>
          <Divider sx={{ mb: 1.5 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              PREVIEW
            </Typography>
            {parseResult.prompts.length > 1 && (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>
                {parseResult.prompts.length} prompts found - all will be imported
              </Typography>
            )}
            <Button
              size="small"
              onClick={resetParse}
              sx={{ ml: 'auto', textTransform: 'none', fontSize: '0.7rem' }}
            >
              Pick different file
            </Button>
          </Box>

          {parseResult.prompts.length > 1 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
              {editable.map((p, idx) => (
                <Chip
                  key={idx}
                  label={`${idx + 1}. ${p.name}`}
                  size="small"
                  onClick={() => setActiveIdx(idx)}
                  color={activeIdx === idx ? 'primary' : 'default'}
                  variant={activeIdx === idx ? 'filled' : 'outlined'}
                  sx={{ height: 22, fontSize: '0.68rem' }}
                />
              ))}
            </Box>
          )}

          {activePrompt && (
            <Stack spacing={1.25}>
              <TextField
                label="Name"
                size="small"
                value={activePrompt.name}
                onChange={(e) => updateField('name', e.target.value)}
                fullWidth
              />
              <TextField
                label="Description (optional)"
                size="small"
                value={activePrompt.description}
                onChange={(e) => updateField('description', e.target.value)}
                fullWidth
              />
              <TextField
                label="Prompt content"
                size="small"
                value={activePrompt.content}
                onChange={(e) => updateField('content', e.target.value)}
                fullWidth
                multiline
                minRows={6}
                maxRows={14}
                sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.78rem' } }}
              />
            </Stack>
          )}
        </>
      )}
      {(isRetarget || (parseResult && editable.length)) && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}
          >
            TARGET AGENT
          </Typography>
          {!isRetarget && (
            <FormControl sx={{ mb: 1 }}>
              <RadioGroup
                row
                value={applyNow ? 'apply' : 'draft'}
                onChange={(e) => setApplyNow(e.target.value === 'apply')}
              >
                <FormControlLabel
                  value="apply"
                  control={<Radio size="small" />}
                  label={
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      Apply now to an agent
                    </Typography>
                  }
                />
                <FormControlLabel
                  value="draft"
                  control={<Radio size="small" />}
                  label={
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      Save as draft
                    </Typography>
                  }
                />
              </RadioGroup>
            </FormControl>
          )}
          {(isRetarget || applyNow) && (
            <Autocomplete
              options={agentOptions}
              value={agent}
              onChange={(_, v) => setAgent(v)}
              getOptionLabel={agentLabel}
              isOptionEqualToValue={(a, b) => agentKey(a) === agentKey(b)}
              renderInput={(params) => (
                <TextField {...params} size="small" label="Agent" placeholder="Pick an agent" />
              )}
            />
          )}
          {agentOptions.length === 0 && (
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', fontSize: '0.7rem', display: 'block', mt: 0.5 }}
            >
              No agents found in this workspace. You can still save the prompt as a draft.
            </Typography>
          )}
          {saveError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {saveError}
            </Alert>
          )}
        </>
      )}
    </FormDialog>
  );
}
