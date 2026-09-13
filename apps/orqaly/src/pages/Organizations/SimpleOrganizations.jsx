import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  alpha,
  Typography,
  Button,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Snackbar,
  Alert,
  IconButton,
  Tooltip,
  Collapse,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import Diversity3RoundedIcon from '@mui/icons-material/Diversity3Rounded';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import AssistantPhotoRoundedIcon from '@mui/icons-material/AssistantPhotoRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import AssignmentIndRoundedIcon from '@mui/icons-material/AssignmentIndRounded';
import FolderSharedRoundedIcon from '@mui/icons-material/FolderSharedRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PageLayout from '../../components/Common/PageLayout';
import AssistantSetupChatDialog from '../../components/Assistant/AssistantSetupChatDialog';
import CreateOrgDialog from '../../components/Organizations/CreateOrgDialog';
import OrgDetailDrawer from '../../components/Organizations/OrgDetailDrawer';
import GlassIcon from '../../components/icons/GlassIcon';
import OrganizationsArt from '../Marketplace/components/illustrations/OrganizationsArt';
import ConsiliumArt from '../Marketplace/components/illustrations/ConsiliumArt';
import ToolsArt from '../Marketplace/components/illustrations/ToolsArt';
import AgentsArt from '../Marketplace/components/illustrations/AgentsArt';
import '../Marketplace/MarketplaceLanding.css';
import {
  listOrganizations,
  getOrgFinances,
  updateOrganization,
} from '../../services/organizationService';
import { getOrgTeamMap } from '../../services/orgTeamService';
import { getOrgAgentMap } from '../../services/orgAgentService';
import { getAllTeams } from '../../services/conciliumTeamsService';
import { getAllTeams as getJobPoolTeams } from '../../services/teamService';
import { getAgents } from '../../services/agentHubService';
import { getAllTools } from '../../services/toolService';
import {
  getChannels,
  getScheduledReports,
  getCommunicatorFiles,
} from '../../services/communicatorService';
import { listUserKeys } from '../../services/userKeysService';
import { listStorageConnections } from '../../services/storageConnectionsService';
import { useConcilium } from '../../hooks/useConcilium';
import { useAssistantSetup } from '../../hooks/useAssistantSetup';
import { TOUCH_SCROLL_CONTAINER_SX } from '../../utils/mobileTouchScroll';
import { useAuth } from '../../context/AuthContext';
import { getTypeColor, getTypeLabel } from './orgTypes';

import AppIcon from '../../components/icons/AppIcon';

// Lazy so @xyflow/react stays out of the initial Organizations bundle.
const ConsiliumTopologyView = lazy(
  () => import('../../components/Concilium/graph/ConsiliumTopologyView')
);

const INITIAL_CAP = 30;

function formatShort(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(num >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(num));
}

function timeAgo(date) {
  if (!date) return 'just now';
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SimpleOrganizations() {
  const navigate = useNavigate();
  const { concilium } = useConcilium();
  const { user } = useAuth();

  // Carousel dot nav
  const carouselRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const maxScroll = scrollWidth - clientWidth;
      if (maxScroll <= 0) {
        setActiveSlide(0);
        return;
      }
      const ratio = scrollLeft / maxScroll;
      // 4 slides: 0–0.2 → 0, 0.2–0.5 → 1, 0.5–0.8 → 2, 0.8+ → 3
      if (ratio < 0.2) setActiveSlide(0);
      else if (ratio < 0.5) setActiveSlide(1);
      else if (ratio < 0.8) setActiveSlide(2);
      else setActiveSlide(3);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSlide = useCallback((idx) => {
    const el = carouselRef.current;
    if (!el) return;
    const child = el.children[idx];
    if (!child) return;
    child.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, []);

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // Showcase view: the topology graph is the default in simple mode; users can
  // switch to cards (choice remembered across visits).
  const [orgView, setOrgView] = useState(() => {
    try {
      return localStorage.getItem('orch_orgs_simple_view') === 'cards' ? 'cards' : 'graph';
    } catch {
      return 'graph';
    }
  });
  const changeOrgView = useCallback((_e, v) => {
    if (!v) return;
    setOrgView(v);
    try {
      localStorage.setItem('orch_orgs_simple_view', v);
    } catch {
      /* ignore */
    }
  }, []);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  // Drawer state - lazy-mounted
  const [drawerOrg, setDrawerOrg] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);

  // Activate assistant dialog
  const [activateAssistantOpen, setActivateAssistantOpen] = useState(false);

  // Persistent assistant status for current organization
  const [hasAssistant, setHasAssistant] = useState(
    () => localStorage.getItem('orch_assistant_active') === 'true'
  );

  // Multiple assistants: once one is set up, "Setup" becomes "New Setup" and
  // spins up a fresh assistant (for another business) before opening the wizard.
  const { createAssistant } = useAssistantSetup();
  const [creatingAssistant, setCreatingAssistant] = useState(false);
  const handleNewAssistant = useCallback(async () => {
    if (creatingAssistant || !createAssistant) {
      setActivateAssistantOpen(true);
      return;
    }
    setCreatingAssistant(true);
    try {
      await createAssistant({});
      setActivateAssistantOpen(true);
    } catch {
      setActivateAssistantOpen(true);
    } finally {
      setCreatingAssistant(false);
    }
  }, [creatingAssistant, createAssistant]);

  // Toast surface - guarantees every create/list error is visible.
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = useCallback((message, severity = 'info') => {
    setToast({ open: true, message, severity });
  }, []);

  // Related data needed by OrgDetailDrawer
  const [orgTeamMap, setOrgTeamMap] = useState({});
  const [orgAgentMap, setOrgAgentMap] = useState({});
  const [allTeams, setAllTeams] = useState([]);
  const [allAgents, setAllAgents] = useState([]);
  const [orgFinances, setOrgFinances] = useState({});
  const [tools, setTools] = useState([]);

  // Initial load: orgs + finance + team/agent maps (parallel)
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listOrganizations();
      const list = Array.isArray(data) ? data : [];
      setOrgs(list);
      if (list.length === 0) {
        // Helpful breadcrumb for users hitting the "where did my org go" case.
        // eslint-disable-next-line no-console
        console.info(
          '[SimpleOrganizations] listOrganizations returned 0 rows for user:',
          user?.email || '(unknown email)'
        );
      }
      const ids = list.map((o) => o.id);
      const [teamMap, agentMap, govTeams, jobTeams, finData, toolList] = await Promise.all([
        getOrgTeamMap(ids).catch(() => ({})),
        getOrgAgentMap(ids).catch(() => ({})),
        getAllTeams().catch(() => []),
        getJobPoolTeams().catch(() => []),
        getOrgFinances().catch(() => ({})),
        getAllTools().catch(() => []),
      ]);
      setOrgTeamMap(teamMap || {});
      setOrgAgentMap(agentMap || {});
      setOrgFinances(finData || {});
      setTools(Array.isArray(toolList) ? toolList : []);
      const seen = new Set();
      const merged = [...govTeams, ...jobTeams].filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      setAllTeams(merged);
      setAllAgents(getAgents());
    } catch (err) {
      setOrgs([]);
      showToast(`Could not load organizations: ${err?.message || 'network error'}`, 'error');
    } finally {
      setLoading(false);
      setLastRefreshAt(new Date());
    }
  }, [user?.email, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const visible = useMemo(() => (showAll ? orgs : orgs.slice(0, INITIAL_CAP)), [orgs, showAll]);

  const handleOpenOrg = useCallback((org) => {
    setDrawerOrg(org);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    // Keep org mounted briefly for exit animation, then unmount
    setTimeout(() => setDrawerOrg(null), 250);
  }, []);

  // Attach / change / clear the open org's Consilium board (writes the link to
  // organizations.consilium_id and reflects it in the list + drawer).
  const handleAttachConsilium = useCallback(
    async (consiliumId) => {
      if (!drawerOrg) return;
      const orgId = drawerOrg.id;
      try {
        await updateOrganization(orgId, { consilium_id: consiliumId });
        setOrgs((prev) =>
          prev.map((o) => (o.id === orgId ? { ...o, consilium_id: consiliumId } : o))
        );
        setDrawerOrg((prev) =>
          prev && prev.id === orgId ? { ...prev, consilium_id: consiliumId } : prev
        );
        showToast(consiliumId ? 'Consilium board linked' : 'Consilium board removed', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to update Consilium board', 'error');
      }
    },
    [drawerOrg, showToast]
  );

  // Deep-link from the Home "Units" tile: auto-open the org's detail drawer once.
  const [searchParams] = useSearchParams();
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current) return;
    const orgId = searchParams.get('org');
    if (!orgId || orgs.length === 0) return;
    const org = orgs.find((o) => o.id === orgId);
    if (org) {
      handleOpenOrg(org);
      deepLinkedRef.current = true;
    }
  }, [searchParams, orgs, handleOpenOrg]);

  const toolCounts = useMemo(() => {
    const active = tools.filter((t) => t.status === 'active');
    const ready = active.filter((t) => {
      if (t.connectionType === 'internal') return true;
      if (t.connectionType === 'api') return !!t.credentialConfigured;
      if (t.connectionType === 'webhook') return !!t.credentialConfigured;
      if (t.connectionType === 'sdk') return !!t.sdkPackage;
      if (t.connectionType === 'composio') return !!t.composioApp;
      return false;
    });
    return { offered: active.length, ready: ready.length };
  }, [tools]);

  const agentCount = allAgents.length;

  const consiliumStats = useMemo(() => {
    const arr = Array.isArray(concilium) ? concilium : [];
    const boards = arr.length;
    const members = arr.reduce(
      (n, c) => n + ((c?.members || c?.advisors || c?.seats || []).length || 0),
      0
    );
    return { boards, members };
  }, [concilium]);

  const investorStats = useMemo(() => {
    const values = Object.values(orgFinances);
    const deals = values.filter((f) => Number(f?.invested || 0) > 0).length;
    const total = values.reduce((n, f) => n + Number(f?.invested || 0), 0);
    return { deals, total };
  }, [orgFinances]);

  return (
    <PageLayout showTitleBlock={false}>
      {/* Marketplace-style wrapper - `data-compact="1"` inherits the 920px
          container, tile dimensions, illustration mask, etc from
          MarketplaceLanding.css so simple-mode Organizations matches the
          rest of the simple-mode pages 1:1. */}
      <div className="mkt-landing" data-compact="1">
        <div className="mkt-landing__inner" style={{ paddingBottom: 80 }}>
          {/* Org-hero layout: ONE big showcase tile on top, TWO action tiles below. */}
          <section className="mkt-section">
            <div className="mkt-grid mkt-grid--org-hero">
              {/* BIG TILE - your orgs + Add CTA inline. */}
              <article
                className="mkt-tile mkt-tile--org-showcase"
                style={{ '--delay': '0ms' }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty(
                    '--mx',
                    `${((e.clientX - rect.left) / rect.width) * 100}%`
                  );
                  e.currentTarget.style.setProperty(
                    '--my',
                    `${((e.clientY - rect.top) / rect.height) * 100}%`
                  );
                }}
              >
                <div className="mkt-tile__illustration" aria-hidden="true">
                  <OrganizationsArt />
                </div>

                <div
                  className="mkt-tile--org-showcase__header"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div>
                    <h3 className="mkt-tile--org-showcase__title">Your organizations</h3>
                    <p className="mkt-tile--org-showcase__sub">
                      {orgView === 'graph'
                        ? 'Your organization structure as a live graph.'
                        : 'Tap any card to open its details, finances, teams and activity.'}
                    </p>
                  </div>
                  <ToggleButtonGroup
                    value={orgView}
                    exclusive
                    size="small"
                    onChange={changeOrgView}
                    aria-label="Organizations view"
                    sx={{ flexShrink: 0, '& .MuiToggleButton-root': { px: 1 } }}
                  >
                    <ToggleButton value="cards" aria-label="Cards view">
                      <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 18 }} />
                    </ToggleButton>
                    <ToggleButton value="graph" aria-label="Graph view">
                      <AppIcon
                        name="AccountTree"
                        fallback={AccountTreeOutlinedIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </div>

                {/* Graph view: the shared org -> consilium -> team -> agent canvas.
                    Otherwise the org cards row (or empty state). */}
                {orgView === 'graph' ? (
                  <Suspense
                    fallback={
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                        <CircularProgress size={28} />
                      </div>
                    }
                  >
                    <Box
                      sx={{
                        borderRadius: '18px',
                        overflow: 'hidden',
                        mt: 1,
                        border: '1px solid',
                        borderColor: (t) => alpha(t.palette.primary.main, 0.15),
                      }}
                    >
                      <ConsiliumTopologyView user={user} variant="simple" />
                    </Box>
                  </Suspense>
                ) : !loading && orgs.length === 0 ? (
                  <div className="mkt-tile--org-showcase__empty">
                    <div className="mkt-tile--org-showcase__empty-art" aria-hidden="true">
                      <OrganizationsArt />
                    </div>
                    <h4>Start your first organization</h4>
                    <p>
                      Add a holding, subsidiary, division or department to begin tracking finances,
                      teams and agents.
                    </p>
                    <Button
                      variant="contained"
                      startIcon={<AppIcon name="AddRounded" fallback={AddRoundedIcon} />}
                      onClick={() => setCreateOpen(true)}
                      sx={{ mt: 1, textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}
                    >
                      Create organization
                    </Button>
                  </div>
                ) : (
                  <div className="mkt-tile--org-showcase__row">
                    {loading ? (
                      [0, 1, 2].map((i) => (
                        <div key={i} className="org-card" style={{ pointerEvents: 'none' }}>
                          <Skeleton variant="text" width="35%" sx={{ fontSize: '0.65rem' }} />
                          <Skeleton variant="text" width="75%" sx={{ fontSize: '1rem' }} />
                          <Skeleton variant="text" width="60%" sx={{ fontSize: '0.7rem' }} />
                        </div>
                      ))
                    ) : (
                      <>
                        {visible.map((org) => (
                          <OrgCard
                            key={org.id}
                            org={org}
                            finance={orgFinances[org.id]}
                            teamCount={(orgTeamMap[org.id] || []).length}
                            onOpen={() => handleOpenOrg(org)}
                          />
                        ))}
                        <button
                          type="button"
                          className="org-card org-card--dashed"
                          onClick={() => setCreateOpen(true)}
                          aria-label="Create a new organization"
                        >
                          <AppIcon
                            name="AddRounded"
                            fallback={AddRoundedIcon}
                            sx={{ fontSize: 24, color: 'primary.main', mb: 0.5 }}
                          />
                          <div
                            className="org-card__title"
                            style={{ color: 'var(--neon, #10b981)' }}
                          >
                            Add organization
                          </div>
                          <div className="org-card__sub">
                            Add another holding, subsidiary or department.
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </article>
            </div>

            {/* ── Action tiles — 2×2 grid on mobile, 4-col on desktop ── */}
            <div className="org-action-grid" ref={carouselRef}>
              <ActionTile
                title="Assistant"
                subtitle="Appoint your AI assistant to manage daily operations."
                iconName="AssistantPhotoRounded"
                fallback={AssistantPhotoRoundedIcon}
                ariaLabel="Activate Assistant - AI operations manager"
                delay={40}
                illustration={null}
                stats={null}
                actions={[
                  hasAssistant
                    ? { label: 'New Setup', primary: true, onClick: handleNewAssistant }
                    : {
                        label: 'Setup',
                        primary: true,
                        onClick: () => setActivateAssistantOpen(true),
                      },
                  { label: 'My Assistant', onClick: () => navigate('/assistant') },
                ]}
              />

              <ActionTile
                title="Consilium"
                subtitle="Manage the board of directors and governance."
                iconName="Diversity3Rounded"
                fallback={Diversity3RoundedIcon}
                ariaLabel="Check Consilium - board of directors"
                delay={80}
                onClick={() => navigate('/consilium')}
                illustration={<ConsiliumArt />}
                stats={
                  loading
                    ? null
                    : [
                        {
                          label: consiliumStats.boards === 1 ? 'board' : 'boards',
                          value: consiliumStats.boards,
                        },
                        { label: 'members', value: consiliumStats.members },
                      ]
                }
              />

              <ActionTile
                title="Agents"
                subtitle="Your AI agents across all organizations."
                iconName="Share2"
                fallback={SmartToyRoundedIcon}
                ariaLabel="Agent coordination - your agents"
                delay={140}
                onClick={() => navigate('/agent-hub')}
                illustration={<AgentsArt />}
                stats={[
                  {
                    label: agentCount === 1 ? 'agent' : 'agents',
                    value: loading ? '-' : agentCount,
                  },
                ]}
              />

              <ActionTile
                title="Tools"
                subtitle="Connectors and integrations available to your agents."
                iconName="Binoculars"
                fallback={BuildRoundedIcon}
                ariaLabel="Explore tools - offered and ready to use"
                delay={200}
                onClick={() => navigate('/tools')}
                illustration={<ToolsArt />}
                stats={[
                  { label: 'offered', value: loading ? '-' : toolCounts.offered },
                  { label: 'ready', value: loading ? '-' : toolCounts.ready },
                ]}
              />
            </div>
          </section>

          {/* ── Organisation Progress Tracker ── */}
          {!loading && (
            <OrgProgressTracker
              hasOrg={orgs.length > 0}
              hasAssistant={hasAssistant}
              hasConsilium={consiliumStats.boards > 0}
              hasTeam={allTeams.length > 0}
              investedTotal={investorStats.total}
              investorDeals={investorStats.deals}
              onAction={(stepKey) => {
                if (stepKey === 'create-org') setCreateOpen(true);
                else if (stepKey === 'activate-assistant') setActivateAssistantOpen(true);
                else if (stepKey === 'add-consilium') navigate('/consilium');
                else if (stepKey === 'hire-team') navigate('/consilium');
              }}
            />
          )}
        </div>
      </div>
      {/* ── Detail drawer (lazy-mounted) ── */}
      {drawerOrg && (
        <OrgDetailDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          org={drawerOrg}
          orgTeamMap={orgTeamMap}
          orgAgentMap={orgAgentMap}
          allTeams={allTeams}
          allAgents={allAgents}
          concilium={concilium}
          orgs={orgs}
          getTypeColor={getTypeColor}
          getTypeLabel={getTypeLabel}
          onAttachConsilium={handleAttachConsilium}
        />
      )}
      {/* ── Create org dialog ── */}
      <CreateOrgDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newOrg) => {
          setCreateOpen(false);
          showToast(`Created "${newOrg?.name || 'organization'}"`, 'success');
          loadAll();
        }}
        onError={(message) => showToast(message, 'error')}
      />
      {/* ── Unified assistant setup dialog ── */}
      <AssistantSetupChatDialog
        open={activateAssistantOpen}
        onClose={() => {
          setActivateAssistantOpen(false);
          // The unified dialog persists activation to localStorage; re-read so
          // the progress tracker reflects the new state without a reload.
          setHasAssistant(localStorage.getItem('orch_assistant_active') === 'true');
        }}
      />
      {/* ── Toast surface ── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 11, sm: 13 } /* clear the dock */ }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ minWidth: 320 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </PageLayout>
  );
}

// ─────────────────────────────────────────────────────────────────
// Action tile used for the two bottom links (Consilium, Investors).
// Title/subtitle on the left, large icon hero on the right.
function ActionTile({
  title,
  subtitle,
  iconName,
  fallback,
  ariaLabel,
  delay = 0,
  onClick,
  stats = null,
  illustration = null,
  actions = null,
}) {
  const hasActions = Array.isArray(actions) && actions.length > 0;
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };
  // When the tile exposes its own action buttons, those buttons are the only
  // interactive targets - the tile itself is no longer a single clickable link.
  const interactive = hasActions
    ? { role: 'group' }
    : { role: 'link', tabIndex: 0, onClick, onKeyDown: handleKeyDown };
  return (
    <article
      className="mkt-tile mkt-tile--org-action"
      aria-label={ariaLabel || `${title} - ${subtitle}`}
      style={{ '--delay': `${delay}ms` }}
      {...interactive}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          '--mx',
          `${((e.clientX - rect.left) / rect.width) * 100}%`
        );
        e.currentTarget.style.setProperty(
          '--my',
          `${((e.clientY - rect.top) / rect.height) * 100}%`
        );
      }}
    >
      {illustration && (
        <div className="mkt-tile__illustration" aria-hidden="true">
          {illustration}
        </div>
      )}
      <div className="mkt-tile--org-action__body">
        <div className="mkt-tile__icon" aria-hidden="true">
          <GlassIcon name={iconName} fallback={fallback} size={28} />
        </div>
        <h3 className="mkt-tile__title">{title}</h3>
        <p className="mkt-tile__subtitle">{subtitle}</p>
        {Array.isArray(stats) && stats.length > 0 && (
          <div className="org-card__metrics" style={{ marginTop: 8 }}>
            {stats.map((s) => (
              <span key={s.label}>
                <b>{s.value}</b>
                {s.label}
              </span>
            ))}
          </div>
        )}
        {hasActions && (
          <div className="mkt-tile__actions">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className={`mkt-tile__cta${a.primary ? ' mkt-tile__cta--primary' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  a.onClick?.();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────
// Compact org card used inside the big showcase tile. Smaller than
// the full OrgTile - fits in a horizontal scroll row.
function OrgCard({ org, finance, teamCount, onOpen }) {
  const invested = Number(finance?.invested || 0);
  const roi = Number(finance?.roi || 0);
  const hasInvested = invested > 0;
  const hasRoi = !!finance && (finance.invested || finance.returned);
  const isActive = org.is_active !== false;
  const typeLabel = getTypeLabel(org.org_type);
  const subtitle = [org.industry, isActive ? 'Active' : 'Inactive'].filter(Boolean).join(' · ');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.();
    }
  };

  return (
    <button
      type="button"
      className="org-card"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-label={`${typeLabel} - ${org.name}. ${subtitle}.`}
    >
      <span className="org-card__kicker">{typeLabel}</span>
      <h4 className="org-card__title">{org.name}</h4>
      {subtitle && <p className="org-card__sub">{subtitle}</p>}
      <div className="org-card__metrics">
        <span>
          <b>{hasInvested ? `$${invested.toFixed(0)}` : '-'}</b>inv
        </span>
        <span>
          <b>{hasRoi ? `${roi.toFixed(0)}%` : '-'}</b>roi
        </span>
        <span>
          <b>{teamCount}</b>
          {teamCount === 1 ? 'team' : 'teams'}
        </span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Skeleton that mimics a .mkt-tile while the org list loads.
function TileSkeleton() {
  return (
    <article className="mkt-tile" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <div className="mkt-tile__body">
        <Skeleton variant="rounded" width={32} height={32} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="40%" sx={{ fontSize: '0.7rem' }} />
        <Skeleton variant="text" width="70%" sx={{ fontSize: '1.1rem' }} />
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="text" width="65%" sx={{ mt: 0.5 }} />
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────
// CreateOrgDialog now lives in src/components/Organizations/CreateOrgDialog.jsx (shared with the
// Welcome Guide quick-action host).

// ─────────────────────────────────────────────────────────────────
// Organisation progress tracker — 6 milestone steps rendered as a
// horizontal timeline (desktop) / vertical timeline (mobile).
// Derives status from real data signals passed as props.

const PROGRESS_STEPS = [
  {
    key: 'create-org',
    label: 'Create Organisation',
    description: 'Register your first holding, subsidiary or department.',
    tooltip: 'The root entity everything else connects to.',
    guide: {
      intro:
        'Your organisation is the root you connect and build a structure from. Register a holding, subsidiary or department, then attach your assistant, board, teams, agents and tools to it.',
      points: [
        'Acts as the parent that owns finances, teams and agents.',
        'Add holdings, subsidiaries and departments to model your real structure.',
        'Every other setup step links back to an organisation.',
      ],
    },
    ctaLabel: 'Create Organisation',
  },
  {
    key: 'activate-assistant',
    label: 'Activate Assistant',
    description: 'Appoint your AI assistant to manage daily operations.',
    tooltip: 'Your AI assistant that runs daily operations.',
    guide: {
      intro:
        'Activate your AI assistant to check the company, try out features and run daily operations from one control panel.',
      points: [
        'Connect communication channels and send scheduled reports.',
        'Share files, link tools and storage, and add API keys.',
        'Pair it with an agent so it can act on your behalf.',
        'A quick way to explore what the platform can do without manual setup.',
      ],
    },
    ctaLabel: 'Activate Assistant',
  },
  {
    key: 'add-consilium',
    label: 'Add Consilium',
    description: 'Set up your board of directors and governance layer.',
    tooltip: 'Your board of directors and governance layer.',
    guide: {
      intro:
        'Set up a Consilium, the board of directors and AI decision layer that governs your organisation.',
      points: [
        'Assemble board members to discuss strategy and make decisions.',
        'Adds a governance layer over your agents and teams.',
        'Review decisions and oversight from the Consilium page.',
      ],
    },
    ctaLabel: 'Open Consilium',
  },
  {
    key: 'hire-team',
    label: 'Hire Team',
    description: 'Build your first team with roles and permissions.',
    tooltip: 'Build a team with roles and permissions.',
    guide: {
      intro: 'Build your first team and assign roles and permissions so work can be delegated.',
      points: [
        'Create teams and add members.',
        'Assign roles and permissions to control access.',
        'Teams plug into your governance and daily operations.',
      ],
    },
    ctaLabel: 'Hire Team',
  },
];

export function OrgProgressTracker({ hasOrg, hasAssistant, hasConsilium, hasTeam, onAction }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [guideKey, setGuideKey] = useState(null);
  const guideStep = guideKey ? PROGRESS_STEPS.find((s) => s.key === guideKey) : null;
  // Collapsed by default; the header toggles it open (mirrors the Setup guide cards).
  const [open, setOpen] = useState(false);

  const stepStatus = useMemo(() => {
    const completed = [
      hasOrg, // 1. Create Organisation
      hasAssistant, // 2. Activate Assistant
      hasConsilium, // 3. Add Consilium
      hasTeam, // 4. Hire Team
    ];
    // Find the first incomplete step — that's the "active" one.
    const activeIdx = completed.indexOf(false);
    return PROGRESS_STEPS.map((step, i) => ({
      ...step,
      completed: completed[i],
      active: i === activeIdx,
      stepNumber: i + 1,
    }));
  }, [hasOrg, hasAssistant, hasConsilium, hasTeam]);

  const completedCount = stepStatus.filter((s) => s.completed).length;
  const pct = Math.round((completedCount / PROGRESS_STEPS.length) * 100);

  return (
    <>
      <section className="mkt-section org-progress-section">
        <article
          className="mkt-tile org-progress"
          style={{ '--delay': '320ms', cursor: 'default' }}
        >
          {/* Header — click to expand / collapse */}
          <div
            className="org-progress__header"
            role="button"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen((o) => !o);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <div>
              <h3 className="org-progress__title">Onboarding</h3>
              <p className="org-progress__subtitle">
                Complete these steps to fully set up your organisation.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="org-progress__pct">
                <span className="org-progress__pct-value">{pct}%</span>
                <span className="org-progress__pct-label">complete</span>
              </div>
              <AppIcon
                name="ExpandMoreRounded"
                fallback={ExpandMoreRoundedIcon}
                sx={{
                  fontSize: 22,
                  color: 'text.secondary',
                  transition: 'transform 0.2s ease',
                  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </div>
          </div>

          <Collapse in={open} timeout="auto" unmountOnExit>
            {/* Overall progress bar */}
            <div className="org-progress__bar-track">
              <div className="org-progress__bar-fill" style={{ width: `${pct}%` }} />
            </div>

            {/* Steps timeline */}
            <div className="org-progress__steps">
              {stepStatus.map((step, i) => (
                <div
                  key={step.key}
                  className={
                    'org-progress__step' +
                    (step.completed ? ' org-progress__step--done' : '') +
                    (step.active ? ' org-progress__step--active' : '')
                  }
                >
                  {/* Connector line (hidden for the first step) */}
                  {i > 0 && (
                    <div
                      className={
                        'org-progress__connector' +
                        (step.completed ? ' org-progress__connector--done' : '')
                      }
                    />
                  )}

                  {/* Step node */}
                  <div className="org-progress__node">
                    {step.completed ? (
                      <AppIcon
                        name="CheckCircleRounded"
                        fallback={CheckCircleRoundedIcon}
                        sx={{ fontSize: 24, color: 'var(--neon, #10b981)' }}
                      />
                    ) : (
                      <div
                        className={
                          'org-progress__circle' +
                          (step.active ? ' org-progress__circle--active' : '')
                        }
                      >
                        <span>{step.stepNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* Label + description */}
                  <div className="org-progress__label">
                    <span className="org-progress__title-row">
                      <span className="org-progress__label-title">{step.label}</span>
                      <Tooltip title={step.tooltip} arrow placement="top">
                        <button
                          type="button"
                          className="org-progress__info"
                          aria-label={`What is ${step.label}?`}
                        >
                          <AppIcon
                            name="InfoOutlined"
                            fallback={InfoOutlinedIcon}
                            sx={{ fontSize: 13 }}
                          />
                        </button>
                      </Tooltip>
                    </span>
                    <span className="org-progress__label-desc">{step.description}</span>
                    <button
                      type="button"
                      className="org-progress__more"
                      onClick={() => setGuideKey(step.key)}
                    >
                      More
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Collapse>
        </article>
      </section>
      {/* Per-step setup guide popup */}
      <Dialog
        open={guideKey !== null}
        onClose={() => setGuideKey(null)}
        fullScreen={fullScreen}
        maxWidth="sm"
        fullWidth
        sx={{ '& .MuiDialog-paper': { borderRadius: fullScreen ? 0 : 3 } }}
      >
        {guideStep && (
          <>
            <DialogTitle
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                fontWeight: 700,
                pr: 1.5,
              }}
            >
              {guideStep.label}
              <IconButton onClick={() => setGuideKey(null)} aria-label="Close guide" size="small">
                <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {guideStep.guide.intro}
              </Typography>
              <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
                {guideStep.guide.points.map((point) => (
                  <Typography key={point} component="li" variant="body2" color="text.secondary">
                    {point}
                  </Typography>
                ))}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => setGuideKey(null)} color="inherit">
                Close
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  onAction?.(guideStep.key);
                  setGuideKey(null);
                }}
              >
                {guideStep.ctaLabel}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// System design style interactive popup to activate the AI assistant.
// Shows 7 modular blocks linked to real platform pages (toggled to Ready or setup manually).
export function ActivateAssistantDialog({
  open,
  onClose,
  hasAssistant,
  setHasAssistant,
  showToast,
  orgId,
  hasAgent,
  toolCounts,
}) {
  const [steps, setSteps] = useState([
    {
      id: 1,
      title: '1. Activate the Communicator',
      description: 'Configure and connect your communication channels.',
      icon: ForumRoundedIcon,
      path: '/communicator',
      ready: false,
    },
    {
      id: 2,
      title: '2. Select an Agent & Persona',
      description: 'Choose the agent and assign the appropriate persona.',
      icon: AssignmentIndRoundedIcon,
      path: '/agent-hub',
      ready: true, // starts ready for natural dashboard feel
    },
    {
      id: 3,
      title: '3. Upload Contacts & Information',
      description: 'Import your contact book and any relevant data sources.',
      icon: FolderSharedRoundedIcon,
      path: '/knowledge-base',
      warning: 'Connect your BYOK/BYOS storage first to secure contact uploads.',
      ready: false,
    },
    {
      id: 4,
      title: '4. Configure Semantic Mapping',
      description: 'Define key metrics, concepts, and relationships.',
      icon: HubRoundedIcon,
      path: '/data',
      ready: false,
    },
    {
      id: 5,
      title: '5. Connect Your BYOK/BYOS',
      description: 'Integrate your own keys and storage to securely manage all data.',
      icon: KeyRoundedIcon,
      path: '/setup',
      ready: false,
    },
    {
      id: 6,
      title: '6. Add Data Sources',
      description: 'Connect databases, documents, applications, and other repositories.',
      icon: StorageRoundedIcon,
      path: '/tools',
      ready: false,
    },
    {
      id: 7,
      title: '7. Monitor Insights in Action',
      description:
        'Watch the system analyze, uncover patterns, and deliver actionable intelligence.',
      icon: InsightsRoundedIcon,
      path: '/reports',
      ready: false,
    },
  ]);

  const [activating, setActivating] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [manualOverride, setManualOverride] = useState(false);

  // Check live status of configs
  const checkStatus = useCallback(async () => {
    if (!open) return;

    // If assistant is active, everything is deemed ready
    if (hasAssistant) {
      setSteps((prev) => prev.map((s) => ({ ...s, ready: true })));
      setLoadingStatus(false);
      return;
    }

    if (manualOverride) return;

    setLoadingStatus(true);
    try {
      const [channels, keys, connections, reports, files] = await Promise.all([
        getChannels().catch(() => []),
        listUserKeys().catch(() => []),
        listStorageConnections().catch(() => []),
        getScheduledReports().catch(() => []),
        getCommunicatorFiles().catch(() => []),
      ]);

      const channelsList = Array.isArray(channels) ? channels : [];
      const keysList = Array.isArray(keys) ? keys : [];
      const connectionsList = Array.isArray(connections) ? connections : [];
      const reportsList = Array.isArray(reports) ? reports : [];
      const filesList = Array.isArray(files) ? files : [];

      setSteps((prev) =>
        prev.map((step) => {
          let ready = step.ready;
          switch (step.id) {
            case 1:
              ready = channelsList.length > 0;
              break;
            case 2:
              ready = hasAgent;
              break;
            case 3:
              ready = filesList.length > 0;
              break;
            case 4:
              // Semantic mapping is mock-only client-side in simple mode
              ready = false;
              break;
            case 5:
              ready = keysList.length > 0 || connectionsList.length > 0;
              break;
            case 6:
              ready = (toolCounts?.ready || 0) > 0;
              break;
            case 7:
              ready = reportsList.length > 0;
              break;
            default:
              break;
          }
          return { ...step, ready };
        })
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to check environment setup status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, [open, hasAssistant, hasAgent, toolCounts, manualOverride]);

  // Initial load and auto-sync when page gets focus
  useEffect(() => {
    if (open) {
      checkStatus();
      window.addEventListener('focus', checkStatus);
      return () => {
        window.removeEventListener('focus', checkStatus);
      };
    }
  }, [open, checkStatus]);

  // Reset override and activating status when opening/closing
  useEffect(() => {
    if (open) {
      setActivating(false);
      // If assistant is active, start in manual mode so we don't automatically clear active status
      setManualOverride(hasAssistant);
    }
  }, [open, hasAssistant]);

  const handleToggle = (id) => {
    if (activating || loadingStatus) return;
    setManualOverride(true);
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ready: !s.ready } : s)));
  };

  const readyCount = steps.filter((s) => s.ready).length;
  const pct = Math.round((readyCount / steps.length) * 100);
  const allReady = readyCount === steps.length;

  const handleAction = () => {
    if (activating) return;

    if (hasAssistant) {
      // Deactivation flow
      setActivating(true);
      setTimeout(() => {
        setHasAssistant(false);
        localStorage.setItem('orch_assistant_active', 'false');
        showToast('AI Assistant deactivated successfully.', 'success');
        onClose();
      }, 1200);
    } else {
      // Activation flow
      if (!allReady) return;
      setActivating(true);
      setTimeout(() => {
        setHasAssistant(true);
        localStorage.setItem('orch_assistant_active', 'true');
        showToast(
          'AI Assistant activated successfully! Initializing background monitors.',
          'success'
        );
        onClose();
      }, 1800);
    }
  };

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog
      open={open}
      onClose={activating ? undefined : onClose}
      fullWidth
      maxWidth="md"
      fullScreen={isMobile}
      slotProps={{
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : 4,
            background:
              'linear-gradient(180deg, var(--bg-tile, #111613) 0%, var(--bg-paper, #0f0f0f) 100%)',
            border: isMobile
              ? 'none'
              : '1px solid var(--border, rgba(var(--app-accent-rgb, 16, 185, 129), 0.15))',
            boxShadow:
              '0 0 30px var(--glow-outer, rgba(var(--app-accent-rgb, 16, 185, 129), 0.2)), 0 0 60px var(--glow-far, rgba(var(--app-accent-rgb, 16, 185, 129), 0.05))',
            color: 'var(--text, #ffffff)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: isMobile ? '100dvh' : '88vh',
          },
        },
      }}
    >
      {/* Close button */}
      <IconButton
        onClick={onClose}
        disabled={activating}
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 2,
          color: 'var(--text-dim, rgba(255, 255, 255, 0.55))',
          '&:hover': {
            color: 'var(--text, #ffffff)',
            background: 'rgba(255, 255, 255, 0.05)',
          },
        }}
      >
        <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} />
      </IconButton>
      {/* HEADER — pinned */}
      <Box
        sx={{
          flexShrink: 0,
          px: { xs: 2.5, sm: 3.5 },
          pt: { xs: 'calc(20px + env(safe-area-inset-top, 0px))', sm: 3.5 },
          pb: 2,
        }}
      >
        <DialogTitle
          component="div"
          sx={{
            p: 0,
            mb: 1,
            fontWeight: 800,
            fontSize: { xs: '1.15rem', sm: '1.4rem' },
            pr: 6,
            lineHeight: 1.25,
          }}
        >
          {hasAssistant ? 'AI Assistant Settings' : 'Activate Assistant Control Panel'}
        </DialogTitle>

        <Typography
          variant="body2"
          sx={{
            color: 'var(--text-dim, rgba(255, 255, 255, 0.55))',
            mb: 2,
            maxWidth: 650,
            lineHeight: 1.5,
          }}
        >
          {hasAssistant
            ? 'Your AI assistant is active and managing operations. Below are the status logs of the deployed system modules.'
            : "Prepare the environment. Appointing your AI assistant to manage daily operations requires configuring the modules below. Tap any block to toggle its status manually, or click 'Configure' to open the page."}
        </Typography>

        {/* Progress Bar Header */}
        <Box>
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                color: 'var(--neon, #10b981)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Environment Readiness
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--text, #ffffff)' }}>
                {readyCount} / {steps.length} MODULES READY ({pct}%)
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              width: '100%',
              height: 6,
              borderRadius: 99,
              background: 'rgba(var(--app-accent-rgb, 16, 185, 129), 0.08)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Box
              sx={{
                height: '100%',
                borderRadius: 99,
                background:
                  'linear-gradient(90deg, var(--neon-dark), var(--neon, #10b981), var(--neon-light))',
                width: `${pct}%`,
                transition: 'width 400ms ease-in-out',
                position: 'relative',
              }}
            />
          </Box>
        </Box>
      </Box>
      {/* SCROLL BODY — the only scrollport */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: { xs: 2.5, sm: 3.5 },
          py: 2,
          ...TOUCH_SCROLL_CONTAINER_SX,
        }}
      >
        {/* System blocks grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
          }}
        >
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Box
                key={step.id}
                onClick={() => handleToggle(step.id)}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: step.ready
                    ? 'var(--neon, #10b981)'
                    : 'var(--border, rgba(var(--app-accent-rgb, 16, 185, 129), 0.15))',
                  background: step.ready
                    ? 'linear-gradient(135deg, rgba(var(--app-accent-rgb, 16, 185, 129), 0.07) 0%, rgba(var(--app-accent-rgb, 16, 185, 129), 0.01) 100%)'
                    : 'rgba(255, 255, 255, 0.01)',
                  boxShadow: step.ready
                    ? '0 0 14px rgba(var(--app-accent-rgb, 16, 185, 129), 0.05)'
                    : 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 2,
                  cursor: activating || loadingStatus ? 'default' : 'pointer',
                  textAlign: 'left',
                  userSelect: 'none',
                  transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover':
                    activating || loadingStatus
                      ? {}
                      : {
                          transform: 'translateY(-2px)',
                          borderColor: 'var(--neon, #10b981)',
                          boxShadow:
                            '0 0 16px var(--glow-outer, rgba(var(--app-accent-rgb, 16, 185, 129), 0.3))',
                          background: 'rgba(var(--app-accent-rgb, 16, 185, 129), 0.04)',
                        },
                }}
              >
                {/* Icon box */}
                <Box
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    background: step.ready
                      ? 'rgba(var(--app-accent-rgb, 16, 185, 129), 0.14)'
                      : 'rgba(255, 255, 255, 0.03)',
                    color: step.ready
                      ? 'var(--neon, #10b981)'
                      : 'var(--text-dim, rgba(255, 255, 255, 0.55))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 200ms ease',
                  }}
                >
                  <AppIcon fallback={Icon} sx={{ fontSize: 22 }} />
                </Box>
                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'var(--text, #ffffff)',
                      lineHeight: 1.2,
                      mb: 0.5,
                      fontSize: '0.9rem',
                    }}
                  >
                    {step.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.75rem',
                      color: 'var(--text-dim, rgba(255, 255, 255, 0.55))',
                      lineHeight: 1.4,
                      mb: 0.5,
                    }}
                  >
                    {step.description}
                  </Typography>

                  {/* Warning label if present and not ready */}
                  {step.warning && !step.ready && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        mt: 0.5,
                        mb: 1.5,
                        color: '#ffb300',
                        fontSize: '0.7rem',
                        lineHeight: 1.35,
                        fontWeight: 500,
                        fontStyle: 'italic',
                      }}
                    >
                      ⚠️ {step.warning}
                    </Typography>
                  )}

                  {/* Action Link to Real Platform Feature + Status Pill */}
                  <Box
                    sx={{
                      mt: 1.5,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                      alignItems: 'center',
                    }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent toggling when clicking configure
                        if (step.id === 3) {
                          // Special check: warn to add BYOK/BYOS storage first
                          const byokStep = steps.find((s) => s.id === 5);
                          if (!byokStep?.ready) {
                            showToast(
                              'Warning: Please connect your BYOK/BYOS storage first to secure contact uploads.',
                              'warning'
                            );
                          }
                        }
                        window.open(step.path, '_blank');
                      }}
                      sx={{
                        textTransform: 'none',
                        fontSize: { xs: '12px', sm: '10px' },
                        fontWeight: 700,
                        minHeight: { xs: 36, sm: 'auto' },
                        py: { xs: 0.5, sm: 0.25 },
                        px: 1.25,
                        minWidth: 0,
                        borderRadius: 1.5,
                        borderColor: step.ready
                          ? 'rgba(var(--app-accent-rgb, 16, 185, 129), 0.25)'
                          : 'rgba(255, 255, 255, 0.10)',
                        color: step.ready
                          ? 'var(--neon, #10b981)'
                          : 'var(--text-dim, rgba(255, 255, 255, 0.55))',
                        '&:hover': {
                          borderColor: 'var(--neon, #10b981)',
                          background: 'rgba(var(--app-accent-rgb, 16, 185, 129), 0.05)',
                          color: 'var(--text, #ffffff)',
                        },
                      }}
                    >
                      Configure →
                    </Button>

                    {step.ready ? (
                      <Box
                        sx={{
                          px: 1,
                          py: 0.25,
                          borderRadius: 99,
                          background: 'rgba(var(--app-accent-rgb, 16, 185, 129), 0.10)',
                          border: '1px solid rgba(var(--app-accent-rgb, 16, 185, 129), 0.25)',
                          color: 'var(--neon, #10b981)',
                          fontSize: { xs: '12px', sm: '10px' },
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <Box
                          sx={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: 'var(--neon, #10b981)',
                            boxShadow: '0 0 6px var(--neon)',
                          }}
                        />
                        Ready
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          px: 1,
                          py: 0.25,
                          borderRadius: 99,
                          background: 'rgba(255, 179, 0, 0.06)',
                          border: '1px solid rgba(255, 179, 0, 0.2)',
                          color: '#ffb300',
                          fontSize: { xs: '12px', sm: '10px' },
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <Box
                          sx={{ width: 5, height: 5, borderRadius: '50%', background: '#ffb300' }}
                        />
                        Need Setup
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
      {/* FOOTER — pinned */}
      <Box
        sx={{
          flexShrink: 0,
          borderTop: '1px solid var(--border, rgba(var(--app-accent-rgb, 16, 185, 129), 0.15))',
          px: { xs: 2.5, sm: 3.5 },
          pt: 2,
          pb: { xs: 'calc(16px + env(safe-area-inset-bottom, 0px))', sm: 2 },
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: { sm: 'space-between' },
          gap: { xs: 1.5, sm: 1 },
        }}
      >
        {/* Manual Override Control */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: { xs: 'space-between', sm: 'flex-start' },
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: 'var(--text-dim, rgba(255, 255, 255, 0.55))',
              fontSize: { xs: '0.8rem', sm: '0.7rem' },
            }}
          >
            Sync: {manualOverride ? 'MANUAL' : 'LIVE AUTO-SYNC'}
          </Typography>
          <Button
            size="small"
            onClick={() => {
              if (manualOverride) {
                setManualOverride(false);
                // Trigger re-check immediately
                setTimeout(() => checkStatus(), 10);
              } else {
                setManualOverride(true);
              }
            }}
            sx={{
              textTransform: 'none',
              fontSize: { xs: '12px', sm: '10px' },
              minHeight: { xs: 44, sm: 'auto' },
              py: { xs: 0.5, sm: 0.2 },
              px: { xs: 1.5, sm: 1 },
              borderRadius: 1,
              border: '1px solid rgba(var(--app-accent-rgb, 16, 185, 129), 0.2)',
              color: 'var(--neon, #10b981)',
              '&:hover': {
                background: 'rgba(var(--app-accent-rgb, 16, 185, 129), 0.05)',
              },
            }}
          >
            {manualOverride ? 'Use Live Sync' : 'Enable Manual'}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            onClick={onClose}
            disabled={activating}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              minHeight: { xs: 44, sm: 'auto' },
              color: 'var(--text-dim, rgba(255, 255, 255, 0.55))',
              '&:hover': {
                color: 'var(--text, #ffffff)',
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAction}
            variant="contained"
            disabled={!hasAssistant && (!allReady || activating || loadingStatus)}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              px: 4,
              py: 1,
              minHeight: { xs: 44, sm: 'auto' },
              flex: { xs: 1, sm: 'initial' },
              background: hasAssistant
                ? 'rgba(239, 68, 68, 0.15)'
                : allReady
                  ? 'var(--neon, #10b981)'
                  : 'rgba(255, 255, 255, 0.05)',
              border: hasAssistant ? '1px solid rgba(239, 68, 68, 0.3)' : 'none',
              color: hasAssistant ? '#ef4444' : allReady ? '#000000' : 'rgba(255, 255, 255, 0.3)',
              boxShadow: hasAssistant
                ? 'none'
                : allReady
                  ? '0 0 20px var(--glow-outer, rgba(var(--app-accent-rgb, 16, 185, 129), 0.4))'
                  : 'none',
              '&:hover': {
                background: hasAssistant ? 'rgba(239, 68, 68, 0.25)' : 'var(--neon-light)',
                boxShadow: hasAssistant ? 'none' : '0 0 25px rgba(52, 211, 153, 0.6)',
              },
              '&.Mui-disabled': {
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'rgba(255, 255, 255, 0.25)',
                border: 'none',
              },
            }}
          >
            {activating
              ? hasAssistant
                ? 'Deactivating...'
                : 'Neural Uplink Sync...'
              : hasAssistant
                ? 'Deactivate AI Assistant'
                : allReady
                  ? 'Deploy AI Assistant'
                  : 'Ready All Modules to Deploy'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
