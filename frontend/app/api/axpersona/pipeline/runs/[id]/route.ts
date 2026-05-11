import { NextRequest, NextResponse } from 'next/server';

import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';
const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Get Pipeline Run Detail API route - proxies to Python backend
 * GET /api/axpersona/pipeline/runs/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;
    console.log('Proxying pipeline run detail request for job:', jobId);

    // OSS mode - always use development token
    let authToken_headers: Record<string, string> = {};
    try {
      authToken_headers = await resolveRouteAuthHeaders(request as any, { required: true, traceScope: 'api-patch' });
    } catch (e) { console.error('Auth resolve error:', e); }
    const authToken = authToken_headers.Authorization ? authToken_headers.Authorization.replace('Bearer ', '') : 'DEV_TOKEN_REDACTED';

    const url = `${API_BASE_URL}/api/axpersona/v1/pipeline/runs/${jobId}`;
    console.log('Fetching from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      cache: 'no-store', // Prevent Next.js from caching this response
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
    // Return with no-cache headers to prevent browser caching
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error proxying pipeline run detail request:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch pipeline run details' },
      { status: 500 }
    );
  }
}

