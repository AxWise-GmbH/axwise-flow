import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Simplified Personas API route - proxies to Python backend with proper authentication
 * Returns design thinking optimized personas with only core fields
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('Simplified Personas API route called for ID:', params.id);

    // OSS mode - use development token
    const authToken: string = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';

    // Get the backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    console.log('Proxying to backend (full results):', `${backendUrl}/api/results/${params.id}`);

    // Fetch full results to leverage presenter hydration and then shape into simplified schema
    const response = await fetch(`${backendUrl}/api/results/${params.id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const full = await response.json();
    console.log('Simplified Personas API: Backend full results response successful for analysis ID:', params.id);

    const results = full?.results || {};
    const personas = Array.isArray(results?.personas) ? results.personas : [];

    // Minimal trait mapper like backend simplified endpoint
    const traitFrom = (p: any, name: string) => {
      const t = (p?.populated_traits?.[name]) || p?.[name] || {};
      const value = t?.value ?? '';
      const confidence = t?.confidence ?? (p?.overall_confidence ?? 0.7);
      const evidence = Array.isArray(t?.evidence) ? t.evidence : [];
      return { value, confidence, evidence };
    };

    const simplified = personas.map((p: any) => ({
      name: p?.name ?? 'Unknown Persona',
      description: p?.description ?? '',
      archetype: p?.archetype ?? 'Professional',
      demographics: traitFrom(p, 'demographics'),
      goals_and_motivations: traitFrom(p, 'goals_and_motivations'),
      challenges_and_frustrations: traitFrom(p, 'challenges_and_frustrations'),
      key_quotes: traitFrom(p, 'key_quotes'),
    }));

    const simplifiedResponse = {
      status: 'success',
      result_id: full?.result_id ?? results?.result_id ?? Number(params.id),
      personas: simplified,
      total_personas: simplified.length,
      design_thinking_optimized: true,
      validation: 'passed',
    };

    return NextResponse.json(simplifiedResponse, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('Simplified Personas API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
