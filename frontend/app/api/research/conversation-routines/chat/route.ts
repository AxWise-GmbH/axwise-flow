import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    console.log("Proxying conversation routines chat request to backend");
    console.log("API_BASE_URL:", API_BASE_URL);

    // OSS mode - use development token
    const authToken =
      process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || "dev_test_token_";

    // Get the request body
    const body = await request.json();

    // Forward the request to the backend
    const response = await fetch(
      `${API_BASE_URL}/api/research/conversation-routines/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      }
    );

    console.log("Backend response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Backend responded with ${response.status}: ${response.statusText}`,
        errorText
      );
      return NextResponse.json(
        { error: "Backend request failed", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("Backend response received successfully");

    return NextResponse.json(data);
  } catch (error) {
    console.error("Conversation Routines API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
