import { NextRequest, NextResponse } from 'next/server';

/**
 * V3 Simple Health Check API route - proxies to Python backend
 */
export async function GET(request: NextRequest) {
  try {
    console.log('V3 Simple Health Check API route called');

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/research/v3-simple/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend health check error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('V3 Simple Health Check API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
