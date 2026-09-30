// Deterministic JSON-RPC protocol fixture. Never used as a product fallback.
import { appendFileSync } from 'node:fs';
const [logPath, mode = 'normal'] = process.argv.slice(2);
let input = Buffer.alloc(0);
const documents = new Map();
const log = (event) => appendFileSync(logPath, JSON.stringify(event) + '\n');
const send = (value) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...value }));
  // Exercise frame fragmentation, multiple messages, and UTF-8 byte lengths.
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(header.subarray(0, 8));
  process.stdout.write(Buffer.concat([header.subarray(8), body]));
};
function handle(message) {
  log(message);
  const { method, id, params } = message;
  if (method === 'initialize') {
    send({ id, result: { capabilities: { textDocumentSync: { openClose: true, change: 2 },
      documentSymbolProvider: true, hoverProvider: true, definitionProvider: true,
      referencesProvider: true, ...(mode === 'pull' ? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } } : {}) } } });
  } else if (method === 'textDocument/didOpen') {
    documents.set(params.textDocument.uri, { text: params.textDocument.text, version: params.textDocument.version });
    send({ method: 'textDocument/publishDiagnostics', params: { uri: params.textDocument.uri,
      version: params.textDocument.version, diagnostics: [] } });
  } else if (method === 'textDocument/didChange') {
    const doc = { text: params.contentChanges[0].text, version: params.textDocument.version };
    documents.set(params.textDocument.uri, doc);
    // Stale diagnostics must be ignored before the current version arrives.
    send({ method: 'textDocument/publishDiagnostics', params: { uri: params.textDocument.uri,
      version: doc.version - 1, diagnostics: [{ message: 'stale' }] } });
    send({ method: 'textDocument/publishDiagnostics', params: { uri: params.textDocument.uri,
      ...(mode === 'unversioned' ? {} : { version: doc.version }), diagnostics: [{ message: 'current diagnostic' }] } });
  } else if (method === 'textDocument/documentSymbol') {
    if (mode === 'hang') return;
    if (mode === 'error') { send({ id, error: { code: -32603, message: 'fixture error' } }); return; }
    if (mode === 'oversized') { process.stdout.write('Content-Length: 1048577\r\n\r\n'); return; }
    send({ id: 'forbidden-edit', method: 'workspace/applyEdit', params: { edit: { changes: {} } } });
    send({ id: 'forbidden-command', method: 'workspace/executeCommand', params: { command: 'should-never-run' } });
    send({ id, result: [{ name: documents.get(params.textDocument.uri)?.text || 'missing', kind: 12,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }] });
  } else if (method === 'textDocument/diagnostic') {
    send({ id, result: { kind: 'full', items: [{ message: 'pull diagnostic' }] } });
  } else if (method === 'textDocument/hover') {
    send({ id, result: { contents: { kind: 'plaintext', value: 'fixture hover' } } });
  } else if (method === 'textDocument/definition' || method === 'textDocument/references') {
    send({ id, result: [{ uri: params.textDocument.uri, range: { start: params.position, end: params.position } }] });
  } else if (method === 'shutdown') {
    send({ id, result: null });
  } else if (method === 'exit') {
    process.exit(0);
  }
}
process.stdin.on('data', (chunk) => {
  input = Buffer.concat([input, chunk]);
  while (true) {
    const end = input.indexOf('\r\n\r\n');
    if (end < 0) break;
    const length = Number(/Content-Length:\s*(\d+)/i.exec(input.subarray(0, end).toString())[1]);
    if (input.length < end + 4 + length) break;
    const message = JSON.parse(input.subarray(end + 4, end + 4 + length));
    input = input.subarray(end + 4 + length);
    handle(message);
  }
});
