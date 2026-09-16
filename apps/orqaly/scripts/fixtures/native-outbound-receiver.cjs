'use strict';
// Synthetic isolated-network fixture. Never a production receiver or proxy.
const https = require('node:https'); const http = require('node:http'); const fs = require('node:fs'); const zlib = require('node:zlib');
const counts = {}; let authenticated = 0; let leakedIncomingAuth = false;
https.createServer({ key: fs.readFileSync('/fixture/key.pem'), cert: fs.readFileSync('/fixture/cert.pem') }, (req, res) => {
  counts[req.url] = (counts[req.url] || 0) + 1;
  if (req.headers.authorization === process.env.SYNTHETIC_RECEIVER_KEY) authenticated++;
  if (req.headers['x-n8n-api-key'] || req.headers.cookie || req.headers['x-serverless-authorization'] || req.headers['x-orqaly-invocation-id']) leakedIncomingAuth = true;
  req.resume(); req.on('end', () => {
    if (req.url === '/disconnect') return req.socket.destroy();
    if (req.url === '/redirect') { res.writeHead(302, { location: 'https://outbound-fixture.orqaly.example/should-not-arrive' }); return res.end(); }
    if (req.url === '/compressed') { res.writeHead(200, { 'content-encoding': 'gzip' }); return res.end(zlib.gzipSync(Buffer.alloc(70000))); }
    res.writeHead(200, { 'content-type': 'application/json', 'x-secret-echo': process.env.SYNTHETIC_RECEIVER_KEY });
    res.end(JSON.stringify({ secretEcho: process.env.SYNTHETIC_RECEIVER_KEY }));
  });
}).listen(443, '0.0.0.0');
http.createServer((_req, res) => { res.setHeader('content-type','application/json'); res.end(JSON.stringify({counts,authenticated,leakedIncomingAuth})); }).listen(8080,'127.0.0.1');
