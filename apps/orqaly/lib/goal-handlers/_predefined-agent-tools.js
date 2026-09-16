/**
 * Server-side mirror of the role→tools mapping from
 * src/config/predefinedAgents.js.
 *
 * Why this file exists:
 *   The frontend predefinedAgentService seeds agents into the `agents` table
 *   and writes their tool list into `metadata.tools`. But until the user
 *   actually opens the Agent Hub page, that backfill never runs — and the
 *   server (lib/goal-handlers/stages/execute-phase.js) reads tools from
 *   `agent.metadata.tools` to enable the ReAct tool loop. Empty metadata
 *   means agents run text-only and goals fail with "Max iterations reached".
 *
 *   This module provides a server-side fallback so execute-phase.js can
 *   look up an agent's tools by role/name without depending on any
 *   frontend code path.
 *
 * Keep this in sync with src/config/predefinedAgents.js when adding new
 * agents or changing tool assignments.
 */

const PREDEFINED_TOOLS_BY_ROLE = {
  // ── Founder ───────────────────────────────────────────────────────────────
  'CEO/Founder': ['tool-web-search', 'tool-doc-generator', 'tool-email', 'mcp-hubspot', 'mcp-stripe'],
  'CTO': ['tool-web-search', 'tool-github', 'tool-doc-generator', 'mcp-github', 'mcp-gitlab'],
  'CFO': ['tool-web-search', 'tool-financial-data', 'tool-doc-generator', 'mcp-stripe', 'mcp-quickbooks'],
  'Business Development Manager': ['tool-web-search', 'tool-email', 'tool-doc-generator', 'mcp-hubspot', 'mcp-salesforce'],

  // ── Development ───────────────────────────────────────────────────────────
  'Product Owner': ['tool-web-search', 'tool-doc-generator'],
  'Product Manager': ['tool-web-search', 'tool-doc-generator', 'tool-linear', 'mcp-jira', 'mcp-asana'],
  'Frontend Developer': ['tool-github', 'tool-vercel', 'tool-cloudflare-pages', 'tool-landing-pages', 'tool-web-search', 'tool-code-sandbox', 'tool-pexels', 'tool-unsplash', 'mcp-github', 'mcp-netlify'],
  'Backend Developer': ['tool-github', 'tool-vercel', 'tool-web-search', 'tool-code-sandbox', 'tool-http-client', 'mcp-github', 'mcp-sentry'],
  'Designer': ['tool-web-search', 'tool-doc-generator', 'tool-cloudflare-pages', 'tool-landing-pages', 'tool-pexels', 'tool-unsplash', 'tool-figma', 'tool-color-palette', 'tool-canva', 'mcp-stability-ai'],
  'DevOps Engineer': ['tool-github', 'tool-vercel', 'tool-web-search', 'tool-http-client', 'mcp-github', 'mcp-cloudflare', 'mcp-sentry'],
  'Software Architect': ['tool-github', 'tool-web-search', 'tool-doc-generator', 'mcp-github', 'mcp-gitlab'],
  'Team Lead': ['tool-github', 'tool-web-search', 'tool-linear', 'mcp-jira', 'mcp-github'],
  'QA Tester': ['tool-github', 'tool-web-search', 'tool-code-sandbox', 'tool-vision-qa', 'tool-http-client', 'mcp-github', 'mcp-jira', 'mcp-sentry'],
  'Project Manager': ['tool-web-search', 'tool-linear', 'tool-doc-generator', 'tool-slack', 'mcp-jira', 'mcp-todoist'],
  'Prompt Engineer': ['tool-web-search', 'tool-doc-generator', 'tool-code-sandbox', 'mcp-github'],

  // ── Marketing & Sales ─────────────────────────────────────────────────────
  'SMM Manager': ['tool-twitter', 'tool-web-search', 'tool-analytics', 'mcp-twitter', 'mcp-instagram', 'mcp-linkedin'],
  'Creative Designer': ['tool-canva', 'tool-web-search', 'tool-pdf-generator', 'tool-stability-ai', 'mcp-stability-ai'],
  'Marketing Strategist': ['tool-web-search', 'tool-analytics', 'tool-email', 'tool-doc-generator', 'tool-pdf-generator', 'tool-bookmarks', 'mcp-mailchimp', 'mcp-hubspot'],
  'Sales Manager': ['tool-email', 'tool-web-search', 'tool-doc-generator', 'mcp-hubspot', 'mcp-salesforce'],
  'Marketing Project Manager': ['tool-web-search', 'tool-analytics', 'tool-slack', 'tool-doc-generator', 'mcp-asana', 'mcp-hubspot'],

  // ── Operations ────────────────────────────────────────────────────────────
  'Managing Director': ['tool-slack', 'tool-web-search', 'tool-doc-generator', 'tool-linear', 'mcp-discord', 'mcp-google-sheets'],
  'Accountant': ['tool-web-search', 'tool-doc-generator', 'mcp-quickbooks', 'mcp-stripe'],
  'Risk Manager': ['tool-web-search', 'tool-doc-generator', 'tool-notion', 'mcp-google-drive'],
  'Lawyer': ['tool-web-search', 'tool-doc-generator', 'mcp-google-drive'],
  'HR Specialist': ['tool-web-search', 'tool-doc-generator', 'tool-slack', 'tool-notion', 'mcp-google-drive', 'mcp-todoist'],
  'Customer Support Manager': ['tool-slack', 'tool-web-search', 'tool-doc-generator', 'tool-notion', 'mcp-discord', 'mcp-intercom'],
  'Account Creation Specialist': ['tool-web-search', 'tool-http-client', 'tool-browser', 'tool-captcha-solver', 'tool-temp-email', 'tool-bookmarks'],
  'Browser Automation Lead': ['tool-web-search', 'tool-doc-generator', 'tool-slack', 'tool-http-client', 'tool-browser', 'tool-temp-email', 'mcp-firecrawl', 'tool-brandfetch', 'tool-vision-qa', 'tool-bookmarks'],
  'GitHub Intelligence Researcher': ['tool-web-search', 'tool-doc-generator', 'tool-bookmarks'],

  // ── System ────────────────────────────────────────────────────────────────
  'Prompt Optimization Agent': ['tool-doc-generator'],
  'Roadmap Strategist': ['tool-web-search', 'tool-doc-generator'],

  // ── Sector Specialists ────────────────────────────────────────────────────
  'iGaming Compliance Officer': ['tool-web-search', 'tool-doc-generator', 'tool-email', 'tool-http-client'],
  'Casino Operations Manager': ['tool-web-search', 'tool-doc-generator', 'tool-http-client', 'tool-financial-data'],
  'Payments & Fraud Manager': ['tool-web-search', 'tool-doc-generator', 'tool-http-client', 'tool-financial-data'],
  'Ecommerce Operations Manager': ['tool-web-search', 'tool-doc-generator', 'tool-http-client', 'tool-financial-data'],
  'Customer Experience Manager': ['tool-web-search', 'tool-doc-generator', 'tool-email'],
  'Supply Chain Manager': ['tool-web-search', 'tool-doc-generator', 'tool-email', 'tool-financial-data'],
  'EMI Compliance Analyst': ['tool-web-search', 'tool-doc-generator', 'tool-email'],
  'Payments Product Manager': ['tool-web-search', 'tool-doc-generator', 'tool-http-client', 'tool-financial-data'],
  'AML/KYC Officer': ['tool-web-search', 'tool-doc-generator', 'tool-http-client'],
  'Affiliate Manager': ['tool-web-search', 'tool-doc-generator', 'tool-email', 'mcp-hubspot'],
  'Performance Marketing Manager': ['tool-web-search', 'tool-doc-generator', 'tool-financial-data', 'tool-http-client'],
  'Partner Success Manager': ['tool-web-search', 'tool-doc-generator', 'tool-email'],
};

/**
 * Look up tools for an agent by its role/name.
 * Returns an empty array if the role is unknown.
 */
export function getPredefinedToolsForRole(roleOrName) {
  if (!roleOrName) return [];
  return PREDEFINED_TOOLS_BY_ROLE[roleOrName] || [];
}

export default PREDEFINED_TOOLS_BY_ROLE;
