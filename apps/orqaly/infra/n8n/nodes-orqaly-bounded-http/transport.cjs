'use strict';
// No n8n HTTP helper: its stock transport does not provide the byte bounds this
// capability requires. This module has no environment/proxy/incoming-header API.
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const zlib = require('node:zlib');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createHash } = require('node:crypto');

const LIMITS = Object.freeze({ requestBytes: 32768, responseBytes: 65536,
  wireResponseBytes: 65536, headerBytes: 8192, timeoutMs: 15000, connectTimeoutMs: 5000 });
class OutboundError extends Error {
  constructor(code, dispatched = false) {
    super(code); this.name = 'OrqalyOutboundError'; this.code = code;
    this.delivery = dispatched ? 'unknown' : 'not_sent';
  }
}
const fail = (code) => { throw new OutboundError(code); };
function canonical(value, state = { count: 0, bytes: 0 }, depth = 0) {
  if (++state.count > 10000 || depth > 30) fail('OUTBOUND_INVALID_JSON');
  if (typeof value === 'string' && (state.bytes += Buffer.byteLength(value)) > 262144) fail('OUTBOUND_INVALID_JSON');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) fail('OUTBOUND_INVALID_JSON');
    const entries = [];
    for (let index = 0; index < value.length; index++) {
      const property = Object.getOwnPropertyDescriptor(value, String(index));
      if (!property || !Object.hasOwn(property, 'value')) fail('OUTBOUND_INVALID_JSON');
      entries.push(canonical(property.value, state, depth + 1));
    }
    return '[' + entries.join(',') + ']';
  }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('OUTBOUND_INVALID_JSON');
  return '{' + Object.keys(value).sort().map((key) => {
    if ((state.bytes += Buffer.byteLength(key)) > 262144 || ['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) fail('OUTBOUND_INVALID_JSON');
    return JSON.stringify(key) + ':' + canonical(value[key], state, depth + 1);
  }).join(',') + '}';
}
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
function destination(value) {
  if (typeof value !== 'string' || value.length > 2000 || value.includes('{{') || /[\s\\]/.test(value)) fail('OUTBOUND_DESTINATION_INVALID');
  let url; try { url = new URL(value); } catch { fail('OUTBOUND_DESTINATION_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search ||
      !url.hostname.includes('.') || url.hostname.endsWith('.') || net.isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
      /(?:^|\.)(?:local|localhost|internal|invalid|test|onion)$/.test(url.hostname)) fail('OUTBOUND_DESTINATION_INVALID');
  if (url.href !== value) fail('OUTBOUND_DESTINATION_NOT_CANONICAL');
  return url;
}
function ipv6Number(address) {
  if (address.includes('.') || address.includes('%')) return null;
  const parts = address.split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const blocks = parts.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  if (blocks.length !== 8) return null;
  return blocks.reduce((result, part) => (result << 16n) + BigInt('0x' + part), 0n);
}
function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6) return false;
  const value = ipv6Number(address); if (value === null) return false;
  const prefix = (base, bits) => (value >> BigInt(128 - bits)) === (ipv6Number(base) >> BigInt(128 - bits));
  // Deliberately narrower than all IANA special-purpose exceptions. No mapped,
  // NAT64, transition, scoped, ULA, link-local, multicast or documentation ranges.
  return prefix('2000::', 3) && !prefix('2001::', 23) && !prefix('2001:db8::', 32) &&
    !prefix('2002::', 16) && !prefix('3fff::', 20) && !prefix('3ffe::', 16) && !prefix('2620:4f:8000::', 48);
}
function validateHeader(name, value) {
  if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(name) ||
      /^(?:host|cookie|set-cookie|content-length|content-type|accept|accept-encoding|transfer-encoding|connection|keep-alive|te|trailer|upgrade|expect|proxy-.+|x-orqaly-.+|x-serverless-.+)$/i.test(name) ||
      typeof value !== 'string' || value.length < 1 || value.length > 8000 || /[^\x20-\x7e]/.test(value)) fail('OUTBOUND_CREDENTIAL_INVALID');
}
function validateScope(scope) {
  if (!scope || Object.keys(scope).some((key) => !['credentialType', 'targets'].includes(key)) || scope.credentialType !== 'orqalyBoundedHttp' || !Array.isArray(scope.targets) || scope.targets.length !== 1) fail('OUTBOUND_SCOPE_INVALID');
  const target = scope.targets[0];
  const url = destination(target.destination);
  if (Object.keys(target).some((key) => !['nodeId','typeVersion','transportVersion','destination','hostname','method','parametersHash'].includes(key)) || target.hostname !== url.hostname || target.method !== 'POST' || target.typeVersion !== 1 || target.transportVersion !== 1 ||
      typeof target.nodeId !== 'string' || !target.nodeId || !/^[a-f0-9]{64}$/.test(target.parametersHash)) fail('OUTBOUND_SCOPE_INVALID');
  return target;
}

// Production exports do NOT accept injected DNS/request/TLS bypasses. Tests use
// node module mocks or an isolated synthetic TLS network, never a runtime flag.
async function deliver({ url: value, method, body, headerName, headerValue }) {
  const url = destination(value);
  if (method !== 'POST') fail('OUTBOUND_METHOD_DENIED');
  validateHeader(headerName, headerValue);
  if (url.href.includes(headerValue) || decodeURIComponent(url.pathname).includes(headerValue)) fail('OUTBOUND_SECRET_IN_DESTINATION');
  let payload;
  try { payload = Buffer.from(canonical(body)); } catch { fail('OUTBOUND_INVALID_JSON'); }
  if (payload.length > LIMITS.requestBytes) fail('OUTBOUND_REQUEST_TOO_LARGE');
  // Prevent the stored authentication value being explicitly echoed in a body.
  if (payload.includes(Buffer.from(headerValue))) fail('OUTBOUND_SECRET_IN_PAYLOAD');
  let dispatched = false; let req; let timer; let connectTimer;
  const controller = new AbortController();
  timer = setTimeout(() => controller.abort(new Error('deadline')), LIMITS.timeoutMs);
  try {
    const answers = await Promise.race([
      dns.lookup(url.hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('deadline')), { once: true })),
    ]);
    if (!Array.isArray(answers) || !answers.length || answers.some((entry) => !isPublicAddress(entry.address) || net.isIP(entry.address) !== entry.family)) fail('OUTBOUND_DNS_DENIED');
    const selected = answers[0];
    return await new Promise((resolve, reject) => {
      const done = (error, result) => {
        clearTimeout(connectTimer);
        if (error) { req?.destroy(); reject(new OutboundError(error.code?.startsWith('OUTBOUND_') ? error.code : 'OUTBOUND_TRANSPORT_FAILED', dispatched)); }
        else resolve(result);
      };
      req = https.request({ protocol: 'https:', hostname: url.hostname, port: 443, path: url.pathname,
        method: 'POST', servername: url.hostname, rejectUnauthorized: true, agent: false,
        family: selected.family, autoSelectFamily: false, maxHeaderSize: LIMITS.headerBytes,
        signal: controller.signal,
        lookup(hostname, options, callback) {
          if (hostname !== url.hostname) return callback(new Error('lookup mismatch'));
          // Pin the already verified address. No second DNS lookup or fallback.
          callback(null, options?.all ? [selected] : selected.address, selected.family);
        },
        headers: { 'content-type': 'application/json', accept: 'application/json', 'accept-encoding': 'gzip, deflate',
          'content-length': payload.length, [headerName]: headerValue },
      }, async (response) => {
        try {
          if (response.statusCode >= 300 && response.statusCode < 400) {
            response.destroy(); return done(null, { delivery: 'rejected', statusCode: response.statusCode, diagnosticCode: 'OUTBOUND_REDIRECT_DENIED', responseBytes: 0 });
          }
          const declared = response.headers['content-length'];
          if (declared && (!/^\d+$/.test(declared) || Number(declared) > LIMITS.wireResponseBytes)) throw new OutboundError('OUTBOUND_RESPONSE_TOO_LARGE');
          const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
          const decode = { identity: () => new Transform({ transform(chunk, _, next) { next(null, chunk); } }), gzip: zlib.createGunzip, deflate: zlib.createInflate }[encoding];
          if (!decode) throw new OutboundError('OUTBOUND_RESPONSE_ENCODING_DENIED');
          let wireBytes = 0; let responseBytes = 0;
          const wireBound = new Transform({ transform(chunk, _, next) {
            wireBytes += chunk.length;
            next(wireBytes > LIMITS.wireResponseBytes ? new OutboundError('OUTBOUND_RESPONSE_TOO_LARGE') : null, chunk);
          } });
          // Discard every body byte after counting; no provider body/header/error
          // can enter n8n execution evidence, including authentication echoes.
          const sink = new Transform({ transform(chunk, _, next) {
            responseBytes += chunk.length;
            next(responseBytes > LIMITS.responseBytes ? new OutboundError('OUTBOUND_RESPONSE_TOO_LARGE') : null);
          } });
          await pipeline(response, wireBound, decode(), sink, { signal: controller.signal });
          done(null, { delivery: response.statusCode >= 200 && response.statusCode < 300 ? 'accepted' : 'rejected',
            statusCode: response.statusCode, diagnosticCode: null, responseBytes });
        } catch (error) { response.destroy(); done(error); }
      });
      req.on('error', (error) => done(error));
      connectTimer = setTimeout(() => req.destroy(new OutboundError('OUTBOUND_CONNECT_TIMEOUT')), LIMITS.connectTimeoutMs);
      req.on('socket', (socket) => {
        socket.once('secureConnect', () => {
          clearTimeout(connectTimer);
          if (!socket.authorized || socket.remoteAddress !== selected.address) return req.destroy(new OutboundError('OUTBOUND_CONNECT_ADDRESS_DENIED'));
          // No request bytes (including headers) are sent before validated TLS
          // connection+address. Any failure after this point is ambiguous.
          dispatched = true; req.end(payload);
        });
      });
    });
  } catch (error) {
    throw error instanceof OutboundError ? error : new OutboundError('OUTBOUND_TRANSPORT_FAILED', dispatched);
  } finally { clearTimeout(timer); clearTimeout(connectTimer); req?.destroy(); }
}
module.exports = { LIMITS, OutboundError, canonical, hash, destination, isPublicAddress, validateHeader, validateScope, deliver };
