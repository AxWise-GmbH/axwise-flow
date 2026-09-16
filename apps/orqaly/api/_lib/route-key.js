/**
 * Remove the `path` router key from `req.query` before a dispatcher delegates to
 * a handler.
 *
 * Every serverless dispatcher (`/api/app`, `/api/ops`, `/api/agent`,
 * `/api/concilium`, `/api/communicator`) routes on `?path=<handler-name>`. That
 * makes `path` a reserved routing key — it is never a caller-supplied domain
 * value. A handler that also treated `path` as one of its own query params would
 * silently receive the handler name instead (this is exactly what filtered every
 * result out of `github-agents-import`: `?path=github-agents-import` was read as a
 * repo sub-folder filter). Stripping it here removes the whole collision class.
 *
 * Express 5 exposes `req.query` through a getter, so we replace it with a plain
 * object via `Object.defineProperty` (the same getter-safe pattern used in
 * `scripts/local-api-server.js`). On Vercel `req.query` is already a plain object,
 * where this works too.
 */
export function stripRouteKey(req) {
  if (!req || !req.query || typeof req.query !== 'object') return;
  if (!('path' in req.query)) return;
  const { path: _routeKey, ...rest } = req.query;
  Object.defineProperty(req, 'query', {
    value: rest,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}
