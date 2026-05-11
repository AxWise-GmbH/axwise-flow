import { NextRequest, NextResponse } from 'next/server';

import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';
const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * PRECALL Persona Image Generation API route - proxies to Python backend
 * Generates professional avatar images for stakeholder personas using Gemini
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying PRECALL persona image generation request to backend');

    // OSS mode - use development token
    let authToken_headers: Record<string, string> = {};
    try {
      authToken_headers = await resolveRouteAuthHeaders(request as any, { required: true, traceScope: 'api-patch' });
    } catch (e) { console.error('Auth resolve error:', e); }
    const authToken = authToken_headers.Authorization ? authToken_headers.Authorization.replace('Bearer ', '') : 'DEV_TOKEN_REDACTED';

    const response = await fetch(
      `${API_BASE_URL}/api/precall/v1/generate-persona-image`,
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
      console.error('PRECALL persona image generation error:', errorText);
      return NextResponse.json(
        { 
          success: false,
          image_data_uri: null,
          error: `Backend error: ${errorText}`,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log('PRECALL persona image generated successfully');
    return NextResponse.json(data);

  } catch (error) {
    console.error('PRECALL Generate Persona Image API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        success: false,
        image_data_uri: null,
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

