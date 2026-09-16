import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, useTheme } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import Reveal from '../../components/Common/Reveal';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { HomeModeContext } from './HomeModeContext';
import useHomeData from './useHomeData';
import useOrgOverview from './useOrgOverview';
import HomeHeader from './sections/HomeHeader';
import OrgMetrics from './sections/OrgMetrics';
import OrgStructure from './sections/OrgStructure';
import ConsiliumActivity from './sections/ConsiliumActivity';
import PerformanceChart from './sections/PerformanceChart';
import GoalsLoopsTables from './sections/GoalsLoopsTables';
import ActivityCommsTables from './sections/ActivityCommsTables';
import PanelCard from './sections/PanelCard';
import UsageDonut from './sections/UsageDonut';
import SparkStatRow from './sections/SparkStatRow';
import DataOperationsCard from './sections/DataOperationsCard';
import MetricsFilterDialog from './sections/MetricsFilterDialog';
import HomeExplainTour from './HomeExplainTour';
import { useSettingsBlockLayout } from '../Settings/SettingsViewOptions';
import { useDashboardTemplates } from '../../hooks/useDashboardTemplates';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import {
  HOME_BLOCK_DEFS,
  BUILTIN_HOME_TEMPLATES,
  templateMatches,
  groupBlockRows,
} from './homeTemplates';
import './Home.css';

import AppIcon from '../../components/icons/AppIcon';

const STORAGE_KEY = 'orchestratori_home_prefs';
const EXPLAIN_SEEN_KEY = 'orchestratori_home_explain_seen';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore unreadable prefs */
  }
  return {};
}

/**
 * HomeOverview - organization-centric, animated, live dashboard content.
 * Rendered on its own (advanced mode) inside PageLayout, and embedded as the
 * Metrics-tab content of the Dashboard shell in simple mode (see Home.jsx).
 * Intentionally has no PageLayout wrapper so it nests cleanly.
 */
export default function HomeOverview() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [demo, setDemo] = useState(() => Boolean(loadPrefs().demo));
  const [windowDays, setWindowDays] = useState(() => loadPrefs().windowDays || 7);
  // Explicit From-To range (both set) overrides the 7/30/90 preset.
  const [dateFrom, setDateFrom] = useState(() => loadPrefs().from || '');
  const [dateTo, setDateTo] = useState(() => loadPrefs().to || '');
  const [selectedOrgId, setSelectedOrgId] = useState(() => loadPrefs().orgId || null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ demo, windowDays, from: dateFrom, to: dateTo, orgId: selectedOrgId })
      );
    } catch {
      /* ignore quota/availability errors */
    }
  }, [demo, windowDays, dateFrom, dateTo, selectedOrgId]);

  // Picking a preset clears any custom range; picking a preset is the default.
  const applyWindowPreset = (days) => {
    setWindowDays(days);
    setDateFrom('');
    setDateTo('');
  };

  const { orgs, loading: orgsLoading } = useOrgOverview({ demo });

  // Home is scoped to the chosen organization, defaulting to the top (holding).
  const holdingOrgId = orgs[0]?.id ?? null;
  const effectiveOrgId =
    selectedOrgId && orgs.some((o) => o.id === selectedOrgId) ? selectedOrgId : holdingOrgId;
  const selectedIndex = Math.max(
    0,
    orgs.findIndex((o) => o.id === effectiveOrgId)
  );
  const selectedOrg = orgs[selectedIndex] || null;
  const orgSeed = useMemo(() => selectedIndex, [selectedIndex]);
  const orgScoped = Boolean(holdingOrgId && effectiveOrgId && effectiveOrgId !== holdingOrgId);

  const customRange = dateFrom && dateTo;
  const data = useHomeData({
    demo,
    windowDays,
    from: customRange ? dateFrom : null,
    to: customRange ? dateTo : null,
    orgSeed,
  });

  const layout = useSettingsBlockLayout(HOME_BLOCK_DEFS, {
    storagePrefix: 'orch_home',
    pinnedId: null,
  });

  // Soft default: on a simple-mode user's first visit (no saved Home layout yet),
  // apply the Beginner template so its blocks show and the "Beginner" chip reads
  // as selected in the Filters & Layout popup. Runs once; any saved layout wins,
  // and "Reset layout" clears storage so the next visit re-seeds Beginner.
  const { simpleMode } = useSimpleMode();
  const beginnerSeededRef = useRef(false);
  useEffect(() => {
    if (beginnerSeededRef.current || !simpleMode) return;
    let hasSavedLayout = true;
    try {
      hasSavedLayout =
        localStorage.getItem('orch_home_hidden_sections') !== null ||
        localStorage.getItem('orch_home_section_order') !== null ||
        localStorage.getItem('orch_home_block_widths') !== null;
    } catch {
      hasSavedLayout = true; // storage unreadable: do not seed
    }
    beginnerSeededRef.current = true;
    if (hasSavedLayout) return;
    const beginner = BUILTIN_HOME_TEMPLATES.find((t) => t.id === 'builtin:beginner');
    if (beginner) {
      layout.applyLayout({
        hidden: beginner.hidden,
        order: beginner.order,
        widths: beginner.widths,
      });
    }
  }, [simpleMode, layout]);
  const activeFilterCount =
    (demo ? 1 : 0) +
    (customRange ? 1 : 0) +
    (windowDays !== 7 ? 1 : 0) +
    (orgScoped ? 1 : 0) +
    layout.hiddenSections.size;

  const startTour = () => {
    setTourStep(0);
    setTourOpen(true);
  };

  // The block currently spotlighted by the tour (drives its persistent glow).
  const activeBlockId = tourOpen ? (layout.navSections[tourStep]?.id ?? null) : null;

  // A tour popup's primary CTA: either pop a creation dialog in place (via the
  // global quick-action host) or route to a page that auto-opens its create
  // dialog (?action=create). Either way, close the tour first.
  const handleTourAction = (cta) => {
    if (!cta) return;
    setTourOpen(false);
    if (cta.kind === 'quick-action' && cta.action) {
      window.dispatchEvent(
        new CustomEvent('orch-quick-action', { detail: { action: cta.action } })
      );
    } else if (cta.kind === 'navigate' && cta.to) {
      navigate(cta.to);
    }
  };

  // Auto-run the "Explain?" tour once, on a user's first visit to Home (and only
  // once there are visible blocks to walk through). Re-launchable via the button.
  useEffect(() => {
    if (layout.navSections.length === 0) return;
    let seen = true;
    try {
      seen = Boolean(localStorage.getItem(EXPLAIN_SEEN_KEY));
    } catch {
      seen = true;
    }
    if (!seen) {
      try {
        localStorage.setItem(EXPLAIN_SEEN_KEY, '1');
      } catch {
        /* ignore */
      }
      startTour();
    }
  }, [layout.navSections.length]);

  // Layout templates: built-in presets + the user's saved (custom) ones.
  const {
    templates: customTemplates,
    create: createTemplate,
    update: updateTemplate,
    remove: removeTemplate,
  } = useDashboardTemplates({ surface: 'home' });
  const allTemplates = useMemo(
    () => [...BUILTIN_HOME_TEMPLATES, ...customTemplates],
    [customTemplates]
  );
  const activeTemplateId = useMemo(() => {
    const match = allTemplates.find((t) =>
      templateMatches(t, layout.hiddenSections, layout.sectionOrder, layout.blockWidths)
    );
    return match ? match.id : null;
  }, [allTemplates, layout.hiddenSections, layout.sectionOrder, layout.blockWidths]);

  const handleApplyTemplate = (tpl) =>
    layout.applyLayout({ hidden: tpl.hidden, order: tpl.order, widths: tpl.widths });
  const handleSaveTemplate = (name) =>
    createTemplate({
      name,
      hidden: [...layout.hiddenSections],
      order: layout.sectionOrder,
      widths: [...layout.blockWidths],
    });
  const handleRenameTemplate = (id, name) => updateTemplate(id, { name });
  const handleDeleteTemplate = (id) => removeTemplate(id);

  // Each metric tile deep-links to its feature page, scoped to the selected org.
  const goToMetric = (key) => {
    const id = effectiveOrgId;
    const q = id
      ? `org=${encodeURIComponent(id)}&orgName=${encodeURIComponent(selectedOrg?.name || '')}`
      : '';
    switch (key) {
      case 'units':
        navigate(`/organizations${q ? `?${q}` : ''}`);
        break;
      case 'teams':
        navigate(`/agent-hub?tab=teams${q ? `&${q}` : ''}`);
        break;
      case 'consilium':
        navigate(
          selectedOrg?.consilium_id
            ? `/consilium?board=${encodeURIComponent(selectedOrg.consilium_id)}`
            : `/consilium${q ? `?${q}` : ''}`
        );
        break;
      case 'agents':
        navigate(`/agent-hub?tab=agents${q ? `&${q}` : ''}`);
        break;
      case 'tools':
        navigate('/tools');
        break;
      case 'tasks':
        navigate(`/task-manager${q ? `?${q}` : ''}`);
        break;
      default:
        break;
    }
  };

  // Each block's JSX, keyed by block id. The visible set + order come from the
  // layout hook (driven by the "View options" popover); hidden blocks are simply
  // absent from navSections.
  const blockNodes = {
    org_structure: (
      <OrgStructure
        orgs={orgs}
        selectedId={effectiveOrgId}
        onAddInvestment={() => navigate('/investments')}
      />
    ),
    org_metrics: (
      <OrgMetrics metrics={selectedOrg?.metrics} loading={orgsLoading} onMetricClick={goToMetric} />
    ),
    consilium: (
      <ConsiliumActivity
        consilium={data.consilium}
        orgs={orgs}
        selectedOrgId={effectiveOrgId}
        loading={data.loading}
        demo={demo}
        onBoardClick={(id) => navigate(`/consilium?board=${encodeURIComponent(id)}`)}
        onAttachBoard={(orgId) => navigate(orgId ? '/organizations' : '/consilium')}
      />
    ),
    performance: <PerformanceChart performance={data.performance} loading={data.loading} />,
    goals: (
      <GoalsLoopsTables
        panels={['goals']}
        goals={data.goals}
        loading={data.loading}
        onViewAllGoals={() => navigate('/goals')}
      />
    ),
    loops: (
      <GoalsLoopsTables
        panels={['loops']}
        loops={data.loops}
        loading={data.loading}
        onViewAllLoops={() => navigate('/goals')}
      />
    ),
    activity: (
      <ActivityCommsTables
        panels={['activity']}
        activity={data.activity}
        loading={data.loading}
        onPersonaClick={(row) =>
          row.agentId && navigate(`/agent-hub?tab=agents&detail=${encodeURIComponent(row.agentId)}`)
        }
      />
    ),
    communicator: (
      <ActivityCommsTables
        panels={['communicator']}
        chat={data.chat}
        loading={data.loading}
        onReviewMessage={(href) => navigate(href)}
      />
    ),
    llm_usage: (
      <Box
        sx={{
          display: 'grid',
          gap: 1.25,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 360px) 1fr' },
          alignItems: 'stretch',
        }}
      >
        <PanelCard title="LLM Usage" subtitle="Token usage by model and provider">
          <UsageDonut rows={data.usageDonut.rows} />
        </PanelCard>
        <SparkStatRow stats={data.sparkStats} loading={data.loading} columns={3} />
      </Box>
    ),
    data_ops: (
      <DataOperationsCard
        rows={data.dataOps.rows}
        loading={data.loading}
        onAgentClick={(row) =>
          row.agentId && navigate(`/agent-hub?tab=agents&detail=${encodeURIComponent(row.agentId)}`)
        }
      />
    ),
  };

  return (
    <HomeModeContext.Provider value={{ demo }}>
      <Box className="home-dash" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <HomeHeader
          onOpenFilters={() => setFilterOpen(true)}
          onExplain={startTour}
          activeFilterCount={activeFilterCount}
        />

        <MetricsFilterDialog
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          demo={demo}
          onDemoChange={setDemo}
          windowDays={windowDays}
          onWindowChange={applyWindowPreset}
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
          onResetAll={() => {
            setDemo(false);
            setWindowDays(7);
            setDateFrom('');
            setDateTo('');
            setSelectedOrgId(null);
            layout.resetLayout();
          }}
          orgs={orgs}
          selectedOrgId={effectiveOrgId}
          onOrgChange={setSelectedOrgId}
          layout={layout}
          templates={allTemplates}
          activeTemplateId={activeTemplateId}
          onApplyTemplate={handleApplyTemplate}
          onSaveTemplate={handleSaveTemplate}
          onRenameTemplate={handleRenameTemplate}
          onDeleteTemplate={handleDeleteTemplate}
        />

        {demo && (
          <Box
            role="status"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1,
              borderRadius: 2,
              bgcolor: (t) =>
                t.palette.mode === 'dark' ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.14)',
              border: '1px solid',
              borderColor: 'warning.main',
            }}
          >
            <AppIcon
              name="ScienceOutlined"
              fallback={ScienceOutlinedIcon}
              sx={{ fontSize: 18, color: 'warning.main' }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Showing <b>demo data</b> — sample numbers, not your live account. Turn off the “Demo
              data” switch to see your real data.
            </Typography>
          </Box>
        )}

        {layout.navSections.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            All blocks are hidden. Use <b>View options</b> to show them again.
          </Typography>
        ) : (
          (() => {
            let blockIndex = 0;
            return groupBlockRows(layout.navSections, layout.blockWidths).map((row) => (
              <Box
                key={row.map((s) => s.id).join('+')}
                sx={{
                  display: 'grid',
                  gap: 1.25,
                  gridTemplateColumns: { xs: '1fr', md: row.length === 2 ? '1fr 1fr' : '1fr' },
                }}
              >
                {row.map((section) => {
                  const i = blockIndex++;
                  const isActive = section.id === activeBlockId;
                  return (
                    <Box
                      key={section.id}
                      data-tour-block={section.id}
                      sx={{
                        minWidth: 0,
                        ...(isActive && {
                          '& .MuiPaper-root': {
                            borderColor: 'primary.main',
                            boxShadow: createHoverGlowShadow(theme),
                            transition: prefersReducedMotion()
                              ? 'none'
                              : 'box-shadow .25s ease, border-color .25s ease',
                          },
                        }),
                      }}
                    >
                      <Reveal delay={Math.min(i, 8) * 60}>{blockNodes[section.id]}</Reveal>
                    </Box>
                  );
                })}
              </Box>
            ));
          })()
        )}

        <HomeExplainTour
          open={tourOpen}
          steps={layout.navSections}
          stepIndex={tourStep}
          onBack={() => setTourStep((s) => Math.max(0, s - 1))}
          onNext={() => {
            setTourStep((s) => {
              if (s >= layout.navSections.length - 1) {
                setTourOpen(false);
                return s;
              }
              return s + 1;
            });
          }}
          onAction={handleTourAction}
          onClose={() => setTourOpen(false)}
        />
      </Box>
    </HomeModeContext.Provider>
  );
}
