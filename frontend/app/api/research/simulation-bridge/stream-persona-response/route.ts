import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying stream persona response request to backend');

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/stream-persona-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);
      return NextResponse.json(
        { error: 'Failed to stream persona response', details: errorText },
        { status: response.status }
      );
    }

    // For streaming responses, we need to handle them differently
    if (response.headers.get('content-type')?.includes('text/plain')) {
      // This is a streaming response, pass it through
      return new NextResponse(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Regular JSON response
      const data = await response.json();
      return NextResponse.json(data);
    }

  } catch (error) {
    console.error('Error proxying stream persona response request:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
