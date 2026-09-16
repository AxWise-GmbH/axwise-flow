// Server-only, canonical-wire mirrors of AxWise's frozen corpus primitives.
// Hashes establish identity, never access, human authenticity or anonymization.
import { z } from 'zod';
import { canonicalHash, canonicalJson, sha256Hex } from '../../lib/workflow-v2/canonical.js';

// Python str.strip includes these exact control whitespace characters.
/* eslint-disable no-control-regex -- Exact Python whitespace semantics are intentional. */
const PYTHON_WHITESPACE =
  /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu;
/* eslint-enable no-control-regex */
export const capabilityTrim = (value) => value.replace(PYTHON_WHITESPACE, '');
export function assertUnique(values, message = 'Capability identities must be unique') {
  if (new Set(values).size !== values.length) throw new TypeError(message);
}
export function refineCapability(schema, validate, message = 'Invalid bounded capability value') {
  return schema.superRefine((value, ctx) => {
    try {
      validate(value);
    } catch {
      ctx.addIssue({ code: 'custom', message });
    }
  });
}
export function capabilityUtf8(value) {
  if (typeof value !== 'string') throw new TypeError('Capability text must be a string');
  // Canonical-v1 rejects unpaired UTF-16 surrogates before TextEncoder can
  // silently substitute replacement characters and change source identity.
  canonicalJson(value);
  return new TextEncoder().encode(value);
}
export function capabilityText(min, max, { nonblank = true, identifier = false } = {}) {
  return refineCapability(z.string(), (value) => {
    if (value.length > max * 2) throw new TypeError('Text exceeds its character bound');
    const size = Array.from(value).length;
    if (size < min || size > max) throw new TypeError('Text exceeds its character bound');
    capabilityUtf8(value);
    const trimmed = capabilityTrim(value);
    const hasControl =
      identifier &&
      Array.from(value).some(
        (character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127
      );
    if ((nonblank && !trimmed) || (identifier && (!trimmed || trimmed !== value || hasControl))) {
      throw new TypeError('Invalid source identifier or blank text');
    }
  });
}
export const CapabilityIdSchema = capabilityText(1, 120, { identifier: true });
export const CapabilitySha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const CapabilityUuidSchema = z
  .string()
  .regex(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i)
  .transform((value) => value.toLowerCase());
export const capabilityInteger = (min, max) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .refine((value) => !Object.is(value, -0));
const Offset = capabilityInteger(0, 128_000);
const Origin = z.enum(['supplied_transcript', 'supplied_document', 'synthetic_transcript']);
const Role = z.enum(['participant', 'interviewer', 'author', 'unknown']);
const SourceText = capabilityText(1, 128_000, { nonblank: false });

export function validateCapabilityStructure(value, { maxBytes = 1_000_000 } = {}) {
  let nodes = 40_000,
    bytes = maxBytes;
  const parents = new Set();
  function visit(item, depth) {
    if (--nodes < 0 || depth > 64) throw new TypeError('Capability structure exceeds its bound');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item) || Object.is(item, -0))
        throw new TypeError('Capability integer must be canonical');
      return;
    }
    if (typeof item === 'string') {
      bytes -= capabilityUtf8(item).length;
      if (bytes < 0) throw new TypeError('Capability text exceeds its byte bound');
      return;
    }
    if (!item || typeof item !== 'object' || parents.has(item))
      throw new TypeError('Capability structure must be acyclic JSON');
    const array = Array.isArray(item);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
      throw new TypeError('Capability objects must be plain');
    parents.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Object.getOwnPropertySymbols(item).length)
        throw new TypeError('Capability objects cannot have symbol keys');
      const keys = Object.keys(descriptors).filter((key) => !array || key !== 'length');
      if (keys.length > nodes || (array && keys.length !== item.length))
        throw new TypeError('Capability collection exceeds its bound or is sparse');
      if (array && keys.some((key, index) => key !== String(index)))
        throw new TypeError('Capability array must have exact indexed values');
      for (const key of keys) {
        const field = descriptors[key];
        if (!field.enumerable || !Object.hasOwn(field, 'value'))
          throw new TypeError('Capability accessors are forbidden');
        if (!array) visit(key, depth + 1);
        visit(field.value, depth + 1);
      }
    } finally {
      parents.delete(item);
    }
  }
  visit(value, 0);
}
export function boundedCapabilitySchema(schema) {
  return z
    .unknown()
    .superRefine((value, ctx) => {
      try {
        validateCapabilityStructure(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid bounded capability structure' });
      }
    })
    .pipe(schema);
}
export function exactUtf8Span(text, start, end) {
  const bytes = capabilityUtf8(text);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !(0 <= start && start < end && end <= bytes.length)
  )
    throw new TypeError('Invalid UTF-8 source span');
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  decoder.decode(bytes.subarray(0, start));
  return decoder.decode(bytes.subarray(start, end));
}

export const CorpusArtifactRefV1Schema = z
  .object({
    artifactId: CapabilityUuidSchema,
    artifactHash: CapabilitySha256Schema,
    kind: CapabilityIdSchema,
  })
  .strict();
export const TranscriptParticipantV1Schema = z
  .object({
    participantId: CapabilityIdSchema,
    displayName: capabilityText(1, 500).nullable(),
    role: Role,
    stakeholderId: CapabilityIdSchema.nullable(),
  })
  .strict();
export const TranscriptTurnV1Schema = refineCapability(
  z
    .object({
      turnId: CapabilityIdSchema,
      participantId: CapabilityIdSchema,
      questionId: CapabilityIdSchema.nullable(),
      start: Offset,
      end: Offset,
      offsetUnit: z.literal('utf8_bytes'),
    })
    .strict(),
  (value) => {
    if (value.end <= value.start) throw new TypeError('Turn span is unordered');
  }
);
export const TranscriptDocumentV1Schema = refineCapability(
  z
    .object({
      documentId: CapabilityUuidSchema,
      title: capabilityText(1, 500),
      text: SourceText,
      textSha256: CapabilitySha256Schema,
      origin: Origin,
      originArtifactRefs: z.array(CorpusArtifactRefV1Schema).max(16),
      participants: z.array(TranscriptParticipantV1Schema).max(32),
      turns: z.array(TranscriptTurnV1Schema).max(256),
    })
    .strict(),
  (value) => {
    if (capabilityUtf8(value.text).length > 128_000 || sha256Hex(value.text) !== value.textSha256)
      throw new TypeError('Frozen source text identity mismatch');
    assertUnique(value.originArtifactRefs.map((ref) => ref.artifactId));
    if (
      value.originArtifactRefs.some((ref) => ref.kind === 'simulation') &&
      value.origin !== 'synthetic_transcript'
    )
      throw new TypeError('Synthetic origin cannot be upgraded');
    const speakers = new Set(value.participants.map((person) => person.participantId));
    if (speakers.size !== value.participants.length)
      throw new TypeError('Duplicate document speakers');
    assertUnique(value.turns.map((turn) => turn.turnId));
    if (value.origin !== 'supplied_document' && (!value.participants.length || !value.turns.length))
      throw new TypeError('Transcript requires speakers and turns');
    let previousEnd = 0;
    for (const turn of value.turns) {
      if (!speakers.has(turn.participantId) || turn.start < previousEnd)
        throw new TypeError('Turn speaker or ordering mismatch');
      exactUtf8Span(value.text, turn.start, turn.end);
      if (value.origin === 'synthetic_transcript' && turn.questionId === null)
        throw new TypeError('Synthetic turns require question identity');
      previousEnd = turn.end;
    }
  }
);
export const TranscriptCorpusV1Schema = boundedCapabilitySchema(
  refineCapability(
    z
      .object({
        schemaVersion: z.literal('axwise.transcript-corpus.v1'),
        documents: z.array(TranscriptDocumentV1Schema).min(1).max(16),
      })
      .strict(),
    (value) => {
      assertUnique(value.documents.map((document) => document.documentId));
      if (
        value.documents.reduce((sum, doc) => sum + doc.participants.length, 0) > 32 ||
        value.documents.reduce((sum, doc) => sum + doc.turns.length, 0) > 256 ||
        value.documents.reduce((sum, doc) => sum + capabilityUtf8(doc.text).length, 0) > 128_000
      )
        throw new TypeError('Corpus aggregate bound exceeded');
    }
  )
);

export const SourceQuoteV1Schema = refineCapability(
  z
    .object({
      quoteId: CapabilitySha256Schema,
      documentId: CapabilityUuidSchema,
      turnId: CapabilityIdSchema.nullable(),
      participantId: CapabilityIdSchema.nullable(),
      speakerRole: Role.nullable(),
      origin: Origin,
      sourceTextSha256: CapabilitySha256Schema,
      start: Offset,
      end: Offset,
      offsetUnit: z.literal('utf8_bytes'),
      text: SourceText,
      textSha256: CapabilitySha256Schema,
    })
    .strict(),
  (value) => {
    const bound = value.turnId !== null;
    if (
      bound !== (value.participantId !== null) ||
      bound !== (value.speakerRole !== null) ||
      (!bound && value.origin !== 'supplied_document')
    )
      throw new TypeError('Quote speaker binding mismatch');
    if (
      value.end - value.start !== capabilityUtf8(value.text).length ||
      !capabilityTrim(value.text) ||
      sha256Hex(value.text) !== value.textSha256
    )
      throw new TypeError('Quote byte identity mismatch');
    const { quoteId, ...content } = value;
    if (quoteId !== canonicalHash(content)) throw new TypeError('Quote semantic identity mismatch');
  }
);

export function transcriptCorpusHash(corpus) {
  return canonicalHash(TranscriptCorpusV1Schema.parse(corpus));
}
export function validateTranscriptCorpus(corpus, { trustedOrigins } = {}) {
  const value = TranscriptCorpusV1Schema.parse(corpus);
  if (trustedOrigins !== undefined) {
    if (
      !trustedOrigins ||
      typeof trustedOrigins !== 'object' ||
      Array.isArray(trustedOrigins) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(trustedOrigins))
    )
      throw new TypeError('Trusted origins require a plain mapping');
    validateCapabilityStructure(trustedOrigins);
    const documents = new Map(value.documents.map((doc) => [doc.documentId, doc]));
    const seen = new Set();
    for (const [key, origin] of Object.entries(trustedOrigins)) {
      const identity = CapabilityUuidSchema.parse(key);
      if (
        seen.has(identity) ||
        !documents.has(identity) ||
        documents.get(identity).origin !== Origin.parse(origin)
      )
        throw new TypeError('Trusted origin binding mismatch');
      seen.add(identity);
    }
  }
  return value;
}
export function extractSourceQuote(
  corpus,
  { documentId, turnId, participantId, start, end, candidateText, requireParticipant = true }
) {
  const source = TranscriptCorpusV1Schema.parse(corpus);
  const identity = CapabilityUuidSchema.parse(documentId);
  const document = source.documents.find((item) => item.documentId === identity);
  if (!document || typeof requireParticipant !== 'boolean')
    throw new TypeError('Quote source or policy is invalid');
  let role = null;
  if (turnId === null) {
    if (participantId !== null || document.origin !== 'supplied_document')
      throw new TypeError('Only supplied documents allow unbound quotes');
  } else {
    const turn = document.turns.find((item) => item.turnId === turnId);
    if (
      !turn ||
      turn.participantId !== participantId ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      !(turn.start <= start && start < end && end <= turn.end)
    )
      throw new TypeError('Quote must bind its exact speaker turn');
    role = document.participants.find((item) => item.participantId === participantId).role;
  }
  if (requireParticipant && (role !== 'participant' || document.origin === 'supplied_document'))
    throw new TypeError('Participant evidence requires participant speech');
  const text = exactUtf8Span(document.text, start, end);
  if (candidateText !== undefined && candidateText !== null && candidateText !== text)
    throw new TypeError('Candidate quote differs from exact source span');
  const content = {
    documentId: identity,
    turnId,
    participantId,
    speakerRole: role,
    origin: document.origin,
    sourceTextSha256: document.textSha256,
    start,
    end,
    offsetUnit: 'utf8_bytes',
    text,
    textSha256: sha256Hex(text),
  };
  return SourceQuoteV1Schema.parse({ quoteId: canonicalHash(content), ...content });
}
export function validateSourceQuote(corpus, quote, { requireParticipant = true } = {}) {
  const value = SourceQuoteV1Schema.parse(quote);
  const expected = extractSourceQuote(corpus, {
    ...value,
    candidateText: value.text,
    requireParticipant,
  });
  if (canonicalJson(value) !== canonicalJson(expected))
    throw new TypeError('Quote provenance differs from the frozen corpus');
  return expected;
}
