const TRANSIENT_CODES = new Set([
  'DATABASE_CONNECTION_TIMEOUT',
  'WORKER_READINESS_TIMEOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  '08000',
  '08001',
  '08003',
  '08006',
  '08007',
  '08P01',
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);
const SAFE_CODES = new Set([
  ...TRANSIENT_CODES,
  '28P01',
  '42501',
  '42P01',
  '42703',
  'WORKER_CONFIGURATION_INCOMPLETE',
  'WORKER_STOPPING',
  'WORKER_READINESS_TIMEOUT',
]);
const SAFE_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError']);

// Never emit raw messages, stacks, SQL, payloads or arbitrary provider error codes.
export function workerErrorMetadata(error) {
  if (
    new Set([
      'timeout exceeded when trying to connect',
      'Connection terminated due to connection timeout',
      'timeout expired',
    ]).has(error?.message)
  )
    return { code: 'DATABASE_CONNECTION_TIMEOUT' };
  const code = SAFE_CODES.has(error?.code)
    ? error.code
    : SAFE_NAMES.has(error?.name)
      ? error.name
      : 'Error';
  return {
    code,
    ...(error?.message === 'Cannot use a pool after calling end on the pool'
      ? { diagnostic: 'database_pool_closed' }
      : {}),
  };
}

function codedError(code) {
  return Object.assign(new Error(code), { code });
}

async function within(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise.then((value) => ({ completed: true, value })),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ completed: false }), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createWorkerLifecycle({
  readiness,
  queues,
  delayMs,
  onQueueError,
  onStartupRetry,
  onFatal,
  onReady = () => {},
  closeServer,
  closeRepository,
  exit,
  startupAttempts = 5,
  readinessTimeoutMs = 5000,
  drainTimeoutMs = 8000,
}) {
  let phase = 'starting';
  let stopping = false;
  let loopPromise;
  let shutdownPromise;
  let readinessPromise;
  let wake;

  function checkReadiness() {
    if (stopping) return Promise.reject(codedError('WORKER_STOPPING'));
    if (!readinessPromise) {
      readinessPromise = Promise.resolve()
        .then(readiness)
        .finally(() => {
          readinessPromise = null;
        });
    }
    return readinessPromise;
  }

  async function wait(milliseconds) {
    if (stopping) return;
    let timer;
    await new Promise((resolve) => {
      wake = resolve;
      timer = setTimeout(resolve, milliseconds);
    });
    clearTimeout(timer);
    wake = null;
  }

  async function loop() {
    for (let attempt = 1; !stopping; attempt += 1) {
      try {
        const result = await within(checkReadiness(), readinessTimeoutMs);
        if (!result.completed) throw codedError('WORKER_READINESS_TIMEOUT');
        break;
      } catch (error) {
        if (stopping) return;
        const metadata = workerErrorMetadata(error);
        if (!TRANSIENT_CODES.has(metadata.code) || attempt >= startupAttempts) throw error;
        onStartupRetry({ attempt, ...metadata });
        await wait(Math.min(250 * 2 ** (attempt - 1), 2000));
      }
    }
    if (stopping) return;
    phase = 'running';
    onReady();
    while (!stopping) {
      for (const queue of queues) {
        if (stopping) break;
        try {
          await queue.run();
        } catch (error) {
          onQueueError(queue.name, workerErrorMetadata(error));
        }
      }
      await wait(delayMs());
    }
  }

  function start() {
    if (!loopPromise && !stopping) {
      loopPromise = loop().catch((error) => {
        phase = 'failed';
        onFatal(workerErrorMetadata(error));
      });
    }
    return loopPromise;
  }

  function shutdown(exitCode = 0) {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    phase = 'stopping';
    wake?.();
    // Cloud Run allows 10s after SIGTERM. The single 8s budget includes HTTP,
    // startup/readiness, queue work and pool closure. No new queue may start.
    // A timed-out in-flight operation keeps its pool open until process exit;
    // durable leases/unknown-outcome reconciliation, never a blind retry, recover it.
    shutdownPromise = (async () => {
      const drain = Promise.allSettled([
        Promise.resolve().then(closeServer),
        loopPromise,
        readinessPromise,
      ]).then((results) => {
        if (results[0].status === 'rejected') throw results[0].reason;
        if (phase !== 'drain_timeout') return closeRepository();
      });
      try {
        const result = await within(drain, drainTimeoutMs);
        if (!result.completed) {
          // Prevent a late completion from closing a pool after our timeout result.
          phase = 'drain_timeout';
          exit(1);
          return { drained: false, exitCode: 1 };
        }
        phase = 'stopped';
        exit(exitCode);
        return { drained: true, exitCode };
      } catch {
        phase = 'shutdown_failed';
        exit(1);
        return { drained: false, exitCode: 1 };
      }
    })();
    return shutdownPromise;
  }

  return { start, shutdown, checkReadiness, state: () => ({ phase, stopping }) };
}
