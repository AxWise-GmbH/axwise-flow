import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, WireRecorder, parseOptions } from './benchmark-orqanix-matrix.mjs';
test('full factorial design has two reversed repetitions of all 24 cells',()=>{
  const rows=plan();assert.equal(rows.length,48);assert.equal(new Set(rows.map(x=>x.key)).size,48);
  for(const difficulty of ['simple','medium','complex']){
    const a=rows.filter(r=>r.difficulty===difficulty&&r.repeat===1).map(r=>r.flags);
    const b=rows.filter(r=>r.difficulty===difficulty&&r.repeat===2).map(r=>r.flags);
    assert.deepEqual(a,b.reverse());assert.equal(new Set(a.map(JSON.stringify)).size,8);
  }
});
test('wire recorder distinguishes final response from tool results and permission responses',()=>{
  const r=new WireRecorder();r.startedAt=10;
  r.frame('sent',JSON.stringify({id:11,method:'session/prompt',params:{sessionId:'s1'}}),15);
  r.frame('received',JSON.stringify({id:12,method:'session/request_permission',params:{toolCall:{toolCallId:'t1'}}}),20);
  assert.equal(r.pending.size,1);assert.equal(r.response,undefined);
  r.frame('sent',JSON.stringify({id:12,result:{outcome:{outcome:'selected'}}}),25);assert.equal(r.pending.size,0);
  r.frame('received',JSON.stringify({method:'session/update',params:{update:{sessionUpdate:'tool_call',toolCallId:'t1',rawInput:{path:'src/a'},_meta:{goose:{toolCall:{toolName:'write'}}}}}}),30);
  r.frame('received',JSON.stringify({method:'session/update',params:{update:{sessionUpdate:'tool_call_update',toolCallId:'t1',status:'completed',rawOutput:'done',_meta:{goose:{created:123}}}}}),35);
  assert.equal(r.tools.get('t1').rawInput.path,'src/a');assert.equal(r.tools.get('t1').status,'completed');assert.equal(r.response,undefined);
  assert.equal(r.tools.get('t1')._meta.goose.toolCall.toolName,'write');
  r.frame('received',JSON.stringify({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'done'}}}}),40);
  r.frame('received',JSON.stringify({id:11,result:{stopReason:'end_turn'}}),45);
  assert.equal(r.responseAt,45);assert.equal(r.firstOutputAt,40);assert.equal(r.sessionId,'s1');
});
test('invalid options cannot accidentally run live',()=>{
  assert.equal(parseOptions([]).live,false);assert.throws(()=>parseOptions(['--live']),/ABSOLUTE/);
  assert.throws(()=>plan(0));assert.throws(()=>parseOptions(['--timeout-seconds','Infinity']),/INVALID_TIMEOUT/);
});
