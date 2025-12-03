import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Protected API route - for testing authentication
 */
export async function GET(request: NextRequest) {
  try {
    // OSS mode: no Clerk, return mock user and token status
    const userId = 'testuser123';
    const token = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';

    return NextResponse.json({
      status: 'success',
      message: 'Protected route accessed successfully',
      userId,
      hasToken: !!token,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Protected API error:', error);
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
