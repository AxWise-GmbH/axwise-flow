import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { Box, Typography, Stack, Alert, Tabs, Tab, Skeleton } from '@mui/material';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import ReplicatorPhaseCard from './components/ReplicatorPhaseCard';
import RecentRunsSidebar from './components/RecentRunsSidebar';
import { useReplicators } from '../../context/ReplicatorContext';
import { supabase, hasSupabase } from '../../lib/supabase';
import { runReplicatorAction } from '../../services/replicatorService';

function renderPhasesBody({
  phasesError,
  phasesLoaded,
  phases,
  handleRun,
  rehydrate,
  onRunComplete,
}) {
  if (phasesError) {
    return <Alert severity="error">Could not load phases: {phasesError.message}</Alert>;
  }
  if (!phasesLoaded) {
    return (
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={120} />
      </Stack>
    );
  }
  if (phases.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        This page has no phases yet.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.5}>
      {phases.map((phase) => (
        <ReplicatorPhaseCard
          key={`${phase.id}:${rehydrate?.phaseId === phase.id ? rehydrate.nonce : '0'}`}
          phase={phase}
          onRun={async (args) => {
            const r = await handleRun(args);
            onRunComplete?.();
            return r;
          }}
          initialValues={rehydrate?.phaseId === phase.id ? rehydrate.input : undefined}
        />
      ))}
    </Stack>
  );
}

export default function ReplicatorPageRenderer() {
  const { replicatorSlug, pageSlug } = useParams();
  const navigate = useNavigate();
  const { loaded, getBySlug } = useReplicators();
  const [phases, setPhases] = useState([]);
  const [phasesLoaded, setPhasesLoaded] = useState(false);
  const [phasesError, setPhasesError] = useState(null);

  const replicator = useMemo(() => getBySlug(replicatorSlug), [getBySlug, replicatorSlug]);
  const activePage = useMemo(() => {
    if (!replicator?.pages?.length) return null;
    if (pageSlug) return replicator.pages.find((p) => p.slug === pageSlug) || null;
    return replicator.pages[0];
  }, [replicator, pageSlug]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activePage?.id || !hasSupabase()) {
        setPhases([]);
        setPhasesLoaded(true);
        return;
      }
      setPhasesLoaded(false);
      setPhasesError(null);
      const { data, error } = await supabase
        .from('replicator_phases')
        .select('*')
        .eq('page_id', activePage.id)
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        setPhasesError(error);
        setPhases([]);
      } else {
        setPhases(data || []);
      }
      setPhasesLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activePage?.id]);

  const [runsRefreshKey, setRunsRefreshKey] = useState(0);
  const [rehydrate, setRehydrate] = useState(null);

  const handleRun = useCallback(async ({ phase, input, signal }) => {
    return runReplicatorAction(phase.id, input, { signal });
  }, []);

  const handleRunComplete = useCallback(() => {
    setRunsRefreshKey((k) => k + 1);
  }, []);

  const handleRehydrate = useCallback(({ phaseId, input }) => {
    setRehydrate({ phaseId, input, nonce: Date.now() });
    const el = document.getElementById(`replicator-phase-${phaseId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!loaded) {
    return (
      <PageLayout title="Loading…">
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={160} />
        </Stack>
      </PageLayout>
    );
  }

  if (!replicator) {
    return <Navigate to="/marketplace?tab=replicators" replace />;
  }

  if (!activePage) {
    return (
      <PageLayout title={replicator.display_name} subtitle="Replicator">
        <Alert severity="info">This replicator has no pages yet.</Alert>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={replicator.display_name} subtitle="Replicator" showTitleBlock>
      {replicator.pages.length > 1 ? (
        <Box sx={{ mb: 2 }}>
          <Tabs
            value={activePage.slug}
            onChange={(_, v) => {
              if (v && v !== activePage.slug) {
                navigate(`/replicators/${replicator.slug}/${v}`);
              }
            }}
            variant="scrollable"
            scrollButtons="auto"
          >
            {replicator.pages.map((p) => (
              <Tab key={p.id} value={p.slug} label={p.title} />
            ))}
          </Tabs>
        </Box>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' },
          alignItems: 'start',
        }}
      >
        <BentoCard
          title={activePage.title}
          subtitle={activePage.description || undefined}
          noPadding
        >
          <Box sx={{ p: 2 }}>
            {renderPhasesBody({
              phasesError,
              phasesLoaded,
              phases,
              handleRun,
              rehydrate,
              onRunComplete: handleRunComplete,
            })}
          </Box>
        </BentoCard>
        <Box sx={{ display: { xs: 'none', md: 'block' }, position: 'sticky', top: 16 }}>
          <RecentRunsSidebar
            phases={phases}
            onRehydrate={handleRehydrate}
            refreshKey={runsRefreshKey}
          />
        </Box>
      </Box>
    </PageLayout>
  );
}

// Test-only export: a pure-render variant that takes a blueprint directly.
// Bypasses supabase/router so unit tests can render without provider setup.
export function ReplicatorPageRendererStatic({ replicator, activePageSlug }) {
  const activePage = activePageSlug
    ? replicator.pages.find((p) => p.slug === activePageSlug)
    : replicator.pages?.[0];
  if (!activePage) return null;
  const phases = (replicator.phasesByPage?.[activePage.id] || [])
    .slice()
    .sort((a, b) => a.position - b.position);
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {replicator.display_name}
      </Typography>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>
        {activePage.title}
      </Typography>
      <Stack spacing={1.5}>
        {phases.map((p) => (
          <ReplicatorPhaseCard key={p.id} phase={p} onRun={async () => undefined} />
        ))}
      </Stack>
    </Box>
  );
}
