import { Suspense, lazy, useCallback, useEffect, useMemo } from 'react';
import { Box, CircularProgress } from '@mui/material';
import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import GcpClerkGate from './components/Auth/GcpClerkGate';
import GcpStandartShell from './components/Layout/GcpStandartShell';
import GcpAuthPage from './pages/Auth/GcpAuthPage';
import GcpInviteCallback from './pages/Auth/GcpInviteCallback';
import GcpNotFound from './pages/Public/GcpNotFound';
import GcpPublicPage from './pages/Public/GcpPublicPage';
import LandingPageSimple from './pages/Landing/LandingPageSimple';
import { getTheme } from './pages/Landing/instant/themeMode';
import { pageBackground } from './pages/Landing/instant/palette';

/* eslint-disable react-refresh/only-export-components -- route components and the exported route table must stay together so tests exercise the production manifest. */

const LandingPageInstant = lazy(() => import('./pages/Landing/LandingPageInstant.jsx'));
const InstantSubPage = lazy(() => import('./pages/Landing/instant/pages/InstantSubPage.jsx'));
const InstantSolutionPage = lazy(
  () => import('./pages/Landing/instant/pages/InstantSolutionPage.jsx')
);
const InstantProductPage = lazy(
  () => import('./pages/Landing/instant/pages/products/InstantProductPage.jsx')
);
const NewsArticle = lazy(() => import('./pages/Landing/instant/pages/news/NewsArticle.jsx'));
const LegalCenter = lazy(() => import('./pages/Landing/instant/pages/legal/LegalCenter.jsx'));
const WorkflowV2 = lazy(() => import('./pages/WorkflowV2/WorkflowV2.jsx'));
const GcpClerkSettings = lazy(() => import('./pages/Settings/GcpClerkSettings.jsx'));
const HomePage = lazy(() => import('./pages/GcpWorkspace/HomePage.jsx'));
const StructurePage = lazy(() => import('./pages/GcpWorkspace/StructurePage.jsx'));
const AgentsPage = lazy(() => import('./pages/GcpWorkspace/AgentsPage.jsx'));
const AgentDetailPage = lazy(() => import('./pages/GcpWorkspace/AgentDetailPage.jsx'));
const SolutionDetailPage = lazy(() => import('./pages/GcpWorkspace/SolutionDetailPage.jsx'));
const WorkflowBuildPage = lazy(() => import('./pages/GcpWorkspace/WorkflowBuildPage.jsx'));
const WorkflowsPage = lazy(() => import('./pages/GcpWorkspace/WorkflowsPage.jsx'));
const CapabilitiesPage = lazy(() => import('./pages/GcpWorkspace/CapabilitiesPage.jsx'));
const KnowledgePage = lazy(() => import('./pages/GcpWorkspace/KnowledgePage.jsx'));
const ResultsPage = lazy(() => import('./pages/GcpWorkspace/ResultsPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/GcpWorkspace/NotificationsPage.jsx'));
const ActivityPage = lazy(() => import('./pages/GcpWorkspace/ActivityPage.jsx'));
const HistoryPage = lazy(() => import('./pages/GcpWorkspace/HistoryPage.jsx'));

const publicPages = {
  '/pricing': [
    'Pricing',
    'Launch access',
    'Orqanix is launching with one connected workspace. Commercial terms will be published before paid access begins.',
  ],
  '/features': [
    'Product',
    'A complete agent workspace',
    'Start in Assistant, move substantial work into a Goal, and keep agents, capabilities, knowledge, results, notifications, and audit evidence in one controlled workspace.',
  ],
  '/how-it-works': [
    'Product',
    'From request to durable result',
    'Assistant handles the conversation. Goals hold the scoped workflow, approvals, progress, artifacts, and final Markdown output.',
  ],
  '/security': [
    'Trust',
    'Fail closed by design',
    'Clerk authenticates every protected route. The GCP API verifies the session again, and durable work keeps tenant, operation, approval, and artifact boundaries explicit.',
  ],
  '/about': [
    'Company',
    'Orqanix gives agents work and keeps people in control.',
    'The retained product centers on a personal workspace, Assistant, durable Goals, agents, capabilities, knowledge, explicit approvals, and evidence-backed results.',
  ],
  '/contact': [
    'Company',
    'Talk to Orqanix',
    'Contact details and launch support channels will be published with the production release.',
  ],
  '/docs': [
    'Resources',
    'Launch documentation',
    'The first documentation set covers sign-in, the workspace menu, Assistant, Goals, agents, capabilities, knowledge, approvals, artifacts, activity, and account security.',
  ],
  '/faq': [
    'Resources',
    'Questions before launch',
    'The GCP release uses Clerk for personal accounts and does not require Clerk Organizations or Supabase user accounts.',
  ],
  '/privacy': [
    'Legal',
    'Privacy',
    'The production privacy notice will describe Clerk authentication, GCP hosting, durable workflow data, retention, and user rights before launch.',
  ],
  '/terms': ['Legal', 'Terms', 'Production terms will be published before public launch.'],
  '/cookies': [
    'Legal',
    'Cookies',
    'The launch build uses the cookies and browser storage required by Clerk authentication and essential application operation.',
  ],
  '/status': [
    'Operations',
    'Service status',
    'The launch status page will report the web app, API, database, authentication, and reasoning service.',
  ],
};

function Loading() {
  return (
    <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}>
      <CircularProgress size={28} aria-label="Loading page" />
    </Box>
  );
}
function LazyPage({ children }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
// The landing pages open on their own entrance, so while their code arrives the screen is
// just their page, black or (the visitor's footer pick) light: no spinner flashing before the
// first words rise, and no black flash between two light pages.
function LazyLandingPage({ children }) {
  const ground = pageBackground(getTheme());
  return (
    <Suspense fallback={<Box aria-hidden="true" sx={{ minHeight: '100vh', bgcolor: ground }} />}>
      {children}
    </Suspense>
  );
}

const GCP_DRAFT_MAX_LENGTH = 24_000;
const GCP_DRAFT_MODES = new Set(['auto', 'assistant', 'research', 'goal']);

export function normalizeGcpDraft(value) {
  if (!value || typeof value !== 'object') return null;
  if (!GCP_DRAFT_MODES.has(value.mode)) return null;
  if (typeof value.nonce !== 'string') return null;
  const nonce = value.nonce.trim();
  if (!nonce || nonce !== value.nonce || nonce.length > 128) return null;
  if (typeof value.text !== 'string') return null;
  const text = value.text.trim();
  if (!text || text.length > GCP_DRAFT_MAX_LENGTH) return null;
  return { mode: value.mode, nonce, text };
}

export function WorkflowRoute({ section }) {
  const navigate = useNavigate();
  const location = useLocation();
  const rawDraft = location.state?.gcpDraft;
  const initialDraft = useMemo(() => normalizeGcpDraft(rawDraft), [rawDraft]);
  const stateWithoutDraft = useMemo(() => {
    if (!location.state || typeof location.state !== 'object') return null;
    const rest = { ...location.state };
    delete rest.gcpDraft;
    return Object.keys(rest).length ? rest : null;
  }, [location.state]);
  const consumeDraft = useCallback(
    (nonce) => {
      if (initialDraft?.nonce !== nonce) return;
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, state: stateWithoutDraft }
      );
    },
    [
      initialDraft?.nonce,
      location.hash,
      location.pathname,
      location.search,
      navigate,
      stateWithoutDraft,
    ]
  );

  useEffect(() => {
    if (rawDraft === undefined || initialDraft) return;
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: stateWithoutDraft }
    );
  }, [
    initialDraft,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    rawDraft,
    stateWithoutDraft,
  ]);

  return (
    <LazyPage>
      <WorkflowV2
        embedded
        initialSection={section}
        showSectionNav={false}
        showAssistantThreadRail={false}
        routeSearch={location.search}
        initialDraft={initialDraft}
        onDraftConsumed={consumeDraft}
        onNavigateGoal={(runId) => navigate(`/goals?${new URLSearchParams({ run: runId })}`)}
      />
    </LazyPage>
  );
}

function LegacyWorkflowRedirect({ goals = false }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const openGoals = goals || params.has('run') || params.get('section') === 'goals';
  return (
    <Navigate
      to={{
        pathname: openGoals ? '/goals' : '/assistant',
        search: location.search,
        hash: location.hash,
      }}
      replace
    />
  );
}

function GoalRedirect() {
  const { id } = useParams();
  const params = new URLSearchParams({ run: id });
  return <Navigate to={`/goals?${params}`} replace />;
}

export function WorkspaceRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: '/workspace', search: location.search, hash: location.hash }}
      replace
    />
  );
}

function ScopedPreviewPage() {
  return (
    <GcpPublicPage
      eyebrow="Launch scope"
      title="This optional module is outside the retained workspace."
      body="The preview keeps the core workspace together. Return home to see Orqanix or sign in to open the available modules."
    />
  );
}

// The old legal placeholders now open the Legal Center's documents.
const LEGAL_REDIRECTS = {
  '/privacy': '/instant/legal/privacy',
  '/terms': '/instant/legal/terms',
  '/cookies': '/instant/legal/cookies',
};

const publicRoutes = Object.entries(publicPages).map(([path, [eyebrow, title, body]]) => ({
  path,
  element: LEGAL_REDIRECTS[path] ? (
    <Navigate to={LEGAL_REDIRECTS[path]} replace />
  ) : (
    <GcpPublicPage eyebrow={eyebrow} title={title} body={body} />
  ),
}));

export const gcpRoutePaths = [
  '/',
  '/login',
  '/signup',
  '/auth/callback',
  ...Object.keys(publicPages),
  '/home',
  '/assistant',
  '/goals',
  '/goals/:id',
  '/workspace',
  '/agent-hub',
  '/agent-hub/:agentId',
  '/workspace/solutions/:solutionId',
  '/workspace/builds/:buildRequestId',
  '/workspace/workflows',
  '/tools',
  '/knowledge-base',
  '/reports',
  '/history/:kind',
  '/notification-center',
  '/audit-log',
  '/settings',
];

export const gcpRouter = createBrowserRouter([
  {
    path: '/',
    element: (
      <LazyLandingPage>
        <LandingPageInstant />
      </LazyLandingPage>
    ),
  },
  // The page this one replaced, kept reachable rather than deleted.
  { path: '/classic', element: <LandingPageSimple /> },
  { path: '/standart', element: <Navigate to="/classic" replace /> },
  // The preview path the landing was built and shared on, now one canonical URL.
  { path: '/instant', element: <Navigate to="/" replace /> },
  {
    path: '/instant/:page',
    element: (
      <LazyLandingPage>
        <InstantSubPage />
      </LazyLandingPage>
    ),
  },
  {
    path: '/instant/news/:slug',
    element: (
      <LazyLandingPage>
        <NewsArticle />
      </LazyLandingPage>
    ),
  },
  {
    path: '/instant/solutions/:slug',
    element: (
      <LazyLandingPage>
        <InstantSolutionPage />
      </LazyLandingPage>
    ),
  },
  // A bare /instant/products (or an unknown product) lands on the Desktop App page.
  {
    path: '/instant/products/:slug?',
    element: (
      <LazyLandingPage>
        <InstantProductPage />
      </LazyLandingPage>
    ),
  },
  // The Legal Center: /instant/legal, /instant/legal/<us|eu>, /instant/legal/<us|eu>/<document>.
  {
    path: '/instant/legal/*',
    element: (
      <LazyLandingPage>
        <LegalCenter />
      </LazyLandingPage>
    ),
  },
  { path: '/login', element: <GcpAuthPage mode="login" /> },
  { path: '/signup', element: <GcpAuthPage mode="signup" /> },
  { path: '/auth/callback', element: <GcpInviteCallback /> },
  ...publicRoutes,
  { path: '/solutions/:industry', element: <ScopedPreviewPage /> },
  { path: '/instruments/:slug', element: <ScopedPreviewPage /> },
  { path: '/control/:slug', element: <ScopedPreviewPage /> },
  { path: '/marketplace-preview', element: <ScopedPreviewPage /> },
  { path: '/earn', element: <ScopedPreviewPage /> },
  { path: '/investors', element: <ScopedPreviewPage /> },
  { path: '/table-lab', element: <ScopedPreviewPage /> },
  {
    element: (
      <GcpClerkGate>
        <GcpStandartShell />
      </GcpClerkGate>
    ),
    children: [
      {
        path: '/home',
        element: (
          <LazyPage>
            <HomePage />
          </LazyPage>
        ),
      },
      { path: '/assistant', element: <WorkflowRoute section="assistant" /> },
      { path: '/goals', element: <WorkflowRoute section="goals" /> },
      { path: '/goals/:id', element: <GoalRedirect /> },
      {
        path: '/workspace',
        element: (
          <LazyPage>
            <StructurePage />
          </LazyPage>
        ),
      },
      { path: '/organizations', element: <WorkspaceRedirect /> },
      {
        path: '/agent-hub',
        element: (
          <LazyPage>
            <AgentsPage />
          </LazyPage>
        ),
      },
      {
        path: '/agent-hub/:agentId',
        element: (
          <LazyPage>
            <AgentDetailPage />
          </LazyPage>
        ),
      },
      {
        path: '/workspace/solutions/:solutionId',
        element: (
          <LazyPage>
            <SolutionDetailPage />
          </LazyPage>
        ),
      },
      {
        path: '/workspace/builds/:buildRequestId',
        element: (
          <LazyPage>
            <WorkflowBuildPage />
          </LazyPage>
        ),
      },
      {
        path: '/workspace/workflows',
        element: (
          <LazyPage>
            <WorkflowsPage />
          </LazyPage>
        ),
      },
      {
        path: '/tools',
        element: (
          <LazyPage>
            <CapabilitiesPage />
          </LazyPage>
        ),
      },
      {
        path: '/knowledge-base',
        element: (
          <LazyPage>
            <KnowledgePage />
          </LazyPage>
        ),
      },
      {
        path: '/reports',
        element: (
          <LazyPage>
            <ResultsPage />
          </LazyPage>
        ),
      },
      {
        path: '/history/:kind',
        element: (
          <LazyPage>
            <HistoryPage />
          </LazyPage>
        ),
      },
      {
        path: '/notification-center',
        element: (
          <LazyPage>
            <NotificationsPage />
          </LazyPage>
        ),
      },
      {
        path: '/audit-log',
        element: (
          <LazyPage>
            <ActivityPage />
          </LazyPage>
        ),
      },
      {
        path: '/settings',
        element: (
          <LazyPage>
            <GcpClerkSettings />
          </LazyPage>
        ),
      },
      { path: '/workflows-v2', element: <LegacyWorkflowRedirect /> },
      { path: '/workflow', element: <LegacyWorkflowRedirect goals /> },
      { path: '/task-manager', element: <LegacyWorkflowRedirect goals /> },
      { path: '/projects', element: <LegacyWorkflowRedirect goals /> },
      { path: '/job-pool', element: <LegacyWorkflowRedirect goals /> },
      { path: '/dashboard', element: <Navigate to="/home" replace /> },
      { path: '/hub', element: <Navigate to="/home" replace /> },
      { path: '/my-agents', element: <Navigate to="/agent-hub" replace /> },
      { path: '/consilium', element: <Navigate to="/agent-hub?tab=teams" replace /> },
      { path: '/marketplace', element: <Navigate to="/tools?tab=catalog" replace /> },
      { path: '/marketplace/browse', element: <Navigate to="/tools?tab=catalog" replace /> },
      { path: '/marketplace/import', element: <Navigate to="/tools?tab=catalog" replace /> },
      { path: '/reports/builder', element: <Navigate to="/reports" replace /> },
      { path: '/dashboards', element: <Navigate to="/reports" replace /> },
      { path: '/dashboards/new', element: <Navigate to="/reports" replace /> },
      { path: '/dashboards/:id', element: <Navigate to="/reports" replace /> },
      { path: '/dashboards/:id/edit', element: <Navigate to="/reports" replace /> },
      { path: '/llm-usage', element: <Navigate to="/audit-log?view=usage" replace /> },
      { path: '/axwise-analytics', element: <Navigate to="/audit-log?view=axwise" replace /> },
      { path: '/notifications', element: <Navigate to="/notification-center" replace /> },
      { path: '/documentation', element: <Navigate to="/docs" replace /> },
      { path: '/settings/keys', element: <Navigate to="/settings" replace /> },
      { path: '/settings/storage', element: <Navigate to="/settings" replace /> },
    ],
  },
  { path: '*', element: <GcpNotFound /> },
]);
