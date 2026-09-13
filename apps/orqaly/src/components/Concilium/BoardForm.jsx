/**
 * BoardForm — Create/edit board dialog with v2 fields.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Chip,
  CircularProgress,
  alpha,
  Slider,
  FormControlLabel,
  Switch,
} from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FormDialog from '../Common/FormDialog';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import HistoryIcon from '@mui/icons-material/History';
import {
  CONCILIUM_STATUSES_LIST,
  LLM_OPTIONS_LIST,
  SECURITY_LEVELS_LIST,
  CONSENSUS_TYPES_LIST,
  SPLIT_STRATEGIES_LIST,
} from '../../services/conciliumService';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

const LLM_PROVIDER_COLORS = {
  OpenAI: '#10A37F',
  Anthropic: '#D4A574',
  Groq: '#F55036',
  DeepSeek: '#5B6EF5',
  GLM: '#1E88E5',
  Gemini: '#4285F4',
};

function SectionLabel({ icon, label }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      {icon && (
        <Box sx={{ color: 'text.secondary', display: 'flex', '& > *': { fontSize: 18 } }}>
          {icon}
        </Box>
      )}
      <Typography
        variant="overline"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          letterSpacing: '0.08em',
          fontSize: '0.7rem',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

const EMPTY_FORM = {
  name: '',
  purpose: '',
  status: 'active',
  llms: [],
  description: '',
  securityLevel: 'standard',
  approvalThreshold: 0.6,
  confidenceThreshold: 0.7,
  autoQuarantineOnViolation: false,
  consensusType: 'majority',
  quorum: 2,
  splitDecisionStrategy: 'chairman_decides',
};

// Keep the default reference stable. The organization preselection effect
// depends on this value and writes array state; allocating `[]` in the function
// signature would retrigger that effect after every render when the prop is
// omitted.
const EMPTY_ORGS = [];

export default function BoardForm({
  open,
  onClose,
  onSave,
  editing,
  saving,
  theme,
  isDark,
  orgs = EMPTY_ORGS,
  onShowLog,
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // Organizations this board governs (link is stored on organizations.consilium_id).
  const [selectedOrgs, setSelectedOrgs] = useState([]);

  // Preselect orgs already linked to the board being edited (or none for new).
  useEffect(() => {
    if (!open) return;
    const linked = editing ? (orgs || []).filter((o) => o.consilium_id === editing.id) : [];
    setSelectedOrgs(linked);
  }, [open, editing, orgs]);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name || '',
          purpose: editing.purpose || '',
          status: editing.status || 'active',
          llms: editing.llms || [],
          description: editing.description || '',
          securityLevel: editing.securityLevel || 'standard',
          approvalThreshold: editing.approvalThreshold ?? 0.6,
          confidenceThreshold: editing.confidenceThreshold ?? 0.7,
          autoQuarantineOnViolation: editing.autoQuarantineOnViolation ?? false,
          consensusType: 'majority',
          quorum: 2,
          splitDecisionStrategy: 'chairman_decides',
        });
      } else {
        setForm({ ...EMPTY_FORM });
      }
    }
  }, [open, editing]);

  // Load existing consensus rules when editing an existing board.
  useEffect(() => {
    if (!open || !editing?.id || !hasSupabase()) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('concilium_consensus_rules')
          .select('consensus_type, quorum, split_decision_strategy')
          .eq('concilium_id', editing.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (data && !cancelled) {
          setForm((f) => ({
            ...f,
            consensusType: data.consensus_type || 'majority',
            quorum: data.quorum ?? 2,
            splitDecisionStrategy: data.split_decision_strategy || 'chairman_decides',
          }));
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editing]);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onSave(
      form,
      selectedOrgs.map((o) => o.id)
    );
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Board' : 'New Board'}
      subtitle={editing ? `ID: ${editing.id}` : 'Create a new evaluation board'}
      icon={GroupsOutlinedIcon}
      maxWidth="sm"
      actions={
        <>
          <Button onClick={onClose} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          {editing && onShowLog && (
            <Button
              onClick={() => onShowLog(editing)}
              startIcon={<AppIcon name="History" fallback={HistoryIcon} />}
              sx={{ textTransform: 'none', color: 'text.secondary' }}
            >
              Log
            </Button>
          )}
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!form.name.trim() || saving}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
          >
            {saving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </>
      }
    >
      <Box>
        <SectionLabel
          icon={<AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} />}
          label="Details"
        />
        <TextField
          fullWidth
          size="small"
          label="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          fullWidth
          size="small"
          label="Description"
          multiline
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          fullWidth
          size="small"
          label="Purpose"
          multiline
          rows={2}
          value={form.purpose}
          onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
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
            {CONCILIUM_STATUSES_LIST.map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <SectionLabel
          icon={<AppIcon name="CorporateFareOutlined" fallback={CorporateFareOutlinedIcon} />}
          label="Organizations"
        />
        <Autocomplete
          multiple
          options={orgs}
          getOptionLabel={(o) => o.name || o.id}
          value={selectedOrgs}
          onChange={(_, v) => setSelectedOrgs(v)}
          isOptionEqualToValue={(opt, val) => opt.id === val.id}
          renderTags={(value, getTagProps) =>
            value.map((o, idx) => (
              <Chip
                {...getTagProps({ index: idx })}
                key={o.id}
                label={o.name || o.id}
                size="small"
                sx={{ fontWeight: 600, fontSize: '0.7rem' }}
              />
            ))
          }
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label="Organizations governed by this board"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          )}
          sx={{ mb: 1 }}
        />
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            display: 'block',
            mb: 3,
            fontSize: '0.68rem',
            lineHeight: 1.4,
          }}
        >
          Links these organizations to this board (each org appears under Home → Consilium
          Activity). An org can be governed by one board at a time.
        </Typography>

        <SectionLabel
          icon={<AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />}
          label="LLM Configuration"
        />
        <Autocomplete
          multiple
          options={LLM_OPTIONS_LIST}
          getOptionLabel={(o) => o.name}
          value={form.llms}
          onChange={(_, v) => setForm((f) => ({ ...f, llms: v }))}
          isOptionEqualToValue={(opt, val) => opt.id === val.id}
          renderTags={(value, getTagProps) =>
            value.map((llm, idx) => (
              <Chip
                {...getTagProps({ index: idx })}
                key={llm.id}
                label={llm.name}
                size="small"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  bgcolor: alpha(LLM_PROVIDER_COLORS[llm.provider] || '#888', isDark ? 0.15 : 0.1),
                  color: LLM_PROVIDER_COLORS[llm.provider] || 'text.secondary',
                  border: `1px solid ${alpha(LLM_PROVIDER_COLORS[llm.provider] || '#888', 0.3)}`,
                }}
              />
            ))
          }
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label="Select LLMs"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          )}
          sx={{ mb: 3 }}
        />

        <SectionLabel
          icon={<AppIcon name="ShieldOutlined" fallback={ShieldOutlinedIcon} />}
          label="Security & Thresholds"
        />
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel>Security Level</InputLabel>
          <Select
            value={form.securityLevel}
            label="Security Level"
            onChange={(e) => setForm((f) => ({ ...f, securityLevel: e.target.value }))}
            sx={{ borderRadius: 2 }}
          >
            {SECURITY_LEVELS_LIST.map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
          Approval Threshold: {Math.round(form.approvalThreshold * 100)}%
        </Typography>
        <Slider
          value={form.approvalThreshold}
          onChange={(_, v) => setForm((f) => ({ ...f, approvalThreshold: v }))}
          min={0}
          max={1}
          step={0.05}
          size="small"
          sx={{ mb: 0.5 }}
        />
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            display: 'block',
            mb: 2,
            fontSize: '0.68rem',
            lineHeight: 1.4,
          }}
        >
          Minimum share of weighted member votes needed to mark an evaluation as <b>Approved</b>.
          Higher values are stricter — a result below {Math.round(form.approvalThreshold * 100)}%
          approval is rejected.
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
          Confidence Threshold: {Math.round(form.confidenceThreshold * 100)}%
        </Typography>
        <Slider
          value={form.confidenceThreshold}
          onChange={(_, v) => setForm((f) => ({ ...f, confidenceThreshold: v }))}
          min={0}
          max={1}
          step={0.05}
          size="small"
          sx={{ mb: 0.5 }}
        />
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            display: 'block',
            mb: 2,
            fontSize: '0.68rem',
            lineHeight: 1.4,
          }}
        >
          How sure the board must be before auto-deciding. Evaluations whose agreement falls under{' '}
          {Math.round(form.confidenceThreshold * 100)}% are escalated for human review instead of
          being auto-resolved.
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={form.autoQuarantineOnViolation}
              onChange={(e) =>
                setForm((f) => ({ ...f, autoQuarantineOnViolation: e.target.checked }))
              }
              size="small"
            />
          }
          label={
            <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
              Auto-quarantine on violation
            </Typography>
          }
          sx={{ mb: 0.5 }}
        />
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            display: 'block',
            mb: 3,
            fontSize: '0.68rem',
            lineHeight: 1.4,
          }}
        >
          When on, any member that triggers a security violation is automatically suspended from
          voting until reviewed.
        </Typography>

        <SectionLabel
          icon={<AppIcon name="GavelOutlined" fallback={GavelOutlinedIcon} />}
          label="Decision & Consensus"
        />
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            display: 'block',
            mb: 1.5,
            fontSize: '0.68rem',
            lineHeight: 1.4,
          }}
        >
          Controls how individual member votes combine into a single board decision.
        </Typography>
        <FormControl size="small" fullWidth sx={{ mb: 0.5 }}>
          <InputLabel>Consensus Type</InputLabel>
          <Select
            value={form.consensusType}
            label="Consensus Type"
            onChange={(e) => setForm((f) => ({ ...f, consensusType: e.target.value }))}
            sx={{ borderRadius: 2 }}
          >
            {CONSENSUS_TYPES_LIST.map((t) => (
              <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>
                {t}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            display: 'block',
            mb: 2,
            fontSize: '0.68rem',
            lineHeight: 1.4,
          }}
        >
          {form.consensusType === 'unanimous' && 'Every voting member must approve.'}
          {form.consensusType === 'majority' && 'More than half of voting members must approve.'}
          {form.consensusType === 'weighted' &&
            'Members are weighted (e.g. by role) and the approval threshold above is applied.'}
          {form.consensusType === 'custom' && 'Custom rules defined per board are applied.'}
        </Typography>
        <TextField
          fullWidth
          size="small"
          type="number"
          label="Quorum (minimum voters)"
          value={form.quorum}
          onChange={(e) =>
            setForm((f) => ({ ...f, quorum: Number.parseInt(e.target.value, 10) || 1 }))
          }
          inputProps={{ min: 1, max: 20 }}
          helperText="Fewest members that must respond for a decision to count."
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <FormControl size="small" fullWidth sx={{ mb: 0.5 }}>
          <InputLabel>Tie-break Strategy</InputLabel>
          <Select
            value={form.splitDecisionStrategy}
            label="Tie-break Strategy"
            onChange={(e) => setForm((f) => ({ ...f, splitDecisionStrategy: e.target.value }))}
            sx={{ borderRadius: 2 }}
          >
            {SPLIT_STRATEGIES_LIST.map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                {s.replace(/_/g, ' ')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            display: 'block',
            mb: 1,
            fontSize: '0.68rem',
            lineHeight: 1.4,
          }}
        >
          What happens when members are evenly split with no clear winner.
        </Typography>
      </Box>
    </FormDialog>
  );
}
