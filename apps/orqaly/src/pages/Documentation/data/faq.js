/**
 * End-user FAQ for the current Orqaly platform (autonomous AI agent
 * orchestration). Written in plain language for operators and new team members.
 */
export const FAQ_ITEMS = [
  {
    q: 'What is Orqaly and who is it for?',
    a: 'Orqaly is an autonomous AI agent orchestration platform. You hand it a goal, and an AI board (the Consilium) turns that goal into a plan, decomposes it into tasks, assembles a team of AI agents led by a team lead, executes the work through tools and multiple LLM providers, and evaluates the result - all under an organization hierarchy with full cost tracking and an append-only record of everything. It is built for founders, operators, and teams who want an AI-run organization rather than a single chatbot.',
  },
  {
    q: 'How does a goal actually get done?',
    a: 'Work flows through layers: Orchestration -> Consilium (the AI board) -> Teams (each with a team lead) -> Agents -> Tools. A goal is handed to the Consilium, which writes a PRD, decomposes it into tasks, forms a team, picks tools and LLMs, executes, evaluates with a 5-star rating, iterates if needed, and completes. Every step is recorded in the Communicator and the Knowledge Base.',
  },
  {
    q: 'What is the Consilium?',
    a: 'The Consilium is your AI board of directors. It is made up of members with distinct roles - chairman, evaluator, auditor, specialist, and observer - and each member can run on a different LLM. They evaluate work in parallel and reach a decision through consensus rules (unanimous, majority, or weighted), with security scanning, fraud detection, and quarantine for risky decisions. You can attach a Consilium at each level of your organization, with a main board at the top.',
  },
  {
    q: 'What is a team and a team lead?',
    a: 'For each goal, the Consilium forms a team of AI agents and appoints a team lead. The lead coordinates the agents, assigns tasks, and reports progress. Teams are scoped to a board and an organization, and the tools and LLMs a team uses are chosen per goal - in-house options first, external paid services only when justified.',
  },
  {
    q: 'Do I need to know how to code to use it?',
    a: 'No. Creating goals, forming boards, browsing the marketplace, building workflows, and reading reports are all point-and-click. Developers get more: a documented API, an MCP server for connecting external agents, BYOK for their own LLM keys, and a workflow engine. So non-technical operators run the business while engineers extend it.',
  },
  {
    q: 'How does Orqaly keep costs down?',
    a: 'The goal is profit, not sophistication. Orqaly uses a local-LLM-first hybrid policy: cheap or local models handle routine work, and stronger cloud models are used only for hard planning. In-house tools are preferred over paid services. Every LLM call is tracked with token counts and an estimated cost so you can see exactly where money goes.',
  },
  {
    q: 'Which AI models can it use?',
    a: 'Orqaly supports Groq, OpenAI, Anthropic (Claude), Google Gemini, GLM, Qwen, DeepSeek, OpenRouter, and local models via Ollama or any OpenAI-compatible endpoint. If one provider is slow or rate-limited, a fallback chain automatically tries the next. You can bring your own API keys, which are stored with envelope encryption and never leave your control.',
  },
  {
    q: 'What is the Knowledge Base?',
    a: 'The Knowledge Base is the platform memory. Documents, research, and goal outputs are stored and made semantically searchable using vector embeddings (pgvector). Agents read from and write to it, so work compounds over time instead of being lost. You can also connect cloud sources like Dropbox, OneDrive, and Google Drive.',
  },
  {
    q: 'What are Workflows?',
    a: 'Workflows are visual, drag-and-drop automations built from nodes - triggers, conditions, LLM calls, tools, HTTP requests, human-approval steps, cost guards, and sub-agents. Each node can pick its own model, and the engine runs them in dependency order. Use them to wire up repeatable pipelines that agents and humans share.',
  },
  {
    q: 'What is the Communicator?',
    a: 'The Communicator is the command center and the source of truth. It logs all agent activity and messages in an append-only feed that agents cannot edit or delete, organizes conversation into rooms and channels, and connects to external messengers like Telegram. It is how you watch, and audit, everything the organization does.',
  },
  {
    q: 'What is the Marketplace?',
    a: 'The Marketplace is where you install ready-made agents, skill packs, tools, and team or organization templates - and where creators publish their own. Listings carry ratings and usage stats, monetization runs through Stripe Connect on an 85/15 revenue split, and you can import from external catalogs like Composio, OpenRouter, and Hugging Face.',
  },
  {
    q: 'Is my data private and secure?',
    a: 'Yes. Every database table has Row Level Security so users only see their own rows, all API handlers verify a Supabase token before doing anything, and rate limiting protects every endpoint. Bring-your-own-key credentials are protected with AES-256-GCM envelope encryption bound to your account, and there is a full, immutable audit trail.',
  },
  {
    q: 'Can Orqaly make money on its own, and how is my safety guaranteed?',
    a: 'The platform is designed as an autonomous organization built to generate profit. It is constrained by immutable rules enforced by a supervisor layer - not just prompts - so it never harms its creator and cannot quietly edit or delete its own source of truth. Total transparency is a core principle: the append-only record is the ground truth.',
  },
  {
    q: 'How do I get started as a developer?',
    a: 'Clone the repository, run npm install, copy .env.example to your local env file and fill in the Supabase and Groq keys, then run npm run dev (the app serves on port 5176). To connect an external agent, register it, accept it to receive a tracking token, and point your MCP client at the Orqaly MCP server. The Getting Started and AI Agents tabs above have the exact steps.',
  },
];
