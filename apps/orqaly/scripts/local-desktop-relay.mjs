import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createGooseProviderFromEnvironment } from '../server/workflow-v2/goose-provider-config.js';
import { createGooseProviderRouter } from '../server/workflow-v2/goose-provider-http.js';
import { createDesktopSearchService } from '../server/workflow-v2/desktop-search-service.js';
import { createDesktopImageService } from '../server/workflow-v2/desktop-image-service.js';
import { createDesktopDecisionService } from '../server/workflow-v2/desktop-decision-service.js';

const LOOPBACK = '127.0.0.1';

function benchmarkIdentity(environment) {
  if (environment.ORQALY_LOCAL_TEST_MODE !== 'true') return null;
  const token = environment.ORQALY_LOCAL_TEST_TOKEN;
  if (typeof token !== 'string' || token.length < 32 || token.length > 512 || /\s/u.test(token))
    throw new Error('ORQALY_LOCAL_TEST_TOKEN must be 32–512 nonspace characters');
  const userId = environment.ORQALY_LOCAL_TEST_USER_ID || 'local-benchmark';
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(userId))
    throw new Error('ORQALY_LOCAL_TEST_USER_ID is invalid');
  const expected = createHash('sha256').update(token).digest();
  return (req) => {
    if (req.socket.remoteAddress !== LOOPBACK) return null;
    const bearer = /^Bearer ([^\s]+)$/u.exec(req.get('Authorization') || '');
    if (!bearer || bearer[1].length > 512) return null;
    const actual = createHash('sha256').update(bearer[1]).digest();
    return timingSafeEqual(actual, expected) ? { userId } : null;
  };
}

export function createLocalDesktopRelay({ environment = process.env, fetchImpl = fetch } = {}) {
  const testFlag = environment.ORQALY_LOCAL_TEST_MODE;
  if (testFlag !== undefined && testFlag !== '' && testFlag !== 'true' && testFlag !== 'false')
    throw new Error('ORQALY_LOCAL_TEST_MODE must be true or false');
  const localAuth = benchmarkIdentity(environment);
  const relayEnvironment = {
    ...environment,
    ORQALY_GOOSE_ENABLED: 'true',
    ORQALY_GOOSE_LEGACY_WORKFLOW_ROUTES: 'false',
  };
  const provider = localAuth
    ? createGooseProviderRouter({
      verifyDesktopAuth: localAuth,
      apiKey: relayEnvironment.ORQALY_GOOSE_GEMINI_API_KEY,
      fetchImpl,
      searchService: createDesktopSearchService({
        apiKey: relayEnvironment.ORQALY_GOOSE_GEMINI_API_KEY, fetchImpl,
      }),
      imageService: createDesktopImageService({
        apiKey: relayEnvironment.ORQALY_GOOSE_GEMINI_API_KEY, fetchImpl,
      }),
      ...(relayEnvironment.TYPESAFE_API_KEY ? {
        decisionService: createDesktopDecisionService({ apiKey: relayEnvironment.TYPESAFE_API_KEY }),
      } : {}),
    })
    : createGooseProviderFromEnvironment({ environment: relayEnvironment, fetchImpl });
  const app = express();
  app.disable('x-powered-by');
  app.use('/desktop/v1', provider);
  return app;
}

export async function startLocalDesktopRelay({ environment = process.env, fetchImpl = fetch, port } = {}) {
  const configured = port ?? Number(environment.ORQALY_LOCAL_RELAY_PORT || 8787);
  if (!Number.isInteger(configured) || configured < 0 || configured > 65_535)
    throw new Error('ORQALY_LOCAL_RELAY_PORT is invalid');
  const app = createLocalDesktopRelay({ environment, fetchImpl });
  const server = await new Promise((resolveServer, reject) => {
    const listening = app.listen(configured, LOOPBACK, (error) => {
      if (error) reject(error);
      else resolveServer(listening);
    });
    listening.once('error', reject);
  });
  const address = server.address();
  return { app, server, url: `http://${LOOPBACK}:${address.port}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startLocalDesktopRelay().then(({ url }) => {
    process.stdout.write(`Local desktop relay listening at ${url}\n`);
  }).catch((error) => {
    process.stderr.write(`Local desktop relay could not start: ${error.message}\n`);
    process.exitCode = 1;
  });
}
