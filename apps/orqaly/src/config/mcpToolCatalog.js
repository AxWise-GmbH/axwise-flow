/**
 * MCP Tool Catalog — curated Composio apps for agent teams.
 *
 * ~80 apps across 13 subcategories. Each entry is lightweight metadata;
 * full action schemas are fetched from Composio SDK at runtime.
 *
 * Tool ID convention: mcp-{service-name}
 * Composio app names: lowercase identifiers used by Composio API
 *
 * Per-entry safety fields (used by agent_connected_libraries flow):
 *   endpointUrl       — canonical API base; weekly VirusTotal re-scan target
 *   riskTier          — 'low' | 'medium' | 'high'  (drives connect-time confirmation)
 *   actionsSafe[]     — enabled-by-default at connect (read-only / harmless)
 *   actionsSensitive[]— disabled at connect; user must opt in per action
 *   actions[]         — back-compat union of safe + sensitive (used by tool-runner)
 */

// ── Communication ────────────────────────────────────────────────

const MCP_DISCORD = {
  id: 'mcp-discord',
  composioApp: 'discord',
  name: 'Discord',
  description: 'Send messages, manage channels, and coordinate communities on Discord.',
  subcategory: 'Communication',
  popular: true,
  endpointUrl: 'https://discord.com/api',
  riskTier: 'medium',
  actionsSafe: ['DISCORD_LIST_GUILDS'],
  actionsSensitive: ['DISCORD_SEND_MESSAGE', 'DISCORD_CREATE_CHANNEL'],
  actions: ['DISCORD_SEND_MESSAGE', 'DISCORD_LIST_GUILDS', 'DISCORD_CREATE_CHANNEL'],
};

const MCP_TEAMS = {
  id: 'mcp-teams',
  composioApp: 'microsoft-teams',
  name: 'Microsoft Teams',
  description: 'Send messages, manage channels, and coordinate team collaboration.',
  subcategory: 'Communication',
  popular: false,
  endpointUrl: 'https://graph.microsoft.com',
  riskTier: 'medium',
  actionsSafe: ['MICROSOFT-TEAMS_LIST_CHANNELS'],
  actionsSensitive: ['MICROSOFT-TEAMS_SEND_MESSAGE'],
  actions: ['MICROSOFT-TEAMS_SEND_MESSAGE', 'MICROSOFT-TEAMS_LIST_CHANNELS'],
};

const MCP_TWILIO = {
  id: 'mcp-twilio',
  composioApp: 'twilio',
  name: 'Twilio',
  description: 'Send SMS messages, make calls, and manage communication workflows.',
  subcategory: 'Communication',
  popular: false,
  endpointUrl: 'https://api.twilio.com',
  riskTier: 'high',
  actionsSafe: [],
  actionsSensitive: ['TWILIO_SEND_SMS', 'TWILIO_MAKE_CALL'],
  actions: ['TWILIO_SEND_SMS', 'TWILIO_MAKE_CALL'],
};

const MCP_SENDGRID = {
  id: 'mcp-sendgrid',
  composioApp: 'sendgrid',
  name: 'SendGrid',
  description: 'Send transactional and marketing emails at scale.',
  subcategory: 'Communication',
  popular: false,
  endpointUrl: 'https://api.sendgrid.com',
  riskTier: 'high',
  actionsSafe: ['SENDGRID_LIST_CONTACTS'],
  actionsSensitive: ['SENDGRID_SEND_EMAIL'],
  actions: ['SENDGRID_SEND_EMAIL', 'SENDGRID_LIST_CONTACTS'],
};

const MCP_TELEGRAM = {
  id: 'mcp-telegram',
  composioApp: 'telegram',
  name: 'Telegram',
  description: 'Send messages, manage bots, and automate Telegram channels.',
  subcategory: 'Communication',
  popular: false,
  endpointUrl: 'https://api.telegram.org',
  riskTier: 'medium',
  actionsSafe: ['TELEGRAM_GET_UPDATES'],
  actionsSensitive: ['TELEGRAM_SEND_MESSAGE'],
  actions: ['TELEGRAM_SEND_MESSAGE', 'TELEGRAM_GET_UPDATES'],
};

const MCP_WHATSAPP = {
  id: 'mcp-whatsapp',
  composioApp: 'whatsapp',
  name: 'WhatsApp',
  description: 'Send messages and manage business communication via WhatsApp.',
  subcategory: 'Communication',
  popular: false,
  endpointUrl: 'https://graph.facebook.com',
  riskTier: 'high',
  actionsSafe: [],
  actionsSensitive: ['WHATSAPP_SEND_MESSAGE'],
  actions: ['WHATSAPP_SEND_MESSAGE'],
};

// ── Development ──────────────────────────────────────────────────

const MCP_GITHUB = {
  id: 'mcp-github',
  composioApp: 'github',
  name: 'GitHub',
  description: 'Manage repositories, issues, PRs, and code on GitHub.',
  subcategory: 'Development',
  popular: true,
  endpointUrl: 'https://api.github.com',
  riskTier: 'medium',
  actionsSafe: ['GITHUB_LIST_REPOS', 'GITHUB_GET_FILE_CONTENT'],
  actionsSensitive: ['GITHUB_CREATE_ISSUE', 'GITHUB_CREATE_PULL_REQUEST'],
  actions: [
    'GITHUB_CREATE_ISSUE',
    'GITHUB_LIST_REPOS',
    'GITHUB_CREATE_PULL_REQUEST',
    'GITHUB_GET_FILE_CONTENT',
  ],
};

const MCP_GITLAB = {
  id: 'mcp-gitlab',
  composioApp: 'gitlab',
  name: 'GitLab',
  description: 'Manage projects, merge requests, and CI/CD pipelines on GitLab.',
  subcategory: 'Development',
  popular: false,
  endpointUrl: 'https://gitlab.com/api',
  riskTier: 'medium',
  actionsSafe: ['GITLAB_LIST_PROJECTS', 'GITLAB_LIST_MERGE_REQUESTS'],
  actionsSensitive: ['GITLAB_CREATE_ISSUE'],
  actions: ['GITLAB_LIST_PROJECTS', 'GITLAB_CREATE_ISSUE', 'GITLAB_LIST_MERGE_REQUESTS'],
};

const MCP_BITBUCKET = {
  id: 'mcp-bitbucket',
  composioApp: 'bitbucket',
  name: 'Bitbucket',
  description: 'Manage repositories and pull requests on Bitbucket.',
  subcategory: 'Development',
  popular: false,
  endpointUrl: 'https://api.bitbucket.org',
  riskTier: 'medium',
  actionsSafe: ['BITBUCKET_LIST_REPOS'],
  actionsSensitive: ['BITBUCKET_CREATE_PULL_REQUEST'],
  actions: ['BITBUCKET_LIST_REPOS', 'BITBUCKET_CREATE_PULL_REQUEST'],
};

const MCP_JIRA = {
  id: 'mcp-jira',
  composioApp: 'jira',
  name: 'Jira',
  description: 'Create and manage issues, sprints, and project boards in Jira.',
  subcategory: 'Development',
  popular: true,
  endpointUrl: 'https://api.atlassian.com',
  riskTier: 'medium',
  actionsSafe: ['JIRA_SEARCH_ISSUES', 'JIRA_LIST_PROJECTS'],
  actionsSensitive: ['JIRA_CREATE_ISSUE'],
  actions: ['JIRA_CREATE_ISSUE', 'JIRA_SEARCH_ISSUES', 'JIRA_LIST_PROJECTS'],
};

const MCP_SENTRY = {
  id: 'mcp-sentry',
  composioApp: 'sentry',
  name: 'Sentry',
  description: 'Monitor errors, track issues, and manage application health.',
  subcategory: 'Development',
  popular: false,
  endpointUrl: 'https://sentry.io/api',
  riskTier: 'medium',
  actionsSafe: ['SENTRY_LIST_ISSUES'],
  actionsSensitive: ['SENTRY_RESOLVE_ISSUE'],
  actions: ['SENTRY_LIST_ISSUES', 'SENTRY_RESOLVE_ISSUE'],
};

const MCP_NETLIFY = {
  id: 'mcp-netlify',
  composioApp: 'netlify',
  name: 'Netlify',
  description: 'Deploy sites, manage domains, and trigger builds on Netlify.',
  subcategory: 'Development',
  popular: false,
  endpointUrl: 'https://api.netlify.com',
  riskTier: 'high',
  actionsSafe: ['NETLIFY_LIST_SITES'],
  actionsSensitive: ['NETLIFY_TRIGGER_DEPLOY'],
  actions: ['NETLIFY_LIST_SITES', 'NETLIFY_TRIGGER_DEPLOY'],
};

const MCP_CLOUDFLARE = {
  id: 'mcp-cloudflare',
  composioApp: 'cloudflare',
  name: 'Cloudflare',
  description: 'Manage DNS, zones, and security settings on Cloudflare.',
  subcategory: 'Development',
  popular: false,
  endpointUrl: 'https://api.cloudflare.com',
  riskTier: 'high',
  actionsSafe: ['CLOUDFLARE_LIST_ZONES', 'CLOUDFLARE_LIST_DNS'],
  actionsSensitive: ['CLOUDFLARE_CREATE_DNS'],
  actions: ['CLOUDFLARE_LIST_ZONES', 'CLOUDFLARE_LIST_DNS', 'CLOUDFLARE_CREATE_DNS'],
};

// ── Productivity ─────────────────────────────────────────────────

const MCP_GOOGLE_DRIVE = {
  id: 'mcp-google-drive',
  composioApp: 'googledrive',
  name: 'Google Drive',
  description: 'Manage files, folders, and shared drives on Google Drive.',
  subcategory: 'Productivity',
  popular: true,
  endpointUrl: 'https://www.googleapis.com',
  riskTier: 'medium',
  actionsSafe: ['GOOGLEDRIVE_LIST_FILES'],
  actionsSensitive: ['GOOGLEDRIVE_CREATE_FILE'],
  actions: ['GOOGLEDRIVE_LIST_FILES', 'GOOGLEDRIVE_CREATE_FILE'],
};

const MCP_GOOGLE_SHEETS = {
  id: 'mcp-google-sheets',
  composioApp: 'googlesheets',
  name: 'Google Sheets',
  description: 'Read and write data in Google Sheets spreadsheets.',
  subcategory: 'Productivity',
  popular: true,
  endpointUrl: 'https://sheets.googleapis.com',
  riskTier: 'medium',
  actionsSafe: ['GOOGLESHEETS_READ_RANGE'],
  actionsSensitive: ['GOOGLESHEETS_WRITE_RANGE'],
  actions: ['GOOGLESHEETS_READ_RANGE', 'GOOGLESHEETS_WRITE_RANGE'],
};

const MCP_GOOGLE_CALENDAR = {
  id: 'mcp-google-calendar',
  composioApp: 'googlecalendar',
  name: 'Google Calendar',
  description: 'Manage events, schedules, and calendar invites.',
  subcategory: 'Productivity',
  popular: false,
  endpointUrl: 'https://www.googleapis.com',
  riskTier: 'medium',
  actionsSafe: ['GOOGLECALENDAR_LIST_EVENTS'],
  actionsSensitive: ['GOOGLECALENDAR_CREATE_EVENT'],
  actions: ['GOOGLECALENDAR_LIST_EVENTS', 'GOOGLECALENDAR_CREATE_EVENT'],
};

const MCP_AIRTABLE = {
  id: 'mcp-airtable',
  composioApp: 'airtable',
  name: 'Airtable',
  description: 'Manage databases, records, and views in Airtable.',
  subcategory: 'Productivity',
  popular: true,
  endpointUrl: 'https://api.airtable.com',
  riskTier: 'medium',
  actionsSafe: ['AIRTABLE_LIST_RECORDS'],
  actionsSensitive: ['AIRTABLE_CREATE_RECORD', 'AIRTABLE_UPDATE_RECORD'],
  actions: ['AIRTABLE_LIST_RECORDS', 'AIRTABLE_CREATE_RECORD', 'AIRTABLE_UPDATE_RECORD'],
};

const MCP_TODOIST = {
  id: 'mcp-todoist',
  composioApp: 'todoist',
  name: 'Todoist',
  description: 'Manage tasks, projects, and productivity workflows.',
  subcategory: 'Productivity',
  popular: false,
  endpointUrl: 'https://api.todoist.com',
  riskTier: 'low',
  actionsSafe: ['TODOIST_LIST_TASKS'],
  actionsSensitive: ['TODOIST_CREATE_TASK', 'TODOIST_COMPLETE_TASK'],
  actions: ['TODOIST_LIST_TASKS', 'TODOIST_CREATE_TASK', 'TODOIST_COMPLETE_TASK'],
};

const MCP_ASANA = {
  id: 'mcp-asana',
  composioApp: 'asana',
  name: 'Asana',
  description: 'Manage projects, tasks, and team workflows in Asana.',
  subcategory: 'Productivity',
  popular: false,
  endpointUrl: 'https://app.asana.com/api',
  riskTier: 'medium',
  actionsSafe: ['ASANA_LIST_TASKS'],
  actionsSensitive: ['ASANA_CREATE_TASK'],
  actions: ['ASANA_LIST_TASKS', 'ASANA_CREATE_TASK'],
};

// ── Data & Storage ───────────────────────────────────────────────

const MCP_SUPABASE = {
  id: 'mcp-supabase',
  composioApp: 'supabase',
  name: 'Supabase (External)',
  description: 'Query tables, insert rows, and manage data on external Supabase projects.',
  subcategory: 'Data & Storage',
  popular: false,
  endpointUrl: 'https://supabase.com',
  riskTier: 'high',
  actionsSafe: ['SUPABASE_QUERY_TABLE'],
  actionsSensitive: ['SUPABASE_INSERT_ROW'],
  actions: ['SUPABASE_QUERY_TABLE', 'SUPABASE_INSERT_ROW'],
};

const MCP_FIREBASE = {
  id: 'mcp-firebase',
  composioApp: 'firebase',
  name: 'Firebase',
  description: 'Read and write documents in Firestore databases.',
  subcategory: 'Data & Storage',
  popular: false,
  endpointUrl: 'https://firebase.googleapis.com',
  riskTier: 'medium',
  actionsSafe: ['FIREBASE_GET_DOCUMENT', 'FIREBASE_LIST_DOCUMENTS'],
  actionsSensitive: [],
  actions: ['FIREBASE_GET_DOCUMENT', 'FIREBASE_LIST_DOCUMENTS'],
};

const MCP_MONGODB = {
  id: 'mcp-mongodb',
  composioApp: 'mongodb',
  name: 'MongoDB',
  description: 'Query and manage documents in MongoDB Atlas databases.',
  subcategory: 'Data & Storage',
  popular: false,
  endpointUrl: 'https://cloud.mongodb.com',
  riskTier: 'high',
  actionsSafe: ['MONGODB_FIND_DOCUMENTS'],
  actionsSensitive: ['MONGODB_INSERT_DOCUMENT'],
  actions: ['MONGODB_FIND_DOCUMENTS', 'MONGODB_INSERT_DOCUMENT'],
};

const MCP_PINECONE = {
  id: 'mcp-pinecone',
  composioApp: 'pinecone',
  name: 'Pinecone',
  description: 'Query and upsert vectors in Pinecone vector databases.',
  subcategory: 'Data & Storage',
  popular: false,
  endpointUrl: 'https://api.pinecone.io',
  riskTier: 'medium',
  actionsSafe: ['PINECONE_QUERY_VECTORS'],
  actionsSensitive: ['PINECONE_UPSERT_VECTORS'],
  actions: ['PINECONE_QUERY_VECTORS', 'PINECONE_UPSERT_VECTORS'],
};

// ── AI & ML ──────────────────────────────────────────────────────

const MCP_OPENAI = {
  id: 'mcp-openai',
  composioApp: 'openai',
  name: 'OpenAI',
  description: 'Generate text, images, and embeddings via OpenAI API.',
  subcategory: 'AI & ML',
  popular: true,
  endpointUrl: 'https://api.openai.com',
  riskTier: 'medium',
  actionsSafe: [],
  actionsSensitive: ['OPENAI_CHAT_COMPLETION', 'OPENAI_CREATE_EMBEDDING', 'OPENAI_GENERATE_IMAGE'],
  actions: ['OPENAI_CHAT_COMPLETION', 'OPENAI_CREATE_EMBEDDING', 'OPENAI_GENERATE_IMAGE'],
};

const MCP_STABILITY = {
  id: 'mcp-stability',
  composioApp: 'stabilityai',
  name: 'Stability AI',
  description: 'Generate and upscale images with Stable Diffusion models.',
  subcategory: 'AI & ML',
  popular: false,
  endpointUrl: 'https://api.stability.ai',
  riskTier: 'medium',
  actionsSafe: [],
  actionsSensitive: ['STABILITYAI_GENERATE_IMAGE', 'STABILITYAI_UPSCALE_IMAGE'],
  actions: ['STABILITYAI_GENERATE_IMAGE', 'STABILITYAI_UPSCALE_IMAGE'],
};

const MCP_REPLICATE = {
  id: 'mcp-replicate',
  composioApp: 'replicate',
  name: 'Replicate',
  description: 'Run open-source ML models via API.',
  subcategory: 'AI & ML',
  popular: false,
  endpointUrl: 'https://api.replicate.com',
  riskTier: 'medium',
  actionsSafe: ['REPLICATE_GET_PREDICTION'],
  actionsSensitive: ['REPLICATE_RUN_MODEL'],
  actions: ['REPLICATE_RUN_MODEL', 'REPLICATE_GET_PREDICTION'],
};

const MCP_HUGGINGFACE = {
  id: 'mcp-huggingface',
  composioApp: 'huggingface',
  name: 'Hugging Face',
  description:
    'Access thousands of ML models, datasets, and Spaces. Run inference across 28+ AI tasks — text, image, audio, video, and more.',
  subcategory: 'AI & ML',
  popular: true,
  endpointUrl: 'https://huggingface.co',
  riskTier: 'low',
  actionsSafe: [
    // Hub read
    'HUGGINGFACE_LIST_MODELS',
    'HUGGINGFACE_GET_MODEL',
    'HUGGINGFACE_LIST_DATASETS',
    // Analytical NLP (no generation, no cost surprise)
    'HUGGINGFACE_SUMMARIZATION',
    'HUGGINGFACE_TRANSLATION',
    'HUGGINGFACE_FILL_MASK',
    'HUGGINGFACE_TEXT_CLASSIFICATION',
    'HUGGINGFACE_TOKEN_CLASSIFICATION',
    'HUGGINGFACE_QUESTION_ANSWERING',
    'HUGGINGFACE_TABLE_QUESTION_ANSWERING',
    'HUGGINGFACE_ZERO_SHOT_CLASSIFICATION',
    'HUGGINGFACE_SENTENCE_SIMILARITY',
    'HUGGINGFACE_FEATURE_EXTRACTION',
    // Image analysis (no generation)
    'HUGGINGFACE_IMAGE_TO_TEXT',
    'HUGGINGFACE_IMAGE_CLASSIFICATION',
    'HUGGINGFACE_IMAGE_SEGMENTATION',
    'HUGGINGFACE_OBJECT_DETECTION',
    'HUGGINGFACE_ZERO_SHOT_IMAGE_CLASSIFICATION',
    'HUGGINGFACE_VISUAL_QUESTION_ANSWERING',
    'HUGGINGFACE_DOCUMENT_QUESTION_ANSWERING',
    // Audio analysis
    'HUGGINGFACE_AUTOMATIC_SPEECH_RECOGNITION',
    'HUGGINGFACE_AUDIO_CLASSIFICATION',
    // Tabular
    'HUGGINGFACE_TABULAR_CLASSIFICATION',
    'HUGGINGFACE_TABULAR_REGRESSION',
  ],
  actionsSensitive: [
    // Generative — costs + content liability
    'HUGGINGFACE_CHAT_COMPLETION',
    'HUGGINGFACE_TEXT_GENERATION',
    'HUGGINGFACE_TEXT_TO_IMAGE',
    'HUGGINGFACE_IMAGE_TO_IMAGE',
    'HUGGINGFACE_TEXT_TO_SPEECH',
    'HUGGINGFACE_AUDIO_TO_AUDIO',
    'HUGGINGFACE_TEXT_TO_VIDEO',
    // Repo management
    'HUGGINGFACE_CREATE_REPO',
  ],
  actions: [
    // Hub management
    'HUGGINGFACE_LIST_MODELS',
    'HUGGINGFACE_GET_MODEL',
    'HUGGINGFACE_LIST_DATASETS',
    'HUGGINGFACE_CREATE_REPO',
    // Text generation & NLP
    'HUGGINGFACE_CHAT_COMPLETION',
    'HUGGINGFACE_TEXT_GENERATION',
    'HUGGINGFACE_SUMMARIZATION',
    'HUGGINGFACE_TRANSLATION',
    'HUGGINGFACE_FILL_MASK',
    'HUGGINGFACE_TEXT_CLASSIFICATION',
    'HUGGINGFACE_TOKEN_CLASSIFICATION',
    'HUGGINGFACE_QUESTION_ANSWERING',
    'HUGGINGFACE_TABLE_QUESTION_ANSWERING',
    'HUGGINGFACE_ZERO_SHOT_CLASSIFICATION',
    'HUGGINGFACE_SENTENCE_SIMILARITY',
    'HUGGINGFACE_FEATURE_EXTRACTION',
    // Image
    'HUGGINGFACE_TEXT_TO_IMAGE',
    'HUGGINGFACE_IMAGE_TO_IMAGE',
    'HUGGINGFACE_IMAGE_TO_TEXT',
    'HUGGINGFACE_IMAGE_CLASSIFICATION',
    'HUGGINGFACE_IMAGE_SEGMENTATION',
    'HUGGINGFACE_OBJECT_DETECTION',
    'HUGGINGFACE_ZERO_SHOT_IMAGE_CLASSIFICATION',
    'HUGGINGFACE_VISUAL_QUESTION_ANSWERING',
    'HUGGINGFACE_DOCUMENT_QUESTION_ANSWERING',
    // Audio
    'HUGGINGFACE_TEXT_TO_SPEECH',
    'HUGGINGFACE_AUTOMATIC_SPEECH_RECOGNITION',
    'HUGGINGFACE_AUDIO_CLASSIFICATION',
    'HUGGINGFACE_AUDIO_TO_AUDIO',
    // Video
    'HUGGINGFACE_TEXT_TO_VIDEO',
    // Tabular
    'HUGGINGFACE_TABULAR_CLASSIFICATION',
    'HUGGINGFACE_TABULAR_REGRESSION',
  ],
};

// ── Marketing & CRM ──────────────────────────────────────────────

const MCP_HUBSPOT = {
  id: 'mcp-hubspot',
  composioApp: 'hubspot',
  name: 'HubSpot',
  description: 'Manage contacts, deals, and CRM pipelines in HubSpot.',
  subcategory: 'Marketing & CRM',
  popular: true,
  endpointUrl: 'https://api.hubapi.com',
  riskTier: 'medium',
  actionsSafe: ['HUBSPOT_LIST_CONTACTS'],
  actionsSensitive: ['HUBSPOT_CREATE_CONTACT', 'HUBSPOT_CREATE_DEAL'],
  actions: ['HUBSPOT_LIST_CONTACTS', 'HUBSPOT_CREATE_CONTACT', 'HUBSPOT_CREATE_DEAL'],
};

const MCP_MAILCHIMP = {
  id: 'mcp-mailchimp',
  composioApp: 'mailchimp',
  name: 'Mailchimp',
  description: 'Manage email campaigns, audiences, and marketing automation.',
  subcategory: 'Marketing & CRM',
  popular: false,
  endpointUrl: 'https://api.mailchimp.com',
  riskTier: 'high',
  actionsSafe: ['MAILCHIMP_LIST_CAMPAIGNS', 'MAILCHIMP_LIST_MEMBERS'],
  actionsSensitive: ['MAILCHIMP_CREATE_CAMPAIGN'],
  actions: ['MAILCHIMP_LIST_CAMPAIGNS', 'MAILCHIMP_CREATE_CAMPAIGN', 'MAILCHIMP_LIST_MEMBERS'],
};

const MCP_INTERCOM = {
  id: 'mcp-intercom',
  composioApp: 'intercom',
  name: 'Intercom',
  description: 'Manage customer conversations, contacts, and support workflows.',
  subcategory: 'Marketing & CRM',
  popular: false,
  endpointUrl: 'https://api.intercom.io',
  riskTier: 'medium',
  actionsSafe: ['INTERCOM_LIST_CONVERSATIONS', 'INTERCOM_SEARCH_CONTACTS'],
  actionsSensitive: ['INTERCOM_SEND_MESSAGE'],
  actions: ['INTERCOM_LIST_CONVERSATIONS', 'INTERCOM_SEND_MESSAGE', 'INTERCOM_SEARCH_CONTACTS'],
};

const MCP_SALESFORCE = {
  id: 'mcp-salesforce',
  composioApp: 'salesforce',
  name: 'Salesforce',
  description: 'Manage leads, opportunities, and accounts in Salesforce CRM.',
  subcategory: 'Marketing & CRM',
  popular: true,
  endpointUrl: 'https://login.salesforce.com',
  riskTier: 'medium',
  actionsSafe: ['SALESFORCE_LIST_LEADS', 'SALESFORCE_LIST_OPPORTUNITIES'],
  actionsSensitive: ['SALESFORCE_CREATE_LEAD'],
  actions: ['SALESFORCE_LIST_LEADS', 'SALESFORCE_CREATE_LEAD', 'SALESFORCE_LIST_OPPORTUNITIES'],
};

const MCP_ACTIVECAMPAIGN = {
  id: 'mcp-activecampaign',
  composioApp: 'activecampaign',
  name: 'ActiveCampaign',
  description: 'Manage email marketing, automations, and CRM in ActiveCampaign.',
  subcategory: 'Marketing & CRM',
  popular: false,
  endpointUrl: 'https://www.activecampaign.com',
  riskTier: 'medium',
  actionsSafe: ['ACTIVECAMPAIGN_LIST_CONTACTS'],
  actionsSensitive: ['ACTIVECAMPAIGN_CREATE_CONTACT'],
  actions: ['ACTIVECAMPAIGN_LIST_CONTACTS', 'ACTIVECAMPAIGN_CREATE_CONTACT'],
};

// ── Finance ──────────────────────────────────────────────────────

const MCP_STRIPE = {
  id: 'mcp-stripe',
  composioApp: 'stripe',
  name: 'Stripe',
  description: 'Manage customers, charges, invoices, and subscriptions via Stripe.',
  subcategory: 'Finance',
  popular: true,
  endpointUrl: 'https://api.stripe.com',
  riskTier: 'high',
  actionsSafe: ['STRIPE_LIST_CUSTOMERS', 'STRIPE_LIST_INVOICES'],
  actionsSensitive: ['STRIPE_CREATE_CHARGE'],
  actions: ['STRIPE_LIST_CUSTOMERS', 'STRIPE_CREATE_CHARGE', 'STRIPE_LIST_INVOICES'],
};

const MCP_PLAID = {
  id: 'mcp-plaid',
  composioApp: 'plaid',
  name: 'Plaid',
  description: 'Access bank accounts, transactions, and financial data via Plaid.',
  subcategory: 'Finance',
  popular: false,
  endpointUrl: 'https://production.plaid.com',
  riskTier: 'high',
  actionsSafe: [],
  actionsSensitive: ['PLAID_GET_ACCOUNTS', 'PLAID_GET_TRANSACTIONS'],
  actions: ['PLAID_GET_ACCOUNTS', 'PLAID_GET_TRANSACTIONS'],
};

const MCP_QUICKBOOKS = {
  id: 'mcp-quickbooks',
  composioApp: 'quickbooks',
  name: 'QuickBooks',
  description: 'Manage invoices, expenses, and accounting in QuickBooks.',
  subcategory: 'Finance',
  popular: false,
  endpointUrl: 'https://quickbooks.api.intuit.com',
  riskTier: 'high',
  actionsSafe: ['QUICKBOOKS_LIST_INVOICES'],
  actionsSensitive: ['QUICKBOOKS_CREATE_INVOICE'],
  actions: ['QUICKBOOKS_LIST_INVOICES', 'QUICKBOOKS_CREATE_INVOICE'],
};

// ── Search & Web ─────────────────────────────────────────────────

const MCP_BRAVE_SEARCH = {
  id: 'mcp-brave-search',
  composioApp: 'bravesearch',
  name: 'Brave Search',
  description: 'Search the web using Brave Search API.',
  subcategory: 'Search & Web',
  popular: false,
  endpointUrl: 'https://api.search.brave.com',
  riskTier: 'low',
  actionsSafe: ['BRAVESEARCH_WEB_SEARCH'],
  actionsSensitive: [],
  actions: ['BRAVESEARCH_WEB_SEARCH'],
};

const MCP_SERPAPI = {
  id: 'mcp-serpapi',
  composioApp: 'serpapi',
  name: 'SerpAPI',
  description: 'Scrape Google search results and other search engines.',
  subcategory: 'Search & Web',
  popular: false,
  endpointUrl: 'https://serpapi.com',
  riskTier: 'low',
  actionsSafe: ['SERPAPI_SEARCH'],
  actionsSensitive: [],
  actions: ['SERPAPI_SEARCH'],
};

const MCP_FIRECRAWL = {
  id: 'mcp-firecrawl',
  composioApp: 'firecrawl',
  name: 'Firecrawl',
  description: 'Scrape websites and crawl pages for structured data.',
  subcategory: 'Search & Web',
  popular: false,
  endpointUrl: 'https://api.firecrawl.dev',
  riskTier: 'low',
  actionsSafe: ['FIRECRAWL_SCRAPE_URL', 'FIRECRAWL_CRAWL_SITE'],
  actionsSensitive: [],
  actions: ['FIRECRAWL_SCRAPE_URL', 'FIRECRAWL_CRAWL_SITE'],
};

// ── Social Media ─────────────────────────────────────────────────

const MCP_TWITTER = {
  id: 'mcp-twitter',
  composioApp: 'twitter',
  name: 'Twitter/X',
  description: 'Post tweets, search, and manage engagement on Twitter/X.',
  subcategory: 'Social Media',
  popular: true,
  endpointUrl: 'https://api.twitter.com',
  riskTier: 'high',
  actionsSafe: ['TWITTER_SEARCH_TWEETS', 'TWITTER_GET_USER'],
  actionsSensitive: ['TWITTER_CREATE_TWEET'],
  actions: ['TWITTER_CREATE_TWEET', 'TWITTER_SEARCH_TWEETS', 'TWITTER_GET_USER'],
};

const MCP_LINKEDIN = {
  id: 'mcp-linkedin',
  composioApp: 'linkedin',
  name: 'LinkedIn',
  description: 'Manage posts, profiles, and professional networking on LinkedIn.',
  subcategory: 'Social Media',
  popular: false,
  endpointUrl: 'https://api.linkedin.com',
  riskTier: 'high',
  actionsSafe: ['LINKEDIN_GET_PROFILE'],
  actionsSensitive: ['LINKEDIN_CREATE_POST'],
  actions: ['LINKEDIN_CREATE_POST', 'LINKEDIN_GET_PROFILE'],
};

const MCP_INSTAGRAM = {
  id: 'mcp-instagram',
  composioApp: 'instagram',
  name: 'Instagram',
  description: 'Manage posts and media on Instagram via the Graph API.',
  subcategory: 'Social Media',
  popular: false,
  endpointUrl: 'https://graph.instagram.com',
  riskTier: 'high',
  actionsSafe: ['INSTAGRAM_GET_MEDIA'],
  actionsSensitive: ['INSTAGRAM_CREATE_POST'],
  actions: ['INSTAGRAM_CREATE_POST', 'INSTAGRAM_GET_MEDIA'],
};

// ── Agent Frameworks ────────────────────────────────────────────

const MCP_LANGGRAPH = {
  id: 'mcp-langgraph',
  composioApp: 'langgraph',
  name: 'LangGraph',
  description:
    'Orchestrate AI agents as graphs. Manage assistants, threads, runs, crons, and persistent state via LangGraph Platform API.',
  subcategory: 'Agent Frameworks',
  popular: true,
  endpointUrl: 'https://langgraph.com',
  riskTier: 'medium',
  actionsSafe: [
    'LANGGRAPH_SEARCH_ASSISTANTS',
    'LANGGRAPH_GET_ASSISTANT',
    'LANGGRAPH_GET_ASSISTANT_GRAPH',
    'LANGGRAPH_GET_ASSISTANT_SCHEMAS',
    'LANGGRAPH_LIST_ASSISTANT_VERSIONS',
    'LANGGRAPH_SEARCH_THREADS',
    'LANGGRAPH_GET_THREAD',
    'LANGGRAPH_GET_THREAD_STATE',
    'LANGGRAPH_GET_THREAD_HISTORY',
    'LANGGRAPH_LIST_RUNS',
    'LANGGRAPH_GET_RUN',
    'LANGGRAPH_LIST_CRONS',
    'LANGGRAPH_GET_CRON',
    'LANGGRAPH_STORE_GET_ITEM',
    'LANGGRAPH_STORE_SEARCH_ITEMS',
    'LANGGRAPH_STORE_LIST_NAMESPACES',
  ],
  actionsSensitive: [
    'LANGGRAPH_CREATE_ASSISTANT',
    'LANGGRAPH_UPDATE_ASSISTANT',
    'LANGGRAPH_DELETE_ASSISTANT',
    'LANGGRAPH_SET_ASSISTANT_VERSION',
    'LANGGRAPH_CREATE_THREAD',
    'LANGGRAPH_UPDATE_THREAD',
    'LANGGRAPH_DELETE_THREAD',
    'LANGGRAPH_COPY_THREAD',
    'LANGGRAPH_UPDATE_THREAD_STATE',
    'LANGGRAPH_CREATE_RUN',
    'LANGGRAPH_CREATE_RUN_WAIT',
    'LANGGRAPH_CREATE_RUN_STREAM',
    'LANGGRAPH_CREATE_STATEFUL_RUN',
    'LANGGRAPH_CANCEL_RUN',
    'LANGGRAPH_BATCH_RUNS',
    'LANGGRAPH_CREATE_CRON',
    'LANGGRAPH_UPDATE_CRON',
    'LANGGRAPH_DELETE_CRON',
    'LANGGRAPH_STORE_PUT_ITEM',
    'LANGGRAPH_STORE_DELETE_ITEM',
  ],
  actions: [
    // Assistants
    'LANGGRAPH_CREATE_ASSISTANT',
    'LANGGRAPH_SEARCH_ASSISTANTS',
    'LANGGRAPH_GET_ASSISTANT',
    'LANGGRAPH_UPDATE_ASSISTANT',
    'LANGGRAPH_DELETE_ASSISTANT',
    'LANGGRAPH_GET_ASSISTANT_GRAPH',
    'LANGGRAPH_GET_ASSISTANT_SCHEMAS',
    'LANGGRAPH_LIST_ASSISTANT_VERSIONS',
    'LANGGRAPH_SET_ASSISTANT_VERSION',
    // Threads
    'LANGGRAPH_CREATE_THREAD',
    'LANGGRAPH_SEARCH_THREADS',
    'LANGGRAPH_GET_THREAD',
    'LANGGRAPH_UPDATE_THREAD',
    'LANGGRAPH_DELETE_THREAD',
    'LANGGRAPH_COPY_THREAD',
    'LANGGRAPH_GET_THREAD_STATE',
    'LANGGRAPH_UPDATE_THREAD_STATE',
    'LANGGRAPH_GET_THREAD_HISTORY',
    // Runs
    'LANGGRAPH_CREATE_RUN',
    'LANGGRAPH_CREATE_RUN_WAIT',
    'LANGGRAPH_CREATE_RUN_STREAM',
    'LANGGRAPH_CREATE_STATEFUL_RUN',
    'LANGGRAPH_LIST_RUNS',
    'LANGGRAPH_GET_RUN',
    'LANGGRAPH_CANCEL_RUN',
    'LANGGRAPH_BATCH_RUNS',
    // Crons
    'LANGGRAPH_CREATE_CRON',
    'LANGGRAPH_LIST_CRONS',
    'LANGGRAPH_GET_CRON',
    'LANGGRAPH_UPDATE_CRON',
    'LANGGRAPH_DELETE_CRON',
    // Store
    'LANGGRAPH_STORE_PUT_ITEM',
    'LANGGRAPH_STORE_GET_ITEM',
    'LANGGRAPH_STORE_SEARCH_ITEMS',
    'LANGGRAPH_STORE_DELETE_ITEM',
    'LANGGRAPH_STORE_LIST_NAMESPACES',
  ],
};

// ══ Batch 2: popular apps across all categories ══════════════════
// composioApp slugs + action ids follow Composio's APP_VERB convention and are
// reconciled against Composio's live toolkit list before release.

// ── Communication (batch 2) ──────────────────────────────────────

const MCP_SLACK = {
  id: 'mcp-slack',
  composioApp: 'slack',
  name: 'Slack',
  description: 'Send messages, manage channels, and coordinate teams on Slack.',
  subcategory: 'Communication',
  popular: true,
  endpointUrl: 'https://slack.com/api',
  riskTier: 'medium',
  actionsSafe: ['SLACK_LIST_CHANNELS', 'SLACK_LIST_USERS'],
  actionsSensitive: ['SLACK_SEND_MESSAGE', 'SLACK_CREATE_CHANNEL'],
  actions: ['SLACK_SEND_MESSAGE', 'SLACK_LIST_CHANNELS', 'SLACK_LIST_USERS', 'SLACK_CREATE_CHANNEL'],
};

const MCP_GMAIL = {
  id: 'mcp-gmail',
  composioApp: 'gmail',
  name: 'Gmail',
  description: 'Read, search, and send email from a Gmail account.',
  subcategory: 'Communication',
  popular: true,
  endpointUrl: 'https://gmail.googleapis.com',
  riskTier: 'high',
  actionsSafe: ['GMAIL_LIST_MESSAGES', 'GMAIL_GET_MESSAGE'],
  actionsSensitive: ['GMAIL_SEND_EMAIL', 'GMAIL_CREATE_DRAFT'],
  actions: ['GMAIL_LIST_MESSAGES', 'GMAIL_GET_MESSAGE', 'GMAIL_SEND_EMAIL', 'GMAIL_CREATE_DRAFT'],
};

const MCP_ZOOM = {
  id: 'mcp-zoom',
  composioApp: 'zoom',
  name: 'Zoom',
  description: 'Schedule meetings, manage participants, and fetch recordings on Zoom.',
  subcategory: 'Communication',
  popular: false,
  endpointUrl: 'https://api.zoom.us',
  riskTier: 'medium',
  actionsSafe: ['ZOOM_LIST_MEETINGS', 'ZOOM_GET_MEETING'],
  actionsSensitive: ['ZOOM_CREATE_MEETING'],
  actions: ['ZOOM_LIST_MEETINGS', 'ZOOM_GET_MEETING', 'ZOOM_CREATE_MEETING'],
};

const MCP_OUTLOOK = {
  id: 'mcp-outlook',
  composioApp: 'outlook',
  name: 'Microsoft Outlook',
  description: 'Read, send, and organize email and calendar events in Outlook.',
  subcategory: 'Communication',
  popular: false,
  endpointUrl: 'https://graph.microsoft.com',
  riskTier: 'high',
  actionsSafe: ['OUTLOOK_LIST_MESSAGES', 'OUTLOOK_LIST_EVENTS'],
  actionsSensitive: ['OUTLOOK_SEND_EMAIL', 'OUTLOOK_CREATE_EVENT'],
  actions: ['OUTLOOK_LIST_MESSAGES', 'OUTLOOK_LIST_EVENTS', 'OUTLOOK_SEND_EMAIL', 'OUTLOOK_CREATE_EVENT'],
};

// ── Development (batch 2) ─────────────────────────────────────────

const MCP_LINEAR = {
  id: 'mcp-linear',
  composioApp: 'linear',
  name: 'Linear',
  description: 'Create and track issues, projects, and cycles in Linear.',
  subcategory: 'Development',
  popular: true,
  endpointUrl: 'https://api.linear.app',
  riskTier: 'medium',
  actionsSafe: ['LINEAR_LIST_ISSUES', 'LINEAR_LIST_PROJECTS'],
  actionsSensitive: ['LINEAR_CREATE_ISSUE', 'LINEAR_UPDATE_ISSUE'],
  actions: ['LINEAR_LIST_ISSUES', 'LINEAR_LIST_PROJECTS', 'LINEAR_CREATE_ISSUE', 'LINEAR_UPDATE_ISSUE'],
};

const MCP_VERCEL = {
  id: 'mcp-vercel',
  composioApp: 'vercel',
  name: 'Vercel',
  description: 'Manage projects, deployments, and domains on Vercel.',
  subcategory: 'Development',
  popular: false,
  endpointUrl: 'https://api.vercel.com',
  riskTier: 'high',
  actionsSafe: ['VERCEL_LIST_PROJECTS', 'VERCEL_LIST_DEPLOYMENTS'],
  actionsSensitive: ['VERCEL_CREATE_DEPLOYMENT'],
  actions: ['VERCEL_LIST_PROJECTS', 'VERCEL_LIST_DEPLOYMENTS', 'VERCEL_CREATE_DEPLOYMENT'],
};

const MCP_CONFLUENCE = {
  id: 'mcp-confluence',
  composioApp: 'confluence',
  name: 'Confluence',
  description: 'Read and publish documentation pages and spaces in Confluence.',
  subcategory: 'Development',
  popular: false,
  endpointUrl: 'https://api.atlassian.com',
  riskTier: 'medium',
  actionsSafe: ['CONFLUENCE_LIST_PAGES', 'CONFLUENCE_GET_PAGE'],
  actionsSensitive: ['CONFLUENCE_CREATE_PAGE', 'CONFLUENCE_UPDATE_PAGE'],
  actions: ['CONFLUENCE_LIST_PAGES', 'CONFLUENCE_GET_PAGE', 'CONFLUENCE_CREATE_PAGE', 'CONFLUENCE_UPDATE_PAGE'],
};

// ── Productivity (batch 2) ────────────────────────────────────────

const MCP_NOTION = {
  id: 'mcp-notion',
  composioApp: 'notion',
  name: 'Notion',
  description: 'Read and write pages, databases, and blocks in Notion.',
  subcategory: 'Productivity',
  popular: true,
  endpointUrl: 'https://api.notion.com',
  riskTier: 'medium',
  actionsSafe: ['NOTION_SEARCH', 'NOTION_GET_PAGE', 'NOTION_QUERY_DATABASE'],
  actionsSensitive: ['NOTION_CREATE_PAGE', 'NOTION_UPDATE_PAGE'],
  actions: ['NOTION_SEARCH', 'NOTION_GET_PAGE', 'NOTION_QUERY_DATABASE', 'NOTION_CREATE_PAGE', 'NOTION_UPDATE_PAGE'],
};

const MCP_CLICKUP = {
  id: 'mcp-clickup',
  composioApp: 'clickup',
  name: 'ClickUp',
  description: 'Manage tasks, lists, and docs in ClickUp workspaces.',
  subcategory: 'Productivity',
  popular: false,
  endpointUrl: 'https://api.clickup.com',
  riskTier: 'medium',
  actionsSafe: ['CLICKUP_LIST_TASKS'],
  actionsSensitive: ['CLICKUP_CREATE_TASK', 'CLICKUP_UPDATE_TASK'],
  actions: ['CLICKUP_LIST_TASKS', 'CLICKUP_CREATE_TASK', 'CLICKUP_UPDATE_TASK'],
};

const MCP_TRELLO = {
  id: 'mcp-trello',
  composioApp: 'trello',
  name: 'Trello',
  description: 'Manage boards, lists, and cards on Trello.',
  subcategory: 'Productivity',
  popular: false,
  endpointUrl: 'https://api.trello.com',
  riskTier: 'low',
  actionsSafe: ['TRELLO_LIST_BOARDS', 'TRELLO_LIST_CARDS'],
  actionsSensitive: ['TRELLO_CREATE_CARD'],
  actions: ['TRELLO_LIST_BOARDS', 'TRELLO_LIST_CARDS', 'TRELLO_CREATE_CARD'],
};

const MCP_DROPBOX = {
  id: 'mcp-dropbox',
  composioApp: 'dropbox',
  name: 'Dropbox',
  description: 'Manage files and folders and share links on Dropbox.',
  subcategory: 'Productivity',
  popular: false,
  endpointUrl: 'https://api.dropboxapi.com',
  riskTier: 'medium',
  actionsSafe: ['DROPBOX_LIST_FILES', 'DROPBOX_GET_FILE'],
  actionsSensitive: ['DROPBOX_UPLOAD_FILE'],
  actions: ['DROPBOX_LIST_FILES', 'DROPBOX_GET_FILE', 'DROPBOX_UPLOAD_FILE'],
};

const MCP_CALENDLY = {
  id: 'mcp-calendly',
  composioApp: 'calendly',
  name: 'Calendly',
  description: 'Fetch scheduled events, invitees, and availability from Calendly.',
  subcategory: 'Productivity',
  popular: false,
  endpointUrl: 'https://api.calendly.com',
  riskTier: 'low',
  actionsSafe: ['CALENDLY_LIST_EVENTS', 'CALENDLY_GET_EVENT'],
  actionsSensitive: ['CALENDLY_CANCEL_EVENT'],
  actions: ['CALENDLY_LIST_EVENTS', 'CALENDLY_GET_EVENT', 'CALENDLY_CANCEL_EVENT'],
};

const MCP_CODA = {
  id: 'mcp-coda',
  composioApp: 'coda',
  name: 'Coda',
  description: 'Read and write docs, tables, and rows in Coda.',
  subcategory: 'Productivity',
  popular: false,
  endpointUrl: 'https://coda.io/apis',
  riskTier: 'medium',
  actionsSafe: ['CODA_LIST_DOCS', 'CODA_LIST_ROWS'],
  actionsSensitive: ['CODA_INSERT_ROW'],
  actions: ['CODA_LIST_DOCS', 'CODA_LIST_ROWS', 'CODA_INSERT_ROW'],
};

// ── Data & Storage (batch 2) ──────────────────────────────────────

const MCP_SNOWFLAKE = {
  id: 'mcp-snowflake',
  composioApp: 'snowflake',
  name: 'Snowflake',
  description: 'Run queries and manage warehouses on Snowflake.',
  subcategory: 'Data & Storage',
  popular: false,
  endpointUrl: 'https://snowflake.com',
  riskTier: 'high',
  actionsSafe: ['SNOWFLAKE_RUN_QUERY'],
  actionsSensitive: ['SNOWFLAKE_EXECUTE_STATEMENT'],
  actions: ['SNOWFLAKE_RUN_QUERY', 'SNOWFLAKE_EXECUTE_STATEMENT'],
};

const MCP_BIGQUERY = {
  id: 'mcp-bigquery',
  composioApp: 'googlebigquery',
  name: 'Google BigQuery',
  description: 'Run SQL queries and manage datasets in Google BigQuery.',
  subcategory: 'Data & Storage',
  popular: false,
  endpointUrl: 'https://bigquery.googleapis.com',
  riskTier: 'high',
  actionsSafe: ['BIGQUERY_RUN_QUERY', 'BIGQUERY_LIST_DATASETS'],
  actionsSensitive: ['BIGQUERY_INSERT_ROWS'],
  actions: ['BIGQUERY_RUN_QUERY', 'BIGQUERY_LIST_DATASETS', 'BIGQUERY_INSERT_ROWS'],
};

const MCP_POSTGRESQL = {
  id: 'mcp-postgresql',
  composioApp: 'postgresql',
  name: 'PostgreSQL',
  description: 'Query and manage rows in PostgreSQL databases.',
  subcategory: 'Data & Storage',
  popular: false,
  endpointUrl: 'https://www.postgresql.org',
  riskTier: 'high',
  actionsSafe: ['POSTGRESQL_RUN_QUERY'],
  actionsSensitive: ['POSTGRESQL_EXECUTE_STATEMENT'],
  actions: ['POSTGRESQL_RUN_QUERY', 'POSTGRESQL_EXECUTE_STATEMENT'],
};

// ── AI & ML (batch 2) ─────────────────────────────────────────────

const MCP_ANTHROPIC = {
  id: 'mcp-anthropic',
  composioApp: 'anthropic',
  name: 'Anthropic',
  description: 'Generate text and reasoning with Claude models via the Anthropic API.',
  subcategory: 'AI & ML',
  popular: false,
  endpointUrl: 'https://api.anthropic.com',
  riskTier: 'medium',
  actionsSafe: [],
  actionsSensitive: ['ANTHROPIC_CREATE_MESSAGE'],
  actions: ['ANTHROPIC_CREATE_MESSAGE'],
};

const MCP_ELEVENLABS = {
  id: 'mcp-elevenlabs',
  composioApp: 'elevenlabs',
  name: 'ElevenLabs',
  description: 'Generate lifelike speech and manage voices with ElevenLabs.',
  subcategory: 'AI & ML',
  popular: false,
  endpointUrl: 'https://api.elevenlabs.io',
  riskTier: 'medium',
  actionsSafe: ['ELEVENLABS_LIST_VOICES'],
  actionsSensitive: ['ELEVENLABS_TEXT_TO_SPEECH'],
  actions: ['ELEVENLABS_LIST_VOICES', 'ELEVENLABS_TEXT_TO_SPEECH'],
};

const MCP_PERPLEXITY = {
  id: 'mcp-perplexity',
  composioApp: 'perplexityai',
  name: 'Perplexity',
  description: 'Answer questions with live, cited web search via Perplexity.',
  subcategory: 'AI & ML',
  popular: true,
  endpointUrl: 'https://api.perplexity.ai',
  riskTier: 'low',
  actionsSafe: ['PERPLEXITY_SEARCH'],
  actionsSensitive: [],
  actions: ['PERPLEXITY_SEARCH'],
};

// ── Marketing & CRM (batch 2) ─────────────────────────────────────

const MCP_ZENDESK = {
  id: 'mcp-zendesk',
  composioApp: 'zendesk',
  name: 'Zendesk',
  description: 'Manage support tickets, users, and organizations in Zendesk.',
  subcategory: 'Marketing & CRM',
  popular: false,
  endpointUrl: 'https://api.zendesk.com',
  riskTier: 'medium',
  actionsSafe: ['ZENDESK_LIST_TICKETS', 'ZENDESK_GET_TICKET'],
  actionsSensitive: ['ZENDESK_CREATE_TICKET', 'ZENDESK_UPDATE_TICKET'],
  actions: ['ZENDESK_LIST_TICKETS', 'ZENDESK_GET_TICKET', 'ZENDESK_CREATE_TICKET', 'ZENDESK_UPDATE_TICKET'],
};

const MCP_PIPEDRIVE = {
  id: 'mcp-pipedrive',
  composioApp: 'pipedrive',
  name: 'Pipedrive',
  description: 'Manage deals, contacts, and pipelines in Pipedrive CRM.',
  subcategory: 'Marketing & CRM',
  popular: false,
  endpointUrl: 'https://api.pipedrive.com',
  riskTier: 'medium',
  actionsSafe: ['PIPEDRIVE_LIST_DEALS', 'PIPEDRIVE_LIST_PERSONS'],
  actionsSensitive: ['PIPEDRIVE_CREATE_DEAL'],
  actions: ['PIPEDRIVE_LIST_DEALS', 'PIPEDRIVE_LIST_PERSONS', 'PIPEDRIVE_CREATE_DEAL'],
};

const MCP_TYPEFORM = {
  id: 'mcp-typeform',
  composioApp: 'typeform',
  name: 'Typeform',
  description: 'Fetch forms and responses and manage surveys in Typeform.',
  subcategory: 'Marketing & CRM',
  popular: false,
  endpointUrl: 'https://api.typeform.com',
  riskTier: 'low',
  actionsSafe: ['TYPEFORM_LIST_FORMS', 'TYPEFORM_GET_RESPONSES'],
  actionsSensitive: ['TYPEFORM_CREATE_FORM'],
  actions: ['TYPEFORM_LIST_FORMS', 'TYPEFORM_GET_RESPONSES', 'TYPEFORM_CREATE_FORM'],
};

const MCP_KLAVIYO = {
  id: 'mcp-klaviyo',
  composioApp: 'klaviyo',
  name: 'Klaviyo',
  description: 'Manage profiles, lists, and email/SMS campaigns in Klaviyo.',
  subcategory: 'Marketing & CRM',
  popular: false,
  endpointUrl: 'https://a.klaviyo.com',
  riskTier: 'high',
  actionsSafe: ['KLAVIYO_LIST_PROFILES', 'KLAVIYO_LIST_CAMPAIGNS'],
  actionsSensitive: ['KLAVIYO_CREATE_CAMPAIGN'],
  actions: ['KLAVIYO_LIST_PROFILES', 'KLAVIYO_LIST_CAMPAIGNS', 'KLAVIYO_CREATE_CAMPAIGN'],
};

// ── Finance (batch 2) ─────────────────────────────────────────────

const MCP_PAYPAL = {
  id: 'mcp-paypal',
  composioApp: 'paypal',
  name: 'PayPal',
  description: 'Manage orders, payments, and payouts via PayPal.',
  subcategory: 'Finance',
  popular: false,
  endpointUrl: 'https://api.paypal.com',
  riskTier: 'high',
  actionsSafe: ['PAYPAL_LIST_TRANSACTIONS'],
  actionsSensitive: ['PAYPAL_CREATE_PAYOUT', 'PAYPAL_CREATE_ORDER'],
  actions: ['PAYPAL_LIST_TRANSACTIONS', 'PAYPAL_CREATE_PAYOUT', 'PAYPAL_CREATE_ORDER'],
};

const MCP_XERO = {
  id: 'mcp-xero',
  composioApp: 'xero',
  name: 'Xero',
  description: 'Manage invoices, contacts, and accounting records in Xero.',
  subcategory: 'Finance',
  popular: false,
  endpointUrl: 'https://api.xero.com',
  riskTier: 'high',
  actionsSafe: ['XERO_LIST_INVOICES', 'XERO_LIST_CONTACTS'],
  actionsSensitive: ['XERO_CREATE_INVOICE'],
  actions: ['XERO_LIST_INVOICES', 'XERO_LIST_CONTACTS', 'XERO_CREATE_INVOICE'],
};

const MCP_SQUARE = {
  id: 'mcp-square',
  composioApp: 'square',
  name: 'Square',
  description: 'Manage payments, catalog, and customers via Square.',
  subcategory: 'Finance',
  popular: false,
  endpointUrl: 'https://connect.squareup.com',
  riskTier: 'high',
  actionsSafe: ['SQUARE_LIST_PAYMENTS', 'SQUARE_LIST_CUSTOMERS'],
  actionsSensitive: ['SQUARE_CREATE_PAYMENT'],
  actions: ['SQUARE_LIST_PAYMENTS', 'SQUARE_LIST_CUSTOMERS', 'SQUARE_CREATE_PAYMENT'],
};

// ── Search & Web (batch 2) ────────────────────────────────────────

const MCP_TAVILY = {
  id: 'mcp-tavily',
  composioApp: 'tavily',
  name: 'Tavily',
  description: 'Search the web and extract content, optimized for AI agents.',
  subcategory: 'Search & Web',
  popular: true,
  endpointUrl: 'https://api.tavily.com',
  riskTier: 'low',
  actionsSafe: ['TAVILY_SEARCH', 'TAVILY_EXTRACT'],
  actionsSensitive: [],
  actions: ['TAVILY_SEARCH', 'TAVILY_EXTRACT'],
};

const MCP_EXA = {
  id: 'mcp-exa',
  composioApp: 'exa',
  name: 'Exa',
  description: 'Neural web search and content retrieval built for LLMs.',
  subcategory: 'Search & Web',
  popular: false,
  endpointUrl: 'https://api.exa.ai',
  riskTier: 'low',
  actionsSafe: ['EXA_SEARCH', 'EXA_GET_CONTENTS'],
  actionsSensitive: [],
  actions: ['EXA_SEARCH', 'EXA_GET_CONTENTS'],
};

const MCP_APIFY = {
  id: 'mcp-apify',
  composioApp: 'apify',
  name: 'Apify',
  description: 'Run scrapers and automation actors and fetch datasets on Apify.',
  subcategory: 'Search & Web',
  popular: false,
  endpointUrl: 'https://api.apify.com',
  riskTier: 'medium',
  actionsSafe: ['APIFY_LIST_ACTORS', 'APIFY_GET_DATASET_ITEMS'],
  actionsSensitive: ['APIFY_RUN_ACTOR'],
  actions: ['APIFY_LIST_ACTORS', 'APIFY_GET_DATASET_ITEMS', 'APIFY_RUN_ACTOR'],
};

// ── Social Media (batch 2) ────────────────────────────────────────

const MCP_YOUTUBE = {
  id: 'mcp-youtube',
  composioApp: 'youtube',
  name: 'YouTube',
  description: 'Search videos, manage playlists, and read channel analytics on YouTube.',
  subcategory: 'Social Media',
  popular: true,
  endpointUrl: 'https://www.googleapis.com/youtube',
  riskTier: 'medium',
  actionsSafe: ['YOUTUBE_SEARCH', 'YOUTUBE_LIST_VIDEOS'],
  actionsSensitive: ['YOUTUBE_UPDATE_VIDEO'],
  actions: ['YOUTUBE_SEARCH', 'YOUTUBE_LIST_VIDEOS', 'YOUTUBE_UPDATE_VIDEO'],
};

const MCP_REDDIT = {
  id: 'mcp-reddit',
  composioApp: 'reddit',
  name: 'Reddit',
  description: 'Search posts, read subreddits, and submit content on Reddit.',
  subcategory: 'Social Media',
  popular: false,
  endpointUrl: 'https://oauth.reddit.com',
  riskTier: 'high',
  actionsSafe: ['REDDIT_SEARCH', 'REDDIT_LIST_POSTS'],
  actionsSensitive: ['REDDIT_SUBMIT_POST'],
  actions: ['REDDIT_SEARCH', 'REDDIT_LIST_POSTS', 'REDDIT_SUBMIT_POST'],
};

const MCP_FACEBOOK = {
  id: 'mcp-facebook',
  composioApp: 'facebook',
  name: 'Facebook',
  description: 'Manage Pages, posts, and insights via the Facebook Graph API.',
  subcategory: 'Social Media',
  popular: false,
  endpointUrl: 'https://graph.facebook.com',
  riskTier: 'high',
  actionsSafe: ['FACEBOOK_GET_PAGE', 'FACEBOOK_LIST_POSTS'],
  actionsSensitive: ['FACEBOOK_CREATE_POST'],
  actions: ['FACEBOOK_GET_PAGE', 'FACEBOOK_LIST_POSTS', 'FACEBOOK_CREATE_POST'],
};

// ── Design & Creative ─────────────────────────────────────────────

const MCP_FIGMA = {
  id: 'mcp-figma',
  composioApp: 'figma',
  name: 'Figma',
  description: 'Read files, frames, and comments and export assets from Figma.',
  subcategory: 'Design & Creative',
  popular: true,
  endpointUrl: 'https://api.figma.com',
  riskTier: 'medium',
  actionsSafe: ['FIGMA_GET_FILE', 'FIGMA_LIST_COMMENTS'],
  actionsSensitive: ['FIGMA_POST_COMMENT'],
  actions: ['FIGMA_GET_FILE', 'FIGMA_LIST_COMMENTS', 'FIGMA_POST_COMMENT'],
};

const MCP_CANVA = {
  id: 'mcp-canva',
  composioApp: 'canva',
  name: 'Canva',
  description: 'Create and export designs and manage brand assets in Canva.',
  subcategory: 'Design & Creative',
  popular: true,
  endpointUrl: 'https://api.canva.com',
  riskTier: 'medium',
  actionsSafe: ['CANVA_LIST_DESIGNS', 'CANVA_GET_DESIGN'],
  actionsSensitive: ['CANVA_CREATE_DESIGN', 'CANVA_EXPORT_DESIGN'],
  actions: ['CANVA_LIST_DESIGNS', 'CANVA_GET_DESIGN', 'CANVA_CREATE_DESIGN', 'CANVA_EXPORT_DESIGN'],
};

const MCP_MIRO = {
  id: 'mcp-miro',
  composioApp: 'miro',
  name: 'Miro',
  description: 'Manage boards, items, and sticky notes on Miro whiteboards.',
  subcategory: 'Design & Creative',
  popular: false,
  endpointUrl: 'https://api.miro.com',
  riskTier: 'medium',
  actionsSafe: ['MIRO_LIST_BOARDS', 'MIRO_GET_ITEMS'],
  actionsSensitive: ['MIRO_CREATE_ITEM'],
  actions: ['MIRO_LIST_BOARDS', 'MIRO_GET_ITEMS', 'MIRO_CREATE_ITEM'],
};

// ── E-commerce ────────────────────────────────────────────────────

const MCP_SHOPIFY = {
  id: 'mcp-shopify',
  composioApp: 'shopify',
  name: 'Shopify',
  description: 'Manage products, orders, and customers on a Shopify store.',
  subcategory: 'E-commerce',
  popular: true,
  endpointUrl: 'https://www.shopify.com',
  riskTier: 'high',
  actionsSafe: ['SHOPIFY_LIST_PRODUCTS', 'SHOPIFY_LIST_ORDERS'],
  actionsSensitive: ['SHOPIFY_CREATE_PRODUCT', 'SHOPIFY_UPDATE_ORDER'],
  actions: ['SHOPIFY_LIST_PRODUCTS', 'SHOPIFY_LIST_ORDERS', 'SHOPIFY_CREATE_PRODUCT', 'SHOPIFY_UPDATE_ORDER'],
};

const MCP_WOOCOMMERCE = {
  id: 'mcp-woocommerce',
  composioApp: 'woocommerce',
  name: 'WooCommerce',
  description: 'Manage products, orders, and customers on a WooCommerce store.',
  subcategory: 'E-commerce',
  popular: false,
  endpointUrl: 'https://woocommerce.com',
  riskTier: 'high',
  actionsSafe: ['WOOCOMMERCE_LIST_PRODUCTS', 'WOOCOMMERCE_LIST_ORDERS'],
  actionsSensitive: ['WOOCOMMERCE_CREATE_PRODUCT'],
  actions: ['WOOCOMMERCE_LIST_PRODUCTS', 'WOOCOMMERCE_LIST_ORDERS', 'WOOCOMMERCE_CREATE_PRODUCT'],
};

const MCP_BIGCOMMERCE = {
  id: 'mcp-bigcommerce',
  composioApp: 'bigcommerce',
  name: 'BigCommerce',
  description: 'Manage catalog, orders, and customers on BigCommerce.',
  subcategory: 'E-commerce',
  popular: false,
  endpointUrl: 'https://api.bigcommerce.com',
  riskTier: 'high',
  actionsSafe: ['BIGCOMMERCE_LIST_PRODUCTS', 'BIGCOMMERCE_LIST_ORDERS'],
  actionsSensitive: ['BIGCOMMERCE_CREATE_PRODUCT'],
  actions: ['BIGCOMMERCE_LIST_PRODUCTS', 'BIGCOMMERCE_LIST_ORDERS', 'BIGCOMMERCE_CREATE_PRODUCT'],
};

// ── App Builders / No-Code ────────────────────────────────────────

const MCP_WEBFLOW = {
  id: 'mcp-webflow',
  composioApp: 'webflow',
  name: 'Webflow',
  description: 'Manage sites, CMS collections, and items on Webflow.',
  subcategory: 'App Builders / No-Code',
  popular: false,
  endpointUrl: 'https://api.webflow.com',
  riskTier: 'medium',
  actionsSafe: ['WEBFLOW_LIST_SITES', 'WEBFLOW_LIST_ITEMS'],
  actionsSensitive: ['WEBFLOW_CREATE_ITEM', 'WEBFLOW_PUBLISH_SITE'],
  actions: ['WEBFLOW_LIST_SITES', 'WEBFLOW_LIST_ITEMS', 'WEBFLOW_CREATE_ITEM', 'WEBFLOW_PUBLISH_SITE'],
};

const MCP_RETOOL = {
  id: 'mcp-retool',
  composioApp: 'retool',
  name: 'Retool',
  description: 'Manage apps, resources, and workflows on Retool.',
  subcategory: 'App Builders / No-Code',
  popular: false,
  endpointUrl: 'https://api.retool.com',
  riskTier: 'medium',
  actionsSafe: ['RETOOL_LIST_APPS', 'RETOOL_LIST_RESOURCES'],
  actionsSensitive: ['RETOOL_RUN_WORKFLOW'],
  actions: ['RETOOL_LIST_APPS', 'RETOOL_LIST_RESOURCES', 'RETOOL_RUN_WORKFLOW'],
};

// ── Exports ──────────────────────────────────────────────────────

/**
 * All curated MCP tool catalog entries.
 */
export const MCP_CATALOG = [
  // Communication (6)
  MCP_DISCORD,
  MCP_TEAMS,
  MCP_TWILIO,
  MCP_SENDGRID,
  MCP_TELEGRAM,
  MCP_WHATSAPP,
  // Development (7)
  MCP_GITHUB,
  MCP_GITLAB,
  MCP_BITBUCKET,
  MCP_JIRA,
  MCP_SENTRY,
  MCP_NETLIFY,
  MCP_CLOUDFLARE,
  // Productivity (6)
  MCP_GOOGLE_DRIVE,
  MCP_GOOGLE_SHEETS,
  MCP_GOOGLE_CALENDAR,
  MCP_AIRTABLE,
  MCP_TODOIST,
  MCP_ASANA,
  // Data & Storage (4)
  MCP_SUPABASE,
  MCP_FIREBASE,
  MCP_MONGODB,
  MCP_PINECONE,
  // AI & ML (4)
  MCP_OPENAI,
  MCP_STABILITY,
  MCP_REPLICATE,
  MCP_HUGGINGFACE,
  // Marketing & CRM (5)
  MCP_HUBSPOT,
  MCP_MAILCHIMP,
  MCP_INTERCOM,
  MCP_SALESFORCE,
  MCP_ACTIVECAMPAIGN,
  // Finance (3)
  MCP_STRIPE,
  MCP_PLAID,
  MCP_QUICKBOOKS,
  // Search & Web (3)
  MCP_BRAVE_SEARCH,
  MCP_SERPAPI,
  MCP_FIRECRAWL,
  // Social Media (3)
  MCP_TWITTER,
  MCP_LINKEDIN,
  MCP_INSTAGRAM,
  // Agent Frameworks (1)
  MCP_LANGGRAPH,

  // ── Batch 2 ──
  // Communication (4)
  MCP_SLACK,
  MCP_GMAIL,
  MCP_ZOOM,
  MCP_OUTLOOK,
  // Development (3)
  MCP_LINEAR,
  MCP_VERCEL,
  MCP_CONFLUENCE,
  // Productivity (6)
  MCP_NOTION,
  MCP_CLICKUP,
  MCP_TRELLO,
  MCP_DROPBOX,
  MCP_CALENDLY,
  MCP_CODA,
  // Data & Storage (3)
  MCP_SNOWFLAKE,
  MCP_BIGQUERY,
  MCP_POSTGRESQL,
  // AI & ML (3)
  MCP_ANTHROPIC,
  MCP_ELEVENLABS,
  MCP_PERPLEXITY,
  // Marketing & CRM (4)
  MCP_ZENDESK,
  MCP_PIPEDRIVE,
  MCP_TYPEFORM,
  MCP_KLAVIYO,
  // Finance (3)
  MCP_PAYPAL,
  MCP_XERO,
  MCP_SQUARE,
  // Search & Web (3)
  MCP_TAVILY,
  MCP_EXA,
  MCP_APIFY,
  // Social Media (3)
  MCP_YOUTUBE,
  MCP_REDDIT,
  MCP_FACEBOOK,
  // Design & Creative (3)
  MCP_FIGMA,
  MCP_CANVA,
  MCP_MIRO,
  // E-commerce (3)
  MCP_SHOPIFY,
  MCP_WOOCOMMERCE,
  MCP_BIGCOMMERCE,
  // App Builders / No-Code (2)
  MCP_WEBFLOW,
  MCP_RETOOL,
];

/**
 * All unique subcategories.
 */
export const MCP_SUBCATEGORIES = [
  'Communication',
  'Development',
  'Productivity',
  'Data & Storage',
  'AI & ML',
  'Marketing & CRM',
  'Finance',
  'Search & Web',
  'Social Media',
  'Agent Frameworks',
  'Design & Creative',
  'E-commerce',
  'App Builders / No-Code',
];

/**
 * Look up an MCP catalog entry by ID.
 */
export function getMcpAppById(id) {
  return MCP_CATALOG.find((t) => t.id === id) || null;
}

/**
 * Get MCP catalog entries by subcategory.
 */
export function getMcpAppsBySubcategory(subcategory) {
  return MCP_CATALOG.filter((t) => t.subcategory === subcategory);
}
