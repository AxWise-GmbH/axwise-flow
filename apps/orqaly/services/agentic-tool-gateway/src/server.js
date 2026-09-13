import process from 'node:process';
import { createToolGatewayServer } from './app.js';
import { loadConfig } from './config.js';
import { ToolGatewayExecutionService } from './service.js';
import { PostgresToolGatewayStore } from './store.js';

const config = loadConfig();
const store = new PostgresToolGatewayStore({ connectionString: config.DATABASE_URL });
const executionService = new ToolGatewayExecutionService({ config, store });
const server = createToolGatewayServer({ config, executionService });

server.listen(config.PORT, '0.0.0.0');

async function shutdown(_signal) {
  server.close(async () => {
    try {
      await store.close();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
