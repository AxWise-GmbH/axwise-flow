#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
const [reportPath,app,source]=process.argv.slice(2);
const sha=b=>createHash('sha256').update(b).digest('hex');
const report=JSON.parse(await readFile(reportPath,'utf8')),failures=[];
for(const [file,expected] of Object.entries(report.fingerprint)){
 let path;
 if(['app.asar'].includes(file)||file.startsWith('bin/')||file.startsWith('orqaly-runtime/')||file.startsWith('axwise-runtime/'))path=join(app,'Contents/Resources',file);
 else if(file.startsWith('benchmark-')||file.startsWith('lib/'))path=new URL(file,import.meta.url);
 else if(['goose-provider-http.js','desktop-decision-service.js','engineering-review-service.js'].includes(file))path=new URL('../apps/orqaly/server/workflow-v2/'+file,import.meta.url);
 if(path&&sha(await readFile(path))!==expected)failures.push('fingerprint:'+file);
}
const manifest=JSON.parse(await readFile(join(app,'Contents/Resources/bin/orqanix-goose-benchmark-build.json'),'utf8'));
for(const [file,expected] of Object.entries(manifest.rustSources))if(sha(await readFile(join(source,file)))!==expected)failures.push('build_source:'+file);
if(sha(await readFile(join(app,'Contents/Resources/bin/goose-candidate')))!==manifest.binary.sha256)failures.push('candidate_binary');
if(sha(await readFile(join(app,'Contents/Resources/bin/goose-baseline')))!==manifest.binary.sha256)failures.push('same_binary_baseline');
if(report.rows.length!==12||new Set(report.rows.map(r=>r.key)).size!==12)failures.push('twelve_unique_trials');
for(const row of report.rows){
 if(!row.boundary.checks.every(c=>c.passed))failures.push(row.key+':boundary');
 if(row.pendingApprovals.length)failures.push(row.key+':pending_approval');
 if(row.telemetry.pending)failures.push(row.key+':unsettled_telemetry');
 if(row.telemetry.modelRequests.some(m=>m.modelIdentity!=='verified'||m.requestedModel!=='gemini-3.8-flash'||!m.usage))failures.push(row.key+':model_or_usage');
 if(['nativeGemsEnabled','jevReviewEnabled','axwiseLocalEnabled'].some(key=>row.persistedFlags?.[key]!==row.flags[key]))failures.push(row.key+':flags');
 if(!row.inventoryMatches)failures.push(row.key+':inventory');
 if((row.mounts||[]).some(name=>/(?:^|[_\s-])omp(?:[_\s-]|$)|orqanix_engineering/i.test(name))||(row.actualToolInventory||[]).some(name=>/(?:^|[_\s-])omp(?:[_\s-]|$)|orqanix_engineering/i.test(name)))failures.push(row.key+':omp_present');
}
const result={passed:failures.length===0,failures,reportSha256:sha(await readFile(reportPath)),meaning:'Provenance and measurement validation, not a declaration of performance acceptance.'};
await writeFile(join(dirname(reportPath),'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(failures.length)process.exitCode=1;
