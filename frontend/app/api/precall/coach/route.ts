import { NextRequest, NextResponse } from 'next/server';

import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';
const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * PRECALL Coaching Chat API route - proxies to Python backend
 * Provides real-time coaching responses for pre-call preparation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying PRECALL coaching request to backend');

    // OSS mode - use development token
    let authToken_headers: Record<string, string> = {};
    try {
      authToken_headers = await resolveRouteAuthHeaders(request as any, { required: true, traceScope: 'api-patch' });
    } catch (e) { console.error('Auth resolve error:', e); }
    const authToken = authToken_headers.Authorization ? authToken_headers.Authorization.replace('Bearer ', '') : 'DEV_TOKEN_REDACTED';
    console.log('PRECALL Coach API: Using development token (OSS mode)');

    const response = await fetch(
      `${API_BASE_URL}/api/precall/v1/coach`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PRECALL coaching error:', errorText);
      return NextResponse.json(
        { 
          success: false,
          response: '',
          suggestions: [],
          error: `Backend error: ${errorText}`,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log('PRECALL coaching response generated');
    return NextResponse.json(data);

  } catch (error) {
    console.error('PRECALL Coach API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        success: false,
        response: '',
        suggestions: [],
        error: `Internal server error: ${errorMessage}`,
      },
      { status: 500 },
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

