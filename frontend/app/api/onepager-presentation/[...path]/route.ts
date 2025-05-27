import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { extname } from 'path';

/**
 * Helper function to process CSS imports and inline them
 */
async function processCSSImports(cssContent: string, cssFilePath: string, baseDir: string): Promise<string> {
  const importRegex = /@import\s+['"]([^'"]+)['"];?/g;
  let processedContent = cssContent;
  const matches = [...cssContent.matchAll(importRegex)];

  for (const match of matches) {
    const importPath = match[1];
    const fullImportPath = resolve(dirname(cssFilePath), importPath);

    try {
      // Read the imported CSS file
      const importedContent = await readFile(fullImportPath, 'utf-8');

      // Recursively process any imports in the imported file
      const processedImportedContent = await processCSSImports(
        importedContent,
        fullImportPath,
        baseDir
      );

      // Replace the @import statement with the actual content
      processedContent = processedContent.replace(match[0], processedImportedContent);
    } catch (error) {
      console.warn(`Failed to import CSS file: ${fullImportPath}`, error);
      // Remove the failed import statement
      processedContent = processedContent.replace(match[0], `/* Failed to import: ${importPath} */`);
    }
  }

  return processedContent;
}

/**
 * Dynamic API route to serve any file from the onepager-presentation directory
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

    // Construct the full file path
    const fullPath = join(process.cwd(), 'public', 'onepager-presentation', filePath);

    // Read the file
    const fileContent = await readFile(fullPath);

    // Determine content type based on file extension
    const ext = extname(filePath).toLowerCase();
    let contentType = 'text/plain';

    switch (ext) {
      case '.html':
        contentType = 'text/html; charset=utf-8';
        break;
      case '.css':
        contentType = 'text/css; charset=utf-8';
        break;
      case '.js':
        contentType = 'application/javascript; charset=utf-8';
        break;
      case '.json':
        contentType = 'application/json; charset=utf-8';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
      case '.ico':
        contentType = 'image/x-icon';
        break;
      case '.woff':
        contentType = 'font/woff';
        break;
      case '.woff2':
        contentType = 'font/woff2';
        break;
      case '.ttf':
        contentType = 'font/ttf';
        break;
      case '.eot':
        contentType = 'application/vnd.ms-fontobject';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    // For HTML files, modify the content to fix relative paths
    if (ext === '.html') {
      let htmlContent = fileContent.toString('utf-8');
      const baseUrl = new URL(request.url).origin;

      // Replace relative paths with absolute API paths
      htmlContent = htmlContent
        .replace(/href="css\//g, `href="${baseUrl}/api/onepager-presentation/css/`)
        .replace(/src="css\//g, `src="${baseUrl}/api/onepager-presentation/css/`)
        .replace(/src="js\//g, `src="${baseUrl}/api/onepager-presentation/js/`)
        .replace(/src="img\//g, `src="${baseUrl}/api/onepager-presentation/img/`)
        .replace(/src="images\//g, `src="${baseUrl}/api/onepager-presentation/images/`)
        .replace(/src="assets\//g, `src="${baseUrl}/api/onepager-presentation/assets/`)
        .replace(/href="([^"]*\.(css|js|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf))"/g, `href="${baseUrl}/api/onepager-presentation/$1"`)
        .replace(/src="([^"]*\.(js|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf))"/g, `src="${baseUrl}/api/onepager-presentation/$1"`);

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
      const baseDir = join(process.cwd(), 'public', 'onepager-presentation');

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

    // Return the file content with proper headers
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving onepager asset:', error);
    return new NextResponse('Asset not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}
