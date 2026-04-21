import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * API route to serve the blog index page
 */
export async function GET(request: NextRequest) {
  try {
    // Serve the blog index.html file
    const fullPath = join(process.cwd(), 'public', 'blog', 'index.html');
    const fileContent = await readFile(fullPath, 'utf-8');
    
    // Process relative URLs to point to the API route
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://axwise.de' 
      : `http://localhost:${process.env.PORT || 3000}`;
    
    const htmlContent = fileContent
      // Update relative links to other blog articles
      .replace(/href="([^"]*\.html)"/g, `href="/blog/$1"`)
      // Update relative asset links (CSS, JS, images, etc.)
      .replace(/href="([^"]*\.(css|js))"/g, `href="${baseUrl}/api/blog/$1"`)
      .replace(/src="([^"]*\.(js|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf))"/g, `src="${baseUrl}/api/blog/$1"`);

    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('Error serving blog index:', error);
    
    // Check if it's a file not found error
    if ((error as any).code === 'ENOENT') {
      return new NextResponse('Blog index not found', { status: 404 });
    }
    
    return new NextResponse('Internal server error', { status: 500 });
  }
}
