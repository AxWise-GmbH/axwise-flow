'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Mail, 
  MapPin, 
  User, 
  Shield, 
  Info,
  GitBranch,
  Server,
  FileText
} from 'lucide-react';

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-[#FCFAF7] text-[#1C1917] font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* ----------------- Minimal, Premium Header ----------------- */}
      <header className="sticky top-0 z-50 bg-[#FCFAF7]/90 backdrop-blur-md border-b border-[#EAE6DF] px-4 lg:px-8 xl:px-16 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}><rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/><path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            <span className="font-serif font-bold text-lg tracking-tight">AxWise</span>
            <span className="text-stone-300 font-light select-none">×</span>
            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ width: '28px', height: '28px', flexShrink: 0 }}>
              <defs>
                <radialGradient id="o2_logo_imp" cx="40%" cy="40%"><stop offset="0%" stopColor="#34D399" stopOpacity="0.6"></stop><stop offset="100%" stopColor="#064E3B"></stop></radialGradient>
              </defs>
              <circle cx="32" cy="32" r="24" fill="url(#o2_logo_imp)"></circle>
              <circle cx="32" cy="32" r="22" fill="none" stroke="#34D399" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="20 15"></circle>
            </svg>
            <span className="font-sans font-medium text-sm text-stone-500">Orqaly</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-8 text-xs xl:text-sm font-medium text-stone-600">
          <Link href="/#decision-lab" className="hover:text-stone-900 transition-colors">Decision Lab</Link>
          <Link href="/#evidence" className="hover:text-stone-900 transition-colors">Evidence</Link>
          <Link href="/#trust" className="hover:text-stone-900 transition-colors">Trust Boundary</Link>
          <Link href="/#execution" className="hover:text-stone-900 transition-colors">Orqaly Handoff</Link>
          <Link href="/#use-cases" className="hover:text-stone-900 transition-colors">Use Cases</Link>
        </nav>

        <div className="flex items-center gap-3">
          <a 
            href="https://github.com/AxWise-GmbH/axwise-flow-oss"
            target="_blank" 
            rel="noopener noreferrer" 
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 border border-stone-300 rounded-md text-xs font-mono text-stone-700 hover:border-stone-900 hover:text-stone-900 transition-all"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Apache 2.0 OSS
          </a>
          <a 
            href="/docs" 
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1C1917] hover:bg-stone-800 text-[#FCFAF7] rounded-md text-xs font-medium tracking-tight transition-all"
          >
            <Server className="w-3.5 h-3.5" />
            API Docs
          </a>
        </div>
      </header>

      {/* ----------------- Impressum Content ----------------- */}
      <main className="max-w-3xl mx-auto px-6 py-20 space-y-16">
        
        {/* Title */}
        <div className="space-y-4 border-b border-[#EAE6DF] pb-8">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-xs font-mono text-stone-500 hover:text-stone-900 transition-all group"
          >
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            Back to main gate
          </Link>
          <h1 className="font-serif text-5xl font-normal tracking-tight text-stone-900">Impressum</h1>
          <p className="text-sm text-stone-500 font-mono">// Legal disclosure according to § 5 TMG</p>
        </div>

        {/* Legal Grid */}
        <div className="space-y-12">
          
          {/* Angaben */}
          <section className="grid sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">Company Entity</h2>
            </div>
            <div className="sm:col-span-8 bg-white border border-[#EAE6DF] p-6 rounded-lg shadow-sm space-y-2">
              <p className="font-serif text-lg font-semibold text-stone-950">AxWise UG (in formation)</p>
              <div className="text-sm text-stone-600 space-y-1 leading-relaxed">
                <p className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-stone-400 shrink-0" />
                  <span>Aumunder Heerweg 13, 28757 Bremen, Germany</span>
                </p>
                <p className="flex items-center gap-2">
                  <User className="w-4 h-4 text-stone-400 shrink-0" />
                  <span>Represented by: <strong>Vitalijs Visnevskis</strong></span>
                </p>
              </div>
            </div>
          </section>

          {/* Kontakt */}
          <section className="grid sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">Contact</h2>
            </div>
            <div className="sm:col-span-8 bg-white border border-[#EAE6DF] p-6 rounded-lg shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center">
                  <FileText className="w-4 h-4 text-stone-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-stone-900">Email Address</div>
                  <a href="mailto:info@axwise.de" className="text-sm font-mono text-emerald-700 hover:underline">info@axwise.de</a>
                </div>
              </div>
            </div>
          </section>

          {/* Regulatory Audits */}
          <div className="grid lg:grid-cols-12 gap-6 pt-4 border-t border-[#EAE6DF]">
            <div className="lg:col-span-4">
              <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">// LEGAL DISCLAIMERS</span>
            </div>
            <div className="lg:col-span-8 space-y-4 text-xs text-stone-600 leading-relaxed">
              <p>
                <strong>Haftung für Inhalte:</strong> Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
              </p>
              <p>
                <strong>Urheberrecht:</strong> Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
              </p>
            </div>
          </div>

        </div>

      </main>

      {/* ----------------- Minimal Footer ----------------- */}
      <footer className="bg-[#121212] text-stone-500 px-6 lg:px-16 py-8 border-t border-stone-900 text-xs flex flex-wrap justify-between items-center">
        <div>© 2026 AxWise. AxWise Flow is licensed under Apache 2.0.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <Link href="/privacy-policy" className="hover:text-stone-300">Privacy Policy</Link>
          <Link href="/terms-of-service" className="hover:text-stone-300">Terms of Service</Link>
          <Link href="/impressum" className="hover:text-stone-300">Impressum</Link>
        </div>
      </footer>

    </div>
  );
}
