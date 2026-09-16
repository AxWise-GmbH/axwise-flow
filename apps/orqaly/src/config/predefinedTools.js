/**
 * Predefined tool templates for agent teams.
 *
 * Each tool defines: what it does, which team uses it, what credentials
 * are needed, and the API endpoints the agent can call via function calling.
 *
 * Shared tools (web-search, doc-generator) are defined once and referenced
 * by multiple teams via TEAM_TOOLS.
 *
 * Tools are categorized as 'platform' (built-in HTTP tools) or 'mcp'
 * (Composio-powered integrations from the MCP library).
 */
// Note: explicit .js extension is required so Node ESM can resolve this
// import when lib/agent-handlers/execute-task.js pulls PREDEFINED_TOOLS
// server-side. Vite accepts both forms, so the frontend still works.
import { MCP_CATALOG } from './mcpToolCatalog.js';

// ── Shared Tools ──────────────────────────────────────────────────

const TOOL_WEB_SEARCH = {
  id: 'tool-web-search',
  name: 'Web Search',
  description: 'Search the web for real-time information, research, and documentation.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.tavily.com',
  required: true,
  credentials: [
    {
      key: 'TAVILY_API_KEY',
      label: 'Tavily API Key',
      helpUrl: 'https://tavily.com/#api',
      helpText: 'Sign up at tavily.com and copy your API key from the dashboard.',
    },
  ],
  endpoints: [
    {
      name: 'web_search',
      method: 'POST',
      path: '/search',
      description: 'Search the web and return relevant results with content snippets.',
      parameters: {
        query: { type: 'string', required: true, description: 'Search query' },
        max_results: { type: 'number', description: 'Number of results (default 5)' },
        search_depth: { type: 'string', description: '"basic" or "advanced"' },
      },
      bodyTemplate: {
        api_key: '{{credential.TAVILY_API_KEY}}',
        query: '{{query}}',
        max_results: '{{max_results}}',
        search_depth: '{{search_depth}}',
      },
    },
  ],
};

const TOOL_DOC_GENERATOR = {
  id: 'tool-doc-generator',
  name: 'Document Generator',
  description: 'Generate structured documents: business plans, contracts, reports, templates.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'generate_document',
      method: 'INTERNAL',
      description: 'Generate a structured document from a template and data.',
      parameters: {
        template: {
          type: 'string',
          required: true,
          description: 'Document type: business-plan, contract, report, proposal, policy',
        },
        title: { type: 'string', required: true, description: 'Document title' },
        sections: { type: 'object', description: 'Key-value pairs for document sections' },
        format: { type: 'string', description: '"markdown" or "text" (default markdown)' },
      },
    },
  ],
};

const TOOL_EMAIL = {
  id: 'tool-email',
  name: 'Email Sender',
  description: 'Send emails for outreach, notifications, and campaigns.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.resend.com',
  required: false,
  credentials: [
    {
      key: 'RESEND_API_KEY',
      label: 'Resend API Key',
      helpUrl: 'https://resend.com/api-keys',
      helpText: 'Create an API key at resend.com. Free tier: 100 emails/day.',
    },
  ],
  endpoints: [
    {
      name: 'send_email',
      method: 'POST',
      path: '/emails',
      description: 'Send an email to one or more recipients.',
      parameters: {
        to: {
          type: 'string',
          required: true,
          description: 'Recipient email (or comma-separated list)',
        },
        subject: { type: 'string', required: true, description: 'Email subject line' },
        html: { type: 'string', required: true, description: 'Email body (HTML)' },
        from: { type: 'string', description: 'Sender address (default: onboarding@resend.dev)' },
      },
    },
  ],
};

// ── Founder Team Tools ────────────────────────────────────────────

const TOOL_FINANCIAL_DATA = {
  id: 'tool-financial-data',
  name: 'Financial Data',
  description: 'Fetch stock prices, market indicators, and financial metrics.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://www.alphavantage.co',
  required: false,
  credentials: [
    {
      key: 'ALPHA_VANTAGE_KEY',
      label: 'Alpha Vantage API Key',
      helpUrl: 'https://www.alphavantage.co/support/#api-key',
      helpText: 'Get a free API key (5 calls/min, 500/day).',
    },
  ],
  endpoints: [
    {
      name: 'get_stock_quote',
      method: 'GET',
      path: '/query',
      description: 'Get a real-time stock quote.',
      parameters: {
        symbol: { type: 'string', required: true, description: 'Stock ticker symbol (e.g. AAPL)' },
      },
      queryTemplate: {
        function: 'GLOBAL_QUOTE',
        symbol: '{{symbol}}',
        apikey: '{{credential.ALPHA_VANTAGE_KEY}}',
      },
    },
    {
      name: 'search_symbol',
      method: 'GET',
      path: '/query',
      description: 'Search for a stock ticker by company name.',
      parameters: {
        keywords: { type: 'string', required: true, description: 'Company name or partial ticker' },
      },
      queryTemplate: {
        function: 'SYMBOL_SEARCH',
        keywords: '{{keywords}}',
        apikey: '{{credential.ALPHA_VANTAGE_KEY}}',
      },
    },
  ],
};

// ── Development Team Tools ────────────────────────────────────────

const TOOL_GITHUB = {
  id: 'tool-github',
  name: 'GitHub',
  description: 'Manage repositories, pull requests, issues, and code on GitHub.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.github.com',
  required: true,
  credentials: [
    {
      key: 'GITHUB_TOKEN',
      label: 'GitHub Personal Access Token',
      helpUrl: 'https://github.com/settings/tokens?type=beta',
      helpText: 'Create a fine-grained token with repo, issues, and pull_requests permissions.',
      testEndpoint: 'https://api.github.com/user',
    },
  ],
  endpoints: [
    {
      name: 'list_repos',
      method: 'GET',
      path: '/user/repos',
      description: 'List repositories for the authenticated user.',
      parameters: {
        sort: { type: 'string', description: '"created", "updated", "pushed", "full_name"' },
        per_page: { type: 'number', description: 'Results per page (max 100)' },
      },
    },
    {
      name: 'create_repo',
      method: 'POST',
      path: '/user/repos',
      description: 'Create a new GitHub repository.',
      parameters: {
        name: { type: 'string', required: true, description: 'Repository name' },
        description: { type: 'string', description: 'Repository description' },
        private: { type: 'boolean', description: 'Whether repo is private (default false)' },
        auto_init: { type: 'boolean', description: 'Initialize with README (default true)' },
      },
    },
    {
      name: 'create_issue',
      method: 'POST',
      path: '/repos/{owner}/{repo}/issues',
      description: 'Create an issue in a repository.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        title: { type: 'string', required: true, description: 'Issue title' },
        body: { type: 'string', description: 'Issue body (markdown)' },
        labels: { type: 'array', description: 'Array of label names' },
      },
    },
    {
      name: 'list_issues',
      method: 'GET',
      path: '/repos/{owner}/{repo}/issues',
      description: 'List issues in a repository.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        state: { type: 'string', description: '"open", "closed", or "all"' },
      },
    },
    {
      name: 'create_pull_request',
      method: 'POST',
      path: '/repos/{owner}/{repo}/pulls',
      description: 'Create a pull request.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        title: { type: 'string', required: true, description: 'PR title' },
        body: { type: 'string', description: 'PR description' },
        head: { type: 'string', required: true, description: 'Branch with changes' },
        base: { type: 'string', required: true, description: 'Branch to merge into' },
      },
    },
    {
      name: 'get_file_content',
      method: 'GET',
      path: '/repos/{owner}/{repo}/contents/{path}',
      description: 'Get the content of a file in a repository.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        path: { type: 'string', required: true, description: 'File path in the repo' },
      },
    },
    {
      name: 'put_file',
      method: 'PUT',
      path: '/repos/{owner}/{repo}/contents/{path}',
      description:
        'Create or update a single file in a repository. Required for committing code from agents.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        path: {
          type: 'string',
          required: true,
          description: 'File path in the repo (e.g. "index.html")',
        },
        message: { type: 'string', required: true, description: 'Commit message' },
        content: {
          type: 'string',
          required: true,
          description: 'File content (will be base64-encoded automatically)',
        },
        branch: { type: 'string', description: 'Branch name (default: main)' },
        sha: {
          type: 'string',
          description:
            'Required when updating an existing file — the blob SHA from get_file_content',
        },
      },
    },
    {
      name: 'enable_pages',
      method: 'POST',
      path: '/repos/{owner}/{repo}/pages',
      description:
        'Enable GitHub Pages on a repository to deploy static HTML/CSS/JS as a live site. Use this after committing index.html to the main branch to get a public URL. The site becomes live at https://{owner}.github.io/{repo}/ within 1-2 minutes.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        source: {
          type: 'object',
          description:
            'Build source. Default: { "branch": "main", "path": "/" } — serves from the main branch root.',
        },
      },
    },
    {
      name: 'get_pages_info',
      method: 'GET',
      path: '/repos/{owner}/{repo}/pages',
      description:
        'Get GitHub Pages info for a repo — returns the public URL, build status, and source branch. Use this to confirm a deployment succeeded and to get the live URL.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
      },
    },
    {
      name: 'trigger_pages_build',
      method: 'POST',
      path: '/repos/{owner}/{repo}/pages/builds',
      description:
        'Manually trigger a GitHub Pages rebuild after committing new files. Rarely needed — Pages rebuilds automatically on push to the source branch.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
      },
    },
  ],
};

const TOOL_VERCEL = {
  id: 'tool-vercel',
  name: 'Vercel',
  description: 'Deploy projects, manage domains, and configure environments on Vercel.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.vercel.com',
  required: true,
  credentials: [
    {
      key: 'VERCEL_TOKEN',
      label: 'Vercel Access Token',
      helpUrl: 'https://vercel.com/account/tokens',
      helpText: 'Create a token from your Vercel account settings.',
      testEndpoint: 'https://api.vercel.com/v2/user',
    },
  ],
  endpoints: [
    {
      name: 'list_projects',
      method: 'GET',
      path: '/v9/projects',
      description: 'List all Vercel projects.',
      parameters: {},
    },
    {
      name: 'create_project',
      method: 'POST',
      path: '/v10/projects',
      description: 'Create a new Vercel project.',
      parameters: {
        name: { type: 'string', required: true, description: 'Project name' },
        framework: { type: 'string', description: 'Framework preset (nextjs, vite, etc.)' },
        gitRepository: { type: 'object', description: '{ type: "github", repo: "owner/repo" }' },
      },
    },
    {
      name: 'list_deployments',
      method: 'GET',
      path: '/v6/deployments',
      description: 'List recent deployments.',
      parameters: {
        projectId: { type: 'string', description: 'Filter by project ID' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
    {
      name: 'create_deployment',
      method: 'POST',
      path: '/v13/deployments',
      description:
        'Trigger a new deployment. Two modes: (1) inline files for static sites — pass a "files" array with { file, data } entries containing the file path and UTF-8 string content; (2) git source — pass gitSource for repo-driven deploys. The response includes a "url" field with the live deployment URL (e.g. project-abc.vercel.app).',
      parameters: {
        name: {
          type: 'string',
          required: true,
          description: 'Project name (will be created if it does not exist)',
        },
        files: {
          type: 'array',
          description:
            'For inline static deploys: array of { file: "index.html", data: "<html>...</html>" } objects',
        },
        gitSource: {
          type: 'object',
          description: 'For git-driven deploys: { type: "github", ref: "main", repoId: "..." }',
        },
        target: { type: 'string', description: '"production" or "preview" (default: preview)' },
        projectSettings: {
          type: 'object',
          description:
            '{ framework: "vite"|"nextjs"|null, buildCommand, outputDirectory, devCommand, installCommand }',
        },
      },
    },
  ],
};

// Cloudflare deployment — internal tool that wraps the Cloudflare Workers API.
// Exposes a single `deploy_site` action so agents can ship a landing page with
// ONE call instead of orchestrating the multi-step Pages Direct Upload flow.
// Uses CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from server env — no per-user
// credential plumbing needed (handler reads process.env directly).
// Produces a public URL of the form: https://<name>.<account-subdomain>.workers.dev
const TOOL_CLOUDFLARE_PAGES = {
  id: 'tool-cloudflare-pages',
  name: 'Cloudflare Pages',
  description:
    "Deploy static HTML pages to Cloudflare's edge network. One call, one URL. Use for landing pages, marketing sites, and demos — the returned *.workers.dev URL is served by the same global CDN as Cloudflare Pages.",
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'deploy_site',
      method: 'INTERNAL',
      description:
        'Deploy a static HTML page to Cloudflare and return a public URL. Pass the full HTML document as `html` and a kebab-case `projectName`. Returns a JSON object with { deploymentUrl, projectName } on success. The deployment URL is live immediately (typically under 3 seconds). DO NOT narrate this call — actually call it with real html content.',
      parameters: {
        projectName: {
          type: 'string',
          required: true,
          description:
            'Kebab-case project name, max 58 chars. Example: "rustic-roots-landing". Will be normalized (lowercased, non-alphanumerics stripped).',
        },
        html: {
          type: 'string',
          required: true,
          description:
            'The complete HTML document to deploy as the root page, including <!DOCTYPE html> and inline <style>. Must be a full, self-contained HTML5 document — external CSS/JS files are not supported in a single-call deploy.',
        },
      },
    },
  ],
};

// Landing Pages — a higher-level deliverable tool that wraps the Cloudflare
// deploy in a single step: quality-gates the HTML via html-critic, deploys
// to Cloudflare's edge, and records the result in the landing_pages table
// (linked to the goal so it surfaces in the PageBuilder UI).
//
// Why this exists separately from tool-cloudflare-pages: the raw Cloudflare
// tool only deploys — it leaves no database record, so agent-produced sites
// never appear in the user's PageBuilder list and goal_id never links. This
// tool closes that gap with a single call: publish(title, html, goal_id).
const TOOL_LANDING_PAGES = {
  id: 'tool-landing-pages',
  name: 'Landing Pages',
  description:
    'Publish a complete landing page: validate HTML quality, deploy to Cloudflare edge, and record it in the PageBuilder library linked to the current goal. Returns a live deploymentUrl and a landingPageId that future steps can reference. Use this instead of tool-cloudflare-pages when the goal is to produce a landing page deliverable.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'publish',
      method: 'INTERNAL',
      description:
        'Quality-gate the HTML (score ≥70% required — reject with feedback otherwise), deploy to Cloudflare Workers, and insert a row into the landing_pages table linked to the current goal. Returns { deploymentUrl, landingPageId, projectName }. DO NOT narrate — invoke it with the actual HTML.',
      parameters: {
        title: {
          type: 'string',
          required: true,
          description:
            'Human-readable title of the landing page, e.g. "Orqaly Pay — Landing Page".',
        },
        html: {
          type: 'string',
          required: true,
          description:
            'Complete HTML document including <!DOCTYPE html>, inline <style>, and all content. Must be a fully self-contained HTML5 document. External CSS/JS links are fine but additional files cannot be deployed in a single call.',
        },
        projectName: {
          type: 'string',
          description:
            'Optional kebab-case slug for the Cloudflare subdomain. If omitted, derived from title. Max 58 chars.',
        },
      },
    },
  ],
};

// Vision QA — internal tool that screenshots a deployed page at 3 breakpoints
// (desktop 1920, tablet 768, mobile 375) via Cloudflare Browser Rendering API,
// then asks Claude vision to compare the screenshots against the markdown
// design brief and return structured failures (mobile_overflow, contrast_fail,
// palette_mismatch, etc.). Closes the design-blind gap: today nothing in the
// Designer → Developer → QA pipeline actually sees the rendered page.
//
// Intended caller: the existing QA Tester agent during Phase 3 of landing-page
// goals. Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (already used by
// deploy) and ANTHROPIC_API_KEY (for the vision LLM call).
const TOOL_VISION_QA = {
  id: 'tool-vision-qa',
  name: 'Vision QA',
  description:
    'Screenshot a deployed landing page at desktop/tablet/mobile and compare to the design brief via vision LLM. Returns a 0-100 visual adherence score plus categorized failures (mobile_overflow, contrast_fail, palette_mismatch, typography_mismatch, spacing_issue, image_quality, cta_invisible, hero_blank, layout_broken). Use during QA phase to catch issues that the HTML structural critic cannot see.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'compare',
      method: 'INTERNAL',
      description:
        'Capture screenshots at 3 viewports and compare to the design brief. Pass the live deploymentUrl from Phase 2 and the markdown designBrief from Phase 1. Returns JSON: { score, summary, passed, failures: [{ category, severity, viewport, location, details, suggestion }] }. A passed:false response or failures with severity:"high" should be treated as a phase failure so the re-planner gets structured signal.',
      parameters: {
        deploymentUrl: {
          type: 'string',
          required: true,
          description:
            'The live URL of the deployed landing page (from the Phase 2 deploy tool result).',
        },
        designBrief: {
          type: 'string',
          required: true,
          description:
            'The markdown design brief produced in Phase 1 — colors, fonts, sections, copy. Used by the vision LLM to score adherence.',
        },
        goalId: {
          type: 'string',
          description:
            'Optional goal_id for persisting the result to design_qa_results (audit + learning loop).',
        },
        iteration: {
          type: 'integer',
          description:
            'Optional current iteration number, for tracking which iterate cycle the QA ran in.',
        },
      },
    },
  ],
};

// PDF Generator — internal tool that builds a real PDF document from a
// structured slide deck + uploads it to Supabase Storage, returning a public
// URL. Used for pitch decks, investor one-pagers, and any deliverable that
// must produce a real downloadable file. Bypasses the "markdown claiming
// to be a deck" antipattern by hard-requiring structured slide input.
const TOOL_PDF_GENERATOR = {
  id: 'tool-pdf-generator',
  name: 'PDF Generator',
  description:
    'Generate a real PDF document from a structured slide deck and return a public download URL. Use for pitch decks, investor presentations, one-pagers, and any deliverable that must be a real PDF file (not a markdown description of one).',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'create_slides',
      method: 'INTERNAL',
      description:
        'Generate a multi-slide PDF from a structured deck definition and return a public URL. Each slide becomes one PDF page with title + body text rendered via jspdf. DO NOT narrate this call — actually invoke it with real slide content and return the resulting URL in your final answer prefixed with ASSET_URL: or DEPLOYMENT_URL:.',
      parameters: {
        projectName: {
          type: 'string',
          required: true,
          description:
            'Kebab-case file name, no extension. Example: "rustic-roots-pitch-deck". Will be normalized.',
        },
        title: {
          type: 'string',
          required: true,
          description:
            'Deck title, used as the first (cover) slide title and the PDF metadata title.',
        },
        subtitle: {
          type: 'string',
          description: 'Optional tagline shown on the cover slide under the title.',
        },
        slides: {
          type: 'array',
          required: true,
          description:
            'Array of slide objects. Each slide: { title: string, body?: string, bullets?: string[], note?: string }. Minimum 1 slide. Title is rendered as a large heading; body is rendered below as wrapped paragraph text; bullets are rendered as a bulleted list; note is rendered smaller at the bottom. Do NOT pass image URLs — this tool does not embed images yet.',
        },
      },
    },
  ],
};

// Stability AI image generation — internal tool that wraps Stability's v1
// SDXL endpoint, uploads the result to Supabase Storage, and returns a public
// URL. Used for social media banners, hero images, and any deliverable that
// requires a real generated PNG file (not a placeholder or markdown description).
// Uses STABILITY_API_KEY from server env.
const TOOL_STABILITY_AI = {
  id: 'tool-stability-ai',
  name: 'Stability AI Image',
  description:
    'Generate photorealistic images via Stability AI SDXL and return a public URL. Use for social media banners, hero images, product shots, and marketing assets. One call per image.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'generate_image',
      method: 'INTERNAL',
      description:
        "Generate a single photorealistic image from a text prompt. Returns { imageUrl } on success. DO NOT narrate this call — invoke it with a concrete detailed prompt and use the returned URL. Dimensions are fixed to Stability's supported sizes; pick the aspectRatio closest to your need.",
      parameters: {
        projectName: {
          type: 'string',
          required: true,
          description:
            'Kebab-case project name for the file path. Example: "rustic-roots-instagram-1".',
        },
        prompt: {
          type: 'string',
          required: true,
          description:
            'Detailed text prompt describing the desired image. Be specific about style, lighting, composition, colors, mood. 50-200 words is a good length. Example: "Overhead shot of a crusty golden-brown sourdough loaf on a dark wood table, warm window light, scattered flour, in the style of moody food photography, shallow depth of field".',
        },
        aspectRatio: {
          type: 'string',
          description:
            'One of: "square" (1024x1024, for Instagram posts), "landscape" (1344x768, ~16:9 for LinkedIn/Twitter), "wide" (1536x640, ~21:9 for hero banners), "portrait" (768x1344, for Instagram stories). Default: "square".',
        },
      },
    },
  ],
};

// ── Stock Photography Tools ──────────────────────────────────────

const TOOL_PEXELS = {
  id: 'tool-pexels',
  name: 'Pexels Stock Photos',
  description:
    'Search and fetch free stock photos for hero sections, feature images, and backgrounds. Returns direct CDN URLs safe for hotlinking with attribution.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.pexels.com',
  required: false,
  credentials: [
    {
      key: 'PEXELS_API_KEY',
      label: 'Pexels API Key',
      helpUrl: 'https://www.pexels.com/api/new/',
      helpText: 'Free API key at pexels.com/api. 200 requests/hour. Instant approval.',
    },
  ],
  endpoints: [
    {
      name: 'search_photos',
      method: 'GET',
      path: '/v1/search',
      description:
        'Search for stock photos by keyword. Returns up to 5 photos with CDN URLs in multiple sizes (original, large2x, medium, small). Use src.large2x for hero backgrounds, src.medium for feature cards. Always include photographer attribution.',
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: 'Search query e.g. "artisan sourdough bakery", "fitness outdoor workout"',
        },
        orientation: {
          type: 'string',
          description: '"landscape", "portrait", or "square". Default: landscape.',
        },
        per_page: { type: 'number', description: 'Results count 1-10. Default: 5.' },
      },
    },
    {
      name: 'get_photo',
      method: 'GET',
      path: '/v1/photos/{id}',
      description:
        'Get a single photo by Pexels ID. Returns all size variants and photographer attribution.',
      parameters: {
        id: { type: 'number', required: true, description: 'Pexels photo ID' },
      },
    },
  ],
};

const TOOL_UNSPLASH = {
  id: 'tool-unsplash',
  name: 'Unsplash Stock Photos',
  description:
    'Search and fetch high-quality free stock photos from Unsplash. Returns CDN URLs for embedding. Requires attribution.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.unsplash.com',
  required: false,
  credentials: [
    {
      key: 'UNSPLASH_ACCESS_KEY',
      label: 'Unsplash Access Key',
      helpUrl: 'https://unsplash.com/developers',
      helpText: 'Free API key at unsplash.com/developers. 50 requests/hour.',
    },
  ],
  endpoints: [
    {
      name: 'search_photos',
      method: 'GET',
      path: '/search/photos',
      description:
        'Search for stock photos. Returns photos with CDN URLs (urls.regular for hero, urls.small for cards). Include photographer credit in footer.',
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: 'Search query e.g. "coffee roastery interior"',
        },
        orientation: { type: 'string', description: '"landscape", "portrait", or "squarish".' },
        per_page: { type: 'number', description: 'Results count 1-10. Default: 5.' },
      },
    },
    {
      name: 'get_random',
      method: 'GET',
      path: '/photos/random',
      description: 'Get a random photo matching a query. Good for quick hero images.',
      parameters: {
        query: { type: 'string', description: 'Topic to match e.g. "bakery", "fitness"' },
        orientation: { type: 'string', description: '"landscape", "portrait", or "squarish".' },
      },
    },
  ],
};

// ── Design Tools ─────────────────────────────────────────────────

const TOOL_FIGMA = {
  id: 'tool-figma',
  name: 'Figma',
  description:
    'Access Figma design files to extract design tokens (colors, typography), export design nodes as images, and read file structure. Use for pulling client brand assets and design references.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.figma.com',
  required: false,
  credentials: [
    {
      key: 'FIGMA_ACCESS_TOKEN',
      label: 'Figma Personal Access Token',
      helpUrl: 'https://www.figma.com/developers/api#access-tokens',
      helpText:
        'Generate a personal access token in Figma Settings > Account > Personal access tokens. Free.',
    },
  ],
  endpoints: [
    {
      name: 'get_file',
      method: 'GET',
      path: '/v1/files/{file_key}',
      description:
        "Get a Figma file's metadata, design structure, and embedded style definitions. Use to understand a design's layout and extract color/typography tokens.",
      parameters: {
        file_key: {
          type: 'string',
          required: true,
          description: 'Figma file key from the URL: figma.com/file/{file_key}/...',
        },
      },
    },
    {
      name: 'export_images',
      method: 'GET',
      path: '/v1/images/{file_key}',
      description:
        'Export specific design nodes as PNG, SVG, JPG, or PDF. Returns temporary download URLs for each exported node.',
      parameters: {
        file_key: { type: 'string', required: true, description: 'Figma file key' },
        ids: {
          type: 'string',
          required: true,
          description: 'Comma-separated node IDs to export (from get_file response)',
        },
        format: { type: 'string', description: '"png", "svg", "jpg", or "pdf". Default: png.' },
        scale: { type: 'number', description: 'Export scale 0.01-4. Default: 1.' },
      },
    },
    {
      name: 'get_file_styles',
      method: 'GET',
      path: '/v1/files/{file_key}/styles',
      description:
        'Get all published styles from a Figma file — colors, typography, effects, grids. Use to extract design tokens as a starting point for the design system.',
      parameters: {
        file_key: { type: 'string', required: true, description: 'Figma file key' },
      },
    },
  ],
};

// ── Internal Design Utilities ────────────────────────────────────

const TOOL_COLOR_PALETTE = {
  id: 'tool-color-palette',
  name: 'Color Palette Generator',
  description:
    'Generate harmonious CSS color palettes from mood keywords and validate WCAG contrast ratios. No API key needed — runs locally.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'generate_palette',
      method: 'INTERNAL',
      description:
        'Generate a :root CSS palette with 6 custom properties (--primary, --accent, --surface, --text, --text-muted, --border) from a mood/style keyword. Returns a ready-to-paste CSS block.',
      parameters: {
        mood: {
          type: 'string',
          required: true,
          description:
            'Design mood e.g. "warm earthy", "cool tech", "vibrant playful", "luxury dark", "fresh organic", "bold startup"',
        },
        base_color: {
          type: 'string',
          description:
            'Optional starting hex color e.g. "#8B4513". The palette will harmonize around this color.',
        },
      },
    },
    {
      name: 'check_contrast',
      method: 'INTERNAL',
      description:
        'Check WCAG 2.1 contrast ratio between two colors. Returns the ratio and AA/AAA pass/fail for both normal text (4.5:1) and large text (3:1). Use to validate design system color pairs.',
      parameters: {
        foreground: {
          type: 'string',
          required: true,
          description: 'Foreground (text) hex color e.g. "#2C1810"',
        },
        background: {
          type: 'string',
          required: true,
          description: 'Background hex color e.g. "#FFF8F0"',
        },
      },
    },
  ],
};

const TOOL_CODE_SANDBOX = {
  id: 'tool-code-sandbox',
  name: 'Code Sandbox',
  description: 'Execute code snippets safely in an isolated sandbox environment.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.e2b.dev',
  required: false,
  credentials: [
    {
      key: 'E2B_API_KEY',
      label: 'E2B API Key',
      helpUrl: 'https://e2b.dev/docs',
      helpText: 'Sign up at e2b.dev for cloud code execution. Free tier available.',
    },
  ],
  endpoints: [
    {
      name: 'execute_code',
      method: 'POST',
      path: '/v1/sandboxes',
      description: 'Execute a code snippet in an isolated sandbox.',
      parameters: {
        code: { type: 'string', required: true, description: 'Code to execute' },
        language: {
          type: 'string',
          description: '"javascript", "python", "typescript" (default javascript)',
        },
      },
    },
  ],
};

const TOOL_HTTP_CLIENT = {
  id: 'tool-http-client',
  name: 'HTTP Client',
  description: 'Make HTTP requests to any API for testing and integration.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'http_request',
      method: 'INTERNAL',
      description: 'Make an HTTP request to any URL.',
      parameters: {
        url: { type: 'string', required: true, description: 'Target URL' },
        method: {
          type: 'string',
          description: 'HTTP method: GET, POST, PUT, DELETE (default GET)',
        },
        headers: { type: 'object', description: 'Request headers as key-value pairs' },
        body: { type: 'object', description: 'Request body (for POST/PUT)' },
      },
    },
  ],
};

// ── Browser Automation Tools ──────────────────────────────────────

const TOOL_BOOKMARKS = {
  id: 'tool-bookmarks',
  name: 'Bookmarks',
  description:
    'Save useful links to the Knowledge Base and reuse them later. Group links into collections for the team.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'save_bookmark',
      method: 'INTERNAL',
      description: 'Save a link as a bookmark in the Knowledge Base for later reuse.',
      parameters: {
        url: { type: 'string', required: true, description: 'The http(s) URL to bookmark' },
        'title?': { type: 'string', description: 'Optional title (defaults to the URL)' },
        'collection?': {
          type: 'string',
          description: 'Optional collection/category label to group the link (e.g. "research")',
        },
        'note?': { type: 'string', description: 'Optional note about why this link matters' },
      },
    },
    {
      name: 'list_bookmarks',
      method: 'INTERNAL',
      description: 'List saved bookmarks, optionally filtered by collection or a title query.',
      parameters: {
        'collection?': { type: 'string', description: 'Filter to a collection label' },
        'query?': { type: 'string', description: 'Filter by text in the title' },
        'limit?': { type: 'number', description: 'Max results (default 20, max 50)' },
      },
    },
  ],
};

const TOOL_BROWSER = {
  id: 'tool-browser',
  name: 'Browser Automation',
  description:
    'Navigate websites, fill forms, click elements, and extract data via cloud Chrome (Browserless.io).',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://chrome.browserless.io',
  required: false,
  credentials: [
    {
      key: 'BROWSERLESS_API_KEY',
      label: 'Browserless.io API Key',
      helpUrl: 'https://www.browserless.io/sign-up',
      helpText: 'Sign up at browserless.io. Free tier: 1,000 sessions/month.',
    },
  ],
  endpoints: [
    {
      name: 'navigate',
      method: 'INTERNAL',
      description: 'Navigate to a URL and return the rendered page HTML.',
      parameters: {
        url: { type: 'string', required: true, description: 'URL to navigate to' },
        'waitForSelector?': {
          type: 'string',
          description: 'CSS selector to wait for before returning',
        },
      },
    },
    {
      name: 'fill_and_submit',
      method: 'INTERNAL',
      description: 'Fill form fields and click the submit button.',
      parameters: {
        url: { type: 'string', required: true, description: 'Page URL with the form' },
        fields: {
          type: 'object',
          required: true,
          description: 'Object of {cssSelector: value} pairs to fill',
        },
        submitSelector: {
          type: 'string',
          required: true,
          description: 'CSS selector for submit button',
        },
      },
    },
    {
      name: 'click',
      method: 'INTERNAL',
      description: 'Click an element on a page and return the resulting content.',
      parameters: {
        url: { type: 'string', required: true, description: 'Page URL' },
        selector: { type: 'string', required: true, description: 'CSS selector to click' },
      },
    },
    {
      name: 'extract',
      method: 'INTERNAL',
      description: 'Extract text content from a CSS selector on a page.',
      parameters: {
        url: { type: 'string', required: true, description: 'Page URL' },
        selector: { type: 'string', required: true, description: 'CSS selector to extract from' },
      },
    },
    {
      name: 'screenshot',
      method: 'INTERNAL',
      description: 'Take a screenshot of a page (returns base64 PNG).',
      parameters: {
        url: { type: 'string', required: true, description: 'Page URL to screenshot' },
      },
    },
  ],
};

const TOOL_CAPTCHA_SOLVER = {
  id: 'tool-captcha-solver',
  name: 'CAPTCHA Solver',
  description:
    'Solve reCAPTCHA and hCaptcha challenges via 2Captcha for automated form submissions.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://2captcha.com',
  required: false,
  credentials: [
    {
      key: 'TWOCAPTCHA_API_KEY',
      label: '2Captcha API Key',
      helpUrl: 'https://2captcha.com/enterpage',
      helpText: 'Sign up at 2captcha.com. $2.99 per 1,000 solves.',
    },
  ],
  endpoints: [
    {
      name: 'solve_recaptcha',
      method: 'INTERNAL',
      description: 'Solve a reCAPTCHA v2 challenge (15-30s).',
      parameters: {
        siteKey: {
          type: 'string',
          required: true,
          description: 'reCAPTCHA site key from the page',
        },
        pageUrl: { type: 'string', required: true, description: 'URL of the page with CAPTCHA' },
      },
    },
    {
      name: 'solve_hcaptcha',
      method: 'INTERNAL',
      description: 'Solve an hCaptcha challenge (15-30s).',
      parameters: {
        siteKey: { type: 'string', required: true, description: 'hCaptcha site key from the page' },
        pageUrl: { type: 'string', required: true, description: 'URL of the page with CAPTCHA' },
      },
    },
  ],
};

const TOOL_CAPSOLVER_SOLVER = {
  id: 'tool-capsolver-solver',
  name: 'CapSolver (advanced CAPTCHA)',
  description:
    'Broader CAPTCHA coverage than 2Captcha — Cloudflare Turnstile, reCAPTCHA v3, FunCaptcha / Arkose Labs, DataDome. Falls back when 2Captcha cannot handle a type.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.capsolver.com',
  required: false,
  credentials: [
    {
      key: 'CAPSOLVER_API_KEY',
      label: 'CapSolver API Key',
      helpUrl: 'https://dashboard.capsolver.com/',
      helpText: 'Sign up at capsolver.com and copy your client key from the dashboard.',
    },
  ],
  endpoints: [
    {
      name: 'solve_turnstile',
      method: 'INTERNAL',
      description: 'Solve a Cloudflare Turnstile challenge.',
      parameters: {
        siteKey: { type: 'string', required: true },
        pageUrl: { type: 'string', required: true },
      },
    },
    {
      name: 'solve_recaptcha_v3',
      method: 'INTERNAL',
      description: 'Solve an invisible reCAPTCHA v3 challenge.',
      parameters: {
        siteKey: { type: 'string', required: true },
        pageUrl: { type: 'string', required: true },
      },
    },
    {
      name: 'solve_funcaptcha',
      method: 'INTERNAL',
      description: 'Solve an Arkose Labs / FunCaptcha challenge.',
      parameters: {
        siteKey: { type: 'string', required: true },
        pageUrl: { type: 'string', required: true },
      },
    },
  ],
};

const TOOL_SMS_VERIFY = {
  id: 'tool-sms-verify',
  name: 'SMS Verification',
  description:
    'Rent disposable phone numbers to receive verification SMS codes during signup. Supports 5sim.net and sms-activate.org.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://5sim.net',
  required: false,
  credentials: [
    {
      key: 'SMS_VERIFY_API_KEY',
      label: 'SMS service API Key',
      helpUrl: 'https://5sim.net/profile/api',
      helpText:
        'Sign up at 5sim.net (preferred) or sms-activate.org. Deposit a few dollars, then copy the API key.',
    },
  ],
  endpoints: [
    {
      name: 'rent_number',
      method: 'INTERNAL',
      description: 'Rent a temporary number for a given service.',
      parameters: { service: { type: 'string', required: true }, country: { type: 'string' } },
    },
    {
      name: 'wait_for_sms',
      method: 'INTERNAL',
      description: 'Poll for an incoming SMS up to 3 minutes.',
      parameters: { activation_id: { type: 'string', required: true } },
    },
    {
      name: 'release_number',
      method: 'INTERNAL',
      description: 'Mark the activation complete (success) or cancelled (failure).',
      parameters: {
        activation_id: { type: 'string', required: true },
        success: { type: 'boolean' },
      },
    },
  ],
};

const TOOL_RENTAHUMAN = {
  id: 'tool-rentahuman',
  name: 'Rent-a-Human (paid human worker)',
  description:
    'Hand off signup steps that automation cannot solve to a paid human worker via rentahuman.ai. Used as the Phase 6 timeout fallback.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://rentahuman.ai',
  required: false,
  credentials: [
    {
      key: 'RENTAHUMAN_API_KEY',
      label: 'RentAHuman API Key',
      helpUrl: 'https://rentahuman.ai/',
      helpText:
        'Create an account at rentahuman.ai, fund your wallet (stablecoins), and copy your API key. Set daily_budget_cents and origin_allowlist in the tool data for safety.',
    },
  ],
  endpoints: [
    {
      name: 'submit_task',
      method: 'INTERNAL',
      description: 'Post a browser task a human should complete.',
      parameters: {
        instructions: { type: 'string', required: true },
        url: { type: 'string', required: true },
        max_price_cents: { type: 'number' },
      },
    },
    {
      name: 'poll_task',
      method: 'INTERNAL',
      description: 'Check a previously submitted task.',
      parameters: { task_id: { type: 'string', required: true } },
    },
    {
      name: 'cancel_task',
      method: 'INTERNAL',
      description: 'Cancel a pending human task.',
      parameters: { task_id: { type: 'string', required: true } },
    },
  ],
};

const TOOL_TEMP_EMAIL = {
  id: 'tool-temp-email',
  name: 'Temporary Email',
  description:
    'Create disposable email addresses and read incoming messages for verification flows.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [],
  endpoints: [
    {
      name: 'create_email',
      method: 'INTERNAL',
      description: 'Create a new disposable email address. Returns address + token.',
      parameters: {},
    },
    {
      name: 'check_inbox',
      method: 'INTERNAL',
      description: 'Check inbox for new messages.',
      parameters: {
        token: {
          type: 'string',
          required: true,
          description: 'Email account token from create_email',
        },
      },
    },
    {
      name: 'read_message',
      method: 'INTERNAL',
      description: 'Read a specific email message body.',
      parameters: {
        token: { type: 'string', required: true, description: 'Email account token' },
        messageId: { type: 'string', required: true, description: 'Message ID from check_inbox' },
      },
    },
  ],
};

// Brandfetch — one-call canonical brand identity lookup (logo, colors, fonts)
// for a domain. Used by Browser Automation Lead in phase-0 Brand & Site
// Research so the Designer gets REAL brand tokens instead of hallucinating
// hex codes (see goal f505dbeb post-mortem). Free tier covers most lookups.
const TOOL_BRANDFETCH = {
  id: 'tool-brandfetch',
  name: 'Brandfetch',
  description:
    'Look up canonical brand identity (logos, primary colors, fonts) for a public domain. Use during Brand & Site Research to seed downstream Designer tasks with real brand data instead of LLM-invented values.',
  category: 'platform',
  connectionType: 'internal',
  required: false,
  credentials: [
    {
      key: 'BRANDFETCH_API_KEY',
      label: 'Brandfetch API Key',
      placeholder: 'bf_...',
      helpUrl: 'https://developers.brandfetch.com/',
    },
  ],
  endpoints: [
    {
      name: 'lookup_brand',
      method: 'INTERNAL',
      description:
        'Fetch canonical brand identity for a domain. Returns projected JSON with name, logos (up to 3), colors (with type/brightness), and fonts. Pass the bare domain — no protocol, no path.',
      parameters: {
        domain: {
          type: 'string',
          required: true,
          description:
            'Bare domain to look up, e.g. "stripe.com" or "novajackpot30.com" (no https://, no path).',
        },
      },
    },
  ],
};

// ── Marketing & Sales Team Tools ──────────────────────────────────

const TOOL_TWITTER = {
  id: 'tool-twitter',
  name: 'Twitter/X',
  description: 'Post tweets, read timelines, and analyze engagement on Twitter/X.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.twitter.com/2',
  required: false,
  credentials: [
    {
      key: 'TWITTER_BEARER_TOKEN',
      label: 'Twitter/X Bearer Token',
      helpUrl: 'https://developer.twitter.com/en/portal/dashboard',
      helpText: 'Create a project in the Twitter Developer Portal and generate a Bearer Token.',
    },
  ],
  endpoints: [
    {
      name: 'create_tweet',
      method: 'POST',
      path: '/tweets',
      description: 'Post a new tweet.',
      parameters: {
        text: { type: 'string', required: true, description: 'Tweet text (max 280 chars)' },
      },
    },
    {
      name: 'search_tweets',
      method: 'GET',
      path: '/tweets/search/recent',
      description: 'Search recent tweets by keyword.',
      parameters: {
        query: { type: 'string', required: true, description: 'Search query' },
        max_results: { type: 'number', description: 'Number of results (10-100)' },
      },
    },
  ],
};

const TOOL_ANALYTICS = {
  id: 'tool-analytics',
  name: 'Google Analytics',
  description: 'Fetch website traffic data, user behavior, and conversion metrics.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://analyticsdata.googleapis.com/v1beta',
  required: false,
  credentials: [
    {
      key: 'GA_PROPERTY_ID',
      label: 'Google Analytics Property ID',
      helpUrl: 'https://analytics.google.com/analytics/web/',
      helpText: 'Find your GA4 property ID in Admin > Property Settings.',
    },
    {
      key: 'GA_API_KEY',
      label: 'Google Analytics API Key',
      helpUrl: 'https://console.cloud.google.com/apis/credentials',
      helpText: 'Create an API key in Google Cloud Console with Analytics Data API enabled.',
    },
  ],
  endpoints: [
    {
      name: 'run_report',
      method: 'POST',
      path: '/properties/{propertyId}:runReport',
      description: 'Run an analytics report for a date range.',
      parameters: {
        propertyId: { type: 'string', required: true, description: 'GA4 property ID' },
        dateRange: { type: 'object', description: '{ startDate: "7daysAgo", endDate: "today" }' },
        metrics: {
          type: 'array',
          description: 'Metrics to fetch: ["activeUsers", "sessions", "screenPageViews"]',
        },
        dimensions: { type: 'array', description: 'Dimensions: ["date", "country", "pagePath"]' },
      },
    },
  ],
};

const TOOL_CANVA = {
  id: 'tool-canva',
  name: 'Canva',
  description: 'Generate marketing visuals, social media graphics, and brand assets.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.canva.com/rest/v1',
  required: false,
  credentials: [
    {
      key: 'CANVA_API_KEY',
      label: 'Canva API Key',
      helpUrl: 'https://www.canva.dev/docs/connect/quick-start/',
      helpText: 'Apply for Canva Connect API access at canva.dev.',
    },
  ],
  endpoints: [
    {
      name: 'list_designs',
      method: 'GET',
      path: '/designs',
      description: 'List your Canva designs.',
      parameters: {},
    },
    {
      name: 'create_design',
      method: 'POST',
      path: '/designs',
      description:
        'Create a new Canva design from a template. Use for generating brand mood boards, marketing assets, and social media graphics.',
      parameters: {
        design_type: {
          type: 'string',
          required: true,
          description: 'Design type e.g. "Presentation", "InstagramPost", "Logo", "Poster"',
        },
        title: { type: 'string', description: 'Title for the design' },
        template_id: { type: 'string', description: 'Optional Canva template ID to start from' },
      },
    },
    {
      name: 'export_design',
      method: 'GET',
      path: '/designs/{design_id}/export',
      description: 'Export a Canva design as PNG or PDF. Returns a download URL.',
      parameters: {
        design_id: { type: 'string', required: true, description: 'Canva design ID' },
        format: { type: 'string', description: '"png" or "pdf". Default: png.' },
      },
    },
    {
      name: 'autofill_design',
      method: 'POST',
      path: '/designs/{design_id}/autofill',
      description:
        'Autofill text layers in a Canva design with dynamic content. Use for populating templates with brand-specific copy.',
      parameters: {
        design_id: { type: 'string', required: true, description: 'Canva design ID' },
        data: {
          type: 'object',
          description: 'Key-value pairs mapping text layer names to replacement text',
        },
      },
    },
  ],
};

// ── Operations Team Tools ─────────────────────────────────────────

const TOOL_SLACK = {
  id: 'tool-slack',
  name: 'Slack',
  description: 'Send messages, notifications, and coordinate across team channels.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://slack.com/api',
  required: true,
  credentials: [
    {
      key: 'SLACK_BOT_TOKEN',
      label: 'Slack Bot Token',
      helpUrl: 'https://api.slack.com/apps',
      helpText:
        'Create a Slack app, add chat:write scope, install to workspace, copy Bot Token (xoxb-...).',
      testEndpoint: 'https://slack.com/api/auth.test',
    },
  ],
  endpoints: [
    {
      name: 'send_message',
      method: 'POST',
      path: '/chat.postMessage',
      description: 'Send a message to a Slack channel.',
      parameters: {
        channel: {
          type: 'string',
          required: true,
          description: 'Channel ID or name (e.g. #general)',
        },
        text: { type: 'string', required: true, description: 'Message text (supports markdown)' },
      },
    },
    {
      name: 'list_channels',
      method: 'GET',
      path: '/conversations.list',
      description: 'List available Slack channels.',
      parameters: {
        limit: { type: 'number', description: 'Max channels to return (default 100)' },
      },
    },
  ],
};

const TOOL_NOTION = {
  id: 'tool-notion',
  name: 'Notion',
  description: 'Manage knowledge bases, documentation, and project wikis in Notion.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.notion.com/v1',
  required: false,
  credentials: [
    {
      key: 'NOTION_API_KEY',
      label: 'Notion Integration Token',
      helpUrl: 'https://www.notion.so/my-integrations',
      helpText:
        'Create an integration at notion.so/my-integrations. Share pages with the integration to grant access.',
    },
  ],
  endpoints: [
    {
      name: 'search',
      method: 'POST',
      path: '/search',
      description: 'Search Notion pages and databases.',
      parameters: {
        query: { type: 'string', required: true, description: 'Search query' },
      },
    },
    {
      name: 'create_page',
      method: 'POST',
      path: '/pages',
      description: 'Create a new Notion page.',
      parameters: {
        parent_id: { type: 'string', required: true, description: 'Parent page or database ID' },
        title: { type: 'string', required: true, description: 'Page title' },
        content: { type: 'string', description: 'Page content (markdown)' },
      },
    },
  ],
};

const TOOL_LINEAR = {
  id: 'tool-linear',
  name: 'Linear',
  description: 'Track issues, manage sprints, and coordinate project work in Linear.',
  category: 'platform',
  connectionType: 'api',
  baseUrl: 'https://api.linear.app',
  required: false,
  credentials: [
    {
      key: 'LINEAR_API_KEY',
      label: 'Linear API Key',
      helpUrl: 'https://linear.app/settings/api',
      helpText: 'Generate a personal API key from Linear settings.',
    },
  ],
  endpoints: [
    {
      name: 'create_issue',
      method: 'POST',
      path: '/graphql',
      description: 'Create a new issue in Linear.',
      parameters: {
        title: { type: 'string', required: true, description: 'Issue title' },
        description: { type: 'string', description: 'Issue description (markdown)' },
        teamId: { type: 'string', required: true, description: 'Linear team ID' },
        priority: { type: 'number', description: '0 (none) to 4 (urgent)' },
      },
    },
    {
      name: 'list_issues',
      method: 'POST',
      path: '/graphql',
      description: 'List issues with filters.',
      parameters: {
        teamId: { type: 'string', description: 'Filter by team ID' },
        state: { type: 'string', description: 'Filter by state: backlog, todo, in_progress, done' },
      },
    },
  ],
};

// ── All tools registry ────────────────────────────────────────────

const PLATFORM_TOOLS = [
  // Shared
  TOOL_WEB_SEARCH,
  TOOL_DOC_GENERATOR,
  TOOL_EMAIL,
  // Founder
  TOOL_FINANCIAL_DATA,
  // Development
  TOOL_GITHUB,
  TOOL_VERCEL,
  TOOL_CLOUDFLARE_PAGES,
  TOOL_LANDING_PAGES,
  TOOL_VISION_QA,
  TOOL_PDF_GENERATOR,
  TOOL_STABILITY_AI,
  TOOL_PEXELS,
  TOOL_UNSPLASH,
  TOOL_FIGMA,
  TOOL_COLOR_PALETTE,
  TOOL_CODE_SANDBOX,
  TOOL_HTTP_CLIENT,
  // Marketing & Sales
  TOOL_TWITTER,
  TOOL_ANALYTICS,
  TOOL_CANVA,
  // Operations
  TOOL_SLACK,
  TOOL_NOTION,
  TOOL_LINEAR,
  // Browser Automation
  TOOL_BOOKMARKS,
  TOOL_BROWSER,
  TOOL_CAPTCHA_SOLVER,
  TOOL_CAPSOLVER_SOLVER,
  TOOL_SMS_VERIFY,
  TOOL_RENTAHUMAN,
  TOOL_TEMP_EMAIL,
  // Brand & Site Research (used by Browser Automation Lead)
  TOOL_BRANDFETCH,
];

/**
 * MCP tools derived from the Composio catalog.
 * Each gets connectionType 'composio' and category 'mcp'.
 * No endpoints — action schemas are fetched from Composio at runtime.
 */
const MCP_TOOLS = MCP_CATALOG.map((app) => ({
  id: app.id,
  name: app.name,
  description: app.description,
  category: 'mcp',
  connectionType: 'composio',
  composioApp: app.composioApp,
  subcategory: app.subcategory,
  actions: app.actions,
  required: false,
  credentials: [],
  endpoints: [],
}));

export const PREDEFINED_TOOLS = [...PLATFORM_TOOLS, ...MCP_TOOLS];

/**
 * Tool assignments per team. Maps team name → array of tool IDs.
 * Agents inherit their team's tools.
 */
export const TEAM_TOOLS = {
  Founder: [
    'tool-web-search',
    'tool-doc-generator',
    'tool-financial-data',
    'tool-email',
    // MCP
    'mcp-openai',
    'mcp-stripe',
    'mcp-hubspot',
    'mcp-salesforce',
    'mcp-huggingface',
  ],
  Development: [
    'tool-github',
    'tool-vercel',
    'tool-cloudflare-pages',
    'tool-code-sandbox',
    'tool-web-search',
    'tool-http-client',
    // MCP
    'mcp-github',
    'mcp-gitlab',
    'mcp-jira',
    'mcp-sentry',
    'mcp-langgraph',
    'mcp-huggingface',
  ],
  'Marketing & Sales': [
    'tool-web-search',
    'tool-email',
    'tool-twitter',
    'tool-analytics',
    'tool-canva',
    // MCP
    'mcp-mailchimp',
    'mcp-hubspot',
    'mcp-intercom',
    'mcp-twitter',
    'mcp-instagram',
  ],
  Operations: [
    'tool-slack',
    'tool-notion',
    'tool-linear',
    'tool-web-search',
    'tool-doc-generator',
    // Browser Automation
    'tool-browser',
    'tool-captcha-solver',
    'tool-temp-email',
    // MCP
    'mcp-discord',
    'mcp-todoist',
    'mcp-airtable',
    'mcp-google-sheets',
    'mcp-langgraph',
  ],
};

/**
 * Look up a tool template by ID.
 */
export function getToolById(toolId) {
  return PREDEFINED_TOOLS.find((t) => t.id === toolId) || null;
}

/**
 * Get all tools for a team.
 */
export function getToolsForTeam(teamName) {
  const toolIds = TEAM_TOOLS[teamName] || [];
  return toolIds.map(getToolById).filter(Boolean);
}

/**
 * Map a parameter type string to a JSON Schema type.
 */
function mapParamType(type) {
  if (type === 'array') return 'array';
  if (type === 'object') return 'object';
  return 'string';
}

/**
 * Convert a single endpoint's parameters to JSON Schema properties.
 */
function buildEndpointSchema(parameters) {
  const properties = {};
  const required = [];
  for (const [name, def] of Object.entries(parameters || {})) {
    properties[name] = {
      type: mapParamType(def.type),
      description: def.description || name,
    };
    if (def.type === 'array') properties[name].items = { type: 'string' };
    if (def.required) required.push(name);
  }
  return { properties, required };
}

/**
 * Convert tool endpoints to OpenAI-compatible function calling format.
 * Used by the ReAct loop in tool-runner.js.
 */
export function toolsToLlmFunctions(tools) {
  return tools.flatMap((tool) =>
    (tool.endpoints || []).map((ep) => {
      const { properties, required } = buildEndpointSchema(ep.parameters);
      return {
        type: 'function',
        function: {
          name: `${tool.id.replace('tool-', '')}__${ep.name}`,
          description: `[${tool.name}] ${ep.description}`,
          parameters: { type: 'object', properties, required },
        },
        _meta: {
          toolId: tool.id,
          endpointName: ep.name,
          method: ep.method,
          path: ep.path,
          baseUrl: tool.baseUrl,
        },
      };
    })
  );
}
