import { createHash } from 'node:crypto';

function assertUnicodeScalarString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError('canonical JSON rejects unpaired UTF-16 surrogates');
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('canonical JSON rejects unpaired UTF-16 surrogates');
    }
  }
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    if (!Number.isInteger(value)) throw new TypeError('canonical JSON accepts integer numbers only');
    if (!Number.isSafeInteger(value)) throw new TypeError('canonical JSON rejects unsafe integers');
    if (Object.is(value, -0)) throw new TypeError('canonical JSON rejects negative zero');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('canonical JSON accepts plain objects only');
    }
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    for (const [key] of entries) assertUnicodeScalarString(key);
    if (entries.some(([, item]) => item === undefined)) {
      throw new TypeError('canonical JSON rejects undefined object values');
    }
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new TypeError(`canonical JSON does not support ${typeof value}`);
}

export function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalHash(value) {
  return sha256Hex(canonicalJson(value));
}

export function artifactContentEnvelope({ contentType, payload, markdown }) {
  return {
    contentType,
    payload: payload ?? null,
    markdown: markdown ?? null,
  };
}

export function artifactContentHash(artifact) {
  return canonicalHash(artifactContentEnvelope(artifact));
}

export function assertArtifactContentHash(artifact) {
  const actual = artifactContentHash(artifact);
  if (actual !== artifact.artifactHash) {
    throw new Error(
      `artifact ${artifact.artifactId || '<unknown>'} content hash mismatch: expected ${artifact.artifactHash}, received ${actual}`
    );
  }
  return true;
}

export function verifySourceSpan(source, span) {
  const exact = source.slice(span.start, span.end);
  return exact === span.text && sha256Hex(exact) === span.sha256;
}

export function assertScopeSourceAuthority(request, scope) {
  const spans = [
    ...scope.objectiveSourceSpans,
    ...scope.topicAnchors.flatMap((anchor) => anchor.sourceSpans),
  ];
  if (!spans.length || spans.some((span) => !verifySourceSpan(request, span))) {
    throw new Error('scope contains a missing, shifted, or incorrectly hashed source span');
  }
  return true;
}
