import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// This route now just starts the job and returns immediately.
// The frontend uses polling via usePipelineRunDetail() to track progress.
export const dynamic = 'force-dynamic';

/**
 * AxPersona Pipeline API route - proxies to Python backend
 *
 * This route creates a pipeline job and returns immediately with the job_id.
 * The frontend should use the pipeline runs polling hooks to track progress.
 * This avoids browser timeout issues for long-running pipelines.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Creating AxPersona pipeline job on backend');

    // OSS mode - always use development token
    const authToken: string =
      process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';
    console.log('AxPersona Pipeline API: Using development token (OSS mode)');
    console.log('AxPersona Pipeline API: API_BASE_URL =', API_BASE_URL);

    // Create a pipeline job on the backend (returns quickly)
    const createJobResponse = await fetch(
      `${API_BASE_URL}/api/axpersona/v1/pipeline/run-async`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!createJobResponse.ok) {
      const errorText = await createJobResponse.text();
      console.error('AxPersona Pipeline job creation error:', errorText);
      return NextResponse.json(
        { error: `Backend job creation error: ${errorText}` },
        { status: createJobResponse.status },
      );
    }

    const job = await createJobResponse.json();
    const jobId = job.job_id as string;
    console.log('AxPersona Pipeline job created:', jobId);

    // Return immediately with job info - frontend will poll for status
    return NextResponse.json({
      job_id: jobId,
      status: job.status || 'pending',
      message: 'Pipeline job started. Use polling to track progress.',
    });
  } catch (error) {
    console.error('AxPersona Pipeline API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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

