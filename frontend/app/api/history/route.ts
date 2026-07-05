import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * History API route - proxies to Python backend with proper authentication
 * - Development: Uses development token when Clerk validation is disabled
 * - Production: Requires Clerk authentication and forwards JWT token
 */
export async function GET(request: NextRequest) {
  try {
    console.log('History API route called');

    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';

    console.log('History API: Environment check:', {
      isProduction,
      enableClerkValidation,
      envVar: process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION,
      nodeEnv: process.env.NODE_ENV
    });

    const requireStrictAuth = isProduction || enableClerkValidation;
    const devUserId = process.env.NEXT_PUBLIC_DEV_TEST_USER ?? 'vitalijs_axwise_de';

    if (requireStrictAuth) {
      const { userId } = await auth();

      if (!userId) {
        console.log('History API: No authenticated user');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      console.log('History API: Authenticated Clerk user', { userId });
    } else {
      console.log('History API: Using development token for dev user', { userId: devUserId });
    }

    let authHeaders: Record<string, string> = {};
    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'history',
      });
    } catch (authError) {
      console.error('History API: Failed to resolve auth headers', authError);
      return NextResponse.json(
        { error: 'Authentication token not available' },
        { status: 401 }
      );
    }

    if (!authHeaders.Authorization) {
      if (requireStrictAuth) {
        console.warn('History API: No Authorization header resolved (strict mode)');
        return NextResponse.json({ error: 'Authentication token required' }, { status: 401 });
      }
      // OSS / dev mode: use a fallback dev token so the request can proceed
      console.log('History API: No auth header, using dev fallback token');
      authHeaders = { Authorization: 'Bearer DEV_TOKEN_OSS' };
    }

    // Get the backend URL from environment
    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    console.log('Proxying to backend:', `${backendUrl}/api/analyses${queryString ? `?${queryString}` : ''}`);

    // Forward the request to the Python backend with appropriate token
    const response = await fetch(`${backendUrl}/api/analyses${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Backend response successful, returning', data.length, 'analyses');

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('History API error:', error);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
