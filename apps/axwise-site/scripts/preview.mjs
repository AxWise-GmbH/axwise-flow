import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { siteRoot } from './build.mjs';

const root = join(siteRoot, 'dist');
const port = Number(process.env.PORT || 4319);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (/^\/(sign-in|sign-up|login|signup)(\/|$)/.test(path)) {
      res.writeHead(302, { location: 'https://orqanix.com/login', 'cache-control': 'no-store' }); res.end(); return;
    }
    if (/^\/docs(\/|$)/.test(path)) { res.writeHead(302, { location: 'https://github.com/AxWise-GmbH/axwise-flow#install-from-a-release' }); res.end(); return; }
    if (/^\/(use-cases|b2b|customer-research)\/?$/.test(path)) { res.writeHead(302, { location: '/#examples' }); res.end(); return; }
    const retired = /^\/(unified-dashboard|dashboard|axpersona|prototypes|precall|app)(\/|$)/.test(path);
    const route = retired ? '/retired/index.html' : path === '/' ? '/index.html' : /\.[a-z]+$/i.test(path) ? path : `${path.replace(/\/$/, '')}/index.html`;
    const file = resolve(root, `.${route}`);
    if (!file.startsWith(`${root}/`)) { res.writeHead(400); res.end(); return; }
    let body;
    let status = retired ? 410 : 200;
    try { body = await readFile(file); } catch { body = await readFile(join(root, '404.html')); status = 404; }
    const suffix = status === 404 ? '.html' : route.slice(route.lastIndexOf('.'));
    res.writeHead(status, { 'content-type': types[suffix] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
  } catch { res.writeHead(400); res.end('Bad request'); }
}).listen(port, '127.0.0.1', () => console.log(`AxWise preview: http://127.0.0.1:${port}`));
