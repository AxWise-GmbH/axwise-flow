import { describe, it, expect } from 'vitest';
import {
  MCP_CATALOG,
  MCP_SUBCATEGORIES,
  getMcpAppById,
  getMcpAppsBySubcategory,
} from './mcpToolCatalog';

describe('mcpToolCatalog', () => {
  it('has the full curated catalog (~80 apps)', () => {
    expect(MCP_CATALOG.length).toBeGreaterThanOrEqual(75);
    expect(MCP_CATALOG.length).toBeLessThanOrEqual(90);
  });

  it('every entry has required fields', () => {
    for (const app of MCP_CATALOG) {
      expect(app.id).toBeTruthy();
      expect(app.composioApp).toBeTruthy();
      expect(app.name).toBeTruthy();
      expect(app.description).toBeTruthy();
      expect(app.subcategory).toBeTruthy();
      expect(typeof app.popular).toBe('boolean');
      expect(Array.isArray(app.actions)).toBe(true);
      expect(app.actions.length).toBeGreaterThan(0);
    }
  });

  it('every entry carries an endpointUrl so a brand icon can resolve', () => {
    // toolIconDomains resolves a logo from endpointUrl (or a DOMAIN_OVERRIDES
    // entry). A missing endpointUrl would silently degrade the card to the
    // generic Extension fallback — guard against that here.
    for (const app of MCP_CATALOG) {
      expect(app.endpointUrl, `${app.id} needs endpointUrl`).toMatch(/^https?:\/\//);
    }
  });

  it('every entry has a valid riskTier and coherent action sets', () => {
    for (const app of MCP_CATALOG) {
      expect(['low', 'medium', 'high']).toContain(app.riskTier);
      expect(Array.isArray(app.actionsSafe)).toBe(true);
      expect(Array.isArray(app.actionsSensitive)).toBe(true);
      // actions is the back-compat union tool-runner reads.
      for (const a of [...app.actionsSafe, ...app.actionsSensitive]) {
        expect(app.actions).toContain(a);
      }
    }
  });

  it('all IDs start with mcp-', () => {
    for (const app of MCP_CATALOG) {
      expect(app.id).toMatch(/^mcp-/);
    }
  });

  it('has no duplicate IDs', () => {
    const ids = MCP_CATALOG.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('subcategories are from known list', () => {
    for (const app of MCP_CATALOG) {
      expect(MCP_SUBCATEGORIES).toContain(app.subcategory);
    }
  });

  it('has 13 subcategories including the batch-2 additions', () => {
    expect(MCP_SUBCATEGORIES).toHaveLength(13);
    expect(MCP_SUBCATEGORIES).toContain('Design & Creative');
    expect(MCP_SUBCATEGORIES).toContain('E-commerce');
    expect(MCP_SUBCATEGORIES).toContain('App Builders / No-Code');
  });

  it('every subcategory has at least one tool', () => {
    for (const sub of MCP_SUBCATEGORIES) {
      expect(getMcpAppsBySubcategory(sub).length).toBeGreaterThan(0);
    }
  });

  it('includes the marquee batch-2 apps in the right subcategories', () => {
    const cases = [
      ['mcp-slack', 'Slack', 'Communication'],
      ['mcp-notion', 'Notion', 'Productivity'],
      ['mcp-shopify', 'Shopify', 'E-commerce'],
      ['mcp-figma', 'Figma', 'Design & Creative'],
      ['mcp-webflow', 'Webflow', 'App Builders / No-Code'],
    ];
    for (const [id, name, sub] of cases) {
      const app = getMcpAppById(id);
      expect(app, `${id} missing`).toBeTruthy();
      expect(app.name).toBe(name);
      expect(app.subcategory).toBe(sub);
    }
  });

  it('getMcpAppById returns correct entry', () => {
    const github = getMcpAppById('mcp-github');
    expect(github).toBeDefined();
    expect(github.name).toBe('GitHub');
  });

  it('getMcpAppById returns undefined for unknown ID', () => {
    expect(getMcpAppById('mcp-nonexistent')).toBeNull();
  });

  it('getMcpAppsBySubcategory filters correctly', () => {
    const devApps = getMcpAppsBySubcategory('Development');
    expect(devApps.length).toBeGreaterThan(0);
    for (const app of devApps) {
      expect(app.subcategory).toBe('Development');
    }
  });
});
