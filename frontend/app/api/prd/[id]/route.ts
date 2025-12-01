import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

async function getToken(): Promise<string> {
  // OSS mode: return development token
  return process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('PRD API route called for ID:', params.id);

    // Get the auth token
    const token = await getToken();

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Get and normalize query parameters; treat timestamp/regeneratePRD as force_regenerate
    const { searchParams } = new URL(request.url);
    const forwardedParams = new URLSearchParams(searchParams);

    const hasExplicitForce = forwardedParams.get('force_regenerate') === 'true';
    const hasTimestamp = forwardedParams.has('timestamp');
    const hasRegenFlag = forwardedParams.get('regeneratePRD') === 'true';
    if (!hasExplicitForce && (hasTimestamp || hasRegenFlag)) {
      forwardedParams.set('force_regenerate', 'true');
    }
    // Do not forward UI-only flags to backend
    forwardedParams.delete('timestamp');
    forwardedParams.delete('regeneratePRD');

    const queryString = forwardedParams.toString();

    console.log('PRD API: Using development token (development mode only)');
    console.log('Proxying to backend:', `${backendUrl}/api/prd/${params.id}${queryString ? `?${queryString}` : ''}`);

    // Forward the request to the Python backend
    const response = await fetch(`${backendUrl}/api/prd/${params.id}${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PRD API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('PRD API: Backend response successful');

    return NextResponse.json(data);
  } catch (error) {
    console.error('PRD API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
