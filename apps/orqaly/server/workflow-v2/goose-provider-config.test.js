import { describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import { createGooseProviderFromEnvironment, createGooseRunContext, desktopOAuthIdentity } from './goose-provider-config.js';

const clientId = 'desktop_client';
const oauth = { tokenType: 'oauth_token', isAuthenticated: true, userId: 'user_owner',
  clientId, scopes: ['profile', 'offline_access'] };

describe('Goose desktop identity and source context', () => {
  it('leaves existing deployments disabled without the explicit flag', () => {
    expect(createGooseProviderFromEnvironment({ environment: {} })).toBeNull();
    expect(() => createGooseProviderFromEnvironment({ environment: { ORQALY_GOOSE_ENABLED: 'yes' } })).toThrow();
    expect(() => createGooseProviderFromEnvironment({ environment: { ORQALY_GOOSE_ENABLED: 'true' } })).toThrow();
  });

  it('accepts only verified user identity from this OAuth client and scope', () => {
    expect(desktopOAuthIdentity(oauth, clientId)).toEqual({ userId: 'user_owner' });
    for (const auth of [null, { ...oauth, isAuthenticated: false }, { ...oauth, tokenType: 'session_token' },
      { ...oauth, clientId: 'another_client' }, { ...oauth, scopes: [] }])
      expect(() => desktopOAuthIdentity(auth, clientId)).toThrow();
  });

  const fixture = () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const artifact = { artifactId: '22222222-2222-4222-8222-222222222222', kind: 'scope',
      contentType: 'application/json', payload: { objective: 'Preserve webhook delivery identity' },
      markdown: null, inputHash: 'a'.repeat(64) };
    artifact.artifactHash = canonicalHash({ contentType: artifact.contentType,
      payload: artifact.payload, markdown: artifact.markdown });
    const snapshot = { run: { id: runId, ownerUserId: oauth.userId }, approvals: [
      { kind: 'scope', decision: 'approved', artifact, inputHash: artifact.inputHash },
    ] };
    const service = { read: vi.fn().mockResolvedValue(snapshot), artifact: vi.fn().mockResolvedValue(artifact) };
    const input = { authContext: { userId: oauth.userId }, request: { get: () => runId },
      signal: new AbortController().signal };
    return { runId, artifact, snapshot, service, input };
  };

  it('uses only an explicitly selected, owned and hash-bound approved scope', async () => {
    const { runId, artifact, service, input } = fixture();
    const context = await createGooseRunContext(service)(input);
    expect(context).toContain(artifact.payload.objective);
    expect(service.read).toHaveBeenCalledWith(input.authContext, runId);
    expect(service.artifact).toHaveBeenCalledWith(input.authContext, runId, artifact.artifactId);
  });

  it('does not load project data when no context was selected', async () => {
    const { service, input } = fixture();
    input.request.get = () => undefined;
    expect(await createGooseRunContext(service)(input)).toBeNull();
    expect(service.read).not.toHaveBeenCalled();
  });

  it('rejects another owner, absent approval, and changed artifact bytes', async () => {
    for (const mutation of [
      (f) => { f.snapshot.run.ownerUserId = 'user_other'; },
      (f) => { f.snapshot.approvals = []; },
      (f) => { f.artifact.payload.objective = 'changed'; },
    ]) {
      const f = fixture(); mutation(f);
      await expect(createGooseRunContext(f.service)(f.input)).rejects.toThrow();
    }
  });
});
