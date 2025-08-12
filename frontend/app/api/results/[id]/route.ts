import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Individual Analysis Results API route - proxies to Python backend with proper authentication
 * - Development: Uses development token when Clerk validation is disabled
 * - Production: Requires Clerk authentication and forwards JWT token
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('Results API route called for ID:', params.id);

    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';

    let authToken: string;

    if (isProduction || enableClerkValidation) {
      // Production or Clerk validation enabled: require proper authentication
      const { userId, getToken } = await auth();

      if (!userId) {
        console.log('Results API: No authenticated user');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // Get the auth token from Clerk
      const token = await getToken();

      if (!token) {
        console.log('Results API: No auth token available');
        return NextResponse.json(
          { error: 'Authentication token not available' },
          { status: 401 }
        );
      }

      authToken = token;
      console.log('Results API: Using Clerk JWT token for authenticated user:', userId);
    } else {
      // Development mode: Use Clerk JWT token to match upload/analysis authentication
      const { userId, getToken } = await auth();

      if (userId && getToken) {
        // User is authenticated with Clerk, use their JWT token
        const token = await getToken();
        if (token) {
          authToken = token;
          console.log('Results API: Using Clerk JWT token in development for user:', userId);
        } else {
          // Fallback to development token if JWT not available
          authToken = 'DEV_TOKEN_REDACTED';
          console.log('Results API: Using fallback development token (no JWT available)');
        }
      } else {
        // No Clerk authentication, use user-specific development token
        authToken = 'dev_DEV_TOKEN_REDACTED';
        console.log('Results API: Using user-specific development token (no Clerk auth)');
      }
    }

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    console.log('Proxying to backend:', `${backendUrl}/api/results/${params.id}`);

    // Forward the request to the Python backend with appropriate token
    const response = await fetch(`${backendUrl}/api/results/${params.id}`, {
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
    console.log('Backend response successful for analysis ID:', params.id);

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('Results API error:', error);
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
