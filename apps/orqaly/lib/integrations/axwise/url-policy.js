function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets.every((part) => part === 0)
  );
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    isPrivateIpv4(normalized)
  );
}

export function isProductionLikeRuntime(env = process.env) {
  return Boolean(
    env.VERCEL ||
    env.VERCEL_ENV === 'production' ||
    env.VERCEL_ENV === 'preview' ||
    env.NODE_ENV === 'production'
  );
}

/**
 * Fail closed when a deployed Orqaly runtime points AxWise at loopback, a
 * private network, or plaintext HTTP. Local development remains able to use a
 * localhost AxWise process intentionally.
 */
export function normalizeAxwiseApiUrl(value, { env = process.env } = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error('AXWISE_API_URL is invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('AXWISE_API_URL must use HTTP or HTTPS');
  }

  if (isProductionLikeRuntime(env)) {
    if (parsed.protocol !== 'https:') {
      throw new Error('AXWISE_API_URL must use HTTPS outside local development');
    }
    if (isLocalHostname(parsed.hostname)) {
      throw new Error(
        'AXWISE_API_URL must not target loopback or a private network outside local development'
      );
    }
  }

  return parsed.toString().replace(/\/+$/, '');
}
