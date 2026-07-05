import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

async function getToken(): Promise<string> {
  // Import auth from Clerk
  const { auth } = await import('@clerk/nextjs/server');

  try {
    // Get the authentication context
    const { userId, getToken } = await auth();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Get the JWT token from Clerk
    const token = await getToken();

    if (!token) {
      throw new Error('Failed to get authentication token');
    }

    return token;
  } catch (error) {
    console.error('Authentication error:', error);

    // In development mode, fall back to development token
    if (process.env.NODE_ENV === 'development') {
      console.log('Falling back to development token');
      return 'vitalijs_axwise_de';
    }

    // In production, throw the error
    throw new Error('Authentication required');
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('Create Checkout Session API route called');

    // Get the auth token
    const token = await getToken();

    // Get the backend URL from environment
    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get request body
    const body = await request.json();

    console.log('Create Checkout Session API: Using authentication token');
    console.log('Proxying to backend:', `${backendUrl}/api/subscription/create-checkout-session`);

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/subscription/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Create Checkout Session API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Create Checkout Session API: Backend response successful');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Create Checkout Session API: Error:', error);

    // Handle authentication errors specifically
    if (error instanceof Error && error.message.includes('Authentication')) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in and try again.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
