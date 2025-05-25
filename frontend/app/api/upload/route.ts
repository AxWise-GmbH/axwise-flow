import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

/**
 * Upload API route - proxies to Python backend
 */
export async function POST(request: NextRequest) {
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

    if (!token) {
      console.error('🔄 [UPLOAD] No auth token available');
      return NextResponse.json(
        { error: 'Authentication token not available' },
        { status: 401 }
      );
    }

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    console.log('🔄 [UPLOAD] Backend URL:', backendUrl);
    console.log('🔄 [UPLOAD] Token available:', token ? 'Yes' : 'No');

    // Forward the request to the Python backend
    const formData = await request.formData();

    console.log('🔄 [UPLOAD] Calling:', `${backendUrl}/api/data`);

    const response = await fetch(`${backendUrl}/api/data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
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
    console.error('Upload API error:', error);
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
