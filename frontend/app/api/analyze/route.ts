import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Analyze API route - proxies to Python backend
 */
export async function POST(request: NextRequest) {
  try {
    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';

    console.log('🔄 [ANALYZE] Environment check:', {
      isProduction,
      enableClerkValidation,
      envVar: process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION,
      nodeEnv: process.env.NODE_ENV
    });

    const requireStrictAuth = isProduction || enableClerkValidation;
    const devUserId = process.env.NEXT_PUBLIC_DEV_TEST_USER ?? 'testuser123';

    let userId: string | null = null;

    if (requireStrictAuth) {
      const clerkAuth = await auth();
      userId = clerkAuth.userId;

      if (!userId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else {
      userId = devUserId;
      console.log('🔄 [ANALYZE] Using development mode authentication', { userId });
    }

    let authHeaders: Record<string, string> = {};
    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'analyze',
      });
    } catch (authError) {
      console.error('🔄 [ANALYZE] Failed to resolve auth headers', authError);
      return NextResponse.json(
        { error: 'Authentication token not available' },
        { status: 401 }
      );
    }

    if (!authHeaders.Authorization) {
      if (requireStrictAuth) {
        console.warn('No Authorization header resolved (strict mode)');
        return NextResponse.json({ error: 'Authentication token required' }, { status: 401 });
      }
      // OSS / dev mode: use a fallback dev token so the request can proceed
      console.log('No auth header available, using dev fallback token');
      authHeaders = { Authorization: 'Bearer DEV_TOKEN_OSS' };
    }

    // Get the backend URL from environment
    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get the request body
    const body = await request.json();

    // Forward the request to the Python backend with retry logic for auth failures
    let response = await fetch(`${backendUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // If we get a 401, try to refresh the token and retry once
    if (response.status === 401 && requireStrictAuth) {
      console.warn('🔄 [ANALYZE] Got 401, attempting auth header refresh and retry...');

      try {
        const refreshedHeaders = await resolveRouteAuthHeaders(request, {
          required: true,
          traceScope: 'analyze-retry',
        });

        if (refreshedHeaders.Authorization) {
          console.log('🔄 [ANALYZE] Retrying with refreshed Authorization header');
          response = await fetch(`${backendUrl}/api/analyze`, {
            method: 'POST',
            headers: {
              ...refreshedHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
        }
      } catch (retryError) {
        console.error('🔄 [ANALYZE] Auth header refresh retry failed:', retryError);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Analyze API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(_request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
