import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('Start Trial API route called');

    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';
    const requireStrictAuth = isProduction || enableClerkValidation;

    if (requireStrictAuth) {
      const { userId } = await auth();
      if (!userId) {
        console.log('Start Trial API: No authenticated user found');
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
    } else {
      console.log('Start Trial API: Clerk validation disabled, permitting dev fallback');
    }

    let authHeaders: Record<string, string> = {};
    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'subscription-start-trial',
      });
    } catch (authError) {
      console.error('Start Trial API: Failed to resolve auth headers', authError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!authHeaders.Authorization) {
      const message = requireStrictAuth
        ? 'Authentication required'
        : 'Authentication token not available';
      console.warn('Start Trial API: Authorization header missing', { requireStrictAuth });
      return NextResponse.json({ error: message }, { status: 401 });
    }

    // Get the backend URL from environment
    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get request body (may be empty for start-trial)
    const body = await request.json().catch(() => ({}));

    console.log('Proxying to backend:', `${backendUrl}/api/subscription/start-trial`);

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/subscription/start-trial`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Start Trial API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Start Trial API: Backend response successful');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Start Trial API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
