// Local-only product UI acceptance fixture. All data/auth/native surfaces here
// are synthetic; this is not evidence of provider or n8n execution.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root,
  mode: 'gcp-launch',
  cacheDir: 'node_modules/.vite-n8n-controls-fixture',
  optimizeDeps: { entries: ['scripts/fixtures/n8n-controls.html'] },
  resolve: {
    alias: {
      '@clerk/react': fileURLToPath(new URL('./fixtures/n8n-controls-auth.js', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  plugins: [
    {
      name: 'synthetic-native-surface',
      configureServer(app) {
        app.middlewares.use('/native-n8n/launch', (req, res) => {
          req.resume();
          res.setHeader('Content-Type', 'text/html');
          res.end(
            '<!doctype html><html><head><title>Synthetic canvas</title></head><body style="font:16px system-ui;padding:24px;background:#fafafa"><p>UI acceptance fixture · synthetic canvas, not n8n execution</p><h2>Webhook → Normalize contact → Reply</h2><p>The native editor is tested separately against real n8n.</p><script>parent.postMessage({command:"n8nReady"},location.origin)</script></body></html>'
          );
        });
      },
    },
  ],
});
await server.listen();
console.log('Synthetic product UI: http://127.0.0.1:5188/scripts/fixtures/n8n-controls.html');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
