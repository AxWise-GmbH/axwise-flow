import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const simulationId = params.id;
    console.log('Proxying simulation download request for ID:', simulationId);

    // OSS mode - always use development token
    const authToken: string = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';
    console.log('Simulation Download API: Using development token (OSS mode)');

    // Prefer query-param endpoint to avoid any path-based redirect quirks
    let response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/completed-item?simulation_id=${encodeURIComponent(simulationId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    // Fallback to path-param endpoint if needed
    if (!response.ok) {
      response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/completed/${simulationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });
    }

    if (!response.ok) {
      console.error(`Backend responded with ${response.status}: ${response.statusText}`);
      return NextResponse.json(
        { error: 'Failed to fetch simulation data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Successfully fetched simulation data for:', simulationId);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching simulation data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
