import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * List Pipeline Runs API route - proxies to Python backend
 * GET /api/axpersona/pipeline/runs
 */
export async function GET(request: NextRequest) {
  try {
    console.log('Proxying pipeline runs list request to backend');

    // OSS mode - always use development token
    const authToken: string =
      process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';

    // Forward query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = queryString
      ? `${API_BASE_URL}/api/axpersona/v1/pipeline/runs?${queryString}`
      : `${API_BASE_URL}/api/axpersona/v1/pipeline/runs`;

    console.log('Fetching from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error:', response.status, errorText);
      return NextResponse.json(
        { detail: `Backend error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying pipeline runs list request:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch pipeline runs' },
      { status: 500 }
    );
  }
}

