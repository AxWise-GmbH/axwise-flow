// Explicitly synthetic browser fixture of production UI. No authentication,
// model, cloud, n8n, database or customer execution is connected or simulated as real.
import { createServer, transformWithEsbuild } from 'vite';
const entry = '/__workflow-chat-ui.jsx';
const existingDraftReply = [
  '## What happens now',
  'This is a deliberately long **synthetic layout fixture**, not an actual model response. Your workflow currently normalizes a name and an email address. This question has not changed the workflow.',
  '## Proposed improvement',
  'A draft could validate missing email addresses before normalizing contact records. It should return a clear validation result instead of pretending that incomplete data was accepted.',
  '1. Keep the incoming webhook.\n2. Check whether the email field is present.\n3. Normalize valid contact records.\n4. Return a clear result for missing values.',
  '## What stays unchanged',
  'The active workflow remains the same until you review, test and activate a proposed revision. The existing draft is a version of this workflow, not another workflow or another chat. No run payload has been shared for this message.',
  'Use this fixture to verify that the whole response remains readable and the original request can be reused without creating a new conversation.',
].join('\n\n');
const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {ThemeProvider,CssBaseline,Alert,Box,Button} from '@mui/material';
import {standartTheme} from '/src/pages/Standart/standartTheme.js';
import SolutionDetailPage from '/src/pages/GcpWorkspace/SolutionDetailPage.jsx';
import {WorkflowsWorkspace} from '/src/pages/GcpWorkspace/WorkflowsPage.jsx';
import {WorkflowBuildEntry} from '/src/pages/GcpWorkspace/WorkflowBuildEntry.jsx';
const id='10000000-0000-4000-8000-000000000001',runId='10000000-0000-4000-8000-000000000003',agentId='10000000-0000-4000-8000-000000000004';
const spec={kind:'n8n_workflow_v2',name:'Normalize incoming contacts',requirements:[{id:'normalize',description:'Trim names and lowercase email addresses.'}],inputSchema:{type:'object',properties:{name:{type:'string'},email:{type:'string'}},required:['name','email']},outputSchema:{type:'object',properties:{name:{type:'string'},email:{type:'string'}}},connections:[],acceptanceCases:[{id:'contact',description:'Normalize a contact',input:{name:' Ada ',email:'ADA@EXAMPLE.TEST'},expectedOutput:{name:'Ada',email:'ada@example.test'}}]};
const solution={id,agentId,name:spec.name,purpose:'Turn incoming form submissions into consistent contact records.',agent:{name:'Operations Agent'},version:1,rowVersion:1,status:'active',spec,workflow:{nodes:[{id:'webhook',name:'Webhook',type:'n8n-nodes-base.webhook'},{id:'normalize',name:'Normalize contact',type:'n8n-nodes-base.set'}],connections:{}},workflowHash:'a'.repeat(64),deployment:{workflowId:id},testedAt:'2026-09-06T08:00:00Z',buildRequestId:id,environment:{name:'Synthetic isolated preview',region:'europe-west4',isolation:'UI fixture only',capacity:'No live runtime'}};
let revisions=[],turns=[],builds=[];
const scenario=new URLSearchParams(location.search).get('scenario');
if(scenario==='clarification'){
  turns=[{id:'10000000-0000-4000-8000-000000000008',mode:'change',message:'Report missing email addresses.',status:'blocked',errorCode:'WORKFLOW_CONVERSATION_BLOCKED',baseWorkflowHash:solution.workflowHash,targetDraft:null,reply:{markdown:'Before I prepare the draft, I need one preference.'},questions:[{id:'missing-email',prompt:'Should a missing email be rejected, or accepted with a warning?'}]}];
}
if(scenario==='existing-draft'){
  revisions=[{id:'10000000-0000-4000-8000-000000000002',rowVersion:1,version:2,baseVersion:1,status:'draft',workflowHash:'b'.repeat(64),spec,workflow:solution.workflow}];
  turns=[{id:'10000000-0000-4000-8000-000000000008',mode:'ask',message:'Can we change the workflow to report missing email addresses?',status:'completed',reply:{markdown:${JSON.stringify(existingDraftReply)}}}];
}
const read=()=>({solution:structuredClone(solution),invocations:[{id:'synthetic-invocation',status:'succeeded',mode:'test',executionId:'SYNTHETIC-ONLY',workflowHash:solution.workflowHash,input:{name:' Ada ',email:'ADA@EXAMPLE.TEST'},output:{name:'Ada',email:'ada@example.test'},actor:{kind:'user'},createdAt:'2026-09-06T08:00:00Z'}]});
const conversation=(draftId)=>({solutionId:id,enabled:true,context:{solutionVersion:1,workflowHash:solution.workflowHash,selectedDraft:revisions.find(r=>r.id===draftId)?{id:draftId,rowVersion:1,workflowHash:'b'.repeat(64)}:null,availableDraft:revisions.length?{id:revisions[0].id,rowVersion:1,workflowHash:'b'.repeat(64)}:null},turns:structuredClone(turns),availableInvocations:[{id:'10000000-0000-4000-8000-000000000007',status:'succeeded',mode:'test',workflowHash:solution.workflowHash}],hasMore:false});
window.__workflowUiCalls=[];
const client={solution:async()=>read(),solutions:async()=>({solutions:[solution]}),solutionRevisions:async()=>({revisions:structuredClone(revisions)}),solutionBuildRequest:async()=>({buildRequest:{runId,source:{runId,threadId:'synthetic-thread'}}}),solutionConversation:async(_,options)=>conversation(options?.draftId),sendSolutionConversationTurn:async(_,command,key)=>{window.__workflowUiCalls.push({command,key});turns.push({id:command.turnId,mode:command.mode,message:command.message,status:'queued',reply:null});setTimeout(()=>{const t=turns.find(t=>t.id===command.turnId);t.status='completed';t.reply={markdown:command.mode==='ask'?'**Synthetic reply for layout verification.** The real product uses only this workflow and its saved evidence.':'**Synthetic draft prepared.** Review the proposed changes before any real test or activation.'};if(command.mode==='change'){t.draftRevisionId='10000000-0000-4000-8000-000000000002';revisions=[{id:t.draftRevisionId,rowVersion:1,version:2,baseVersion:1,status:'draft',workflowHash:'b'.repeat(64),spec,workflow:solution.workflow}];}},800);return conversation(command.draft?.id);},solutionBuildRequests:async()=>({buildRequests:structuredClone(builds)}),createSolutionBuildRequest:async(body)=>{const build={id:'10000000-0000-4000-8000-000000000009',runId:body.runId,agentId:body.agentId,instruction:body.instruction,status:'designing',rowVersion:0};builds.push(build);return{buildRequest:build};},listSolutionCodingJobs:async()=>({jobs:[]}),solutionSchedules:async()=>({schedules:[],enabled:false}),solutionAppKeys:async()=>({keys:[],policy:{defaultExpiryDays:30,maxExpiryDays:90,maxActiveKeys:5}}),appInvocationEndpoint:()=>'/synthetic-only'};
window.__workflowUiClient=client;
const start=new URLSearchParams(location.search).get('view')==='chat'?'/assistant':new URLSearchParams(location.search).get('view')==='list'?'/workspace/workflows':'/workspace/solutions/'+id;
createRoot(document.getElementById('root')).render(<ThemeProvider theme={standartTheme}><CssBaseline/><MemoryRouter initialEntries={[start]}><Alert severity="warning">SYNTHETIC UI VERIFICATION — no model, authentication, database, n8n or cloud execution connected.</Alert><Box component="main" sx={{maxWidth:1240,mx:'auto',py:3}}><Routes><Route path="/workspace/solutions/:solutionId" element={<SolutionDetailPage/>}/><Route path="/workspace/workflows" element={<WorkflowsWorkspace client={client}/>}/><Route path="/assistant" element={<Box sx={{maxWidth:780,mx:'auto',p:2}}><h1>Chat: normalize incoming contacts</h1><p>Synthetic source task: clean form submissions and return consistent contact records.</p><WorkflowBuildEntry client={client} runId={runId} agentId={agentId} taskLabel="Normalize incoming contacts: trim names and lowercase email addresses."/></Box>}/><Route path="*" element={<p>UI-only navigation target. No workflow was deployed.</p>}/></Routes></Box></MemoryRouter></ThemeProvider>);
`;
const virtual = {
  '\0workflow-chat-auth.jsx': `const getToken=async()=>null;export const useAuth=()=>({getToken,userId:'synthetic-owner',orgId:null});`,
  '\0workflow-chat-api.jsx': `export const createWorkflowV2Client=()=>window.__workflowUiClient;`,
  '\0workflow-chat-native.jsx': `import React from 'react';export default function Native({revisionId}){return <div aria-label="Native runtime omitted in this UI fixture" data-revision-id={revisionId||'current'} style={{height:540,display:'grid',placeItems:'center',border:'1px dashed #666',padding:24,textAlign:'center'}}>Native n8n canvas intentionally omitted.<br/>This verifies the surrounding real product layout only.<br/>{revisionId?'Showing the selected synthetic draft':'Showing the synthetic active workflow'}</div>;}`,
};
const server = await createServer({ configFile: false, envDir: false, root: process.cwd(), mode:'gcp-launch', esbuild:{jsx:'automatic'}, cacheDir:'/private/tmp/orqaly-conversation-ui-cache', optimizeDeps:{entries:[]}, server:{host:'127.0.0.1',port:15798,strictPort:true,cors:false}, plugins:[{
  name:'synthetic-workflow-conversation-ui',enforce:'pre',
  resolveId(id){if(id===entry)return '\0'+entry;if(id==='@clerk/react')return '\0workflow-chat-auth.jsx';if(id.endsWith('/workflow-v2/api.js'))return '\0workflow-chat-api.jsx';if(id.endsWith('/NativeN8nCanvas.jsx'))return '\0workflow-chat-native.jsx';},
  async load(id){const value=id==='\0'+entry?source:virtual[id];if(value)return(await transformWithEsbuild(value,id,{loader:'jsx',jsx:'automatic'})).code;},
  configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__workflow-chat-smoke')return next();res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Orqaly workflow conversation — synthetic UI only</title></head><body><div id="root"></div><script>window.__consoleErrors=[];window.addEventListener("error",e=>window.__consoleErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__consoleErrors.push(String(e.reason)));</script><script type="module" src="'+entry+'"></script></body></html>'));});}
}]});
await server.listen();
console.log('SYNTHETIC UI ONLY: http://127.0.0.1:15798/__workflow-chat-smoke');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
