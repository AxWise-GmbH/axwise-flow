import { NextRequest, NextResponse } from 'next/server';
import { Agent } from 'undici';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const dynamic = 'force-dynamic';

// Allow up to 10 minutes for long video analysis (Vercel/Next.js)
export const maxDuration = 600;

// Create a custom agent with extended timeouts for long video processing
// Default undici timeout is 300s, we need longer for video analysis
const longTimeoutAgent = new Agent({
  headersTimeout: 600000, // 10 minutes for headers
  bodyTimeout: 600000, // 10 minutes for body
  connectTimeout: 30000, // 30 seconds to connect
});

/**
 * Video Analysis API route - proxies to Python backend
 *
 * Analyzes video content using multimodal AI to generate
 * department-specific annotations (Security, Marketing, Operations).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Analyzing video:', body);

    // OSS mode - always use development token
    const authToken: string =
      process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';

    // Use AbortController with 10 minute timeout for long video analysis
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/axpersona/v1/video-analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          // @ts-expect-error - dispatcher is valid for Node.js fetch but not typed
          dispatcher: longTimeoutAgent,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Video analysis error:', errorText);
        return NextResponse.json(
          { error: `Backend error: ${errorText}` },
          { status: response.status },
        );
      }

      const result = await response.json();
      return NextResponse.json(result);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error('Video analysis API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

