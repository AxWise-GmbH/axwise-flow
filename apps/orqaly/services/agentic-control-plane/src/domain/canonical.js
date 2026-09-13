import crypto from 'node:crypto';
import canonicalizeValue from 'canonicalize';

export const CANONICALIZATION_ALGORITHM = 'rfc8785_v1';

export function canonicalJson(value) {
  const result = canonicalizeValue(value);
  if (typeof result !== 'string') {
    throw new TypeError('value_is_not_rfc8785_canonicalizable');
  }
  return result;
}

export function canonicalJsonSha256(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}
