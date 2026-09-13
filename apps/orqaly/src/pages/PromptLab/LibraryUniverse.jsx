/**
 * Library Universe - curated + promoted best-in-class deliverable examples.
 *
 * The library is the yardstick: Osja compares every completed goal against
 * these entries. Sharper anchors here → sharper criteria → goals that look
 * like the references on the first try.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Chip,
  Button,
  IconButton,
  Card,
  CardContent,
  CardActions,
  Grid,
  Tooltip,
  Snackbar,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  alpha,
  useTheme,
} from '@mui/material';
import CollectionsBookmarkOutlinedIcon from '@mui/icons-material/CollectionsBookmarkOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import {
  listLibraryEntries,
  deleteLibraryEntry,
  countByDeliverableType,
} from '../../services/libraryUniverseService';
import { listOrganizations } from '../../services/organizationService';
import CalibrationWizard from './CalibrationWizard';

import AppIcon from '../../components/icons/AppIcon';

const DELIVERABLE_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'landing_page', label: 'Landing pages' },
  { id: 'presentation', label: 'Presentations' },
  { id: 'smm_banner', label: 'Banners' },
  { id: 'document_template', label: 'Documents' },
  { id: 'table_structure', label: 'Tables' },
  { id: 'code', label: 'Code' },
];

const SOURCE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'curated', label: 'Curated' },
  { id: 'promoted', label: 'Promoted from goals' },
];

export function pickCalibrationOrganizationId(organizations, requestedId = null) {
  const active = (Array.isArray(organizations) ? organizations : []).filter(
    (organization) => organization?.id && organization.is_active !== false
  );
  if (requestedId && active.some((organization) => organization.id === requestedId)) {
    return requestedId;
  }
  const ordered = [...active].sort((left, right) => {
    const leftTime = Date.parse(left.created_at || '') || 0;
    const rightTime = Date.parse(right.created_at || '') || 0;
    return leftTime - rightTime || String(left.id).localeCompare(String(right.id));
  });
  return (
    ordered.find((organization) => organization.name?.trim().toLowerCase() === 'traktor')?.id ||
    ordered[0]?.id ||
    ''
  );
}

function scoreColor(score, theme) {
  if (score >= 95) return theme.palette.success.main;
  if (score >= 85) return theme.palette.primary.main;
  if (score >= 75) return theme.palette.warning.main;
  return theme.palette.text.disabled;
}

function LibraryCard({ entry, onCopyPrompt, onDelete }) {
  const theme = useTheme();
  const meta = entry.metadata || {};
  const score = Number(meta.quality_score) || 0;
  const isPromoted = meta.source === 'promoted';

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 120ms',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3 }}
              noWrap
            >
              {entry.title}
            </Typography>
            {meta.brand && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                {meta.brand}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              minWidth: 44,
              height: 44,
              borderRadius: 1.5,
              bgcolor: alpha(scoreColor(score, theme), 0.1),
              color: scoreColor(score, theme),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem',
            }}
          >
            {score}
          </Box>
        </Box>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontSize: '0.75rem',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            mb: 1,
          }}
        >
          {meta.what_makes_it_great || entry.content}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {isPromoted && (
            <Chip
              size="small"
              label="Promoted"
              icon={
                <AppIcon
                  name="AutoAwesomeOutlined"
                  fallback={AutoAwesomeOutlinedIcon}
                  sx={{ fontSize: 12 }}
                />
              }
              sx={{
                height: 20,
                fontSize: '0.65rem',
                bgcolor: alpha(theme.palette.secondary.main, 0.1),
                color: 'secondary.main',
              }}
            />
          )}
          {(entry.tags || []).slice(0, 3).map((tag) => (
            <Chip key={tag} size="small" label={tag} sx={{ height: 20, fontSize: '0.65rem' }} />
          ))}
        </Box>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 1.5, pt: 0, gap: 0.5 }}>
        {meta.asset_url && (
          <Tooltip title="View live">
            <IconButton
              size="small"
              component="a"
              href={meta.asset_url}
              target="_blank"
              rel="noopener"
            >
              <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        {meta.recreate_prompt && (
          <Tooltip title="Copy recreate prompt">
            <IconButton size="small" onClick={() => onCopyPrompt(meta.recreate_prompt)}>
              <AppIcon
                name="ContentCopyOutlined"
                fallback={ContentCopyOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            </IconButton>
          </Tooltip>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {isPromoted && (
          <Tooltip title="Remove from library">
            <IconButton size="small" onClick={() => onDelete(entry.id)}>
              <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </CardActions>
    </Card>
  );
}

export default function LibraryUniverse() {
  const [entries, setEntries] = useState([]);
  const [counts, setCounts] = useState({});
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceTab, setSourceTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [organizationLoadFailed, setOrganizationLoadFailed] = useState(false);
  const [calibrationOrganizationId, setCalibrationOrganizationId] = useState('');

  const sourceFilter = SOURCE_TABS[sourceTab].id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, c] = await Promise.all([
        listLibraryEntries({
          deliverableType: typeFilter === 'all' ? undefined : typeFilter,
          source: sourceFilter === 'all' ? undefined : sourceFilter,
        }),
        countByDeliverableType(),
      ]);
      setEntries(list);
      setCounts(c);
    } catch (err) {
      setSnack({ severity: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [typeFilter, sourceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const requestedId =
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('org') ||
          new URLSearchParams(window.location.search).get('org_id');
    listOrganizations()
      .then((result) => {
        if (cancelled) return;
        const list = Array.isArray(result) ? result : result?.organizations || [];
        const active = list.filter(
          (organization) => organization?.id && organization.is_active !== false
        );
        setOrganizations(active);
        setCalibrationOrganizationId(pickCalibrationOrganizationId(active, requestedId));
        setOrganizationLoadFailed(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setOrganizations([]);
        setOrganizationLoadFailed(true);
        setSnack({
          severity: 'error',
          message: error?.message || 'Could not load organizations for calibration',
        });
      })
      .finally(() => {
        if (!cancelled) setOrganizationsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyPrompt = (prompt) => {
    navigator.clipboard.writeText(prompt).then(
      () => setSnack({ severity: 'success', message: 'Recreate prompt copied to clipboard' }),
      () => setSnack({ severity: 'error', message: 'Copy failed' })
    );
  };

  const handleDelete = async (id) => {
    try {
      await deleteLibraryEntry(id);
      setSnack({ severity: 'success', message: 'Entry removed' });
      load();
    } catch (err) {
      setSnack({ severity: 'error', message: err.message });
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: '0.78rem', flexGrow: 1 }}
          >
            Best-in-class examples Osja measures every completed goal against. Curated anchors plus
            deliverables auto-promoted from your high-scoring goals (≥90).
          </Typography>
          <FormControl size="small" sx={{ minWidth: 180, flexShrink: 0 }}>
            <InputLabel id="calibration-scope-label">Calibration scope</InputLabel>
            <Select
              labelId="calibration-scope-label"
              label="Calibration scope"
              value={calibrationOrganizationId}
              onChange={(event) => setCalibrationOrganizationId(event.target.value)}
              disabled={!organizationsLoaded || organizationLoadFailed || wizardOpen}
            >
              <MenuItem value="">Personal</MenuItem>
              {organizations.map((organization) => (
                <MenuItem key={organization.id} value={organization.id}>
                  {organization.name || 'Unnamed organization'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              <AppIcon
                name="AutoFixHighOutlined"
                fallback={AutoFixHighOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            }
            onClick={() => setWizardOpen(true)}
            disabled={!organizationsLoaded || organizationLoadFailed}
            sx={{ textTransform: 'none', fontSize: '0.72rem', flexShrink: 0 }}
          >
            Run calibration
          </Button>
        </Box>

        <Tabs
          value={sourceTab}
          onChange={(_, v) => setSourceTab(v)}
          sx={{
            mb: 1.5,
            minHeight: 36,
            '& .MuiTab-root': { minHeight: 36, fontSize: '0.75rem', textTransform: 'none' },
          }}
        >
          {SOURCE_TABS.map((s) => (
            <Tab key={s.id} label={s.label} />
          ))}
        </Tabs>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {DELIVERABLE_TYPES.map((t) => {
            const count =
              t.id === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[t.id] || 0;
            const countSuffix = count > 0 ? ` · ${count}` : '';
            return (
              <Chip
                key={t.id}
                size="small"
                label={`${t.label}${countSuffix}`}
                onClick={() => setTypeFilter(t.id)}
                color={typeFilter === t.id ? 'primary' : 'default'}
                variant={typeFilter === t.id ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.7rem' }}
              />
            );
          })}
        </Box>
      </Box>
      {loading && (
        <Typography variant="caption" color="text.secondary">
          Loading library…
        </Typography>
      )}
      {!loading && entries.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
          <AppIcon
            name="CollectionsBookmarkOutlined"
            fallback={CollectionsBookmarkOutlinedIcon}
            sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }}
          />
          <Typography variant="body2" color="text.secondary">
            No library entries yet. Run the seed migration to populate the library.
          </Typography>
        </Paper>
      )}
      {!loading && entries.length > 0 && (
        <Grid container spacing={1.5}>
          {entries.map((entry) => (
            <Grid item xs={12} sm={6} md={4} key={entry.id}>
              <LibraryCard entry={entry} onCopyPrompt={handleCopyPrompt} onDelete={handleDelete} />
            </Grid>
          ))}
        </Grid>
      )}
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)}>
            {snack.message}
          </Alert>
        ) : null}
      </Snackbar>
      <CalibrationWizard
        open={wizardOpen}
        organizationId={calibrationOrganizationId || null}
        organizationName={
          organizations.find((organization) => organization.id === calibrationOrganizationId)
            ?.name || (calibrationOrganizationId ? 'Selected organization' : 'Personal')
        }
        onClose={() => setWizardOpen(false)}
        onComplete={() => {
          setWizardOpen(false);
          setSnack({
            severity: 'success',
            message: 'Calibration complete - quality criteria are now active',
          });
        }}
      />
    </Box>
  );
}
