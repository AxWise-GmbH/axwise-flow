'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Shield, 
  GitBranch, 
  Server, 
  Check, 
  FileText, 
  ChevronRight,
  Sparkles,
  Lock,
  ArrowRight
} from 'lucide-react';

export default function PrivacyPolicyPage(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-[#FCFAF7] text-[#1C1917] font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FCFAF7]/90 backdrop-blur-md border-b border-[#EAE6DF] px-4 lg:px-8 xl:px-16 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ width: '28px', height: '28px', flexShrink: 0 }}>
              <defs>
                <radialGradient id="o2_logo_pp" cx="40%" cy="40%"><stop offset="0%" stopColor="#34D399" stopOpacity="0.6"></stop><stop offset="100%" stopColor="#064E3B"></stop></radialGradient>
              </defs>
              <circle cx="32" cy="32" r="24" fill="url(#o2_logo_pp)"></circle>
              <circle cx="32" cy="32" r="22" fill="none" stroke="#34D399" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="20 15"></circle>
            </svg>
            <span className="font-sans font-medium text-sm text-stone-500">Orqaly</span>
            <span className="text-stone-300 font-light select-none">×</span>
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}><rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/><path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" stroke-width="2" fill="none" strokeLinejoin="round"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            <span className="font-serif font-bold text-lg tracking-tight">AxWise</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-8 text-xs xl:text-sm font-medium text-stone-600">
          <Link href="/#consilium" className="hover:text-stone-900 transition-colors">Consilium Sandbox</Link>
          <Link href="/#traceability" className="hover:text-stone-900 transition-colors">Traceability</Link>
          <Link href="/#policy" className="hover:text-stone-900 transition-colors">RBAC Gateway</Link>
          <Link href="/#twins" className="hover:text-stone-900 transition-colors">Digital Twins</Link>
          <Link href="/#compliance" className="hover:text-stone-900 transition-colors">Use Cases</Link>
        </nav>

        <div className="flex items-center gap-3">
          <a 
            href="https://github.com/AxWise-GmbH/Flow" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 border border-stone-300 rounded-md text-xs font-mono text-stone-700 hover:border-stone-900 hover:text-stone-900 transition-all"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Apache 2.0 OSS
          </a>
          <Link 
            href="/" 
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1C1917] hover:bg-stone-800 text-[#FCFAF7] rounded-md text-xs font-medium tracking-tight transition-all"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Main Gate
          </Link>
        </div>
      </header>

      {/* Main Privacy policy content */}
      <main className="max-w-3xl mx-auto px-6 py-20 space-y-12">
        <div className="space-y-4 border-b border-[#EAE6DF] pb-8">
          <h1 className="font-serif text-5xl font-normal tracking-tight text-stone-900">Privacy Policy</h1>
          <p className="text-sm text-stone-500 font-mono">// How we collect, use, and protect your personal information</p>
          <p className="text-xs text-stone-400">Last updated: July 2026</p>
        </div>

        <article className="prose prose-stone leading-relaxed space-y-8 text-stone-700 text-sm">
          
          <section className="space-y-3">
            <h2 className="text-lg font-serif font-semibold text-stone-900">1. Introduction</h2>
            <p>
              AxWise UG (in formation) (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our self-hosted REST API gateway, multi-agent simulation sandbox, and related developer portals (collectively, the &quot;Service&quot;).
            </p>
            <p>
              Please read this Privacy Policy carefully. By accessing or using our Service, you acknowledge that you have read, understood, and agree to be bound by all the terms of this Privacy Policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-serif font-semibold text-stone-900">2. Self-Hosted Privacy First</h2>
            <p>
              Because the core <strong className="font-semibold text-stone-900">AxWise Flow Engine</strong> is designed to be fully self-hosted under the Apache 2.0 open-source license, we do not store, intercept, or analyze your raw transcripts or private digital twin execution data on our servers. All local databases (SQLite, PostgreSQL, pgvector) and local files are fully containerized and controlled by you, providing absolute security and zero external data leaks.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-serif font-semibold text-stone-900">3. Information We Collect on this Portal</h2>
            <p>On this portal and documentation web hub, we may collect:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Usage Data:</strong> Anonymized analytical parameters concerning page requests and interactive sandbox evaluations.</li>
              <li><strong>Contact Information:</strong> Names and email addresses optionally provided for developer updates and compliance integrations.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-serif font-semibold text-stone-900">4. Third-Party API integrations</h2>
            <p>
              Your self-hosted instances connect directly to third-party LLM providers (e.g. Google Gemini, PydanticAI, OpenAI). These third parties have their own privacy policies addressing how they use raw tokens. We highly recommend reviewing their compliance parameters before running high-throughput production cycles.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-serif font-semibold text-stone-900">5. Contact Information</h2>
            <p>For any privacy or data verification inquiries, please contact us:</p>
            <div className="bg-stone-50 border border-stone-200 p-6 rounded-lg space-y-1.5 text-xs text-stone-600">
              <p className="font-semibold text-stone-900">AxWise UG (in formation)</p>
              <p>Aumunder Heerweg 13</p>
              <p>28757 Bremen, Germany</p>
              <p>Email: <a href="mailto:info@axwise.de" className="text-emerald-700 hover:underline">info@axwise.de</a></p>
            </div>
          </section>

        </article>
      </main>

      {/* Footer */}
      <footer className="bg-[#121212] text-stone-500 px-6 lg:px-16 py-8 border-t border-stone-900 text-xs flex flex-wrap justify-between items-center">
        <div>© 2026 AxWise GmbH &amp; Orqaly. All rights reserved. Licensed under Apache 2.0.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <Link href="/privacy-policy" className="hover:text-stone-300">Privacy Policy</Link>
          <Link href="/terms-of-service" className="hover:text-stone-300">Terms of Service</Link>
          <Link href="/impressum" className="hover:text-stone-300">Impressum</Link>
        </div>
      </footer>

    </div>
  );
}
