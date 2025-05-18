import { NextRequest, NextResponse } from 'next/server';
import { PRDTab } from '@/components/PRDTab';

/**
 * API route that renders the PRD component as an HTML page
 * This allows us to embed the PRD component in an iframe
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const resultId = params.id;

  // Create HTML content with the PRD component
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Product Requirements Document</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap" />
        <style>
          body {
            font-family: 'Roboto', sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          #root {
            padding: 20px;
          }
        </style>
        <script>
          // Function to load the PRD component
          function loadPRD() {
            // Create a script element to load the PRD component
            const script = document.createElement('script');
            script.src = '/prd-component.js';
            script.async = true;
            script.onload = () => {
              // Initialize the PRD component
              if (window.initPRD) {
                window.initPRD('${resultId}');
              }
            };
            document.body.appendChild(script);
          }

          // Load the PRD component when the page loads
          window.onload = loadPRD;
        </script>
      </head>
      <body>
        <div id="root">
          <div style="text-align: center; padding: 40px;">
            <h2>Product Requirements Document</h2>
            <p>Loading PRD generator...</p>
            <div id="prd-container"></div>
          </div>
        </div>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
