# Orchestrator

A partner management app built with React + Vite. Uses Supabase for database and auth when configured; otherwise falls back to localStorage and local auth.

## Installation

```bash
git clone <repo>
cd orchestratori
npm install
cp .env.example .env
# Edit .env with your Supabase credentials (see .env.example)
```

## Running

- **Frontend only:** `npm run dev` – Vite SPA on http://localhost:5176. Most
  `/api` calls use the configured remote API.
- **Full local stack:** `npm run dev:local` – SPA on http://localhost:5176,
  local Vercel-compatible API on http://localhost:3001, and the local worker
  loop. This requires `.env.local`; `WORKER_SECRET` enables the worker.
- **Build:** `npm run build`
- **Preview:** `npm run preview`
- **Lint:** `npm run lint`

Queued goal stages are normally woken immediately by a server-to-server call
to the current Vercel deployment, authenticated with `WORKER_SECRET`. The
credential never enters the browser or a third-party delivery service. Vercel
Cron and the local worker remain the durable fallback when an immediate wake-up
cannot be sent.

## Docker topology

For the supported containerized development stack:

```bash
cp .env.example .env.local
# Fill in the required Supabase and WORKER_SECRET settings.
docker compose up --build
```

Compose runs the same SPA + API + worker command as `npm run dev:local` in one
development container. Source files and `.env.local` are bind-mounted; the
container keeps dependencies in a named volume. If dependencies change, run
`docker compose build --no-cache` and recreate the `node_modules` volume.

The default `Dockerfile` output is intentionally a static SPA image on port 4173. It does not contain the API or worker; production uses Vercel serverless
handlers plus the configured worker/Supabase services. Pass public Vite values
as build arguments when building the static image:

```bash
docker build -t orchestratori \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  --build-arg VITE_API_URL="$VITE_API_URL" .
docker run --rm -p 4173:4173 orchestratori
```

## Supabase Setup

1. Create a [Supabase](https://supabase.com) project.
2. Run `supabase/migrations/001_initial_schema.sql` in the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql).
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from Project Settings → API).
4. With Supabase configured, partners, meetings, workflows, and partner history persist to Supabase instead of localStorage.

## Meeting transcription (real AI)

Recordings can be transcribed and summarized with AI instead of sample data. Use **one** of:

- **OpenAI:** set **OPENAI_API_KEY** in Vercel (and locally in `.env`). Get a key from [OpenAI API keys](https://platform.openai.com/api-keys). Uses Whisper + GPT-4o-mini.
- **AssemblyAI + Groq (free tier):** set **ASSEMBLYAI_API_KEY** and **GROQ_API_KEY** in Vercel (and in `.env` locally). Get keys from [AssemblyAI](https://www.assemblyai.com/) and [Groq](https://console.groq.com/). Uses AssemblyAI for transcription and Groq (Llama) for structuring.

Deploy or run `vercel dev` / `npm run dev` so `/api/transcribe` is available. After a recording is processed, the app shows a real summary, key topics, action items, and suggested partner updates. Without any of these keys, new recordings still complete but use demo/sample summaries.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Proprietary. All rights reserved.

---

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
