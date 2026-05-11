import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('Subscription Status API route called');

    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';
    const requireStrictAuth = isProduction || enableClerkValidation;

    if (requireStrictAuth) {
      const { userId } = await auth();
      if (!userId) {
        console.log('Subscription Status API: No authenticated user found');
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
    } else {
      console.log('Subscription Status API: Clerk validation disabled, permitting dev fallback');
    }

    let authHeaders: Record<string, string> = {};
    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'subscription-status',
      });
    } catch (authError) {
      console.error('Subscription Status API: Failed to resolve auth headers', authError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!authHeaders.Authorization) {
      const message = requireStrictAuth
        ? 'Authentication required'
        : 'Authentication token not available';
      console.warn('Subscription Status API: Authorization header missing', { requireStrictAuth });
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const token = authHeaders.Authorization.replace(/^Bearer\s+/i, '');

    // Get the backend URL from environment
    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    const isUsingDevToken = !requireStrictAuth && token.startsWith('dev_');
    console.log(`Subscription Status API: Using ${isUsingDevToken ? 'development' : 'Clerk JWT'} token`);
    console.log('Proxying to backend:', `${backendUrl}/api/subscription/status`);

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/subscription/status`, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Subscription Status API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Subscription Status API: Backend response successful');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Subscription Status API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
