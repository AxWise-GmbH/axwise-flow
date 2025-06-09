import { NextRequest, NextResponse } from 'next/server';

/**
 * V3 Simple Research Chat API route - proxies to Python backend
 * Handles the enhanced research chat with thinking process tracking
 */
export async function POST(request: NextRequest) {
  try {
    console.log('V3 Simple Research Chat API route called');

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get the request body
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body, null, 2));

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/research/v3-simple/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('Backend response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Backend response data:', {
      hasContent: !!data.content,
      hasMetadata: !!data.metadata,
      requestId: data.metadata?.request_id,
      analysisStatus: data.metadata?.analysis_status
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('V3 Simple Research Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
