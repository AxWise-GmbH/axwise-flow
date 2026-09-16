/**
 * OrgVaultDialog — the organization's company briefing and its conditioning.
 *
 * The briefing is an open document on purpose. Fixed palette/font fields would
 * suit a marketing studio and fail a fintech (disclosure duties), a
 * manufacturer (safety tolerances) or a law firm (citation rules). Whatever is
 * written here becomes operating constraints injected into every agent working
 * for this organization.
 *
 * Props: { open, onClose, orgId, orgName }
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { getOrgVault, saveOrgVault, generateEnhancement } from '../../services/orgVaultService';

const SOURCE_LABEL = {
  axwise: 'AxWise',
  local_llm: 'Generated',
  user: 'Written by you',
  merged: 'Generated, edited by you',
};

export default function OrgVaultDialog({ open, onClose, orgId, orgName }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [briefing, setBriefing] = useState('');
  const [summary, setSummary] = useState('');
  const [summarySource, setSummarySource] = useState(null);
  const [briefingChanged, setBriefingChanged] = useState(false);
  const [enhancements, setEnhancements] = useState([]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getOrgVault(orgId);
      setBriefing(data.briefing || '');
      setSummary(data.summary || '');
      setSummarySource(data.summary_source || null);
      setBriefingChanged(Boolean(data.briefing_changed));
      setEnhancements(data.enhancements || []);
    } catch (err) {
      setError(err.message || 'Could not load the vault');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveOrgVault(orgId, { briefing });
      setNotice('Briefing saved.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async (confirmOverwrite = false) => {
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const result = await generateEnhancement(orgId, { confirmOverwrite });
      setSummary(result.content || '');
      setSummarySource(result.source || null);
      setNotice('Conditioning generated for every agent in this organization.');
      await load();
    } catch (err) {
      if (err.code === 'confirm_overwrite_required') {
        // Never silently replace text a person wrote.
        setError(
          'This conditioning was written or edited by hand. Generating again will replace it.'
        );
      } else {
        setError(err.message || 'Could not generate');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSummary = async () => {
    setSaving(true);
    setError('');
    try {
      await saveOrgVault(orgId, { summary, edited: true });
      setNotice('Conditioning saved.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`${orgName || 'Organization'} — Vault`}
      subtitle="Company briefing and the operating constraints derived from it"
      icon={BusinessOutlinedIcon}
      maxWidth="lg"
      actions={
        <>
          <Button onClick={onClose} color="inherit">
            Close
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save briefing'}
          </Button>
        </>
      }
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="warning">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(0, 1fr)' },
              gap: 2,
            }}
          >
            {/* ── Briefing: open document, no fixed fields ────────────── */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2">Organization briefing</Typography>
              <Typography variant="caption" color="text.secondary">
                Free text. Paste documents, rules, policies, tone, constraints, regulations or house
                style. No required fields.
              </Typography>
              <TextField
                multiline
                minRows={14}
                maxRows={22}
                fullWidth
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
                placeholder="Write anything about the company…"
                sx={FORM_FIELD_SX}
              />
              <Typography variant="caption" color="text.secondary" align="right">
                {briefing.length.toLocaleString()} characters
              </Typography>
            </Box>

            {/* ── Derived conditioning ─────────────────────────────────── */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>
                  Organization conditioning
                </Typography>
                {summarySource && (
                  <Chip size="small" label={SOURCE_LABEL[summarySource] || summarySource} />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Applied to every agent working for this organization. Editable.
              </Typography>

              {briefingChanged && (
                <Alert severity="info" sx={{ py: 0 }}>
                  The briefing changed since this was generated.
                </Alert>
              )}

              <TextField
                multiline
                minRows={11}
                maxRows={18}
                fullWidth
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Generate from the briefing, or write the constraints yourself."
                sx={FORM_FIELD_SX}
              />

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AutoAwesomeOutlinedIcon />}
                  disabled={generating || !briefing.trim()}
                  onClick={() => handleGenerate(false)}
                >
                  {generating ? 'Generating…' : 'Generate'}
                </Button>
                <Button size="small" onClick={handleSaveSummary} disabled={saving}>
                  Save conditioning
                </Button>
              </Box>
            </Box>
          </Box>

          <Divider />

          {/* ── Per-role conditioning ─────────────────────────────────── */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle2">Agent conditioning</Typography>
            {enhancements.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                None yet. The organization-wide conditioning above applies to every agent until a
                role gets its own.
              </Typography>
            ) : (
              <Box
                sx={{
                  border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                {enhancements.map((row) => (
                  <Box
                    key={row.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      gap: 1.5,
                      alignItems: 'center',
                      px: 1.5,
                      py: 1,
                      borderBottom: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
                      '&:last-of-type': { borderBottom: 'none' },
                      opacity: row.is_active ? 1 : 0.55,
                    }}
                  >
                    <Typography variant="body2" noWrap>
                      {row.agent_id
                        ? `Agent ${row.agent_id.slice(0, 8)}`
                        : row.role_key || 'All agents'}
                    </Typography>
                    <Chip size="small" label={SOURCE_LABEL[row.source] || row.source} />
                    <Typography variant="caption" color="text.secondary">
                      v{row.version}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={row.is_active ? 'success' : 'default'}
                      label={row.is_active ? 'Active' : 'Off'}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </FormDialog>
  );
}
