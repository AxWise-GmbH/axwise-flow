import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    console.log('Proxying conversation routines chat request to backend');
    console.log('API_BASE_URL:', API_BASE_URL);

    let authHeaders: Record<string, string> = {};
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';
    const requireStrictAuth = isProduction || enableClerkValidation;

    if (requireStrictAuth) {
      const { userId } = await auth();
      if (!userId) {
        console.log('Conversation Routines API: No authenticated user');
        return NextResponse.json(
          { error: 'Authentication token required' },
          { status: 401 }
        );
      }
      console.log('Conversation Routines API: Authenticated Clerk user', { userId });
    } else {
      console.log('Conversation Routines API: Clerk validation disabled, allowing dev fallback');
    }

    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'research-chat',
      });
    } catch (authError) {
      console.error('Conversation Routines API: Failed to resolve auth headers', authError);
      return NextResponse.json(
        { error: 'Authentication token not available' },
        { status: 401 }
      );
    }

    if (!authHeaders.Authorization) {
      if (requireStrictAuth) {
        console.warn('Conversation Routines API: No Authorization header resolved (strict mode)');
        return NextResponse.json({ error: 'Authentication token required' }, { status: 401 });
      }
      // OSS / dev mode: use a fallback dev token so the request can proceed
      console.log('Conversation Routines API: No auth header, using dev fallback token');
      authHeaders = { Authorization: 'Bearer DEV_TOKEN_OSS' };
    }

    // Get the request body
    const body = await request.json();

    // Forward the request to the backend
    const response = await fetch(`${API_BASE_URL}/api/research/conversation-routines/chat`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);
      return NextResponse.json(
        { error: 'Backend request failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Backend response received successfully');

    return NextResponse.json(data);

  } catch (error) {
    console.error('Conversation Routines API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
