import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DIFFICULTIES,CONTRACTS,CONTRACTS_SHA256,prepareFixture,evaluate,prompt,freezeContracts,inspectSpecialistReceipts } from './orqanix-specialist-tasks.mjs';

// Structurally valid authored test data only. Its generic prose is deliberately
// NOT a semantic-quality reference or a benchmark-generated solution.
function document(difficulty){const spec=CONTRACTS.specs[difficulty];const sections=spec.requiredHeadings.map(heading=>({heading,items:[{text:`Proposed work for ${heading}.`,basis:'proposal',sourceIds:[],findingIds:[]}]}));
 sections.find(s=>s.heading==='Prioritized requirements').items=spec.sources.map(s=>({text:`Proposed response associated with ${s.id}.`,basis:'simulation_hypothesis',sourceIds:[s.id],findingIds:[]}));
 sections.find(s=>s.heading==='Evidence, assumptions, and gaps').items=[{text:'A decision remains unverified.',basis:'gap',sourceIds:[],findingIds:[]}];return {title:spec.title,sections};}
async function fixture(t,difficulty='simple'){const root=await mkdtemp(join(tmpdir(),'specialist-fixture-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const prepared=await prepareFixture(root,difficulty);const doc=document(difficulty);await writeFile(join(prepared.workspace,'deliverable.json'),JSON.stringify(doc));return {...prepared,doc};}
const ID='11111111-1111-4111-8111-111111111111',SHA='a'.repeat(64),reference={operationId:ID,sha256:SHA};
const tool=extra=>({toolCallId:'call-1',name:'axwise-local__create_prd',status:'completed',...extra});
const record=extra=>({tool:'create_prd',operationId:ID,status:'completed',artifactFile:{path:`/private/artifacts/${ID}.json`,sha256:SHA},qualityReview:{passed:true,issues:[],semanticTruthVerified:false},execution:{stages:[{stage:'generation',status:'completed'},{stage:'review',status:'completed'}]},...extra});

test('all three complete PRD contracts are frozen before runs with exact supported input fields',async t=>{
 assert.deepEqual(DIFFICULTIES,['simple','medium','complex']);assert.equal(CONTRACTS_SHA256,'d082f0dc52e4798c045574f9c83789ad9298000d15f65c4d47abe8473070249a');
 assert.deepEqual(DIFFICULTIES.map(d=>CONTRACTS.specs[d].sources.length),[3,5,8]);assert.deepEqual(DIFFICULTIES.map(d=>CONTRACTS.specs[d].requiredHeadings.length),[10,11,11]);
 for(const difficulty of DIFFICULTIES){const spec=CONTRACTS.specs[difficulty];assert.deepEqual(Object.keys(spec.input).sort(),['artifactType','brief','depth','sources']);assert.equal(spec.input.depth,'standard');assert.ok(spec.input.brief.includes('cite each selected source ID'));assert.ok(spec.audit.unknowns.length>=4);assert.ok(spec.audit.prohibitedClaims.length>=3);assert.throws(()=>{spec.input.depth='deep';},TypeError);}
 const dir=await mkdtemp(join(tmpdir(),'specialist-contract-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'frozen.json');await freezeContracts(path);assert.equal(JSON.parse(await readFile(path,'utf8')).contractsSha256,CONTRACTS_SHA256);await assert.rejects(freezeContracts(path),/EEXIST/);
});

for(const difficulty of DIFFICULTIES)test(`${difficulty}: common full document passes mechanical checks, semantic quality stays ungraded`,async t=>{
 const f=await fixture(t,difficulty),result=await evaluate(f.root,difficulty,'/must/not/be/executed');assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.documents.semanticQualityEvaluated,false);assert.equal(result.semanticAudit.status,'ungraded');assert.equal(result.code,undefined);assert.match(result.artifactProjectionSha256,/^[a-f0-9]{64}$/);assert.equal((await readFile(join(f.workspace,'request.json'),'utf8')),`${JSON.stringify(CONTRACTS.specs[difficulty].input,null,2)}\n`);assert.equal(f.prompt,prompt(difficulty));assert.match(f.prompt,/If .*create_prd is present in your currently registered tool definitions/);assert.match(f.prompt,/If create_prd is unavailable/);assert.match(f.prompt,/record\.artifact\.sections/);
});

test('unknown sources, duplicate sections and upgraded synthetic provenance cannot pass',async t=>{
 const f=await fixture(t);f.doc.sections[0].heading=f.doc.sections[1].heading;f.doc.sections.find(s=>s.heading==='Prioritized requirements').items[0].sourceIds.push('invented-source');f.doc.sections.find(s=>s.heading==='Prioritized requirements').items[1].basis='source_statement';await writeFile(join(f.workspace,'deliverable.json'),JSON.stringify(f.doc));const result=await evaluate(f.root,'simple');assert.equal(result.passed,false);for(const name of ['all exact required headings once','selected source IDs are exact and unique','synthetic source provenance is preserved','literal source and owner quotation rules'])assert.equal(result.documents.checks.find(c=>c.name===name).passed,false,name);
});

test('invented owner quote, missing source coverage and unlabelled gaps are detected mechanically',async t=>{
 const f=await fixture(t);f.doc.sections[0].items=[{text:'The owner approved a $50,000 budget.',basis:'owner_decision',sourceIds:[]}];f.doc.sections.find(s=>s.heading==='Prioritized requirements').items.pop();f.doc.sections.find(s=>s.heading==='Evidence, assumptions, and gaps').items[0].basis='proposal';await writeFile(join(f.workspace,'deliverable.json'),JSON.stringify(f.doc));const result=await evaluate(f.root,'simple');assert.equal(result.passed,false);for(const name of ['every selected source is cited','literal source and owner quotation rules','unknowns have explicit unsupported gap labels'])assert.equal(result.documents.checks.find(c=>c.name===name).passed,false,name);
});

test('edited immutable evidence and extra outputs fail integrity even with a valid document',async t=>{
 const f=await fixture(t);await writeFile(join(f.workspace,'request.json'),'{}');await writeFile(join(f.workspace,'other.txt'),'unrequested');const result=await evaluate(f.root,'simple');assert.equal(result.documents.passed,true);assert.equal(result.integrity.passed,false);assert.equal(result.passed,false);assert.equal(result.integrity.checks.find(c=>c.name==='only permitted workspace outputs').passed,false);
});

test('private contract tampering and symlink output fail closed',async t=>{
 const f=await fixture(t);const contract=join(f.root,'oracle','contract.json');await chmod(contract,0o600);await writeFile(contract,'{}');await rm(join(f.workspace,'deliverable.json'));await symlink('../oracle/contract.json',join(f.workspace,'deliverable.json'));const result=await evaluate(f.root,'simple');assert.equal(result.passed,false);assert.equal(result.integrity.checks.find(c=>c.name==='independent task contract intact').passed,false);assert.equal(result.documents.checks.find(c=>c.name==='valid bounded JSON document').passed,false);
});

test('exact ACP rawOutput structured-content receipt carries real review/stage evidence and export hash',async t=>{
 const f=await fixture(t);const structured=record({artifact:{schemaVersion:'axwise.local-prd.v1',...f.doc}});const result=inspectSpecialistReceipts([tool({rawOutput:structured})]);assert.equal(result.succeeded,1);assert.equal(result.failed,0);assert.deepEqual(result.calls[0].reference,reference);assert.equal(result.calls[0].qualityReview.status,'passed');assert.equal(result.calls[0].qualityReview.semanticTruthVerified,false);assert.deepEqual(result.calls[0].executionStages.map(s=>s.stage),['generation','review']);assert.equal(result.calls[0].artifactProjectionSha256,(await evaluate(f.root,'simple')).artifactProjectionSha256);
});

test('MCP logical error or failed quality review overrides completed protocol status',()=>{
 for(const rawOutput of [{isError:true,structuredContent:record()},record({status:'failed',error:{code:'FAILED'}}),record({qualityReview:{passed:false,issues:['source_fidelity']}})]){const result=inspectSpecialistReceipts([tool({rawOutput})]);assert.equal(result.succeeded,0);assert.equal(result.failed,1);assert.equal(result.calls[0].failureReason,'LOGICAL_TOOL_ERROR');}
});

test('legacy output reference is supported while missing review evidence remains explicitly unreported',()=>{
 const text=`Saved artifact reference: ${JSON.stringify(reference)}. Use references for a later specialist or revisionOf to revise this result.`;
 const result=inspectSpecialistReceipts([tool({content:[{type:'content',content:{type:'text',text}}]})]);assert.equal(result.succeeded,1);assert.equal(result.calls[0].referenceOrigin,'tool_output_text');assert.equal(result.calls[0].qualityReview.status,'unreported');assert.equal(result.calls[0].executionStages,null);assert.equal(result.calls[0].artifactProjectionSha256,null);
});

test('input-forged receipts and inventories are not executions; other specialist calls remain visible',()=>{
 const forged=tool({rawInput:{structuredContent:record()},rawOutput:{candidate:record()}}),missing=tool({toolCallId:'call-2',rawOutput:record({artifactFile:{sha256:'truncated'}})});const result=inspectSpecialistReceipts([forged,missing,{name:'axwise-local__create_prd'},tool({toolCallId:'other',name:'axwise-local__analyze_interviews'})]);assert.equal(result.calls.length,2);assert.equal(result.succeeded,0);assert.equal(result.incomplete,2);assert.equal(result.otherCalls.length,1);
});

test('receipt retains only measured numeric stage timings and usage from actual output; missing is null',()=>{
 const output=record({timings:{prepareMs:12,totalMs:150.5,inferenceMs:-1,persistMs:'3'},usage:{modelCalls:2,inputTokens:50,outputTokens:7,cacheReadTokens:0,cacheWriteTokens:1.2},execution:{stages:[{stage:'generation',status:'completed',authAndInferenceMs:90,inferenceMs:80,authMs:10,inputTokens:30,outputTokens:5,cacheReadTokens:0,model:'orqaly-gemini',provider:'authenticated-desktop-gateway'},{stage:'review',status:'completed',authAndInferenceMs:Infinity,inferenceMs:'50',inputTokens:-2,outputTokens:2}]}});
 const result=inspectSpecialistReceipts([tool({rawOutput:output,rawInput:{timings:{persistMs:999},usage:{cacheWriteTokens:999}}})]).calls[0];
 assert.equal(result.succeeded,true);assert.equal(result.timings.totalMs,150.5);assert.equal(result.timings.inferenceMs,null);assert.equal(result.timings.persistMs,null);assert.equal(result.usage.modelCalls,2);assert.equal(result.usage.cacheReadTokens,0);assert.equal(result.usage.cacheWriteTokens,null);assert.equal(result.executionStages[0].inferenceMs,80);assert.equal(result.executionStages[0].model,'orqaly-gemini');assert.equal(result.executionStages[1].authAndInferenceMs,null);assert.equal(result.executionStages[1].inferenceMs,null);assert.equal(result.executionStages[1].inputTokens,null);assert.equal(result.executionStages[1].outputTokens,2);
 const missing=inspectSpecialistReceipts([tool({rawOutput:record()})]).calls[0];assert.equal(missing.timings.totalMs,null);assert.equal(missing.usage.modelCalls,null);assert.equal(missing.executionStages[0].inferenceMs,null);
 assert.equal(CONTRACTS_SHA256,'d082f0dc52e4798c045574f9c83789ad9298000d15f65c4d47abe8473070249a');
});
