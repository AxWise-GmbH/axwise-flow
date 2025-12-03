import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

async function getToken(): Promise<string> {
  return process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
}

export async function GET(request: NextRequest) {
  try {
    console.log('Priority Insights API route called');

    // Get the auth token
    const token = await getToken();

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get query parameters from NextRequest
    const { searchParams } = new URL(request.nextUrl);
    const queryString = searchParams.toString();

    console.log('Priority Insights API: Using development token (development mode only)');
    console.log('Proxying to backend:', `${backendUrl}/api/analysis/priority${queryString ? `?${queryString}` : ''}`);

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/analysis/priority${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Priority Insights API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Priority Insights API: Backend response successful');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Priority Insights API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
