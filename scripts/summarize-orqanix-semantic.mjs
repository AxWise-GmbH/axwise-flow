#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
const [reportPath]=process.argv.slice(2);
const report=JSON.parse(await readFile(reportPath,'utf8'));
const median=xs=>{const ys=[...xs].sort((a,b)=>a-b);return ys.length%2?ys[(ys.length-1)/2]:(ys[ys.length/2-1]+ys[ys.length/2])/2;};
const rows=report.rows.map(r=>{
 const tools={};for(const t of r.tools||[]){const n=t._meta?.goose?.toolCall?.toolName||t.title;tools[n]=(tools[n]||0)+1;}
 const requests=r.telemetry?.modelRequests||[];
 return {key:r.key,task:r.difficulty,arm:r.arm,seconds:r.elapsedMs/1000,passed:r.passed===true,status:r.status,termination:r.termination,tools,semantic:r.semanticToolsUsed||[],requests:requests.length,
  verified:requests.length>0&&requests.every(m=>m.httpStatus===200&&m.modelIdentity==='verified'&&m.requestedModel==='gemini-3.8-flash'&&m.responseModels?.every(x=>x==='gemini-3.8-flash')&&m.usage),
  tokens:requests.reduce((a,m)=>a+(m.usage?.prompt_tokens||0),0),maxResponseSeconds:Math.max(0,...requests.map(m=>m.elapsedMs||0))/1000,
  transportStatuses:requests.reduce((a,m)=>(a[m.status]=(a[m.status]||0)+1,a),{}),toolErrors:(r.tools||[]).filter(t=>t.status==='failed').map(t=>t._meta?.goose?.toolCall?.toolName||t.title)};
});
const arms=Object.fromEntries(['default','candidate'].map(arm=>{const rs=rows.filter(r=>r.arm===arm);return [arm,{count:rs.length,passed:rs.filter(r=>r.passed).length,totalSeconds:rs.reduce((a,r)=>a+r.seconds,0),medianSeconds:median(rs.map(r=>r.seconds)),requests:rs.reduce((a,r)=>a+r.requests,0),inputTokens:rs.reduce((a,r)=>a+r.tokens,0)}];}));
const tasks=Object.fromEntries(['control','ast','lsp'].map(task=>{const result={};for(const arm of ['default','candidate'])result[arm]=median(rows.filter(r=>r.task===task&&r.arm===arm).map(r=>r.seconds));result.candidateTimeChangePercent=(result.candidate/result.default-1)*100;return [task,result];}));
const adoption=Object.fromEntries(['ast','lsp'].map(task=>[task,rows.filter(r=>r.task===task&&r.arm==='candidate').map(r=>({key:r.key,selected:r.semantic.some(n=>n.includes(task==='ast'?'ast_search':'lsp_query'))}))]));
const verification={rows:rows.length===12,quality:rows.filter(r=>r.arm==='candidate').length===6&&rows.filter(r=>r.arm==='candidate').every(r=>r.passed),modelIdentityAndUsage:rows.every(r=>r.verified),semanticAdoption:Object.values(adoption).flat().length===4&&Object.values(adoption).flat().every(r=>r.selected),totalNoSlower:arms.candidate.totalSeconds<=arms.default.totalSeconds,medianNoSlower:arms.candidate.medianSeconds<=arms.default.medianSeconds,controlNoSlower:tasks.control.candidate<=tasks.control.default};
const summary={schema:'orqanix.semantic-v3.summary.v1',reportSha256:createHash('sha256').update(await readFile(reportPath)).digest('hex'),verification,accepted:Object.values(verification).every(Boolean),arms,tasks,adoption,rows,limitation:'Two repeats per task/arm. Exploratory actual desktop comparison; no statistical or universal guarantee.'};
await writeFile(join(dirname(reportPath),'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
