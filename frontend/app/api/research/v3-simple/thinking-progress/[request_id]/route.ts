import { NextRequest, NextResponse } from 'next/server';

/**
 * V3 Simple Thinking Progress API route - proxies to Python backend
 * Handles polling for progressive thinking process updates
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { request_id: string } }
) {
  try {
    const requestId = params.request_id;
    console.log('🔧 THINKING PROGRESS API: Polling for request ID:', requestId);

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/research/v3-simple/thinking-progress/${requestId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('🔧 THINKING PROGRESS API: Backend response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔧 THINKING PROGRESS API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('🔧 THINKING PROGRESS API: Backend response data:', {
      requestId: data.request_id,
      totalSteps: data.total_steps,
      completedSteps: data.completed_steps,
      isActive: data.is_active,
      thinkingStepsCount: data.thinking_steps?.length || 0
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('🔧 THINKING PROGRESS API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
