import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * API route to serve the complete workshop design thinking page with fixed asset paths
 */
export async function GET(request: NextRequest) {
  try {
    // Read the HTML file from the public directory
    const filePath = join(process.cwd(), 'public', 'workshop-designthinking', 'index.html');
    let htmlContent = await readFile(filePath, 'utf-8');
    
    // Get the base URL from the request
    const baseUrl = new URL(request.url).origin;
    
    // Replace all relative asset paths with absolute URLs pointing to the static files
    htmlContent = htmlContent
      // CSS files
      .replace(/href="css\//g, `href="${baseUrl}/workshop-designthinking/css/`)
      .replace(/href="style\.css"/g, `href="${baseUrl}/workshop-designthinking/style.css"`)
      // JavaScript files  
      .replace(/src="js\//g, `src="${baseUrl}/workshop-designthinking/js/`)
      .replace(/src="script\.js"/g, `src="${baseUrl}/workshop-designthinking/script.js"`)
      // Images
      .replace(/src="img\//g, `src="${baseUrl}/workshop-designthinking/img/`)
      .replace(/src="images\//g, `src="${baseUrl}/workshop-designthinking/images/`)
      .replace(/src="assets\//g, `src="${baseUrl}/workshop-designthinking/assets/`)
      // Any other assets
      .replace(/href="([^"]*\.(css|js|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf))"/g, `href="${baseUrl}/workshop-designthinking/$1"`)
      .replace(/src="([^"]*\.(js|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf))"/g, `src="${baseUrl}/workshop-designthinking/$1"`);
    
    // Return the modified HTML content
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving workshop design thinking:', error);
    return new NextResponse('Workshop design thinking page not found', { 
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}
