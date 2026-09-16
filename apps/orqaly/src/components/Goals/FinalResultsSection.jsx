/**
 * [module: frontend]
 * FinalResultsSection — surfaces the REAL deliverables produced by a
 * completed goal: live sites, downloadable PDFs, image assets, code
 * repositories, data exports, and markdown documents.
 */
import { useMemo, useState, useEffect } from 'react';
import { Box, useTheme } from '@mui/material';
import ProjectOverviewSection from './ProjectOverviewSection';
import {
  DELIVERABLE_REGISTRY,
  getRelevantTasks,
  filterByType,
} from '../../utils/deliverables/registry';
import { supabase, hasSupabase } from '../../lib/supabase';

export default function FinalResultsSection({
  tasks,
  goalId,
  goal,
  // What to render when nothing could be extracted. The goal thread passes a
  // plain list built from goal.data.deliverables, because a completed goal
  // whose files cannot be resolved still has to show its work somewhere.
  fallback = null,
  // Tighter trailing space, for a host that is not a full-width tab.
  dense = false,
}) {
  const theme = useTheme();
  const G = theme.palette.primary.main;

  const [artifacts, setArtifacts] = useState([]);
  const [landingPages, setLandingPages] = useState([]);
  useEffect(() => {
    if (!goalId || !hasSupabase()) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from('goal_artifacts')
        // No `title` column on goal_artifacts - 126_goal_artifacts.sql never
        // defined one. Asking for it made PostgREST reject the whole query, so
        // this list was permanently empty and every artifact match below
        // silently missed.
        .select('id, kind, public_url, filename')
        .eq('goal_id', goalId)
        .is('deleted_at', null),
      supabase
        .from('landing_pages')
        .select('id, deployment_url, title, data')
        .eq('goal_id', goalId),
    ])
      .then(([a, lp]) => {
        if (cancelled) return;
        setArtifacts(a.data || []);
        setLandingPages(lp.data || []);
      })
      .catch(() => {
        /* swallow — Improve buttons just stay hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [goalId]);

  const groups = useMemo(() => {
    const relevantTasks = getRelevantTasks(tasks);
    const ctx = { artifacts, landingPages, goal };
    const built = DELIVERABLE_REGISTRY.map((entry) => {
      const typeFiltered = filterByType(relevantTasks, entry.matchDeliverableType);
      const items = entry.extract(typeFiltered, relevantTasks, ctx) || [];
      return { ...entry, items };
    });

    const liveSiteUrls = new Set(
      (built.find((g) => g.id === 'liveSite')?.items || [])
        .map((item) => item.githubRepo?.url)
        .filter(Boolean)
    );

    return built
      .map((group) => {
        if (group.id !== 'codeRepos' || liveSiteUrls.size === 0) return group;
        return {
          ...group,
          items: group.items.filter((item) => !liveSiteUrls.has(item.url)),
        };
      })
      .filter((g) => g.items.length > 0)
      .sort((a, b) => a.priority - b.priority);
  }, [tasks, artifacts, landingPages, goal]);

  if (groups.length === 0) return fallback;

  return (
    <ProjectOverviewSection glassIconName="CheckCircleOutline" label="Final Results" dense={dense}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {groups.map((group) => (
          <group.Renderer
            key={group.id}
            items={group.items}
            icon={group.icon}
            glassIconName={group.glassIconName}
            label={group.label}
            G={G}
          />
        ))}
      </Box>
    </ProjectOverviewSection>
  );
}
