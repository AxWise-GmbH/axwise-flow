import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

async function getToken(): Promise<string> {
  return process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';
}

export async function POST(request: NextRequest) {
  try {
    console.log('Cancel Subscription API route called');

    // Get the auth token
    const token = await getToken();

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get request body
    const body = await request.json().catch(() => ({}));

    console.log('Cancel Subscription API: Using development token (development mode only)');
    console.log('Proxying to backend:', `${backendUrl}/api/subscription/cancel`);

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/subscription/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cancel Subscription API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Cancel Subscription API: Backend response successful');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Cancel Subscription API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
