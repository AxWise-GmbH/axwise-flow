// Reproducible developer-only extraction. It never starts an n8n server, reads
// credentials, pulls an image or opens a network. Generated metadata is data.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const image = 'n8nio/n8n:2.37.10';
const expectedImage = 'sha256:307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec';
const actualImage = execFileSync('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], {
  encoding: 'utf8',
}).trim();
if (actualImage !== expectedImage)
  throw new Error('Pinned local n8n image identity changed; review before extraction');
const program = String.raw`
const fs = require('node:fs');
const root = '/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/';
const known = require(root + 'dist/known/nodes.json');
const selected = ['webhook','respondToWebhook','set','if','switch','filter','merge','aggregate','splitOut','sort','limit','removeDuplicates','splitInBatches','noOp','stopAndError','dateTime','httpRequest','github','twilio','scheduleTrigger','wait','code','executeCommand','executeWorkflow','executeWorkflowTrigger','manualTrigger','stickyNote','itemLists','crypto','compression'];
const keys = new Set(['name','displayName','type','default','required','displayOptions','typeOptions','options','values','value','routing','credentialTypes','multipleValues','minValue','maxValue','numberStepSize','loadOptionsMethod','loadOptionsDependsOn','resourceMapper','assignment','filter']);
function clean(value) {
 if (Array.isArray(value)) return value.map(clean);
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k,v]) => keys.has(k) && typeof v !== 'function').map(([k,v]) => [k, ['default','displayOptions','typeOptions','routing'].includes(k) ? JSON.parse(JSON.stringify(v)) : clean(v)]));
 return value;
}
const nodes=[];
for(const name of selected){
 const entry=known[name]; if(!entry) throw Error('Missing pinned node '+name);
 const instance=new (require(root+entry.sourcePath)[entry.className])();
 const versions=instance.nodeVersions ? Object.keys(instance.nodeVersions).map(Number) : (Array.isArray(instance.description.version) ? instance.description.version : [instance.description.version]);
 for(const version of versions){
  const desc=(instance.nodeVersions ? instance.nodeVersions[version] : instance).description;
  nodes.push({type:'n8n-nodes-base.'+name,typeVersion:version,definition:{displayName:desc.displayName,description:desc.description,group:desc.group,inputs:desc.inputs,outputs:desc.outputs,outputNames:desc.outputNames,defaultVersion:instance.description.defaultVersion??Math.max(...versions),credentials:desc.credentials??[],properties:desc.properties.map(clean)}});
 }
}
process.stdout.write(JSON.stringify(nodes));
`;
const raw = execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--pull=never',
    '--network=none',
    '--read-only',
    '--entrypoint',
    'node',
    image,
    '-e',
    program,
  ],
  { encoding: 'utf8', maxBuffer: 12000000 }
);
const nodes = JSON.parse(raw);
const fixture = {
  format: 'orqaly.native-node-catalog.v1',
  n8nVersion: '2.37.10',
  imageId: expectedImage,
  imageDigest: 'sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2',
  source: 'https://github.com/n8n-io/n8n/tree/n8n%402.37.10/packages/nodes-base',
  extraction: 'Installed versioned NodeDescription metadata; not whole-workflow SDK validation',
  nodes,
  dataHash: createHash('sha256').update(JSON.stringify(nodes)).digest('hex'),
};
writeFileSync(
  fileURLToPath(new URL('./native-node-catalog-2.37.10.json', import.meta.url)),
  JSON.stringify(fixture, null, 2) + '\n'
);
const editorProgram = String.raw`
const fs=require('node:fs');
const path='/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/dist/types/nodes.json';
const types=${JSON.stringify([...new Set(nodes.map((n) => n.type.split('.').at(-1)))])};
const descriptions=JSON.parse(fs.readFileSync(path,'utf8')).filter((n)=>types.includes(n.name));
if(new Set(descriptions.map((n)=>n.name)).size!==types.length) throw new Error('Missing native editor description');
process.stdout.write(JSON.stringify(descriptions));
`;
const editorNodes = JSON.parse(
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--pull=never',
      '--network=none',
      '--read-only',
      '--entrypoint',
      'node',
      image,
      '-e',
      editorProgram,
    ],
    { encoding: 'utf8', maxBuffer: 12000000 }
  )
);
const editorFixture = {
  format: 'orqaly.native-editor-nodes.v1',
  n8nVersion: '2.37.10',
  imageId: expectedImage,
  imageDigest: fixture.imageDigest,
  source: 'n8n-nodes-base/dist/types/nodes.json',
  packageName: 'n8n-nodes-base',
  note: 'Exact generated native frontend descriptions; names remain upstream package-local. The native gateway prefixes packageName for editor routing; this metadata grants no execution authority.',
  nodes: editorNodes,
  dataHash: createHash('sha256').update(JSON.stringify(editorNodes)).digest('hex'),
};
writeFileSync(
  fileURLToPath(new URL('./native-editor-nodes-2.37.10.json', import.meta.url)),
  JSON.stringify(editorFixture, null, 2) + '\n'
);
process.stdout.write(
  JSON.stringify({
    nodeTypes: new Set(nodes.map((n) => n.type)).size,
    versions: nodes.length,
    dataHash: fixture.dataHash,
    editorDescriptions: editorNodes.length,
    editorDataHash: editorFixture.dataHash,
  }) + '\n'
);
