import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveRouteAuthHeaders } from '@/lib/auth/server-route';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Data API route - handles file uploads and data management
 * This proxies to the Python backend or handles requests directly
 */
export async function POST(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';
    const requireStrictAuth = isProduction || enableClerkValidation;
    const devUserId = process.env.NEXT_PUBLIC_DEV_TEST_USER ?? 'testuser123';

    let userId: string | null = null;

    if (requireStrictAuth) {
      const clerkAuth = await auth();
      userId = clerkAuth.userId;
      if (!userId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else {
      userId = devUserId;
      console.log('🔄 [DATA] Using development mode user', { userId });
    }

    let authHeaders: Record<string, string> = {};
    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'data-post',
      });
    } catch (authError) {
      console.error('🔄 [DATA] Failed to resolve auth headers', authError);
      return NextResponse.json(
        { error: 'Authentication token not available' },
        { status: 401 }
      );
    }

    if (!authHeaders.Authorization) {
      if (requireStrictAuth) {
        console.warn('No Authorization header resolved (strict mode)');
        return NextResponse.json({ error: 'Authentication token required' }, { status: 401 });
      }
      // OSS / dev mode: use a fallback dev token so the request can proceed
      console.log('No auth header available, using dev fallback token');
      authHeaders = { Authorization: 'Bearer DEV_TOKEN_OSS' };
    }

    console.log('🔄 [DATA] User authenticated:', userId);

    // For now, let's check if we have a local backend running
    // If not, we'll return a mock response for testing
    const localBackendUrl = 'http://localhost:8000';

    try {
      // Test if local backend is available
      const healthCheck = await fetch(`${localBackendUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000) // 2 second timeout
      });

      if (healthCheck.ok) {
        console.log('🔄 [DATA] Local backend available, proxying request');

        // Forward the request to the Python backend
        const formData = await request.formData();

        const response = await fetch(`${localBackendUrl}/api/data`, {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('🔄 [DATA] Backend error:', errorText);
          return NextResponse.json(
            { error: `Backend error: ${errorText}` },
            { status: response.status }
          );
        }

        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch (backendError) {
      console.log('🔄 [DATA] Local backend not available, using mock response');
    }

    // If backend is not available, return a mock response for testing
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Mock successful upload response
    const mockResponse = {
      id: Math.floor(Math.random() * 1000),
      filename: file.name,
      size: file.size,
      type: file.type,
      status: 'uploaded',
      message: 'File uploaded successfully (mock response - backend not available)',
      timestamp: new Date().toISOString(),
      userId: userId
    };

    console.log('🔄 [DATA] Returning mock response:', mockResponse);

    return NextResponse.json(mockResponse);

  } catch (error) {
    console.error('🔄 [DATA] API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION === 'true';
    const requireStrictAuth = isProduction || enableClerkValidation;
    const devUserId = process.env.NEXT_PUBLIC_DEV_TEST_USER ?? 'testuser123';

    let userId: string | null = null;

    if (requireStrictAuth) {
      const clerkAuth = await auth();
      userId = clerkAuth.userId;
      if (!userId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else {
      userId = devUserId;
      console.log('🔄 [DATA GET] Using development mode authentication', { userId });
    }

    let authHeaders: Record<string, string> = {};
    try {
      authHeaders = await resolveRouteAuthHeaders(request, {
        required: requireStrictAuth,
        traceScope: 'data-get',
      });
    } catch (authError) {
      console.error('🔄 [DATA GET] Failed to resolve auth headers', authError);
      return NextResponse.json(
        { error: 'Authentication token not available' },
        { status: 401 }
      );
    }

    if (!authHeaders.Authorization && requireStrictAuth) {
      console.warn('🔄 [DATA GET] Authorization header missing under strict auth');
      return NextResponse.json(
        { error: 'Authentication token required' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const dataId = searchParams.get('id');

    if (dataId) {
      // Return specific data item
      return NextResponse.json({
        id: dataId,
        filename: 'example.txt',
        status: 'processed',
        userId: userId,
        timestamp: new Date().toISOString()
      });
    }

    // Return list of data items
    return NextResponse.json([
      {
        id: 1,
        filename: 'example1.txt',
        status: 'processed',
        userId: userId,
        timestamp: new Date().toISOString()
      },
      {
        id: 2,
        filename: 'example2.txt',
        status: 'processing',
        userId: userId,
        timestamp: new Date().toISOString()
      }
    ]);

  } catch (error) {
    console.error('Data GET API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(_request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
