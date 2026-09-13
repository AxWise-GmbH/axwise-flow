/**
 * Tool icon domain resolution + monochrome fallback mapping.
 *
 * Tools in the catalog are mostly real brands (GitHub, Stripe, Discord, ...).
 * We render their logos by deriving a registrable brand domain and pointing a
 * logo CDN at it. When no domain resolves (generic action tools) or the logo
 * fails to load, callers fall back to a theme-matched MUI category icon.
 *
 * Source of truth for the domain is, in order: the tool's own
 * endpointUrl/baseUrl/composioApp, then the MCP catalog entry, then the
 * predefined-tool entry (looked up by id).
 */
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import CompareOutlinedIcon from '@mui/icons-material/CompareOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HttpOutlinedIcon from '@mui/icons-material/HttpOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import WebOutlinedIcon from '@mui/icons-material/WebOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import {
  siDiscord,
  siTelegram,
  siWhatsapp,
  siGithub,
  siGitlab,
  siBitbucket,
  siJira,
  siSentry,
  siNetlify,
  siCloudflare,
  siGoogledrive,
  siGooglesheets,
  siGooglecalendar,
  siAirtable,
  siTodoist,
  siAsana,
  siSupabase,
  siFirebase,
  siMongodb,
  siReplicate,
  siHuggingface,
  siHubspot,
  siMailchimp,
  siIntercom,
  siStripe,
  siQuickbooks,
  siBrave,
  siX,
  siInstagram,
  siLangchain,
  siFigma,
  siNotion,
  siLinear,
  siVercel,
  siBrandfetch,
  // batch 2
  siGmail,
  siZoom,
  siConfluence,
  siClickup,
  siTrello,
  siDropbox,
  siCalendly,
  siCoda,
  siSnowflake,
  siGooglebigquery,
  siPostgresql,
  siAnthropic,
  siElevenlabs,
  siPerplexity,
  siZendesk,
  siTypeform,
  siPaypal,
  siXero,
  siSquare,
  siYoutube,
  siReddit,
  siFacebook,
  siMiro,
  siShopify,
  siWoocommerce,
  siBigcommerce,
  siWebflow,
  siRetool,
} from 'simple-icons';
import { getMcpAppById } from './mcpToolCatalog';
import { getToolById } from './predefinedTools';

/**
 * Overrides for cases where the API host is not the brand domain (or a more
 * recognizable brand-product favicon exists). Keyed by composioApp slug or
 * tool id (both lowercased).
 */
export const DOMAIN_OVERRIDES = {
  // API host points at a parent/aggregator, not the brand:
  whatsapp: 'whatsapp.com', // endpoint is graph.facebook.com
  hubspot: 'hubspot.com', // endpoint is api.hubapi.com
  // Generic Google APIs host -> brand product favicon:
  googledrive: 'drive.google.com',
  googlesheets: 'sheets.google.com',
  googlecalendar: 'calendar.google.com',
  firebase: 'firebase.google.com',
  quickbooks: 'quickbooks.intuit.com',
  // Rebranded:
  twitter: 'x.com',
  // langgraph.com has no usable favicon; LangGraph is a LangChain product:
  langgraph: 'langchain.com',
  // Real brands whose predefined-tool entry carries no baseUrl to derive from:
  'tool-brandfetch': 'brandfetch.com',
  'tool-cloudflare-pages': 'cloudflare.com',
  'tool-stability-ai': 'stability.ai',
  // batch 2 — API host differs from the recognizable brand domain:
  gmail: 'mail.google.com', // endpoint is gmail.googleapis.com
  outlook: 'outlook.com', // endpoint is graph.microsoft.com (generic MS mark)
  dropbox: 'dropbox.com', // endpoint is api.dropboxapi.com
  googlebigquery: 'cloud.google.com', // endpoint is bigquery.googleapis.com
  youtube: 'youtube.com', // endpoint is www.googleapis.com/youtube
  square: 'square.com', // endpoint is connect.squareup.com
  confluence: 'confluence.atlassian.com', // atlassian.com favicon is Jira's mark
};

/**
 * Monochrome, theme-matched fallback icon per MCP subcategory.
 * Subcategory names match MCP_SUBCATEGORIES in mcpToolCatalog.js.
 */
export const CATEGORY_FALLBACK_ICON = {
  Communication: ChatOutlinedIcon,
  Development: CodeOutlinedIcon,
  Productivity: TaskAltOutlinedIcon,
  'Data & Storage': StorageOutlinedIcon,
  'AI & ML': AutoAwesomeOutlinedIcon,
  'Marketing & CRM': CampaignOutlinedIcon,
  Finance: PaymentsOutlinedIcon,
  'Search & Web': TravelExploreOutlinedIcon,
  'Social Media': ShareOutlinedIcon,
  'Agent Frameworks': SmartToyOutlinedIcon,
  'Design & Creative': PaletteOutlinedIcon,
  'E-commerce': ShoppingCartOutlinedIcon,
  'App Builders / No-Code': WebOutlinedIcon,
};

/**
 * Purpose-specific fallback icons for internal tools that have no external
 * brand (and thus no logo to fetch). Keyed by predefined-tool id.
 */
export const TOOL_ID_FALLBACK_ICON = {
  'tool-color-palette': PaletteOutlinedIcon,
  'tool-vision-qa': CompareOutlinedIcon,
  'tool-pdf-generator': PictureAsPdfOutlinedIcon,
  'tool-doc-generator': DescriptionOutlinedIcon,
  'tool-http-client': HttpOutlinedIcon,
  'tool-temp-email': MarkEmailReadOutlinedIcon,
  'tool-landing-pages': WebOutlinedIcon,
};

/**
 * Purpose-specific fallback icons for seed tools, which are created with random
 * ids (see toolService.SEED_TOOLS) and so must be matched by name.
 */
export const TOOL_NAME_FALLBACK_ICON = {
  'Data Hub': StorageOutlinedIcon,
  'SMS Sendout': SmsOutlinedIcon,
  'Mail Sendout': MailOutlineIcon,
};

const DEFAULT_FALLBACK_ICON = ExtensionOutlinedIcon;

/** Derive the registrable root domain (last two labels) from a URL. */
function rootDomain(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const parts = host.split('.');
    return parts.length <= 2 ? host : parts.slice(-2).join('.');
  } catch {
    return null;
  }
}

/**
 * Resolve a brand domain for a tool. Accepts a DB tool row, an MCP catalog
 * entry, or a predefined tool. Returns null when nothing resolves.
 */
export function resolveToolDomain(tool) {
  if (!tool) return null;

  // Always enrich from the catalogs: MCP DB rows carry a composioApp but no
  // endpointUrl/baseUrl, so the catalog entry is the only place the brand URL
  // lives. getMcpAppById/getToolById return null for non-catalog ids.
  const entry = getMcpAppById(tool.id) || getToolById(tool.id) || tool;

  const slug = (tool.composioApp || entry.composioApp || '').toLowerCase();
  if (slug && DOMAIN_OVERRIDES[slug]) return DOMAIN_OVERRIDES[slug];

  const id = (tool.id || '').toLowerCase();
  if (id && DOMAIN_OVERRIDES[id]) return DOMAIN_OVERRIDES[id];

  const url =
    tool.endpointUrl ||
    tool.baseUrl ||
    entry.endpointUrl ||
    entry.baseUrl ||
    tool.data?.endpointUrl ||
    tool.data?.baseUrl;

  return rootDomain(url);
}

// Public Brandfetch Logo Link client id. Safe to ship in the frontend bundle:
// it is a public, embeddable id, distinct from the secret BRANDFETCH_API_KEY
// used server-side. When unset, the logo chain falls back to DuckDuckGo.

/** Full-color, cropped brand logo from Brandfetch's CDN (null without a client id). */
export function brandfetchLogoUrl(domain) {
  const clientId = import.meta.env.VITE_BRANDFETCH_CLIENT_ID || '';
  if (!domain || !clientId) return null;
  return `https://cdn.brandfetch.io/${domain}/w/64/h/64?c=${clientId}`;
}

/** Low-res favicon fallback that needs no key. */
export function duckduckgoLogoUrl(domain) {
  if (!domain) return null;
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

/** Ordered list of logo URLs to try for a domain (best quality first). */
export function toolLogoUrls(domain) {
  const urls = [brandfetchLogoUrl(domain)];
  // Skip the favicon for shared-mark domains so the distinct brand glyph wins.
  if (!(domain && PREFER_GLYPH_DOMAINS.has(domain))) {
    urls.push(duckduckgoLogoUrl(domain));
  }
  return urls.filter(Boolean);
}

/** First (best) logo URL for a domain; kept for callers that want a single src. */
export function toolLogoUrl(domain) {
  return toolLogoUrls(domain)[0] || null;
}

/** Pick the monochrome fallback icon component for a tool. */
export function fallbackIconFor(tool) {
  const id = tool?.id || '';
  if (TOOL_ID_FALLBACK_ICON[id]) return TOOL_ID_FALLBACK_ICON[id];

  const name = tool?.name || '';
  if (TOOL_NAME_FALLBACK_ICON[name]) return TOOL_NAME_FALLBACK_ICON[name];

  const sub = tool?.subcategory || tool?.data?.subcategory || '';
  return CATEGORY_FALLBACK_ICON[sub] || DEFAULT_FALLBACK_ICON;
}

/**
 * Official brand glyphs (simple-icons, CC0-1.0) keyed by the domain that
 * resolveToolDomain returns. Used as a guaranteed brand mark when no colored
 * logo can be fetched, so a real brand never degrades to a generic category
 * icon. Brands absent from simple-icons (Slack, LinkedIn, Salesforce, Twilio,
 * Canva, OpenAI, ...) are intentionally omitted; they rely on the favicon step.
 */
export const BRAND_GLYPH_BY_DOMAIN = {
  'discord.com': siDiscord,
  'telegram.org': siTelegram,
  'whatsapp.com': siWhatsapp,
  'github.com': siGithub,
  'gitlab.com': siGitlab,
  'bitbucket.org': siBitbucket,
  'atlassian.com': siJira,
  'sentry.io': siSentry,
  'netlify.com': siNetlify,
  'cloudflare.com': siCloudflare,
  'drive.google.com': siGoogledrive,
  'sheets.google.com': siGooglesheets,
  'calendar.google.com': siGooglecalendar,
  'airtable.com': siAirtable,
  'todoist.com': siTodoist,
  'asana.com': siAsana,
  'supabase.com': siSupabase,
  'firebase.google.com': siFirebase,
  'mongodb.com': siMongodb,
  'replicate.com': siReplicate,
  'huggingface.co': siHuggingface,
  'hubspot.com': siHubspot,
  'mailchimp.com': siMailchimp,
  'intercom.io': siIntercom,
  'stripe.com': siStripe,
  'quickbooks.intuit.com': siQuickbooks,
  'brave.com': siBrave,
  'x.com': siX,
  'twitter.com': siX,
  'instagram.com': siInstagram,
  'langchain.com': siLangchain,
  'figma.com': siFigma,
  'notion.com': siNotion,
  'linear.app': siLinear,
  'vercel.com': siVercel,
  'brandfetch.com': siBrandfetch,
  // batch 2 — brands with an official simple-icons glyph. Others (Slack,
  // Pipedrive, Klaviyo, Canva, Tavily, Exa, Apify, Outlook) have no glyph and
  // fall back to the favicon fetched from their endpointUrl/override domain.
  'mail.google.com': siGmail,
  'zoom.us': siZoom,
  'confluence.atlassian.com': siConfluence,
  'clickup.com': siClickup,
  'trello.com': siTrello,
  'dropbox.com': siDropbox,
  'calendly.com': siCalendly,
  'coda.io': siCoda,
  'snowflake.com': siSnowflake,
  'cloud.google.com': siGooglebigquery,
  'postgresql.org': siPostgresql,
  'anthropic.com': siAnthropic,
  'elevenlabs.io': siElevenlabs,
  'perplexity.ai': siPerplexity,
  'zendesk.com': siZendesk,
  'typeform.com': siTypeform,
  'paypal.com': siPaypal,
  'xero.com': siXero,
  'square.com': siSquare,
  'youtube.com': siYoutube,
  'reddit.com': siReddit,
  'facebook.com': siFacebook,
  'miro.com': siMiro,
  'shopify.com': siShopify,
  'woocommerce.com': siWoocommerce,
  'bigcommerce.com': siBigcommerce,
  'webflow.com': siWebflow,
  'retool.com': siRetool,
};

/**
 * Domains whose favicon is a shared, generic brand mark — every Google
 * Workspace subdomain returns the same Google "G", so the favicon cannot tell
 * Drive from Sheets from Calendar. For these we skip the favicon and render the
 * distinct simple-icons product glyph (in its real brand color) instead.
 * Brandfetch, when configured, is still tried first.
 */
export const PREFER_GLYPH_DOMAINS = new Set([
  'drive.google.com',
  'sheets.google.com',
  'calendar.google.com',
]);

/** simple-icons record ({ path, hex, title }) for a tool's brand, or null. */
export function brandGlyphFor(tool) {
  const domain = resolveToolDomain(tool);
  return (domain && BRAND_GLYPH_BY_DOMAIN[domain]) || null;
}
