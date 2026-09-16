import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  nativeBundleHash,
  nativeBundleMembers,
  normalizeNativeBundle,
} from './native-workflow-bundle.js';
import { hasNativeOutbound } from './native-outbound-policy.js';
import { isBoundedNativeJson } from '../../shared/workflow-v2/native-workflow-contracts.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const NATIVE_FAILURE_PROBE_KIND = 'handler_with_synthetic_failure';

/** Explicit test artifact, never a replacement for a customer's live workflow.
 * Only the main graph is substituted. The actual owned child business nodes,
 * edges and contract are unchanged; any child credentials/outbound are denied.
 */
export function createNativeFailureProbeArtifact(command) {
  const { workflow, spec } = command;
  if (
    !isBoundedNativeJson({ workflow, spec }, { maxBytes: 192000, maxDepth: 28 }) ||
    containsSolutionBuildSecret({ workflow, spec })
  )
    throw new Error('native_probe_source_invalid');
  z.uuid().parse(command.probeId);
  z.uuid().parse(command.invocationId);
  z.number().int().nonnegative().parse(command.sourceVersion);
  if (command.allowExternalEffects !== false)
    throw new Error('native_probe_external_effects_denied');
  if (
    digest.parse(command.workflowHash) !== hash(workflow) ||
    digest.parse(command.bundleHash) !== nativeBundleHash({ workflow, spec })
  )
    throw new Error('native_probe_source_changed');
  const members = nativeBundleMembers({ workflow, spec });
  const child = members[1];
  if (
    members.length !== 2 ||
    !child ||
    child.spec.connections.length ||
    hasNativeOutbound(child.workflow) ||
    child.workflow.nodes.some((node) => Object.keys(node.credentials ?? {}).length)
  )
    throw new Error('native_probe_child_requires_external_approval');
  const derived = normalizeNativeBundle({
    id: command.probeId,
    controlledTest: true,
    workflow: {
      name: 'Orqaly explicit synthetic failure probe',
      nodes: [
        {
          id: 'probe-request',
          name: 'Synthetic probe request',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 2.1,
          position: [0, 0],
          parameters: {
            httpMethod: 'POST',
            path: 'probe',
            responseMode: 'responseNode',
            options: {},
          },
        },
        // Fixed empty input makes this pure expression fail inside actual n8n.
        // The reachable response preserves the normal reviewed request profile;
        // it is never used as a fabricated failure/handler acknowledgement.
        {
          id: 'probe-failure',
          name: 'Force synthetic failure',
          type: 'n8n-nodes-base.set',
          typeVersion: 3.4,
          position: [240, 0],
          parameters: {
            mode: 'raw',
            jsonOutput: '={{ { "probe": $json.body.orqalySyntheticMissing.trim() } }}',
            options: {},
          },
        },
        {
          id: 'probe-response',
          name: 'Unexpected probe completion',
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1.4,
          position: [480, 0],
          parameters: {
            respondWith: 'json',
            responseBody: '={{ { "unexpected": true } }}',
            options: {},
          },
        },
      ],
      connections: {
        'Synthetic probe request': {
          main: [[{ node: 'Force synthetic failure', type: 'main', index: 0 }]],
        },
        'Force synthetic failure': {
          main: [[{ node: 'Unexpected probe completion', type: 'main', index: 0 }]],
        },
      },
      settings: { errorWorkflow: workflow.settings.errorWorkflow },
    },
    spec: {
      kind: 'n8n_workflow_v2',
      runtimeProfile: 'request_automation',
      requirements: [
        {
          id: 'synthetic-failure',
          description:
            'Deliberately fail only the disposable main so the actual owned handler receives a native error event.',
        },
      ],
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'object' },
      acceptanceCases: [
        {
          id: 'synthetic-failure',
          description:
            'The response must not be reached; the probe evaluator requires real main failure and linked handler success.',
          requirementIds: ['synthetic-failure'],
          input: {},
          expectedOutput: { unexpected: true },
          assertions: [],
        },
      ],
      connections: [],
      ownedDependencies: structuredClone(spec.ownedDependencies),
    },
  });
  const testedChild = nativeBundleMembers(derived)[1];
  if (
    hash(testedChild.workflow.nodes) !== hash(child.workflow.nodes) ||
    hash(testedChild.workflow.connections) !== hash(child.workflow.connections) ||
    hash(testedChild.spec) !== hash(child.spec)
  )
    throw new Error('native_probe_child_changed');
  return {
    ...derived,
    source: {
      sourceVersion: command.sourceVersion,
      sourceWorkflowHash: command.workflowHash,
      sourceBundleHash: command.bundleHash,
      dependencyId: child.dependencyId,
      sourceChildWorkflowHash: hash(child.workflow),
      sourceChildSpecHash: hash(child.spec),
    },
  };
}
