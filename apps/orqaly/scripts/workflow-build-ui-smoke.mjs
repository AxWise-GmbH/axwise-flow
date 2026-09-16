// Disposable visual fixture. Uses the REAL production React components/theme,
// synthetic local state, and an explicitly omitted native runtime. Not an API,
// database, AxWise, auth or n8n execution acceptance test. Never used by builds.
import { createServer, transformWithEsbuild } from 'vite';

const fixtureEntry = '/__build-ui-fixture.jsx';
const fixtureModule = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Alert, Box } from '@mui/material';
import { standartTheme } from '/src/pages/Standart/standartTheme.js';
import { WorkflowBuildWorkspace } from '/src/pages/GcpWorkspace/WorkflowBuildPage.jsx';
import { WorkflowBuildEntry } from '/src/pages/GcpWorkspace/WorkflowBuildEntry.jsx';
const id = '3031decc-b21e-48b5-9bd5-3ed3d4dfd024', runId = '4031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const base = {id,runId,instruction:'Build a webhook that trims the name and lowercases the email.',status:'needs_input',rowVersion:2,inputVersion:1,agent:{id:'synthetic-agent',name:'Mara · workflow builder',profileVersion:3},source:{runId,request:'Synthetic source task: understand incoming contact data.'},questions:[{id:'name_output',kind:'information',prompt:'Which output field should receive the normalized name?',reason:'This decides the JSON property your caller receives. The email field is already specified.'}],answers:[],workflow:{nodes:[]},workflowHash:'a'.repeat(64),spec:null,review:null,solutionId:null,explanation:'The webhook topology is drafted. The output name is still missing.'};
let current = JSON.parse(localStorage.getItem('orqaly-synthetic-build-ui-fixture') || 'null') || base;
const persist = () => { localStorage.setItem('orqaly-synthetic-build-ui-fixture',JSON.stringify(current)); return {buildRequest:structuredClone(current)}; };
const client = {
 solutionBuildRequest:async()=>({buildRequest:structuredClone(current)}),
 solutionBuildRequests:async()=>({buildRequests:[structuredClone(current)]}),
 createSolutionBuildRequest:async(body)=>{current={...base,instruction:body.instruction};return persist();},
 answerSolutionBuildRequest:async(_id,body)=>{current={...current,rowVersion:current.rowVersion+1,inputVersion:2,status:'draft',questions:[],answers:[{questionId:body.questionId,value:body.value}],spec:{kind:'webhook_transform_v1',fields:[{source:'name',target:body.value,transform:'trim'},{source:'email',target:'email',transform:'lowercase'}]},explanation:'Synthetic UI fixture: answer saved and candidate supplied. No AxWise operation ran.'};return persist();},
 reviewSolutionBuildRequest:async()=>{current={...current,rowVersion:current.rowVersion+1,status:'reviewed',review:{valid:true,summary:'Synthetic review fixture only. Production validation is tested separately.',issues:[],changes:[{kind:'mapping_added',message:'name → customer_name: trim'},{kind:'mapping_added',message:'email → email: lowercase'}]}};return persist();},
 confirmSolutionBuildRequest:async()=>{current={...current,rowVersion:current.rowVersion+1,status:'completed',solutionId:'synthetic-solution'};return persist();}
};
createRoot(document.getElementById('root')).render(<ThemeProvider theme={standartTheme}><CssBaseline/><MemoryRouter initialEntries={[new URLSearchParams(location.search).has('entry')?'/source':'/build']}><Alert severity="warning" sx={{mb:3}}>SYNTHETIC UI-ONLY VERIFICATION · No auth, AxWise, API, database, native n8n or external action is connected.</Alert><Box sx={{pb:6}}><Routes><Route path="/source" element={<Box sx={{maxWidth:850,mx:'auto',p:2}}><WorkflowBuildEntry client={client} runId={runId} agentId="synthetic-agent" taskLabel="Synthetic source task"/></Box>}/><Route path="/build" element={<WorkflowBuildWorkspace client={client} buildRequestId={id}/>}/><Route path="/workspace/builds/:id" element={<WorkflowBuildWorkspace client={client} buildRequestId={id}/>}/><Route path="*" element={<Alert severity="info">Synthetic navigation target reached. No real Solution was created.</Alert>}/></Routes></Box></MemoryRouter></ThemeProvider>);
`;
const fixturePlugin = {
  name: 'synthetic-workflow-build-ui-smoke',
  enforce: 'pre',
  resolveId(source) {
    if (source === fixtureEntry) return '\0' + fixtureEntry;
    if (source.endsWith('/NativeN8nCanvas.jsx')) return '\0native-ui-only-fixture.jsx';
  },
  async load(id) {
    if (id === '\0' + fixtureEntry)
      return (
        await transformWithEsbuild(fixtureModule, fixtureEntry, { loader: 'jsx', jsx: 'automatic' })
      ).code;
    if (id === '\0native-ui-only-fixture.jsx')
      return (
        await transformWithEsbuild(
          `import React from 'react';export default function NativeFixture(){return <div aria-label="Native runtime omitted in UI-only fixture" style={{height:580,display:'grid',placeItems:'center',padding:24,border:'1px dashed #555',borderRadius:8,color:'#aaa',textAlign:'center'}}>Native runtime intentionally omitted in this visual fixture.<br/>This verifies surrounding production UI layout only.</div>}`,
          id,
          { loader: 'jsx', jsx: 'automatic' }
        )
      ).code;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/__build-ui-smoke')) return next();
      const html = await server.transformIndexHtml(
        req.url,
        '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Orqaly build UI · synthetic visual verification</title></head><body><div id="root"></div><script type="module" src="' +
          fixtureEntry +
          '"></script></body></html>'
      );
      res.setHeader('content-type', 'text/html');
      res.end(html);
    });
  },
};
const server = await createServer({
  mode: 'gcp-launch',
  plugins: [fixturePlugin],
  cacheDir: '/private/tmp/orqaly-build-ui-vite-cache',
  server: { host: '127.0.0.1', port: 15791, strictPort: true },
});
await server.listen();
console.log('Synthetic UI-only fixture: http://127.0.0.1:15791/__build-ui-smoke');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
