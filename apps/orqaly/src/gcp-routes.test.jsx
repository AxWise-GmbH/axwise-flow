import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { matchRoutes, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import GcpClerkGate from './components/Auth/GcpClerkGate';
import {
  gcpRoutePaths,
  gcpRouter,
  normalizeGcpDraft,
  WorkflowRoute,
  WorkspaceRedirect,
} from './gcp-routes';
import LandingPageSimple from './pages/Landing/LandingPageSimple';

vi.mock('./pages/WorkflowV2/WorkflowV2.jsx', () => ({
  default: ({ initialDraft, onDraftConsumed }) => (
    <button
      type="button"
      disabled={!initialDraft}
      onClick={() => onDraftConsumed?.(initialDraft.nonce)}
    >
      {initialDraft ? `Consume ${initialDraft.mode} draft` : 'No draft'}
    </button>
  ),
}));

const canonicalPaths = [
  '/',
  '/login',
  '/signup',
  '/auth/callback',
  '/pricing',
  '/features',
  '/how-it-works',
  '/security',
  '/about',
  '/contact',
  '/docs',
  '/faq',
  '/privacy',
  '/terms',
  '/cookies',
  '/status',
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

const protectedLocations = [
  '/home',
  '/assistant',
  '/goals?run=00000000-0000-4000-8000-000000000001',
  '/goals/00000000-0000-4000-8000-000000000001',
  '/workspace',
  '/organizations',
  '/agent-hub',
  '/agent-hub/10000000-0000-4000-8000-000000000010',
  '/workspace/solutions/10000000-0000-4000-8000-000000000010',
  '/workspace/builds/10000000-0000-4000-8000-000000000010',
  '/workspace/workflows',
  '/tools',
  '/knowledge-base',
  '/reports',
  '/history/chats',
  '/history/goals',
  '/history/results',
  '/notification-center',
  '/audit-log',
  '/settings',
  '/workflows-v2',
  '/workflow',
  '/task-manager',
  '/projects',
  '/job-pool',
  '/dashboard',
  '/hub',
  '/my-agents',
  '/consilium',
  '/marketplace',
  '/llm-usage',
];

const publicPreviewLocations = [
  '/solutions/healthcare',
  '/instruments/workflow',
  '/control/agents',
  '/marketplace-preview',
  '/earn',
  '/investors',
  '/table-lab',
];

const explicitTopLevelPatterns = [
  '/',
  '/standart',
  '/instant',
  '/instant/:page',
  '/instant/solutions/:slug',
  '/login',
  '/signup',
  '/auth/callback',
  '/pricing',
  '/features',
  '/how-it-works',
  '/security',
  '/about',
  '/contact',
  '/docs',
  '/faq',
  '/privacy',
  '/terms',
  '/cookies',
  '/status',
  '/solutions/:industry',
  '/instruments/:slug',
  '/control/:slug',
  '/marketplace-preview',
  '/earn',
  '/investors',
  '/table-lab',
  '*',
];

const protectedPatterns = [
  '/home',
  '/assistant',
  '/goals',
  '/goals/:id',
  '/workspace',
  '/organizations',
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
  '/workflows-v2',
  '/workflow',
  '/task-manager',
  '/projects',
  '/job-pool',
  '/dashboard',
  '/hub',
  '/my-agents',
  '/consilium',
  '/marketplace',
  '/marketplace/browse',
  '/marketplace/import',
  '/reports/builder',
  '/dashboards',
  '/dashboards/new',
  '/dashboards/:id',
  '/dashboards/:id/edit',
  '/llm-usage',
  '/axwise-analytics',
  '/notifications',
  '/documentation',
  '/settings/keys',
  '/settings/storage',
];

const unsupportedLocations = [
  '/communicator',
  '/partners',
  '/finances',
  '/marketing/dashboard',
  '/investments',
  '/replicators',
  '/page-builder/example',
  '/arena',
  '/roles',
  '/data',
  '/settings/groups',
];

function matches(location) {
  return matchRoutes(gcpRouter.routes, location) || [];
}

function leaf(location) {
  return matches(location).at(-1)?.route;
}

function RouteStateProbe() {
  const location = useLocation();
  return (
    <output data-testid="workflow-route-location">
      {JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        state: location.state,
      })}
    </output>
  );
}

function renderWorkflowRoute(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/assistant"
          element={
            <>
              <WorkflowRoute section="assistant" />
              <RouteStateProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('GCP launch route allowlist', () => {
  it('accepts only bounded Auto, Assistant, Research, and Goal route-state drafts', () => {
    expect(
      normalizeGcpDraft({ mode: 'auto', nonce: 'draft-auto', text: '  Route this request.  ' })
    ).toEqual({ mode: 'auto', nonce: 'draft-auto', text: 'Route this request.' });
    expect(
      normalizeGcpDraft({ mode: 'assistant', nonce: 'draft-1', text: '  Prepare a brief.  ' })
    ).toEqual({ mode: 'assistant', nonce: 'draft-1', text: 'Prepare a brief.' });
    expect(normalizeGcpDraft({ mode: 'goal', nonce: 'draft-2', text: 'Plan it.' })).toEqual({
      mode: 'goal',
      nonce: 'draft-2',
      text: 'Plan it.',
    });
    expect(
      normalizeGcpDraft({ mode: 'research', nonce: 'draft-research', text: 'Compare sources.' })
    ).toEqual({
      mode: 'research',
      nonce: 'draft-research',
      text: 'Compare sources.',
    });
    expect(normalizeGcpDraft({ mode: 'unknown', nonce: 'draft-3', text: 'No.' })).toBeNull();
    expect(normalizeGcpDraft({ mode: 'assistant', nonce: '', text: 'No.' })).toBeNull();
    expect(normalizeGcpDraft({ mode: 'assistant', nonce: ' '.repeat(3), text: 'No.' })).toBeNull();
    expect(normalizeGcpDraft({ mode: 'assistant', nonce: ' draft ', text: 'No.' })).toBeNull();
    expect(
      normalizeGcpDraft({ mode: 'assistant', nonce: 'x'.repeat(129), text: 'No.' })
    ).toBeNull();
    expect(normalizeGcpDraft({ mode: 'assistant', nonce: 'draft-4', text: '   ' })).toBeNull();
    expect(
      normalizeGcpDraft({
        mode: 'assistant',
        nonce: 'draft-goal-max',
        text: `Start a goal: ${'x'.repeat(24_000)}`,
      })
    ).toBeNull();
    expect(
      normalizeGcpDraft({ mode: 'assistant', nonce: 'draft-too-long', text: 'x'.repeat(24_001) })
    ).toBeNull();
    expect(
      normalizeGcpDraft({ mode: 'goal', nonce: 'draft-5', text: 'x'.repeat(24_001) })
    ).toBeNull();
  });

  it('consumes a draft by replacing route state while preserving location and unrelated state', async () => {
    renderWorkflowRoute({
      pathname: '/assistant',
      search: '?from=home',
      hash: '#composer',
      state: {
        keep: 'preserved',
        gcpDraft: { mode: 'assistant', nonce: 'draft-route-1', text: 'Private request' },
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Consume assistant draft' }));

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('workflow-route-location').textContent)).toEqual({
        pathname: '/assistant',
        search: '?from=home',
        hash: '#composer',
        state: { keep: 'preserved' },
      })
    );
  });

  it('strips an invalid draft from route state without disturbing the route', async () => {
    renderWorkflowRoute({
      pathname: '/assistant',
      search: '?from=home',
      hash: '#composer',
      state: {
        keep: 'preserved',
        gcpDraft: { mode: 'invalid', nonce: 'draft-route-2', text: 'Private request' },
      },
    });

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('workflow-route-location').textContent)).toEqual({
        pathname: '/assistant',
        search: '?from=home',
        hash: '#composer',
        state: { keep: 'preserved' },
      })
    );
    expect(screen.getByRole('button', { name: 'No draft' })).toBeDisabled();
  });

  it('publishes the intentional retained surface and no deferred modules', () => {
    expect(gcpRoutePaths).toEqual(canonicalPaths);
    for (const path of unsupportedLocations) {
      expect(gcpRoutePaths).not.toContain(path);
    }
  });

  it('contains no unreviewed top-level or protected route patterns', () => {
    const topLevelPatterns = gcpRouter.routes
      .filter((route) => route.path !== undefined)
      .map((route) => route.path);
    const protectedGroup = gcpRouter.routes.find(
      (route) => route.path === undefined && route.element?.type === GcpClerkGate
    );

    expect(topLevelPatterns).toEqual(explicitTopLevelPatterns);
    expect(protectedGroup?.children?.map((route) => route.path)).toEqual(protectedPatterns);
    expect(protectedGroup?.children).not.toContainEqual(expect.objectContaining({ path: '*' }));
  });

  it('uses the simplified product page at root and retains the old landing alias', () => {
    expect(leaf('/').element.type).toBe(LandingPageSimple);

    const standartAlias = leaf('/standart');
    expect(standartAlias.element.type).toBe(Navigate);
    expect(standartAlias.element.props).toMatchObject({ to: '/', replace: true });
  });

  it('serves the desktop-first landing at a public preview path without replacing root', () => {
    const routeMatches = matches('/instant');
    expect(routeMatches).toHaveLength(1);
    expect(routeMatches[0].route.path).toBe('/instant');
    expect(routeMatches[0].route.element.type).not.toBe(GcpClerkGate);
    expect(gcpRoutePaths).not.toContain('/instant');
  });

  it.each(['/instant/how-it-works', '/instant/features', '/instant/speed'])(
    'serves the preview sub-page %s publicly through one parameterised route',
    (location) => {
      const routeMatches = matches(location);
      expect(routeMatches).toHaveLength(1);
      expect(routeMatches[0].route.path).toBe('/instant/:page');
      expect(routeMatches[0].route.element.type).not.toBe(GcpClerkGate);
    }
  );

  it.each(['/instant/solutions/healthcare', '/instant/solutions/manufacturing'])(
    'serves the preview solutions page %s publicly through one parameterised route',
    (location) => {
      const routeMatches = matches(location);
      expect(routeMatches).toHaveLength(1);
      expect(routeMatches[0].route.path).toBe('/instant/solutions/:slug');
      expect(routeMatches[0].route.element.type).not.toBe(GcpClerkGate);
      expect(gcpRoutePaths).not.toContain('/instant/solutions/:slug');
    }
  );

  it('keeps /organizations as a protected compatibility redirect to canonical Workspace', async () => {
    render(
      <MemoryRouter initialEntries={['/organizations?source=legacy#agents']}>
        <Routes>
          <Route path="/organizations" element={<WorkspaceRedirect />} />
          <Route path="/workspace" element={<RouteStateProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('workflow-route-location').textContent)).toMatchObject({
        pathname: '/workspace',
        search: '?source=legacy',
        hash: '#agents',
      })
    );
  });

  it.each(protectedLocations)('keeps %s behind the Clerk gate', (location) => {
    const routeMatches = matches(location);
    expect(routeMatches).toHaveLength(2);
    expect(routeMatches[0].route.path).toBeUndefined();
    expect(routeMatches[0].route.element.type).toBe(GcpClerkGate);
    expect(routeMatches.at(-1).route.path).not.toBe('*');
  });

  it.each(publicPreviewLocations)(
    'resolves scoped public route %s without the protected shell',
    (location) => {
      const routeMatches = matches(location);
      expect(routeMatches).toHaveLength(1);
      expect(routeMatches[0].route.path).not.toBe('*');
      expect(routeMatches[0].route.element.type).not.toBe(GcpClerkGate);
    }
  );

  it.each(unsupportedLocations)('fails closed for unsupported route %s', (location) => {
    const routeMatches = matches(location);
    expect(routeMatches).toHaveLength(1);
    expect(routeMatches[0].route.path).toBe('*');
  });
});
