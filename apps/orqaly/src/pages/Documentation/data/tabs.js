import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

/**
 * Tab definitions for the Documentation page. `icon` is a plain MUI component
 * passed to AppIcon as `fallback` (AppIcon reverse-maps the name in advanced
 * icon modes), so no separate icon-name string is needed.
 */
export const TABS = [
  { key: 'start', label: 'Getting Started', icon: RocketLaunchOutlinedIcon },
  { key: 'faq', label: 'FAQ', icon: HelpOutlineOutlinedIcon },
  { key: 'product', label: 'Product & Pages', icon: DashboardOutlinedIcon },
  { key: 'architecture', label: 'Architecture & API', icon: SchemaOutlinedIcon },
  { key: 'agents', label: 'AI Agents', icon: SmartToyOutlinedIcon },
  { key: 'consilium', label: 'Consilium', icon: ShieldOutlinedIcon },
  { key: 'providers', label: 'LLM Providers', icon: HubOutlinedIcon },
  { key: 'tools', label: 'Tools', icon: BuildOutlinedIcon },
  { key: 'keys', label: 'API Keys', icon: VpnKeyOutlinedIcon },
  { key: 'full', label: 'Full Docs', icon: DescriptionOutlinedIcon },
];

export const TAB_DESCRIPTIONS = {
  start:
    'What Orqaly is, how the orchestration layers fit together, a fast local-dev quickstart, the Supabase authentication flow, and every environment variable you need to run the platform.',
  faq: 'Plain-language answers about agents, goals, boards, workflows, and the marketplace - written for operators and new team members, not just engineers.',
  product:
    'A guided tour of every product surface: what each page does and where it lives, so you can map a user workflow to the right screen and the right handler.',
  architecture:
    'The serverless dispatcher model (?path= routing), the auth + rate-limit + validation pattern every handler shares, the endpoint surface per dispatcher, and the Postgres schema (RLS, pgvector, migrations).',
  agents:
    'How external AI agents connect over MCP, enqueue jobs, ingest reports, and operate under least-privilege scopes - with copy-paste examples for MCP, Python, JavaScript, cURL, and no-code automation.',
  consilium:
    'The AI board of directors: member roles, consensus rules, security levels, the evaluation pipeline, governance and quarantine, and the endpoints for onboarding and running agents through it.',
  providers:
    'Every supported LLM provider with its default model, credential, and endpoint; the automatic fallback chain; local-first hybrid routing; per-request usage/cost tracking; and BYOK envelope encryption.',
  tools:
    'How external tools and integrations plug into Orqaly core solutions - connection types, the scoped workspace model, and execution examples.',
  keys: 'Admin-only API key management: create, scope, revoke, and audit keys. For verified human operators only - never wire automation or agents into this tab.',
  full: 'The complete long-form project documentation in Markdown. Load it inline for quick searching, or open the source docs to share and annotate with your team.',
};
