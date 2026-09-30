#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {plan} from './benchmark-orqanix-efficiency.mjs';
import {terminationReason} from './lib/orqanix-efficiency-outcome.mjs';
const [input,output]=process.argv.slice(2);
if(!input?.startsWith('/')||!output?.startsWith('/'))throw Error('ABSOLUTE_PATHS_REQUIRED');
const bytes=await readFile(input),report=JSON.parse(bytes),rows=report.rows;
const sha=v=>createHash('sha256').update(v).digest('hex');
const native=['ast_search','lsp_query','hashline_edit','safe_edit_and_test'];
const hashes=JSON.parse(await readFile(new URL('../review-evidence/2026-09-29/native-efficiency/backend/source-hashes.json',import.meta.url),'utf8'));
const sourceChecks=[];for(const [path,expected]of Object.entries(hashes))sourceChecks.push({path,match:sha(await readFile(new URL('../'+path,import.meta.url)))===expected});
const rowChecks=rows.map(row=>{
 const models=row.telemetry?.modelRequests||[],toolRequests=models.filter(m=>m.toolNames?.length);
 return {key:row.key,status:row.status,passed:row.passed===true,terminationReason:terminationReason(row),completedCleanly:terminationReason(row)==='terminal_response',capabilityDenials:row.scopedRelay?.denied||0,
  submitted:models.length>0,inventory:row.inventoryMatches===true,
  modelIdentity:models.length>0&&models.every(m=>m.modelIdentity==='verified'&&m.requestedModel==='gemini-3.8-flash'&&m.responseModels?.every(x=>x==='gemini-3.8-flash')),
  effort:models.every(m=>m.requestedEffort==null),
  policy:toolRequests.length>0&&toolRequests.every(m=>m.nativeSelectionPolicy===(row.arm==='candidate'?'v2':null)&&m.legacyWritePreferencePresent===(row.arm!=='candidate')),
  nativeInventory:toolRequests.length>0&&toolRequests.every(m=>native.every(n=>m.toolNames.includes(n)===(row.arm!=='default'))),
  boundary:row.boundary?.checks.length===13&&row.boundary.checks.every(x=>x.passed),
  immutable:row.oracle?.immutableFailures.length===0,unexpectedFiles:row.oracle?.unexpectedFiles.length===0,
  settled:row.telemetry?.pending===0,
  modelRequests:models.length,cancelledModelResponses:models.filter(m=>m.status==='cancelled').length,
  rejectedAuthentication:(row.telemetry?.records||[]).filter(m=>m.kind==='identity_http'&&m.httpStatus===401).length,
  nativeCalls:row.tools.filter(t=>native.includes(t?._meta?.goose?.toolCall?.toolName?.split('__').at(-1))).length};
});
const expected=plan().map(r=>r.key).sort(),actual=rows.map(r=>r.key).sort();
const result={schema:'orqanix.backend-efficiency-verification.v1',rawReportSha256:sha(bytes),rows:rows.length,exactPlan:JSON.stringify(expected)===JSON.stringify(actual),sourceChecks,rowChecks,
 elapsedMetric:'ACP prompt submission through terminal response; excludes Electron UI and setup/evaluation.',
 preservedFailures:rowChecks.filter(r=>!r.passed).map(r=>r.key),
 preservedCompletionFailures:rowChecks.filter(r=>!r.completedCleanly).map(r=>r.key),
 note:'Transport cancellations are retained separately from ACP task completion. Independent correctness is not inferred from tool receipts or model-written tests alone.'};
const invariantKeys=['submitted','inventory','modelIdentity','effort','policy','nativeInventory','boundary','immutable','unexpectedFiles','settled'];
result.verificationPassed=result.exactPlan&&sourceChecks.every(x=>x.match)&&rowChecks.every(r=>invariantKeys.every(k=>r[k]===true));
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({rows:result.rows,exactPlan:result.exactPlan,sourcesMatch:sourceChecks.every(x=>x.match),verificationPassed:result.verificationPassed,rowChecks},null,2));
if(!result.verificationPassed)process.exitCode=1;
