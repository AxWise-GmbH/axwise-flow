// Persona data for /solutions/:industry pages.
// Mirrors the 10 industries shown in the landing's WhoItsFor carousel
// without coupling that section's animation logic to route rendering.

export const PERSONAS = [
  {
    slug: 'healthcare',
    label: 'Healthcare',
    iconName: 'LocalHospitalOutlined',
    teaser: {
      headline: 'Patients onboarded in minutes, not days.',
      desc: 'Voice triage, reminders, and insurance checks - without hiring at the desk.',
    },
    hero: {
      eyebrow: 'For Healthcare',
      title: 'Onboard patients in minutes, not days.',
      subtitle:
        'Voice triage, reminders, and insurance pre-checks - handled by agents that work the front desk while your team focuses on care.',
    },
    pains: [
      'Front-desk burnout from triage and rebooking calls',
      'Insurance pre-checks eating into clinical time',
      'No-shows from missed appointment reminders',
      'Patient intake forms abandoned mid-flow',
    ],
    agents: [
      {
        name: 'Triage voice agent',
        desc: 'Answers calls 24/7, routes urgent cases, books appointments.',
      },
      {
        name: 'Reminder agent',
        desc: 'SMS + voice reminders 24h and 1h before, with one-tap reschedule.',
      },
      {
        name: 'Insurance pre-check agent',
        desc: 'Verifies coverage and prior-auth status before the visit.',
      },
      {
        name: 'Intake summary agent',
        desc: 'Turns intake forms into a structured chart-ready summary.',
      },
    ],
    prompts: [
      'I want an agent that answers our clinic phone after hours and books next-day appointments.',
      'Build a reminder flow that drops no-shows by half.',
      'Pre-check insurance for tomorrow’s patient list and flag anything missing.',
    ],
  },
  {
    slug: 'real-estate',
    label: 'Real estate',
    iconName: 'HomeWorkOutlined',
    teaser: {
      headline: 'Every lead gets a reply in under a minute.',
      desc: 'Listing questions, viewings, and drafts while you are still in showings.',
    },
    hero: {
      eyebrow: 'For Real Estate',
      title: 'Every lead answered in under a minute.',
      subtitle:
        'Listing Q&A, viewing bookings, and contract drafts - handled while you’re on the road.',
    },
    pains: [
      'Leads going cold while you’re in showings',
      'Repetitive listing questions eating evenings',
      'Manual viewing calendars and follow-ups',
      'Contract drafts and disclosures by hand',
    ],
    agents: [
      {
        name: 'Listing concierge',
        desc: 'Answers listing questions on WhatsApp, SMS, and your site.',
      },
      {
        name: 'Viewing booker',
        desc: 'Books, reschedules, and confirms viewings against your calendar.',
      },
      {
        name: 'Follow-up agent',
        desc: 'Nurtures cold leads with personalized check-ins for 30 days.',
      },
      {
        name: 'Contract drafter',
        desc: 'Generates standard offer letters and disclosures from your template.',
      },
    ],
    prompts: [
      'Reply to every Zillow lead in under 60 seconds with viewing options.',
      'Draft a buyer offer letter from this conversation.',
      'Follow up with last month’s warm leads and book viewings.',
    ],
  },
  {
    slug: 'ecommerce',
    label: 'E-commerce',
    iconName: 'StorefrontOutlined',
    teaser: {
      headline: 'Orders tracked. Suppliers answered.',
      desc: 'Fulfillment updates, supplier chat, and returns - without living in your inbox.',
    },
    hero: {
      eyebrow: 'For E-commerce',
      title: 'Orders tracked. Suppliers answered. Support handled.',
      subtitle:
        'Dropship routing, supplier bots, status triggers with CRM sync, and returns cleared overnight.',
    },
    pains: [
      'Supplier messages scattered across WhatsApp, email, and supplier portals',
      '"Where is my order?" tickets before tracking updates land',
      'Delayed shipments discovered only when a customer complains',
      'CRM and support inbox out of sync with live order status',
    ],
    agents: [
      {
        name: 'Order status agent',
        desc: 'Watches fulfillment, fires proactive updates on triggers, and syncs CRM.',
      },
      {
        name: 'Supply chain bot',
        desc: 'Handles supplier chat: stock checks, PO confirmations, and lead-time slips.',
      },
      {
        name: 'Support concierge',
        desc: 'Answers WISMO, sizing, and policy across channels; escalates edge cases only.',
      },
      {
        name: 'Returns agent',
        desc: 'Reviews returns against policy, refunds eligible orders, escalates the rest.',
      },
    ],
    prompts: [
      'Notify every delayed order from yesterday and log notes in CRM.',
      'Confirm stock with Shenzhen Fulfillment for all open POs and log tracking.',
      'Clear the refund queue tonight and email customers approved status.',
    ],
  },
  {
    slug: 'restaurants',
    label: 'Hotels',
    iconName: 'RestaurantOutlined',
    teaser: {
      headline: 'Guest requests land before the front desk.',
      desc: 'Housekeeping, room service, and partner bookings from one thread.',
    },
    hero: {
      eyebrow: 'For Hotels & Restaurants',
      title: 'Guest requests handled. Housekeeping routed. Partners bookable.',
      subtitle:
        'Housekeeping, room service, guest extras, and a partner services catalog - plus restaurant reservations from one inbox.',
    },
    pains: [
      'Guest requests lost between front desk, housekeeping, and kitchen',
      'Room service and restaurant orders duplicated across phone and chat',
      'Spa, transfers, and extras handled ad hoc with no audit trail',
      'Local partner services not discoverable or bookable for guests',
    ],
    agents: [
      {
        name: 'Housekeeping coordinator',
        desc: 'Routes room requests, turndown, and maintenance tickets to staff.',
      },
      {
        name: 'Room service agent',
        desc: 'Takes food orders from your menu, notes allergies, confirms to kitchen.',
      },
      {
        name: 'Guest services concierge',
        desc: 'Late checkout, spa, transfers - escalates edge cases only.',
      },
      {
        name: 'Partner catalog agent',
        desc: 'Surfaces partner services from your catalog and books for guests.',
      },
    ],
    prompts: [
      'Route all open housekeeping tickets for floor 4 and confirm ETAs to guests.',
      'Book an airport transfer from our partner catalog for room 412 checkout at 11am.',
      'Answer reservation calls during service and confirm by SMS.',
    ],
  },
  {
    slug: 'education',
    label: 'Education',
    iconName: 'SchoolOutlined',
    teaser: {
      headline: 'Summaries done. Paths suggested. Calendar intact.',
      desc: 'Lesson plans, grading, and parent updates in your voice.',
    },
    hero: {
      eyebrow: 'For Education',
      title: 'Summaries written. Paths suggested. Calendar kept.',
      subtitle:
        'Education summaries, future guidance, knowledge base, teaching calendar, lesson plans, and grading - in your voice.',
    },
    pains: [
      'Hours lost to admin: summaries, reports, and parent emails',
      'Student potential buried in spreadsheets - no time for guidance conversations',
      'Curriculum and rubrics scattered; agents can’t find the right source',
      'Teacher calendar split across lesson prep, grading, and parent meetings',
    ],
    agents: [
      {
        name: 'Lesson planner',
        desc: 'Drafts weekly plans aligned to your curriculum and rubric.',
      },
      {
        name: 'Student summary agent',
        desc: 'Writes term and per-student education summaries from grades and notes.',
      },
      {
        name: 'Future path advisor',
        desc: 'Suggests courses, enrichment, and next steps from student strengths.',
      },
      {
        name: 'Knowledge base curator',
        desc: 'Indexes curriculum, rubrics, and policies for accurate agent answers.',
      },
      {
        name: 'Calendar coordinator',
        desc: 'Manages teaching calendar: lessons, grading blocks, parent conferences.',
      },
      {
        name: 'Grading & feedback agent',
        desc: 'Personalized feedback and parent updates in the teacher’s voice.',
      },
    ],
    prompts: [
      'Write Term 2 summaries for Year 8 history and flag students who need enrichment.',
      'Suggest next-term courses for Maya based on her essay strengths and interests.',
      'Index our Unit 3.4 rubric and past lessons into the knowledge base.',
    ],
  },
  {
    slug: 'legal',
    label: 'Legal',
    iconName: 'GavelOutlined',
    teaser: {
      headline: 'Your legal co-pilot. Partners still sign off.',
      desc: 'Ecosystem maps, structured memos, and an encrypted vault your team trusts.',
    },
    hero: {
      eyebrow: 'For Legal',
      title: 'Your legal AI co-pilot. Specialists stay in the loop.',
      subtitle:
        'Map the ecosystem, build org units, produce structured reports grounded in local law, attend meetings, and keep every contract encrypted - with real lawyers approving what goes out.',
    },
    pains: [
      'Client groups and subsidiaries scattered - no single map of who owns what, where',
      'Research and memos rebuilt from scratch; jurisdiction rules live in people’s heads',
      'Meetings generate action items that never reach the matter file',
      'Contracts and PII spread across email, drives, and chat with no encryption story',
    ],
    agents: [
      {
        name: 'Ecosystem analyst',
        desc: 'Maps entities, relationships, and proposed org units across a client group.',
      },
      {
        name: 'Legal report agent',
        desc: 'Produces structured memos and due diligence reports with risk registers.',
      },
      {
        name: 'Jurisdiction researcher',
        desc: 'Answers and drafts from local-law knowledge base; flags missing precedent.',
      },
      {
        name: 'Specialist liaison',
        desc: 'Prepares briefs for partners and external counsel; tracks review and sign-off.',
      },
      {
        name: 'Meeting agent',
        desc: 'Attends calls, summarises decisions, links action items to matters.',
      },
      {
        name: 'Vault & compliance agent',
        desc: 'Manages encrypted document storage, PII handling, and audit trails.',
      },
    ],
    prompts: [
      'Map this client’s corporate group and propose org units for the new EU subsidiary.',
      'Draft a structured due diligence memo for the Acme acquisition - EU and UK jurisdiction.',
      'Summarise today’s client call and add action items to matter #4421.',
    ],
  },
  {
    slug: 'marketing',
    label: 'Marketing',
    iconName: 'CampaignOutlined',
    teaser: {
      headline: 'Ship the content. Explain the numbers.',
      desc: 'SMM packs, performance reports, and traffic plans clients actually read.',
    },
    hero: {
      eyebrow: 'For Marketing',
      title: 'Content shipped. Metrics explained. Traffic planned.',
      subtitle:
        'SMM packs, posting strategy, generated content, CPA/ROI/LTV reports, and partner traffic concepts - while your team focuses on creative.',
    },
    pains: [
      'SMM deliverables rebuilt from scratch every client - no reusable pack or strategy doc',
      'Content calendars full of placeholders; posting strategy lives in someone’s head',
      'Performance data scattered - CPA, ROI, and LTV never in one client-ready report',
      'Partner and paid traffic plans ad hoc; no structured concept before budget goes out',
    ],
    agents: [
      {
        name: 'SMM pack builder',
        desc: 'Assembles channel mix, formats, captions, and creative briefs.',
      },
      { name: 'Strategy agent', desc: 'Posting cadence, themes, and funnel mapping per channel.' },
      { name: 'Content agent', desc: 'Ads, posts, emails, and scripts in brand voice.' },
      {
        name: 'Metrics analyst',
        desc: 'CPA, COC, ROI, LTV, and ROAS reports with recommendations.',
      },
      {
        name: 'Partner traffic planner',
        desc: 'Affiliate and partner buy concepts with caps and geo splits.',
      },
      { name: 'Campaign monitor', desc: 'Watches spend and conversion; pages team on drift.' },
    ],
    prompts: [
      'Build an SMM pack for Acme Co - LinkedIn, IG, and email for May.',
      'Write the weekly performance report with CPA, ROI, and LTV vs. last month.',
      'Draft a partner traffic concept for DE and UK - Revshare, €50k cap.',
    ],
  },
  {
    slug: 'creators',
    label: 'Creators',
    iconName: 'VideocamOutlined',
    teaser: {
      headline: 'One studio stack for every platform.',
      desc: 'Research through publish - plus repurposing and sponsor deliverables.',
    },
    hero: {
      eyebrow: 'For Creators & Media Teams',
      title: 'One studio stack. Every platform covered.',
      subtitle:
        'Research, scripts, scheduling, repurposing, community, and sponsor deliverables - multiple services wired into one finished workflow for your company.',
    },
    pains: [
      'Creator ops split across Notion, Slack, and spreadsheets - no single pipeline from brief to publish',
      'One long-form piece never becomes shorts, posts, and newsletter - repurposing is manual',
      'Brand deals and sponsor deliverables tracked in email; deadlines slip',
      'Community DMs and comments pile up while the team is in production',
      'Leadership asks for performance numbers; metrics live in five different dashboards',
    ],
    agents: [
      {
        name: 'Research agent',
        desc: 'Trending topics, angles, and competitor snapshots per niche.',
      },
      { name: 'Scriptwriter', desc: 'Video, podcast, and live scripts in each creator’s voice.' },
      { name: 'Schedule agent', desc: 'Multi-platform calendar and publishing queue.' },
      {
        name: 'Repurpose agent',
        desc: 'Turns long-form into clips, posts, threads, and newsletter blocks.',
      },
      { name: 'Community agent', desc: 'Comments and DMs in brand voice; escalates partnerships.' },
      {
        name: 'Studio ops agent',
        desc: 'Sponsor deliverables, deadlines, and performance reports for leadership.',
      },
    ],
    prompts: [
      'Build next week’s content calendar for all three Northwind creators across IG, TikTok, and YouTube.',
      'Repurpose yesterday’s 20-minute YouTube video into five short-form assets.',
      'Send the May studio performance report with reach, engagement, and sponsor ROI.',
    ],
  },
  {
    slug: 'freelancers',
    label: 'Freelancers',
    iconName: 'BadgeOutlined',
    teaser: {
      headline: 'Proposals, invoices, follow-ups - handled.',
      desc: 'Turn calls into proposals and nudge late payers without the awkward email.',
    },
    hero: {
      eyebrow: 'For Freelancers',
      title: 'Proposals, invoices, follow-ups - on autopilot.',
      subtitle: 'Proposal drafts, invoice generation, and gentle nudges to slow-paying clients.',
    },
    pains: [
      'Proposals written from scratch each time',
      'Invoices delayed until the weekend',
      'Slow-paying clients you don’t want to nag',
      'Discovery calls without notes',
    ],
    agents: [
      { name: 'Proposal agent', desc: 'Drafts proposals from a discovery call in minutes.' },
      { name: 'Invoice agent', desc: 'Generates and sends invoices from logged hours.' },
      { name: 'Follow-up agent', desc: 'Nudges overdue invoices with polite, escalating tone.' },
      {
        name: 'Discovery notetaker',
        desc: 'Joins your calls, writes the brief, and emails it to the client.',
      },
    ],
    prompts: [
      'Turn this Zoom call into a proposal and SOW.',
      'Send invoices for last week’s logged hours.',
      'Nudge clients with invoices overdue 14+ days.',
    ],
  },
  {
    slug: 'manufacturing',
    label: 'Manufacturing',
    iconName: 'PrecisionManufacturingOutlined',
    teaser: {
      headline: 'Suppliers, stock, and QC in one inbox.',
      desc: 'Supplier threads, inventory answers, and QC trends your floor can act on.',
    },
    hero: {
      eyebrow: 'For Manufacturing',
      title: 'Supplier emails, inventory, QC - one inbox.',
      subtitle: 'Supplier comms, inventory queries, and QC logs threaded into one workspace.',
    },
    pains: [
      'Supplier emails scattered across people',
      'Inventory questions interrupting the floor',
      'QC logs in spreadsheets nobody reads',
      'Lead-time changes lost in the inbox',
    ],
    agents: [
      {
        name: 'Supplier agent',
        desc: 'Answers supplier questions, negotiates lead times, threads emails.',
      },
      {
        name: 'Inventory agent',
        desc: 'Answers stock questions from chat and flags reorder points.',
      },
      { name: 'QC log agent', desc: 'Reads QC reports, summarizes trends, escalates anomalies.' },
      {
        name: 'Lead-time tracker',
        desc: 'Watches inbound POs and pages the planner when slips happen.',
      },
    ],
    prompts: [
      'Reply to all supplier emails from this week and update lead times.',
      'Tell me which raw materials will run out before month-end.',
      'Summarize this month’s QC logs and flag the top three issues.',
    ],
  },
];

export const PERSONA_BY_SLUG = Object.fromEntries(PERSONAS.map((p) => [p.slug, p]));
