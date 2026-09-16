import process from 'node:process';
import { z } from 'zod';

const Hash = z.string().regex(/^[a-f0-9]{64}$/);

const ConfigSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    DATABASE_URL: z.string().min(1),
    TOOL_GATEWAY_AUTH_MODE: z.enum(['local_token', 'cloud_run_iam']),
    TOOL_GATEWAY_LOCAL_BEARER_TOKEN: z.string().min(32).optional(),
    TOOL_GATEWAY_AUDIENCE: z.string().url(),
    EXPECTED_N8N_SERVICE_ACCOUNT: z.string().email().optional(),
    TOOL_GATEWAY_ATTESTATION_PRIVATE_KEY: z.string().min(64),
    TOOL_GATEWAY_ATTESTATION_KEY_ID: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
    OPERATIONAL_RECORD_DESCRIPTOR_HASH: Hash,
    N8N_EXECUTOR_BINDING_HASH: Hash,
    TOOL_GATEWAY_CONNECTION_REFERENCE: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/),
    K_SERVICE: z.string().optional(),
  })
  .passthrough()
  .superRefine((config, context) => {
    if (config.TOOL_GATEWAY_AUTH_MODE === 'local_token') {
      if (!config.TOOL_GATEWAY_LOCAL_BEARER_TOKEN) {
        context.addIssue({
          code: 'custom',
          path: ['TOOL_GATEWAY_LOCAL_BEARER_TOKEN'],
          message: 'local token required',
        });
      }
    } else {
      if (!config.K_SERVICE || !config.EXPECTED_N8N_SERVICE_ACCOUNT) {
        context.addIssue({
          code: 'custom',
          message: 'Cloud Run IAM mode requires K_SERVICE and exact n8n service account',
        });
      }
      if (config.TOOL_GATEWAY_LOCAL_BEARER_TOKEN) {
        context.addIssue({
          code: 'custom',
          path: ['TOOL_GATEWAY_LOCAL_BEARER_TOKEN'],
          message: 'local bearer token forbidden in Cloud Run IAM mode',
        });
      }
    }
  });

export function loadConfig(environment = process.env) {
  return Object.freeze(ConfigSchema.parse(environment));
}
