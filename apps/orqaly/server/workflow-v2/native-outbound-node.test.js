// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const transport=require('../../infra/n8n/nodes-orqaly-bounded-http/transport.cjs');
const directory=join(dirname(fileURLToPath(import.meta.url)),'../../infra/n8n/nodes-orqaly-bounded-http');
const source=readFileSync(join(directory,'nodes/BoundedHttp.node.js'),'utf8');
function fixture(){const deliver=vi.fn().mockResolvedValue({delivery:'accepted',statusCode:200,diagnosticCode:null,responseBytes:20});
  class NodeOperationError extends Error{constructor(_node,message,{description}){super(message);this.description=description;}}
  const module={exports:{}};
  // Only this checked-in native implementation runs in the test VM; no model
  // expressions or customer source is evaluated by the Orqaly validator.
  runInNewContext(source,{module,require:(name)=>name==='n8n-workflow'?{NodeOperationError}:name==='../transport.cjs'?{...transport,deliver}:JSON.parse(readFileSync(join(directory,'description.json'),'utf8'))});
  const node={id:'delivery',type:'CUSTOM.boundedHttp',typeVersion:1,parameters:{url:'https://receiver.example/v1/events',method:'POST',body:'={{ $json.body }}'}};
  const connectionId='036d7b4e-edc6-4300-b85c-6b5017cfd678';
  const credentials={connectionId,scope:JSON.stringify({credentialType:'orqalyBoundedHttp',targets:[{nodeId:node.id,typeVersion:1,transportVersion:1,destination:node.parameters.url,hostname:'receiver.example',method:'POST',parametersHash:transport.hash(node.parameters)}]}),headerName:'Authorization',headerValue:'Synthetic-secret'};
  const context={getNode:()=>node,getInputData:()=>[{json:{event:'ready'}}],getCredentials:vi.fn().mockResolvedValue(credentials),getNodeParameter:vi.fn().mockReturnValue({event:'ready'})};
  return {execute:()=>module.exports.BoundedHttp.prototype.execute.call(context),deliver,node,credentials,context};
}
describe('actual checked-in native outbound node',()=>{
  it('delivers exactly one item through the bounded transport using its encrypted scope',async()=>{
    const f=fixture();const result=await f.execute();expect(result[0][0]).toMatchObject({json:{delivery:'accepted',connectionId:f.credentials.connectionId},pairedItem:{item:0}});expect(f.deliver).toHaveBeenCalledTimes(1);
    expect(f.deliver).toHaveBeenCalledWith({url:f.node.parameters.url,method:'POST',body:{event:'ready'},headerName:'Authorization',headerValue:'Synthetic-secret'});
  });
  it.each(['multiple-items','retry','continue','node-id','parameters'])('refuses duplicated or altered work before outbound (%s)',async(mode)=>{
    const f=fixture();if(mode==='multiple-items')f.context.getInputData=()=>[{},{}];if(mode==='retry')f.node.retryOnFail=true;if(mode==='continue')f.node.onError='continueRegularOutput';if(mode==='node-id')f.node.id='other';if(mode==='parameters')f.node.parameters.url='https://attacker.example/events';
    await expect(f.execute()).rejects.toThrow('ORQALY_OUTBOUND_NOT_SENT');expect(f.deliver).not.toHaveBeenCalled();
  });
  it('rethrows only the fixed unknown marker, never provider error contents or retries',async()=>{
    const f=fixture();f.deliver.mockRejectedValue(Object.assign(new Error('echo Synthetic-secret'),{delivery:'unknown'}));
    await expect(f.execute()).rejects.toMatchObject({message:'ORQALY_OUTBOUND_RESULT_UNKNOWN',description:'ORQALY_OUTBOUND_RESULT_UNKNOWN'});expect(f.deliver).toHaveBeenCalledTimes(1);
  });
});
