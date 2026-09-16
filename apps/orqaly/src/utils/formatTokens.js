/** Format token counts for display (e.g. 12400 → "12.4k"). Returns null for zero/missing. */
export function formatTokens(value) {
  const v = Number(value);
  if (!v || v <= 0) return null;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

/** Always returns a display string — "0" for zero/missing (never em dash). */
export function formatTokensOrZero(value) {
  const formatted = formatTokens(value);
  if (formatted) return formatted;
  return '0';
}

/** Format tokens + LLM cost pair when both or either exist. */
export function formatTokenSpend(tokens, costUsd) {
  const tokenStr = formatTokensOrZero(tokens);
  const cost = Number(costUsd);
  const costStr = cost > 0 ? `$${cost.toFixed(4)}` : null;
  if (costStr) return `${tokenStr} · ${costStr}`;
  return `${tokenStr} tokens`;
}
