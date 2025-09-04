import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Simplified Personas API route - proxies to Python backend with proper authentication
 * Returns design thinking optimized personas with only core fields
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('Simplified Personas API route called for ID:', params.id);

    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';

    let authToken: string;

    if (isProduction || enableClerkValidation) {
      // Production or explicit Clerk validation - require authentication
      const { userId, getToken } = await auth();

      if (!userId) {
        console.log('Simplified Personas API: No authenticated user found');
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      // Get the session token from Clerk
      try {
        const token = await getToken();

        if (!token) {
          console.log('Simplified Personas API: No session token found');
          return NextResponse.json(
            { error: 'Authentication token required' },
            { status: 401 }
          );
        }

        authToken = token;
        console.log('Simplified Personas API: Using Clerk JWT token');
      } catch (tokenError) {
        console.error('Simplified Personas API: Error getting Clerk token:', tokenError);
        return NextResponse.json(
          { error: 'Authentication error' },
          { status: 401 }
        );
      }
    } else {
      // Development mode - use development token
      authToken = 'test-token';
      console.log('Simplified Personas API: Using development token');
    }

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    console.log('Proxying to backend:', `${backendUrl}/api/results/${params.id}/personas/simplified`);

    // Forward the request to the Python backend with appropriate token
    const response = await fetch(`${backendUrl}/api/results/${params.id}/personas/simplified`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
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
    console.log('Simplified Personas API: Backend response successful for analysis ID:', params.id);

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('Simplified Personas API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
