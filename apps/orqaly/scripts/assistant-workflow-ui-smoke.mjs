// Synthetic browser fixture of the REAL AssistantSurface, AssistantComposer,
// SolutionDetailWorkspace and WorkflowBuildWorkspace. Only auth/API/native n8n
// are replaced. This is not a model, DB, server API or execution acceptance test.
import { createServer, transformWithEsbuild } from 'vite';

const entry = '/__assistant-workflow-fixture.jsx';
const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {ThemeProvider,CssBaseline,Alert,Box} from '@mui/material';
import {standartTheme} from '/src/pages/Standart/standartTheme.js';
import {AssistantSurface} from '/src/pages/WorkflowV2/AssistantSurface.jsx';
import {WorkflowBuildWorkspace} from '/src/pages/GcpWorkspace/WorkflowBuildPage.jsx';

const threadId='10000000-0000-4000-8000-000000000001';
const runId='20000000-0000-4000-8000-000000000001';
const agentId='30000000-0000-4000-8000-000000000001';
const id='40000000-0000-4000-8000-000000000001';
const buildId='50000000-0000-4000-8000-000000000001';
const draftId='60000000-0000-4000-8000-000000000001';
const messageId='70000000-0000-4000-8000-000000000001';
const newBuildId='80000000-0000-4000-8000-000000000001';
const spec={kind:'n8n_workflow_v2',name:'Check and route incoming orders',requirements:[{id:'route',description:'Normalize the customer name, accept orders at or above 100, and reject lower amounts with a clear response.'}],inputSchema:{type:'object',properties:{customer:{type:'string'},amount:{type:'number'}},required:['customer','amount']},outputSchema:{type:'object',properties:{customer:{type:'string'},accepted:{type:'boolean'}}},connections:[],acceptanceCases:[{id:'valid-order',description:'Accept a valid order',requirementIds:['route'],input:{customer:' Ada ',amount:150},expectedOutput:{customer:'Ada',accepted:true},assertions:[]}],runtimeProfile:'request_automation'};
const workflow={nodes:[{id:'receive',name:'Receive order',type:'n8n-nodes-base.webhook'},{id:'normalize',name:'Normalize customer',type:'n8n-nodes-base.set'},{id:'branch',name:'Check amount',type:'n8n-nodes-base.if'},{id:'accept',name:'Accept order',type:'n8n-nodes-base.respondToWebhook'},{id:'reject',name:'Reject order',type:'n8n-nodes-base.respondToWebhook'}],connections:{}};
const solution={id,agentId,name:spec.name,purpose:'Turn incoming order data into a clear accepted or rejected result.',agent:{name:'Operations Agent'},version:1,rowVersion:1,status:'active',spec,workflow,workflowHash:'a'.repeat(64),deployment:{workflowId:id},testedAt:'2026-09-06T08:00:00Z',buildRequestId:buildId,creationMethod:'axwise_designed_native_reviewed',environment:{name:'SYNTHETIC isolated environment',region:'UI only',isolation:'No runtime connected',capacity:'No execution'}};
const baseBuild={id:buildId,runId,agentId,rowVersion:3,status:'completed',solutionId:id,name:solution.name,instruction:'Create a workflow to validate and route orders.',source:{runId,threadId,turnId:messageId},spec,workflow,workflowHash:solution.workflowHash};
let revisions=[],turns=[{id:'71000000-0000-4000-8000-000000000001',mode:'ask',message:'How will this workflow handle a valid order?',status:'completed',baseWorkflowHash:solution.workflowHash,reply:{markdown:'It normalizes the customer name, checks the amount, and returns an accepted or rejected result. **This is synthetic history for UI verification.**'},createdAt:'2026-09-06T10:05:00Z'}];
let pendingBuild={...baseBuild,id:newBuildId,solutionId:null,status:'needs_input',rowVersion:2,name:'A new order workflow',questions:[{id:'boundary',kind:'information',prompt:'Should orders equal to 100 be accepted?',reason:'This determines the exact boundary.'}],answers:[],agent:{id:agentId,name:'Operations Agent',profileVersion:1},explanation:'Synthetic build fixture: the input boundary needs your choice.',testEligibility:{allowed:false,reason:'Synthetic fixture: runtime is not connected.'}};
const scenario=location.pathname.endsWith('/clarification')?'clarification':location.pathname.endsWith('/existing-draft')?'existing-draft':new URLSearchParams(location.search).get('scenario');
if(scenario==='existing-draft') revisions=[{id:draftId,rowVersion:1,version:2,baseVersion:1,status:'draft',workflowHash:'b'.repeat(64),spec,workflow}];
if(scenario==='clarification') turns=[{id:'72000000-0000-4000-8000-000000000001',mode:'change',message:'Let me choose the threshold boundary.',status:'blocked',errorCode:'WORKFLOW_CONVERSATION_BLOCKED',baseWorkflowHash:solution.workflowHash,targetDraft:null,reply:{markdown:'Before I prepare the draft, I need one preference.'},questions:[{id:'inclusive',prompt:'Should orders equal to 100 be accepted or rejected?'}],createdAt:'2026-09-06T10:05:00Z'}];
if(scenario==='existing-draft') turns.push({id:'72000000-0000-4000-8000-000000000002',mode:'auto',resolvedMode:'change',phase:'needs_input',status:'blocked',message:'Raise the order threshold to 150.',baseWorkflowHash:solution.workflowHash,targetDraft:null,draftSelectionRequired:true,availableDraft:{id:draftId,rowVersion:1,workflowHash:'b'.repeat(64)},reply:{markdown:'There is already a draft. Confirm updating it with your saved request; live v1 stays unchanged.'},createdAt:'2026-09-06T10:06:00Z'});
const messages=[{id:messageId,threadId,turnId:messageId,role:'user',route:'DIRECT_ANSWER',parts:[{type:'text',markdown:'Build an order-routing workflow: clean the customer name, check the amount, and return a clear result.'}],createdAt:'2026-09-06T10:00:00Z'}, {id:'73000000-0000-4000-8000-000000000001',threadId,turnId:messageId,role:'assistant',route:'START_GOAL',workflowRunId:runId,parts:[{type:'text',markdown:'Your workflow is attached to this original task. Open it beside the conversation to ask questions or propose a change.'},{type:'goal_link',runId,label:'Order-routing task',status:'completed'}],createdAt:'2026-09-06T10:00:01Z'}];
const read=()=>({solution:structuredClone(solution),invocations:[{id:'74000000-0000-4000-8000-000000000001',status:'succeeded',mode:'test',executionId:'SYNTHETIC-ONLY',workflowHash:solution.workflowHash,input:{customer:' Ada ',amount:150},output:{customer:'Ada',accepted:true},actor:{kind:'user'},createdAt:'2026-09-06T08:00:00Z'}]});
const conversation=(selectedId)=>({solutionId:id,enabled:true,context:{solutionVersion:1,workflowHash:solution.workflowHash,selectedDraft:revisions.find(r=>r.id===selectedId)?{id:selectedId,rowVersion:1,workflowHash:'b'.repeat(64)}:null,availableDraft:revisions.length?{id:revisions[0].id,rowVersion:1,workflowHash:'b'.repeat(64)}:null},turns:structuredClone(turns),availableInvocations:[{id:'74000000-0000-4000-8000-000000000001',status:'succeeded',mode:'test',workflowHash:solution.workflowHash}],hasMore:false});
window.__workflowUiCalls=[];
const client={
 assistantThreads:async()=>({threads:[{id:threadId,title:'Order-routing task'}]}),assistantThread:async(requested)=>{if(requested!==threadId)throw new Error('Synthetic fixture: unknown thread');return{thread:{id:threadId,title:'Order-routing task'},messages:structuredClone(messages)};},
 assistantSend:async()=>{window.__workflowUiCalls.push({kind:'unexpected-assistant-send'});throw new Error('Ordinary Assistant model dispatch is deliberately not connected in this UI fixture.');},agents:async()=>({agents:[]}),
 read:async()=>({workflow:{run:{id:runId,status:'completed',rowVersion:4,request:'Create an order-routing workflow',evidenceReadiness:'ready',finalArtifact:null},stages:[],attempts:[],dependencies:[],approvals:[]}}),
 solution:async(requested)=>{if(requested!==id)throw new Error('Synthetic fixture: unknown workflow');return read();},solutions:async()=>({solutions:[solution]}),solutionRevisions:async()=>({revisions:structuredClone(revisions)}),solutionBuildRequest:async(requested)=>({buildRequest:structuredClone(requested===newBuildId?pendingBuild:baseBuild)}),
 solutionConversation:async(requested,options)=>{if(requested!==id)throw new Error('Synthetic fixture: unknown workflow conversation');return conversation(options?.draftId);},
 sendSolutionConversationTurn:async(_,command,key)=>{window.__workflowUiCalls.push({kind:'workflow-turn',command,key});turns.push({id:command.turnId,mode:command.mode,message:command.message,status:'queued',reply:null,baseWorkflowHash:solution.workflowHash,targetDraft:command.draft||null,createdAt:new Date().toISOString()});setTimeout(()=>{const turn=turns.find(t=>t.id===command.turnId);turn.status='completed';turn.reply={markdown:command.mode==='ask'?'**Synthetic scoped answer.** No model or runtime was invoked.':'**Synthetic draft prepared.** Review the proposed revision before testing or activation.'};if(command.mode==='change'){turn.draftRevisionId=draftId;revisions=[{id:draftId,rowVersion:1,version:2,baseVersion:1,status:'draft',workflowHash:'b'.repeat(64),spec,workflow}];}},500);return conversation(command.draft?.id);},
 solutionBuildRequests:async(options)=>({buildRequests:options?.runId===runId?[structuredClone(baseBuild)]:[]}),createSolutionBuildRequest:async()=>{throw new Error('Use the separate synthetic build fixture; no real build is created.');},
 answerSolutionBuildRequest:async(_,body)=>{window.__workflowUiCalls.push({kind:'synthetic-build-answer',questionId:body.questionId});pendingBuild={...pendingBuild,rowVersion:3,status:'draft',questions:[],answers:[{questionId:body.questionId,value:body.value}],explanation:'Answer saved in memory for UI-only verification. No model or n8n runtime ran.'};return{buildRequest:structuredClone(pendingBuild)};},
 listSolutionCodingJobs:async()=>({jobs:[]}),solutionSchedules:async()=>({schedules:[],enabled:false}),solutionAppKeys:async()=>({keys:[],policy:{defaultExpiryDays:30,maxExpiryDays:90,maxActiveKeys:5}}),appInvocationEndpoint:()=>'/synthetic-only'
};
window.__workflowUiClient=client;
const isBuild=location.pathname.endsWith('/build')||new URLSearchParams(location.search).get('view')==='build';
const start=isBuild?'/build':'/assistant';
createRoot(document.getElementById('root')).render(<ThemeProvider theme={standartTheme}><CssBaseline/><MemoryRouter initialEntries={[start]}><Box sx={{height:'100dvh',display:'flex',flexDirection:'column'}}><Alert severity="warning" sx={{flexShrink:0,position:'relative',zIndex:5}}>SYNTHETIC UI ONLY — real product components; no auth, model, database, native n8n or cloud execution.</Alert><Box component="main" sx={{maxWidth:1600,mx:'auto',width:'100%',flex:1,minHeight:0,'& > div':{height:'100%'}}}><Routes><Route path="/assistant" element={<AssistantSurface client={client} showThreadRail={false} routeSearch={'?thread='+threadId}/>}/><Route path="/build" element={<WorkflowBuildWorkspace client={client} buildRequestId={newBuildId}/>}/><Route path="/workspace/builds/:id" element={<WorkflowBuildWorkspace client={client} buildRequestId={newBuildId}/>}/><Route path="*" element={<Alert>Synthetic navigation target only.</Alert>}/></Routes></Box></Box></MemoryRouter></ThemeProvider>);
`;

const virtual = {
  '\0assistant-fixture-auth.jsx': `const getToken=async()=>null;export const useAuth=()=>({getToken,userId:'synthetic-owner',orgId:null});`,
  '\0assistant-fixture-api.jsx': `export const createWorkflowV2Client=()=>window.__workflowUiClient;`,
  '\0assistant-fixture-native.jsx': `import React,{useEffect} from 'react';export default function Native({revisionId,mode,onSessionStateChange}){useEffect(()=>{onSessionStateChange?.('ready');},[onSessionStateChange]);return <div aria-label="Native runtime omitted in this synthetic UI fixture" data-revision-id={revisionId||'current'} style={{height:420,display:'grid',placeItems:'center',border:'1px dashed #777',padding:24,textAlign:'center',borderRadius:8}}>Native n8n runtime intentionally omitted.<br/>The surrounding workflow workspace is the real product UI.<br/>{revisionId?'Selected synthetic draft':'Synthetic active workflow'} · {mode||'view'}<br/>No execution or native editor proof is claimed.</div>;}`,
};
const server = await createServer({
  configFile: false,
  envDir: false,
  root: process.cwd(),
  mode: 'gcp-launch',
  esbuild: { jsx: 'automatic' },
  cacheDir: '/private/tmp/orqaly-assistant-workflow-ui-cache',
  optimizeDeps: { entries: [] },
  server: { host: '127.0.0.1', port: 15799, strictPort: true, cors: false },
  plugins: [
    {
      name: 'synthetic-original-assistant-workflow-ui',
      enforce: 'pre',
      resolveId(id) {
        if (id === entry) return '\0' + entry;
        if (id === '@clerk/react') return '\0assistant-fixture-auth.jsx';
        if (id.endsWith('/workflow-v2/api.js')) return '\0assistant-fixture-api.jsx';
        if (id.endsWith('/NativeN8nCanvas.jsx')) return '\0assistant-fixture-native.jsx';
      },
      async load(id) {
        const value = id === '\0' + entry ? source : virtual[id];
        if (value)
          return (await transformWithEsbuild(value, id, { loader: 'jsx', jsx: 'automatic' })).code;
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (
            ![
              '/__assistant-workflow-smoke',
              '/__assistant-workflow-smoke/clarification',
              '/__assistant-workflow-smoke/existing-draft',
              '/__assistant-workflow-smoke/build',
              '/assistant',
            ].includes(req.url?.split('?')[0])
          )
            return next();
          res.setHeader('content-type', 'text/html');
          res.end(
            await vite.transformIndexHtml(
              req.url,
              '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Orqaly original chat + workflow — synthetic UI only</title></head><body><div id="root"></div><script>window.__consoleErrors=[];window.addEventListener("error",e=>window.__consoleErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__consoleErrors.push(String(e.reason)));</script><script type="module" src="' +
                entry +
                '"></script></body></html>'
            )
          );
        });
      },
    },
  ],
});
await server.listen();
console.log('SYNTHETIC UI ONLY: http://127.0.0.1:15799/__assistant-workflow-smoke');
console.log('Separate build fixture: http://127.0.0.1:15799/__assistant-workflow-smoke?view=build');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
