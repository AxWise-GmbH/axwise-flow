import{test}from'node:test';
import assert from'node:assert/strict';
import{terminationReason}from'./orqanix-efficiency-outcome.mjs';

test('ACP end_turn and a correct solution do not hide exhausted model budget',()=>{
  assert.equal(terminationReason({status:'completed',passed:true,response:{result:{stopReason:'end_turn'}},scopedRelay:{calls:60,denied:4},transcript:['Ran into this error: Rate limit exceeded: .\nPlease retry.']}),'model_budget_exhausted');
});
test('reaching the request count alone does not imply exhaustion',()=>{
  assert.equal(terminationReason({status:'completed',passed:true,response:{result:{stopReason:'end_turn'}},scopedRelay:{calls:60,denied:0},transcript:['Completed; tests passed.']}),'terminal_response');
});
test('terminal errors and timeouts remain distinct from normal completion',()=>{
  assert.equal(terminationReason({status:'completed',transcript:['Ran into this error: connection closed']}),'agent_error');
  assert.equal(terminationReason({status:'timeout',transcript:[]}),'time_budget_exhausted');
});
