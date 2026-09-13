/**
 * Classifies errors from HTTP fetch + response into the 9-class taxonomy used by
 * the phase card error surface.
 */

export function classifyFetchError(err) {
  const msg = String(err?.message || err || '');
  const code = err?.code || err?.cause?.code || '';
  if (err?.name === 'AbortError' || /aborted|abort signal/i.test(msg)) return 'timeout';
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH/i.test(code + ' ' + msg)) {
    return 'network_unreachable';
  }
  if (/CERT|TLS|SSL|ERR_TLS/i.test(code + ' ' + msg)) return 'tls_error';
  if (/ETIMEDOUT|timeout/i.test(code + ' ' + msg)) return 'timeout';
  return 'server_error';
}

export function classifyHttpResponse(status, body) {
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  if (typeof body === 'string' && /^\s*[{[]/.test(body) === false) return 'invalid_response';
  return null;
}
