import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

/**
 * Protected API route - for testing authentication
 */
export async function GET(request: NextRequest) {
  try {
    // Get authentication from Clerk
    const { userId, getToken } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the auth token
    const token = await getToken();
    
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
