/**
 * API route for searching local news using Gemini's Google Search grounding.
 *
 * Proxies requests to the Python backend which uses Gemini 2.5's built-in
 * Google Search tool for real-time news about specific locations.
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export interface LocalNewsRequest {
  location: string;
  days_back?: number;
  max_items?: number;
}

export interface NewsSource {
  title: string;
  url?: string | null;
}

export interface LocalNewsResponse {
  success: boolean;
  location: string;
  raw_response?: string;
  search_queries: string[];
  sources: NewsSource[];
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: LocalNewsRequest = await request.json();

    if (!body.location) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${BACKEND_URL}/api/precall/v1/search-local-news`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location: body.location,
          days_back: body.days_back ?? 7,
          max_items: body.max_items ?? 5,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", errorText);
      return NextResponse.json(
        {
          success: false,
          error: `Backend error: ${response.status}`,
        },
        { status: response.status }
      );
    }

    const data: LocalNewsResponse = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Local news search error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

