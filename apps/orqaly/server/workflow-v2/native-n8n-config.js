import { z } from 'zod';
import { GoogleAuth } from 'google-auth-library';
import { createNativeN8nUpstream } from './native-editor-upstream.js';
import { createNativeN8nGateway } from './native-n8n-gateway.js';

const bindingSchema = z
  .object({
    environmentId: z.string().regex(/^[a-z0-9-]{8,63}$/),
    origin: z.url(),
    email: z.email(),
    password: z.string().min(8).max(128),
    useIdToken: z.boolean(),
  })
  .strict();

export function nativeN8nGatewayFromEnvironment({
  solutionService,
  revisionService,
  buildService,
  env = process.env,
}) {
  const values = [
    env.ORQALY_NATIVE_N8N_BINDINGS,
    env.ORQALY_NATIVE_N8N_SIGNING_KEY,
    env.ORQALY_NATIVE_N8N_GATEWAY_ORIGIN,
  ];
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) throw new Error('native_editor_partial_configuration');
  let configured;
  let executionBindings;
  try {
    configured = z.array(bindingSchema).min(1).max(100).parse(JSON.parse(values[0]));
    executionBindings = JSON.parse(env.ORQALY_SOLUTION_ENVIRONMENTS || '[]');
    if (!Array.isArray(executionBindings)) throw new Error('invalid_runtime_bindings');
  } catch {
    throw new Error('native_editor_invalid_binding_configuration');
  }
  if (new Set(configured.map((item) => item.origin)).size !== configured.length)
    throw new Error('native_editor_shared_environment_denied');
  for (const binding of configured) {
    const runtime = executionBindings.find((value) => value.id === binding.environmentId);
    if (!runtime || runtime.origin !== binding.origin || runtime.useIdToken !== binding.useIdToken)
      throw new Error('native_editor_runtime_binding_mismatch');
  }
  const allowLocalHttp = env.ORQALY_ENVIRONMENT === 'local';
  const auth = new GoogleAuth();
  return createNativeN8nGateway({
    solutionService,
    revisionService,
    buildService,
    origin: values[2],
    signingKey: values[1],
    allowLocalHttp,
    browserOrigins: (env.ORQALY_BROWSER_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    bindings: configured.map((binding) => ({
      environmentId: binding.environmentId,
      upstream: createNativeN8nUpstream({
        ...binding,
        allowLocalHttp,
        identityHeaders: binding.useIdToken
          ? async (origin) => (await auth.getIdTokenClient(origin)).getRequestHeaders(origin)
          : undefined,
      }),
    })),
  });
}
