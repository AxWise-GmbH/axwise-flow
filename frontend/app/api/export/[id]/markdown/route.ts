import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const analysisId = params.id;
    console.log(`Export API: Proxying markdown export request for analysis ${analysisId}`);

    // Get authentication token
    let authToken: string;

    // Check if we're in development mode
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment && process.env.NEXT_PUBLIC_ENABLE_CLERK_VALIDATION !== 'true') {
      // Development mode - use development token
      authToken = 'dev_test_token_DEV_TOKEN_REDACTED';
      console.log('Export API: Using development token (Clerk validation disabled)');
    } else {
      // Production mode or Clerk validation enabled - use Clerk
      const authResult = await auth();
      const token = await authResult.getToken();

      if (!token) {
        console.error('Export API: No authentication token available');
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      authToken = token;
      console.log('Export API: Using Clerk token');
    }

    // Get auth_token from query parameters if provided (for direct URL access)
    const url = new URL(request.url);
    const queryAuthToken = url.searchParams.get('auth_token');
    if (queryAuthToken) {
      authToken = queryAuthToken;
      console.log('Export API: Using auth token from query parameters');
    }

    // Construct backend URL
    const backendUrl = `${API_BASE_URL}/api/export/${analysisId}/markdown`;
    console.log(`Export API: Proxying to backend: ${backendUrl}`);

    // Make request to backend
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Export API: Backend responded with ${response.status}: ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Export API: Backend error details: ${errorText}`);

      return NextResponse.json(
        { error: `Backend error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the markdown content
    const markdownContent = await response.text();
    console.log(`Export API: Successfully received ${markdownContent.length} characters from backend`);

    // Return the markdown content with proper headers for download
    return new NextResponse(markdownContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename=analysis_report_${analysisId}.md`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('Export API: Error proxying export request:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
