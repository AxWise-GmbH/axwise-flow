import type { NextRequest } from 'next/server';

import { buildServerAuthHeaders } from '@/lib/auth/server-auth';

type RequestLike = Pick<Request | NextRequest, 'headers'>;

export interface ResolveRouteAuthHeadersOptions {
  required?: boolean;
  traceScope?: string;
  overrideHeaders?: Record<string, string>;
}

function logRouteAuth(
  scope: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  console.log(`[auth-route:${scope}] ${message}`, extra ?? {});
}

export async function resolveRouteAuthHeaders(
  request: RequestLike | null,
  options: ResolveRouteAuthHeadersOptions = {},
): Promise<Record<string, string>> {
  const { required = false, traceScope = 'default', overrideHeaders } = options;

  if (overrideHeaders?.Authorization) {
    logRouteAuth(traceScope, 'Using provided override Authorization header');
    return overrideHeaders;
  }

  const incomingAuth = request
    ?.headers
    ?.get('authorization')
    ?.trim();

  if (incomingAuth?.toLowerCase().startsWith('bearer ')) {
    logRouteAuth(traceScope, 'Using bearer token from incoming request');
    return { Authorization: incomingAuth };
  }

  try {
    const headers = await buildServerAuthHeaders({ required });

    if (headers.Authorization) {
      logRouteAuth(traceScope, 'Generated Authorization header via Clerk helper', {
        devFallback: headers.Authorization.includes('dev_') || headers.Authorization.includes('test'),
      });
      return headers;
    }

    logRouteAuth(traceScope, 'No Authorization header generated from helper', {
      required,
    });
    return {};
  } catch (error) {
    logRouteAuth(traceScope, 'Failed to resolve Authorization header', { required, error });
    if (required) {
      throw error;
    }
    return {};
  }
}
