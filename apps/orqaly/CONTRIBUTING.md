# Contributing to Orchestrator

Thank you for your interest in contributing. Please follow these guidelines.

## Development Setup

1. Clone the repo and run `npm install`
2. Copy `.env.example` to `.env` and fill in required variables
3. Run `npm run dev` for the app + local API
4. For Supabase, run migrations in the SQL Editor (see README)

## Pull Request Process

1. Create a branch from `main`
2. Make your changes; ensure `npm run lint` passes
3. Add tests for new features when applicable
4. Update docs if behavior changes
5. Open a PR with a clear description

## Code Style

- Use ESLint (config in `eslint.config.js`)
- Prefer existing patterns in the codebase
- Keep functions small and focused

## Testing

- Run `npm run test` before committing (when tests exist)
- Test critical flows manually (auth, partner CRUD, meetings)

## Questions

Open an issue for questions or feature discussions.
