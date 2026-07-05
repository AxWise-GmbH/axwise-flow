import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Upload API route - proxies to Python backend
 */
export async function POST(request: NextRequest) {
  try {
    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';

    const requireStrictAuth = isProduction || enableClerkValidation;

    let authHeaders: Record<string, string> = {};
    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'upload',
      });
    } catch (authError) {
      console.error('🔄 [UPLOAD] Failed to resolve auth headers', authError);
      return NextResponse.json(
        { error: 'Authentication token not available' },
        { status: 401 }
      );
    }

    if (!authHeaders.Authorization) {
      if (requireStrictAuth) {
        console.warn('No Authorization header resolved (strict mode)');
        return NextResponse.json({ error: 'Authentication token required' }, { status: 401 });
      }
      // OSS / dev mode: use a fallback dev token so the request can proceed
      console.log('No auth header available, using dev fallback token');
      authHeaders = { Authorization: 'Bearer DEV_TOKEN_OSS' };
    }

    const token = authHeaders.Authorization.replace(/^Bearer\s+/i, '');

    // Get the backend URL from environment
    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    console.log('🔄 [UPLOAD] Backend URL:', backendUrl);
    console.log('🔄 [UPLOAD] Token available:', token ? 'Yes' : 'No');
    console.log('🔄 [UPLOAD] Token preview:', token ? token.substring(0, 8) + '...<redacted>' : 'null');

    // Forward the request to the Python backend
    const formData = await request.formData();

    console.log('🔄 [UPLOAD] Calling:', `${backendUrl}/api/data`);

    const response = await fetch(`${backendUrl}/api/data`, {
      method: 'POST',
      headers: authHeaders,
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

export async function OPTIONS(_request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
