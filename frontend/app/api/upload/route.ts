import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Upload API route - proxies to Python backend
 */
export async function POST(request: NextRequest) {
  try {
    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_AUTH === 'true';

    // First, try to get the Authorization header from the incoming request
    const authHeader = request.headers.get('Authorization');
    let token: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Extract token from Authorization header
      token = authHeader.substring(7);
      console.log('🔄 [UPLOAD] Using token from Authorization header');
    } else {
      // OSS mode: use development token
      token = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
      console.log('🔄 [UPLOAD] Using development token (OSS mode)');
    }

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    console.log('🔄 [UPLOAD] Backend URL:', backendUrl);
    console.log('🔄 [UPLOAD] Token available:', token ? 'Yes' : 'No');
    console.log('🔄 [UPLOAD] Token preview:', token ? token.substring(0, 20) + '...' : 'null');

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
