#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SEVERITY = Object.freeze({ info: 0, low: 1, moderate: 2, high: 3, critical: 4 });

// GHSA-qwww-vcr4-c8h2 affects React Router's React Server Components action
// handling. Orchestratori is a Vite BrowserRouter SPA and does not enable RSC
// or framework-mode server actions. npm currently suggests downgrading from
// 7.18.2 to 7.11.0, which would reintroduce previously fixed advisories.
// Review/remove this exception by the date below or immediately if RSC is added.
export const AUDIT_EXCEPTIONS = Object.freeze([
  {
    advisory: 'GHSA-qwww-vcr4-c8h2',
    packages: Object.freeze(['react-router', 'react-router-dom']),
    reviewBy: '2026-10-01',
  },
]);

function advisoryId(via) {
  if (!via || typeof via !== 'object') return null;
  return String(via.url || '').match(/GHSA-[a-z0-9-]+/i)?.[0] || String(via.source || '');
}

function directAdvisories(report, packageName, visited = new Set()) {
  if (visited.has(packageName)) return [];
  visited.add(packageName);
  const vulnerability = report.vulnerabilities?.[packageName];
  if (!vulnerability) return [];

  return (vulnerability.via || []).flatMap((via) =>
    typeof via === 'string'
      ? directAdvisories(report, via, visited)
      : [{ ...via, advisory: advisoryId(via) }]
  );
}

function activeException(packageName, advisory, now) {
  return AUDIT_EXCEPTIONS.find(
    (entry) =>
      entry.advisory === advisory.advisory &&
      entry.packages.includes(packageName) &&
      now <= new Date(`${entry.reviewBy}T23:59:59.999Z`)
  );
}

export function evaluateProductionAudit(report, { threshold = 'high', now = new Date() } = {}) {
  if (!report?.vulnerabilities || !report?.metadata?.vulnerabilities) {
    return {
      blockers: [{ package: 'npm-audit', reason: 'Invalid or unavailable audit report' }],
      allowed: [],
    };
  }

  const minimum = SEVERITY[threshold];
  if (minimum === undefined) throw new Error(`Unsupported audit threshold: ${threshold}`);

  const blockers = [];
  const allowed = [];
  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
    if ((SEVERITY[vulnerability.severity] ?? -1) < minimum) continue;
    const advisories = directAdvisories(report, packageName);
    if (advisories.length === 0) {
      blockers.push({
        package: packageName,
        severity: vulnerability.severity,
        reason: 'No advisory metadata',
      });
      continue;
    }

    for (const advisory of advisories) {
      const exception = activeException(packageName, advisory, now);
      if (exception) {
        allowed.push({
          package: packageName,
          severity: vulnerability.severity,
          advisory: advisory.advisory,
          reviewBy: exception.reviewBy,
        });
      } else {
        blockers.push({
          package: packageName,
          severity: vulnerability.severity,
          advisory: advisory.advisory,
          title: advisory.title,
        });
      }
    }
  }

  return { blockers, allowed };
}

export function runProductionAudit() {
  const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    console.error(audit.stderr || audit.stdout || 'npm audit returned no JSON');
    return 1;
  }

  const result = evaluateProductionAudit(report);
  for (const finding of result.allowed) {
    console.warn(
      `Allowed temporary exception: ${finding.package} ${finding.advisory} (review by ${finding.reviewBy})`
    );
  }
  if (result.blockers.length > 0) {
    console.error('High/critical production dependency findings block release:');
    for (const finding of result.blockers) {
      console.error(`- ${finding.package}: ${finding.advisory || finding.reason}`);
    }
    return 1;
  }

  console.log('Production dependency audit passed (high/critical threshold).');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runProductionAudit());
}
