import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan,parseOptions} from './benchmark-orqanix-efficiency.mjs';
test('fixed screening schedule compares three arms on exactly four matched tasks',()=>{
 const rows=plan();assert.equal(rows.length,12);assert.equal(new Set(rows.map(r=>r.key)).size,12);
 for(const arm of ['default','previous','candidate'])assert.deepEqual(rows.filter(r=>r.arm===arm).map(r=>r.difficulty),['simple','medium','complex','large']);
 for(const row of rows){assert.equal(row.flags.nativeGemsEnabled,row.arm!=='default');assert.equal(row.flags.jevReviewEnabled,false);assert.equal(row.flags.axwiseLocalEnabled,false);}
 assert.throws(()=>plan(2));assert.equal(parseOptions([]).timeoutSeconds,360);
});
