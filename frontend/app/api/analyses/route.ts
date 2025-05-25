import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

/**
 * Analyses API route - proxies to Python backend
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
    
    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    
    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/analyses${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
    console.error('Analyses API error:', error);
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
