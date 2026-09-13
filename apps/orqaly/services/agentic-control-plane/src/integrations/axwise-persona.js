import { z } from 'zod';
import { canonicalJsonSha256 } from '../domain/canonical.js';
import { PersonaManifestSchema } from '../domain/contracts.js';

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ReferenceSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/);
const JsonObjectSchema = z.record(z.string(), z.unknown());

const AxwiseExecutorProfileSchema = z
  .object({
    profile_type: z.literal('synthetic_professional_profile'),
    profile_version: z.literal('axwise_executor_persona_v1'),
    identity_disclosure: z.string().trim().min(1).max(1_000),
    role: z.string().trim().min(1).max(300),
    mission: z.string().trim().min(1).max(4_000),
    expertise: z.array(z.string().trim().min(1).max(300)).max(64),
    domain_knowledge: z.array(z.string().trim().min(1).max(300)).max(64),
    capabilities: z.array(z.string().trim().min(1).max(300)).max(100),
    methods: z.array(z.string().trim().min(1).max(500)).max(64),
    work_style: JsonObjectSchema,
    communication_style: z.string().trim().min(1).max(1_000),
    decision_lens: z.string().trim().max(4_000),
    output_contract: JsonObjectSchema,
    risks: z.array(z.string().trim().min(1).max(500)).max(64),
    boundaries: z.array(z.string().trim().min(1).max(500)).max(64),
    task_fit: JsonObjectSchema,
    provenance: JsonObjectSchema,
  })
  .passthrough();

export const AxwiseExecutorPersonaRowSchema = z
  .object({
    persona_id: ReferenceSchema,
    persona_kind: z.string().trim().min(1).max(100),
    required_role: z.string().trim().min(1).max(300),
    role_derivation: z.unknown(),
    content_hash: HashSchema,
    persona: AxwiseExecutorProfileSchema,
    evidence_refs: z.array(ReferenceSchema).max(100),
    role_slot: z.unknown().optional(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.persona.role !== row.required_role) {
      context.addIssue({
        code: 'custom',
        path: ['required_role'],
        message: 'required role must match the executor persona role',
      });
    }
    if (canonicalJsonSha256(row.persona) !== row.content_hash) {
      context.addIssue({
        code: 'custom',
        path: ['content_hash'],
        message: 'AxWise persona hash does not match its complete source manifest',
      });
    }
  });

function displayName(role) {
  const words = role.replaceAll(/[_-]+/g, ' ').trim();
  return `${words.replace(/\b\w/g, (letter) => letter.toUpperCase())} Agent (AI)`;
}

export function materializeAxwiseExecutorPersona(value) {
  const source = AxwiseExecutorPersonaRowSchema.parse(value);
  const profile = source.persona;
  return PersonaManifestSchema.parse({
    version: profile.profile_version,
    personaId: source.persona_id,
    contentHash: source.content_hash,
    displayName: displayName(profile.role),
    identityDisclosure: profile.identity_disclosure,
    role: profile.role,
    mission: profile.mission,
    expertise: profile.expertise,
    domainKnowledge: profile.domain_knowledge,
    capabilities: profile.capabilities,
    methods: profile.methods,
    workStyle: profile.work_style,
    communicationStyle: profile.communication_style,
    decisionLens: profile.decision_lens,
    outputContract: profile.output_contract,
    risks: profile.risks,
    boundaries: profile.boundaries,
    taskFit: profile.task_fit,
    provenance: profile.provenance,
    sourceManifest: profile,
    sourceMetadata: {
      personaKind: source.persona_kind,
      requiredRole: source.required_role,
      roleDerivation: source.role_derivation,
      evidenceReferences: source.evidence_refs,
      ...(source.role_slot === undefined ? {} : { roleSlot: source.role_slot }),
    },
  });
}
