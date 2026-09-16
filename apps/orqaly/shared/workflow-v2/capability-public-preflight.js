// Check the capability discriminator without reading accessors, before a legacy
// union can visit another branch. Plain legacy JSON keeps its historical byte,
// decimal and canonicalization behavior.
import { z } from 'zod';
import { validateCapabilityStructure } from './capability-source-contracts.js';

const types = new Set(['AdmitTranscriptCorpusV1', 'AnalyzeEvidenceV1', 'SimulateV1']);
function ownData(value, key) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError('Plain input object required');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !Object.hasOwn(descriptor, 'value'))
    throw new TypeError('Accessor discriminator forbidden');
  return descriptor?.value;
}

export function capabilityAwareSchema(schema, { envelope = false } = {}) {
  return z
    .unknown()
    .superRefine((value, ctx) => {
      try {
        const operationType = ownData(value, envelope ? 'operationType' : 'type');
        const input = envelope ? ownData(value, 'input') : value;
        const inputType = ownData(input, 'type');
        if (types.has(operationType) || types.has(inputType)) validateCapabilityStructure(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid capability input structure' });
      }
    })
    .pipe(schema);
}
