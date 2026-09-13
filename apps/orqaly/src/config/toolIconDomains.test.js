import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  resolveToolDomain,
  toolLogoUrl,
  toolLogoUrls,
  duckduckgoLogoUrl,
  brandfetchLogoUrl,
  fallbackIconFor,
  brandGlyphFor,
  DOMAIN_OVERRIDES,
  CATEGORY_FALLBACK_ICON,
  TOOL_ID_FALLBACK_ICON,
  TOOL_NAME_FALLBACK_ICON,
  BRAND_GLYPH_BY_DOMAIN,
} from './toolIconDomains';
import { MCP_CATALOG, MCP_SUBCATEGORIES } from './mcpToolCatalog';

describe('resolveToolDomain', () => {
  it('derives the registrable root domain from an endpointUrl', () => {
    expect(resolveToolDomain({ endpointUrl: 'https://api.github.com' })).toBe('github.com');
  });

  it('derives the root domain from a baseUrl', () => {
    expect(resolveToolDomain({ baseUrl: 'https://api.vercel.com' })).toBe('vercel.com');
  });

  it('strips deep subdomains and paths', () => {
    expect(resolveToolDomain({ endpointUrl: 'https://sheets.googleapis.com/v4' })).toBe(
      'googleapis.com'
    );
    expect(resolveToolDomain({ baseUrl: 'https://gitlab.com/api/v4' })).toBe('gitlab.com');
  });

  it('keeps two-label domains intact', () => {
    expect(resolveToolDomain({ baseUrl: 'https://api.stability.ai' })).toBe('stability.ai');
  });

  it('applies a slug override when the API host is not the brand', () => {
    // graph.facebook.com would otherwise resolve to facebook.com
    expect(
      resolveToolDomain({ composioApp: 'whatsapp', endpointUrl: 'https://graph.facebook.com' })
    ).toBe(DOMAIN_OVERRIDES.whatsapp);
  });

  it('applies the rebranded twitter override', () => {
    expect(
      resolveToolDomain({ composioApp: 'twitter', endpointUrl: 'https://api.twitter.com' })
    ).toBe('x.com');
  });

  it('applies tool-id overrides for real brands that carry no baseUrl', () => {
    expect(resolveToolDomain({ id: 'tool-brandfetch' })).toBe('brandfetch.com');
    expect(resolveToolDomain({ id: 'tool-cloudflare-pages' })).toBe('cloudflare.com');
    expect(resolveToolDomain({ id: 'tool-stability-ai' })).toBe('stability.ai');
  });

  it('enriches MCP rows that carry only composioApp (no endpointUrl) from the catalog', () => {
    // Regression: MCP DB rows have composioApp but no endpointUrl; the catalog
    // entry is the only place the brand URL lives.
    expect(resolveToolDomain({ id: 'mcp-huggingface', composioApp: 'huggingface' })).toBe(
      'huggingface.co'
    );
    expect(resolveToolDomain({ id: 'mcp-discord', composioApp: 'discord' })).toBe('discord.com');
  });

  it('routes LangGraph to the LangChain brand domain', () => {
    expect(
      resolveToolDomain({ composioApp: 'langgraph', endpointUrl: 'https://langgraph.com' })
    ).toBe('langchain.com');
  });

  it('reads from nested data fields on a DB tool row', () => {
    expect(resolveToolDomain({ data: { baseUrl: 'https://api.stripe.com' } })).toBe('stripe.com');
  });

  it('enriches from the MCP catalog by id', () => {
    expect(resolveToolDomain({ id: 'mcp-github' })).toBe('github.com');
  });

  it('enriches from the predefined-tool catalog by id', () => {
    expect(resolveToolDomain({ id: 'tool-vercel' })).toBe('vercel.com');
  });

  it('returns null when nothing resolves', () => {
    expect(resolveToolDomain({})).toBeNull();
    expect(resolveToolDomain({ id: 'definitely-not-a-tool' })).toBeNull();
    expect(resolveToolDomain(null)).toBeNull();
    expect(resolveToolDomain({ baseUrl: 'not a url' })).toBeNull();
  });
});

describe('logo urls', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds a DuckDuckGo favicon url for a domain', () => {
    expect(duckduckgoLogoUrl('github.com')).toBe('https://icons.duckduckgo.com/ip3/github.com.ico');
  });

  it('returns null for a missing domain', () => {
    expect(toolLogoUrl(null)).toBeNull();
    expect(toolLogoUrls(null)).toEqual([]);
    expect(brandfetchLogoUrl(null)).toBeNull();
    expect(duckduckgoLogoUrl(null)).toBeNull();
  });

  it('omits Brandfetch and uses only DuckDuckGo when no client id is set', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', '');
    expect(brandfetchLogoUrl('github.com')).toBeNull();
    expect(toolLogoUrls('github.com')).toEqual(['https://icons.duckduckgo.com/ip3/github.com.ico']);
    expect(toolLogoUrl('github.com')).toBe('https://icons.duckduckgo.com/ip3/github.com.ico');
  });

  it('skips the shared favicon for Google Workspace domains so the glyph wins', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', '');
    expect(toolLogoUrls('drive.google.com')).toEqual([]);
    expect(toolLogoUrls('sheets.google.com')).toEqual([]);
    expect(toolLogoUrls('calendar.google.com')).toEqual([]);
    // Normal domains keep their favicon.
    expect(toolLogoUrls('github.com')).toEqual(['https://icons.duckduckgo.com/ip3/github.com.ico']);
  });

  it('keeps Brandfetch but still drops the favicon for prefer-glyph domains', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'test-client');
    expect(toolLogoUrls('drive.google.com')).toEqual([
      'https://cdn.brandfetch.io/drive.google.com/w/64/h/64?c=test-client',
    ]);
  });

  it('prefers Brandfetch then falls back to DuckDuckGo when a client id is set', () => {
    vi.stubEnv('VITE_BRANDFETCH_CLIENT_ID', 'test-client');
    expect(brandfetchLogoUrl('github.com')).toBe(
      'https://cdn.brandfetch.io/github.com/w/64/h/64?c=test-client'
    );
    expect(toolLogoUrls('github.com')).toEqual([
      'https://cdn.brandfetch.io/github.com/w/64/h/64?c=test-client',
      'https://icons.duckduckgo.com/ip3/github.com.ico',
    ]);
    expect(toolLogoUrl('github.com')).toBe(
      'https://cdn.brandfetch.io/github.com/w/64/h/64?c=test-client'
    );
  });
});

describe('fallbackIconFor', () => {
  it('returns the mapped icon for a known subcategory', () => {
    expect(fallbackIconFor({ subcategory: 'Finance' })).toBe(CATEGORY_FALLBACK_ICON.Finance);
  });

  it('reads subcategory from nested data', () => {
    expect(fallbackIconFor({ data: { subcategory: 'Development' } })).toBe(
      CATEGORY_FALLBACK_ICON.Development
    );
  });

  it('falls back to a default icon for unknown / missing subcategory', () => {
    const icon = fallbackIconFor({});
    expect(typeof icon === 'object' || typeof icon === 'function').toBe(true);
  });

  it('returns a purpose-specific icon for an internal tool id', () => {
    expect(fallbackIconFor({ id: 'tool-color-palette' })).toBe(
      TOOL_ID_FALLBACK_ICON['tool-color-palette']
    );
    expect(fallbackIconFor({ id: 'tool-vision-qa' })).toBe(TOOL_ID_FALLBACK_ICON['tool-vision-qa']);
  });

  it('matches seed tools by name', () => {
    expect(fallbackIconFor({ name: 'Mail Sendout' })).toBe(TOOL_NAME_FALLBACK_ICON['Mail Sendout']);
    expect(fallbackIconFor({ name: 'Data Hub' })).toBe(TOOL_NAME_FALLBACK_ICON['Data Hub']);
  });

  it('prefers the id/name map over the subcategory map', () => {
    expect(fallbackIconFor({ id: 'tool-color-palette', subcategory: 'Finance' })).toBe(
      TOOL_ID_FALLBACK_ICON['tool-color-palette']
    );
  });
});

describe('brandGlyphFor', () => {
  it('returns the simple-icons record for a known brand domain', () => {
    const glyph = brandGlyphFor({ id: 'mcp-huggingface', composioApp: 'huggingface' });
    expect(glyph).toBe(BRAND_GLYPH_BY_DOMAIN['huggingface.co']);
    expect(typeof glyph.path).toBe('string');
    expect(typeof glyph.title).toBe('string');
  });

  it('maps LangGraph to the LangChain glyph via its override domain', () => {
    expect(brandGlyphFor({ composioApp: 'langgraph', endpointUrl: 'https://langgraph.com' })).toBe(
      BRAND_GLYPH_BY_DOMAIN['langchain.com']
    );
  });

  it('returns null when no domain resolves or no glyph exists', () => {
    expect(brandGlyphFor({ name: 'Generic Action' })).toBeNull();
    // OpenAI has a domain but is intentionally absent from simple-icons.
    expect(brandGlyphFor({ id: 'mcp-openai', composioApp: 'openai' })).toBeNull();
  });
});

describe('catalog icon coverage', () => {
  it('every MCP catalog entry resolves a real brand icon (glyph or favicon domain)', () => {
    // Guarantees "an icon for each tool": either a crisp simple-icons glyph, or
    // a resolvable domain whose favicon the logo chain can fetch. A tool with
    // neither would degrade to the generic Extension fallback.
    for (const app of MCP_CATALOG) {
      const hasGlyph = Boolean(brandGlyphFor(app));
      const hasDomain = Boolean(resolveToolDomain(app));
      expect(
        hasGlyph || hasDomain,
        `${app.id} has no glyph and no resolvable icon domain`
      ).toBe(true);
    }
  });

  it('every subcategory has a monochrome fallback icon', () => {
    for (const sub of MCP_SUBCATEGORIES) {
      expect(CATEGORY_FALLBACK_ICON[sub], `${sub} missing fallback icon`).toBeTruthy();
    }
  });

  it('resolves the expected glyph domains for representative batch-2 tools', () => {
    expect(brandGlyphFor(getEntry('mcp-shopify'))).toBe(BRAND_GLYPH_BY_DOMAIN['shopify.com']);
    expect(brandGlyphFor(getEntry('mcp-gmail'))).toBe(BRAND_GLYPH_BY_DOMAIN['mail.google.com']);
    expect(brandGlyphFor(getEntry('mcp-youtube'))).toBe(BRAND_GLYPH_BY_DOMAIN['youtube.com']);
    // Slack has no simple-icons glyph — it must still resolve a favicon domain.
    expect(brandGlyphFor(getEntry('mcp-slack'))).toBeNull();
    expect(resolveToolDomain(getEntry('mcp-slack'))).toBe('slack.com');
  });
});

function getEntry(id) {
  return MCP_CATALOG.find((a) => a.id === id);
}
