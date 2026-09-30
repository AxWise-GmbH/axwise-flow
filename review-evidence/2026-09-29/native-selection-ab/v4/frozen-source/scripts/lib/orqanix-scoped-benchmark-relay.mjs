/** A per-row localhost capability, never a cloud OAuth credential. The ordinary
 * desktop still authenticates normally. Confined Goose can only POST model calls
 * through the active capability; it cannot retrieve the parent's OAuth token. */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, request } from 'node:http';

const PREFIX='local-benchmark-v1_';
export async function startScopedRelay(upstreamUrl,{maxCalls=60,now=Date.now}={}) {
  const upstream=new URL(upstreamUrl);
  if(upstream.protocol!=='http:'||upstream.hostname!=='127.0.0.1'||upstream.pathname!=='/'||upstream.search||upstream.hash)throw Error('LOOPBACK_UPSTREAM_REQUIRED');
  let active=null;
  const stats=[];
  const server=createServer((req,res)=>{
    const authorization=String(req.headers.authorization||'');
    const supplied=authorization.startsWith('Bearer ')?authorization.slice(7):'';
    let forwarded=authorization;
    if(supplied.startsWith(PREFIX)){
      if(!active||now()>=active.expiresAt||supplied.length!==active.capability.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(active.capability))){res.writeHead(401);res.end('Expired or invalid local benchmark capability');return;}
      if(req.method!=='POST'||req.url!=='/desktop/v1/chat/completions'){active.denied++;res.writeHead(403);res.end('Local capability is limited to model requests');return;}
      if(active.calls>=maxCalls){active.denied++;res.writeHead(429);res.end('Benchmark model request budget exhausted');return;}
      active.calls++;
      forwarded=`Bearer ${active.oauthToken}`;
    }
    // Destination is fixed and localhost-only. Neither target nor credentials
    // can be supplied in the request body; no redirects or generic HTTP proxy.
    const headers={...req.headers,host:upstream.host,authorization:forwarded};
    delete headers['proxy-authorization'];delete headers['proxy-connection'];
    const proxy=request({hostname:'127.0.0.1',port:upstream.port,path:req.url,method:req.method,headers},response=>{
      res.writeHead(response.statusCode,response.headers);response.pipe(res);
    });
    proxy.setTimeout(210000,()=>proxy.destroy());
    proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local relay transport failed');});
    req.on('aborted',()=>proxy.destroy());res.on('close',()=>{if(!res.writableFinished)proxy.destroy();});req.pipe(proxy);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  function deactivate(){if(active){stats.push({trial:active.trial,calls:active.calls,denied:active.denied});active.oauthToken=null;active=null;}}
  return {
    url:`http://127.0.0.1:${server.address().port}`,
    activate({oauthToken,trial,lifetimeMs=420000}){
      if(typeof oauthToken!=='string'||oauthToken.length<20||/\s/.test(oauthToken))throw Error('INVALID_PARENT_OAUTH');
      if(!Number.isInteger(lifetimeMs)||lifetimeMs<1||lifetimeMs>420000)throw Error('INVALID_CAPABILITY_LIFETIME');
      deactivate();active={oauthToken,trial,capability:PREFIX+randomBytes(32).toString('hex'),expiresAt:now()+lifetimeMs,calls:0,denied:0};return active.capability;
    },
    deactivate,
    snapshot(){return [...stats,...(active?[{trial:active.trial,calls:active.calls,denied:active.denied}]:[])];},
    async close(){deactivate();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));},
  };
}
