import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const simulationId = params.id;
    console.log('Proxying simulation progress request for ID:', simulationId);

    // Get authentication token
    let authToken: string;

    try {
      const { userId, getToken } = await auth();

      if (userId) {
        const token = await getToken();
        if (token) {
          authToken = token;
          console.log('Simulation Progress API: Using Clerk JWT token for authenticated user:', userId);
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
        console.log('Simulation Progress API: Using development token due to disabled Clerk validation');
      } else {
        return NextResponse.json(
          { error: 'Authentication required to access simulation progress' },
          { status: 401 }
        );
      }
    }

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/simulate/${simulationId}/progress`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);
      return NextResponse.json(
        { error: 'Failed to get simulation progress', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error proxying simulation progress request:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
