/**
 * Single source of truth for whether the AxWise integration is active and in
 * what enforcement mode. Every backend seam reads these accessors (directly or
 * via withAxwise) so the on/off decision lives in exactly one place.
 *
 * Env is the hard gate / kill switch:
 *   AXWISE_ENABLE  - 'true' calls out to AxWise; anything else / unset = no-op.
 *   AXWISE_ENFORCE - 'shadow' (log-only, default) | 'authoritative' (act on it).
 */
export function isAxwiseEnabled() {
  return process.env.AXWISE_ENABLE === 'true';
}

export function axwiseEnforcement() {
  return process.env.AXWISE_ENFORCE || 'shadow';
}
