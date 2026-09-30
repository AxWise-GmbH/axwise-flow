import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeReport, renderMarkdown, main } from './summarize-orqanix-matrix.mjs';

const NATIVE=['ast_search','lsp_query','hashline_edit','safe_edit_and_test'];
const AXWISE=['prepare_discovery','research_market','generate_personas','simulate_interviews','chat_with_persona','analyze_interviews','create_prd','create_delivery_brief'].map(name=>`axwise-local__${name}`);
function row({difficulty='simple',repeat=1,j=false,n=false,a=false,ms=1000,...extra}={}){
  const flags={jevReviewEnabled:j,nativeGemsEnabled:n,axwiseLocalEnabled:a};
  return {key:`${difficulty}-r${repeat}-j${+j}n${+n}a${+a}`,difficulty,repeat,flags,status:'completed',passed:true,elapsedMs:ms,firstOutputMs:100,setupMs:6000,inventoryMatches:true,actualToolInventory:['shell',...(n?NATIVE:[]),...(a?AXWISE:[])],oracle:{passed:true,integrity:{passed:true,checks:[]},code:{passed:true,checks:[]},documents:{passed:true,checks:[],semanticQualityEvaluated:false}},tools:[],telemetry:{modelRequests:[],jevRequests:[],pending:0},...extra};
}
const report=rows=>({schema:'orqanix.actual-desktop-matrix.v1',startedAt:'2026-09-29T10:00:00.000Z',fingerprint:{repetitions:2,preflight:false},rows,method:'Actual Electron fixture'});
const cell=(a,key='j0n0a0',difficulty='simple')=>a.cells.find(c=>c.combination===key&&c.difficulty===difficulty);
const request=(id,usage,extra={})=>({id,kind:'model_http',source:'primary',status:'completed',requestedModel:'gemini-3.8-flash',responseModels:['gemini-3.8-flash'],modelIdentity:'verified',requestedEffort:null,usage,...extra});

test('unsettled bookkeeping remains excluded from timing without becoming a fictional task failure',()=>{
  const completed=row({status:'unsettled_telemetry',passed:false,response:{result:{stopReason:'end_turn'}},telemetry:{pending:1}});
  const badCode=row({repeat:2,response:{result:{stopReason:'end_turn'}}});badCode.oracle.code.passed=false;
  const a=analyzeReport(report([completed,badCode]));
  assert.equal(a.totals.validOutcomes,0);
  assert.equal(a.totals.terminalTaskSuccesses,1);
  assert.deepEqual(a.totals.measurementExclusionsAfterTaskSuccess,[completed.key]);
  assert.equal(a.rows[0].terminalTaskSuccess,true);
  assert.equal(a.rows[1].terminalTaskSuccess,false);
  assert.match(renderMarkdown(a),/measurement exclusion is not necessarily a task failure/);
});

test('failed-fast results never enter valid timing, and missing slots remain missing',()=>{
  const a=analyzeReport(report([row({ms:4000}),row({repeat:2,ms:1,status:'timeout',passed:false,error:'TIMEOUT'})]));
  assert.equal(a.cells.length,24);assert.equal(a.totals.expected,48);assert.equal(a.totals.missing,46);
  assert.deepEqual(cell(a).validElapsedSeconds,{count:1,mean:4,min:4,max:4});assert.equal(cell(a).timeouts,1);assert.equal(cell(a).invalidOutcomes,1);assert.equal(cell(a).completed,1);
  assert.equal(a.totals.validFirstOutputSeconds.mean,.1);assert.equal(a.totals.setupSecondsExcluded.mean,6);
  assert.match(renderMarkdown(a),/Failed or unfinished runs are never ranked/);
});

test('reported success requires independent correct enabled and disabled inventory plus oracle success',()=>{
  const missing=row({n:true});missing.actualToolInventory=missing.actualToolInventory.filter(n=>n!=='lsp_query');
  const unexpected=row({repeat:2});unexpected.actualToolInventory.push('hashline_edit');
  const wrongOracle=row({difficulty:'medium'});wrongOracle.oracle.documents.passed=false;
  const a=analyzeReport(report([missing,unexpected,wrongOracle]));assert.equal(a.totals.validOutcomes,0);assert.equal(a.totals.reportedPassed,3);
  assert.equal(a.totals.validationFailures.inventory_not_verified,2);assert.equal(a.totals.validationFailures.oracle_not_passed,1);
  const valid=analyzeReport(report([row({a:true,n:true})]));assert.equal(valid.totals.validOutcomes,1);assert.equal(valid.rows[0].tools.native.called,0);assert.equal(valid.rows[0].actualInventory.native.length,4);
});

test('only one final cumulative usage per request is summed; title calls and missing fields stay explicit',()=>{
  const requests=[request(1,{prompt_tokens:10,completion_tokens:4,total_tokens:20},{toolNames:[],usageSnapshots:[{total_tokens:19},{total_tokens:20},{total_tokens:20}]}),request(2,{prompt_tokens:30,completion_tokens:8,total_tokens:50},{usageSnapshots:[{total_tokens:50}],source:'axwise'}),request(3,null,{status:'failed',modelIdentity:'not_generated',responseModels:[]})];
  const r=row();r.telemetry={modelRequests:requests,records:requests,jevRequests:[],pending:0};
  const model=analyzeReport(report([r])).totals.telemetry.model;
  assert.equal(model.requests,3);assert.equal(model.usage.totalTokens.reportedSum,70);assert.equal(model.usage.totalTokens.requestsMissing,1);assert.equal(model.usage.inputTokens.reportedSum,40);assert.equal(model.usage.outputTokens.reportedSum,12);
  assert.equal(model.bySource.primary.requests,2);assert.equal(model.bySource.axwise.requests,1);assert.equal(model.requestedEfforts.unspecified,3);assert.equal(model.requestsWithoutReturnedModel,1);
});

test('tool and Jev observations preserve calls, unsuccessful completion and returned advice without inventing application',()=>{
  const r=row({j:true,n:true,a:true});r.tools=[
    {toolCallId:'a',_meta:{goose:{toolCall:{toolName:'hashline_edit'}}},status:'completed'},
    {toolCallId:'b',name:'safe_edit_and_test',status:'completed',rawOutput:{isError:true}},
    {toolCallId:'c',name:'axwise-local__create_prd',status:'failed'},
    {toolCallId:'d',name:'lsp_query',status:'in_progress'},
  ];r.telemetry.jevRequests=[{status:'completed',httpStatus:200,elapsedMs:250,decision:'local_engineering',reason:'supported',responseModel:'jev-1.13.0',route:'/decisions'},{status:'cancelled_or_timed_out',httpStatus:504,elapsedMs:30000,error:'UPSTREAM_TIMEOUT',route:'/decisions'}];
  const a=analyzeReport(report([r]));assert.deepEqual([a.totals.tools.native.called,a.totals.tools.native.completed,a.totals.tools.native.errors,a.totals.tools.native.unfinished],[3,1,1,1]);assert.equal(a.totals.tools.axwise.errors,1);
  assert.equal(a.totals.telemetry.jev.timeoutsOrCancellations,1);assert.equal(a.totals.telemetry.jev.returnedAdvice.local_engineering,1);assert.equal(a.totals.telemetry.jev.elapsedSeconds.mean,15.125);assert.match(renderMarkdown(a),/not proof|does not establish/);
});

test('native action counts distinguish hashline reads, edit attempts and guarded edit/test across raw and curated records',()=>{
  const first=row({n:true,tools:[
    {toolCallId:'read-raw',name:'hashline_edit',status:'completed',rawInput:{action:'read',path:'DO_NOT_EXPORT'}},
    {toolCallId:'read-curated',name:'native_engineering__hashline_edit',status:'completed',action:'read'},
    {toolCallId:'edit-raw',name:'hashline_edit',status:'completed',rawInput:{action:'edit'}},
  ]});
  const second=row({n:true,repeat:2,tools:[
    {toolCallId:'edit-curated',name:'hashline_edit',status:'completed',action:'edit',rawOutput:{isError:true}},
    {toolCallId:'guarded',name:'safe_edit_and_test',status:'completed'},
    {toolCallId:'guarded-pending',name:'native_engineering__safe_edit_and_test',status:'in_progress',action:'read'},
  ]});
  const a=analyzeReport(report([first,second])),native=a.totals.tools.native;
  assert.deepEqual(a.rows[0].tools.native.calls.map(call=>call.action),['read','read','edit']);
  assert.deepEqual(a.rows[0].tools.native.actions,{edit:1,read:2});
  assert.deepEqual(native.actions,{edit:2,guarded_edit_and_test:2,read:2});
  assert.deepEqual(native.actionOutcomes.read,{called:2,completed:2,errors:0,unfinished:0});
  assert.deepEqual(native.actionOutcomes.edit,{called:2,completed:1,errors:1,unfinished:0});
  assert.deepEqual(native.actionOutcomes.guarded_edit_and_test,{called:2,completed:1,errors:0,unfinished:1});
  assert.deepEqual(cell(a,'j0n1a0').tools.native.actions,native.actions);
  assert.deepEqual(a.byFlags.find(flags=>flags.combination==='j0n1a0').tools.native.actionOutcomes,native.actionOutcomes);
  assert.equal(a.totals.validOutcomes,2);assert.equal(a.totals.validElapsedSeconds.mean,1);
  const md=renderMarkdown(a);assert.match(md,/Native actions \(attempts\)/);assert.match(md,/hashline_edit call is not automatically an edit/);assert.match(md,/guarded_edit_and_test 2\/1\/0\/1/);assert.match(md,/not proof that a file change was committed/);assert.doesNotMatch(JSON.stringify(a),/DO_NOT_EXPORT/);
});

test('unknown, arbitrary and conflicting hashline actions stay unreported rather than implying edits',()=>{
  const inputs=[{}, {action:'apply'}, {action:{kind:'read'}}, {action:'DO_NOT_EXPORT_ACTION'}, {rawInput:{action:'read'},action:'edit'}, {rawInput:{action:null},action:'read'}];
  const tools=inputs.map((input,index)=>({toolCallId:`unknown-${index}`,name:'hashline_edit',status:'completed',...input}));
  tools.push({toolCallId:'ast',name:'ast_search',status:'completed',action:'edit'}, {toolCallId:'lsp',name:'lsp_query',status:'completed',rawInput:{action:'read'}});
  const a=analyzeReport(report([row({n:true,tools})]));
  assert.deepEqual(a.totals.tools.native.actions,{unreported:8});
  assert.ok(a.rows[0].tools.native.calls.every(call=>call.action==='unreported'));
  assert.equal(a.totals.tools.native.actionOutcomes.unreported.completed,8);
  assert.doesNotMatch(JSON.stringify(a),/DO_NOT_EXPORT_ACTION/);
});

test('local Jev service outcomes and linked provider HTTP keep model, evaluation, latency and tokens separate',()=>{
  const service={id:1,kind:'jev_service',status:'completed',elapsedMs:1400,evaluated:false,reason:'quality_gate_failed',decision:'conversation',effectiveMode:'current_local_service'};
  const providers=[{id:2,kind:'jev_provider_http',serviceRecordId:1,status:'completed',httpStatus:200,elapsedMs:1000,requestedModel:'jev-1.13',responseModel:'jev-1.13.0',usage:{input_tokens:12,output_tokens:3},usageSnapshots:[{input_tokens:12}]},{id:3,kind:'jev_provider_http',serviceRecordId:1,status:'cancelled_or_timed_out',elapsedMs:300,error:'JEV_CANCELLED_OR_TIMEOUT'}];
  const r=row({j:true});r.telemetry={provenance:{jevMethod:'current_local_production_services',jevProviderHttpVisible:true},modelRequests:[request(4,{total_tokens:100})],jevRequests:[service],jevProviderRequests:providers,records:[service,...providers],pending:0};
  const a=analyzeReport(report([r])),t=a.totals.telemetry,md=renderMarkdown(a);
  assert.equal(t.jev.requests,1);assert.equal(t.jev.elapsedSeconds.mean,1.4);assert.equal(t.jev.evaluationCounts.not_evaluated,1);
  assert.equal(t.jevProvider.requests,2);assert.equal(t.jevProvider.elapsedSeconds.mean,.65);assert.equal(t.jevProvider.completedElapsedSeconds.mean,1);assert.equal(t.jevProvider.timeoutsOrCancellations,1);assert.deepEqual(t.jevProvider.returnedModels,['jev-1.13.0']);assert.equal(t.jevProvider.observations[0].serviceRecordId,1);
  assert.equal(t.jevProvider.reportedUsageFields.input_tokens.reportedSum,12);assert.equal(t.jevProvider.reportedUsageFields.input_tokens.requestsMissing,1);assert.equal(t.model.usage.totalTokens.reportedSum,100);
  assert.match(md,/Direct Jev provider HTTP is visible in 1 recorded rows/);assert.doesNotMatch(md,/Jev provider HTTP.*not visible/);assert.match(md,/normal packaged OAuth\/session endpoint/);assert.match(md,/overlapping elapsed times must not be added/);
});

test('record fallback recognizes local service and provider layers; visible zero differs from forwarded unknown',()=>{
  const direct=row({j:true});direct.telemetry={provenance:{jevMethod:'current_local_production_services',jevProviderHttpVisible:true},records:[{kind:'jev_service',status:'completed',evaluated:false,elapsedMs:0}],pending:0};
  const forwarded=row({repeat:2,j:true});forwarded.telemetry={provenance:{jevMethod:'forwarded_authenticated_packaged_endpoint',jevProviderHttpVisible:false},records:[{kind:'jev_http',status:'completed',elapsedMs:100}],pending:0};
  const a=analyzeReport(report([direct,forwarded]));assert.equal(a.totals.telemetry.jev.requests,2);assert.equal(a.totals.telemetry.jevProvider.requests,0);assert.deepEqual(a.totals.telemetry.provenance.jevProviderVisibilityRows,{direct:1,not_visible:1});
  assert.match(a.interpretation.jev,/visible in 1 recorded rows/);assert.match(a.interpretation.jev,/not visible in 1 forwarded-service rows/);
  const visible=renderMarkdown(analyzeReport(report([direct])));assert.match(visible,/direct:1 \| 0 \/ 0 \/ 0/);
  const hidden=analyzeReport(report([forwarded]));assert.match(hidden.interpretation.jev,/not visible/);assert.doesNotMatch(renderMarkdown(hidden),/Observed HTTP attempts/);
  direct.telemetry.records.push({kind:'jev_provider_http',status:'completed',elapsedMs:80,responseModel:'jev-test'});assert.equal(analyzeReport(report([direct])).totals.telemetry.jevProvider.requests,1);
});

test('policy denials have readable reasons and no raw input; a denied request alone does not invalidate a passed task',()=>{
  const r=row();r.decisions=[{requestId:'r1',toolCallId:'t1',name:'shell',allow:false,reason:'outside_benchmark_policy',input:{secret:'DO_NOT_EXPORT'}},{requestId:'r2',name:'read',allow:true,reason:'allowed_synthetic_fixture_operation'},{requestId:'r3',name:'other',allow:false,reason:'new_policy_reason'}];
  const a=analyzeReport(report([r]));assert.equal(a.totals.validOutcomes,1);assert.equal(a.totals.approvals.denied,2);assert.equal(a.totals.approvals.allowed,1);assert.equal(a.totals.approvals.rowsWithDenials,1);assert.equal(a.totals.approvals.rowsWithDenialsAndValidOutcome,1);assert.equal(a.rows[0].approvals.observations[0].readableReason,'Operation outside the benchmark permission policy');assert.equal(a.rows[0].approvals.observations[2].readableReason,'new policy reason');assert.doesNotMatch(JSON.stringify(a),/DO_NOT_EXPORT/);
  const md=renderMarkdown(a);assert.match(md,/denied 2/);assert.match(md,/shell: Operation outside the benchmark permission policy/);assert.match(md,/not independent proof that each UI click was delivered/);
});

test('matched effects pair only same difficulty, repetition and other flags and retain heterogeneity',()=>{
  const rows=[row({ms:10000}),row({j:true,ms:20000}),row({repeat:2,ms:20000}),row({repeat:2,j:true,ms:15000}),row({difficulty:'medium',ms:10000}),row({difficulty:'medium',j:true,ms:1,status:'timeout',passed:false}),row({difficulty:'complex',n:true,j:true,ms:1000})];
  const f=analyzeReport(report(rows)).factorialEffects.jev;
  assert.equal(f.pairs,2);assert.equal(f.deltaSeconds.mean,2.5);assert.equal(f.deltaSeconds.min,-5);assert.equal(f.deltaSeconds.max,10);assert.equal(f.onFaster,1);assert.equal(f.onSlower,1);assert.equal(f.exclusionCounts.nonvalid_outcome,1);assert.equal(f.byDifficulty.medium.pairs,0);assert.equal(f.strata.length,1);assert.equal(f.expectedPairs,24);assert.equal(f.excludedPairs,22);
});

test('duplicate or mismatched rows are rejected rather than silently dropped or assigned to wrong cell',()=>{
  assert.throws(()=>analyzeReport(report([row(),row()])),/DUPLICATE_ROW_KEY/);
  const wrong=row();wrong.flags.axwiseLocalEnabled=true;assert.throws(()=>analyzeReport(report([wrong])),/INVALID_ROW_IDENTITY/);
  assert.throws(()=>analyzeReport({...report([]),schema:'other'}),/INVALID_REPORT_SCHEMA/);
});

test('markdown provides all 24 outcome cells, detailed evidence caveats, and no implied high effort',()=>{
  const a=analyzeReport(report([])),markdown=renderMarkdown(a);
  assert.equal(a.cells.length,24);assert.equal(a.factorialEffects.native.pairs,0);assert.equal(a.totals.telemetry.model.usage.totalTokens.reportedSum,null);
  assert.equal(markdown.split('\n').filter(line=>/^\| J[01]N[01]A[01] \|/.test(line)).length,16);
  assert.match(markdown,/semantic quality is not evaluated/);assert.match(markdown,/UI title generation is included/);assert.match(markdown,/exploratory evidence/);assert.doesNotMatch(markdown,/high effort|statistically significant/);
});

test('CLI API writes standalone JSON and Markdown without network or original report changes',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'matrix-summary-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const input=join(dir,'report.json'),output=join(dir,'summary');const source=JSON.stringify(report([row()]));await writeFile(input,source);
  const a=await main([input,output]);assert.equal(a.totals.validOutcomes,1);assert.equal(JSON.parse(await readFile(join(output,'analysis.json'),'utf8')).cells.length,24);assert.match(await readFile(join(output,'summary.md'),'utf8'),/Orqanix desktop matrix/);assert.equal(await readFile(input,'utf8'),source);
});
