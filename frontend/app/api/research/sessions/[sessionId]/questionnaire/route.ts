import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(_request: NextRequest, context: { params: { sessionId: string } }) {
  const { sessionId } = context.params;
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_AUTH === 'true';

    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';

    const resp = await fetch(`${API_BASE_URL}/api/research/sessions/${encodeURIComponent(sessionId)}/questionnaire`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: 'Failed to fetch questionnaire', details: text }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying questionnaire:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: { sessionId: string } }) {
  const { sessionId } = context.params;
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_AUTH === 'true';

    const authToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';

    const body = await request.text();
    const resp = await fetch(`${API_BASE_URL}/api/research/sessions/${encodeURIComponent(sessionId)}/questionnaire`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: 'Failed to save questionnaire', details: text }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying questionnaire POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

