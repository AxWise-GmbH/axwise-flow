import { z } from 'zod';
import { createGoogleIdTokenProvider } from './axwise-client.js';
import { DesktopWorkStartSchema } from './desktop-work-service.js';
import { AssistantTurnResponseSchema } from '../../shared/workflow-v2/contracts.js';

const Result = z
  .object({
    response: AssistantTurnResponseSchema,
    outcome: z.enum([
      'complete',
      'partial',
      'no_verified_matches',
      'provider_unavailable',
      'needs_clarification',
    ]),
    cacheHit: z.boolean().optional(),
  })
  .strict();

export function createDesktopInformationService({
  baseUrl,
  authHeaders = createGoogleIdTokenProvider(baseUrl),
  fetchImpl = fetch,
}) {
  return {
    async lookup(_auth, input, { signal } = {}) {
      const command = DesktopWorkStartSchema.parse(input);
      if (
        !['weather', 'currency', 'quick_info'].includes(command.capability?.kind) ||
        command.runId ||
        command.artifactIds ||
        command.question.length > 2000
      )
        throw Object.assign(new Error('INVALID_INFORMATION_REQUEST'), {
          status: 400,
          code: 'INVALID_INFORMATION_REQUEST',
        });
      const deadline = AbortSignal.timeout(20_000);
      const boundedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
      // Include IAM token refresh in the bounded wait, not only the HTTP request.
      let abort;
      const cancelled = new Promise((_resolve, reject) => {
        abort = () => reject(boundedSignal.reason);
        boundedSignal.addEventListener('abort', abort, { once: true });
      });
      try {
        return await Promise.race([
          cancelled,
          (async () => {
            boundedSignal.throwIfAborted();
            const credentials = await authHeaders();
            boundedSignal.throwIfAborted();
            const headers =
              typeof credentials?.entries === 'function'
                ? Object.fromEntries(credentials.entries())
                : credentials;
            const response = await fetchImpl(new URL('/v2/information', baseUrl), {
              method: 'POST',
              redirect: 'error',
              signal: boundedSignal,
              headers: { ...headers, 'content-type': 'application/json' },
              body: JSON.stringify({ question: command.question, capability: command.capability }),
            });
            if (!response.ok) throw new Error('Information provider unavailable');
            const text = await response.text();
            if (text.length > 512_000) throw new Error('Information result too large');
            const result = Result.parse(JSON.parse(text));
            const answer = result.response;
            return {
              version: 'orqaly.desktop-work.v1',
              conversationId: command.conversationId,
              requestId: command.requestId,
              kind: command.capability.kind,
              status: 'completed',
              markdown: answer.markdown,
              artifacts: [],
              sources: answer.sources.map((s) => ({
                title: s.title,
                url: s.canonicalUrl,
                sourceTypes: s.sourceTypes,
              })),
              facts: answer.facts,
              presentations: answer.presentations || [],
              outcome: result.outcome,
              cacheHit: result.cacheHit || false,
              transport: 'stateless_information',
            };
          })(),
        ]);
      } finally {
        boundedSignal.removeEventListener('abort', abort);
      }
    },
  };
}
