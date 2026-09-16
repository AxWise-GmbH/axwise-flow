/**
 * ConnectLibraryDialog — two-step flow:
 *   1) Catalog picker (grouped by subcategory)
 *   2) ConnectReviewStep (risk + per-action opt-in + OAuth kickoff)
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Stack,
  Paper,
  Chip,
  alpha,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import { getLibraryCatalog, connectLibrary } from '../../services/agentLibraryService';
import ConnectReviewStep from './ConnectReviewStep';

import AppIcon from '../icons/AppIcon';

const RISK_DOT = { low: '#16A34A', medium: '#D97706', high: '#DC2626' };

export default function ConnectLibraryDialog({
  open,
  onClose,
  agentId,
  alreadyConnectedToolIds = [],
  onConnected,
}) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTier, setActiveTier] = useState(''); // '' | 'low' | 'medium' | 'high'
  const [selected, setSelected] = useState(null); // catalog entry being reviewed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCatalog = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const data = await getLibraryCatalog();
      setCatalog(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Failed to load catalog');
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setSearch('');
      setActiveTier('');
      setSelected(null);
      setError('');
      setBusy(false);
    }
  }, [open]);

  const connectedSet = useMemo(() => new Set(alreadyConnectedToolIds), [alreadyConnectedToolIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalog.filter((e) => {
      if (activeTier && e.riskTier !== activeTier) return false;
      if (!term) return true;
      return (
        e.name.toLowerCase().includes(term) ||
        (e.description || '').toLowerCase().includes(term) ||
        e.subcategory.toLowerCase().includes(term)
      );
    });
  }, [catalog, search, activeTier]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      if (!map.has(e.subcategory)) map.set(e.subcategory, []);
      map.get(e.subcategory).push(e);
    }
    return [...map.entries()];
  }, [filtered]);

  const handleConfirm = async ({ optedInSensitive }) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.href : undefined;
      const result = await connectLibrary(agentId, selected.id, optedInSensitive, redirectUrl);
      // Open OAuth popup if Composio handed back a redirect URL
      const oauthUrl = result?.composio?.redirectUrl;
      if (oauthUrl && typeof window !== 'undefined') {
        window.open(oauthUrl, 'composio-oauth', 'width=600,height=700');
      }
      onConnected?.(result);
      onClose();
    } catch (e) {
      setError(e.message || 'Connect failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="md"
      title={selected ? 'Review & Connect' : 'Connect a Library'}
      icon={ExtensionOutlinedIcon}
      hideFooter
      contentSx={{ p: 0, pt: 0, px: 0, pb: 0 }}
      disableEscapeKeyDown={busy}
    >
      {selected ? (
        <ConnectReviewStep
          entry={selected}
          busy={busy}
          onCancel={() => setSelected(null)}
          onConfirm={handleConfirm}
        />
      ) : (
        <Box sx={{ p: 2 }}>
          {/* Search + risk filter */}
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search libraries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={FORM_FIELD_SX}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            {['', 'low', 'medium', 'high'].map((tier) => (
              <Chip
                key={tier || 'all'}
                label={tier ? tier.toUpperCase() : 'ALL'}
                size="small"
                onClick={() => setActiveTier(tier)}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  bgcolor:
                    activeTier === tier
                      ? tier
                        ? alpha(RISK_DOT[tier], 0.18)
                        : '#1E88E5'
                      : 'transparent',
                  color: activeTier === tier ? (tier ? RISK_DOT[tier] : '#fff') : 'text.secondary',
                  border: '1px solid',
                  borderColor:
                    activeTier === tier ? (tier ? RISK_DOT[tier] : '#1E88E5') : 'divider',
                }}
              />
            ))}
          </Stack>

          {error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
              {error}
            </Typography>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : grouped.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 4 }}>
              No libraries match.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {grouped.map(([subcategory, items]) => (
                <Box key={subcategory}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      fontSize: '0.65rem',
                      letterSpacing: '0.05em',
                      mb: 0.75,
                      display: 'block',
                    }}
                  >
                    {subcategory}
                  </Typography>
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 1,
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
                    }}
                  >
                    {items.map((e) => {
                      const already = connectedSet.has(e.id);
                      return (
                        <Tooltip key={e.id} title={already ? 'Already connected' : ''}>
                          <Paper
                            variant="outlined"
                            onClick={() => !already && setSelected(e)}
                            sx={{
                              p: 1.25,
                              borderRadius: 2,
                              cursor: already ? 'default' : 'pointer',
                              opacity: already ? 0.55 : 1,
                              transition: 'border-color 120ms, box-shadow 120ms',
                              '&:hover': already
                                ? undefined
                                : { borderColor: 'primary.main', boxShadow: 1 },
                            }}
                          >
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  bgcolor: RISK_DOT[e.riskTier] || '#888',
                                }}
                              />
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 700, fontSize: '0.82rem', flex: 1 }}
                              >
                                {e.name}
                              </Typography>
                              {e.popular && (
                                <AppIcon
                                  name="Star"
                                  fallback={StarIcon}
                                  sx={{ fontSize: 12, color: '#F59E0B' }}
                                />
                              )}
                            </Stack>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontSize: '0.7rem',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {e.description}
                            </Typography>
                          </Paper>
                        </Tooltip>
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
