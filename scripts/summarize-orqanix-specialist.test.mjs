import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeReport, renderMarkdown, main } from './summarize-orqanix-specialist.mjs';

const AXWISE=['create_prd','analyze_interviews','simulate_interviews','prepare_discovery','generate_personas','chat_with_persona','research_market','create_delivery_brief'].map(name=>`axwise-local__${name}`);
const ID='11111111-1111-4111-8111-111111111111',FILE_SHA='a'.repeat(64),PROJECTION=createHash('sha256').update('{"sections":[],"title":"Fixture"}').digest('hex');
function prdTool(extra={}){return {toolCallId:'prd-1',name:'axwise-local__create_prd',status:'completed',rawOutput:{tool:'create_prd',operationId:ID,status:'completed',artifact:{title:'Fixture',sections:[]},artifactFile:{path:'/host/artifact.json',sha256:FILE_SHA},qualityReview:{passed:true,issues:[],semanticTruthVerified:false},usage:{modelCalls:2,inputTokens:100,outputTokens:20},timings:{prepareMs:10,inferenceMs:6900,authAndInferenceMs:7100,totalMs:7200},execution:{stages:[{stage:'generation',status:'completed',authAndInferenceMs:5100,inferenceMs:5000,authMs:100,inputTokens:60,outputTokens:15},{stage:'review',status:'completed',authAndInferenceMs:2000,inferenceMs:1900,authMs:100,inputTokens:40,outputTokens:5}]}},...extra};}
function row({difficulty='simple',on=false,ms=10000,...extra}={}){return {key:`${difficulty}-r1-j0n0a${+on}`,difficulty,repeat:1,flags:{jevReviewEnabled:false,nativeGemsEnabled:false,axwiseLocalEnabled:on},status:'completed',passed:true,response:{result:{stopReason:'end_turn'}},elapsedMs:ms,firstOutputMs:500,setupMs:7000,actualToolInventory:['shell','write',...(on?AXWISE:[])],inventoryMatches:true,tools:on?[prdTool()]:[],specialistRequirementMatches:true,specialistExportMatches:on?true:null,pendingApprovals:[],oracle:{passed:true,integrity:{passed:true,checks:[]},documents:{passed:true,checks:[],semanticQualityEvaluated:false},artifactProjectionSha256:PROJECTION},telemetry:{modelRequests:[],jevRequests:[],jevProviderRequests:[],pending:0},...extra};}
const report=rows=>({schema:'orqanix.actual-desktop-specialist-pairs.v1',fingerprint:{repetitions:1,preflight:false},rows,method:'Actual Electron synthetic report'});
const request=(usage,extra={})=>({kind:'model_http',source:'primary',status:'completed',httpStatus:200,requestedModel:'gemini-3.8-flash',responseModels:['gemini-3.8-flash'],modelIdentity:'verified',requestedEffort:null,usage,...extra});

test('all six slots remain visible; valid paired timing is conditional on both outcomes',()=>{
 const a=analyzeReport(report([row(),row({on:true,ms:18000})]));assert.equal(a.cells.length,6);assert.equal(a.totals.missing,4);assert.equal(a.totals.validTimingOutcomes,2);assert.equal(a.totals.validElapsedSeconds.mean,14);assert.equal(a.pairedComparisons[0].deltaSeconds,8);assert.equal(a.pairedComparisons[0].percentChange,80);assert.equal(a.pairedComparisons[1].reason,'missing_row');assert.equal(a.totals.setupSecondsExcluded.mean,7);assert.equal(a.totals.specialist.succeeded,1);assert.equal(a.rows[1].exportMatches,true);assert.equal(a.rows[1].semanticQuality.evaluated,false);
});

test('logically rejected PRD cannot become a valid fast result despite protocol completion or a schema-valid fallback',()=>{
 const failed=prdTool();failed.rawOutput.status='failed';failed.rawOutput.error={code:'QUALITY_REVIEW_FAILED'};failed.rawOutput.qualityReview={passed:false,issues:['source_fidelity']};const a=analyzeReport(report([row({ms:10000}),row({on:true,ms:1,tools:[failed]})]));
 assert.equal(a.totals.validTimingOutcomes,1);assert.equal(a.totals.validElapsedSeconds.mean,10);assert.equal(a.rows[1].documentStructurePassed,true);assert.equal(a.rows[1].specialist.failed,1);assert.equal(a.rows[1].specialist.calls[0].errorCode,'QUALITY_REVIEW_FAILED');assert.equal(a.rows[1].specialist.calls[0].qualityReview.status,'failed');assert.equal(a.pairedComparisons[0].deltaSeconds,null);assert.ok(a.rows[1].exclusions.includes('specialist_requirement_not_met'));assert.match(renderMarkdown(a),/never ranked as a fast success/);
});

test('explicit response or row errors override contradictory completed status and passing checks',()=>{
 const rpcError={code:-32603,message:'Response failed'};
 const a=analyzeReport(report([row({response:{result:{stopReason:'end_turn'},error:rpcError}}),row({difficulty:'medium',on:true,error:'RECORDER_FAILED'})]));
 assert.equal(a.totals.completedStatus,2);assert.equal(a.totals.documentStructurePassed,2);assert.equal(a.totals.endTurnsObserved,0);assert.equal(a.totals.taskAndExportChecksPassed,0);assert.equal(a.totals.validTimingOutcomes,0);assert.deepEqual(a.rows[0].error,rpcError);assert.equal(a.rows[1].error,'RECORDER_FAILED');assert.ok(a.rows.every(r=>r.exclusions.includes('recorded_error')));assert.match(renderMarkdown(a),/Response failed/);
});

test('recorded success cannot replace an actual call, and independently computed export mismatch is retained',()=>{
 const missing=row({on:true,tools:[],specialistExecution:{succeeded:1,calls:[{succeeded:true}]}});const mismatch=row({difficulty:'medium',on:true});mismatch.oracle.artifactProjectionSha256='b'.repeat(64);const a=analyzeReport(report([missing,mismatch]));assert.equal(a.totals.validTimingOutcomes,0);assert.equal(a.rows[0].specialist.calls.length,0);assert.equal(a.rows[0].requirementMatches,false);assert.equal(a.rows[1].specialist.succeeded,1);assert.equal(a.rows[1].exportMatches,false);assert.ok(a.rows[1].exclusions.includes('specialist_export_not_verified'));
});

test('successful task/export checks survive as evidence while pending telemetry or recorder prevents valid timing',()=>{
 const pending=row({on:true,status:'unsettled_telemetry',passed:false});pending.telemetry.pending=1;
 const unfinished=row({difficulty:'medium',tools:[{toolCallId:'write-1',name:'write',status:'in_progress'}]});
 const a=analyzeReport(report([pending,unfinished]));assert.equal(a.totals.taskAndExportChecksPassed,2);assert.equal(a.totals.validTimingOutcomes,0);assert.equal(a.rows[0].endTurnObserved,true);assert.equal(a.rows[0].exportMatches,true);assert.ok(a.rows[0].exclusions.includes('unsettled_provider_telemetry'));assert.ok(a.rows[1].exclusions.includes('unfinished_tool_records'));assert.equal(a.rows[0].recording.pendingProviders,1);
});

test('tool availability, other specialist calls and fixed-off controls are independently checked',()=>{
 const missing=row({on:true});missing.actualToolInventory=missing.actualToolInventory.filter(name=>!name.endsWith('__create_prd'));
 const other=row({difficulty:'medium',tools:[{toolCallId:'other-1',name:'axwise-local__research_market',status:'completed'}]});
 const native=row({difficulty:'complex',tools:[{toolCallId:'native-1',name:'hashline_edit',status:'completed'}]});native.telemetry.jevProviderRequests=[{status:'completed'}];
 const a=analyzeReport(report([missing,other,native]));assert.equal(a.totals.validTimingOutcomes,0);assert.ok(a.rows[0].exclusions.includes('inventory_not_verified'));assert.equal(a.rows[1].specialist.otherCalls.length,1);assert.ok(a.rows[2].exclusions.includes('native_call_while_disabled'));assert.ok(a.rows[2].exclusions.includes('jev_provider_call_while_disabled'));
});

test('only reported stage timings and review evidence are summarized; stage completion is not a critique pass',()=>{
 const tool=prdTool();delete tool.rawOutput.qualityReview;tool.rawOutput.execution.stages.push({stage:'repair',status:'completed',authAndInferenceMs:3000,inferenceMs:2800,authMs:200},{stage:'final_review',status:'completed'});
 const a=analyzeReport(report([row({on:true,tools:[tool]})])),call=a.rows[0].specialist.calls[0],stages=a.totals.specialist.stageSummary;assert.equal(call.qualityReview.status,'unreported');assert.equal(stages.generation.authAndInferenceSeconds.mean,5.1);assert.equal(stages.generation.inferenceSeconds.mean,5);assert.equal(stages.review.authSeconds.mean,.1);assert.equal(stages.repair.authAndInferenceSeconds.mean,3);assert.equal(stages.final_review.authAndInferenceSeconds.mean,null);assert.equal(call.timings.totalMs,7200);assert.equal(call.usage.modelCalls,2);assert.equal(a.totals.specialist.reviewStatuses.unreported,1);assert.match(renderMarkdown(a),/not that the critique passed/);
});

test('final HTTP usage is summed once with primary/title and Axwise sources, unknown coverage and errors separate',()=>{
 const r=row({on:true});const records=[request({prompt_tokens:10,completion_tokens:2,total_tokens:15},{usageSnapshots:[{total_tokens:13},{total_tokens:15}]}),request({prompt_tokens:80,completion_tokens:20,total_tokens:110},{source:'axwise',requestedEffort:'low'}),request(null,{source:'axwise',status:'failed',httpStatus:429,error:'MODEL_HTTP_ERROR',responseModels:[],modelIdentity:'not_generated'})];r.telemetry={modelRequests:records,records,jevRequests:[],jevProviderRequests:[],pending:0};
 const a=analyzeReport(report([r])),m=a.totals.model;assert.equal(m.requests,3);assert.equal(m.usage.totalTokens.reportedSum,125);assert.equal(m.usage.totalTokens.requestsMissing,1);assert.equal(m.bySource.primary.requests,1);assert.equal(m.bySource.axwise.requests,2);assert.equal(m.bySource.axwise.errorCodes.MODEL_HTTP_ERROR,1);assert.equal(m.requestedEfforts.low,1);assert.equal(m.requestedEfforts.unspecified,2);assert.equal(m.requestsWithoutReturnedModel,1);assert.match(renderMarkdown(a),/background title calls/);
});

test('wrong experiment, duplicate rows and changed fixed flags are rejected without silently dropping data',()=>{
 assert.throws(()=>analyzeReport({...report([]),schema:'orqanix.actual-desktop-matrix.v1'}),/INVALID_REPORT_SCHEMA/);assert.throws(()=>analyzeReport(report([row(),row()])),/DUPLICATE_ROW_KEY/);const wrong=row();wrong.flags.jevReviewEnabled=true;assert.throws(()=>analyzeReport(report([wrong])),/INVALID_ROW_IDENTITY/);assert.throws(()=>analyzeReport({...report([]),fingerprint:{repetitions:2}}),/EXPECTED_ONE_PAIR/);
});

test('markdown and CLI retain exclusions, six outcome slots and explicit quality limits without touching input',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'specialist-summary-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const input=join(dir,'report.json'),output=join(dir,'summary'),source=JSON.stringify(report([row({status:'timeout',passed:false,ms:1,response:null})]));await writeFile(input,source);const a=await main([input,output]);const md=await readFile(join(output,'summary.md'),'utf8');assert.equal(JSON.parse(await readFile(join(output,'analysis.json'),'utf8')).cells.length,6);assert.equal(a.totals.validTimingOutcomes,0);assert.equal(await readFile(input,'utf8'),source);assert.match(md,/Do not pool/);assert.match(md,/not semantic quality/);assert.match(md,/not independent verification/);assert.match(md,/one pair per difficulty/i);assert.match(md,/Excluded row/);assert.doesNotMatch(md,/statistically significant|high effort/);await assert.rejects(main([join(output,'analysis.json'),output]),/OVERWRITE_INPUT/);
});
