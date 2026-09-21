import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('workflow v2 web security boundary', () => {
  it('ships the immutable web image with CSP and browser hardening headers', () => {
    const dockerfile = readFileSync('deploy/workflow-v2/Dockerfile.web', 'utf8');
    const nginx = readFileSync('deploy/workflow-v2/nginx.conf', 'utf8');
    const headers = readFileSync('deploy/workflow-v2/security-headers.conf', 'utf8');

    expect(dockerfile).toContain('security-headers.conf /etc/nginx/security-headers.conf');
    const locationCount = nginx.match(/^\s*location\b/gm)?.length || 0;
    const hardenedLocationCount =
      nginx.match(/include \/etc\/nginx\/security-headers\.conf;/g)?.length || 0;
    expect(hardenedLocationCount).toBe(locationCount);
    expect(headers).toContain("default-src 'self'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('https://*.run.app');
    expect(headers).toContain('Strict-Transport-Security');
    expect(headers).toContain('Permissions-Policy');
    expect(headers).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('keeps HTML uncached while fingerprinted assets are immutable', () => {
    const nginx = readFileSync('deploy/workflow-v2/nginx.conf', 'utf8');
    expect(nginx).toContain('Cache-Control "no-store"');
    expect(nginx).toContain('Cache-Control "public, max-age=31536000, immutable"');
  });

  it('allows native editor frames and launch forms only at the exact preview API origin', () => {
    const headers = readFileSync('deploy/workflow-v2/security-headers.conf', 'utf8');
    const csp = headers.match(/Content-Security-Policy "([^"]+)"/)?.[1];
    expect(csp).toBeTruthy();
    const directives = Object.fromEntries(
      csp
        .split(';')
        .filter((value) => value.trim())
        .map((value) => {
          const [name, ...sources] = value.trim().split(/\s+/);
          return [name, sources];
        })
    );
    const editorOrigin = 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app';
    for (const directive of ['frame-src', 'form-action']) {
      expect(directives[directive]).toContain(editorOrigin);
      expect(directives[directive].filter((source) => source.includes('run.app'))).toEqual([
        editorOrigin,
      ]);
      expect(directives[directive]).not.toContain('*');
    }
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
    expect(headers).toContain('X-Frame-Options "DENY"');
  });

  it('serves the lean GCP SPA without a legacy same-origin API bridge', () => {
    const dockerfile = readFileSync('deploy/workflow-v2/Dockerfile.web', 'utf8');
    const cloudBuild = readFileSync('deploy/workflow-v2/cloudbuild.web.yaml', 'utf8');
    const githubWorkflow = readFileSync('../../.github/workflows/workflow-v2-preview-gates.yml', 'utf8');
    const nginx = readFileSync('deploy/workflow-v2/nginx.conf', 'utf8');

    expect(dockerfile).toContain('COPY package.json package-lock.json');
    expect(dockerfile).toContain('COPY src ./src');
    expect(dockerfile).toContain('COPY public-gcp ./public-gcp');
    expect(dockerfile).toContain(
      'COPY shared/workflow-v2/assistant-events.js shared/workflow-v2/assistant-primitives.js shared/workflow-v2/executable-actions.js shared/workflow-v2/public-https-url.js shared/workflow-v2/solution-build-secrets.js shared/workflow-v2/goal-workflow-view-contract.js shared/workflow-v2/capability-work-primitives.js ./shared/workflow-v2/'
    );
    expect(dockerfile).not.toContain('COPY public ./public');
    expect(dockerfile).not.toContain('COPY lib ./lib');
    expect(dockerfile).not.toContain('COPY shared ./shared');
    expect(dockerfile).toContain('ARG VITE_CLERK_PUBLISHABLE_KEY');
    expect(dockerfile).toContain('ARG VITE_ORQALY_API_URL');
    expect(dockerfile).toContain('npm run build:gcp');
    expect(dockerfile).toContain('verify-gcp-web-build.mjs dist');
    expect(dockerfile).not.toContain('verify-full-web-build.mjs');
    expect(dockerfile).toContain('nginx.conf /etc/nginx/conf.d/default.conf');
    expect(dockerfile).not.toContain('/etc/nginx/templates');
    expect(cloudBuild).toContain('VITE_CLERK_PUBLISHABLE_KEY=$$CLERK_PUBLISHABLE_KEY');
    expect(cloudBuild).not.toMatch(/VITE_CLERK_PUBLISHABLE_KEY=\$CLERK_PUBLISHABLE_KEY(?!\$)/);
    expect(githubWorkflow).toContain(
      '--build-arg VITE_CLERK_PUBLISHABLE_KEY="$VITE_CLERK_PUBLISHABLE_KEY"'
    );
    expect(githubWorkflow).toContain('--build-arg VITE_ORQALY_API_URL="$VITE_ORQALY_API_URL"');
    expect(githubWorkflow).not.toContain('--secret id=clerk_publishable_key');
    expect(githubWorkflow).not.toContain('--build-arg ORQALY_API_ORIGIN=');
    expect(nginx).toContain('absolute_redirect off;');
    expect(nginx).toMatch(/location = \/api \{[\s\S]*?return 404 'not found';[\s\S]*?\}/);
    expect(nginx).toMatch(/location \^~ \/api\/ \{[\s\S]*?return 404 'not found';[\s\S]*?\}/);
    expect(nginx).not.toContain('proxy_pass');
    expect(nginx).not.toContain('ORQALY_API_ORIGIN');
    expect(dockerfile).not.toContain('ORQALY_API_ORIGIN');
    expect(nginx).toMatch(/location = \/sw\.js \{[\s\S]*?return 410;[\s\S]*?\}/);
    expect(nginx).not.toContain('Service-Worker-Allowed');
    expect(nginx).toContain('try_files $uri $uri/ /index.html;');
    expect(nginx).not.toContain('return 308 /workflows-v2');
    expect(nginx.match(/default_type text\/plain;/g)).toHaveLength(4);
  });

  it('serves only the fixed heartbeat snapshot from the private read-only mount', () => {
    const dockerfile = readFileSync('deploy/workflow-v2/Dockerfile.web', 'utf8');
    const nginx = readFileSync('deploy/workflow-v2/nginx.conf', 'utf8');
    const heartbeatLocation = nginx.match(
      /location = \/heartbeat\.json \{([\s\S]*?)\n  \}/
    )?.[1];

    expect(heartbeatLocation).toBeTruthy();
    expect(heartbeatLocation).toContain('limit_except GET HEAD');
    expect(heartbeatLocation).toContain(
      'alias /var/run/orqanix-heartbeat/latest.json;'
    );
    expect(heartbeatLocation).toContain('etag off;');
    expect(heartbeatLocation).toContain('if_modified_since off;');
    expect(heartbeatLocation).toContain('open_file_cache off;');
    expect(heartbeatLocation).toContain(
      'add_header Cache-Control "no-cache, no-store, must-revalidate" always;'
    );
    expect(heartbeatLocation).not.toContain('try_files');
    expect(nginx).not.toContain('proxy_pass');
    expect(dockerfile).toContain('/var/run/orqanix-heartbeat');
    expect(dockerfile).not.toContain('latest.json /usr/share/nginx/html');
  });

  it('describes the server-published heartbeat consistently in both web builds', () => {
    const publicationCopy =
      'Cloud Scheduler starts the Cloud Run collector every 15 minutes and publishes this dated snapshot. Observations older than 30 minutes are marked stale.';
    const pagePairs = [
      ['public/heartbeat.html', 'public-gcp/heartbeat.html'],
      ['public/heartbeat/index.html', 'public-gcp/heartbeat/index.html'],
      ['public/benchmark.html', 'public-gcp/benchmark.html'],
      ['public/benchmark/index.html', 'public-gcp/benchmark/index.html'],
    ];

    for (const [fullPagePath, gcpPagePath] of pagePairs) {
      const fullPage = readFileSync(fullPagePath, 'utf8');
      const gcpPage = readFileSync(gcpPagePath, 'utf8');
      expect(fullPage).toBe(gcpPage);
      expect(gcpPage).toContain(publicationCopy);
      expect(gcpPage).not.toContain('scheduled checks do not automatically publish here');
    }
  });
});
