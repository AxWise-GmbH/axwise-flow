#!/usr/bin/env node
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const [input,output]=process.argv.slice(2);
if(!input?.startsWith('/')||!output?.startsWith('/'))throw Error('ABSOLUTE_PATHS_REQUIRED');
const raw=await readFile(input),report=JSON.parse(raw),hash=v=>createHash('sha256').update(v).digest('hex');
const counts=values=>Object.fromEntries([...new Set(values)].sort().map(k=>[k,values.filter(v=>v===k).length]));
const sum=values=>values.reduce((a,b)=>a+b,0),mean=values=>values.length?sum(values)/values.length:null;
const median=values=>{const x=[...values].sort((a,b)=>a-b);return x.length?(x[Math.floor((x.length-1)/2)]+x[Math.floor(x.length/2)])/2:null;};
const native=['ast_search','lsp_query','hashline_edit','safe_edit_and_test'];
const cleanName=t=>t?._meta?.goose?.toolCall?.toolName||t.name||'unknown';
function sanitize(value,row){
  if(typeof value==='string')return value.replaceAll(row.workspace,'<workspace>').replaceAll(row.directory,'<row>').replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [REDACTED]').replace(/local-benchmark-v1_[a-f0-9]{64}/g,'[LOCAL_CAPABILITY_REDACTED]');
  if(Array.isArray(value))return value.map(v=>sanitize(v,row));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/thought|signature|authorization|api.?key|access.?token|refresh.?token|accountHash/i.test(k)).map(([k,v])=>[k,sanitize(v,row)]));return value;
}
function tool(t){const name=cleanName(t),short=name.split('__').at(-1),error=['failed','error','cancelled'].includes(t.status)||t.rawOutput?.isError===true||t.rawOutput?.result?.isError===true;return {name,short,native:native.includes(short),action:short==='hashline_edit'?t.rawInput?.action:short==='safe_edit_and_test'?'edit_and_test':t.rawInput?.action||t.rawInput?.operation||null,status:t.status,error,elapsedMs:t.lastAt-t.firstAt};}
const rows=report.rows.map(r=>{
  const tools=(r.tools||[]).map(tool),models=r.telemetry?.modelRequests||[],withTools=models.filter(m=>m.source==='primary'&&m.toolNames?.length);
  const expectedPolicy=r.arm==='candidate'?'v2':null;
  return {key:r.key,arm:r.arm,difficulty:r.difficulty,repeat:r.repeat,status:r.status,terminationReason:(r.transcript||[]).some(t=>t.includes('maximum number of actions'))?'action_budget_exhausted':r.status==='timeout'?'time_budget_exhausted':'terminal_response',passed:r.passed===true,elapsedSeconds:r.elapsedMs/1000,setupSeconds:r.setupMs/1000,firstActivitySeconds:r.firstActivityMs/1000,
    behaviorPassed:r.oracle?.behavior?.passed===true,typecheckPassed:r.oracle?.types?.passed===true,publicTestsPassed:r.oracle?.publicTests?.passed===true,regressionPassed:r.oracle?.regression?.passed===true,regressionDetectedOriginal:r.oracle?.originalMutation?.detected===true,
    behaviorFailures:r.oracle?.behavior?.checks?.filter(x=>!x.passed)||[],immutableFailures:r.oracle?.immutableFailures||[],unexpectedFiles:r.oracle?.unexpectedFiles||[],inventoryMatches:r.inventoryMatches,mounts:r.mounts,
    toolCount:tools.length,toolCounts:counts(tools.map(t=>t.name)),nativeCalls:tools.filter(t=>t.native).length,nativeNames:counts(tools.filter(t=>t.native).map(t=>t.short)),nativeActions:counts(tools.filter(t=>t.native).map(t=>`${t.short}:${t.action||'query'}`)),toolErrors:tools.filter(t=>t.error),tools,
    policy:{requestsWithTools:withTools.length,allMatch:withTools.length>0&&withTools.every(m=>m.nativeSelectionPolicy===expectedPolicy),versions:counts(withTools.map(m=>m.nativeSelectionPolicy||'none')),legacyWritePreferences:counts(withTools.map(m=>String(m.legacyWritePreferencePresent)))},
    model:{requests:models.length,identities:counts(models.map(m=>m.modelIdentity||'unknown')),requested:[...new Set(models.map(m=>m.requestedModel))],returned:[...new Set(models.flatMap(m=>m.responseModels||[]))],efforts:counts(models.map(m=>m.requestedEffort||'unspecified')),statusCounts:counts(models.map(m=>m.status||'unknown')),usageRequests:models.filter(m=>m.usage).length,usage:Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].map(k=>[k,sum(models.filter(m=>Number.isFinite(m.usage?.[k])).map(m=>m.usage[k]))]))},
    pendingTelemetry:r.telemetry?.pending,boundary:r.boundary,confinedAuthVerified:r.confinedAuthVerified,scopedRelay:r.scopedRelay,error:r.error||r.response?.error?.message||null,authenticationRejected:(r.telemetry?.records||[]).some(x=>x.kind==='identity_http'&&x.httpStatus===401)};
});
const arms=Object.fromEntries(['default','previous','candidate'].map(arm=>{const selected=rows.filter(r=>r.arm===arm),tools=selected.flatMap(r=>r.tools);return [arm,{recorded:selected.length,passed:selected.filter(r=>r.passed).length,cleanPasses:selected.filter(r=>r.passed&&r.terminationReason==='terminal_response').length,actionBudgetExhaustions:selected.filter(r=>r.terminationReason==='action_budget_exhausted').length,timeBudgetExhaustions:selected.filter(r=>r.terminationReason==='time_budget_exhausted').length,behaviorPassed:selected.filter(r=>r.behaviorPassed).length,regressionDetectedOriginal:selected.filter(r=>r.regressionDetectedOriginal).length,meanAllSeconds:mean(selected.map(r=>r.elapsedSeconds)),medianAllSeconds:median(selected.map(r=>r.elapsedSeconds)),meanSuccessfulSeconds:mean(selected.filter(r=>r.passed).map(r=>r.elapsedSeconds)),nativeRows:selected.filter(r=>r.nativeCalls>0).length,nativeCalls:tools.filter(t=>t.native).length,nativeNames:counts(tools.filter(t=>t.native).map(t=>t.short)),nativeActions:counts(tools.filter(t=>t.native).map(t=>`${t.short}:${t.action||'query'}`)),toolErrors:tools.filter(t=>t.error).length,toolCounts:counts(tools.map(t=>t.name)),modelRequests:sum(selected.map(r=>r.model.requests)),usage:Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].map(k=>[k,sum(selected.map(r=>r.model.usage[k]))]))}];}));
const pairs=[];
for(const difficulty of ['simple','medium','complex','large'])for(const reference of ['default','previous']){
  const a=rows.find(r=>r.difficulty===difficulty&&r.arm===reference),b=rows.find(r=>r.difficulty===difficulty&&r.arm==='candidate');
  if(a&&b)pairs.push({difficulty,reference,referencePassed:a.passed,candidatePassed:b.passed,referenceSeconds:a.elapsedSeconds,candidateSeconds:b.elapsedSeconds,changePercent:100*(b.elapsedSeconds/a.elapsedSeconds-1),bothPassed:a.passed&&b.passed});
}
const summary={schema:'orqanix.native-efficiency-summary.v1',rawReportSha256:hash(raw),method:report.method,planned:report.schedule.length,recorded:rows.length,arms,pairs,rows,limitations:[
'One run per build/task: exploratory screening, no statistical or general reliability claim.',
'360-second timeout and 60 local model-request limit, normal Goose action default; no per-row retries.',
'All synthetic TypeScript tasks, debug builds, Jev/Axwise off, legacy loop; default/native off, previous and candidate/native on.',
'Candidate combines policy, read batching, post-edit receipts and prior lock fix; causal contributions are not isolated.',
'Failed outcomes are preserved; speed comparisons require matching correct completion.',
'Parent Keychain authentication uses a model-only localhost capability inside the confined backend; production Keychain compatibility is not measured.',
'Provider/cache load uncontrolled. Parent credential refresh during trials included in elapsed time. Setup/evaluation excluded.'
]};

await mkdir(output,{recursive:true});await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const fingerprint={...report.fingerprint};delete fingerprint.accountHash;await writeFile(join(output,'execution-fingerprint.json'),JSON.stringify(fingerprint,null,2)+'\n');
for(const r of report.rows){
  const rowDir=join(output,'rows',r.key);await mkdir(rowDir,{recursive:true});
  await writeFile(join(rowDir,'evidence.json'),JSON.stringify(sanitize({key:r.key,tools:r.tools,transcript:r.transcript,oracle:r.oracle,telemetry:r.telemetry,persistedFlags:r.persistedFlags,mounts:r.mounts},r),null,2)+'\n');
  const visit=async p=>{for(const name of await readdir(p)){const q=join(p,name),st=await lstat(q);if(st.isSymbolicLink())throw Error('SYMLINK_IN_RESULT');if(st.isDirectory()){if(!name.startsWith('.'))await visit(q);}else if(st.isFile()){const dest=join(rowDir,'solution',relative(r.workspace,q));await mkdir(dirname(dest),{recursive:true});await writeFile(dest,await readFile(q));}}};await visit(r.workspace);
}
console.log(JSON.stringify({recorded:rows.length,arms,pairs},null,2));
