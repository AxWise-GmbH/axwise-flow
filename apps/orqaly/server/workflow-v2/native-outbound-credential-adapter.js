import { z } from 'zod';
import boundedTransport from '../../infra/n8n/nodes-orqaly-bounded-http/transport.cjs';
import { validateNativeCredentialInput } from './native-workflow-connections.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const connectionId = z.string().uuid();
const credentialType = 'orqalyBoundedHttp';
const label = (value) => `Orqaly connection ${connectionId.parse(value)}`;

// request is the existing owner-scoped runtime management adapter. It must use
// the selected private environment, bounded response/time and no POST retries.
export function createBoundedNativeCredentialAdapter({ request }) {
  if (typeof request !== 'function') throw new Error('outbound_management_adapter_required');
  return {
    async createNativeCredential(auth, command) {
      if (command.type !== credentialType) throw new Error('outbound_credential_type_denied');
      boundedTransport.validateScope(command.scope);
      const input = validateNativeCredentialInput(credentialType, command.data);
      const name = label(command.connectionId);
      // Absorb a scale-to-zero cold start through a bounded management READ,
      // never by retrying a credential-creation POST after an uncertain result.
      await request(auth, command.environmentId, '/api/v1/workflows?limit=1', { method: 'GET' });
      const saved = await request(auth, command.environmentId, '/api/v1/credentials', {
        method: 'POST',
        body: {
          name,
          type: credentialType,
          data: {
            connectionId: command.connectionId,
            scope: JSON.stringify(command.scope),
            headerName: input.name,
            headerValue: input.value,
          },
        },
      });
      // A 200 credential creation is only saved, NOT authenticated or delivered.
      if (saved?.name !== name || saved?.type !== credentialType)
        throw new Error('outbound_credential_response_mismatch');
      return { id: id.parse(saved.id), status: 'saved' };
    },
    async revokeNativeCredential(auth, command) {
      const credentialId = id.parse(command.credentialId);
      const name = label(command.connectionId);
      const path = `/api/v1/credentials/${encodeURIComponent(credentialId)}`;
      const existing = await request(auth, command.environmentId, path, { method: 'GET' });
      if (
        existing?.id !== credentialId ||
        existing?.name !== name ||
        existing?.type !== credentialType
      )
        throw new Error('outbound_credential_ownership_mismatch');
      await request(auth, command.environmentId, path, { method: 'DELETE' });
      return { status: 'revoked' };
    },
    async reconcileNativeCredential(auth, command) {
      // Cleanup only: never creates a credential or tests/replays its effect.
      // Pinned n8n 2.37.10 GET /credentials returns metadata and nextCursor.
      // Refuse a truncated inventory or duplicate deterministic names; do not
      // grant wider owner access or guess a target when a scoped key lacks list.
      const name = label(command.connectionId);
      let credentialId = command.credentialId ? id.parse(command.credentialId) : null;
      const absent = (error) => error?.message === 'solution_runtime_http_404';
      const unknown = (reason) => ({ status: 'unknown', reason });
      const read = async () => {
        try {
          return await request(auth, command.environmentId, `/api/v1/credentials/${credentialId}`, {
            method: 'GET',
          });
        } catch (error) {
          if (absent(error)) return null;
          throw error;
        }
      };
      try {
        if (!credentialId) {
          const inventory = await request(
            auth,
            command.environmentId,
            '/api/v1/credentials?limit=100',
            { method: 'GET' }
          );
          if (
            !Array.isArray(inventory?.data) ||
            inventory.data.length > 100 ||
            (inventory.nextCursor !== null && inventory.nextCursor !== undefined)
          )
            return unknown('credential_inventory_incomplete');
          const matches = inventory.data.filter((entry) => entry?.name === name);
          if (matches.length === 0) return { status: 'removed', credentialId: null };
          if (matches.length !== 1 || matches[0].type !== credentialType)
            return unknown('credential_inventory_ambiguous');
          credentialId = id.parse(matches[0].id);
        }
        const existing = await read();
        if (!existing) return { status: 'removed', credentialId };
        if (
          existing.id !== credentialId ||
          existing.name !== name ||
          existing.type !== credentialType
        )
          return unknown('credential_ownership_mismatch');
        try {
          await request(auth, command.environmentId, `/api/v1/credentials/${credentialId}`, {
            method: 'DELETE',
          });
        } catch {
          /* A lost DELETE acknowledgement can only be resolved by readback. */
        }
        if (await read()) return unknown('credential_still_present');
        return { status: 'removed', credentialId };
      } catch {
        return unknown('credential_cleanup_unverified');
      }
    },
  };
}
