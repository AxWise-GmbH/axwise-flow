/**
 * AgentEnhancementTab — per-organization conditioning for one agent.
 *
 * The agent itself is shared across organizations: same skills, same tools,
 * same identity. What changes here is how one organization requires the work
 * done. Selecting a different organization shows a different set of rules for
 * the same agent.
 *
 * Generation is optional. Conditioning can be written entirely by hand, and
 * once it has been, regenerating asks before replacing it.
 *
 * Props: { agent }
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { listOrganizations } from '../../services/organizationService';
import {
  getEnhancement,
  saveEnhancement,
  generateEnhancement,
} from '../../services/orgVaultService';
import { roleKeyOf } from './roleKey';

const SOURCE_LABEL = {
  axwise: 'AxWise',
  local_llm: 'Generated',
  user: 'Written by you',
  merged: 'Generated, edited by you',
};

export default function AgentEnhancementTab({ agent }) {
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [content, setContent] = useState('');
  const [source, setSource] = useState(null);
  const [version, setVersion] = useState(null);
  const [isActive, setIsActive] = useState(true);
  const [pendingOverwrite, setPendingOverwrite] = useState(false);

  const roleKey = roleKeyOf(agent);

  useEffect(() => {
    let cancelled = false;
    listOrganizations()
      .then((list) => {
        if (cancelled) return;
        const active = (Array.isArray(list) ? list : []).filter((o) => o.is_active !== false);
        setOrgs(active);
        if (active.length && !orgId) setOrgId(active[0].id);
      })
      .catch(() => setOrgs([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    setNotice('');
    setPendingOverwrite(false);
    try {
      const row = await getEnhancement(orgId, { roleKey, agentId: agent?.id });
      setContent(row?.content || '');
      setSource(row?.source || null);
      setVersion(row?.version || null);
      setIsActive(row?.is_active ?? true);
    } catch (err) {
      setError(err.message || 'Could not load conditioning');
    } finally {
      setLoading(false);
    }
  }, [orgId, roleKey, agent?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveEnhancement(orgId, { roleKey, agentId: agent?.id, content, isActive });
      setNotice('Saved.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async (confirmOverwrite) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await generateEnhancement(orgId, {
        roleKey,
        agentId: agent?.id,
        confirmOverwrite,
      });
      setContent(result.content || '');
      setSource(result.source || null);
      setVersion(result.version || null);
      setPendingOverwrite(false);
      setNotice('Generated from the organization briefing.');
    } catch (err) {
      if (err.code === 'confirm_overwrite_required') {
        setPendingOverwrite(true);
        setError('You edited this conditioning. Generating again will replace what you wrote.');
      } else {
        setError(err.message || 'Could not generate');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!orgs.length) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          This agent belongs to no organization yet. Assign it to one in Organizations, then add a
          company briefing in that organization&apos;s Vault.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="org-enh-label">Organization</InputLabel>
          <Select
            labelId="org-enh-label"
            label="Organization"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {orgs.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
          }
          label="Active"
        />

        {source && <Chip size="small" label={SOURCE_LABEL[source] || source} />}
        {version != null && (
          <Typography variant="caption" color="text.secondary">
            v{version}
          </Typography>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary">
        Applied to this agent whenever it works on a goal for the selected organization. Skills say
        what the agent can do; this says how this company wants it done.
      </Typography>

      {error && <Alert severity="warning">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          <TextField
            multiline
            minRows={12}
            maxRows={20}
            fullWidth
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              'Generate from the organization briefing, or write the rules here.\n\n' +
              '## Tone\nUnderstated and factual. No superlatives.'
            }
          />
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}
          >
            <Typography variant="caption" color="text.secondary">
              {content.length.toLocaleString()} / 2,000 characters
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AutoAwesomeOutlinedIcon />}
                disabled={busy}
                onClick={() => handleGenerate(pendingOverwrite)}
              >
                {pendingOverwrite ? 'Replace anyway' : 'Generate'}
              </Button>
              <Button size="small" onClick={load} disabled={busy}>
                Revert
              </Button>
              <Button size="small" variant="contained" onClick={handleSave} disabled={busy}>
                Save
              </Button>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
