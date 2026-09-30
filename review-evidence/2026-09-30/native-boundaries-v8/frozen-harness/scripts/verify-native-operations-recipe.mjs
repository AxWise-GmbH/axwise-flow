#!/usr/bin/env node
// Receipt-based functional verification; separate from timed desktop measurements.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const [directory]=process.argv.slice(2);
const run=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));
const raw=await readFile(join(directory,'stdout.json'),'utf8');
const output=JSON.parse(raw.slice(raw.indexOf('{\n  "messages"')));
const calls=new Map(),records=[];
for(const message of output.messages||[])for(const item of message.content||[]){
 if(item.type==='toolRequest')calls.set(item.id,item.toolCall?.value);
 if(item.type!=='toolResponse')continue;
 const call=calls.get(item.id),tool=item.toolResult?.value;
 if(!call||!tool)continue;
 let result=tool.structuredContent||tool.structured_content;
 for(const content of tool.content||[])if(!result&&content.type==='text')try{result=JSON.parse(content.text);}catch{}
 records.push({name:call.name,args:call.arguments||{},result});
}
const native=records.filter(r=>['ast_search','lsp_query','hashline_edit','safe_edit_and_test'].includes(r.name));
const has=test=>native.some(test);
const validCheck=result=>result?.verified===true&&result.test?.executed===true&&result.test.exit_code===0&&!result.test.output_error&&!result.test.cancelled&&!result.test.timed_out;
const plans=new Set(native.filter(r=>r.name==='lsp_query'&&r.args.action==='rename'&&r.result?.status==='completed'&&r.result.result?.preview_complete===true).map(r=>r.result.result.plan_id));
const unwantedDiscovery=records.filter(r=>r.name==='shell'&&(/\b(?:find|ls)\b[^\n]*(?:orqanix-.*-app-|Contents\/Resources)/.test(r.args.command||'')||/\bwhich\b[^\n]*(?:pyright|pylsp|typescript-language-server|tsserver)/.test(r.args.command||'')||/\bpython3?\s+--version\b/.test(r.args.command||''))).map(r=>r.args.command);
const checks={
 terminal:run.exit?.code===0&&!run.timedOut,
 model:run.telemetry?.pending===0&&run.telemetry.modelRequests.length>0&&run.telemetry.modelRequests.every(m=>m.httpStatus===200&&m.modelIdentity==='verified'&&m.requestedModel==='gemini-3.8-flash'&&m.usage&&m.responseModels?.every(n=>n==='gemini-3.8-flash')),
 capability:(run.capability||[]).every(r=>r.denied===0),
 astFunctions:has(r=>r.name==='ast_search'&&r.args.preset==='functions'&&r.result?.engine==='tree-sitter'&&r.result.matches?.length>0),
 astCalls:has(r=>r.name==='ast_search'&&r.args.preset==='calls'&&r.result?.engine==='tree-sitter'&&r.result.matches?.length>0),
 ambiguity:has(r=>r.name==='lsp_query'&&r.result?.code==='ambiguous_symbol'),
 qualifiedReferences:has(r=>r.name==='lsp_query'&&r.args.action==='references'&&r.args.symbol?.includes('.')&&r.result?.status==='completed'),
 renamePlan:plans.size>0,
 renameApply:has(r=>r.name==='safe_edit_and_test'&&plans.has(r.args.plan_id)&&validCheck(r.result)),
 batchApply:has(r=>r.name==='safe_edit_and_test'&&r.args.files?.length>=2&&validCheck(r.result)),
 batchRollback:has(r=>r.name==='safe_edit_and_test'&&r.args.files?.length>=2&&r.result?.verified===false&&r.result.rollback?.restored===true&&r.result.rollback.files?.length===r.args.files.length&&r.result.rollback.files.every(f=>f.restored===true)),
 singleRollback:has(r=>r.name==='safe_edit_and_test'&&r.args.path&&r.result?.verified===false&&r.result.rollback?.restored===true),
 staleSingle:has(r=>r.name==='safe_edit_and_test'&&r.args.path&&r.result?.error?.startsWith('STALE_')&&!r.result.test),
 staleBatch:has(r=>r.name==='safe_edit_and_test'&&r.args.files?.length>=2&&r.result?.error?.startsWith('STALE_')&&!r.result.test),
 noHostDiscovery:unwantedDiscovery.length===0,
};
const result={kind:'functional-recipe-not-timed-benchmark',passed:Object.values(checks).every(Boolean),checks,modelRequests:run.telemetry?.modelRequests.length,unwantedDiscovery,nativeReceipts:native.map(r=>({name:r.name,action:r.args.action,plan:Boolean(r.args.plan_id),batch:Boolean(r.args.files),status:r.result?.status,code:r.result?.code,error:r.result?.error,verified:r.result?.verified}))};
await writeFile(join(directory,'verification.json'),JSON.stringify(result,null,2),{mode:0o600});
console.log(JSON.stringify({passed:result.passed,checks,modelRequests:result.modelRequests},null,2));
if(!result.passed)process.exitCode=1;
