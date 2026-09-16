import { z } from 'zod';
import {
  ApprovalKindSchema,
  ArtifactRefSchema,
  ChatModeSchema,
  UuidSchema,
} from './contracts.js';

export const StartWorkflowCommandSchema = z
  .object({
    commandId: UuidSchema,
    issuedAt: z.string().datetime(),
    mode: ChatModeSchema,
    request: z.string().trim().min(1).max(24_000),
  })
  .strict();

export const ApproveArtifactCommandSchema = z
  .object({
    type: z.literal('approve_artifact'),
    commandId: UuidSchema,
    issuedAt: z.string().datetime(),
    approvalKind: ApprovalKindSchema,
    artifact: ArtifactRefSchema,
    selectedEvidence: z.array(ArtifactRefSchema).max(200).default([]),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export const ReviseScopeCommandSchema = z
  .object({
    type: z.literal('revise_scope'),
    commandId: UuidSchema,
    issuedAt: z.string().datetime(),
    acceptedScope: ArtifactRefSchema,
    correction: z.string().trim().min(1).max(6000),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export const WorkflowCommandSchema = z.discriminatedUnion('type', [
  ApproveArtifactCommandSchema,
  ReviseScopeCommandSchema,
]);
