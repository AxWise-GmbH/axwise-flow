import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({ trusted: true })) }));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import {
  buildSupabaseAdminClient,
  buildTrustedWorkerHeaders,
  WORKER_DEPLOYMENT_HEADER,
  WORKER_SCOPE_HEADER,
} from './supabase-server.js';

describe('trusted Supabase worker headers', () => {
  it('binds a Preview admin client to the immutable Vercel deployment id', () => {
    expect(
      buildTrustedWorkerHeaders({
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_exact',
        VERCEL_URL: 'fallback.vercel.app',
      })
    ).toEqual({
      [WORKER_SCOPE_HEADER]: 'preview',
      [WORKER_DEPLOYMENT_HEADER]: 'vercel-deployment:dpl_exact',
    });
  });

  it('uses only the exact generated deployment URL fallback', () => {
    expect(
      buildTrustedWorkerHeaders({
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'Orchestrator-AbC.vercel.app',
      })
    ).toEqual({
      [WORKER_SCOPE_HEADER]: 'preview',
      [WORKER_DEPLOYMENT_HEADER]: 'vercel-url:orchestrator-abc.vercel.app',
    });
  });

  it('omits the deployment header when Preview identity is unavailable so the DB fails closed', () => {
    expect(buildTrustedWorkerHeaders({ VERCEL: '1', VERCEL_ENV: 'preview' })).toEqual({
      [WORKER_SCOPE_HEADER]: 'preview',
    });
  });

  it('does not attach a Preview deployment identity to production or local workers', () => {
    expect(
      buildTrustedWorkerHeaders({
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_DEPLOYMENT_ID: 'dpl_prod',
      })
    ).toEqual({ [WORKER_SCOPE_HEADER]: 'production' });
    expect(buildTrustedWorkerHeaders({})).toEqual({ [WORKER_SCOPE_HEADER]: 'local' });
  });

  it('attaches only server-derived worker headers to the service-role client', () => {
    const previous = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
      VERCEL_URL: process.env.VERCEL_URL,
    };
    Object.assign(process.env, {
      SUPABASE_URL: 'https://db.example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_DEPLOYMENT_ID: 'dpl_server_runtime',
    });
    delete process.env.VERCEL_URL;
    mocks.createClient.mockClear();

    try {
      expect(buildSupabaseAdminClient()).toEqual({ trusted: true });
      expect(mocks.createClient).toHaveBeenCalledWith(
        'https://db.example.test',
        'service-role-test',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            headers: {
              [WORKER_SCOPE_HEADER]: 'preview',
              [WORKER_DEPLOYMENT_HEADER]: 'vercel-deployment:dpl_server_runtime',
            },
          },
        }
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
