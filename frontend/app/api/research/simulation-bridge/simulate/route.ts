import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Configure route for longer execution time
export const maxDuration = 600; // 10 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying simulation request to backend');

    // Get authentication token
    let authToken: string;

    try {
      const { userId, getToken } = await auth();

      if (userId) {
        const token = await getToken();
        if (token) {
          authToken = token;
          console.log('Simulation API: Using Clerk JWT token for authenticated user:', userId);
        } else {
          throw new Error('No token available');
        }
      } else {
        throw new Error('No user ID available');
      }
    } catch (authError) {
      console.error('Authentication failed:', authError);

      // In development, use a development token when Clerk auth fails
      const isDevelopment = process.env.NODE_ENV === 'development';
      const clerkValidationDisabled = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'false';

      if (isDevelopment && clerkValidationDisabled) {
        authToken = 'DEV_TOKEN_REDACTED';
        console.log('Simulation API: Using development token due to disabled Clerk validation');
      } else {
        return NextResponse.json(
          { error: 'Authentication required for simulation' },
          { status: 401 }
        );
      }
    }

    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minutes timeout

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Disable default timeout behaviors
      keepalive: false,
    });

    clearTimeout(timeoutId);

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);
      return NextResponse.json(
        { error: 'Failed to create simulation', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error proxying simulation request:', error);

    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'Simulation timeout',
          details: 'The simulation took longer than expected. Please try again with fewer stakeholders or simpler configuration.'
        },
        { status: 408 } // Request Timeout
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
