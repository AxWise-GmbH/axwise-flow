import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying regional-map search request to backend');

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

    // Use AbortController to prevent undici HeadersTimeoutError
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000); // 4 minutes

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/regional-map/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'Backend search failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error proxying regional-map search:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
