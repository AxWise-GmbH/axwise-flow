/** Consistent error responses and logging */

const LOG_PREFIX = '[orchestratori-api]';

export function logError(context, err) {
  const msg = err?.message || String(err);
  const code = err?.status ?? err?.code ?? err?.statusCode;
  console.error(`${LOG_PREFIX} ${context}`, { error: msg, code });
}

export function jsonError(res, status, message, detail) {
  const payload = { error: message };
  if (detail) payload.detail = detail;
  return res.status(status).json(payload);
}

export function handleApiError(res, err, context = 'api') {
  logError(context, err);
  const code = err?.status ?? err?.code ?? err?.statusCode;
  if (code === 401) return jsonError(res, 401, 'Invalid API key');
  if (code === 429) return jsonError(res, 429, 'Rate limit exceeded. Try again shortly.');
  // Surface the underlying error message in `detail` so the frontend can
  // display a useful diagnostic. The top-level `error` stays generic so
  // generic clients/dashboards still see "Internal server error".
  // Truncated to 300 chars and stripped of stack traces (we never include
  // err.stack here) so we don't leak internal state.
  const safeMessage = String(err?.message || err || 'unknown')
    .split('\n')[0]
    .slice(0, 300);
  return jsonError(res, 500, 'Internal server error', `${context}: ${safeMessage}`);
}
