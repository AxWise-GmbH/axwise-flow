import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

async function getToken(): Promise<string | null> {
  try {
    // Get the authentication context from Clerk
    const authResult = await auth();
    const { userId } = authResult;

    if (!userId) {
      console.log('No authenticated user found');
      return null;
    }

    // Get the JWT token from Clerk
    const token = await authResult.getToken();

    if (!token) {
      console.log('No JWT token available from Clerk');
      return null;
    }

    return token;
  } catch (error) {
    console.error('Error getting Clerk token:', error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('Analysis Status API route called for ID:', params.id);

    // Get the auth token
    const token = await getToken();

    if (!token) {
      console.log('Analysis Status API: No authentication token available');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    console.log('Analysis Status API: Using Clerk JWT token');
    console.log('Proxying to backend:', `${backendUrl}/api/analysis/${params.id}/status`);

    // Forward the request to the Python backend with cache-busting
    const response = await fetch(`${backendUrl}/api/analysis/${params.id}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
      cache: 'no-store', // Disable Next.js fetch caching
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Analysis Status API: Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Detailed backend response logging for server terminal
    console.log('\n🔄 [SERVER-API] === Analysis Status Response ===');
    console.log(`🔧 [BACKEND] Analysis ID: ${params.id}`);
    console.log(`🔧 [BACKEND] Status: ${data.status}`);
    console.log(`🔧 [BACKEND] Current Stage: ${data.current_stage || data.currentStage || 'unknown'}`);

    // Log stage states breakdown
    const stageStates = data.stage_states || data.stageStates;
    if (stageStates) {
      console.log(`🔧 [BACKEND] Stage States Breakdown:`);
      Object.entries(stageStates).forEach(([stageName, stageData]: [string, any]) => {
        const status = stageData.status;
        const progress = Math.round((stageData.progress || 0) * 100);
        const message = stageData.message;
        const emoji = status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : '⏳';
        console.log(`  ${emoji} ${stageName}: ${status} (${progress}%) - ${message}`);
      });
    }

    // Log completion/failure status
    if (data.status === 'completed') {
      console.log(`✅ [SERVER-API] Analysis ${params.id} COMPLETED successfully!`);
    } else if (data.status === 'failed') {
      console.log(`❌ [SERVER-API] Analysis ${params.id} FAILED: ${data.error || 'Unknown error'}`);
    } else if (data.status === 'processing') {
      console.log(`🔄 [SERVER-API] Analysis ${params.id} still processing...`);
    }

    console.log(`🔄 [SERVER-API] === End Status Response ===\n`);
    console.log('Analysis Status API: Backend response successful');

    // Return response with cache-busting headers
    const nextResponse = NextResponse.json(data);
    nextResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    nextResponse.headers.set('Pragma', 'no-cache');
    nextResponse.headers.set('Expires', '0');
    return nextResponse;
  } catch (error) {
    console.error('Analysis Status API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
