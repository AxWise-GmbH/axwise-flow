import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken } from '@/lib/api/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    // Get auth token
    const authToken = await getAuthToken();

    if (!authToken) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get request body
    const body = await request.json();
    console.log('📤 Received from frontend:', JSON.stringify(body, null, 2));

    // Extract credentials from the request body
    const credentials = body.credentials;
    console.log('📤 Sending to backend:', JSON.stringify(credentials, null, 2));

    // Forward to backend (send credentials directly, not wrapped)
    const response = await fetch(`${BACKEND_URL}/api/export/jira/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();
    console.log('📥 Backend response:', response.status, JSON.stringify(data, null, 2));

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in Jira test connection API route:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 }
    );
  }
}

