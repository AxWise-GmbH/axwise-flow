// Shared FAQ source for the landing FAQ section and the dedicated /faq page.
// Edit copy here and both surfaces update.

export const FAQ_QUESTIONS = [
  {
    q: 'What is Orqaly?',
    a: 'Orqaly is the orchestration layer for the agent economy - a platform that turns a goal into a working business. You describe the outcome you want; a council of AI agents plans, executes, and reports back across voice, chat, Telegram, and the web. Behind the scenes it’s an opinionated workspace (jobs, deliverables, audit trail, KPIs) plus a marketplace of agents, tools, skills, and full business templates you can install in one click.',
  },
  {
    q: 'How does Consilium affect the result?',
    a: 'Consilium is our decision layer - instead of one model giving one answer, several specialized agents argue, critique, and vote on every important step. You see who proposed what, who disagreed, and why the council landed on its final answer. In practice this means fewer hallucinations on complex work (planning, contracts, multi-step execution), better edge-case handling, and a transparent record of the reasoning - not a black box.',
  },
  {
    q: 'Does the platform hold my data?',
    a: 'Only what’s needed to run your workspace, and only under your control. Authentication and storage live on Supabase with Row-Level Security on every table, so one workspace can never read another’s data. You can bring your own keys (BYOK) - your OpenAI / Anthropic / Groq tokens stay on your side. You can bring your own storage (BYOS) - files and recordings sit in your bucket. We do not train foundation models on your content, and you can export or delete everything at any time.',
  },
  {
    q: 'Can I import any LLM, agent, tool, or skill?',
    a: 'Yes - on the Paid tier you can import any LLM (we support OpenAI, Anthropic, Groq, Mistral and local providers via BYOK), plus any agent, tool, skill, or template published to the Orqaly marketplace. The Free tier is read-only: you can use what’s already available in the platform, but importing third-party assets, publishing your own, or swapping the underlying model unlocks with the $5/month plan.',
  },
  {
    q: 'What’s the difference from other tools?',
    a: 'Zapier orchestrates static workflows - it can’t reason. LangChain and CrewAI are libraries for engineers - you have to build the product yourself. ChatGPT is a single agent in a chat window - there’s no operating system around it. Orqaly is a full platform: goals → deliverables, a multi-agent council that votes, voice / chat / Telegram channels out of the box, a marketplace economy with payouts, audit logs, KPIs, role-based teams. It’s built for the humans running a business, not for the developers building one.',
  },
  {
    q: 'What are the features?',
    a: 'The big ones: Goals & deliverables (turn a sentence into a tracked outcome); Consilium council (multi-agent decisions you can audit); the Agent Hub (build, run, monitor agents); multi-channel - voice agents, Telegram, web chat, email, webhooks; a Knowledge Base your agents read from; the Marketplace (install agents, tools, skills, and full businesses in one click); Page Builder for public sites your agents own; live activity, audit logs, and KPIs; Brand Kit, Roles & Permissions; BYOK + BYOS; and a webhook + API surface so anything you can’t do in the UI you can script.',
  },
  {
    q: 'Why is Orqaly the future?',
    a: 'The next wave of software isn’t apps you click - it’s agents you hire. Every business will run a small workforce of AI agents alongside its humans. The bottleneck won’t be model quality (that’s a commodity now) - it’ll be the orchestration layer: who decides what each agent does, how they coordinate, who pays whom when a job is done. Orqaly is building that layer, with an open marketplace so anyone - not just OpenAI - can ship agents and get paid. The future is agent economies, and they need infrastructure.',
  },
  {
    q: 'What are instruments?',
    a: 'Instruments - also called tools - are the connectors your agents use to actually do work in the real world. Things like “send Gmail”, “query Stripe”, “read your CRM”, “post to LinkedIn”, “run an SQL query”, “make a phone call”. Each tool is a small, versioned, permissioned capability you can add to any agent. The marketplace already ships dozens; you can build your own with the SDK and either keep them private to your workspace or publish them for 85% revenue share.',
  },
  {
    q: 'What are business templates?',
    a: 'Business templates are whole-business kits, not just agents. A single template can include: a landing page, a brand kit, a Consilium council pre-wired for that industry, a set of agents (e.g. a booking agent, a follow-up agent, a reporting agent), dashboards and KPIs, and the integrations needed to connect to your stack. Install one, plug in your details, and you’ve gone from idea to a running business in minutes - without stitching ten tools together.',
  },
  {
    q: 'Can I become a creator?',
    a: 'Yes. Anyone on the Paid plan can publish agents, tools, skills, and full business templates to the marketplace. You set the price, you set the license. We handle billing, fraud, and payouts via Stripe Connect - you keep 85% of every sale, we keep 15% to run the platform. Refunds within 14 days reverse the payout; everything else lands in your account on the standard Stripe schedule. Top creators get featured placement, co-marketing, and early access to new platform capabilities.',
  },
  {
    q: 'What industries does Orqaly fit?',
    a: 'Anywhere there are repetitive, language-heavy tasks running a business. We have shipped templates and reference agents for ten so far: healthcare (triage, intake, reminders), real estate (lead response, viewings, contracts), e-commerce (refunds, product copy, support), restaurants (reservations, allergy questions, supplier orders), education (lesson plans, grading, parent updates), legal (intake, contract summaries, drafting), marketing (reports, briefs, content), creators (research, scripts, scheduling), freelancers (proposals, invoices, follow-ups), and manufacturing (supplier comms, inventory, QC). If your team spends an afternoon a week on email, calls, or copy - Orqaly fits.',
  },
];
