// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createBoundedNativeCredentialAdapter } from './native-outbound-credential-adapter.js';
import { describeNativeConnection } from './native-workflow-connections.js';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
const connectionId = '9c91ec02-7df5-4cde-9888-e08d01b940c4';
const owner = { tenantId: connectionId, userId: 'user_owner' };
const f = nativeOutboundFixture();
const scope = describeNativeConnection({
  requirement: f.spec.connections[0],
  workflow: f.workflow,
  environmentId: 'owned-environment',
}).scope;
const command = {
  environmentId: 'owned-environment',
  connectionId,
  type: 'orqalyBoundedHttp',
  scope,
  data: { name: 'Authorization', value: 'Synthetic-secret-value' },
};
const metadata = {
  id: 'credentialOwned',
  name: `Orqaly connection ${connectionId}`,
  type: 'orqalyBoundedHttp',
};
describe('bound credential management adapter', () => {
  it('recovers only an exact deterministic credential name from complete bounded metadata and verifies deletion', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ ...metadata, id: 'unrelated', name: 'Unrelated' }, metadata],
        nextCursor: null,
      })
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce(metadata)
      .mockRejectedValueOnce(new Error('solution_runtime_http_404'));
    const result = await createBoundedNativeCredentialAdapter({
      request,
    }).reconcileNativeCredential(owner, { environmentId: command.environmentId, connectionId });
    expect(result).toEqual({ status: 'removed', credentialId: metadata.id });
    expect(request.mock.calls.map((call) => [call[2], call[3].method])).toEqual([
      ['/api/v1/credentials?limit=100', 'GET'],
      ['/api/v1/credentials/credentialOwned', 'GET'],
      ['/api/v1/credentials/credentialOwned', 'DELETE'],
      ['/api/v1/credentials/credentialOwned', 'GET'],
    ]);
  });
  it.each([
    { data: [metadata], nextCursor: 'more' },
    { data: [metadata, metadata], nextCursor: null },
    { data: [{ ...metadata, type: 'other' }], nextCursor: null },
  ])(
    'does not delete when inventory is incomplete, ambiguous or differently typed',
    async (inventory) => {
      const request = vi.fn().mockResolvedValueOnce(inventory);
      expect(
        (
          await createBoundedNativeCredentialAdapter({ request }).reconcileNativeCredential(owner, {
            environmentId: command.environmentId,
            connectionId,
          })
        ).status
      ).toBe('unknown');
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it('does not retry DELETE after a lost acknowledgement and accepts only verified absence', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(metadata)
      .mockRejectedValueOnce(new Error('lost delete ack'))
      .mockRejectedValueOnce(new Error('solution_runtime_http_404'));
    expect(
      await createBoundedNativeCredentialAdapter({ request }).reconcileNativeCredential(owner, {
        environmentId: command.environmentId,
        connectionId,
        credentialId: metadata.id,
      })
    ).toEqual({ status: 'removed', credentialId: metadata.id });
    expect(request.mock.calls.filter((call) => call[3].method === 'DELETE')).toHaveLength(1);
  });
  it('returns verified absence for an already removed recorded credential and never enumerates unrelated records', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('solution_runtime_http_404'));
    expect(
      await createBoundedNativeCredentialAdapter({ request }).reconcileNativeCredential(owner, {
        environmentId: command.environmentId,
        connectionId,
        credentialId: metadata.id,
      })
    ).toEqual({ status: 'removed', credentialId: metadata.id });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['solution_runtime_http_403', 'lost read'])(
    'keeps cleanup unknown when metadata cannot be verified without exposing errors (%s)',
    async (message) => {
      const request = vi.fn().mockRejectedValueOnce(new Error(message));
      const result = await createBoundedNativeCredentialAdapter({
        request,
      }).reconcileNativeCredential(owner, { environmentId: command.environmentId, connectionId });
      expect(result).toEqual({ status: 'unknown', reason: 'credential_cleanup_unverified' });
      expect(JSON.stringify(result)).not.toContain(message);
    }
  );
  it('does not claim deletion if readback finds the credential or broaden mismatched recorded ownership', async () => {
    const request = vi.fn().mockResolvedValue(metadata);
    expect(
      (
        await createBoundedNativeCredentialAdapter({ request }).reconcileNativeCredential(owner, {
          environmentId: command.environmentId,
          connectionId,
          credentialId: metadata.id,
        })
      ).status
    ).toBe('unknown');
    expect(request.mock.calls.filter((call) => call[3].method === 'DELETE')).toHaveLength(1);
    const mismatch = vi.fn().mockResolvedValue({ ...metadata, name: 'Other owner' });
    expect(
      (
        await createBoundedNativeCredentialAdapter({ request: mismatch }).reconcileNativeCredential(
          owner,
          { environmentId: command.environmentId, connectionId, credentialId: metadata.id }
        )
      ).reason
    ).toBe('credential_ownership_mismatch');
    expect(mismatch).toHaveBeenCalledTimes(1);
  });
  it('warms the scoped runtime through a read, saves exact frozen data once, and returns no credential or verification claim', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ ...metadata, data: { secretEcho: command.data.value } });
    const result = await createBoundedNativeCredentialAdapter({ request }).createNativeCredential(
      owner,
      command
    );
    expect(result).toEqual({ id: metadata.id, status: 'saved' });
    expect(request.mock.calls[0]).toEqual([
      owner,
      'owned-environment',
      '/api/v1/workflows?limit=1',
      { method: 'GET' },
    ]);
    expect(request.mock.calls[1][3].body).toEqual({
      name: metadata.name,
      type: 'orqalyBoundedHttp',
      data: {
        connectionId,
        scope: JSON.stringify(scope),
        headerName: 'Authorization',
        headerValue: command.data.value,
      },
    });
    expect(JSON.stringify(result)).not.toContain(command.data.value);
  });
  it('does not retry a possibly saved credential after disconnect', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('disconnected'));
    await expect(
      createBoundedNativeCredentialAdapter({ request }).createNativeCredential(owner, command)
    ).rejects.toThrow();
    expect(request.mock.calls.filter((call) => call[3].method === 'POST')).toHaveLength(1);
  });
  it.each([
    { type: 'httpHeaderAuth' },
    { scope: { ...scope, targets: [{ ...scope.targets[0], method: 'DELETE' }] } },
    { data: { name: 'Cookie', value: 'Synthetic-secret-value' } },
    { scope: { ...scope, targets: [scope.targets[0], scope.targets[0]] } },
  ])('rejects unsupported or widened credentials before management writes', async (change) => {
    const request = vi.fn();
    await expect(
      createBoundedNativeCredentialAdapter({ request }).createNativeCredential(owner, {
        ...command,
        ...change,
      })
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('deletes only exact owned ID/type/name after read verification', async () => {
    const request = vi.fn().mockResolvedValueOnce(metadata).mockResolvedValueOnce(metadata);
    expect(
      await createBoundedNativeCredentialAdapter({ request }).revokeNativeCredential(owner, {
        environmentId: command.environmentId,
        connectionId,
        credentialId: metadata.id,
      })
    ).toEqual({ status: 'revoked' });
    expect(request.mock.calls.map((call) => [call[2], call[3].method])).toEqual([
      ['/api/v1/credentials/credentialOwned', 'GET'],
      ['/api/v1/credentials/credentialOwned', 'DELETE'],
    ]);
  });
  it.each([{ name: 'Someone else' }, { type: 'httpHeaderAuth' }, { id: 'other' }])(
    'never deletes mismatched credential metadata',
    async (change) => {
      const request = vi.fn().mockResolvedValue({ ...metadata, ...change });
      await expect(
        createBoundedNativeCredentialAdapter({ request }).revokeNativeCredential(owner, {
          environmentId: command.environmentId,
          connectionId,
          credentialId: metadata.id,
        })
      ).rejects.toThrow('ownership');
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
});
