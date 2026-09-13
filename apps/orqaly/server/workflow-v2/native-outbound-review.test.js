// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { reviewNativeWorkflow, createBoundedHttpPolicy, REQUEST_AUTOMATION_POLICY } from './native-workflow-review.js';
import { describeNativeConnection, bindNativeConnections } from './native-workflow-connections.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
const id='4ce2e1f6-9b81-4726-93bc-170e4b745fbd';const environmentId='owned-environment';
const policy=createBoundedHttpPolicy({imageDigest:`sha256:${'a'.repeat(64)}`});
function fixture(){const f=nativeOutboundFixture();const scope=describeNativeConnection({requirement:f.spec.connections[0],workflow:f.workflow,environmentId}).scope;
  const connection={id,requirement_id:'receiver',environment_id:environmentId,credential_type:'orqalyBoundedHttp',provider_credential_id:'nativeCred',scope,status:'saved'};
  return {...f,workflow:normalizeNativeWorkflow({workflow:bindNativeConnections(f.workflow,f.spec,[connection],environmentId),id}).workflow,connections:[connection],environmentId,runtimePolicy:policy};}
describe('bounded outbound review authority',()=>{
  it('allows the exact server-owned bound node and dominating native receipt path',()=>expect(reviewNativeWorkflow(fixture())).toMatchObject({valid:true,execution:{allowed:true}}));
  it('keeps unconnected authoring valid but blocked and never enables stock HTTP',()=>{
    const f=nativeOutboundFixture();const result=reviewNativeWorkflow({...f,runtimePolicy:policy});expect(result.valid).toBe(true);expect(result.execution.allowed).toBe(false);expect(result.dependencies).toMatchObject([{id:'receiver',kind:'connection'}]);
    const changed=fixture();changed.workflow.nodes[1].type='n8n-nodes-base.httpRequest';changed.workflow.nodes[1].typeVersion=4.5;
    expect(reviewNativeWorkflow(changed).execution.allowed).toBe(false);
  });
  it.each(['missing','revoked','other-environment','changed-parameters','forged-id','widened-policy'])('denies stale/forged/absent scope (%s)',(mode)=>{
    const f=fixture();if(mode==='missing')f.connections=[];if(mode==='revoked')f.connections[0].status='revoked';if(mode==='other-environment')f.environmentId='other';
    if(mode==='changed-parameters')f.workflow.nodes[1].parameters.url='https://attacker.example/post';if(mode==='forged-id')f.workflow.nodes[1].credentials.orqalyBoundedHttp.id='unowned';
    if(mode==='widened-policy')f.runtimePolicy={...policy,outboundPackageHash:'b'.repeat(64)};
    expect(reviewNativeWorkflow(f).execution.allowed).toBe(false);
  });
  it('does not grant credentials or network under the original pure profile',()=>expect(reviewNativeWorkflow({...fixture(),runtimePolicy:REQUEST_AUTOMATION_POLICY}).execution.allowed).toBe(false));
  it.each([{retryOnFail:true},{continueOnFail:true},{onError:'continueRegularOutput'},{alwaysOutputData:true},{executeOnce:true}])('does not permit node retry or swallowed errors',change=>{
    const f=fixture();Object.assign(f.workflow.nodes[1],change);expect(reviewNativeWorkflow(f).execution.allowed).toBe(false);
  });
  it('rejects response bypass and multi-path delivery graphs',()=>{
    const f=fixture();f.workflow.connections['Receive event'].main[0].push({node:'Return receipt',type:'main',index:0});
    expect(reviewNativeWorkflow(f).execution.reasons.some(reason=>reason.code==='OUTBOUND_RECEIPT_PATH')).toBe(true);
    const g=fixture();g.workflow.nodes.push({id:'other',name:'Other path',type:'n8n-nodes-base.noOp',typeVersion:1,parameters:{},position:[0,100]});
    g.workflow.connections['Receive event'].main[0].push({node:'Other path',type:'main',index:0});g.workflow.connections['Other path']={main:[[{node:'Deliver event',type:'main',index:0}]]};
    expect(reviewNativeWorkflow(g).execution.reasons.some(reason=>reason.code==='OUTBOUND_CARDINALITY')).toBe(true);
  });
});
