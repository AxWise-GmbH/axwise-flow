import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan,parseOptions,termination} from './benchmark-orqanix-semantic.mjs';
test('twelve counterbalanced desktop trials hold non-native flags constant',()=>{
 const rows=plan();assert.equal(rows.length,12);assert.equal(new Set(rows.map(r=>r.key)).size,12);
 for(const difficulty of ['control','ast','lsp']){
  const cases=rows.filter(r=>r.difficulty===difficulty);
  assert.deepEqual(cases.map(r=>r.arm),difficulty==='ast'?['candidate','default','default','candidate']:['default','candidate','candidate','default']);
 }
 for(const row of rows){assert.equal(row.flags.nativeGemsEnabled,row.arm==='candidate');assert.equal(row.flags.jevReviewEnabled,false);assert.equal(row.flags.axwiseLocalEnabled,false);}
 assert.throws(()=>plan(1));assert.equal(parseOptions([]).timeoutSeconds,600);
});
test('budget stops and agent errors cannot masquerade as clean completion',()=>{
 const row={status:'completed',transcript:['Done.'],scopedRelay:{denied:0}};
 assert.equal(termination(row),'terminal_response');
 assert.equal(termination({...row,status:'timeout'}),'timeout');
 assert.equal(termination({...row,scopedRelay:{denied:1}}),'model_budget_or_capability_denied');
 assert.equal(termination({...row,transcript:['Reached maximum number of actions']}),'action_budget_exhausted');
 assert.equal(termination({...row,transcript:['Ran into this error: failed']}),'agent_error');
});
