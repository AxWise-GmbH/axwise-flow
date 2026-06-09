import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Agent } from 'undici';

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutes (aligns with simulate endpoint)

// Raise undici's headersTimeout (default 300s) so the proxy doesn't die
// while the backend is still processing avatar generation + interviews.
const fetchAgent = new Agent({
  headersTimeout: 660_000, // 11 minutes
  bodyTimeout: 660_000,
  connectTimeout: 10_000,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying regional-map run-workflow request to backend');

    // Get authentication token
    let authToken: string;

    try {
      const { userId, getToken } = await auth();

      if (userId) {
        const token = await getToken();
        if (token) {
          authToken = token;
        } else {
          throw new Error('No token available');
        }
      } else {
        throw new Error('No user ID available');
      }
    } catch (authError) {
      const isProduction = process.env.NODE_ENV === 'production';
      const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';

      if (!isProduction && !enableClerkValidation) {
        authToken = 'dev_token_for_testing';
      } else {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
    }

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/regional-map/run-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
      // @ts-ignore — Node.js undici dispatcher option (not in fetch typings)
      dispatcher: fetchAgent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'Backend run-workflow failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error proxying regional-map run-workflow:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

