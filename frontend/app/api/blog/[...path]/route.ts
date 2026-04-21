import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { extname } from 'path';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Helper function to process CSS imports and inline them
 */
async function processCSSImports(cssContent: string, cssFilePath: string, baseDir: string): Promise<string> {
  const importRegex = /@import\s+['"]([^'"]+)['"];?/g;
  let processedContent = cssContent;
  const matches = [...cssContent.matchAll(importRegex)];

  for (const match of matches) {
    const importPath = match[1];
    try {
      // Resolve the import path relative to the current CSS file
      const resolvedPath = join(baseDir, importPath);
      const importedContent = await readFile(resolvedPath, 'utf-8');

      // Replace the @import statement with the actual content
      processedContent = processedContent.replace(match[0], importedContent);
    } catch (error) {
      console.warn(`Could not resolve CSS import: ${importPath}`, error);
      // Keep the original @import if we can't resolve it
    }
  }

  return processedContent;
}

/**
 * Dynamic API route to serve any file from the blog directory
 * This handles HTML, CSS, JS, images, and other assets with proper MIME types
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Handle root path (no path segments)
    let filePath: string;
    if (!params.path || params.path.length === 0) {
      filePath = 'index.html';
    } else {
      filePath = params.path.join('/');
    }

    // Security check: prevent directory traversal
    if (filePath.includes('..') || filePath.includes('//')) {
      return new NextResponse('Invalid path', { status: 400 });
    }

    // Construct the full path to the file in the public/blog directory
    const fullPath = join(process.cwd(), 'public', 'blog', filePath);

    // Read the file
    const fileContent = await readFile(fullPath);

    // Determine content type based on file extension
    const ext = extname(filePath).toLowerCase();
    let contentType = 'text/plain';

    const mimeTypes: { [key: string]: string } = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.pdf': 'application/pdf',
    };

    contentType = mimeTypes[ext] || 'text/plain';

    // For HTML files, process relative URLs to point to the API route
    if (ext === '.html') {
      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://axwise.de'
        : `http://localhost:${process.env.PORT || 3000}`;

      let htmlContent = fileContent.toString('utf-8')
        // Update relative links to other blog articles
        .replace(/href="([^"]*\.html)"/g, `href="/blog/$1"`)
        // Update relative asset links (CSS, JS, images, etc.)
        .replace(/href="([^"]*\.(css|js))"/g, `href="${baseUrl}/api/blog/$1"`)
        .replace(/src="([^"]*\.(js|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf))"/g, `src="${baseUrl}/api/blog/$1"`);

      return new NextResponse(htmlContent, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // For CSS files, process @import statements and inline them
    if (ext === '.css') {
      const cssContent = fileContent.toString('utf-8');
      const baseDir = join(process.cwd(), 'public', 'blog');

      try {
        const processedCssContent = await processCSSImports(cssContent, fullPath, baseDir);

        return new NextResponse(processedCssContent, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (error) {
        console.error('Error processing CSS imports:', error);
        // Fall back to serving the original CSS content
        return new NextResponse(cssContent, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // For all other file types, serve as-is
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('Error serving blog file:', error);

    // Check if it's a file not found error
    if ((error as any).code === 'ENOENT') {
      return new NextResponse('File not found', { status: 404 });
    }

    return new NextResponse('Internal server error', { status: 500 });
  }
}
