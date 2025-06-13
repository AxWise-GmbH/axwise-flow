/**
 * Thinking Progress API Route
 * Proxies thinking progress requests to the Python backend
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { request_id: string } }
) {
  try {
    console.log('Thinking Progress API route called for request ID:', params.request_id);

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    console.log('Proxying to backend:', `${backendUrl}/api/research/v3-simple/thinking-progress/${params.request_id}`);

    // Forward the request to the Python backend with cache-busting
    const response = await fetch(`${backendUrl}/api/research/v3-simple/thinking-progress/${params.request_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
      cache: 'no-store', // Disable Next.js fetch caching
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend thinking progress error:', response.status, errorText);
      return NextResponse.json(
        { 
          error: `Backend error: ${errorText}`,
          request_id: params.request_id,
          thinking_process: [],
          is_complete: false,
          total_steps: 0,
          completed_steps: 0
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Thinking progress response:', data);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('Thinking progress API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch thinking progress',
        request_id: params.request_id,
        thinking_process: [],
        is_complete: false,
        total_steps: 0,
        completed_steps: 0
      },
      { status: 500 }
    );
  }
}
