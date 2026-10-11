'use client';
import { useState } from 'react';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { AXWISE_RELEASE, AXWISE_RELEASE_URL, AXWISE_DOWNLOAD_URL, AXWISE_CODEX_COMMAND } from '@/lib/axwise-release';

export function AxwiseDownloadCard({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(AXWISE_CODEX_COMMAND);
      setCopied(true);
    } catch { setCopied(false); }
  }
  return (
    <div className={`bg-[#1A1A1A] text-stone-200 border border-stone-800 rounded-xl shadow-lg space-y-4 ${compact ? 'p-5 max-w-lg' : 'p-7 lg:col-span-7'}`}>
      <div className="flex flex-wrap justify-between gap-2">
        <span className="text-xs font-mono text-emerald-400">AxWise Rust {AXWISE_RELEASE.version}</span>
        <span className="text-[11px] text-stone-400">Apple Silicon macOS</span>
      </div>
      <p className="text-sm text-stone-300 leading-relaxed">
        Use the model and sign-in you already have in your assistant. AxWise runs locally as a Rust engine, with no Python runtime or separate AxWise account.
      </p>
      <div className="flex flex-wrap gap-3 text-xs">
        <a href={AXWISE_DOWNLOAD_URL} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-800 hover:bg-emerald-700 rounded-md text-white">
          <Download className="w-4 h-4" aria-hidden="true" /> Download Rust for macOS
        </a>
        <a href={AXWISE_RELEASE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-stone-400 hover:text-white">
          Source and release notes <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>
      <div>
        <div className="flex justify-between items-center mb-2 text-[11px] text-stone-400">
          <span>After extracting, connect to Codex</span>
          <button type="button" onClick={copyCommand} aria-label="Copy Codex setup command" className="flex gap-1 items-center hover:text-white">
            {copied ? <Check className="w-3 h-3" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="overflow-x-auto bg-stone-950 border border-stone-800 rounded-md p-3 text-[11px] leading-relaxed"><code>{AXWISE_CODEX_COMMAND}</code></pre>
      </div>
      {!compact ? <>
        <p className="text-xs text-stone-400 leading-relaxed">Your assistant supplies the model through MCP sampling when supported, or through the current chat. An inherited API key is also available as an explicit option.</p>
        <details className="text-[11px] font-mono text-stone-400 border border-stone-800 rounded-lg p-3">
          <summary className="cursor-pointer hover:text-white">Download SHA-256 · {AXWISE_RELEASE.bytes.toLocaleString('en-US')} bytes</summary>
          <code className="block pt-3 break-all text-emerald-400">{AXWISE_RELEASE.sha256}</code>
        </details>
        <a href="/docs" className="text-xs text-emerald-400 underline">Installation, model access and limits</a>
      </> : null}
    </div>
  );
}
