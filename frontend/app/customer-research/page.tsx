'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/components/research/ChatInterface';
import { SessionManager } from '@/components/research/SessionManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  FileText, 
  Users, 
  Target, 
  ArrowRight,
  ArrowLeft,
  GitBranch,
  Server,
  Activity,
  Check
} from 'lucide-react';

export default function CustomerResearchPage(): React.JSX.Element {
  const [showChat, setShowChat] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Check for session parameter in URL on mount
  useEffect(() => {
    const sessionParam = searchParams?.get('session');
    if (sessionParam) {
      console.log('Loading session from URL:', sessionParam);
      handleLoadSession(sessionParam);
    }
  }, [searchParams]);

  const handleQuestionsGenerated = (_questions: any) => {
    // Questions are handled within the ChatInterface component
  };

  const handleLoadSession = (sessionId: string) => {
    console.log('Page: Loading session', sessionId);
    setCurrentSessionId(sessionId);
    // Ensure we're in chat mode when loading a session
    if (!showChat) {
      setShowChat(true);
    }
  };

  if (showChat) {
    return (
      <div className="min-h-screen bg-background">
        <ChatInterface
          onComplete={handleQuestionsGenerated}
          onBack={() => setShowChat(false)}
          loadSessionId={currentSessionId || undefined}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFAF7] text-[#1C1917] font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* ----------------- Minimal, Premium Header ----------------- */}
      <header className="sticky top-0 z-50 bg-[#FCFAF7]/90 backdrop-blur-md border-b border-[#EAE6DF] px-4 lg:px-8 xl:px-16 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ width: '28px', height: '28px', flexShrink: 0 }}>
              <defs>
                <radialGradient id="o2_logo_cr" cx="40%" cy="40%"><stop offset="0%" stopColor="#34D399" stopOpacity="0.6"></stop><stop offset="100%" stopColor="#064E3B"></stop></radialGradient>
              </defs>
              <circle cx="32" cy="32" r="24" fill="url(#o2_logo_cr)"></circle>
              <circle cx="32" cy="32" r="22" fill="none" stroke="#34D399" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="20 15"></circle>
            </svg>
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}><rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/><path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            <span className="font-serif font-bold text-lg tracking-tight">AxWise</span>
            <span className="text-stone-300 font-light select-none">×</span>
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
            className="hidden lg:inline-flex items-center gap-2 px-3.5 py-1.5 border border-stone-300 rounded-md text-xs font-mono text-stone-700 hover:border-stone-900 hover:text-stone-900 transition-all"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Apache 2.0 OSS
          </a>
          <Link 
            href="/" 
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1C1917] hover:bg-stone-800 text-[#FCFAF7] rounded-md text-xs font-medium tracking-tight transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Main Gate
          </Link>
        </div>
      </header>

      {/* ----------------- Customer Research Area ----------------- */}
      <main className="max-w-7xl mx-auto px-6 lg:px-16 py-16 space-y-12">
        <div className="space-y-4 border-b border-[#EAE6DF] pb-8">
          <h1 className="font-serif text-5xl font-normal tracking-tight text-stone-900">Customer Research Panel</h1>
          <p className="text-sm text-stone-500 font-mono">// Model and test target customer segments with cognitive interviews</p>
        </div>

        {/* Quick Start Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          
          <Card 
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 bg-white border border-[#EAE6DF] rounded-xl p-6 flex flex-col justify-between group" 
            onClick={() => setShowChat(true)}
          >
            <CardHeader className="p-0 space-y-4">
              <CardTitle className="flex items-center gap-3 p-0 text-base font-serif font-bold text-stone-900">
                <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 group-hover:bg-emerald-100 transition-colors">
                  <MessageSquare className="h-5 w-5" />
                </div>
                Start New Research
              </CardTitle>
              <CardDescription className="text-stone-600 text-xs leading-relaxed font-sans">
                Initiate a guided, structural interview cycle with our context assistant to map stakeholder priorities and construct precise questionnaires.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-medium">Interactive Guide</span>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-stone-900 group-hover:translate-x-1 transition-all" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 bg-white border border-[#EAE6DF] rounded-xl p-6 flex flex-col justify-between group" 
            onClick={() => window.location.href = '/unified-dashboard/research'}
          >
            <CardHeader className="p-0 space-y-4">
              <CardTitle className="flex items-center gap-3 p-0 text-base font-serif font-bold text-stone-900">
                <div className="w-9 h-9 bg-stone-100 rounded flex items-center justify-center font-mono text-xs">A+B</div>
                Interactive Simulation
              </CardTitle>
              <CardDescription className="text-stone-600 text-xs leading-relaxed font-sans">
                Deploy customized, psychologically sampled synthetic customer twins to automatically execute conversations and test product strategies.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-medium">AI Sampling</span>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-stone-900 group-hover:translate-x-1 transition-all" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 bg-white border border-[#EAE6DF] rounded-xl p-6 flex flex-col justify-between group" 
            onClick={() => window.location.href = '/unified-dashboard/upload'}
          >
            <CardHeader className="p-0 space-y-4">
              <CardTitle className="flex items-center gap-3 p-0 text-base font-serif font-bold text-stone-900">
                <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 group-hover:bg-emerald-100 transition-colors">
                  <FileText className="h-5 w-5" />
                </div>
                Analyze Transcripts
              </CardTitle>
              <CardDescription className="text-stone-600 text-xs leading-relaxed font-sans">
                Upload raw qualitative user transcripts. Automatically extract goals, tools, and pains with synchronous character-level trace auditing.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-medium">Trace-Audited</span>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-stone-900 group-hover:translate-x-1 transition-all" />
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Sessions Section */}
        <div className="bg-white border border-[#EAE6DF] rounded-xl p-6 shadow-sm">
          <SessionManager onLoadSession={handleLoadSession} />
        </div>

      </main>

      {/* Footer */}
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
