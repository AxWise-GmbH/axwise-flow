import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const simulationId = params.id;
    console.log('Proxying simulation progress request for ID:', simulationId);

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/simulate/${simulationId}/progress`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);
      return NextResponse.json(
        { error: 'Failed to get simulation progress', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error proxying simulation progress request:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
