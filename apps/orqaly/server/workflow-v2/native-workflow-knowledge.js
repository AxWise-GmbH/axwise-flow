import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import canonicalize from 'canonicalize';
import {
  NativeWorkflowKnowledgeSchema,
  NATIVE_WORKFLOW_VERSION,
} from '../../shared/workflow-v2/native-workflow-contracts.js';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const catalog = JSON.parse(
  readFileSync(join(fixtureDirectory, 'native-node-catalog-2.37.10.json'), 'utf8')
);
const skillRegistry = JSON.parse(
  readFileSync(join(fixtureDirectory, 'native-skills-180b8415.json'), 'utf8')
);
export const nativeWorkflowHash = (value) =>
  createHash('sha256').update(canonicalize(value)).digest('hex');
const textHash = (text) => createHash('sha256').update(text).digest('hex');
if (
  catalog.n8nVersion !== '2.37.10' ||
  textHash(JSON.stringify(catalog.nodes)) !== catalog.dataHash
)
  throw new Error('Pinned native node catalog integrity failure');
if (
  skillRegistry.commit !== '180b8415e3b73f78828cfa01e908e67f89f2a139' ||
  skillRegistry.skills.some(
    (s) => textHash(s.source) !== s.sourceHash || textHash(s.content) !== s.contentHash
  )
)
  throw new Error('Pinned native skills integrity failure');

export const NATIVE_WORKFLOW_CATALOG_PIN = Object.freeze({
  version: NATIVE_WORKFLOW_VERSION,
  n8nVersion: catalog.n8nVersion,
  imageDigest: catalog.imageDigest,
  catalogHash: nativeWorkflowHash(catalog.nodes),
  skillsCommit: skillRegistry.commit,
});
const nodeMap = new Map(
  catalog.nodes.map((entry) => [`${entry.type}@${entry.typeVersion}`, entry])
);
// First-party reviewed extension, separate from the immutable stock catalog.
// Its exact metadata participates in every selected knowledge hash; runtime
// execution also binds the complete package hash and operator image digest.
const boundedHttpDescription = JSON.parse(
  readFileSync(
    join(fixtureDirectory, '../../../infra/n8n/nodes-orqaly-bounded-http/description.json'),
    'utf8'
  )
);
const customDefinitions = [
  { type: 'CUSTOM.boundedHttp', typeVersion: 1, definition: boundedHttpDescription },
];
const errorTrigger = JSON.parse(
  readFileSync(join(fixtureDirectory, 'native-error-trigger-2.37.10.json'), 'utf8')
);
if (
  errorTrigger.n8nVersion !== '2.37.10' ||
  errorTrigger.type !== 'n8n-nodes-base.errorTrigger' ||
  errorTrigger.typeVersion !== 1 ||
  errorTrigger.sourceHash !== 'd2a23a15f30c5bbc48bdc203269b0b0077a2261436a9cb3fff0308d516879763' ||
  nativeWorkflowHash(errorTrigger.definition) !==
    'f4d0373e63f3d60ee4912de2ab432f2197d8c74d907df746069efd212b2f8ff1'
)
  throw new Error('Pinned native Error Trigger integrity failure');
const ownedDefinitions = [
  {
    type: errorTrigger.type,
    typeVersion: errorTrigger.typeVersion,
    definition: errorTrigger.definition,
  },
];
for (const entry of customDefinitions) nodeMap.set(`${entry.type}@${entry.typeVersion}`, entry);
for (const entry of ownedDefinitions) nodeMap.set(`${entry.type}@${entry.typeVersion}`, entry);
export function getNativeNodeDefinition(type, typeVersion) {
  const entry = nodeMap.get(`${type}@${typeVersion}`);
  return entry ? structuredClone(entry) : null;
}
export function listNativeNodeDefinitions() {
  return structuredClone([...catalog.nodes, ...ownedDefinitions]);
}

export function verifyNativeWorkflowKnowledge(knowledge) {
  const parsed = NativeWorkflowKnowledgeSchema.parse(knowledge);
  if (
    parsed.version !== NATIVE_WORKFLOW_VERSION ||
    parsed.catalogHash !== nativeWorkflowHash(parsed.nodes) ||
    parsed.skills.some((skill) => {
      const pinned = skillRegistry.skills.find((entry) => entry.id === skill.id);
      return (
        !pinned ||
        skill.sourceCommit !== pinned.sourceCommit ||
        skill.contentHash !== pinned.contentHash ||
        textHash(skill.content) !== skill.contentHash
      );
    }) ||
    parsed.nodes.some((node) => {
      const pinned = nodeMap.get(`${node.type}@${node.typeVersion}`);
      return !pinned || nativeWorkflowHash(node) !== nativeWorkflowHash(pinned);
    })
  )
    throw new Error('Native workflow knowledge does not match the reviewed pins');
  return parsed;
}

export function createNativeWorkflowKnowledge({
  instruction = '',
  draft = null,
  requestedTypes = [],
  phase = 'design',
} = {}) {
  const required = [
    ...(draft?.workflow?.nodes ?? []),
    ...(draft?.spec?.ownedDependencies ?? []).flatMap((item) => item.workflow?.nodes ?? []),
  ];
  const base = [
    'webhook',
    'respondToWebhook',
    'set',
    'if',
    'switch',
    'filter',
    'merge',
    'aggregate',
    'splitOut',
    'sort',
    'limit',
    'noOp',
    'stopAndError',
  ];
  const hints = [
    [/http|api|endpoint|fetch|request|url|enrich/i, ['httpRequest']],
    [/github|issue|repository|pull request/i, ['github']],
    [/sms|twilio|text message|phone/i, ['twilio']],
    [/loop|batch|iterate|pagination/i, ['splitInBatches']],
    [/schedul|daily|weekly|cron/i, ['scheduleTrigger']],
    [/wait|delay|callback/i, ['wait']],
    [/code|javascript|python|script/i, ['code']],
    [/sub.?workflow|reuse/i, ['executeWorkflow', 'executeWorkflowTrigger']],
    [/error|failure|wrong|notify|notification|alert/i, ['errorTrigger']],
    [/dedup|duplicate/i, ['removeDuplicates']],
    [/date|time/i, ['dateTime']],
  ]
    .filter(([pattern]) => pattern.test(instruction))
    .flatMap(([, types]) => types);
  const selected = [];
  const seen = new Set();
  let bytes = 0;
  const add = (entry) => {
    if (!entry || seen.has(`${entry.type}@${entry.typeVersion}`)) return;
    const size = Buffer.byteLength(JSON.stringify(entry));
    if (bytes + size > 105000 || selected.length >= 40) return;
    selected.push(structuredClone(entry));
    seen.add(`${entry.type}@${entry.typeVersion}`);
    bytes += size;
  };
  for (const node of required) add(nodeMap.get(`${node.type}@${node.typeVersion}`));
  // Repair already has an actual graph and a frozen contract. Do not expand
  // its context with unrelated Code/HTTP/Wait docs merely because diagnostics
  // or prohibitions contain words such as "no JavaScript" or "not hang".
  const alternatives =
    phase === 'repair' && required.length
      ? ['set', 'if', 'switch', 'merge', 'noOp', 'stopAndError']
      : [...hints, ...base];
  if (phase === 'design' && /https|webhook|deliver|send|outgoing|post|connect/i.test(instruction))
    add(customDefinitions[0]);
  for (const name of [...requestedTypes, ...alternatives]) {
    const type = name.includes('.') ? name : `n8n-nodes-base.${name}`;
    const candidates = [...catalog.nodes, ...customDefinitions, ...ownedDefinitions]
      .filter((entry) => entry.type === type)
      .sort((a, b) => b.typeVersion - a.typeVersion);
    add(candidates[0]);
  }
  const skills = skillRegistry.skills
    .filter((s) => !s.id.includes('debugging') || draft)
    .map(({ id, sourceCommit, contentHash, content }) => ({
      id,
      sourceCommit,
      contentHash,
      content,
    }));
  return verifyNativeWorkflowKnowledge({
    version: NATIVE_WORKFLOW_VERSION,
    skills,
    nodes: selected,
    catalogHash: nativeWorkflowHash(selected),
  });
}
