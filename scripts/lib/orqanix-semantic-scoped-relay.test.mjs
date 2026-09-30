import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {startScopedRelay} from './orqanix-semantic-scoped-relay.mjs';

test('capability is model-only, bounded, revoked, and never returns parent credentials',async()=>{
  const received=[];const upstream=createServer((req,res)=>{received.push({path:req.url,auth:req.headers.authorization});req.resume();res.setHeader('content-type','application/json');res.end('{"ok":true}');});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));let time=0;
  const relay=await startScopedRelay(`http://127.0.0.1:${upstream.address().port}`,{maxCalls:1,now:()=>time});
  const token='synthetic-parent-oauth-for-test-only';
  const call=(cap,path='/desktop/v1/chat/completions',method='POST')=>fetch(relay.url+path,{method,headers:{authorization:`Bearer ${cap}`}});
  try{
    const cap=relay.activate({oauthToken:token,trial:'row1',lifetimeMs:10});assert.ok(!cap.includes(token));
    assert.equal((await call(cap,'/desktop/v1/session','GET')).status,403);assert.equal(received.length,0);
    assert.equal((await call(cap+'x')).status,401);assert.equal(received.length,0);
    const result=await call(cap);assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true});assert.equal(received[0].auth,`Bearer ${token}`);
    assert.equal((await call(cap)).status,429);assert.equal(received.length,1);
    const next=relay.activate({oauthToken:token,trial:'row2',lifetimeMs:10});assert.equal((await call(cap)).status,401);
    time=10;assert.equal((await call(next)).status,401);
    const last=relay.activate({oauthToken:token,trial:'row3'});relay.deactivate();assert.equal((await call(last)).status,401);
    assert.ok(!JSON.stringify(relay.snapshot()).includes(token));assert.ok(!JSON.stringify(relay.snapshot()).includes(cap));
    const ordinary=await call('ordinary-desktop-oauth','/desktop/v1/session','GET');assert.equal(ordinary.status,200);assert.equal(received.at(-1).auth,'Bearer ordinary-desktop-oauth');
  }finally{await relay.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
});


test('parent can refresh OAuth without exposing it or repeating a model request',async()=>{
  const received=[];const upstream=createServer((req,res)=>{received.push(req.headers.authorization);req.resume();res.end('ok');});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const relay=await startScopedRelay(`http://127.0.0.1:${upstream.address().port}`);
  let calls=0,fail=false;
  const initial='synthetic-parent-initial-token';
  const cap=relay.activate({oauthToken:initial,trial:'refresh',resolveOAuthToken:async()=>{calls++;if(fail)throw Error(initial);return `synthetic-parent-refreshed-token-${calls}`;}});
  const post=()=>fetch(relay.url+'/desktop/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${cap}`}});
  try {
    assert.equal((await fetch(relay.url+'/desktop/v1/session',{headers:{authorization:`Bearer ${cap}`}})).status,403);
    assert.equal(calls,0);
    for(let i=0;i<2;i++)assert.equal((await post()).status,200);
    assert.deepEqual(received,['Bearer synthetic-parent-refreshed-token-1','Bearer synthetic-parent-refreshed-token-2']);
    fail=true;const result=await post();assert.equal(result.status,503);assert.ok(!(await result.text()).includes(initial));
    assert.equal(received.length,2);
  } finally {await relay.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
});
