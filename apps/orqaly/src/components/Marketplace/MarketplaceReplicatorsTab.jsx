import { useEffect, useState, useMemo } from 'react';
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
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import CreateReplicatorWizard from './CreateReplicatorWizard';
import { useReplicators } from '../../context/ReplicatorContext';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import { getAllTools } from '../../services/toolService';
import usePagination from '../../hooks/usePagination';

import AppIcon from '../icons/AppIcon';

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

export default function MarketplaceReplicatorsTab() {
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

  const pagination = usePagination(sorted, {
    surfaceId: 'marketplace.replicators',
    defaultRowsPerPage: 12,
    resetOn: [],
  });

  const handleCreate = () => {
    setWizardOpen(true);
  };

  const handleCreated = async () => {
    setWizardOpen(false);
    await refresh();
  };

  const handleOpen = (replicator) => {
    const firstPage = replicator.pages?.[0];
    if (!firstPage) return;
    navigate(`/replicators/${replicator.slug}/${firstPage.slug}`);
  };

  return (
    <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Replicators
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Generated control interfaces for your connected tools. Each replicator mirrors the
            goal-procedure step pattern.
          </Typography>
        </Box>
        {canCreate ? (
          <Button
            variant="contained"
            size="small"
            startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
            onClick={handleCreate}
          >
            Create Replicator
          </Button>
        ) : null}
      </Stack>
      <CreateReplicatorWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleCreated}
        tools={tools}
        toolsLoading={toolsLoading}
      />
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
              ? 'Create a replicator from any connected tool to expose its endpoints as in-platform pages.'
              : 'An admin can create replicators here. They will appear in your left sidebar once published.'
          }
          icon={IntegrationInstructionsOutlinedIcon}
        />
      ) : (
        <>
          <Grid container spacing={1.5}>
            {pagination.paginatedData.map((r) => (
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
                        <Box
                          component="img"
                          src={r.icon_url}
                          alt=""
                          sx={{ width: 24, height: 24 }}
                        />
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
                      endIcon={
                        <AppIcon name="OpenInNew" fallback={OpenInNewIcon} fontSize="small" />
                      }
                      onClick={() => handleOpen(r)}
                      disabled={!r.pages?.length}
                    >
                      Open
                    </Button>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
          <Pagination
            count={pagination.totalCount}
            page={pagination.page}
            rowsPerPage={pagination.rowsPerPage}
            rowsPerPageOptions={pagination.rowsPerPageOptions}
            onPageChange={pagination.setPage}
            onRowsPerPageChange={pagination.setRowsPerPage}
            onLoadAll={pagination.loadAll}
            onCollapseAll={pagination.collapseAll}
            allMode={pagination.allMode}
            label="replicators"
            dense
          />
        </>
      )}
    </Box>
  );
}
