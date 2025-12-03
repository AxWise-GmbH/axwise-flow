import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function getAuthToken() {
  return process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'dev_test_token_';
}

export async function GET(_request: NextRequest, context: { params: { sessionId: string } }) {
  const { sessionId } = context.params;
  try {
    let authToken = '';
    try { authToken = await getAuthToken(); } catch {}

    const resp = await fetch(`${API_BASE_URL}/api/research/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: 'Failed to fetch research session', details: text }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying research session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: { sessionId: string } }) {
  const { sessionId } = context.params;
  try {
    const authToken = await getAuthToken();
    const body = await request.text();

    const resp = await fetch(`${API_BASE_URL}/api/research/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: 'Failed to update session', details: text }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying session update:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: { sessionId: string } }) {
  const { sessionId } = context.params;
  try {
    const authToken = await getAuthToken();

    const resp = await fetch(`${API_BASE_URL}/api/research/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!resp.ok && resp.status !== 404) {
      const text = await resp.text();
      return NextResponse.json({ error: 'Failed to delete session', details: text }, { status: resp.status });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error proxying session delete:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

