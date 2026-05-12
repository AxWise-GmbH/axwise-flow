import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('Proxying completed simulations request to backend');
    console.log('API_BASE_URL:', API_BASE_URL);

    // Check environment
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';

    let userId: string | null = null;
    let token: string | null = null;

    if (isProduction || enableClerkValidation) {
      // Get authentication from Clerk
      const authResult = await auth();
      userId = authResult.userId;
      token = await authResult.getToken();

      if (!userId) {
        console.error('Authentication failed: No user ID');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
      console.log('✅ [SIMULATIONS] Authenticated user:', userId);
    } else {
      // Development mode: use development user
      userId = 'vitalijs_axwise_de';
      token = 'dev_test_token_vitalijs_axwise_de';
      console.log('🔄 [SIMULATIONS] Using development mode authentication');
    }

    const response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/completed`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Disable caching
    });

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch completed simulations', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Successfully fetched completed simulations:', Object.keys(data.simulations || {}).length);

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error fetching completed simulations:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
