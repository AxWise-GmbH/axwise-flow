// Disposable UI-only fixture for the REAL production app-access component/theme.
// Synthetic metadata only may persist locally. Synthetic one-time key material
// never enters storage. No auth, API, database, n8n or provider is connected.
import { createServer, transformWithEsbuild } from 'vite';

const entry = '/__app-access-ui-fixture.jsx';
const source = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ThemeProvider,CssBaseline,Alert,Box,Button,Stack,Typography} from '@mui/material';
import {standartTheme} from '/src/pages/Standart/standartTheme.js';
import SolutionAppAccess from '/src/pages/GcpWorkspace/SolutionAppAccess.jsx';
const policy={defaultExpiryDays:30,maxExpiryDays:90,maxActiveKeys:5,requestsPerMinute:60,requestsPerDay:1000,maxConcurrentInvocations:1};
const storageKey='orqaly-synthetic-app-access-metadata';
const read=()=>JSON.parse(localStorage.getItem(storageKey)||'{}');
const write=(id,keys)=>localStorage.setItem(storageKey,JSON.stringify({...read(),[id]:keys}));
let failRead=false;
const client={
 solutionAppKeys:async(id)=>{if(failRead){failRead=false;throw new Error('Synthetic refresh failure');}return {keys:read()[id]||[],policy};},
 createSolutionAppKey:async(solution,command)=>{const key={id:crypto.randomUUID(),label:command.label,prefix:'orqaly_app_00000001',status:'active',workflowHash:solution.workflowHash,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+command.expiresInDays*86400000).toISOString(),lastUsedAt:null,revokedAt:null,rowVersion:0};write(solution.id,[key,...(read()[solution.id]||[])]);return {key,token:'SYNTHETIC_UI_ONLY_NOT_A_REAL_KEY_'+crypto.randomUUID()};},
 revokeSolutionAppKey:async(id,selected)=>{const key={...selected,status:'revoked',rowVersion:selected.rowVersion+1};write(id,(read()[id]||[]).map(value=>value.id===key.id?key:value));return {key};},
 appInvocationEndpoint:(id)=>'https://api.example.invalid/invoke/v1/solutions/'+id,
};
function App(){const [id,setId]=useState('synthetic-solution-one');const [paused,setPaused]=useState(false);return <ThemeProvider theme={standartTheme}><CssBaseline/><MemoryRouter><Alert severity="warning" sx={{mb:3}}>SYNTHETIC UI-ONLY VERIFICATION · No auth, API, database, real access key, native n8n or external action is connected.</Alert><Box sx={{maxWidth:1120,mx:'auto',px:{xs:2,sm:3},pb:5}}><Stack gap={2}><Typography component="h1" variant="h4">Solution → Test &amp; use</Typography><Stack direction="row" gap={1} flexWrap="wrap"><Button onClick={()=>{failRead=true}}>Simulate next refresh failure</Button><Button onClick={()=>setPaused(value=>!value)}>Toggle synthetic pause</Button><Button onClick={()=>setId(value=>value==='synthetic-solution-one'?'synthetic-solution-two':'synthetic-solution-one')}>Switch synthetic Solution</Button></Stack><SolutionAppAccess client={client} solution={{id,name:'Webhook example',version:3,rowVersion:7,workflowHash:'a'.repeat(64),status:paused?'paused':'active',testedAt:'2026-09-05T18:00:00Z',deployment:{workflowId:'synthetic-provider-workflow'}}} example={{name:' Ada ',email:'ADA@EXAMPLE.COM'}} onRefreshSolution={async()=>{}}/></Stack></Box></MemoryRouter></ThemeProvider>}
createRoot(document.getElementById('root')).render(<App/>);
`;
const plugin = {
  name: 'synthetic-solution-app-access-ui-smoke',
  enforce: 'pre',
  resolveId(id) {
    if (id === entry) return '\0' + entry;
  },
  async load(id) {
    if (id === '\0' + entry)
      return (await transformWithEsbuild(source, entry, { loader: 'jsx', jsx: 'automatic' })).code;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/__app-access-ui-smoke')) return next();
      const html = await server.transformIndexHtml(
        req.url,
        '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Orqaly app access · synthetic UI verification</title></head><body><div id="root"></div><script type="module" src="' +
          entry +
          '"></script></body></html>'
      );
      res.setHeader('content-type', 'text/html');
      res.end(html);
    });
  },
};
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  esbuild: { jsx: 'automatic' },
  mode: 'gcp-launch',
  plugins: [plugin],
  cacheDir: '/private/tmp/orqaly-app-access-ui-vite-cache',
  server: { host: '127.0.0.1', port: 15792, strictPort: true },
});
await server.listen();
console.log('Synthetic UI-only fixture: http://127.0.0.1:15792/__app-access-ui-smoke');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
