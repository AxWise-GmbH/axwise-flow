import { describe, expect, it } from 'vitest';
import { evaluateProductionAudit } from './check-production-audit.mjs';

function report(vulnerabilities) {
  return {
    vulnerabilities,
    metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } },
  };
}

const routerAdvisory = {
  severity: 'high',
  url: 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
  title: 'RSC action advisory',
};

describe('evaluateProductionAudit', () => {
  it('blocks unexcepted high and critical production advisories', () => {
    const result = evaluateProductionAudit(
      report({
        dangerous: {
          severity: 'critical',
          via: [{ ...routerAdvisory, url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
        },
      })
    );
    expect(result.blockers).toHaveLength(1);
  });

  it('allows only the documented Router RSC advisory before review expiry', () => {
    const result = evaluateProductionAudit(
      report({
        'react-router': { severity: 'high', via: [routerAdvisory] },
        'react-router-dom': { severity: 'high', via: ['react-router'] },
      }),
      { now: new Date('2026-08-03T00:00:00Z') }
    );
    expect(result.blockers).toEqual([]);
    expect(result.allowed).toHaveLength(2);
  });

  it('does not extend the exception to another package or past its review date', () => {
    const wrongPackage = evaluateProductionAudit(
      report({ other: { severity: 'high', via: [routerAdvisory] } }),
      { now: new Date('2026-08-03T00:00:00Z') }
    );
    const expired = evaluateProductionAudit(
      report({ 'react-router': { severity: 'high', via: [routerAdvisory] } }),
      { now: new Date('2026-10-02T00:00:00Z') }
    );
    expect(wrongPackage.blockers).toHaveLength(1);
    expect(expired.blockers).toHaveLength(1);
  });

  it('does not block findings below the high threshold', () => {
    const result = evaluateProductionAudit(
      report({ moderate: { severity: 'moderate', via: [{ severity: 'moderate' }] } })
    );
    expect(result.blockers).toEqual([]);
  });
});
