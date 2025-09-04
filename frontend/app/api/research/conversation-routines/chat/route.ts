import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    console.log('Proxying conversation routines chat request to backend');
    console.log('API_BASE_URL:', API_BASE_URL);

    // Get authentication token
    let authToken = '';
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';

    if (isProduction || enableClerkValidation) {
      // Get the session token from Clerk
      try {
        const authResult = await auth();
        const token = await authResult.getToken();

        if (!token) {
          console.log('Conversation Routines API: No session token found');
          return NextResponse.json(
            { error: 'Authentication token required' },
            { status: 401 }
          );
        }

        authToken = token;
        console.log('Conversation Routines API: Using Clerk JWT token');
      } catch (tokenError) {
        console.error('Conversation Routines API: Error getting Clerk token:', tokenError);
        return NextResponse.json(
          { error: 'Authentication error' },
          { status: 401 }
        );
      }
    } else {
      // Development mode - use development token
      authToken = 'DEV_TOKEN_REDACTED';
      console.log('Conversation Routines API: Using development token');
    }

    // Get the request body
    const body = await request.json();

    // Forward the request to the backend
    const response = await fetch(`${API_BASE_URL}/api/research/conversation-routines/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
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
