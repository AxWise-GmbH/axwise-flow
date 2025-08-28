#!/usr/bin/env python3
"""
Simple HTTP server for testing the AxWise Gründungsexistenz business plan locally.
This server serves the business plan and all supporting documents with proper MIME types.
"""

import http.server
import socketserver
import os
import mimetypes
from urllib.parse import unquote

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP request handler with proper MIME types for business documents."""
    
    def __init__(self, *args, **kwargs):
        # Add custom MIME types for business documents
        mimetypes.add_type('application/pdf', '.pdf')
        mimetypes.add_type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx')
        mimetypes.add_type('application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx')
        super().__init__(*args, **kwargs)
    
    def end_headers(self):
        # Add security headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-XSS-Protection', '1; mode=block')
        super().end_headers()
    
    def do_GET(self):
        # Handle root redirect to business plan
        if self.path == '/':
            self.send_response(302)
            self.send_header('Location', '/grund/businessplande.html')
            self.end_headers()
            return
        
        # Handle /grund redirect
        if self.path == '/grund' or self.path == '/grund/':
            self.send_response(302)
            self.send_header('Location', '/grund/businessplande.html')
            self.end_headers()
            return
        
        # Serve files normally
        super().do_GET()
    
    def log_message(self, format, *args):
        """Custom log format for better readability."""
        print(f"[{self.log_date_time_string()}] {format % args}")

def start_server(port=8000):
    """Start the test server on the specified port."""
    
    # Change to the project directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Create server
    with socketserver.TCPServer(("", port), CustomHTTPRequestHandler) as httpd:
        print("=" * 60)
        print("🚀 AxWise Gründungsexistenz Test Server")
        print("=" * 60)
        print(f"📡 Server running on: http://localhost:{port}")
        print(f"🌐 Business Plan URL: http://localhost:{port}/grund/businessplande.html")
        print(f"📁 Documents URL: http://localhost:{port}/grund/documents/")
        print("=" * 60)
        print("📋 Test URLs:")
        print(f"   • Main Business Plan: http://localhost:{port}/grund/businessplande.html")
        print(f"   • Antrag Phase 1: http://localhost:{port}/grund/documents/Antrag_Phase_1_(29.04.2025).pdf")
        print(f"   • Competitor Matrix: http://localhost:{port}/grund/documents/Assignment_2_Competitor_Matrix_AxWise.xlsx")
        print(f"   • Financial Model: http://localhost:{port}/grund/documents/axwise_integrated_model_final_v81_complete.xlsx")
        print("=" * 60)
        print("⚠️  Press Ctrl+C to stop the server")
        print("=" * 60)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped by user")
            print("👋 Thank you for testing the AxWise business plan!")

if __name__ == "__main__":
    import sys
    
    # Allow custom port via command line argument
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("❌ Invalid port number. Using default port 8000.")
    
    start_server(port)
