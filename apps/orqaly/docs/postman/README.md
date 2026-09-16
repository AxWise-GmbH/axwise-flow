# Postman — Orchestrator API

## Import

1. Open Postman.
2. **Import** → **Upload Files** (or drag and drop).
3. Select:
   - `Orqaly-API.postman_collection.json` (required)
   - `Orqaly-Local.postman_environment.json` and/or `Orqaly-Production.postman_environment.json` (optional)

## Environments

- **Orchestrator - Local** — `baseUrl`: `http://localhost:3001` (use when running `npm run dev:api`).
- **Orchestrator - Production** — `baseUrl`: `https://orchestratori.vercel.app`.

Set **supabaseAccessToken** to your Supabase access token (JWT) for:

- `POST /api/transcribe`
- `POST /api/send-email`

Get the token after signing in (e.g. from your app’s auth state or Supabase client session).

## Requests

| Folder / Request      | Method | Auth   | Description                    |
|-----------------------|--------|--------|--------------------------------|
| Health Check          | GET    | No     | Health check                   |
| Transcribe Status     | GET    | No     | Transcription config status    |
| Transcribe Audio      | POST   | Bearer | Transcribe meeting audio       |
| Send Email            | POST   | Bearer | Send email via Resend          |
