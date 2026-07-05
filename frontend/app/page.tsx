'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal as TerminalIcon, 
  Shield, 
  Coins, 
  Code, 
  GitBranch, 
  Server, 
  ArrowRight, 
  Check, 
  Lock, 
  User, 
  FileText, 
  ChevronRight, 
  Layers, 
  Activity,
  Sparkles,
  Info
} from 'lucide-react';

// ============================================================================
// MOCK DATA FOR INTERACTIVE SHOWCASES
// ============================================================================

interface TwinDetail {
  name: string;
  role: string;
  traits: string;
  background: string;
}

interface Usecase {
  id: string;
  title: string;
  location: string;
  directive: string;
  challenge: string;
  twins: TwinDetail[];
  consoleOutput: Array<{ text: string; type: string }>;
}

const COMPLIANCE_USECASES: Usecase[] = [
  {
    id: 'medtech',
    title: 'MedTech / Healthcare',
    location: 'Munich, Germany',
    directive: 'EU Regulation 2026/977 & Team-NB v4',
    challenge: 'MDR Clinical Evaluation Report (CER) documentation and literature audits.',
    twins: [
      { 
        name: 'Dr. Katharina Weber', 
        role: 'Regulatory Affairs Director', 
        traits: 'Conscientiousness: 0.93, Agreeableness: 0.33',
        background: 'Skep-critical EU MDR expert with 15+ years certifying class III orthopedic implants.'
      },
      { 
        name: 'Lukas Neubert', 
        role: 'Senior Biomedical Systems Architect', 
        traits: 'Openness: 0.75, Extraversion: 0.45',
        background: 'IEC 62304 active lifecycle compliance lead, specializing in automated validation pipelines.'
      }
    ],
    consoleOutput: [
      { text: '[INIT] Initializing MedTech Consilium for EU MDR...', type: 'info' },
      { text: '[SYSTEM] Pre-sampling normal occupational age: Dr. Weber (Mean 48, Std 6) -> Sampled: 46', type: 'system' },
      { text: '[SYSTEM] Sampler adjusted OCEAN: Conscientiousness set to 0.93 based on seniority', type: 'system' },
      { text: '[GROUNDING] Pulling partition "tuv-sud-clinical-guidance-2026"', type: 'grounding' },
      { text: '[CFO_TWIN] Katharina: "We must ensure non-siloed traceability between risk files and clinical trials. No exemptions under Annex VII."', type: 'speech' },
      { text: '[DEV_TWIN] Lukas: "Integrating automatic PDF literature check. Remapping sentences with direct characters to IEC 62304 lifecycle."', type: 'speech' },
      { text: '[SUCCESS] CER Audit completed. All Direct Quotes trace-linked. USD Cost: $0.052', type: 'success' }
    ]
  },
  {
    id: 'fintech',
    title: 'FinTech / Algo-Trading',
    location: 'Frankfurt, Germany',
    directive: 'BaFin MaRisk-Novelle & WpHG § 80',
    challenge: 'Audit-proof real-time parameter tracking and algorithm microsecond logging.',
    twins: [
      { 
        name: 'Dr. Dieter Reinhardt', 
        role: 'Senior Compliance Director', 
        traits: 'Conscientiousness: 0.84, Extraversion: 0.70',
        background: 'Former Bundesbank regulatory auditor, specialized in algorithmic risk controls.'
      },
      { 
        name: 'Lukas Weber', 
        role: 'Senior Quantitative Systems Architect', 
        traits: 'Openness: 0.70, Neuroticism: 0.28',
        background: 'High-frequency C++/Go microsecond optimization engineer, expert in lock-free ring buffers.'
      }
    ],
    consoleOutput: [
      { text: '[INIT] Booting BaFin Compliance Consilium...', type: 'info' },
      { text: '[SYSTEM] Pre-sampling occupational age: Lukas Weber (Mean 33, Std 5) -> Sampled: 34', type: 'system' },
      { text: '[GROUNDING] Pulling partition "marisk-novelle-2026-automated-models"', type: 'grounding' },
      { text: '[RBAC] Validated request for user "d_reinhardt" (Clearance: Compliance Director) -> GRANTED', type: 'rbac' },
      { text: '[CFO_TWIN] Dieter: "BaFin Circular xx/2026 requires complete mathematical explainability. We cannot use un-audited black boxes."', type: 'speech' },
      { text: '[DEV_TWIN] Lukas: "I have configured the non-blocking ring-buffer to write chronologically at millisecond boundaries. Memory allocated."', type: 'speech' },
      { text: '[SUCCESS] MaRisk Audit trail committed. Latency: 12ms. USD Cost: $0.048', type: 'success' }
    ]
  },
  {
    id: 'esg',
    title: 'ESG & Supply Chain',
    location: 'Düsseldorf, Germany',
    directive: 'German Supply Chain Act (LkSG) / BAFA',
    challenge: 'Multi-tier supplier risk mappings and LkSG BAFA audit-proof heatmaps.',
    twins: [
      { 
        name: 'Dr. Carsten Becker', 
        role: 'Head of Global ESG Compliance', 
        traits: 'Conscientiousness: 0.88, Neuroticism: 0.42',
        background: 'Specialized in risk audits of cross-border supply dependencies and BAFA heatmaps.'
      },
      { 
        name: 'Dieter Neumann', 
        role: 'Lead Graph Database Architect', 
        traits: 'Openness: 0.68, Agreeableness: 0.60',
        background: 'Expert in graph cycle detection and tracing multi-tier supplier compliance back to database indices.'
      }
    ],
    consoleOutput: [
      { text: '[INIT] Launching LkSG Supplier Risk Consilium...', type: 'info' },
      { text: '[SYSTEM] Pre-sampling occupational age: Dieter Neumann (Mean 45, Std 5) -> Sampled: 48', type: 'system' },
      { text: '[GROUNDING] Pulling partition "bafa-risk-analysis-prioritization-guidelines"', type: 'grounding' },
      { text: '[COMPLIANCE] Note: public reporting is suspended per 2026 amendments; substantive audits remain ACTIVE', type: 'warning' },
      { text: '[CFO_TWIN] Carsten: "A signed supplier code of conduct is not enough. BAFA demands independent risk analysis of local labor conditions."', type: 'speech' },
      { text: '[DEV_TWIN] Neumann: "Graph database mapped across 6 tiers. Cycle detection enabled. Circular dependencies marked as high-risk."', type: 'speech' },
      { text: '[SUCCESS] LkSG risk map generated. No unresolved circular supplier nodes. USD Cost: $0.045', type: 'success' }
    ]
  },
  {
    id: 'smartgrid',
    title: 'Smart-Grid Utilities',
    location: 'Essen, Germany',
    directive: 'BSI TR-03109 & § 14a EnWG',
    challenge: 'Demand-response load-shifting secure SMGWplus signal control.',
    twins: [
      { 
        name: 'Markus Weber', 
        role: 'Grid Operations Director', 
        traits: 'Conscientiousness: 0.91, Extraversion: 0.50',
        background: 'Decarbonized grid load manager, balancing mass iMSys Smart Meter integrations across networks.'
      },
      { 
        name: 'Jonas Lindner', 
        role: 'Senior IoT Security Architect', 
        traits: 'Openness: 0.72, Neuroticism: 0.30',
        background: 'Certified SMGWplus control protocol designer, specializing in secure EEBUS transmission signals.'
      }
    ],
    consoleOutput: [
      { text: '[INIT] Activating Smart Meter Control Consilium...', type: 'info' },
      { text: '[SYSTEM] Pre-sampling age: Jonas Lindner (Mean 38, Std 4) -> Sampled: 39', type: 'system' },
      { text: '[GROUNDING] Pulling partition "bsi-tr-03109-smart-meter-standards"', type: 'grounding' },
      { text: '[IOT] Initializing SMGWplus software control over secure TLS channel...', type: 'info' },
      { text: '[CFO_TWIN] Markus: "We must drop grid frequency parameters under high municipal loads without manual relays."', type: 'speech' },
      { text: '[DEV_TWIN] Jonas: "Configured direct EEBUS signal dispatch to local energy systems. Security keys verified."', type: 'speech' },
      { text: '[SUCCESS] Load-shaving signal successfully broadcasted to 1,200 grid nodes. USD Cost: $0.038', type: 'success' }
    ]
  }
];

interface TranscriptSentence {
  text: string;
  active: boolean;
  id?: string;
}

interface PersonaInsight {
  value: string;
  linked_id: string;
  quote: string;
  range: string;
}

interface EvidenceJsonSchema {
  name: string;
  archetype: string;
  pain_points: PersonaInsight;
  workflow_tools: PersonaInsight;
  business_impact: PersonaInsight;
}

interface PersonaTraceData {
  id: string;
  name: string;
  role: string;
  avatar: string;
  transcript: TranscriptSentence[];
  json: EvidenceJsonSchema;
}

const TRACE_PERSONAS: PersonaTraceData[] = [
  {
    id: 'lukas',
    name: 'Lukas Weber',
    role: 'Regional Grocery Manager',
    avatar: 'L',
    transcript: [
      { text: "Interviewer: Lukas, how exactly do you handle raw store layout updates right now?", active: false },
      { text: "Lukas: Honestly, it's a completely manual mess.", active: true, id: "manual-mess" },
      { text: "We use Excel sheets to translate visual store designs in Figma into actual ordering volumes in our SAP ERP.", active: true, id: "tools" },
      { text: "But maintaining 45 separate spreadsheets in Excel is incredibly labor-intensive and prone to errors.", active: true, id: "sheets" },
      { text: "If we make one typo, we end up over-ordering by 15% and throwing away fresh bakery goods.", active: true, id: "waste" }
    ],
    json: {
      name: "Lukas Weber",
      archetype: "Regional Grocery Operations Manager",
      pain_points: {
        value: "Maintaining 45 separate spreadsheets in Excel is labor-intensive and prone to version-control errors.",
        linked_id: "sheets",
        quote: "maintaining 45 separate spreadsheets in Excel is incredibly labor-intensive and prone to errors",
        range: "start_char: 150, end_char: 236"
      },
      workflow_tools: {
        value: "Uses Excel, Figma, and SAP ERP to translate store layouts into physical orders.",
        linked_id: "tools",
        quote: "Excel sheets to translate visual store designs in Figma into actual ordering volumes in our SAP ERP",
        range: "start_char: 75, end_char: 172"
      },
      business_impact: {
        value: "Typographical errors lead to a 15% over-ordering rate, causing massive food waste.",
        linked_id: "waste",
        quote: "typo, we end up over-ordering by 15% and throwing away fresh bakery goods",
        range: "start_char: 245, end_char: 318"
      }
    }
  },
  {
    id: 'katharina',
    name: 'Dr. Katharina Weber',
    role: 'MedTech Director',
    avatar: 'K',
    transcript: [
      { text: "Interviewer: Dr. Weber, how is your team compiling the technical files under EU MDR?", active: false },
      { text: "Katharina: It requires navigating multiple disjointed clinical evaluation databases.", active: true, id: "medtech-databases" },
      { text: "Our regulatory files are built on top of Annex VII checklists that we fill out by hand.", active: true, id: "checklists" },
      { text: "If there is any gap between our design hazard file and the trial data, the Notified Body rejects us.", active: true, id: "rejection" },
      { text: "This delays our Class III orthopedic implant rollout by 90 days, costing us thousands daily.", active: true, id: "costs" }
    ],
    json: {
      name: "Dr. Katharina Weber",
      archetype: "MedTech Regulatory Affairs Director",
      pain_points: {
        value: "Compiling MDR files requires manually navigating disjointed clinical evaluation databases.",
        linked_id: "medtech-databases",
        quote: "navigating multiple disjointed clinical evaluation databases",
        range: "start_char: 88, end_char: 142"
      },
      workflow_tools: {
        value: "Builds technical compliance files on top of manual Annex VII checklists.",
        linked_id: "checklists",
        quote: "regulatory files are built on top of Annex VII checklists that we fill out by hand",
        range: "start_char: 155, end_char: 234"
      },
      business_impact: {
        value: "Any documentation gap results in Notified Body rejection, causing a 90-day delay.",
        linked_id: "rejection",
        quote: "gap between our design hazard file and the trial data, the Notified Body rejects us",
        range: "start_char: 245, end_char: 326"
      }
    }
  },
  {
    id: 'clara',
    name: 'Clara Dubois',
    role: 'Lead UX Design Twin',
    avatar: 'C',
    transcript: [
      { text: "Interviewer: Clara, how do you handle user onboarding tests for international markets?", active: false },
      { text: "Clara: Our translation loop is incredibly brittle.", active: true, id: "brittle-loop" },
      { text: "We have to copy JSON keys from local resource bundles and manually paste them into Figma blocks.", active: true, id: "figma-paste" },
      { text: "When localized French strings are 30% longer, the layout overflows, completely breaking the signup flow.", active: true, id: "overflows" },
      { text: "This drops our day-1 trial conversion rates by up to 22% in European regions.", active: true, id: "conversions" }
    ],
    json: {
      name: "Clara Dubois",
      archetype: "Lead UX Design Architect",
      pain_points: {
        value: "Brittle internationalization translation loop that relies on manually copying keys.",
        linked_id: "brittle-loop",
        quote: "Our translation loop is incredibly brittle",
        range: "start_char: 80, end_char: 122"
      },
      workflow_tools: {
        value: "Copies raw JSON keys from resource bundles to style localized Figma templates.",
        linked_id: "figma-paste",
        quote: "copy JSON keys from local resource bundles and manually paste them into Figma blocks",
        range: "start_char: 135, end_char: 218"
      },
      business_impact: {
        value: "Layout overflows on longer translations cause signup flows to fail, dropping conversions by 22%.",
        linked_id: "overflows",
        quote: "localized French strings are 30% longer, the layout overflows, completely breaking the signup",
        range: "start_char: 228, end_char: 320"
      }
    }
  },
  {
    id: 'marcus',
    name: 'Marcus Chen',
    role: 'Senior Security Lead',
    avatar: 'M',
    transcript: [
      { text: "Interviewer: Marcus, what are the primary hurdles you face during server auditing?", active: false },
      { text: "Marcus: We are swamped with un-auditable, temporary execution containers.", active: true, id: "containers" },
      { text: "We try to enforce strict RBAC policies manually across our Kubernetes clusters.", active: true, id: "policies" },
      { text: "But without a central gateway, tracing which container made which unauthorized API call is impossible.", active: true, id: "tracing" },
      { text: "A single security posture leak can expose private HSM keys, failing our compliance reviews.", active: true, id: "leaks" }
    ],
    json: {
      name: "Marcus Chen",
      archetype: "Senior Security & Systems Engineer",
      pain_points: {
        value: "Too many temporary execution containers that cannot be tracked or audited systematically.",
        linked_id: "containers",
        quote: "swamped with un-auditable, temporary execution containers",
        range: "start_char: 82, end_char: 138"
      },
      workflow_tools: {
        value: "Enforces RBAC policies manually across distinct Kubernetes clusters.",
        linked_id: "policies",
        quote: "enforce strict RBAC policies manually across our Kubernetes clusters",
        range: "start_char: 148, end_char: 214"
      },
      business_impact: {
        value: "API call tracing failures risk exposing private HSM keys and failing annual audits.",
        linked_id: "tracing",
        quote: "tracing which container made which unauthorized API call is impossible",
        range: "start_char: 225, end_char: 295"
      }
    }
  }
];

// ============================================================================
// BRAND NEW LANDING PAGE COMPONENT
// ============================================================================

export default function RedesignedHomePage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<string>('medtech');
  const [consoleLogs, setConsoleLogs] = useState<Array<{ text: string; type: string }>>([]);
  const [logIndex, setLogIndex] = useState<number>(0);
  const [hoveredJsonId, setHoveredJsonId] = useState<string | null>(null);
  
  // Selected Persona for the Evidence Highlighter (Traceability)
  const [activeTracePersona, setActiveTracePersona] = useState<string>('lukas');

  // Gateway active tab selection for the carousel
  const [gatewayTab, setGatewayTab] = useState<'simulate' | 'parse' | 'rbac'>('simulate');

  // Selected state for the brand-new digital twins action showcase (representing slides 10-13)
  const [twinsTab, setTwinsTab] = useState<'cfo' | 'rbac_gov' | 'designer' | 'bpmn'>('cfo');

  // CLI State
  const [cliUser, setCliUser] = useState<'marcus' | 'veronika'>('marcus');
  const [cliCommand, setCliCommand] = useState<string>('cat finance/salary_ledger_2026.xlsx');
  const [cliLogs, setCliLogs] = useState<string[]>([]);
  const [isCliRunning, setIsCliRunning] = useState<boolean>(false);

  // Terminal Stream Effect for the active usecase
  useEffect(() => {
    const activeCase = COMPLIANCE_USECASES.find(c => c.id === activeTab);
    if (!activeCase) return;
    
    setConsoleLogs([activeCase.consoleOutput[0]]);
    setLogIndex(1);
    
    let currentIndex = 1;
    
    const interval = setInterval(() => {
      if (currentIndex < activeCase.consoleOutput.length) {
        const nextLog = activeCase.consoleOutput[currentIndex];
        setConsoleLogs(logs => [...logs, nextLog]);
        currentIndex++;
        setLogIndex(currentIndex);
      } else {
        clearInterval(interval);
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [activeTab]);

  // Execute CLI Command
  const runCliCommand = () => {
    setIsCliRunning(true);
    
    const initialLog = `$ [USER: ${cliUser === 'marcus' ? 'marcus_chen_dev' : 'veronika_horvat_cfo'}] Executing: ${cliCommand}`;
    setCliLogs([initialLog]);
    
    const logs = [
      `[GATEWAY] Routing request to Policy Engine...`,
      `[GATEWAY] Identity mapped to role: ${cliUser === 'marcus' ? 'Developer (Internal Hire)' : 'Chief Financial Officer (Executive)'}`,
      `[RBAC] Evaluating rule: 'read_secured_resource' on resource '${cliCommand.split(' ').pop()}'...`
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < logs.length) {
        const nextLine = logs[index];
        setCliLogs(prev => [...prev, nextLine]);
        index++;
      } else {
        clearInterval(interval);
        
        // Final evaluation output based on role and command
        const isSalaryLedger = cliCommand.includes('salary_ledger');
        
        if (cliUser === 'marcus') {
          if (isSalaryLedger) {
            setCliLogs(prev => [
              ...prev,
              `[ACCESS DENIED] User 'marcus_chen_dev' does not have Finance-tier clearance. Required role: CFO or Executive.`,
              `[AUDIT] SECURE LOG GENERATED: Threat Vector committed to block 40228. Status: BLOCKED.`
            ]);
          } else {
            setCliLogs(prev => [
              ...prev,
              `[ACCESS GRANTED] User 'marcus_chen_dev' has read access to research partition.`,
              `[SUCCESS] Opening 'research/customer_transcripts_bremen.txt'...`,
              `--- Content snippet ---`,
              `"Lukas: Honestly, it's a completely manual mess. We use Excel spreadsheets..."`
            ]);
          }
        } else {
          // CFO has access to everything
          if (isSalaryLedger) {
            setCliLogs(prev => [
              ...prev,
              `[ACCESS GRANTED] Decrypting file keys using Session Private HSM...`,
              `[SUCCESS] File decrypted successfully. Retrieval cost: $0.024.`,
              `--- Ledgers ---`,
              `Lukas Beckmann (Lead Engineer): €115,000 / year`,
              `Dennis Kruse (Fleet Coordinator): €78,000 / year`
            ]);
          } else {
            setCliLogs(prev => [
              ...prev,
              `[ACCESS GRANTED] Opening 'research/customer_transcripts_bremen.txt'...`,
              `--- Content snippet ---`,
              `"Lukas: Honestly, it's a completely manual mess. We use Excel spreadsheets..."`
            ]);
          }
        }
        setIsCliRunning(false);
      }
    }, 600);
  };

  // Get current active trace persona details
  const selectedPersona = TRACE_PERSONAS.find(p => p.id === activeTracePersona) || TRACE_PERSONAS[0];

  return (
    <div className="min-h-screen bg-[#FCFAF7] text-[#1C1917] font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* ----------------- Minimal, Premium Header ----------------- */}
      <header className="sticky top-0 z-50 bg-[#FCFAF7]/90 backdrop-blur-md border-b border-[#EAE6DF] px-4 lg:px-8 xl:px-16 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ width: '28px', height: '28px', flexShrink: 0 }}>
              <defs>
                <radialGradient id="o2_logo" cx="40%" cy="40%"><stop offset="0%" stopColor="#34D399" stopOpacity="0.6"></stop><stop offset="100%" stopColor="#064E3B"></stop></radialGradient>
              </defs>
              <circle cx="32" cy="32" r="24" fill="url(#o2_logo)"></circle>
              <circle cx="32" cy="32" r="22" fill="none" stroke="#34D399" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="20 15"></circle>
            </svg>
            <span className="font-sans font-medium text-sm text-stone-500">Orqaly</span>
            <span className="text-stone-300 font-light select-none">×</span>
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}><rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/><path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            <span className="font-serif font-bold text-lg tracking-tight">AxWise</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-8 text-xs xl:text-sm font-medium text-stone-600">
          <a href="#consilium" className="hover:text-stone-900 transition-colors">Consilium Sandbox</a>
          <a href="#traceability" className="hover:text-stone-900 transition-colors">Traceability</a>
          <a href="#policy" className="hover:text-stone-900 transition-colors">RBAC Gateway</a>
          <a href="#twins" className="hover:text-stone-900 transition-colors">Digital Twins</a>
          <a href="#compliance" className="hover:text-stone-900 transition-colors">Use Cases</a>
        </nav>

        <div className="flex items-center gap-3">
          <a 
            href="https://github.com/AxWise-GmbH/Flow" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hidden lg:inline-flex items-center gap-2 px-3.5 py-1.5 border border-stone-300 rounded-md text-xs font-mono text-stone-700 hover:border-stone-900 hover:text-stone-900 transition-all"
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

      {/* ----------------- Hero Section: Deep trust ----------------- */}
      <section className="px-6 lg:px-16 pt-20 pb-28 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Core Message */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-800">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>AxWise &amp; Orqaly Merger: From qualitative UX personas to trace-linked corporate twins.</span>
            </div>

            <h1 className="font-serif text-5xl md:text-6xl font-normal leading-[1.1] tracking-tight text-stone-900">
              Your operations, <em className="italic">encoded</em>.<br />
              Your decisions, <span className="underline decoration-emerald-500/40 decoration-2 underline-offset-8">audited</span>.
            </h1>

            <p className="text-lg text-stone-600 max-w-xl leading-relaxed">
              AxWise Flow has pivoted from legacy qualitative design-thinking SaaS into a developer-first, self-hosted{' '}
              <strong className="font-semibold text-stone-900">headless REST API engine</strong>. Coupled with Orqaly’s Agentic OS, you can instantiate psychologically grounded{' '}
              <strong className="font-semibold text-stone-900">Sovereign Digital Twins</strong> that execute operational processes inside secure, audited environments.
            </p>

            {/* Quick-install panel */}
            <div className="bg-[#1A1A1A] text-stone-300 rounded-lg p-4 font-mono text-sm border border-stone-800 shadow-lg max-w-md">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-stone-800">
                <span className="text-xs text-stone-500">Self-Hosted Terminal Setup</span>
                <span className="flex gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-stone-700"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-stone-700"></span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#10B981] select-none mr-2">$</span>
                <span className="flex-1 text-stone-200">pip install axwise-flow-oss</span>
                <button 
                  onClick={() => {
                    if (navigator?.clipboard) {
                      navigator.clipboard.writeText('pip install axwise-flow-oss');
                    }
                  }}
                  className="hover:text-white transition-colors p-1"
                  title="Copy command"
                >
                  <Code className="w-4 h-4 text-stone-500 hover:text-stone-300" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-4">
              <a 
                href="#consilium"
                className="px-6 py-3 bg-[#1C1917] hover:bg-stone-800 text-[#FCFAF7] rounded-md font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
              >
                Launch Sandbox Preview
                <ChevronRight className="w-4 h-4" />
              </a>
              <a 
                href="https://github.com/AxWise-GmbH/Flow" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-6 py-3 border border-stone-300 hover:border-stone-500 rounded-md font-medium text-sm text-stone-700 hover:text-stone-900 transition-all"
              >
                Explore GitHub Repository
              </a>
            </div>
          </div>

          {/* Right Column: Visual Dashboard Preview with Carousel/Tabs */}
          <div className="lg:col-span-5 bg-white border border-[#EAE6DF] rounded-xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[580px]">
            <div className="absolute inset-0 bg-gradient-to-tr from-stone-50/10 via-emerald-50/5 to-stone-50/10 pointer-events-none" />
            
            <div>
              <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs font-mono font-medium text-stone-500 uppercase tracking-wider">AxWise Gateway</span>
                </div>
                <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-medium">FastAPI v2.4</span>
              </div>

              {/* Miniature Tab Selection/Carousel */}
              <div className="flex border-b border-stone-100 pb-3 mb-4 gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setGatewayTab('simulate')}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono transition-all whitespace-nowrap ${
                    gatewayTab === 'simulate'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  1. Simulate Twin
                </button>
                <button
                  onClick={() => setGatewayTab('parse')}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono transition-all whitespace-nowrap ${
                    gatewayTab === 'parse'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  2. Parse &amp; Trace
                </button>
                <button
                  onClick={() => setGatewayTab('rbac')}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono transition-all whitespace-nowrap ${
                    gatewayTab === 'rbac'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  3. Secured Query
                </button>
              </div>

              <AnimatePresence mode="wait">
                {gatewayTab === 'simulate' && (
                  <motion.div
                    key="simulate"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4 font-mono text-xs"
                  >
                    <div className="bg-stone-50 p-3 rounded border border-stone-100 space-y-1">
                      <div className="text-stone-400 mb-1 flex items-center justify-between text-[10px]">
                        <span>// API INBOUND RESOLUTION</span>
                        <span className="text-emerald-700 font-semibold bg-emerald-100/60 px-1 rounded">E2E COGNITIVE ROUTINE</span>
                      </div>
                      <div className="text-[#1C1917] font-semibold">POST /api/research/simulation-bridge/simulate-enhanced</div>
                      <p className="text-[10px] text-stone-500 font-sans leading-normal">
                        Launches a closed-loop empirical run. Spawns occupational twins, conducts automatic multi-turn simulated interviews, and outputs grounded trace records in a single self-hosted server roundtrip.
                      </p>
                    </div>

                    <div className="space-y-2 border-l-2 border-emerald-500 pl-3">
                      <div className="flex items-center justify-between text-stone-500 text-[10px]">
                        <span>GAUSSIAN SAMPLING ENGINE</span>
                        <span>CONFIDENCE: 98.4%</span>
                      </div>
                      <div className="text-stone-800 leading-normal">
                        - Target: <strong className="text-stone-900">CFO (Veronika Horvat)</strong><br />
                        - Standard Age Distribution: <span className="text-emerald-700">Mean 48.0, Std 6.0</span><br />
                        - Evaluated Age: <strong className="text-[#10B981]">45.2 Years Old</strong><br />
                        - Modulated OCEAN: <span className="text-stone-600">Conscientiousness +18.4%</span>
                        <p className="text-[10px] text-stone-500 font-sans mt-1">
                          Calculates specific age and psychographic normal distributions corresponding to corporate hierarchy baselines, filtering out user bias.
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#1A1A1A] p-3 rounded text-[11px] leading-relaxed shadow border border-stone-800 space-y-1.5">
                      <div className="text-stone-500 text-[9px] font-mono flex items-center justify-between border-b border-stone-800 pb-1.5 mb-1.5">
                        <span>// STRUCTURED COMPLIANCE RETURN</span>
                        <span className="text-emerald-400">SUCCESS CODE 200</span>
                      </div>
                      <div className="text-stone-400">
                        <span className="text-[#10B981]">{"{"}</span><br />
                        &nbsp;&nbsp;<span className="text-stone-300">"status"</span>: <span className="text-emerald-400">"success"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"audit_trail_block"</span>: <span className="text-emerald-400">"0x42f88b"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"total_token_burn"</span>: <span className="text-emerald-400">4811</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"compliance_flags"</span>: <span className="text-[#10B981]">["EU-AI-ACT-SECURE", "BAFIN-LOG-OK"]</span><br />
                        <span className="text-[#10B981]">{"}"}</span>
                      </div>
                      <p className="text-[10px] text-stone-400 font-sans leading-normal">
                        Commits output parameters to local databases with secure hash signatures, facilitating cryptographically verifiable compliance reporting.
                      </p>
                    </div>
                  </motion.div>
                )}

                {gatewayTab === 'parse' && (
                  <motion.div
                    key="parse"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4 font-mono text-xs"
                  >
                    <div className="bg-stone-50 p-3 rounded border border-stone-100 space-y-1">
                      <div className="text-stone-400 mb-1 flex items-center justify-between text-[10px]">
                        <span>// API INBOUND RESOLUTION</span>
                        <span className="text-blue-700 font-semibold bg-blue-50 px-1 rounded">DETERMINISTIC EXTRACTION</span>
                      </div>
                      <div className="text-[#1C1917] font-semibold">POST /api/research/parse-evidence</div>
                      <p className="text-[10px] text-stone-500 font-sans leading-normal">
                        Extracts goals, pain points, and workflows from voice-to-text audio streams. Maps all extracted properties back to exact quote boundaries to block AI hallucinations.
                      </p>
                    </div>

                    <div className="space-y-2 border-l-2 border-blue-500 pl-3">
                      <div className="flex items-center justify-between text-stone-500 text-[10px]">
                        <span>CHARACTER-OFFSET REMAPPING</span>
                        <span>CONFIDENCE: 100%</span>
                      </div>
                      <div className="text-stone-800 leading-normal">
                        - Target Trace Index: <strong className="text-stone-900">pain_points.sheets</strong><br />
                        - Mapped Phrase: <span className="text-blue-700">"maintaining 45 spreadsheets..."</span><br />
                        - Bounding Box: <strong className="text-[#10B981]">start_char: 150, end_char: 236</strong><br />
                        - Adaptive Correction: <span className="text-stone-600">"Mirrorboards" -&gt; "Miro"</span>
                        <p className="text-[10px] text-stone-500 font-sans mt-1">
                          Traces structural statements back to character offsets inside source documents and standardizes verbal stutters or fuzzy system terms.
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#1A1A1A] p-3 rounded text-[11px] leading-relaxed shadow border border-stone-800 space-y-1.5">
                      <div className="text-stone-500 text-[9px] font-mono flex items-center justify-between border-b border-stone-800 pb-1.5 mb-1.5">
                        <span>// CHARACTER BOUND PROPS RETURN</span>
                        <span className="text-blue-400">SUCCESS CODE 200</span>
                      </div>
                      <div className="text-stone-400">
                        <span className="text-blue-400">{"{"}</span><br />
                        &nbsp;&nbsp;<span className="text-stone-300">"status"</span>: <span className="text-blue-400">"resolved"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"evidence_mappings"</span>: <span className="text-blue-400">14</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"quote_character_trace"</span>: <span className="text-blue-400">"start: 150, end: 236"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"tool_fuzzy_corrections"</span>: <span className="text-[#10B981]">{"[{\"raw\": \"Mirrorboards\", \"resolved\": \"Miro\"}]"}</span><br />
                        <span className="text-blue-400">{"}"}</span>
                      </div>
                      <p className="text-[10px] text-stone-400 font-sans leading-normal">
                        Returns clear character indexes for front-end highlight synchronization, ensuring data audits have absolute direct quotes.
                      </p>
                    </div>
                  </motion.div>
                )}

                {gatewayTab === 'rbac' && (
                  <motion.div
                    key="rbac"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4 font-mono text-xs"
                  >
                    <div className="bg-stone-50 p-3 rounded border border-stone-100 space-y-1">
                      <div className="text-stone-400 mb-1 flex items-center justify-between text-[10px]">
                        <span>// API INBOUND RESOLUTION</span>
                        <span className="text-purple-700 font-semibold bg-purple-50 px-1 rounded">SECURE CONTEXT GATING</span>
                      </div>
                      <div className="text-[#1C1917] font-semibold">POST /api/security/query-vault</div>
                      <p className="text-[10px] text-stone-500 font-sans leading-normal">
                        Validates the user's role and identity, checking budget boundaries and permission policies before allowing context injection to the digital twin.
                      </p>
                    </div>

                    <div className="space-y-2 border-l-2 border-purple-500 pl-3">
                      <div className="flex items-center justify-between text-stone-500 text-[10px]">
                        <span>POLICY ENGINE</span>
                        <span>STATUS: AUDITED</span>
                      </div>
                      <div className="text-stone-800 leading-normal">
                        - Requested File: <strong className="text-stone-900">finance/salary_ledger_2026.xlsx</strong><br />
                        - Active Identity: <span className="text-purple-700">marcus_chen_dev (Role: Developer)</span><br />
                        - Required Clearance: <strong className="text-red-600">Finance-Tier-1</strong><br />
                        - Policy Evaluation: <strong className="text-red-500">BLOCKED (Insufficient Permissions)</strong>
                        <p className="text-[10px] text-stone-500 font-sans mt-1">
                          Automatically checks context requests against organization-wide permission layers, preventing LLM document prompt injection breaches.
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#1A1A1A] p-3 rounded text-[11px] leading-relaxed shadow border border-stone-800 space-y-1.5">
                      <div className="text-stone-500 text-[9px] font-mono flex items-center justify-between border-b border-stone-800 pb-1.5 mb-1.5">
                        <span>// BLOCK LOG RETURN</span>
                        <span className="text-red-400">ACCESS DENIED 403</span>
                      </div>
                      <div className="text-stone-400">
                        <span className="text-purple-400">{"{"}</span><br />
                        &nbsp;&nbsp;<span className="text-stone-300">"status"</span>: <span className="text-red-400">"denied"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"user"</span>: <span className="text-red-400">"marcus_chen_dev"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"cleared_permissions"</span>: <span className="text-red-400">["Dev-Tier-2"]</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"audit_trail"</span>: <span className="text-purple-400">"committed-to-block-40228"</span><br />
                        <span className="text-purple-400">{"}"}</span>
                      </div>
                      <p className="text-[10px] text-stone-400 font-sans leading-normal">
                        Blocks unauthorized access at the API layer and commits the security event signature to the system trace ledger.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </section>

      {/* ----------------- Showcase 1: Consilium Control Room ----------------- */}
      <section id="consilium" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// INTERACTIVE PIPELINE DEMO</span>
          <h2 className="font-serif text-4xl text-stone-900">The Consilium Control Room</h2>
          <p className="text-stone-600 text-sm">
            Watch how our multi-agent council (Consilium) decomposes business goals, schedules parallel 
            simulation pathways, and structures decisions under strict environmental and budget caps.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {COMPLIANCE_USECASES.map((usecase) => (
            <button
              key={usecase.id}
              onClick={() => setActiveTab(usecase.id)}
              className={`px-5 py-2.5 rounded-md font-medium text-xs transition-all ${
                activeTab === usecase.id
                  ? 'bg-[#1C1917] text-[#FCFAF7] shadow-sm'
                  : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'
              }`}
            >
              {usecase.title}
            </button>
          ))}
        </div>

        {/* Console & Twins Board */}
        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Usecase Description & Digital Twins */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-[#EAE6DF] p-6 rounded-lg shadow-sm space-y-4">
              <div>
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">ACTIVE USECASE</span>
                <h3 className="font-serif text-xl text-stone-900 mt-1">
                  {COMPLIANCE_USECASES.find(c => c.id === activeTab)?.title}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>{COMPLIANCE_USECASES.find(c => c.id === activeTab)?.location}</span>
                </div>
              </div>

              <div className="p-3 bg-stone-50 rounded border border-stone-100 text-xs text-stone-700 leading-relaxed">
                <strong>Compliance Target:</strong> {COMPLIANCE_USECASES.find(c => c.id === activeTab)?.directive}
                <p className="mt-2 text-stone-600">{COMPLIANCE_USECASES.find(c => c.id === activeTab)?.challenge}</p>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">GROUNDED RECRUITED TWINS</span>
                {COMPLIANCE_USECASES.find(c => c.id === activeTab)?.twins.map((twin, idx) => (
                  <div key={idx} className="flex gap-3 items-start border border-[#EAE6DF] p-3.5 rounded hover:border-emerald-300 hover:bg-emerald-50/5 transition-all">
                    <div className="w-9 h-9 bg-[#1A1A1A] text-white rounded-full flex items-center justify-center font-mono text-xs font-semibold shadow-sm">
                      {twin.name.split(' ').pop()?.charAt(0)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-stone-900">{twin.name}</div>
                        <span className="text-[9px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded">OCEAN Grounded</span>
                      </div>
                      <div className="text-[10px] text-stone-500 font-medium">{twin.role}</div>
                      <div className="text-[10px] text-stone-600 leading-normal bg-stone-50 p-2 rounded border border-stone-100 italic">{twin.background}</div>
                      <div className="text-[9px] font-mono text-emerald-700 font-medium bg-emerald-50/50 p-1.5 rounded flex items-center gap-1">
                        <Activity className="w-3 h-3 text-emerald-600" />
                        <span>Traits: {twin.traits}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Simulated Terminal Outputs */}
          <div className="lg:col-span-7 flex flex-col h-[420px] bg-[#1A1A1A] border border-stone-800 rounded-lg overflow-hidden shadow-lg font-mono text-xs text-stone-300">
            <div className="bg-[#1F1F1F] px-4 py-3 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-4 h-4 text-[#10B981]" />
                <span className="text-stone-400">Live Agent Council Trace Logs</span>
              </div>
              <div className="flex gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/80"></span>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 leading-relaxed">
              <AnimatePresence initial={false}>
                {consoleLogs.map((log, index) => {
                  let colorClass = 'text-stone-300';
                  if (log.type === 'info') colorClass = 'text-stone-400';
                  if (log.type === 'system') colorClass = 'text-emerald-400/90';
                  if (log.type === 'grounding') colorClass = 'text-blue-400';
                  if (log.type === 'rbac') colorClass = 'text-purple-400';
                  if (log.type === 'warning') colorClass = 'text-yellow-400';
                  if (log.type === 'speech') colorClass = 'text-[#FCFAF7] border-l border-emerald-500 pl-2 font-sans';
                  if (log.type === 'success') colorClass = 'text-[#10B981] font-bold bg-emerald-950/20 p-2 rounded border border-emerald-900/30';
                  
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={colorClass}
                    >
                      {log.text}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            
            <div className="bg-[#1F1F1F] p-3 text-[10px] text-stone-500 border-t border-stone-800 flex justify-between items-center">
              <span>Streaming sequence {logIndex}/{COMPLIANCE_USECASES.find(c => c.id === activeTab)?.consoleOutput.length}</span>
              <span className="text-emerald-500 animate-pulse">● System Processing</span>
            </div>
          </div>

        </div>
      </section>

      {/* ----------------- Showcase 2: Traceability & Evidence ----------------- */}
      <section id="traceability" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          
          {/* Content Explanation */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// DETERMINISTIC GROUNDING</span>
            <h2 className="font-serif text-4xl text-stone-900 leading-tight">0% Hallucination Index Mapping</h2>
            <p className="text-stone-600 text-sm leading-relaxed">
              Every persona goal, challenge, and tool mention parsed by our engine is trace-verified back to source 
              documents using character-level offset linking. Select one of our <strong>4 Grounded Personas</strong> below, 
              then hover over any extracted property on the right to see its exact source quote highlight dynamically 
              in the raw audio-to-text transcript on the left.
            </p>

            {/* Persona Selectors (At least 4 Personas) */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-stone-500 uppercase tracking-wider block">Grounded Persona Dataset</label>
              <div className="grid grid-cols-2 gap-2">
                {TRACE_PERSONAS.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => {
                      setActiveTracePersona(persona.id);
                      setHoveredJsonId(null);
                    }}
                    className={`p-2.5 rounded border text-left flex items-center gap-2 transition-all min-w-0 ${
                      activeTracePersona === persona.id
                        ? 'border-stone-900 bg-white ring-1 ring-stone-900'
                        : 'border-stone-200 bg-stone-50/50 hover:border-stone-400'
                    }`}
                  >
                    <div className="w-6 h-6 bg-stone-900 text-white rounded-full flex items-center justify-center font-mono text-[10px] font-semibold flex-shrink-0">
                      {persona.avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-stone-900 leading-tight">{persona.name}</div>
                      <div className="text-[9px] text-stone-500 leading-tight whitespace-normal break-words">{persona.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-xs pt-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#10B981]" />
                <span>Synchronous sentence-to-sentence token bounding</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#10B981]" />
                <span>Deterministic start_char / end_char indexes</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#10B981]" />
                <span>Adaptive Tool correction (Voice-to-Text standardizing)</span>
              </div>
            </div>
          </div>

          {/* Interactive Panel */}
          <div className="lg:col-span-7 grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] rounded-xl p-6 shadow-sm overflow-hidden">
            
            {/* Raw Transcript (Left) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">Raw Interview Transcript</span>
                <span className="text-xs font-mono text-stone-400">doc_transcript_{selectedPersona.id}</span>
              </div>
              <div className="space-y-3 text-xs leading-relaxed text-stone-600 max-h-[300px] overflow-y-auto pr-2">
                {selectedPersona.transcript.map((sentence, idx) => {
                  let isHighlighted = false;
                  if (hoveredJsonId && hoveredJsonId in selectedPersona.json) {
                    const insight = selectedPersona.json[hoveredJsonId as keyof EvidenceJsonSchema] as PersonaInsight;
                    isHighlighted = insight.linked_id === sentence.id;
                  }
                  return (
                    <p 
                      key={idx} 
                      className={`transition-all duration-300 p-1.5 rounded ${
                        isHighlighted 
                          ? 'bg-emerald-50 text-emerald-950 font-medium border-l-2 border-emerald-500 pl-2 shadow-sm' 
                          : 'opacity-70'
                      }`}
                    >
                      {sentence.text}
                    </p>
                  );
                })}
              </div>
            </div>

            {/* Structured JSON Output (Right) */}
            <div className="border-t md:border-t-0 md:border-l border-stone-200 md:pl-6 pt-6 md:pt-0 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">ProductionPersona [JSON]</span>
                <span className="text-xs font-mono text-stone-400">Pydantic Model</span>
              </div>

              <div className="space-y-3">
                <div className="bg-stone-50 p-2 rounded">
                  <div className="text-[10px] text-stone-400">NAME</div>
                  <div className="text-xs font-semibold">{selectedPersona.json.name}</div>
                </div>

                {/* Pain Points Property */}
                <div 
                  onMouseEnter={() => setHoveredJsonId('pain_points')}
                  onMouseLeave={() => setHoveredJsonId(null)}
                  className={`p-2.5 rounded border transition-all cursor-pointer ${
                    hoveredJsonId === 'pain_points' 
                      ? 'border-emerald-300 bg-emerald-50/20 shadow-sm animate-pulse' 
                      : 'border-stone-100 bg-stone-50 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-emerald-800 font-semibold tracking-wider">PAIN_POINTS</span>
                    <span className="text-[9px] font-mono text-stone-400">{selectedPersona.json.pain_points.range}</span>
                  </div>
                  <div className="text-[11px] text-stone-800 font-medium mt-1 leading-snug">{selectedPersona.json.pain_points.value}</div>
                </div>

                {/* Workflow Tools Property */}
                <div 
                  onMouseEnter={() => setHoveredJsonId('workflow_tools')}
                  onMouseLeave={() => setHoveredJsonId(null)}
                  className={`p-2.5 rounded border transition-all cursor-pointer ${
                    hoveredJsonId === 'workflow_tools' 
                      ? 'border-emerald-300 bg-emerald-50/20 shadow-sm animate-pulse' 
                      : 'border-stone-100 bg-stone-50 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-emerald-800 font-semibold tracking-wider">WORKFLOW_TOOLS</span>
                    <span className="text-[9px] font-mono text-stone-400">{selectedPersona.json.workflow_tools.range}</span>
                  </div>
                  <div className="text-[11px] text-stone-800 font-medium mt-1 leading-snug">{selectedPersona.json.workflow_tools.value}</div>
                </div>

                {/* Business Impact Property */}
                <div 
                  onMouseEnter={() => setHoveredJsonId('business_impact')}
                  onMouseLeave={() => setHoveredJsonId(null)}
                  className={`p-2.5 rounded border transition-all cursor-pointer ${
                    hoveredJsonId === 'business_impact' 
                      ? 'border-emerald-300 bg-emerald-50/20 shadow-sm animate-pulse' 
                      : 'border-stone-100 bg-stone-50 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-emerald-800 font-semibold tracking-wider">BUSINESS_IMPACT</span>
                    <span className="text-[9px] font-mono text-stone-400">{selectedPersona.json.business_impact.range}</span>
                  </div>
                  <div className="text-[11px] text-stone-800 font-medium mt-1 leading-snug">{selectedPersona.json.business_impact.value}</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ----------------- Showcase 3: RBAC CLI Sandbox ----------------- */}
      <section id="policy" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// POLICY GATING &amp; SECURITY</span>
          <h2 className="font-serif text-4xl text-stone-900">Zero-Trust Role Policy Gateway</h2>
          <p className="text-stone-600 text-sm">
            Configure hard budget boundaries and granular data clearance rules. Test the RBAC engine below to see 
            how corporate policy filters evaluate data retrieval actions based on identity roles.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-center">
          
          {/* Selector Interface */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-[#EAE6DF] p-6 rounded-lg space-y-5">
              <div>
                <label className="text-xs font-mono text-stone-500 uppercase tracking-wider block mb-2">Select User Identity Profile</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setCliUser('marcus');
                      setCliLogs([]);
                    }}
                    className={`p-3 rounded border text-left flex gap-2.5 items-center transition-all ${
                      cliUser === 'marcus' 
                        ? 'border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500' 
                        : 'border-stone-200 hover:border-stone-400 bg-stone-50/30'
                    }`}
                  >
                    <User className="w-4 h-4 text-stone-500" />
                    <div>
                      <div className="text-xs font-semibold text-stone-900">Marcus Chen</div>
                      <div className="text-[10px] text-stone-500 font-mono">Role: Developer</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setCliUser('veronika');
                      setCliLogs([]);
                    }}
                    className={`p-3 rounded border text-left flex gap-2.5 items-center transition-all ${
                      cliUser === 'veronika' 
                        ? 'border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500' 
                        : 'border-stone-200 hover:border-stone-400 bg-stone-50/30'
                    }`}
                  >
                    <User className="w-4 h-4 text-[#10B981]" />
                    <div>
                      <div className="text-xs font-semibold text-stone-900">Veronika Horvat</div>
                      <div className="text-[10px] text-stone-500 font-mono">Role: CFO (Executive)</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-stone-500 uppercase tracking-wider block mb-2">REST API Database Command</label>
                <select
                  value={cliCommand}
                  onChange={(e) => {
                    setCliCommand(e.target.value);
                    setCliLogs([]);
                  }}
                  className="w-full bg-[#FCFAF7] border border-stone-300 rounded p-2.5 text-xs text-stone-800 font-mono focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900"
                >
                  <option value="cat finance/salary_ledger_2026.xlsx">cat finance/salary_ledger_2026.xlsx (Retrieve compensation)</option>
                  <option value="cat research/customer_transcripts_bremen.txt">cat research/customer_transcripts_bremen.txt (Read research transcripts)</option>
                </select>
              </div>

              <button
                onClick={runCliCommand}
                disabled={isCliRunning}
                className="w-full bg-[#1C1917] hover:bg-stone-800 disabled:opacity-50 text-[#FCFAF7] py-3 rounded text-xs font-mono font-medium flex items-center justify-center gap-2 transition-all shadow"
              >
                {isCliRunning ? (
                  <>
                    <Activity className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    Evaluating Policy...
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    Execute Secured Endpoint Request
                  </>
                )}
              </button>
            </div>
          </div>

          {/* CLI Display (Right) */}
          <div className="lg:col-span-7 bg-[#1A1A1A] border border-stone-800 rounded-lg overflow-hidden shadow-lg h-[340px] font-mono text-xs flex flex-col">
            <div className="bg-[#1F1F1F] border-b border-stone-800 px-4 py-2.5 flex items-center justify-between text-stone-400">
              <span className="text-[10px] font-semibold tracking-wider">SECURE AUTHORIZATION SANDBOX</span>
              <span className="text-stone-600">CLI Version v1.02</span>
            </div>
            
            <div className="flex-1 p-4 space-y-2 overflow-y-auto leading-relaxed text-stone-300">
              {cliLogs.length === 0 ? (
                <div className="text-stone-500 italic text-center pt-24">
                  Select an identity profile and execute a secured database command to test policy boundaries.
                </div>
              ) : (
                cliLogs.map((log, index) => {
                  let logColor = 'text-stone-300';
                  if (log.startsWith('$')) logColor = 'text-white font-semibold';
                  if (log.startsWith('[GATEWAY]') || log.startsWith('[RBAC]')) logColor = 'text-blue-400';
                  if (log.startsWith('[ACCESS DENIED]')) logColor = 'text-red-400 font-semibold bg-red-950/20 p-2 rounded border border-red-900/30';
                  if (log.startsWith('[ACCESS GRANTED]') || log.startsWith('[SUCCESS]')) logColor = 'text-[#10B981] font-semibold';
                  if (log.startsWith('---') || log.includes('€') || log.includes('Lukas:')) logColor = 'text-stone-200 bg-stone-900/40 p-1.5 rounded pl-4';
                  return (
                    <div key={index} className={`${logColor} whitespace-pre-wrap`}>
                      {log}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ----------------- Showcase: Digital Twins in Action (Slides 10-13) ----------------- */}
      <section id="twins" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// MULTI-CHANNEL COLLABORATION</span>
          <h2 className="font-serif text-4xl text-stone-900">Digital Twins in Action</h2>
          <p className="text-stone-600 text-sm">
            See how Orqaly's Agentic OS combined with AxWise's grounding engine lets enterprise digital twins act as secure, highly capable, and fully autonomous teammates.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          <button
            onClick={() => setTwinsTab('cfo')}
            className={`px-4 py-2 rounded-md font-medium text-xs transition-all ${
              twinsTab === 'cfo'
                ? 'bg-emerald-800 text-[#FCFAF7] shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            CFO Twin (WhatsApp &amp; Slack)
          </button>
          <button
            onClick={() => setTwinsTab('rbac_gov')}
            className={`px-4 py-2 rounded-md font-medium text-xs transition-all ${
              twinsTab === 'rbac_gov'
                ? 'bg-red-800 text-[#FCFAF7] shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            RBAC Governance (Blocked Flow)
          </button>
          <button
            onClick={() => setTwinsTab('designer')}
            className={`px-4 py-2 rounded-md font-medium text-xs transition-all ${
              twinsTab === 'designer'
                ? 'bg-blue-800 text-[#FCFAF7] shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            Designer Twin (Slack &amp; Figma)
          </button>
          <button
            onClick={() => setTwinsTab('bpmn')}
            className={`px-4 py-2 rounded-md font-medium text-xs transition-all ${
              twinsTab === 'bpmn'
                ? 'bg-stone-900 text-[#FCFAF7] shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            BPMN Architecture Flow
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="bg-white border border-[#EAE6DF] rounded-xl p-6 md:p-8 shadow-sm relative overflow-hidden">
          <AnimatePresence mode="wait">
            
            {/* 1. CFO Twin Tab */}
            {twinsTab === 'cfo' && (
              <motion.div
                key="cfo-twin"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid grid-cols-12 gap-6 items-start"
              >
                {/* 10a Horizontal Timeline (Slideshow style) */}
                <div className="col-span-12 border-b border-[#EAE6DF] pb-8 mb-6">
                  <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-4">
                    {/* Setup Node */}
                    <div className="flex-1 flex flex-col items-center text-center max-w-[220px]">
                      <div className="w-11 h-11 rounded-full border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center text-emerald-700 shadow-sm mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase mb-1">Setup</span>
                      <h4 className="text-xs font-bold text-stone-900 mb-1">Org Mapped</h4>
                      <p className="text-[11px] text-stone-500 leading-tight">Orqaly maps workflows. AxWise creates digital twins.</p>
                    </div>

                    <div className="hidden md:flex items-center pt-4 text-emerald-600">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-4-4l4 4-4 4"/></svg>
                    </div>

                    {/* Trigger Node */}
                    <div className="flex-1 flex flex-col items-center text-center max-w-[220px]">
                      <div className="w-11 h-11 rounded-full border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center text-amber-700 shadow-sm mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase mb-1">Trigger</span>
                      <h4 className="text-xs font-bold text-stone-900 mb-1">Team Member OOO</h4>
                      <p className="text-[11px] text-stone-500 leading-tight">Your CFO goes on vacation. Operations usually stall.</p>
                    </div>

                    <div className="hidden md:flex items-center pt-4 text-emerald-600">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-4-4l4 4-4 4"/></svg>
                    </div>

                    {/* Query Node */}
                    <div className="flex-1 flex flex-col items-center text-center max-w-[220px]">
                      <div className="w-11 h-11 rounded-full border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-700 shadow-sm mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase mb-1">Query</span>
                      <h4 className="text-xs font-bold text-stone-900 mb-1">Ask via Chat</h4>
                      <p className="text-[11px] text-stone-500 leading-tight">Send a message on Slack or WhatsApp as usual.</p>
                    </div>

                    <div className="hidden md:flex items-center pt-4 text-emerald-600">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-4-4l4 4-4 4"/></svg>
                    </div>

                    {/* Result Node */}
                    <div className="flex-1 flex flex-col items-center text-center max-w-[220px]">
                      <div className="w-11 h-11 rounded-full border-2 border-teal-300 bg-[#059669] flex items-center justify-center text-white shadow-md mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase mb-1">Result</span>
                      <h4 className="text-xs font-bold text-stone-900 mb-1">Files + Summary</h4>
                      <p className="text-[11px] text-stone-500 leading-tight">Twin retrieves files and replies like a colleague.</p>
                    </div>
                  </div>
                </div>

                {/* Left side info */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                  <div className="border border-emerald-200 bg-emerald-50/30 p-5 rounded-lg space-y-3">
                    <span className="text-[10px] font-mono text-emerald-800 uppercase tracking-wider font-semibold">CFO Digital Twin</span>
                    <h3 className="font-serif text-lg text-stone-950">Veronika Horvat</h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Veronika is on vacation. Her CFO Digital Twin has been activated via AxWise, with secure read-only access to her Finance Folder, Q2 Planning document, and Slack history.
                    </p>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono rounded font-semibold">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                      Twin Active &amp; Grounded
                    </span>
                  </div>

                  <div className="bg-stone-50/50 border border-stone-200 p-5 rounded-lg space-y-3">
                    <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">Grounded Data Resources</span>
                    <ul className="text-xs text-stone-600 space-y-2">
                      <li className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span>📁 Finance / Q2 Planning Drive</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span>💬 Slack History (#finance)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span>📧 Email correspondence archive</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Right side mockups (WhatsApp & Slack Side-by-Side with Connector) */}
                <div className="col-span-12 lg:col-span-8 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0 w-full overflow-x-auto py-2">
                  
                  {/* WhatsApp Simulation */}
                  <div className="w-[240px] bg-[#EFEAE2] border border-stone-200 rounded-2xl overflow-hidden shadow-md flex flex-col h-[400px] flex-shrink-0">
                    <div className="bg-[#F0F2F5] px-3.5 py-2.5 flex items-center justify-between border-b border-stone-200/80">
                      <div className="flex items-center gap-2">
                        <img 
                          src="/orqaly-axwise/assets/veronika_avatar.png" 
                          className="w-7 h-7 rounded-full object-cover border border-stone-300/60" 
                          alt="Veronika"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div>
                          <div className="text-[10px] font-semibold text-stone-900 leading-tight">Veronika Horvat</div>
                          <div className="text-[7.5px] text-[#00A884]">Away · Twin Active</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 flex flex-col">
                      <div className="bg-[#FFEECD] text-[7.5px] text-stone-600 px-2 py-1 rounded border border-[#FFE3B3] text-center self-center max-w-[95%] leading-snug">
                        Veronika is Out of Office. Queries handled by her Digital Twin.
                      </div>

                      <div className="bg-[#D9FDD3] self-end max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm leading-snug">
                        <p>Hey Veronika, I need the latest Q2 projections for the board meeting. Can you send them?</p>
                        <div className="text-[6.5px] text-stone-500 text-right mt-0.5">9:41 AM</div>
                      </div>

                      <div className="bg-white self-start max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm space-y-1.5 leading-snug">
                        <p><span className="text-[7px] font-bold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded mr-1">CFO TWIN</span>Hi! Pulling from Q2 Planning. Here is the file and key points:</p>
                        
                        <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 p-1.5 rounded-md">
                          <div className="w-5.5 h-5.5 bg-emerald-100 rounded flex items-center justify-center text-emerald-700">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[8.5px] font-bold text-stone-900 truncate">Q2_Projections_v4.pdf</div>
                            <div className="text-[7px] text-stone-500">1.8 MB · PDF</div>
                          </div>
                        </div>

                        <div className="text-[8.5px] text-stone-700 leading-tight space-y-0.5 pl-1 border-l border-emerald-500">
                          <div>• Base scenario: $2.4M ARR</div>
                          <div>• Stretch: $2.8M ARR</div>
                          <div>• Burn reduced 8% via API optim.</div>
                        </div>
                        <div className="text-[6.5px] text-stone-500 text-right">9:42 AM</div>
                      </div>

                      <div className="bg-emerald-50 text-[8px] text-emerald-800 font-semibold px-1.5 py-1 rounded text-center self-center border border-emerald-100">
                        Task Cost: $0.045 | Daily Budget: $98.10
                      </div>
                    </div>
                    
                    <div className="bg-white p-2 border-t border-stone-100 flex items-center justify-between text-[9px] text-stone-400">
                      <span>Type a message...</span>
                    </div>
                  </div>

                  {/* Connector */}
                  <div className="flex md:flex-col items-center gap-1 py-2 md:py-0 px-3 text-stone-400 flex-shrink-0">
                    <div className="h-px w-6 md:h-12 md:w-px bg-gradient-to-r md:bg-gradient-to-b from-emerald-500/20 to-transparent"></div>
                    <span className="text-[7.5px] font-mono tracking-wider uppercase text-emerald-600 font-bold opacity-60">same twin</span>
                    <div className="h-px w-6 md:h-12 md:w-px bg-gradient-to-r md:bg-gradient-to-b from-transparent to-emerald-500/20"></div>
                  </div>

                  {/* Slack Simulation */}
                  <div className="w-[340px] bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px] flex-shrink-0">
                    <div className="bg-white px-3.5 py-2.5 border-b border-stone-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-stone-500 font-mono">#</span>
                        <span className="text-xs font-bold text-stone-900">finance-ops</span>
                      </div>
                      <span className="text-[8px] text-stone-500">3 members</span>
                    </div>

                    <div className="flex-1 p-3 overflow-y-auto space-y-3.5 flex flex-col">
                      <div className="flex items-center gap-1.5 text-[8px] text-stone-400 uppercase tracking-wider font-semibold self-center w-full">
                        <span className="h-px flex-1 bg-stone-100"></span>
                        <span>Today</span>
                        <span className="h-px flex-1 bg-stone-100"></span>
                      </div>

                      <div className="flex items-start gap-2">
                        <img 
                          src="/orqaly-axwise/assets/vitalijs_avatar.png" 
                          className="w-7 h-7 rounded object-cover border border-stone-100 shadow-sm" 
                          alt="Vitalijs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Vitalijs Visnevskis</span>
                            <span className="text-[7px] text-stone-400">9:43 AM</span>
                          </div>
                          <p className="text-[9.5px] text-stone-700 leading-snug">
                            <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-medium">@Veronika</span> can you share the updated cash-flow model? I need it for the investor deck by noon.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-emerald-800 to-emerald-600 text-white rounded flex items-center justify-center text-[9px] font-bold font-mono">AW</div>
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Veronika's Twin</span>
                            <span className="bg-purple-800 text-white text-[7px] font-bold uppercase px-1 py-0.5 rounded ml-1 leading-none">APP</span>
                            <span className="text-[7px] text-stone-400 ml-1">9:43 AM</span>
                          </div>
                          <p className="text-[9.5px] text-stone-700 leading-snug">Veronika is OOO. I found the latest version in her Finance folder:</p>
                          
                          <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 p-1.5 rounded-md max-w-sm">
                            <div className="w-6 h-6 bg-emerald-50 rounded flex items-center justify-center text-emerald-600">
                              <FileText className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[8.5px] font-bold text-stone-900 truncate">CashFlow_Model_Q2_v3.xlsx</div>
                              <div className="text-[7px] text-stone-500">842 KB · Spreadsheet</div>
                            </div>
                          </div>

                          <div className="text-[8.5px] text-stone-600 bg-stone-50 p-2 rounded border-l-2 border-emerald-500 leading-snug">
                            <strong>Summary:</strong> Net positive cash-flow projected starting August. Runway extended to 18 months post-raise.
                          </div>

                          <div className="flex gap-1 mt-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-stone-50 hover:bg-stone-100 border border-stone-100 rounded-full text-[8.5px] text-stone-600 cursor-pointer">👍 2</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-stone-50 hover:bg-stone-100 border border-stone-100 rounded-full text-[8.5px] text-stone-600 cursor-pointer font-serif">🙏 1</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 border-t border-stone-100 text-[9px] text-stone-400">
                      <span>Message #finance-ops</span>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* 2. RBAC Governance Tab */}
            {twinsTab === 'rbac_gov' && (
              <motion.div
                key="rbac-gov"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid grid-cols-12 gap-6 items-start"
              >
                {/* Left side info */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                  <div className="border border-red-200 bg-red-50/20 p-5 rounded-lg space-y-3">
                    <span className="text-[10px] font-mono text-red-800 uppercase tracking-wider font-semibold">Policy Gated Flow</span>
                    <h3 className="font-serif text-lg text-stone-950">Strict Access Control</h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Digital twins strictly enforce role-based permissions. Even though the twin represents the CFO, it validates requested content dynamically, denying access to unauthorized members.
                    </p>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-mono rounded font-semibold">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      RBAC Gateway Active
                    </span>
                  </div>

                  <div className="bg-stone-50/50 border border-stone-200 p-5 rounded-lg space-y-2 text-xs">
                    <div className="font-mono text-[10px] text-stone-500 uppercase tracking-wider">CFO TWIN GATING POLICIES</div>
                    <div className="space-y-1.5 text-stone-600 leading-relaxed">
                      <div className="flex items-center justify-between bg-red-50 border border-red-100 p-1.5 rounded text-[10px] text-red-700">
                        <span>🔒 Finance / Salary_Ledger.xlsx</span>
                        <strong className="font-bold">DENIED</strong>
                      </div>
                      <div className="flex items-center justify-between bg-red-50 border border-red-100 p-1.5 rounded text-[10px] text-red-700">
                        <span>🔒 HR / Contracts &amp; Hiring</span>
                        <strong className="font-bold">DENIED</strong>
                      </div>
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-1.5 rounded text-[10px] text-emerald-800">
                        <span>🔓 General Product Metrics</span>
                        <strong className="font-bold">ALLOWED</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side mockups (WhatsApp & Slack Side-by-Side with Connector) */}
                <div className="col-span-12 lg:col-span-8 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0 w-full overflow-x-auto py-2">
                  
                  {/* WhatsApp Simulation */}
                  <div className="w-[240px] bg-[#EFEAE2] border border-stone-200 rounded-2xl overflow-hidden shadow-md flex flex-col h-[400px] flex-shrink-0">
                    <div className="bg-[#F0F2F5] px-3.5 py-2.5 flex items-center justify-between border-b border-stone-200/80">
                      <div className="flex items-center gap-2">
                        <img 
                          src="/orqaly-axwise/assets/veronika_avatar.png" 
                          className="w-7 h-7 rounded-full object-cover border border-stone-300/60" 
                          alt="Veronika"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div>
                          <div className="text-[10px] font-semibold text-stone-900 leading-tight">Veronika Horvat</div>
                          <div className="text-[7.5px] text-[#00A884]">Away · Twin Active</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 flex flex-col">
                      <div className="bg-[#FFEECD] text-[7.5px] text-stone-600 px-2 py-1 rounded border border-[#FFE3B3] text-center self-center max-w-[95%] leading-snug">
                        Veronika is Out of Office. Queries handled by her Digital Twin.
                      </div>

                      <div className="bg-[#D9FDD3] self-end max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm leading-snug">
                        <p>Hey Veronika, I need the team salary breakdown for the budget API I'm building. Can you export it?</p>
                        <div className="text-[6.5px] text-stone-500 text-right mt-0.5">10:15 AM</div>
                      </div>

                      <div className="bg-white self-start max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm space-y-1.5 leading-snug border-l-2 border-red-500">
                        <p className="flex items-center gap-1.5"><span className="text-[7px] font-bold text-red-800 bg-red-50 px-1.5 py-0.5 rounded leading-none">ACCESS DENIED</span>I can't share salary data with you. Your role (Backend Dev) doesn't have Finance-tier access. Please contact your manager for approval.</p>
                        
                        <div className="text-[8.5px] text-stone-600 bg-stone-50 p-1.5 rounded leading-snug text-red-600 border border-red-100">
                          <strong>Policy:</strong> Salary data requires CFO or HR-Admin role. This request has been logged for audit.
                        </div>
                        <div className="text-[6.5px] text-stone-500 text-right">10:15 AM</div>
                      </div>

                      <div className="bg-red-50 text-[8px] text-red-800 font-semibold px-1.5 py-1 rounded text-center self-center border border-red-200">
                        Task Cost: $0.015 | Daily Budget: $98.08
                      </div>
                    </div>
                    
                    <div className="bg-white p-2 border-t border-stone-100 flex items-center justify-between text-[9px] text-stone-400">
                      <span>Type a message...</span>
                    </div>
                  </div>

                  {/* Connector */}
                  <div className="flex md:flex-col items-center gap-1 py-2 md:py-0 px-3 text-stone-400 flex-shrink-0">
                    <div className="h-px w-6 md:h-12 md:w-px bg-gradient-to-r md:bg-gradient-to-b from-red-500/20 to-transparent"></div>
                    <span className="text-[7.5px] font-mono tracking-wider uppercase text-red-600 font-bold opacity-60">same policy</span>
                    <div className="h-px w-6 md:h-12 md:w-px bg-gradient-to-r md:bg-gradient-to-b from-transparent to-red-500/20"></div>
                  </div>

                  {/* Slack Simulation */}
                  <div className="w-[340px] bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px] flex-shrink-0">
                    <div className="bg-white px-3.5 py-2.5 border-b border-stone-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-stone-500 font-mono">#</span>
                        <span className="text-xs font-bold text-stone-900">engineering</span>
                      </div>
                      <span className="text-[8px] text-stone-500">12 members</span>
                    </div>

                    <div className="flex-1 p-3 overflow-y-auto space-y-3.5 flex flex-col">
                      <div className="flex items-center gap-1.5 text-[8px] text-stone-400 uppercase tracking-wider font-semibold self-center w-full">
                        <span className="h-px flex-1 bg-stone-100"></span>
                        <span>Today</span>
                        <span className="h-px flex-1 bg-stone-100"></span>
                      </div>

                      <div className="flex items-start gap-2">
                        <img 
                          src="/orqaly-axwise/assets/marcus_avatar.png" 
                          className="w-7 h-7 rounded object-cover border border-stone-100 shadow-sm" 
                          alt="Marcus"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Marcus Chen</span>
                            <span className="text-[7px] text-stone-400">10:17 AM</span>
                          </div>
                          <p className="text-[9.5px] text-stone-700 leading-snug">
                            <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-medium">@Veronika</span> I also need the AWS billing credentials from Finance. Can the twin pull those for me?
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 bg-red-950 text-red-400 rounded flex items-center justify-center text-[9px] font-bold font-mono">AW</div>
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Veronika's Twin</span>
                            <span className="bg-red-800 text-white text-[7px] font-bold uppercase px-1 py-0.5 rounded ml-1 leading-none">APP</span>
                            <span className="text-[7px] text-stone-400 ml-1">10:17 AM</span>
                          </div>
                          <p className="text-[9.5px] text-stone-700 leading-snug">⚠️ I cannot share billing credentials. This is outside your access scope.</p>
                          
                          <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-[8.5px] font-bold px-2 py-1 rounded">
                            <svg className="w-3.5 h-3.5 text-red-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            ACCESS DENIED · LOGGED FOR AUDIT
                          </div>

                          <div className="text-[8.5px] text-stone-500 mt-1">
                            <strong>Suggestion:</strong> Request access via your team lead or ask in #finance-ops with manager approval.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 border-t border-stone-100 text-[9px] text-stone-400">
                      <span>Message #engineering</span>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* 3. Designer Twin Tab */}
            {twinsTab === 'designer' && (
              <motion.div
                key="designer-twin"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid grid-cols-12 gap-6 items-start"
              >
                {/* Left side info */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                  <div className="border border-blue-200 bg-blue-50/20 p-5 rounded-lg space-y-3">
                    <span className="text-[10px] font-mono text-blue-800 uppercase tracking-wider font-semibold">Designer Twin</span>
                    <h3 className="font-serif text-lg text-stone-950">Clara Dubois</h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Clara is presenting at a design conference. Her twin handles cross-functional spacing tokens, height specifications, and UI asset distribution directly on Slack.
                    </p>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-mono rounded font-semibold">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                      Twin Online &amp; FIGMA Connected
                    </span>
                  </div>

                  <div className="bg-stone-50/50 border border-stone-200 p-5 rounded-lg space-y-3">
                    <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">Grounded Vector Sources</span>
                    <ul className="text-xs text-stone-600 space-y-2">
                      <li className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span>🎨 Figma Design System Tokens (Header, Button, Font)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span>📁 Google Drive (App Redesign v2 Assets)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span>💬 Slack History (#design-feedback)</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Right side mockups (WhatsApp & Slack Side-by-Side with Connector) */}
                <div className="col-span-12 lg:col-span-8 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0 w-full overflow-x-auto py-2">
                  
                  {/* WhatsApp Simulation */}
                  <div className="w-[240px] bg-[#EFEAE2] border border-stone-200 rounded-2xl overflow-hidden shadow-md flex flex-col h-[400px] flex-shrink-0">
                    <div className="bg-[#F0F2F5] px-3.5 py-2.5 flex items-center justify-between border-b border-stone-200/80">
                      <div className="flex items-center gap-2">
                        <img 
                          src="/orqaly-axwise/assets/clara_avatar.png" 
                          className="w-7 h-7 rounded-full object-cover border border-stone-300/60" 
                          alt="Clara"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div>
                          <div className="text-[10px] font-semibold text-stone-900 leading-tight">Clara Dubois</div>
                          <div className="text-[7.5px] text-[#00A884]">Away · Twin Active</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 flex flex-col">
                      <div className="bg-[#FFEECD] text-[7.5px] text-stone-600 px-2 py-1 rounded border border-[#FFE3B3] text-center self-center max-w-[95%] leading-snug">
                        Clara is at a conference. Queries handled by her Digital Twin.
                      </div>

                      <div className="bg-[#D9FDD3] self-end max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm leading-snug">
                        <p>Hey Clara, the devs need the latest onboarding flow mockups. Where can I find them?</p>
                        <div className="text-[6.5px] text-stone-500 text-right mt-0.5">2:22 PM</div>
                      </div>

                      <div className="bg-white self-start max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm space-y-1.5 leading-snug">
                        <p><span className="text-[7px] font-bold text-blue-800 bg-blue-50 px-1 py-0.5 rounded mr-1">DESIGNER TWIN</span>Found it! The latest version is in the Design Drive:</p>
                        
                        <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 p-1.5 rounded-md">
                          <div className="w-5.5 h-5.5 bg-blue-100 rounded flex items-center justify-center text-blue-700">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[8.5px] font-bold text-stone-900 truncate">Onboarding_Flow_v7.fig</div>
                            <div className="text-[7px] text-stone-500">Figma Template · Updated 2d ago</div>
                          </div>
                        </div>

                        <div className="text-[8.5px] text-stone-700 leading-tight space-y-0.5 pl-1 border-l border-blue-500">
                          <div>• <strong>Location:</strong> Design Drive → App Redesign → Flows</div>
                          <div>• <strong>Note:</strong> Clara marked v7 as "ready for dev" on Monday.</div>
                        </div>
                        <div className="text-[6.5px] text-stone-500 text-right">2:22 PM</div>
                      </div>

                      <div className="bg-blue-50 text-[8px] text-blue-800 font-semibold px-1.5 py-1 rounded text-center self-center border border-blue-100">
                        Task Cost: $0.022 | Daily Budget: $98.05
                      </div>
                    </div>
                    
                    <div className="bg-white p-2 border-t border-stone-100 flex items-center justify-between text-[9px] text-stone-400">
                      <span>Type a message...</span>
                    </div>
                  </div>

                  {/* Connector */}
                  <div className="flex md:flex-col items-center gap-1 py-2 md:py-0 px-3 text-stone-400 flex-shrink-0">
                    <div className="h-px w-6 md:h-12 md:w-px bg-gradient-to-r md:bg-gradient-to-b from-blue-500/20 to-transparent"></div>
                    <span className="text-[7.5px] font-mono tracking-wider uppercase text-blue-600 font-bold opacity-60">same twin</span>
                    <div className="h-px w-6 md:h-12 md:w-px bg-gradient-to-r md:bg-gradient-to-b from-transparent to-blue-500/20"></div>
                  </div>

                  {/* Slack Simulation */}
                  <div className="w-[340px] bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px] flex-shrink-0">
                    <div className="bg-white px-3.5 py-2.5 border-b border-stone-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-stone-500 font-mono">#</span>
                        <span className="text-xs font-bold text-stone-900">product-design</span>
                      </div>
                      <span className="text-[8px] text-stone-500">8 members</span>
                    </div>

                    <div className="flex-1 p-3 overflow-y-auto space-y-3.5 flex flex-col">
                      <div className="flex items-center gap-1.5 text-[8px] text-stone-400 uppercase tracking-wider font-semibold self-center w-full">
                        <span className="h-px flex-1 bg-stone-100"></span>
                        <span>Today</span>
                        <span className="h-px flex-1 bg-stone-100"></span>
                      </div>

                      <div className="flex items-start gap-2">
                        <img 
                          src="/orqaly-axwise/assets/vitalijs_avatar.png" 
                          className="w-7 h-7 rounded object-cover border border-stone-100 shadow-sm" 
                          alt="Vitalijs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Vitalijs Visnevskis</span>
                            <span className="text-[7px] text-stone-400">2:25 PM</span>
                          </div>
                          <p className="text-[9.5px] text-stone-700 leading-snug">
                            <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-medium">@Clara</span> the sprint starts tomorrow — can you confirm the final header component specs? I need dimensions and spacing tokens.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 bg-blue-900 text-white rounded flex items-center justify-center text-[9px] font-bold font-serif">CD</div>
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Clara's Twin</span>
                            <span className="bg-blue-800 text-white text-[7px] font-bold uppercase px-1 py-0.5 rounded ml-1 leading-none">APP</span>
                            <span className="text-[7px] text-stone-400 ml-1">2:25 PM</span>
                          </div>
                          <p className="text-[9.5px] text-stone-700 leading-snug">Clara is at a conference. Here are the specs from her latest Figma export:</p>
                          
                          <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 p-1.5 rounded-md max-w-sm">
                            <div className="w-6 h-6 bg-blue-50 rounded flex items-center justify-center text-blue-600">
                              <FileText className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[8.5px] font-bold text-stone-900 truncate">Header_Specs_Final.pdf</div>
                              <div className="text-[7px] text-stone-500">320 KB · Design Spec</div>
                            </div>
                          </div>

                          <div className="text-[8.5px] text-stone-600 bg-stone-50 p-2 rounded border-l-2 border-blue-500 space-y-0.5 leading-snug">
                            <div>• <strong>Header height:</strong> 64px</div>
                            <div>• <strong>Padding:</strong> 16px 24px</div>
                            <div>• <strong>Font:</strong> Inter Semi 16/20</div>
                            <div>• <strong>Border-radius:</strong> 12px</div>
                          </div>

                          <div className="flex gap-1 mt-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-full text-[10px] text-stone-600 cursor-pointer">✅ 3</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-full text-[10px] text-stone-600 cursor-pointer">🎨 1</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 border-t border-stone-200 text-xs text-stone-400">
                      <span>Message #product-design</span>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* 4. BPMN Architecture Tab */}
            {twinsTab === 'bpmn' && (
              <motion.div
                key="bpmn-architecture"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-6"
              >
                <div className="text-center max-w-xl mx-auto space-y-2">
                  <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">SYSTEM TOPOLOGY</span>
                  <h3 className="font-serif text-2xl text-stone-950">Orqaly &times; AxWise Integration Map</h3>
                  <p className="text-stone-600 text-xs leading-relaxed">
                    Message flow runs on a zero-trust, permission-evaluated routing engine. Context retrieval is bound securely to the local workspace databases.
                  </p>
                </div>

                {/* Custom Responsive SVG Flowchart */}
                <div className="overflow-x-auto pb-4">
                  <div className="min-w-[800px] border border-stone-200 rounded-lg p-4 bg-stone-50/50">
                    <svg viewBox="0 0 1100 410" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <marker id="bpmn-arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                          <polygon points="0,0 8,3 0,6" fill="#6b7280"/>
                        </marker>
                        <marker id="bpmn-arrowhead-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                          <polygon points="0,0 8,3 0,6" fill="#059669"/>
                        </marker>
                        <marker id="bpmn-arrowhead-red" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                          <polygon points="0,0 8,3 0,6" fill="#EF4444"/>
                        </marker>
                        <linearGradient id="grad-orqaly-bpmn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(16,185,129,0.08)"/>
                          <stop offset="100%" stopColor="rgba(16,185,129,0.02)"/>
                        </linearGradient>
                        <linearGradient id="grad-axwise-bpmn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(59,130,246,0.08)"/>
                          <stop offset="100%" stopColor="rgba(59,130,246,0.02)"/>
                        </linearGradient>
                      </defs>

                      {/* Pool: User Layer */}
                      <rect x="20" y="10" width="1060" height="60" fill="rgba(0,0,0,0.02)" stroke="#e2e8f0" strokeWidth="1" rx="10"/>
                      <text x="40" y="32" className="text-[10px] font-bold tracking-wider uppercase" fill="#6b7280">User Layer</text>

                      {/* User nodes */}
                      <rect x="160" y="25" width="110" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                      <text x="215" y="41" textAnchor="middle" className="font-semibold" fill="#1e293b" fontSize="9.5">💬 Messengers</text>
                      <text x="215" y="52" textAnchor="middle" fill="#64748b" fontSize="8">WhatsApp, Telegram</text>

                      <rect x="300" y="25" width="110" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                      <text x="355" y="41" textAnchor="middle" className="font-semibold" fill="#1e293b" fontSize="9.5">💼 Collaboration</text>
                      <text x="355" y="52" textAnchor="middle" fill="#64748b" fontSize="8">Teams, Slack</text>

                      <rect x="440" y="25" width="110" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                      <text x="495" y="41" textAnchor="middle" className="font-semibold" fill="#1e293b" fontSize="9.5">🌐 Agent Portal</text>
                      <text x="495" y="52" textAnchor="middle" fill="#64748b" fontSize="8">Web Browser</text>

                      <rect x="580" y="25" width="110" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                      <text x="635" y="41" textAnchor="middle" className="font-semibold" fill="#1e293b" fontSize="9.5">📧 Email &amp; APIs</text>
                      <text x="635" y="52" textAnchor="middle" fill="#64748b" fontSize="8">Any Channel</text>

                      {/* Arrows from channels down to the bus */}
                      <line x1="215" y1="59" x2="215" y2="82" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>
                      <line x1="355" y1="59" x2="355" y2="82" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>
                      <line x1="495" y1="59" x2="495" y2="82" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>
                      <line x1="635" y1="59" x2="635" y2="82" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      {/* Horizontal bus line */}
                      <line x1="215" y1="82" x2="635" y2="82" stroke="#6b7280" strokeWidth="1.5" fill="none"/>

                      {/* Single vertical line from bus to Message Router */}
                      <line x1="240" y1="82" x2="240" y2="125" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      {/* Pool: Orqaly */}
                      <rect x="20" y="95" width="1060" height="110" fill="url(#grad-orqaly-bpmn)" stroke="#059669" strokeWidth="1.5" rx="12" strokeDasharray="4 2"/>
                      <text x="40" y="190" className="text-[10px] font-bold tracking-wider uppercase" fill="#059669">Orqaly — Workflow Orchestrator</text>

                      {/* Orqaly nodes */}
                      <rect x="160" y="125" width="160" height="42" rx="10" fill="rgba(16,185,129,0.04)" stroke="#059669" strokeWidth="1.5"/>
                      <text x="240" y="142" textAnchor="middle" className="font-semibold" fill="#059669" fontSize="11">Message Router</text>
                      <text x="240" y="154" textAnchor="middle" fill="#065f46" fontSize="8.5">Detects intent &amp; entity</text>

                      {/* Arrow to Workflow Engine */}
                      <line x1="320" y1="146" x2="370" y2="146" stroke="#059669" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead-green)"/>

                      <rect x="370" y="125" width="180" height="42" rx="10" fill="rgba(16,185,129,0.04)" stroke="#059669" strokeWidth="1.5"/>
                      <text x="460" y="142" textAnchor="middle" className="font-semibold" fill="#059669" fontSize="11">Workflow Engine</text>
                      <text x="460" y="154" textAnchor="middle" fill="#065f46" fontSize="8.5">Maps process &amp; selects twin</text>

                      {/* Arrow to Task Router */}
                      <line x1="550" y1="146" x2="600" y2="146" stroke="#059669" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead-green)"/>

                      <rect x="600" y="125" width="160" height="42" rx="10" fill="rgba(16,185,129,0.04)" stroke="#059669" strokeWidth="1.5"/>
                      <text x="680" y="142" textAnchor="middle" className="font-semibold" fill="#059669" fontSize="11">Task Orchestrator</text>
                      <text x="680" y="154" textAnchor="middle" fill="#065f46" fontSize="8.5">Executes multi-step flows</text>

                      {/* Arrow down from Task Orchestrator to AxWise (Active Twin) via orthogonal path */}
                      <line x1="680" y1="167" x2="680" y2="212" stroke="#059669" strokeWidth="1.5" fill="none"/>
                      <line x1="680" y1="212" x2="490" y2="212" stroke="#059669" strokeWidth="1.5" fill="none"/>
                      <line x1="490" y1="212" x2="490" y2="245" stroke="#059669" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead-green)"/>

                      {/* Arrow down from Orqaly down to Twin Registry via orthogonal dashed green path */}
                      <line x1="680" y1="205" x2="680" y2="212" stroke="#059669" strokeWidth="1.5" strokeDasharray="4 2" fill="none"/>
                      <line x1="680" y1="212" x2="240" y2="212" stroke="#059669" strokeWidth="1.5" strokeDasharray="4 2" fill="none"/>
                      <line x1="240" y1="212" x2="240" y2="245" stroke="#059669" strokeWidth="1.5" strokeDasharray="4 2" fill="none" markerEnd="url(#bpmn-arrowhead-green)"/>

                      {/* Response Builder node */}
                      <rect x="820" y="125" width="160" height="42" rx="10" fill="rgba(16,185,129,0.04)" stroke="#059669" strokeWidth="1.5"/>
                      <text x="900" y="142" textAnchor="middle" className="font-semibold" fill="#059669" fontSize="11">Response Builder</text>
                      <text x="900" y="154" textAnchor="middle" fill="#065f46" fontSize="8.5">Formats &amp; delivers reply</text>

                      {/* Response Arrow back to channel bus */}
                      <line x1="900" y1="125" x2="900" y2="88" stroke="#059669" strokeWidth="1.5" fill="none"/>
                      <line x1="900" y1="88" x2="240" y2="88" stroke="#059669" strokeWidth="1.5" fill="none" strokeDasharray="4 2"/>
                      <line x1="240" y1="88" x2="240" y2="82" stroke="#059669" strokeWidth="1.5" fill="none" markerEnd="url(#bpmn-arrowhead-green)"/>
                      <text x="760" y="81" textAnchor="middle" className="font-semibold" fill="#047857" fontSize="9">Response delivered to all channels</text>

                      {/* Pool: AxWise */}
                      <rect x="20" y="220" width="1060" height="120" fill="url(#grad-axwise-bpmn)" stroke="#3b82f6" strokeWidth="1.5" rx="12" strokeDasharray="4 2"/>
                      <text x="40" y="236" className="text-[10px] font-bold tracking-wider uppercase" fill="#3b82f6">AxWise — Digital Twin Engine</text>

                      {/* AxWise nodes */}
                      <rect x="160" y="245" width="160" height="42" rx="10" fill="rgba(59,130,246,0.04)" stroke="#3b82f6" strokeWidth="1.5"/>
                      <text x="240" y="262" textAnchor="middle" className="font-semibold" fill="#1e3a8a" fontSize="11">Twin Registry</text>
                      <text x="240" y="274" textAnchor="middle" fill="#2563eb" fontSize="8.5">Persona DNA &amp; context</text>

                      {/* Arrow to twin */}
                      <line x1="320" y1="266" x2="410" y2="266" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      <rect x="410" y="245" width="160" height="42" rx="10" fill="rgba(59,130,246,0.04)" stroke="#3b82f6" strokeWidth="1.5"/>
                      <text x="490" y="262" textAnchor="middle" className="font-semibold" fill="#1e3a8a" fontSize="11">Active Twin</text>
                      <text x="490" y="274" textAnchor="middle" fill="#2563eb" fontSize="8.5">Simulates employee</text>

                      {/* Gateway: Access Check (diamond) */}
                      <polygon points="625,266 650,241 675,266 650,291" fill="rgba(239,68,68,0.04)" stroke="#EF4444" strokeWidth="1.5"/>
                      <text x="650" y="270" textAnchor="middle" fontSize="9" fontWeight="700" fill="#EF4444">RBAC</text>

                      {/* Arrow to gateway */}
                      <line x1="570" y1="266" x2="625" y2="266" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      {/* Approved path */}
                      <line x1="675" y1="266" x2="730" y2="266" stroke="#059669" strokeWidth="1.5" fill="none" markerEnd="url(#bpmn-arrowhead-green)"/>
                      <text x="702" y="258" textAnchor="middle" fontSize="8" fill="#059669" fontWeight="700">✓ Allowed</text>

                      {/* Denied path */}
                      <line x1="650" y1="291" x2="650" y2="320" stroke="#EF4444" strokeWidth="1.5" fill="none" markerEnd="url(#bpmn-arrowhead-red)"/>
                      <text x="665" y="308" fontSize="8" fill="#EF4444" fontWeight="700">✗ Denied</text>
                      <rect x="590" y="320" width="120" height="16" rx="4" fill="rgba(239,68,68,0.08)" stroke="#EF4444" strokeWidth="1"/>
                      <text x="650" y="331" textAnchor="middle" fontSize="8" fill="#EF4444" fontWeight="600">Audit Log</text>

                      {/* Data Retriever */}
                      <rect x="730" y="245" width="160" height="42" rx="10" fill="rgba(59,130,246,0.04)" stroke="#3b82f6" strokeWidth="1.5"/>
                      <text x="810" y="262" textAnchor="middle" className="font-semibold" fill="#1e3a8a" fontSize="11">Data Retriever</text>
                      <text x="810" y="274" textAnchor="middle" fill="#2563eb" fontSize="8.5">Files, context, history</text>

                      {/* Arrow up from Data Retriever to Response Builder */}
                      <line x1="810" y1="245" x2="810" y2="212" stroke="#3b82f6" strokeWidth="1.5" fill="none"/>
                      <line x1="810" y1="212" x2="900" y2="212" stroke="#3b82f6" strokeWidth="1.5" fill="none"/>
                      <line x1="900" y1="212" x2="900" y2="167" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      {/* Pool: Data Sources */}
                      <rect x="20" y="350" width="1060" height="55" fill="rgba(0,0,0,0.02)" stroke="#cbd5e1" strokeWidth="1" rx="10"/>
                      <text x="35" y="382" className="text-[9px] font-bold tracking-wider uppercase" fill="#64748b">Connected Data Sources</text>

                      <g transform="translate(230, 362)">
                        <rect width="85" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                        <text x="42.5" y="17" textAnchor="middle" fill="#334155" fontSize="8.5">📁 Google Drive</text>
                      </g>

                      <g transform="translate(322, 362)">
                        <rect width="85" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                        <text x="42.5" y="17" textAnchor="middle" fill="#334155" fontSize="8.5">💬 Slack API</text>
                      </g>

                      <g transform="translate(414, 362)">
                        <rect width="85" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                        <text x="42.5" y="17" textAnchor="middle" fill="#334155" fontSize="8.5">📧 Gmail API</text>
                      </g>

                      <g transform="translate(506, 362)">
                        <rect width="85" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                        <text x="42.5" y="17" textAnchor="middle" fill="#334155" fontSize="8.5">🎨 Figma</text>
                      </g>

                      <g transform="translate(598, 362)">
                        <rect width="85" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                        <text x="42.5" y="17" textAnchor="middle" fill="#334155" fontSize="8.5">📊 Notion</text>
                      </g>

                      <g transform="translate(690, 362)">
                        <rect width="85" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                        <text x="42.5" y="17" textAnchor="middle" fill="#334155" fontSize="8.5">📋 Jira / Conf.</text>
                      </g>

                      <g transform="translate(782, 362)">
                        <rect width="85" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                        <text x="42.5" y="17" textAnchor="middle" fill="#334155" fontSize="8.5">🎯 Linear</text>
                      </g>

                      <g transform="translate(874, 362)">
                        <rect width="85" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1"/>
                        <text x="42.5" y="17" textAnchor="middle" fill="#334155" fontSize="8.5">☁️ Salesforce</text>
                      </g>

                      <g transform="translate(966, 362)">
                        <rect width="85" height="28" rx="6" fill="rgba(37,99,235,0.05)" stroke="#3b82f6" strokeWidth="1.2"/>
                        <text x="42.5" y="17" textAnchor="middle" className="font-semibold" fill="#2563eb" fontSize="8.5">🔌 MCP &amp; APIs</text>
                      </g>

                      {/* Arrow from Data Retriever down to data sources */}
                      <line x1="810" y1="287" x2="810" y2="350" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      {/* Legend */}
                      <rect x="895" y="235" width="180" height="95" rx="10" fill="rgba(255,255,255,0.8)" stroke="#cbd5e1" strokeWidth="1"/>
                      <text x="985" y="250" textAnchor="middle" fontSize="9" fontWeight="700" fill="#64748b" letterSpacing="0.08em">LEGEND</text>
                      <line x1="910" y1="262" x2="940" y2="262" stroke="#059669" strokeWidth="2"/>
                      <text x="948" y="266" fontSize="9" fill="#334155">Orqaly flow</text>
                      <line x1="910" y1="278" x2="940" y2="278" stroke="#3b82f6" strokeWidth="2"/>
                      <text x="948" y="282" fontSize="9" fill="#334155">AxWise flow</text>
                      <line x1="910" y1="294" x2="940" y2="294" stroke="#EF4444" strokeWidth="2"/>
                      <text x="948" y="298" fontSize="9" fill="#334155">Access denied</text>
                      <polygon points="915,310 925,302 935,310 925,318" fill="none" stroke="#EF4444" strokeWidth="1.5"/>
                      <text x="948" y="314" fontSize="9" fill="#334155">RBAC gateway</text>
                    </svg>
                  </div>
                </div>

                <div className="bg-stone-50 border border-stone-200 p-4 rounded-lg text-xs text-stone-600 leading-relaxed max-w-2xl mx-auto text-center font-mono">
                  💡 <strong>How it joins:</strong> Orqaly serves as the asynchronous communication dispatcher and step executor, while AxWise runs containerized local digital twin files and evaluates role authorizations on every API call.
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </section>

      {/* ----------------- Showcase 4: Enterprise-Ready Agentic Use Cases ----------------- */}
      <section id="compliance" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// DEEP COGNITIVE ORCHESTRATION</span>
          <h2 className="font-serif text-4xl text-stone-900">Enterprise Agentic Use Cases</h2>
          <p className="text-stone-600 text-sm">
            AxWise Flow is built for multi-agent execution, from simple digital-twin tasks to secure, audited enterprise integrations.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1 */}
          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 space-y-4 hover:border-emerald-300 transition-all shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">Customer &amp; Solver Discovery</h3>
              <p className="text-xs font-mono text-emerald-700 mt-1">Segment &amp; Expert Matcher</p>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Analyzes raw business problems, automatically identifies the core target customer segments, and selects the exact expert personas or agents needed to solve them.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 space-y-4 hover:border-emerald-300 transition-all shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">Enterprise Digital Twins</h3>
              <p className="text-xs font-mono text-emerald-700 mt-1">Role Impersonation (CFO / Design)</p>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Creates psychologically grounded, 24/7 Digital Twins of key company roles. Grounded in private spreadsheets, Figma tokens, or Slack channels to keep operations running when members are OOO.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 space-y-4 hover:border-emerald-300 transition-all shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center">
              <Code className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">Agentic Task Orchestration</h3>
              <p className="text-xs font-mono text-emerald-700 mt-1">Custom API &amp; SMS Integration</p>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Executes concrete workflows inside secure sandboxes. Connects custom SMS gateways and messaging routes to chat interfaces, or automates end-to-end marketing campaigns for local shops.
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 space-y-4 hover:border-emerald-300 transition-all shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">Sovereign Compliance</h3>
              <p className="text-xs font-mono text-emerald-700 mt-1">Role-Based Access &amp; Audit Logs</p>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Maintains high-security guardrails with central RBAC policy gateways and chronological, trace-verified audit records—fully containerized to comply with strict enterprise standards.
            </p>
          </div>

        </div>
      </section>

      {/* ----------------- Footer Call to Action ----------------- */}
      <section className="bg-[#1A1A1A] text-[#FCFAF7] px-6 lg:px-16 py-20 text-center border-t border-stone-800">
        <div className="max-w-2xl mx-auto space-y-6">
          <span className="text-xs font-mono text-[#10B981] uppercase tracking-wider font-semibold">// SOVEREIGN ENGINE DEPLOYMENT</span>
          <h2 className="font-serif text-4xl">Deploy AxWise Flow locally inside your private clouds.</h2>
          <p className="text-stone-400 text-sm max-w-lg mx-auto">
            Run the entire context-engineered, multi-agent engine locally with direct database control, zero vendor lock-in, 
            and complete compliance under the European AI Act.
          </p>
          <div className="pt-4 flex flex-wrap justify-center gap-4">
            <a 
              href="https://github.com/AxWise-GmbH/Flow" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-6 py-3 bg-[#FCFAF7] hover:bg-stone-100 text-[#1A1A1A] rounded-md font-medium text-sm flex items-center gap-2 transition-all shadow-md"
            >
              Get Self-Hosted Code (Apache 2.0)
              <ArrowRight className="w-4 h-4" />
            </a>
            <a 
              href="/docs" 
              className="px-6 py-3 border border-stone-700 hover:border-stone-500 rounded-md font-medium text-sm text-stone-300 hover:text-white transition-all"
            >
              View API Documentation
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-[#121212] text-stone-500 px-6 lg:px-16 py-8 border-t border-stone-900 text-xs flex flex-wrap justify-between items-center">
        <div>© 2026 AxWise GmbH &amp; Orqaly. All rights reserved. Licensed under Apache 2.0.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="/privacy-policy" className="hover:text-stone-300">Privacy Policy</a>
          <a href="/terms-of-service" className="hover:text-stone-300">Terms of Service</a>
          <a href="/impressum" className="hover:text-stone-300">Impressum</a>
        </div>
      </footer>

    </div>
  );
}
