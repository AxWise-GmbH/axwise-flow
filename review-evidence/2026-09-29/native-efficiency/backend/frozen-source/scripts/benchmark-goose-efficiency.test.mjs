import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backendEnvironment,options} from './benchmark-goose-efficiency.mjs';
test('backend environment forwards only local capability and host configuration',()=>{
 const env=backendEnvironment({profile:'/profile',tmp:'/tmp/row',runtime:'/runtime',lsp:{servers:{typescript:['/node','/ls']}},capability:'local-capability',boundary:'/boundary',arm:'candidate'},{HOME:'/user',PATH:'/unsafe',GEMINI_API_KEY:'sensitive',PASSWORD:'sensitive',GOOSE_MAX_TURNS:'24',GOOSE_STATE_MACHINE:'1',ORQALY_LOCAL_TEST_MODE:'true'});
 assert.equal(env.GOOSE_STATE_MACHINE,'0');assert.equal(env.GOOSE_MODE,'auto');assert.equal(env.ORQANIX_BENCHMARK_CAPABILITY,'local-capability');
 for(const key of ['GEMINI_API_KEY','PASSWORD','GOOSE_MAX_TURNS','ORQALY_LOCAL_TEST_MODE'])assert.equal(env[key],undefined);
 assert.ok(!JSON.stringify(env).includes('sensitive'));assert.ok(!env.PATH.includes('/unsafe'));
});
test('backend driver requires an explicit mode and absolute paths',()=>{
 assert.throws(()=>options([]));assert.throws(()=>options(['--live','--preflight','--app','/app','--output','/out']));
 assert.throws(()=>options(['--live','--app','relative','--output','/out']));
 assert.equal(options(['--live','--app','/app','--output','/out']).timeoutSeconds,360);
});
