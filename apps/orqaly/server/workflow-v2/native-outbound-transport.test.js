// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const dns = require('node:dns').promises;
const https = require('node:https');
const transport = require('../../infra/n8n/nodes-orqaly-bounded-http/transport.cjs');
const command = { url: 'https://api.customer.example/v1/deliver', method: 'POST', body: { event: 'ready' }, headerName: 'Authorization', headerValue: 'Synthetic-credential-only' };

function fakeNetwork({ addresses = [{ address: '93.184.216.34', family: 4 }], remoteAddress = '93.184.216.34', authorized = true, response = 'ok', status = 200, headers = {}, failAfterSend = false, hang = false } = {}) {
  vi.spyOn(dns, 'lookup').mockResolvedValue(addresses);
  const request = new EventEmitter(); request.destroy = vi.fn();
  const socket = new EventEmitter(); socket.remoteAddress = remoteAddress; socket.authorized = authorized;
  request.end = vi.fn(() => {
    if (failAfterSend) return queueMicrotask(() => request.emit('error', new Error(command.headerValue)));
    if (hang) return;
    const stream = Readable.from([Buffer.from(response)]); stream.statusCode = status; stream.headers = headers;
    queueMicrotask(() => network.mock.calls[0][1](stream));
  });
  const network = vi.spyOn(https, 'request').mockImplementation(() => {
    queueMicrotask(() => { request.emit('socket', socket); socket.emit('secureConnect'); }); return request;
  });
  return { network, request };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('bounded native HTTPS transport', () => {
  it.each(['0.0.0.0','10.0.0.1','100.64.1.1','127.1.2.3','169.254.169.254','172.31.0.1','192.168.1.2','192.0.0.9','192.0.2.2','198.18.0.1','198.51.100.1','203.0.113.2','224.0.0.1','255.255.255.255','::1','::ffff:8.8.8.8','64:ff9b::808:808','fc00::1','fe80::1','2001:db8::1','2002:808:808::','3fff::1','not-ip'])('rejects non-public or transition address %s', (address) => expect(transport.isPublicAddress(address)).toBe(false));
  it.each(['8.8.8.8','93.184.216.34','2606:4700:4700::1111'])('accepts public unicast %s', (address) => expect(transport.isPublicAddress(address)).toBe(true));
  it.each(['http://api.example.com/','https://127.0.0.1/','https://[::1]/','https://x.local/','https://user:pass@api.example.com/','https://api.example.com:444/','https://api.example.com/a?key=value','https://api.example.com/#token','https://api.example.com./','https://api.example.com/\\evil'])('rejects unsafe destination %s before DNS', async (url) => {
    const lookup = vi.spyOn(dns, 'lookup'); await expect(transport.deliver({ ...command, url })).rejects.toMatchObject({ delivery: 'not_sent' }); expect(lookup).not.toHaveBeenCalled();
  });
  it('rejects any mixed public/private DNS answer before creating a request', async () => {
    const f = fakeNetwork({ addresses: [{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}] });
    await expect(transport.deliver(command)).rejects.toMatchObject({ code: 'OUTBOUND_DNS_DENIED', delivery: 'not_sent' }); expect(f.network).not.toHaveBeenCalled();
  });
  it('pins the public address at connect time and forwards only its own headers, discarding secret echoes', async () => {
    const f = fakeNetwork({ response: command.headerValue, headers: { 'x-secret-echo': command.headerValue } });
    const result = await transport.deliver({ ...command, headers: { cookie: 'attacker', 'X-N8N-API-KEY': 'owner-secret' } });
    expect(result).toEqual({ delivery: 'accepted', statusCode: 200, diagnosticCode: null, responseBytes: Buffer.byteLength(command.headerValue) });
    const options = f.network.mock.calls[0][0]; expect(options).toMatchObject({ rejectUnauthorized: true, agent: false, port: 443, method: 'POST', servername: 'api.customer.example' });
    expect(Object.keys(options.headers).sort()).toEqual(['Authorization','accept','accept-encoding','content-length','content-type']);
    const callback = vi.fn(); options.lookup('api.customer.example', {}, callback); expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(dns.lookup).toHaveBeenCalledTimes(1); expect(f.request.end).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain(command.headerValue);
  });
  it.each([{ remoteAddress: '127.0.0.1' }, { authorized: false }])('does not send headers or payload on wrong address or invalid TLS', async (values) => {
    const f = fakeNetwork(values);
    f.request.destroy.mockImplementation((error) => { if(error) queueMicrotask(() => f.request.emit('error', error)); });
    await expect(transport.deliver(command)).rejects.toMatchObject({ delivery: 'not_sent' }); expect(f.request.end).not.toHaveBeenCalled();
  });
  it('does not follow redirects or send a second request', async () => {
    const f = fakeNetwork({status:302,headers:{location:'https://attacker.example/'}});
    expect(await transport.deliver(command)).toMatchObject({delivery:'rejected',diagnosticCode:'OUTBOUND_REDIRECT_DENIED'}); expect(f.network).toHaveBeenCalledTimes(1);
  });
  it.each([{response:Buffer.alloc(65537)}, {response:gzipSync(Buffer.alloc(65537)),headers:{'content-encoding':'gzip'}}, {response:'x',headers:{'content-length':'65537'}}, {response:'x',headers:{'content-encoding':'unknown'}}])('bounds raw and decompressed responses and rejects unsupported encodings', async (values) => {
    const f = fakeNetwork(values); await expect(transport.deliver(command)).rejects.toMatchObject({delivery:'unknown'}); expect(f.network).toHaveBeenCalledTimes(1);
  });
  it('marks a disconnected POST unknown without leaking errors or retrying', async () => {
    const f = fakeNetwork({failAfterSend:true});
    await expect(transport.deliver(command)).rejects.toMatchObject({ code:'OUTBOUND_TRANSPORT_FAILED', delivery:'unknown', message:'OUTBOUND_TRANSPORT_FAILED' }); expect(f.network).toHaveBeenCalledTimes(1);
  });
  it('bounds request JSON before networking and rejects body containing authentication value', async () => {
    const lookup = vi.spyOn(dns,'lookup');
    for(const body of [{value:'a'.repeat(32769)},{echo:command.headerValue}]) await expect(transport.deliver({...command,body})).rejects.toMatchObject({delivery:'not_sent'});
    expect(lookup).not.toHaveBeenCalled();
  });
  it('uses a whole-operation deadline, never retries a timed-out write', async () => {
    vi.useFakeTimers(); const f = fakeNetwork({hang:true});
    f.network.mockImplementation((options) => { options.signal.addEventListener('abort',()=>f.request.emit('error',new Error('aborted'))); queueMicrotask(()=>{ const socket=Object.assign(new EventEmitter(),{authorized:true,remoteAddress:'93.184.216.34'});f.request.emit('socket',socket);socket.emit('secureConnect'); }); return f.request; });
    const result = transport.deliver(command).catch((error)=>error);
    await vi.advanceTimersByTimeAsync(15001); expect(await result).toMatchObject({delivery:'unknown'}); expect(f.network).toHaveBeenCalledTimes(1);expect(f.request.end).toHaveBeenCalledTimes(1);
  });
  it('bounds unresolved DNS without creating a socket',async()=>{
    vi.useFakeTimers();vi.spyOn(dns,'lookup').mockImplementation(()=>new Promise(()=>{}));const request=vi.spyOn(https,'request');
    const result=transport.deliver(command).catch(error=>error);await vi.advanceTimersByTimeAsync(15001);expect(await result).toMatchObject({delivery:'not_sent'});expect(request).not.toHaveBeenCalled();
  });
  it('aborts a connection that never verifies TLS at five seconds without sending headers',async()=>{
    vi.useFakeTimers();const f=fakeNetwork();f.network.mockImplementation(()=>f.request);
    f.request.destroy.mockImplementation(error=>{if(error)queueMicrotask(()=>f.request.emit('error',error));});
    const result=transport.deliver(command).catch(error=>error);await vi.advanceTimersByTimeAsync(5001);
    expect(await result).toMatchObject({code:'OUTBOUND_CONNECT_TIMEOUT',delivery:'not_sent'});expect(f.request.end).not.toHaveBeenCalled();
  });
  it('rejects getters, sparse arrays and recursive structures before reading executable properties',()=>{
    const getter=vi.fn();const object={};Object.defineProperty(object,'field',{enumerable:true,get:getter});
    const array=[1];Object.defineProperty(array,'0',{enumerable:true,get:getter});const cyclic={};cyclic.self=cyclic;
    for(const value of [object,array,Array(2),cyclic])expect(()=>transport.canonical(value)).toThrow('OUTBOUND_INVALID_JSON');expect(getter).not.toHaveBeenCalled();
  });
  it.each(['Content-Type','Accept-Encoding','Expect','TE','Upgrade','Proxy-Connection','X-Serverless-Authorization'])('denies a credential header that can change transport authority (%s)',name=>{
    expect(()=>transport.validateHeader(name,'synthetic')).toThrow('OUTBOUND_CREDENTIAL_INVALID');
  });
});
