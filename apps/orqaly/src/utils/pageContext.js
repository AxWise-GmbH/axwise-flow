/**
 * Compute the copilot pageContext { route, entityType, entityId } from the
 * current react-router location, so the assistant knows what "this" refers to
 * without the user repeating it.
 *
 * This is the reverse of MainLayout's handleOpenEntity ROUTES map.
 */

// pathname prefix -> entityType (order matters; longest/most-specific first)
const PATH_ENTITY = [
  ['/goals/', 'goal'],
  ['/dashboards/', 'dashboard'],
];

// pathname (exact) -> entityType read from a query id param
const QUERY_ROUTES = {
  '/task-manager': { type: 'task', param: 'taskId' },
  '/workflow': { type: 'workflow', param: 'id' },
  '/reports': { type: 'report', param: 'id' },
  '/projects': { type: 'project', param: 'id' },
  '/knowledge-base': { type: 'kb-doc', param: 'id' },
  '/organizations': { type: 'organization', param: 'id' },
  '/agent-hub': { type: 'agent', param: 'agentId' },
  '/pulses': { type: 'pulse', param: 'id' },
  '/consilium': { type: 'consilium', param: 'boardId' },
};

/**
 * @param {{ pathname?: string, search?: string }} location react-router location
 * @returns {{ route: string, entityType: string, entityId: string }}
 */
export function computePageContext(location) {
  const pathname = location?.pathname || '';
  const search = location?.search || '';
  const route = `${pathname}${search}`;
  let entityType = '';
  let entityId = '';

  // Path-segment entities (e.g. /goals/:id)
  for (const [prefix, type] of PATH_ENTITY) {
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length).split('/')[0];
      if (rest) {
        entityType = type;
        entityId = rest;
      }
      break;
    }
  }

  // Query-param entities (e.g. /workflow?id=:id)
  if (!entityType) {
    const q = QUERY_ROUTES[pathname];
    if (q) {
      let params;
      try {
        params = new URLSearchParams(search);
      } catch {
        params = null;
      }
      const id = params?.get(q.param);
      if (id) {
        entityType = q.type;
        entityId = id;
      }
    }
  }

  return { route, entityType, entityId };
}

export default computePageContext;
