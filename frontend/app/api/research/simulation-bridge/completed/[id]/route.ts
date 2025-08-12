import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const simulationId = params.id;
    console.log('Proxying simulation download request for ID:', simulationId);

    // Get authentication token
    let authToken: string;

    try {
      const { userId, getToken } = await auth();

      if (userId) {
        const token = await getToken();
        if (token) {
          authToken = token;
          console.log('Simulation Download API: Using Clerk JWT token for authenticated user:', userId);
        } else {
          throw new Error('No token available');
        }
      } else {
        throw new Error('No user ID available');
      }
    } catch (authError) {
      console.error('Authentication failed:', authError);
      return NextResponse.json(
        { error: 'Authentication required to access simulation data' },
        { status: 401 }
      );
    }

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/completed/${simulationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

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
