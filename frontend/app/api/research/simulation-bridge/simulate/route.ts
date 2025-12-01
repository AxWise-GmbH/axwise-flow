import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Configure route for longer execution time
export const maxDuration = 600; // 10 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying simulation request to backend');

    // OSS mode - always use development token
    const authToken: string = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
    console.log('Simulation API: Using development token (OSS mode)');

    // Create AbortController for timeout handling
    const controller = new AbortController();
    // Safety timeout; backend returns 202 immediately and UI polls progress
    const timeoutId = setTimeout(() => controller.abort(), 12 * 60 * 1000); // 12 minutes timeout

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/simulate-async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Disable default timeout behaviors
      keepalive: false,
    });

    clearTimeout(timeoutId);

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);
      return NextResponse.json(
        { error: 'Failed to create simulation', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error proxying simulation request:', error);

    // Handle timeout errors specifically
    // Normalize known Undici timeout errors for clearer UX
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code || (error as any)?.cause?.code || (error as any)?.name;

    if (error instanceof Error && (error.name === 'AbortError' || code === 'UND_ERR_HEADERS_TIMEOUT')) {
      return NextResponse.json(
        {
          error: 'Simulation timeout',
          details: 'The simulation is taking longer than expected. It may still be processing on the server.',
          suggestion: 'Reduce the number of stakeholders or depth, or try again later. We recommend using the progress endpoints to poll status.',
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
