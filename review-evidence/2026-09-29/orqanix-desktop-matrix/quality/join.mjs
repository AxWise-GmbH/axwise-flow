import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root='/private/tmp/orqanix-quality-audit-20260929';
const sha=text=>createHash('sha256').update(text).digest('hex');
const reportText=await readFile('/private/tmp/orqanix-matrix-autonomous-20260929/report.json','utf8');
const report=JSON.parse(reportText), audit=JSON.parse(await readFile(join(root,'supplemental-code-quality.json'),'utf8'));
const mapping=JSON.parse(await readFile(join(root,'private-mapping.json'),'utf8'));
if(report.rows.length!==48||audit.rows.length!==48||audit.sourceReportSha256!==sha(reportText)||Object.keys(mapping).length!==48)throw Error('INCOMPLETE_OR_MISMATCHED_INPUT');
const reviews=[], reviewFiles={};
for(const name of (await readdir(join(root,'reviews'))).filter(name=>/^batch-\d+\.json$/.test(name)).sort()){
  const raw=await readFile(join(root,'reviews',name),'utf8'), parsed=JSON.parse(raw);
  if(!Array.isArray(parsed))throw Error('REVIEW_ARRAY_REQUIRED');
  reviews.push(...parsed);reviewFiles[name]=sha(raw);
}
if(reviews.length!==48||new Set(reviews.map(r=>r.bundle_id)).size!==48)throw Error('REVIEWS_NOT_COMPLETE');
const reviewById=new Map(reviews.map(r=>[r.bundle_id,r])),auditByKey=new Map(audit.rows.map(r=>[r.key,r]));
const rows=report.rows.map(row=>{
  const review=reviewById.get(mapping[row.key]?.bundle_id),quality=auditByKey.get(row.key);
  if(!review||review.difficulty!==row.difficulty||!quality)throw Error('MAPPING_MISMATCH');
  const checks=quality.quality.checks||[];
  return {key:row.key,difficulty:row.difficulty,repeat:row.repeat,flags:row.flags,originalStatus:row.status,
    originalCodePassed:row.oracle?.code?.passed===true,originalDocumentStructurePassed:row.oracle?.documents?.passed===true,
    supplementalCodePassed:quality.quality.passed===true,supplementalCases:checks.length,
    supplementalFailures:checks.filter(c=>!c.passed),executionError:quality.quality.executionError??null,
    workspaceScope:quality.workspaceScope,semanticReview:review};
});
const flags=mask=>({jevReviewEnabled:!!(mask&4),nativeGemsEnabled:!!(mask&2),axwiseLocalEnabled:!!(mask&1)});
const combo=f=>`j${+f.jevReviewEnabled}n${+f.nativeGemsEnabled}a${+f.axwiseLocalEnabled}`;
const dimensions=Object.keys(reviews[0].dimensions);
const aggregate=selected=>({rows:selected.length,originalCodePassed:selected.filter(r=>r.originalCodePassed).length,
  originalDocumentStructurePassed:selected.filter(r=>r.originalDocumentStructurePassed).length,
  supplementalCodePassed:selected.filter(r=>r.supplementalCodePassed).length,
  supplementalCaseChecks:selected.reduce((n,r)=>n+r.supplementalCases,0),
  supplementalFailedCaseChecks:selected.reduce((n,r)=>n+r.supplementalFailures.length,0),
  workspaceScopePassed:selected.filter(r=>r.workspaceScope.passed).length,
  semanticMajorDefects:selected.reduce((n,r)=>n+r.semanticReview.defects.filter(d=>d.severity==='major').length,0),
  semanticMinorDefects:selected.reduce((n,r)=>n+r.semanticReview.defects.filter(d=>d.severity==='minor').length,0),
  semanticRowsWithDefects:selected.filter(r=>r.semanticReview.defects.length).length,
  dimensions:Object.fromEntries(dimensions.map(d=>[d,{scores:([0,1,2,null]).map(s=>({score:s,count:selected.filter(r=>r.semanticReview.dimensions[d].score===s).length}))}]))});
const result={schema:'orqanix.supplemental-quality-comparison.v1',joinedAt:new Date().toISOString(),sourceReportSha256:sha(reportText),
  reviewFreeze:{files:reviewFiles,rule:'All 48 reviews saved before this mapping join. AI semantic review; configuration/timing/tool names and original machine outcomes withheld. Test receipts withheld: null honesty scores do not mean dishonesty.'},
  interpretation:'Supplemental code protocol was designed after the original matrix began, before inspecting generated implementations. Original checks remain unchanged. Cases are correlated behavioral checks, not independent reliability trials. Blinded semantic judgments are separate from executable code outcomes. All recorded rows remain in quality comparison, including timing exclusions.',
  totals:aggregate(rows),byDifficulty:Object.fromEntries(['simple','medium','complex'].map(d=>[d,aggregate(rows.filter(r=>r.difficulty===d))])),
  byFlags:Array.from({length:8},(_,mask)=>{const f=flags(mask),selected=rows.filter(r=>combo(r.flags)===combo(f));return {combination:combo(f),flags:f,...aggregate(selected),byDifficulty:Object.fromEntries(['simple','medium','complex'].map(d=>[d,aggregate(selected.filter(r=>r.difficulty===d))]))};}),rows};
await writeFile(join(root,'comparison.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({totals:result.totals,byDifficulty:result.byDifficulty}));
