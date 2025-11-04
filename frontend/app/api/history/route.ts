import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * History API route - proxies to Python backend with proper authentication
 * - Development: Uses development token when Clerk validation is disabled
 * - Production: Requires Clerk authentication and forwards JWT token
 */
export async function GET(request: NextRequest) {
  try {
    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_AUTH === 'true';

    // OSS mode: always use development token
    const authToken: string = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    // Forward the request to the Python backend with appropriate token
    const response = await fetch(`${backendUrl}/api/analyses${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Only log non-connection errors (connection errors are expected when backend is down)
      if (response.status !== 0) {
        console.error('Backend error:', response.status, errorText);
      }
      // Graceful fallback when backend is unavailable
      return NextResponse.json([], {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    // Only log non-connection errors (ECONNREFUSED is expected when backend is down)
    const isConnectionError = error instanceof Error &&
      (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'));
    if (!isConnectionError) {
      console.error('History API error:', error);
    }
    // Graceful fallback when backend is down
    return NextResponse.json([], {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
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
