import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * PRECALL Intelligence Generation API route - proxies to Python backend
 * Generates call intelligence from prospect data using PydanticAI
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying PRECALL intelligence generation request to backend');

    // OSS mode - use development token
    const authToken: string =
      process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';
    console.log('PRECALL Generate API: Using development token (OSS mode)');
    console.log('PRECALL Generate API: API_BASE_URL =', API_BASE_URL);

    const response = await fetch(
      `${API_BASE_URL}/api/precall/v1/generate`,
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
      console.error('PRECALL intelligence generation error:', errorText);
      return NextResponse.json(
        { 
          success: false,
          intelligence: null,
          error: `Backend error: ${errorText}`,
          processing_time_ms: null,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log('PRECALL intelligence generated successfully');
    return NextResponse.json(data);

  } catch (error) {
    console.error('PRECALL Generate API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        success: false,
        intelligence: null,
        error: `Internal server error: ${errorMessage}`,
        processing_time_ms: null,
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

