import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  Stack,
  Skeleton,
  Alert,
  alpha,
  useTheme,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import ReplicatorsArt from '../../components/illustrations/pages/ReplicatorsArt';
import CreateReplicatorWizard from '../../components/Marketplace/CreateReplicatorWizard';
import { useReplicators } from '../../context/ReplicatorContext';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import { getAllTools } from '../../services/toolService';

import AppIcon from '../../components/icons/AppIcon';

const INTEGRATION_TYPE_LABELS = {
  composio: 'Composio',
  api: 'HTTP API',
  mcp: 'MCP',
  webhook: 'Webhook',
  sdk: 'SDK',
  internal: 'Internal',
};

function formatRelative(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ReplicatorHub() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { replicators, loaded, error, refresh } = useReplicators();
  const partnerAccess = usePartnerAccessOptional();
  const roleId = partnerAccess?.roleId ?? '';
  const roleLoaded = partnerAccess?.loaded ?? true;
  const isAdmin = roleId === 'role-super-admin' || roleId === 'role-manager';
  const canCreate = isAdmin || !roleLoaded;

  const [wizardOpen, setWizardOpen] = useState(false);
  const [tools, setTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);

  useEffect(() => {
    if (!wizardOpen) return undefined;
    let cancelled = false;
    setToolsLoading(true);
    getAllTools()
      .then((rows) => {
        if (!cancelled) setTools(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setTools([]);
      })
      .finally(() => {
        if (!cancelled) setToolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wizardOpen]);

  const sorted = useMemo(
    () => [...replicators].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [replicators]
  );

  const handleCreated = async () => {
    setWizardOpen(false);
    await refresh();
  };

  const handleOpen = (r) => {
    const firstPage = r.pages?.[0];
    if (!firstPage) return;
    navigate(`/replicators/${r.slug}/${firstPage.slug}`);
  };

  const renderCard = (r) => (
    <Grid key={r.id} size={{ xs: 12, sm: 6, md: 4 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 1.75,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          borderColor: alpha(theme.palette.primary.main, 0.18),
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {r.icon_url ? (
              <Box component="img" src={r.icon_url} alt="" sx={{ width: 24, height: 24 }} />
            ) : (
              <AppIcon
                name="IntegrationInstructionsOutlined"
                fallback={IntegrationInstructionsOutlinedIcon}
              />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
              {r.display_name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {r.slug}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          <Chip
            size="small"
            label={INTEGRATION_TYPE_LABELS[r.integration_type] || r.integration_type}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`${r.pages?.length ?? 0} page${(r.pages?.length ?? 0) === 1 ? '' : 's'}`}
            variant="outlined"
          />
          <Chip size="small" label={formatRelative(r.created_at)} variant="outlined" />
        </Stack>
        <Box sx={{ flex: 1 }} />
        <Box>
          <Button
            size="small"
            endIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} fontSize="small" />}
            onClick={() => handleOpen(r)}
            disabled={!r.pages?.length}
          >
            Open
          </Button>
        </Box>
      </Paper>
    </Grid>
  );

  return (
    <PageLayout
      title="Replicators"
      subtitle="Generate in-platform control interfaces for any connected tool"
      showTitleBlock={false}
    >
      <CreateReplicatorWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleCreated}
        tools={tools}
        toolsLoading={toolsLoading}
      />
      <BentoCard
        title="Replicators"
        subtitle={sorted.length > 0 ? `${sorted.length} active` : undefined}
        icon={IntegrationInstructionsOutlinedIcon}
        noPadding
        plainHeader
        explain
        noTour
      >
        {canCreate ? (
          <Box
            sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              size="small"
              startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
              onClick={() => setWizardOpen(true)}
            >
              Create Replicator
            </Button>
          </Box>
        ) : null}
        <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              Could not load replicators: {error.message}
            </Alert>
          ) : null}

          {!loaded ? (
            <Grid container spacing={1.5}>
              {[0, 1, 2].map((i) => (
                <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Skeleton variant="rounded" height={140} />
                </Grid>
              ))}
            </Grid>
          ) : sorted.length === 0 ? (
            <EmptyState
              title="No replicators yet"
              description={
                canCreate
                  ? 'Create your first replicator from any connected Composio or HTTP API tool. Each replicator becomes a sidebar group with pages you can drive.'
                  : 'An admin can create replicators here. They will appear in your left sidebar once published.'
              }
              illustration={ReplicatorsArt}
            />
          ) : (
            <Grid container spacing={1.5}>
              {sorted.map(renderCard)}
            </Grid>
          )}
        </Box>
      </BentoCard>
    </PageLayout>
  );
}
