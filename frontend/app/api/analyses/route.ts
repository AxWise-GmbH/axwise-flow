import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Analyses API route - proxies to Python backend
 */
export async function GET(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';
    const requireStrictAuth = isProduction || enableClerkValidation;
    const devUserId = process.env.NEXT_PUBLIC_DEV_TEST_USER ?? 'vitalijs_axwise_de';

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
      console.log('🔄 [ANALYSES] Using development mode authentication', { userId });
    }

    let authHeaders: Record<string, string> = {};
    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'analyses',
      });
    } catch (authError) {
      console.error('🔄 [ANALYSES] Failed to resolve auth headers', authError);
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/analyses${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
    });

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
    console.error('Analyses API error:', error);
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
