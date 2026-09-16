import process from 'node:process';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';

const config = loadConfig();
const pool = createPool(config);
const app = createApp({ config, pool });
const server = app.listen(config.PORT, () => {
  console.info(
    JSON.stringify({
      event: 'agentic_control_plane_listening',
      port: config.PORT,
      executionRequested: config.AGENTIC_EXECUTION_ENABLED,
      executionEnabled: false,
      executionStatus: config.AGENTIC_EXECUTION_ENABLED ? 'release_gated' : 'disabled',
    })
  );
});

async function shutdown(signal) {
  console.info(JSON.stringify({ event: 'agentic_control_plane_shutdown', signal }));
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
