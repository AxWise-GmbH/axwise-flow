import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/194_credential_persistence_hardening.sql'),
  'utf8'
);

describe('credential persistence hardening migration', () => {
  it('adds the OAuth Vault pointer and blocks new plaintext token writes', () => {
    expect(migration).toContain('vault_secret_id uuid');
    expect(migration).toContain('integration_credentials_no_plaintext_tokens');
    expect(migration).toMatch(/access_token IS NULL AND refresh_token IS NULL\) NOT VALID/i);
    expect(migration).toContain('integration_credentials_active_vault_pointer');
  });

  it('blocks new plaintext tool and workflow credential fields', () => {
    expect(migration).toContain('jsonb_contains_plaintext_credential');
    expect(migration).toContain(
      'apikey|apisecret|webhooksecret|signingsecret|clientsecret|secretkey|bearertoken|bottoken|secrettoken|accesstoken|refreshtoken'
    );
    expect(migration).toContain("normalized_key IN ('secret', 'token')");
    expect(migration).toContain('tools_data_no_plaintext_credentials');
    expect(migration).toContain('workflows_data_no_plaintext_credentials');
    expect(migration).toMatch(/CHECK \(NOT public\.jsonb_contains_plaintext_credential\(data\)\)/);
  });

  it('preserves legacy rows for a separately authorized cleanup', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.(integration_credentials|tools|workflows)/i);
    expect(migration).not.toMatch(
      /DELETE\s+FROM\s+public\.(integration_credentials|tools|workflows)/i
    );
    expect(migration.match(/NOT VALID/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
