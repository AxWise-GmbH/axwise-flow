/**
 * Getting Started content: the orchestration layer flow, a local-dev quickstart,
 * and the Supabase authentication flow.
 */

export const LAYER_FLOW = [
  { name: 'Orchestration', desc: 'Receives a goal and owns its lifecycle end to end.' },
  { name: 'Consilium', desc: 'AI board writes a PRD, decomposes it, and governs quality.' },
  { name: 'Teams', desc: 'A team of agents with a team lead is formed per goal.' },
  { name: 'Agents', desc: 'Agents execute tasks using the assigned models and tools.' },
  { name: 'Tools (MCP)', desc: 'Agents act on the world through MCP tools and integrations.' },
];

export const QUICKSTART_STEPS = [
  {
    step: '1',
    title: 'Install',
    code: `git clone <your-fork> orqaly
cd orqaly
npm install`,
  },
  {
    step: '2',
    title: 'Configure env',
    code: `cp .env.example .env.local
# Fill in Supabase + WORKER_SECRET + ORQ_KEK_V1
# Then choose an LLM_DEFAULT_PROVIDER + MODEL and add its API key
npm run validate-env:strict`,
  },
  {
    step: '3',
    title: 'Run the app',
    code: `npm run dev          # frontend on http://localhost:5176
# or the full local stack (API + web + worker):
npm run dev:local`,
  },
  {
    step: '4',
    title: 'Build & test',
    code: `npm run build        # production build
npm run test         # vitest (single run)
npm run lint         # eslint`,
  },
];

export const AUTH_FLOW_STEPS = [
  {
    step: '1',
    title: 'User visits the app',
    detail: 'AuthProvider initializes and subscribes to Supabase auth state.',
  },
  {
    step: '2',
    title: 'Session resolves',
    detail: 'onAuthStateChange maps the Supabase session to { uid, email, displayName, photoURL }.',
  },
  {
    step: '3',
    title: 'Route protection',
    detail: 'ProtectedRoute checks isAuthenticated and redirects to /login when needed.',
  },
  {
    step: '4',
    title: 'Login / register',
    detail: 'signInWithPassword / signUp, or signInWithOAuth({ provider: "google" }) for OAuth.',
  },
  {
    step: '5',
    title: 'Client sends the token',
    detail: 'Every API request carries Authorization: Bearer <access_token>.',
  },
  {
    step: '6',
    title: 'Backend verifies',
    detail: 'Handlers call verifySupabaseToken(token); no user -> 401. Then rate-limit + validate.',
  },
  {
    step: '7',
    title: 'RLS isolates data',
    detail: 'Queries run under RLS (auth.uid() = user_id), so users only ever see their own rows.',
  },
];
