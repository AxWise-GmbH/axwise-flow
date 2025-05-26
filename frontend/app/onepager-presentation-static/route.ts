import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * API route to serve the complete onepager presentation with fixed asset paths
 */
export async function GET(request: NextRequest) {
  try {
    // Read the HTML file from the public directory
    const filePath = join(process.cwd(), 'public', 'onepager-presentation', 'index.html');
    let htmlContent = await readFile(filePath, 'utf-8');
    
    // Get the base URL from the request
    const baseUrl = new URL(request.url).origin;
    
    // Replace all relative asset paths with absolute URLs pointing to the static files
    htmlContent = htmlContent
      // CSS files
      .replace(/href="css\//g, `href="${baseUrl}/onepager-presentation/css/`)
      .replace(/href="style\.css"/g, `href="${baseUrl}/onepager-presentation/style.css"`)
      // JavaScript files  
      .replace(/src="js\//g, `src="${baseUrl}/onepager-presentation/js/`)
      .replace(/src="main\.js"/g, `src="${baseUrl}/onepager-presentation/main.js"`)
      // Images
      .replace(/src="img\//g, `src="${baseUrl}/onepager-presentation/img/`)
      .replace(/src="logo\.svg"/g, `src="${baseUrl}/onepager-presentation/logo.svg"`)
      .replace(/src="logo-footer\.svg"/g, `src="${baseUrl}/onepager-presentation/logo-footer.svg"`)
      // Any other assets
      .replace(/href="([^"]*\.(css|js|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf))"/g, `href="${baseUrl}/onepager-presentation/$1"`)
      .replace(/src="([^"]*\.(js|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf))"/g, `src="${baseUrl}/onepager-presentation/$1"`);
    
    // Return the modified HTML content
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving onepager presentation:', error);
    return new NextResponse('Onepager presentation not found', { 
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}
