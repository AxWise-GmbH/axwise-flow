import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

async function getToken(): Promise<string> {
  try {
    // Get the current user's auth token from Clerk
    const authResult = await auth();
    const token = await authResult.getToken();

    if (!token) {
      throw new Error('No authentication token available');
    }

    return token;
  } catch (error) {
    console.error('Error getting Clerk token:', error);
    throw new Error('Authentication failed');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('PRD API route called for ID:', params.id);

    // Get the auth token
    const token = await getToken();

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    console.log('PRD API: Using development token (development mode only)');
    console.log('Proxying to backend:', `${backendUrl}/api/prd/${params.id}${queryString ? `?${queryString}` : ''}`);

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/prd/${params.id}${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PRD API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('PRD API: Backend response successful');

    return NextResponse.json(data);
  } catch (error) {
    console.error('PRD API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
