import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

      // In development, use a development token when Clerk auth fails
      // OSS / dev mode: fall back to dev token when Clerk is not configured
      const isProduction = process.env.NODE_ENV === 'production';
      const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';

      if (!isProduction && !enableClerkValidation) {
        authToken = 'dev_token_for_testing';
        console.log('Simulation Download API: Using development token due to disabled Clerk validation');
      } else {
        return NextResponse.json(
          { error: 'Authentication required to access simulation data' },
          { status: 401 }
        );
      }
    }

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
