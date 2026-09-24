import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import GcpClerkGate from './components/Auth/GcpClerkGate';
import GcpAuthPage from './pages/Auth/GcpAuthPage';
import GcpPublicPage from './pages/Public/GcpPublicPage';
import { getTheme } from './pages/Landing/instant/themeMode';
import { pageBackground } from './pages/Landing/instant/palette';

const Landing = lazy(() => import('./pages/Landing/LandingPageInstant.jsx'));
const Classic = lazy(() => import('./pages/Landing/LandingPageSimple.jsx'));
const SubPage = lazy(() => import('./pages/Landing/instant/pages/InstantSubPage.jsx'));
const Solution = lazy(() => import('./pages/Landing/instant/pages/InstantSolutionPage.jsx'));
const Product = lazy(() => import('./pages/Landing/instant/pages/products/InstantProductPage.jsx'));
const News = lazy(() => import('./pages/Landing/instant/pages/news/NewsArticle.jsx'));
const Account = lazy(() => import('./pages/Account/AccountPage.jsx'));

function PublicSurface({ children }) {
  return <Suspense fallback={<Box aria-hidden="true" sx={{ minHeight: '100vh', bgcolor: pageBackground(getTheme()) }} />}>{children}</Suspense>;
}

function AuthAlias({ to }) {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} state={state} replace />;
}

// Retain existing published legal placeholders; unreviewed policy drafts stay out.
const publicPages = {
  '/privacy': ['Privacy', 'The production privacy notice will describe Clerk authentication, GCP hosting, durable workflow data, retention, and user rights before launch.'],
  '/terms': ['Terms', 'Production terms will be published before public launch.'],
  '/cookies': ['Cookies', 'The launch build uses the cookies and browser storage required by Clerk authentication and essential application operation.'],
  '/pricing': ['Pricing', 'Commercial terms will be published before paid access begins. No checkout is available on this page.'],
  '/features': ['Orqanix on your desktop', 'Chat, local tools and optional AxWise discovery work in the desktop app. The host controls tool selection and approvals.'],
  '/how-it-works': ['Your desktop, connected', 'Sign into the desktop with your Orqanix account. Workflow logic and results stay local; selected inputs use authenticated cloud model services.'],
  '/security': ['Account and model access', 'Clerk manages account access. The gateway verifies desktop authorization and keeps managed model credentials server-side.'],
  '/about': ['Orqanix', 'A desktop AI workspace based on Goose, with optional AxWise discovery and research tools.'],
  '/contact': ['Contact', 'Contact details and launch support channels will be published with the production release.'],
  '/docs': ['Getting started', 'Download Orqanix, open the desktop app and use its sign-in button. AxWise is an optional specialist extension, not a mandatory route for everyday questions.'],
  '/faq': ['Where is my workspace?', 'Use the desktop for conversations and results. Browser sign-in manages your account; cloud session and artifact synchronization is not currently enabled.'],
  '/status': ['Service status', 'Managed model access requires the Orqanix gateway and its model providers. This page is not a live service-health report.'],
};

export const retiredAppPaths = [
  '/home', '/assistant', '/goals/*', '/workspace/*', '/agent-hub/*', '/organizations',
  '/tools/*', '/knowledge-base/*', '/reports/*', '/history/*', '/notification-center',
  '/audit-log', '/settings/*', '/workflows-v2', '/workflow', '/task-manager', '/projects',
  '/job-pool', '/dashboard', '/dashboards/*', '/hub', '/my-agents', '/consilium',
  '/marketplace/*', '/llm-usage', '/axwise-analytics', '/notifications', '/auth/callback',
];

export const accountRoutes = [
  { path: '/', element: <PublicSurface><Landing /></PublicSurface> },
  { path: '/classic', element: <PublicSurface><Classic /></PublicSurface> },
  { path: '/standart', element: <Navigate to="/classic" replace /> },
  { path: '/instant', element: <Navigate to="/" replace /> },
  { path: '/instant/:page', element: <PublicSurface><SubPage /></PublicSurface> },
  { path: '/instant/news/:slug', element: <PublicSurface><News /></PublicSurface> },
  { path: '/instant/solutions/:slug', element: <PublicSurface><Solution /></PublicSurface> },
  { path: '/instant/products/:slug?', element: <PublicSurface><Product /></PublicSurface> },
  { path: '/login', element: <GcpAuthPage mode="login" /> },
  { path: '/signup', element: <GcpAuthPage mode="signup" /> },
  { path: '/sign-in/*', element: <AuthAlias to="/login" /> },
  { path: '/sign-up/*', element: <AuthAlias to="/signup" /> },
  { path: '/account', element: <GcpClerkGate><Suspense fallback={<CircularProgress aria-label="Loading account page" />}><Account /></Suspense></GcpClerkGate> },
  ...Object.entries(publicPages).map(([path, [title, body]]) => ({ path, element: <GcpPublicPage title={title} body={body} /> })),
  ...retiredAppPaths.map((path) => ({ path, element: <Navigate to="/account" replace /> })),
  { path: '/documentation', element: <Navigate to="/docs" replace /> },
  { path: '*', element: <GcpPublicPage eyebrow="404" title="This page is not available." body="Visit the website for downloads and account access. Conversations and tools are available in the Orqanix desktop app." /> },
];

export const gcpRouter = createBrowserRouter(accountRoutes);
