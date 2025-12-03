import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Analyze API route - proxies to Python backend
 */
export async function POST(request: NextRequest) {
  try {
    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_AUTH === 'true';

    console.log('🔄 [ANALYZE] Environment check:', {
      isProduction,
      enableClerkValidation,
      envVar: process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION,
      nodeEnv: process.env.NODE_ENV
    });

    // OSS mode: always use development token
    const token: string = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get the request body
    const body = await request.json();

    // Forward the request to the Python backend with retry logic for auth failures
    let response = await fetch(`${backendUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
    console.error('Analyze API error:', error);
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
