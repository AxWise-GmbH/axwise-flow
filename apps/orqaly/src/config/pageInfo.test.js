import { describe, it, expect } from 'vitest';
import { getPageTitle, PAGE_INFO } from './pageInfo';

describe('getPageTitle', () => {
  it('returns the PAGE_INFO title for a mapped route', () => {
    expect(getPageTitle('/consilium')).toBe('Consilium');
    expect(getPageTitle('/tools')).toBe('Tools');
    expect(getPageTitle('/agent-hub')).toBe('Agents');
    expect(getPageTitle('/job-pool')).toBe('Requests');
  });

  it('uses overrides for routes missing from PAGE_INFO', () => {
    expect(getPageTitle('/hub')).toBe('Reports');
    expect(getPageTitle('/assistant')).toBe('Assistant');
    expect(getPageTitle('/home')).toBe('Home');
  });

  it('resolves nested routes to the parent title', () => {
    expect(getPageTitle('/organizations/abc-123')).toBe('Organizations');
    expect(getPageTitle('/marketplace/browse')).toBe('Personal Catalog');
    expect(getPageTitle('/settings/booking')).toBe('Settings');
  });

  it('titleizes the first segment as a graceful fallback', () => {
    expect(getPageTitle('/foo-bar')).toBe('Foo Bar');
    expect(getPageTitle('/somethingnew')).toBe('Somethingnew');
  });

  it('strips a query string and handles empty input', () => {
    expect(getPageTitle('/consilium?tab=x')).toBe('Consilium');
    expect(getPageTitle('')).toBeNull();
    expect(getPageTitle('/')).toBeNull();
  });
});

describe('PAGE_INFO sidebar info entries', () => {
  // These power the (i) info button + panel in the sidebar; each needs a
  // title, a description string, and a non-empty features array.
  it.each(['/home', '/dashboards', '/replicators'])('has a well-formed entry for %s', (path) => {
    const info = PAGE_INFO[path];
    expect(info).toBeTruthy();
    expect(typeof info.title).toBe('string');
    expect(info.title.length).toBeGreaterThan(0);
    expect(typeof info.description).toBe('string');
    expect(info.description.length).toBeGreaterThan(0);
    expect(Array.isArray(info.features)).toBe(true);
    expect(info.features.length).toBeGreaterThan(0);
  });
});
