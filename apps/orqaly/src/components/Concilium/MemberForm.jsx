/**
 * MemberForm — Add/edit member dialog with role, provider, model, resume, skills.
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
  Chip,
  Slider,
  FormControlLabel,
  Switch,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import {
  MEMBER_ROLES,
  MEMBER_PROVIDERS,
  PROVIDER_MODELS,
} from '../../services/conciliumMembersService';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../config/assistantBrain';

const ROLE_HELP = {
  chairman: 'Leads the board and breaks ties. Final say on split decisions.',
  evaluator: 'Scores output against the board criteria. The standard voting role.',
  auditor: 'Checks completeness and compliance; flags missed requirements.',
  specialist: 'Brings domain expertise to specific evaluations.',
  observer: 'Participates without a binding vote (advisory only).',
};

const EMPTY_FORM = {
  name: '',
  role: 'evaluator',
  provider: DEFAULT_LLM_PROVIDER,
  model: DEFAULT_LLM_MODEL,
  resume: '',
  skills: [],
  temperature: 0.7,
  maxTokens: 2048,
  active: true,
};

export default function MemberForm({ open, onClose, onSave, editing, theme, isDark }) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [skillInput, setSkillInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name || '',
          role: editing.role || 'evaluator',
          provider: editing.provider || DEFAULT_LLM_PROVIDER,
          model: editing.model || DEFAULT_LLM_MODEL,
          resume: editing.resume || '',
          skills: editing.skills || [],
          temperature: editing.temperature ?? 0.7,
          maxTokens: editing.maxTokens ?? 2048,
          active: editing.active !== false,
        });
      } else {
        setForm({ ...EMPTY_FORM });
      }
      setSkillInput('');
    }
  }, [open, editing]);

  const models = PROVIDER_MODELS[form.provider] || [];

  const handleAddSkill = () => {
    if (skillInput.trim() && !form.skills.includes(skillInput.trim())) {
      setForm((f) => ({ ...f, skills: [...f.skills, skillInput.trim()] }));
      setSkillInput('');
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Member' : 'Add Member'}
      icon={PersonOutlineIcon}
      maxWidth="sm"
      primaryLabel={saving ? 'Saving…' : 'Save'}
      onPrimary={handleSubmit}
      primaryDisabled={!form.name.trim() || saving}
      primaryLoading={saving}
    >
      <TextField
        fullWidth
        size="small"
        label="Name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Role</InputLabel>
          <Select
            value={form.role}
            label="Role"
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            sx={{ borderRadius: 2 }}
          >
            {MEMBER_ROLES.map((r) => (
              <MenuItem key={r.value} value={r.value} sx={{ textTransform: 'capitalize' }}>
                {r.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Provider</InputLabel>
          <Select
            value={form.provider}
            label="Provider"
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value, model: '' }))}
            sx={{ borderRadius: 2 }}
          >
            {MEMBER_PROVIDERS.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <Typography
        variant="caption"
        sx={{
          color: 'text.disabled',
          display: 'block',
          mt: -1,
          mb: 2,
          fontSize: '0.68rem',
          lineHeight: 1.4,
        }}
      >
        {ROLE_HELP[form.role] || ''}
      </Typography>
      <FormControl size="small" fullWidth sx={{ mb: 2 }}>
        <InputLabel>Model</InputLabel>
        <Select
          value={form.model}
          label="Model"
          onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          sx={{ borderRadius: 2 }}
        >
          {models.map((m) => (
            <MenuItem key={m.value} value={m.value}>
              {m.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        fullWidth
        size="small"
        label="Resume / System Prompt"
        multiline
        rows={3}
        value={form.resume}
        onChange={(e) => setForm((f) => ({ ...f, resume: e.target.value }))}
        helperText="Persona and instructions injected as this member's system prompt during evaluations."
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            size="small"
            placeholder="Add skill..."
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSkill();
              }
            }}
            sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleAddSkill}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            Add
          </Button>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {form.skills.map((s) => (
            <Chip
              key={s}
              label={s}
              size="small"
              onDelete={() => setForm((f) => ({ ...f, skills: f.skills.filter((sk) => sk !== s) }))}
              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
            />
          ))}
        </Box>
      </Box>

      {/* ── Model tuning ── */}
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
        Model Tuning
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
        Temperature: {form.temperature.toFixed(2)}
      </Typography>
      <Slider
        value={form.temperature}
        onChange={(_, v) => setForm((f) => ({ ...f, temperature: v }))}
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
        Lower is more focused and consistent; higher is more creative. Evaluators usually run low
        (0.1–0.3).
      </Typography>
      <TextField
        fullWidth
        size="small"
        type="number"
        label="Max tokens"
        value={form.maxTokens}
        onChange={(e) =>
          setForm((f) => ({ ...f, maxTokens: Number.parseInt(e.target.value, 10) || 0 }))
        }
        inputProps={{ min: 256, max: 32000, step: 256 }}
        helperText="Upper bound on this member's response length per evaluation."
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      <FormControlLabel
        control={
          <Switch
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            size="small"
          />
        }
        label={
          <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
            Active (participates in evaluations)
          </Typography>
        }
      />
    </FormDialog>
  );
}
