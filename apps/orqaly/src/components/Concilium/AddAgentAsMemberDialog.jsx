/**
 * AddAgentAsMemberDialog — seat existing Agent Hub agents (rows in the `agents`
 * table, e.g. GitHub-imported + activated ones) onto a Consilium board. Maps each
 * agent (name / system_prompt / capabilities / provider / model) to a
 * concilium_members shape; the user picks the board role (agents carry a free-text
 * job role, not the member enum). Reuses the existing addMember path via `onAdd`.
 *
 * Modeled on OrgAssignDialog (multi-select + search over getAgents()).
 * Props: { open, onClose, onAdd(memberData) => Promise, existingNames?: string[] }
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Checkbox,
  TextField,
  InputAdornment,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  alpha,
  useTheme,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import SearchIcon from '@mui/icons-material/Search';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { getAgents, syncAgentsFromSupabase } from '../../services/agentHubService';
import { MEMBER_ROLES, resolveMemberLlmPair } from '../../services/conciliumMembersService';
import { inferLlmProvider } from '../../utils/llmPair';

// Providers the concilium_members CHECK constraint accepts (agent default 'glm' is valid).
const VALID_PROVIDERS = ['groq', 'openai', 'anthropic', 'deepseek', 'glm', 'gemini'];

export function agentToMember(agent, role) {
  const explicitProvider = VALID_PROVIDERS.includes(agent.provider) ? agent.provider : undefined;
  const inferredProvider = inferLlmProvider(agent.model);
  const legacyProvider = VALID_PROVIDERS.includes(agent.connection_type)
    ? agent.connection_type
    : undefined;
  const candidateProvider = explicitProvider || (!inferredProvider ? legacyProvider : undefined);
  const llm = resolveMemberLlmPair({
    provider: VALID_PROVIDERS.includes(candidateProvider) ? candidateProvider : undefined,
    model: agent.model,
  });
  const skills = (Array.isArray(agent.capabilities) ? agent.capabilities : [])
    .filter((s) => typeof s === 'string')
    .slice(0, 50)
    .map((s) => s.slice(0, 100));
  return {
    name: agent.name || agent.role || 'Agent',
    role, // the picked board role (chairman/evaluator/...)
    provider: llm.provider,
    model: llm.model,
    resume: agent.system_prompt || '',
    skills,
  };
}

export default function AddAgentAsMemberDialog({ open, onClose, onAdd, existingNames = [] }) {
  const theme = useTheme();
  const accent = theme.palette.info.main;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('evaluator');
  const [saving, setSaving] = useState(false);

  const existing = useMemo(
    () => new Set(existingNames.map((n) => String(n).toLowerCase())),
    [existingNames]
  );

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setSearch('');
    setRole('evaluator');
    setLoading(true);
    (async () => {
      try {
        await syncAgentsFromSupabase();
        // Eligible = activated + not offline, and not already a member by name.
        const list = getAgents().filter(
          (a) =>
            (a.availability_status || 'available') !== 'offline' &&
            !existing.has(String(a.name || a.role || '').toLowerCase())
        );
        setItems(list);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, existing]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((a) =>
      `${a.name || ''} ${a.role || ''} ${a.category || ''}`.toLowerCase().includes(q)
    );
  }, [items, search]);

  const idOf = (a) => a.agent_id || a.id;
  const toggle = (id) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const handleSave = async () => {
    if (!selected.length) return;
    setSaving(true);
    try {
      const chosen = items.filter((a) => selected.includes(idOf(a)));
      for (const agent of chosen) {
        await onAdd(agentToMember(agent, role));
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title="Add from my agents"
      subtitle="Seat your Agent Hub agents on this board"
      icon={GroupsOutlinedIcon}
      iconVariant="info"
      primaryLabel={saving ? 'Adding...' : `Add${selected.length ? ` (${selected.length})` : ''}`}
      onPrimary={handleSave}
      primaryLoading={saving}
      contentSx={{ pt: 1, pb: 1 }}
    >
      <FormControl size="small" fullWidth sx={{ mb: 1.5, ...FORM_FIELD_SX }}>
        <InputLabel id="add-agent-role-label">Board role</InputLabel>
        <Select
          labelId="add-agent-role-label"
          label="Board role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {MEMBER_ROLES.map((r) => (
            <MenuItem key={r.value} value={r.value}>
              {r.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        size="small"
        fullWidth
        placeholder="Search agents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16 }} />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 1.5, ...FORM_FIELD_SX }}
      />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {!loading && filtered.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
          No eligible agents. Activate agents in the Marketplace first.
        </Typography>
      )}
      {!loading && filtered.length > 0 && (
        <Box sx={{ maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
          {filtered.map((a) => {
            const id = idOf(a);
            const checked = selected.includes(id);
            return (
              <Box
                key={id}
                onClick={() => toggle(id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  borderRadius: 1.5,
                  cursor: 'pointer',
                  mb: 0.25,
                  border: '1px solid',
                  borderColor: checked ? alpha(accent, 0.3) : 'transparent',
                  bgcolor: checked ? alpha(accent, 0.08) : 'transparent',
                  '&:hover': { bgcolor: alpha(accent, 0.06) },
                }}
              >
                <Checkbox
                  checked={checked}
                  onChange={() => toggle(id)}
                  size="small"
                  sx={{ p: 0, color: accent, '&.Mui-checked': { color: accent } }}
                  onClick={(e) => e.stopPropagation()}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: checked ? 600 : 400 }} noWrap>
                    {a.name || a.role}
                  </Typography>
                  {(a.role || a.category) && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {a.role}
                      {a.category ? ` · ${a.category}` : ''}
                    </Typography>
                  )}
                </Box>
                {a.imported_from?.source === 'github' && (
                  <Chip label="GitHub" size="small" sx={{ height: 18, fontSize: '0.55rem' }} />
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </FormDialog>
  );
}
