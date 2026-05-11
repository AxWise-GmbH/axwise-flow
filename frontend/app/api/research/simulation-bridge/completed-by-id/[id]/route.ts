import { NextRequest, NextResponse } from 'next/server';

import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';
const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const simulationId = params.id;
    console.log('Proxying completed-by-id request for ID:', simulationId);

    // OSS mode - always use development token
    let authToken_headers: Record<string, string> = {};
    try {
      authToken_headers = await resolveRouteAuthHeaders(request as any, { required: true, traceScope: 'api-patch' });
    } catch (e) { console.error('Auth resolve error:', e); }
    const authToken = authToken_headers.Authorization ? authToken_headers.Authorization.replace('Bearer ', '') : 'DEV_TOKEN_REDACTED';
    console.log('Completed-by-id API: Using development token (OSS mode)');

    const url = `${API_BASE_URL}/api/research/simulation-bridge/completed-item?simulation_id=${encodeURIComponent(simulationId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, text);
      return NextResponse.json(
        { error: 'Failed to fetch simulation data', details: text },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Successfully fetched completed-by-id data for:', simulationId);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in completed-by-id proxy:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

