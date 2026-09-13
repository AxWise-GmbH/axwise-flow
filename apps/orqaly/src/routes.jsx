import { Suspense } from 'react';
import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom';
import { lazyRetry } from './lib/lazyRetry';
import MainLayout from './components/Layout/MainLayout';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import LoadingSpinner from './components/Common/LoadingSpinner';
import AxwiseRouteGuard from './components/Layout/AxwiseRouteGuard';
import Login from './pages/Auth/Login';
import InviteCallback from './pages/Auth/InviteCallback.jsx';
import LandingRoot from './pages/Landing/LandingRoot.jsx';

import PinGate from './pages/Auth/PinGate';
import NotFound from './pages/NotFound';
import ErrorBoundaryPage from './pages/ErrorBoundaryPage';

const Home = lazyRetry(() => import('./pages/Home/Home.jsx'));
const Settings = lazyRetry(() => import('./pages/Settings/ClerkSettings.jsx'));
const AuditLog = lazyRetry(() => import('./pages/AuditLog/AuditLog.jsx'));
const NotificationCenter = lazyRetry(
  () => import('./pages/NotificationCenter/NotificationCenter.jsx')
);
const Data = lazyRetry(() => import('./pages/Data.jsx'));
const ReportPage = lazyRetry(() => import('./pages/Reports/ReportPage.jsx'));
const LlmUsage = lazyRetry(() => import('./pages/LlmUsage/LlmUsage.jsx'));
const AgentHub = lazyRetry(() => import('./pages/AgentHub/AgentHub.jsx'));
const AgentReports = lazyRetry(() => import('./pages/AgentHub/AgentReports.jsx'));
const Tools = lazyRetry(() => import('./pages/Tools/Tools.jsx'));
const Organizations = lazyRetry(() => import('./pages/Organizations/Organizations.jsx'));
const AxwiseAnalytics = lazyRetry(() => import('./pages/AxwiseAnalytics/AxwiseAnalytics.jsx'));
const SetupPage = lazyRetry(() => import('./pages/Setup/SetupPage.jsx'));
const KnowledgeBase = lazyRetry(() => import('./pages/KnowledgeBase/KnowledgeBase.jsx'));
const Marketplace = lazyRetry(() => import('./pages/Marketplace/Marketplace.jsx'));
const MarketplaceLanding = lazyRetry(() => import('./pages/Marketplace/MarketplaceLanding.jsx'));
const MarketplaceImport = lazyRetry(() => import('./pages/Marketplace/MarketplaceImport.jsx'));
const About = lazyRetry(() => import('./pages/Public/About.jsx'));
const PublicPricing = lazyRetry(() => import('./pages/Public/Pricing.jsx'));
const PublicFeatures = lazyRetry(() => import('./pages/Public/Features.jsx'));
const PublicHowItWorks = lazyRetry(() => import('./pages/Public/HowItWorks.jsx'));
const Contact = lazyRetry(() => import('./pages/Public/Contact.jsx'));
const Privacy = lazyRetry(() => import('./pages/Public/Privacy.jsx'));
const Terms = lazyRetry(() => import('./pages/Public/Terms.jsx'));
const Cookies = lazyRetry(() => import('./pages/Public/Cookies.jsx'));
const SecurityPage = lazyRetry(() => import('./pages/Public/Security.jsx'));
const StatusPage = lazyRetry(() => import('./pages/Public/Status.jsx'));
const PublicDocs = lazyRetry(() => import('./pages/Public/PublicDocs.jsx'));
const SolutionRouter = lazyRetry(() => import('./pages/Public/SolutionRouter.jsx'));
const FaqPage = lazyRetry(() => import('./pages/Public/Faq.jsx'));
const SearchResults = lazyRetry(() => import('./pages/Public/SearchResults.jsx'));
const Signup = lazyRetry(() => import('./pages/Public/Signup.jsx'));
const WorkflowV2 = lazyRetry(() => import('./pages/WorkflowV2/WorkflowV2.jsx'));
// Pulse and PromptLab are now embedded as tabs inside Agent Hub
// (/agent-hub?tab=pulse and /agent-hub?tab=prompt-lab). The /pulse and
// /prompt-lab routes redirect there for backwards compatibility.

// eslint-disable-next-line react-refresh/only-export-components
const LazyRoute = ({ children }) => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{children}</Suspense>
);

export function assistantGoalsPath(runId) {
  const params = new URLSearchParams({ section: 'goals' });
  if (runId) params.set('run', runId);
  return `/assistant?${params.toString()}`;
}

function WorkflowV2Redirect() {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: '/assistant', search: location.search, hash: location.hash }}
      replace
    />
  );
}

function LegacyGoalRedirect() {
  const { id } = useParams();
  return <Navigate to={assistantGoalsPath(id)} replace />;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingRoot />,
  },
  {
    path: '/pin',
    element: <PinGate />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/auth/callback',
    element: <InviteCallback />,
  },
  {
    path: '/p/:slug',
    element: <NotFound />,
  },
  {
    path: '/book/:slug',
    element: <NotFound />,
  },
  {
    path: '/schedule/:token',
    element: <NotFound />,
  },
  {
    path: '/about',
    element: (
      <LazyRoute>
        <About />
      </LazyRoute>
    ),
  },
  {
    path: '/icon-library',
    element: <NotFound />,
  },
  {
    path: '/pricing',
    element: (
      <LazyRoute>
        <PublicPricing />
      </LazyRoute>
    ),
  },
  {
    path: '/features',
    element: (
      <LazyRoute>
        <PublicFeatures />
      </LazyRoute>
    ),
  },
  {
    path: '/how-it-works',
    element: (
      <LazyRoute>
        <PublicHowItWorks />
      </LazyRoute>
    ),
  },
  {
    path: '/earn',
    element: <NotFound />,
  },
  {
    path: '/contact',
    element: (
      <LazyRoute>
        <Contact />
      </LazyRoute>
    ),
  },
  {
    path: '/privacy',
    element: (
      <LazyRoute>
        <Privacy />
      </LazyRoute>
    ),
  },
  {
    path: '/terms',
    element: (
      <LazyRoute>
        <Terms />
      </LazyRoute>
    ),
  },
  {
    path: '/cookies',
    element: (
      <LazyRoute>
        <Cookies />
      </LazyRoute>
    ),
  },
  {
    path: '/security',
    element: (
      <LazyRoute>
        <SecurityPage />
      </LazyRoute>
    ),
  },
  {
    path: '/status',
    element: (
      <LazyRoute>
        <StatusPage />
      </LazyRoute>
    ),
  },
  {
    path: '/docs',
    element: (
      <LazyRoute>
        <PublicDocs />
      </LazyRoute>
    ),
  },
  {
    path: '/solutions/:industry',
    element: (
      <LazyRoute>
        <SolutionRouter />
      </LazyRoute>
    ),
  },
  {
    path: '/marketplace-preview',
    element: <NotFound />,
  },
  {
    path: '/investors',
    element: <NotFound />,
  },
  {
    path: '/instruments/:slug',
    element: <NotFound />,
  },
  {
    path: '/control/:slug',
    element: <NotFound />,
  },
  {
    path: '/faq',
    element: (
      <LazyRoute>
        <FaqPage />
      </LazyRoute>
    ),
  },
  {
    path: '/search',
    element: (
      <LazyRoute>
        <SearchResults />
      </LazyRoute>
    ),
  },
  {
    path: '/signup',
    element: (
      <LazyRoute>
        <Signup />
      </LazyRoute>
    ),
  },
  {
    path: '/workflows-v2',
    element: <WorkflowV2Redirect />,
  },
  {
    // Pathless layout route — wraps all protected app routes without claiming "/"
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    errorElement: <ErrorBoundaryPage />,
    children: [
      {
        path: '/home',
        element: (
          <LazyRoute>
            <Home />
          </LazyRoute>
        ),
      },
      {
        path: '/dashboard',
        element: <Navigate to="/home" replace />,
      },
      {
        path: '/hub',
        element: <Navigate to="/home" replace />,
      },
      {
        path: '/partners',
        element: <NotFound />,
      },
      {
        path: '/partners/:id',
        element: <NotFound />,
      },
      {
        path: '/task-manager',
        element: <Navigate to={assistantGoalsPath()} replace />,
      },
      {
        path: '/workflow',
        element: <Navigate to={assistantGoalsPath()} replace />,
      },
      {
        path: '/projects',
        element: <Navigate to={assistantGoalsPath()} replace />,
      },
      {
        path: '/finances',
        element: <NotFound />,
      },
      {
        path: '/campaigns',
        element: <NotFound />,
      },
      {
        path: '/notification-center',
        element: (
          <LazyRoute>
            <NotificationCenter />
          </LazyRoute>
        ),
      },
      {
        path: '/strategy-center',
        element: <NotFound />,
      },
      {
        path: '/agent-hub',
        element: (
          <LazyRoute>
            <AgentHub />
          </LazyRoute>
        ),
      },
      {
        path: '/consilium',
        element: <Navigate to="/agent-hub?tab=teams" replace />,
      },
      {
        path: '/communicator',
        element: <NotFound />,
      },
      {
        path: '/communicator/connect-telegram',
        element: <NotFound />,
      },
      {
        path: '/assistant',
        element: (
          <LazyRoute>
            <WorkflowV2 embedded />
          </LazyRoute>
        ),
      },
      {
        path: '/agent-hub/:id/reports',
        element: (
          <LazyRoute>
            <AgentReports />
          </LazyRoute>
        ),
      },
      {
        path: '/injection-hub',
        element: <NotFound />,
      },
      {
        path: '/tools',
        element: (
          <LazyRoute>
            <Tools />
          </LazyRoute>
        ),
      },
      {
        path: '/arena',
        element: <NotFound />,
      },
      {
        path: '/job-pool',
        element: <Navigate to={assistantGoalsPath()} replace />,
      },
      {
        path: '/organizations',
        element: (
          <LazyRoute>
            <Organizations />
          </LazyRoute>
        ),
      },
      {
        path: '/marketplace',
        element: (
          <LazyRoute>
            <MarketplaceLanding />
          </LazyRoute>
        ),
      },
      {
        path: '/marketplace/browse',
        element: (
          <LazyRoute>
            <Marketplace />
          </LazyRoute>
        ),
      },
      {
        path: '/marketplace/import',
        element: (
          <LazyRoute>
            <MarketplaceImport />
          </LazyRoute>
        ),
      },
      {
        path: '/replicators',
        element: <NotFound />,
      },
      {
        path: '/replicators/:replicatorSlug/:pageSlug?',
        element: <NotFound />,
      },
      {
        path: '/page-builder/:pageId?',
        element: <NotFound />,
      },
      {
        path: '/investments',
        element: <NotFound />,
      },
      {
        path: '/investments/investor/:id',
        element: <NotFound />,
      },
      {
        path: '/investments/deal/:id',
        element: <NotFound />,
      },
      {
        path: '/goals',
        element: <Navigate to={assistantGoalsPath()} replace />,
      },
      {
        path: '/goals/:id',
        element: <LegacyGoalRedirect />,
      },
      {
        path: '/axwise-analytics',
        element: (
          <AxwiseRouteGuard>
            <LazyRoute>
              <AxwiseAnalytics />
            </LazyRoute>
          </AxwiseRouteGuard>
        ),
      },
      {
        path: '/businesses',
        element: <NotFound />,
      },
      {
        path: '/marketing/:pageId',
        element: <NotFound />,
      },
      {
        path: '/partners-hub/:section',
        element: <NotFound />,
      },
      {
        path: '/partners-hub',
        element: <NotFound />,
      },
      {
        path: '/pulse',
        element: <Navigate to="/agent-hub?tab=pulse" replace />,
      },
      {
        path: '/prompt-lab',
        element: <Navigate to="/agent-hub?tab=prompt-lab" replace />,
      },
      {
        path: '/knowledge-base',
        element: (
          <LazyRoute>
            <KnowledgeBase />
          </LazyRoute>
        ),
      },
      {
        path: '/my-agents',
        element: <Navigate to="/agent-hub?tab=my-agents" replace />,
      },
      {
        path: '/settings',
        element: (
          <LazyRoute>
            <Settings />
          </LazyRoute>
        ),
      },
      {
        path: '/settings/booking',
        element: <NotFound />,
      },
      {
        path: '/setup',
        element: (
          <LazyRoute>
            <SetupPage />
          </LazyRoute>
        ),
      },
      {
        path: '/settings/keys',
        element: <Navigate to="/setup" replace />,
      },
      {
        path: '/settings/storage',
        element: <Navigate to="/setup" replace />,
      },
      {
        path: '/settings/brand-kit',
        element: <NotFound />,
      },
      {
        path: '/audit-log',
        element: (
          <LazyRoute>
            <AuditLog />
          </LazyRoute>
        ),
      },
      {
        path: '/documentation',
        element: <Navigate to="/docs" replace />,
      },
      {
        path: '/mui-icons',
        element: <NotFound />,
      },
      {
        path: '/roles',
        element: <NotFound />,
      },
      {
        path: '/data',
        element: (
          <LazyRoute>
            <Data />
          </LazyRoute>
        ),
      },
      {
        path: '/visuacore',
        element: <NotFound />,
      },
      {
        path: '/github-pushes',
        element: <NotFound />,
      },
      {
        path: '/reports',
        element: (
          <LazyRoute>
            <ReportPage />
          </LazyRoute>
        ),
      },
      {
        path: '/llm-usage',
        element: (
          <LazyRoute>
            <LlmUsage />
          </LazyRoute>
        ),
      },
      {
        path: '/llm-usage-demo',
        element: <NotFound />,
      },
      {
        path: '/reports/builder',
        element: <Navigate to="/reports" replace />,
      },
      {
        path: '/dashboards',
        element: <Navigate to="/reports" replace />,
      },
      {
        path: '/dashboards/new',
        element: <Navigate to="/reports" replace />,
      },
      {
        path: '/dashboards/:id',
        element: <Navigate to="/reports" replace />,
      },
      {
        path: '/dashboards/:id/edit',
        element: <Navigate to="/reports" replace />,
      },
      {
        path: '/settings/groups',
        element: <NotFound />,
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default router;
