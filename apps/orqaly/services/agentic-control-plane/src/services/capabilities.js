import { z } from 'zod';

const CapabilitySetSchema = z
  .object({
    executors: z.array(z.string().min(1)).default([]),
    descriptors: z.array(z.string().min(1)).default([]),
    connections: z.array(z.string().min(1)).default([]),
  })
  .strict();

export function parseCapabilities(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const parsed = CapabilitySetSchema.parse(value);
  return Object.freeze({
    executors: Object.freeze([...new Set(parsed.executors)].sort()),
    descriptors: Object.freeze([...new Set(parsed.descriptors)].sort()),
    connections: Object.freeze([...new Set(parsed.connections)].sort()),
  });
}
