# BYOK Security — threat model & KEK rotation runbook

Orqaly's `/settings/keys` page stores user-provided API keys using
envelope encryption. This doc covers the threat model, the encryption
scheme, and the procedure for rotating the root Key Encryption Key (KEK).

## Threat model

### In scope
| # | Threat | Mitigation |
|---|---|---|
| T1 | Database dump / backup exfiltration | Keys stored as AES-256-GCM ciphertext in `vault.secrets`. A DB dump alone is useless — the KEK lives in a separate trust domain (Vercel env). |
| T2 | Supabase service-role key leak | Service role can read ciphertext but cannot decrypt without the KEK. |
| T3 | Cross-tenant read (user A reads user B's keys) | RLS on `public.user_api_keys` scopes CRUD to `auth.uid() = user_id`. `vault` schema is not anon/user accessible. `aad` binds ciphertext to `user_id:provider:slot`. |
| T4 | JWT theft / XSS in transit | Plaintext leaves the server only once — last 4 chars on write. List/get never return plaintext. |
| T5 | Silent platform fallback masks user-key failure | Every resolution writes `KEY_USED` or `KEY_USED_FALLBACK_PLATFORM` to `audit_log`. The fallback event is an alert signal. |
| T6 | Log / error path leaks | `api/_lib/logger.js` redaction list covers `apiKey`, `authorization`, provider-prefixed keys, and `envelope`/`ciphertext`/`fingerprint` fields. |

### Out of scope (residual risk)
- **Concurrent server-side compromise** — if an attacker runs code on a
  Vercel function they have both `SUPABASE_SERVICE_ROLE_KEY` and
  `ORQ_KEK_V1` in `process.env`. Industry-accepted residual — only
  client-side zero-knowledge encryption closes this, and ZK is
  incompatible with background agents that need decryption without a
  user session.
- **Supabase project-owner abuse** — owners can query `vault.decrypted_secrets`
  via the dashboard. Not our bug to fix here; flag for enterprise tier.
- **Upstream provider breach** (OpenAI account compromise, etc.) — user's
  responsibility.

## Encryption scheme

```
┌─────────────────────────────────────────────────────────────────┐
│ Vercel env (separate trust domain)                              │
│   ORQ_KEK_V1 = <32 bytes, base64> ← NEVER in DB, NEVER in code  │
└───────────────────────┬─────────────────────────────────────────┘
                        │ AES-256-GCM (KEK wraps DEK)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Per-row envelope JSON (stored in vault.secrets.secret)          │
│   {                                                             │
│     v: 1,                                                       │
│     kek_id: 'ORQ_KEK_V1',                                       │
│     alg: 'AES-256-GCM',                                         │
│     dek_wrap: { iv, tag, ct },   ← KEK(DEK)                     │
│     payload:  { iv, tag, ct },   ← DEK(apiKey)                  │
│     aad: 'user_id:provider:slot' ← bound to owner               │
│   }                                                             │
└───────────────────────┬─────────────────────────────────────────┘
                        │ vault_secret_id FK
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ public.user_api_keys (metadata only — masked_preview,           │
│ fingerprint sha256, kek_id, is_current, audit trigger)          │
└─────────────────────────────────────────────────────────────────┘
```

**Key facts:**
- **DEK** (data encryption key): 32 bytes, generated per write with `crypto.randomBytes(32)`.
- **KEK**: 32 bytes, base64-encoded, stored in Vercel env as `ORQ_KEK_V1`.
- **AAD** (additional authenticated data): `"{user_id}:{provider}:{slot}"`.
  Validated on decrypt — prevents moving ciphertext between users.
- Ciphertext never leaves the server.

## KEK rotation runbook

Rotate when: KEK is suspected leaked, quarterly per policy, or when a
team member with env-var access leaves.

### Preparation

1. **Generate a new KEK**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. **Add as a new env var** `ORQ_KEK_V2` in all three Vercel environments
   (Production / Preview / Development). **Do not remove `ORQ_KEK_V1` yet.**
3. Set `ORQ_KEK_ACTIVE=ORQ_KEK_V2` in Vercel Production (new writes
   will use V2; old reads still try V1 per envelope `kek_id`).

### Re-wrapping all existing ciphertext

After a Vercel redeploy picks up `ORQ_KEK_V2`:

1. Pull the envelope rows:
   ```sql
   -- Count how many rows still reference V1
   select count(*) from public.user_api_keys where kek_id = 'ORQ_KEK_V1' and is_current;
   ```

2. Run the rewrap script (one-shot, idempotent):
   ```bash
   ORQ_KEK_V1="<old>" ORQ_KEK_V2="<new>" \
   ORQ_KEK_ACTIVE=ORQ_KEK_V2 \
   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
   node scripts/rotate-kek.mjs
   ```
   > The script is not shipped in v1 — write when needed. Steps:
   > 1. For each row where `is_current=true`:
   >    - `readEnvelope(vault_secret_id)` → envelope JSON
   >    - `decryptEnvelope(env, { expectedAad })` → plaintext
   >    - `encryptEnvelope({ plaintext, aad })` with active KEK → new envelope
   >    - `updateEnvelope(vault_secret_id, newEnvelope)` → write back
   >    - `update user_api_keys set kek_id = 'ORQ_KEK_V2' where id = <row id>`
   > 2. Log progress, handle decrypt failures (skip and alert).

3. Verify:
   ```sql
   select count(*) from public.user_api_keys where kek_id = 'ORQ_KEK_V1' and is_current;
   -- expect 0
   ```

### Decommissioning V1

After a full rotation pass + audit log review:

1. Remove `ORQ_KEK_V1` from Vercel env (Production, Preview, Development).
2. Redeploy.
3. Any subsequent decrypt attempt referencing `kek_id='ORQ_KEK_V1'` now
   throws `KEK_MISSING`. If you see this in logs, you have stragglers
   that weren't rewrapped — re-run the script.

### Emergency revocation (KEK suspected compromised)

1. Immediately set `SECURITY_GUARD_ENFORCE=true` and rotate KEK per above.
2. Also mark potentially compromised user rows:
   ```sql
   update public.user_api_keys set is_current = false,
     superseded_at = now()
   where created_at > '<suspected compromise window start>';
   ```
3. Email affected users to re-enter their keys.

## Audit log

All security events land in `public.audit_log`:

| Action | When |
|---|---|
| `user_api_keys.INSERT` / `UPDATE` / `DELETE` | Trigger on any key change |
| `KEY_USED` | Server-side decrypt succeeded (resolve-user-key) |
| `KEY_USED_FALLBACK_PLATFORM` | User row exists but decrypt failed — **alert signal** |
| `SECURITY_BLOCKED` | Content guard blocked a request (high severity) |
| `SECURITY_WARNED` | Content guard cleaned + warned (medium severity) |
| `SECURITY_INFO` | Low-severity hygiene flag |
| `IMPORT_STARTED` / `IMPORT_READY` / `IMPORT_BLOCKED` / `IMPORT_APPLIED` / `IMPORT_CANCELLED` | Import flow stages |

RLS split: any authenticated user reads non-security rows (existing
Audit Log page). Only owners read their own `SECURITY_*` rows.

## Observability checklist

- Monitor `audit_log` for non-zero `KEY_USED_FALLBACK_PLATFORM` count — indicates decrypt failures.
- Watch for high `SECURITY_BLOCKED` rates per user — may indicate credential stuffing / abuse.
- Watch `import_keys` rows with `vt_status='malicious'` — VT blocked a file.
- Vercel Functions logs for `vt.disabled` warnings — means `VT_API_KEY` isn't set.
