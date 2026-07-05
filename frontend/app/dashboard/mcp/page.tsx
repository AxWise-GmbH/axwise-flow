import React from 'react';

export default function McpSettingsPage() {
    const dummyApiKey = "ax_live_" + Math.random().toString(36).substring(2, 11);

    const snippet = `"mcpServers": {
  "axwise": {
    "command": "npx",
    "args": ["-y", "@axwise/mcp-connector"],
    "env": {
      "AXWISE_API_KEY": "${dummyApiKey}",
      "API_BASE_URL": "https://api.axwise.io"
    }
  }
}`;

    return (
        <div className="p-8 max-w-4xl mx-auto text-white bg-gray-900 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-blue-400">MCP Bridge Setup</h1>
            <p className="mb-8 text-gray-300 text-lg">Generate your API Key and configure your IDE to connect the Zero-Trust Split-Brain model.</p>

            <div className="mb-8 bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
                <h2 className="text-xl font-bold mb-4 text-gray-100">Your AxWise API Key</h2>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                    <code className="bg-gray-900 px-4 py-3 rounded-lg text-emerald-400 border border-gray-600 font-mono flex-1 text-lg">
                        {dummyApiKey}
                    </code>
                    <button className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 whitespace-nowrap">
                        Generate New Key
                    </button>
                </div>
            </div>

            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
                <h2 className="text-xl font-bold mb-4 text-gray-100">IDE Configuration</h2>
                <p className="mb-6 text-gray-400">
                    Paste this JSON block into your <code className="text-blue-300 bg-gray-900 px-2 py-1 rounded">claude_desktop_config.json</code>,
                    or into your Cursor / Windsurf MCP settings pane.
                </p>
                <div className="relative group">
                    <pre className="bg-gray-900 p-6 rounded-lg text-sm overflow-x-auto border border-gray-600 text-gray-300 font-mono shadow-inner">
                        <code>{snippet}</code>
                    </pre>
                    <button className="absolute top-4 right-4 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        Copy snippet
                    </button>
                </div>
            </div>
        </div>
    );
}
