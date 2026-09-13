import crypto from 'node:crypto';
import canonicalize from 'canonicalize';

export function canonicalJson(value) {
  const result = canonicalize(value);
  if (typeof result !== 'string') throw new Error('canonical_json_failed');
  return result;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function canonicalJsonSha256(value) {
  return sha256(canonicalJson(value));
}
