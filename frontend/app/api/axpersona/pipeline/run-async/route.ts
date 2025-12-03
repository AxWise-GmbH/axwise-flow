import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const JOB_STATUS_POLL_INTERVAL_MS = 5000; // 5 seconds
const JOB_STATUS_MAX_DURATION_MS = 20 * 60 * 1000; // 20 minutes overall safety timeout


/**
 * AxPersona Pipeline API route - proxies to Python backend
 * Runs the complete AxPersona pipeline: questionnaire → simulation → analysis → export
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Proxying AxPersona pipeline request to backend (job-based)');

    // OSS mode - always use development token
    const authToken: string =
      process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
    console.log('AxPersona Pipeline API: Using development token (OSS mode)');
    console.log('AxPersona Pipeline API: API_BASE_URL =', API_BASE_URL);

    // Step 1: Create a pipeline job on the backend (returns quickly)
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

    // Step 2: Poll job status until completion or failure
    const startTime = Date.now();

    while (true) {
      if (Date.now() - startTime > JOB_STATUS_MAX_DURATION_MS) {
        console.error('AxPersona Pipeline job polling exceeded max duration');
        return NextResponse.json(
          { error: 'Pipeline job polling exceeded maximum duration' },
          { status: 504 },
        );
      }

      const statusResponse = await fetch(
        `${API_BASE_URL}/api/axpersona/v1/pipeline/jobs/${jobId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error('AxPersona Pipeline job status error:', errorText);
        return NextResponse.json(
          { error: `Backend job status error: ${errorText}` },
          { status: statusResponse.status },
        );
      }

      const statusData = await statusResponse.json();
      const status = statusData.status as string;

      if (status === 'completed') {
        console.log('AxPersona Pipeline job completed:', jobId);
        // statusData.result is the PipelineExecutionResult
        // Include the job_id in the response so the frontend can auto-select it
        const result = statusData.result ?? statusData;
        return NextResponse.json({
          ...result,
          job_id: jobId,
        });
      }

      if (status === 'failed') {
        console.error('AxPersona Pipeline job failed:', statusData.error);
        return NextResponse.json(
          {
            error:
              statusData.error ||
              'AxPersona pipeline job failed on the backend',
          },
          { status: 500 },
        );
      }

      // pending / running → wait and poll again
      await new Promise((resolve) =>
        setTimeout(resolve, JOB_STATUS_POLL_INTERVAL_MS),
      );
    }
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

