import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import boundedTransport from '../../infra/n8n/nodes-orqaly-bounded-http/transport.cjs';

const directory = join(dirname(fileURLToPath(import.meta.url)), '../../infra/n8n/nodes-orqaly-bounded-http');
const files = ['package.json', 'description.json', 'transport.cjs', 'nodes/BoundedHttp.node.js', 'credentials/OrqalyBoundedHttp.credentials.js'];
export const BOUNDED_HTTP_PACKAGE_HASH = createHash('sha256').update(JSON.stringify(files.map((file) => [file, readFileSync(join(directory, file), 'utf8')]))).digest('hex');
export const BOUNDED_HTTP_NODE = Object.freeze({ type: 'CUSTOM.boundedHttp', typeVersion: 1 });
export const BOUNDED_HTTP_DEFINITION = JSON.parse(readFileSync(join(directory, 'description.json'), 'utf8'));
export const hasNativeOutbound = (workflow) => workflow?.nodes?.some((node) => node.type === BOUNDED_HTTP_NODE.type) ?? false;
export const isBoundedHttpPolicy = (policy) => policy?.egress === 'bounded-https-post-v1' && policy?.credentials === 'bound' &&
  policy.outboundTransportVersion === 1 && policy.outboundPackageHash === BOUNDED_HTTP_PACKAGE_HASH && /^sha256:[a-f0-9]{64}$/.test(policy.imageDigest ?? '');

export function validateBoundedNodeParameters(node) {
  if (node.type !== BOUNDED_HTTP_NODE.type || node.typeVersion !== 1 || !node.parameters ||
    Object.keys(node.parameters).some((key) => !['url', 'method', 'body'].includes(key)) ||
    node.parameters.method !== 'POST' || typeof node.parameters.body !== 'string' || !node.parameters.body ||
    node.retryOnFail || node.continueOnFail || node.executeOnce || node.alwaysOutputData ||
    (node.onError && node.onError !== 'stopWorkflow')) throw new Error('bounded_outbound_node_policy_denied');
  boundedTransport.destination(node.parameters.url);
}
