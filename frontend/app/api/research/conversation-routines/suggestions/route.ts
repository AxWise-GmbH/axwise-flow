import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    console.log('Proxying conversation routines suggestions request to backend');
    console.log('API_BASE_URL:', API_BASE_URL);

    // OSS mode - use development token
    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';

    // Get query parameters and forward them
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const backendUrl = `${API_BASE_URL}/api/research/conversation-routines/suggestions${queryString ? `?${queryString}` : ''}`;

    console.log('Backend URL:', backendUrl);

    // Forward the request to the backend
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);
      
      // Return user-friendly error with helpful message
      return NextResponse.json(
        { 
          error: 'Failed to fetch suggestions',
          message: getErrorMessage(response.status, errorText),
          suggestions: [] // Return empty so frontend can handle appropriately
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Backend response received successfully');

    return NextResponse.json(data);

  } catch (error) {
    console.error('Conversation Routines Suggestions API error:', error);
    
    // Return user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isConnectionError = errorMessage.includes('ECONNREFUSED') || 
                              errorMessage.includes('fetch failed') ||
                              errorMessage.includes('network');
    
    return NextResponse.json(
      { 
        error: 'Service unavailable',
        message: isConnectionError 
          ? 'Cannot connect to backend service. Please ensure the backend server is running.'
          : 'An unexpected error occurred. Please try again.',
        suggestions: []
      },
      { status: 503 }
    );
  }
}

function getErrorMessage(status: number, errorText: string): string {
  switch (status) {
    case 401:
      return 'Authentication failed. Please check your API key configuration.';
    case 403:
      return 'Access denied. Please check your API key permissions.';
    case 404:
      return 'Suggestions endpoint not found. Please check backend configuration.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Backend service is temporarily unavailable. Please try again later.';
    default:
      return `Backend error: ${errorText || 'Unknown error'}`;
  }
}

