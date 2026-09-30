#!/usr/bin/env node
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareFixture,evaluate,expectedSolution,DIFFICULTIES} from './lib/orqanix-selection-tasks.mjs';
import {preflight} from './lib/orqanix-selection-sandbox.mjs';

const [appBundle,output]=process.argv.slice(2);
if(!appBundle?.startsWith('/')||!output?.startsWith('/'))throw Error('ABSOLUTE_APP_AND_OUTPUT_REQUIRED');
const runtime=join(appBundle,'Contents/Resources/orqaly-runtime'),results=[];
const regressions={
  simple:"import {lineTotal} from '../src/pricing.ts';test('zero',()=>assert.equal(lineTotal(2,0),0));",
  medium:"import {makeRouter} from '../src/app.ts';test('forward',async()=>{let n=0;await makeRouter().routes[0].handler({id:'x',fail:true},{send:v=>v},()=>n++);assert.equal(n,1);});",
  complex:"import {createContext} from '../src/context-factory.ts';test('rename',()=>assert.deepEqual(createContext('a','u'),{traceId:'a',userId:'u'}));",
};
for(const difficulty of DIFFICULTIES){
  const dir=join(output,difficulty),fixture=await prepareFixture(join(dir,'fixture'),difficulty,runtime);
  const profile=join(dir,'profile'),tmp=join(dir,'tmp');for(const p of [profile,tmp])await mkdir(p,{mode:0o700});
  const boundary=await preflight({appBundle,profile,tmp,workspace:fixture.workspace});
  const boundaryFile=join(dir,'boundary.sb');await writeFile(boundaryFile,boundary.profile,{mode:0o600});
  const broken=await evaluate(fixture,runtime,boundaryFile,{mutation:false});
  for(const [name,text]of Object.entries(expectedSolution(difficulty)))await writeFile(join(fixture.workspace,name),text);
  await writeFile(join(fixture.workspace,'tests/regression.test.mjs'),"import assert from 'node:assert/strict';import {test} from 'node:test';\n"+regressions[difficulty]+'\n');
  const fixed=await evaluate(fixture,runtime,boundaryFile);
  const row={difficulty,boundaryChecks:boundary.checks,broken,fixed,passed:!broken.behavior.passed&&fixed.passed&&fixed.originalMutation?.detected===true};results.push(row);
  await writeFile(join(output,'calibration.json'),JSON.stringify({results},null,2),{mode:0o600});
  console.log(JSON.stringify({difficulty,passed:row.passed,brokenPassed:broken.behavior.passed,fixedPassed:fixed.passed,mutantDetected:fixed.originalMutation?.detected,failures:fixed.behavior.checks?.filter(x=>!x.passed),typeError:fixed.types.passed?null:fixed.types.stdout}));
}
const fingerprints={};for(const name of ['lib/orqanix-selection-tasks.mjs','lib/orqanix-selection-sandbox.mjs'])fingerprints[name]=createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex');
await writeFile(join(output,'calibration.json'),JSON.stringify({fingerprints,passed:results.every(r=>r.passed),results},null,2),{mode:0o600});
if(results.some(r=>!r.passed))process.exitCode=1;
