// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  describeNativeConnection,
  bindNativeConnections,
  validateNativeCredentialInput,
} from './native-workflow-connections.js';

const environmentId = 'owned-environment';
const fixture = (
  type = 'httpRequest',
  parameters = { url: 'https://api.customer.example/v1/tickets', method: 'POST' }
) => {
  const requirement = {
    id: 'service',
    nodeIds: ['n1'],
    provider: 'Customer integration',
    credentialType: { httpRequest: 'httpHeaderAuth', github: 'githubApi', twilio: 'twilioApi' }[
      type
    ],
  };
  const workflow = {
    nodes: [
      {
        id: 'n1',
        type: `n8n-nodes-base.${type}`,
        parameters,
        credentials: { attacker: { id: 'unowned' } },
      },
    ],
  };
  const described = describeNativeConnection({ requirement, workflow, environmentId });
  const connection = {
    id: 'connection-owned',
    requirement_id: requirement.id,
    environment_id: environmentId,
    credential_type: requirement.credentialType,
    scope: described.scope,
    status: 'saved',
    provider_credential_id: 'provider-owned',
  };
  return { requirement, workflow, connection, environmentId };
};

describe('native connection descriptors do not grant execution capability', () => {
  it('only binds the server-owned credential for the exact pinned node parameters and environment', () => {
    const f = fixture();
    expect(describeNativeConnection(f)).toMatchObject({ status: 'saved', canConnect: false });
    const spec = { connections: [f.requirement] };
    expect(
      bindNativeConnections(f.workflow, spec, [f.connection], environmentId).nodes[0].credentials
    ).toEqual({
      httpHeaderAuth: { id: 'provider-owned', name: 'Orqaly connection connection-owned' },
    });
    expect(
      bindNativeConnections(f.workflow, spec, [f.connection], 'other-environment').nodes[0]
        .credentials
    ).toBeUndefined();
    expect(
      bindNativeConnections(f.workflow, spec, [], environmentId).nodes[0].credentials
    ).toBeUndefined();
    f.workflow.nodes[0].parameters.body = 'different-action';
    expect(describeNativeConnection(f).status).toBe('stale');
    expect(
      bindNativeConnections(f.workflow, spec, [f.connection], environmentId).nodes[0].credentials
    ).toBeUndefined();
  });
  it.each([
    'http://api.example.com',
    'https://127.0.0.1/a',
    'https://[::1]/',
    'https://service.internal/',
    'https://user:pass@api.example.com/',
    'https://api.example.com:444/',
    '={{ $json.url }}',
    'https://api.example.com/#token',
  ])('does not offer a connection form for unsafe or dynamic destinations (%s)', (url) => {
    expect(fixture('httpRequest', { url }).connection.scope).toBeUndefined();
  });
  it('pins GitHub issue/ref scope and SMS sender/recipient; dynamic recipients are not authorized', () => {
    const github = fixture('github', {
      owner: 'customer',
      repository: 'repo',
      resource: 'issue',
      operation: 'edit',
      issueNumber: 17,
    });
    expect(describeNativeConnection(github).status).toBe('saved');
    github.workflow.nodes[0].parameters.issueNumber = 18;
    expect(describeNativeConnection(github).status).toBe('stale');
    const sms = fixture('twilio', {
      from: '+15555550000',
      to: '+15555550001',
      resource: 'sms',
      operation: 'send',
      message: 'Order ready',
    });
    expect(sms.connection.scope.targets[0]).toMatchObject({
      from: '+15555550000',
      to: '+15555550001',
    });
    sms.workflow.nodes[0].parameters.to = '+15555550002';
    expect(describeNativeConnection(sms).status).toBe('stale');
    sms.workflow.nodes[0].parameters.to = '={{ $json.phone }}';
    expect(describeNativeConnection(sms).canConnect).toBe(false);
    expect(describeNativeConnection(sms).scope).toBeUndefined();
  });
  it('accepts exact credential forms only; no header injection, smuggled fields or getter evaluation', () => {
    expect(
      validateNativeCredentialInput('httpHeaderAuth', {
        name: 'Authorization',
        value: 'synthetic-test-key',
      })
    ).toEqual({ name: 'Authorization', value: 'synthetic-test-key' });
    for (const name of [
      'Host',
      'Cookie',
      'X-Orqaly-Invocation-Id',
      'Proxy-Authorization',
      'X-Key\r\nInjected',
    ])
      expect(() =>
        validateNativeCredentialInput('httpHeaderAuth', { name, value: 'example' })
      ).toThrow();
    expect(() =>
      validateNativeCredentialInput('githubApi', {
        accessToken: 'example',
        url: 'https://attacker.example',
      })
    ).toThrow();
    expect(() =>
      validateNativeCredentialInput('githubApi', { accessToken: 'example\nmalformed' })
    ).toThrow();
    const get = vi.fn(() => 'never-read');
    const value = {};
    Object.defineProperty(value, 'accessToken', { get, enumerable: true });
    expect(() => validateNativeCredentialInput('githubApi', value)).toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(() =>
      validateNativeCredentialInput('twilioApi', { accountSid: 'invalid', authToken: 'example' })
    ).toThrow();
  });
  it('revocation can safely detach from an empty draft and never modifies the supplied graph', () => {
    expect(bindNativeConnections(null, { connections: [] }, [], environmentId)).toBeNull();
    const f = fixture();
    bindNativeConnections(f.workflow, { connections: [f.requirement] }, [], environmentId);
    expect(f.workflow.nodes[0].credentials).toEqual({ attacker: { id: 'unowned' } });
  });
});
