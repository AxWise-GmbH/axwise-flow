// UI-only browser fixture: the real coding component and current product theme,
// deterministic mock responses, no auth, network connector, cloud or execution.
import { createServer, transformWithEsbuild } from 'vite';

const entry = '/__coding-ui-fixture.jsx';
const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider,CssBaseline,Alert,Box,Typography} from '@mui/material';
import {standartTheme} from '/src/pages/Standart/standartTheme.js';
import SolutionCodingJobs from '/src/pages/GcpWorkspace/SolutionCodingJobs.jsx';
const scenario=new URLSearchParams(location.search).get('scenario') || 'success';
const original='export const total=(a,b)=>a-b;';
const changed='export const total=(a,b)=>a+b;';
let job={id:'synthetic-coding-job',title:'Fix addition and verify the result',status:'proposed',rowVersion:0,specHash:'a'.repeat(64),
  spec:{source:[{path:'src/total.mjs',content:original}],changes:[{path:'src/total.mjs',content:changed}],
  tests:[{path:'tests/total.test.mjs',content:"import assert from 'node:assert/strict';\\nimport {total} from '../src/total.mjs';\\nassert.equal(total(2,3),5);"}],limits:{timeoutMs:30000}}};
if(scenario==='cleanup')job={...job,status:'outcome_unknown',evidence:{cleanup:{status:'pending'},command:{exitCode:null},log:'Synthetic fixture: no real command was dispatched.'}};
if(scenario==='error')job={...job,status:'approved',rowVersion:1};
window.__codingUiCalls=[];
const record=(method,args)=>window.__codingUiCalls.push({method,args});
const client={
 listSolutionCodingJobs:async()=>({jobs:[structuredClone(job)]}),
 readSolutionCodingJob:async()=>({job:structuredClone(job)}),
 approveSolutionCodingJob:async(...args)=>{record('approve',args);job={...job,status:'approved',rowVersion:1};return{job};},
 runSolutionCodingJob:async(...args)=>{record('run',args);if(scenario==='error')throw new Error('Synthetic internal error must not be displayed');
   job={...job,status:'queued',rowVersion:2,orchestration:{status:'accepted',evidence:{executionId:'synthetic-n8n-1'}}};
   setTimeout(()=>{job={...job,status:'succeeded',rowVersion:3,evidence:{cleanup:{status:'removed'},command:{exitCode:0},log:'SYNTHETIC UI RESPONSE ONLY — no command executed.\\nMock assertion: total(2,3) equals 5.'},artifacts:[{path:'src/total.mjs',content:changed,hash:'b'.repeat(64),bytes:changed.length}]};},1200);
   return{job};},
 cancelSolutionCodingJob:async(...args)=>{record('cancel',args);job={...job,status:'cancelled',rowVersion:job.rowVersion+1};return{job};},
 reconcileSolutionCodingJob:async(...args)=>{record('reconcile',args);job={...job,rowVersion:job.rowVersion+1,evidence:{...job.evidence,cleanup:{status:'removed'}}};return{job};}
};
createRoot(document.getElementById('root')).render(<ThemeProvider theme={standartTheme}><CssBaseline/>
 <Alert severity="warning">SYNTHETIC UI ONLY — no cloud, credentials, n8n task or code execution is connected.</Alert>
 <Box component="main" sx={{maxWidth:1080,mx:'auto',p:{xs:2,sm:3}}}>
 <Typography variant="h5" component="h1" sx={{mb:2}}>Coding controls · local visual check</Typography>
 <SolutionCodingJobs client={client} solution={{id:'synthetic-solution'}} runId="synthetic-run"/>
 </Box></ThemeProvider>);
`;
const server = await createServer({
  configFile: false,
  envDir: false,
  root: process.cwd(),
  mode: 'gcp-launch',
  esbuild: { jsx: 'automatic' },
  cacheDir: '/private/tmp/orqaly-coding-ui-cache',
  optimizeDeps: { entries: [] },
  server: { host: '127.0.0.1', port: 15796, strictPort: true, cors: false },
  plugins: [
    {
      name: 'synthetic-coding-ui-only',
      resolveId: (id) => (id === entry ? '\0' + entry : undefined),
      load: async (id) =>
        id === '\0' + entry
          ? (await transformWithEsbuild(source, entry, { loader: 'jsx', jsx: 'automatic' })).code
          : undefined,
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.split('?')[0] !== '/__coding-smoke') return next();
          res.setHeader('content-type', 'text/html');
          res.end(
            await server.transformIndexHtml(
              req.url,
            '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Orqaly coding controls — synthetic UI only</title></head><body><div id="root"></div><script>window.__consoleErrors=[];window.addEventListener("error",event=>window.__consoleErrors.push(event.message));window.addEventListener("unhandledrejection",event=>window.__consoleErrors.push(String(event.reason)));</script><script type="module" src="' +
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
console.log('SYNTHETIC UI ONLY: http://127.0.0.1:15796/__coding-smoke');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
