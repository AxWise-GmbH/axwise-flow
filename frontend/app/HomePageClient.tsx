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
  Info,
  MessageSquare,
  Download,
  ExternalLink,
  Copy,
  BookOpen
} from 'lucide-react';
import { EcosystemLogos } from '@/components/landing/EcosystemLogos';

// ============================================================================
// MOCK DATA FOR INTERACTIVE SHOWCASES
// ============================================================================

interface DecisionProfile {
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
  twins: DecisionProfile[];
  consoleOutput: Array<{ text: string; type: string }>;
}

const DECISION_USECASES: Usecase[] = [
  {
    id: 'warehouse',
    title: 'Warehouse Operations',
    location: 'Regional distribution · Germany',
    directive: 'Reduce damage and late departures during shift handoffs without slowing dispatch.',
    challenge: 'The goal names the symptom, but the problem owner, decision-maker, evidence, and best executor still need to be resolved.',
    twins: [
      {
        name: 'Mara',
        role: 'Operations Discovery Lead',
        traits: 'Stakeholder discovery · Evidence synthesis · Pilot design',
        background: 'Best fit while the customer context and operational facts are still hypotheses.'
      },
      {
        name: 'Leon',
        role: 'Warehouse Process Specialist',
        traits: 'Handoff analysis · Damage prevention · Workflow design',
        background: 'Best fit once verified operational evidence establishes the problem and constraints.'
      }
    ],
    consoleOutput: [
      { text: '[GOAL] Prevent damage and departure delays around warehouse shift handoffs.', type: 'info' },
      { text: '[ROUTER] Existing evidence is insufficient. Selected route: research_assisted.', type: 'system' },
      { text: '[CUSTOMER] Working hypothesis: Dispatch Coordinator; confidence 0.75.', type: 'grounding' },
      { text: '[EVIDENCE] 14 synthetic quotes retained with source IDs and character offsets.', type: 'grounding' },
      { text: '[EXECUTOR] Ideal capabilities: stakeholder discovery, evidence synthesis, operational problem framing.', type: 'speech' },
      { text: '[AGENT FIT] Mara — Operations Discovery ranked first among authenticated Orqanix candidates.', type: 'speech' },
      { text: '[HANDOFF] Human verification required. Recommendation is not executable until Orqanix authorises it.', type: 'success' }
    ]
  },
  {
    id: 'patient-access',
    title: 'Patient Access',
    location: 'Multi-site clinic network',
    directive: 'Reduce missed appointments without increasing front-desk workload.',
    challenge: 'Patients, clinicians, administrators, and the budget owner value different outcomes and require different evidence.',
    twins: [
      {
        name: 'Nora',
        role: 'Service Research Lead',
        traits: 'Stakeholder mapping · Interview design · Service evidence',
        background: 'Resolves whose problem is being solved before a channel or automation is selected.'
      },
      {
        name: 'Amir',
        role: 'Patient Operations Designer',
        traits: 'Access workflows · Reminder design · Service measurement',
        background: 'Shapes a bounded operational pilot once patient and clinic constraints are supported.'
      }
    ],
    consoleOutput: [
      { text: '[GOAL] Reduce missed appointments without adding front-desk workload.', type: 'info' },
      { text: '[CONTEXT] Problem experiencer, beneficiary, decision-maker, and outcome owner separated.', type: 'system' },
      { text: '[TRUST] Declared assumptions retained separately from verified clinic evidence.', type: 'grounding' },
      { text: '[CUSTOMER] Primary operational context: patients who struggle to confirm or reschedule.', type: 'speech' },
      { text: '[EXECUTOR] Recommended role: patient-access operations designer.', type: 'speech' },
      { text: '[BOUNDARY] AxWise recommends the work pattern; Orqanix controls communications and approvals.', type: 'rbac' },
      { text: '[HANDOFF] Customer-aware planning package ready for Orqanix.', type: 'success' }
    ]
  },
  {
    id: 'revenue',
    title: 'Revenue Operations',
    location: 'B2B services',
    directive: 'Improve proposal conversion for complex enterprise opportunities.',
    challenge: 'The buyer, daily user, procurement gatekeeper, and delivery team have different risks and decision criteria.',
    twins: [
      {
        name: 'Elena',
        role: 'Buyer Intelligence Strategist',
        traits: 'Stakeholder analysis · Objection evidence · Decision criteria',
        background: 'Builds a customer map without collapsing buyer, user, and approver into one persona.'
      },
      {
        name: 'Jonas',
        role: 'Enterprise Proposal Lead',
        traits: 'Value framing · Risk communication · Commercial synthesis',
        background: 'Adapts the execution persona and deliverable to the evidenced buying group.'
      }
    ],
    consoleOutput: [
      { text: '[GOAL] Improve conversion for complex enterprise proposals.', type: 'info' },
      { text: '[STAKEHOLDERS] Economic buyer, end user, procurement, and delivery owner mapped separately.', type: 'system' },
      { text: '[EVIDENCE] CRM notes and discovery answers scored by relevance, quality, and verification.', type: 'grounding' },
      { text: '[CUSTOMER] Buying objections linked to the stakeholder who raised them.', type: 'speech' },
      { text: '[EXECUTOR] Proposal lead profile shaped for executive clarity and risk transparency.', type: 'speech' },
      { text: '[AGENT FIT] Candidate ranking includes capability, customer, tool, and history signals.', type: 'rbac' },
      { text: '[HANDOFF] Orqanix receives the recommendation, rationale, and execution persona.', type: 'success' }
    ]
  },
  {
    id: 'community',
    title: 'Public-Service Operations',
    location: 'Local service network',
    directive: 'Reduce unresolved service requests across departments.',
    challenge: 'Residents experience the problem, service teams execute the work, and department owners define acceptable outcomes.',
    twins: [
      {
        name: 'Sofia',
        role: 'Community Service Researcher',
        traits: 'Inclusive discovery · Service mapping · Evidence synthesis',
        background: 'Identifies affected groups and prevents the loudest stakeholder from becoming the only customer.'
      },
      {
        name: 'David',
        role: 'Cross-Department Service Designer',
        traits: 'Case routing · Operating models · Outcome measurement',
        background: 'Designs a non-software-first pilot before tools or automation are selected.'
      }
    ],
    consoleOutput: [
      { text: '[GOAL] Reduce unresolved service requests across departments.', type: 'info' },
      { text: '[ROUTER] Research is optional; value-of-information gate evaluated first.', type: 'system' },
      { text: '[STAKEHOLDERS] Residents, service teams, approvers, and outcome owners mapped.', type: 'grounding' },
      { text: '[CONSTRAINT] Do not assume a software product is the answer.', type: 'warning' },
      { text: '[EXECUTOR] Ideal role requires facilitation, service design, and measurement.', type: 'speech' },
      { text: '[PLAN SIGNAL] Start with a bounded cross-department operating pilot.', type: 'speech' },
      { text: '[HANDOFF] Orqanix owns planning, tools, approval, and execution.', type: 'success' }
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
    role: 'Lead UX Designer',
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
  const [activeTab, setActiveTab] = useState<string>('warehouse');
  const [consoleLogs, setConsoleLogs] = useState<Array<{ text: string; type: string }>>([]);
  const [logIndex, setLogIndex] = useState<number>(0);
  const [hoveredJsonId, setHoveredJsonId] = useState<string | null>(null);

  // Selected Persona for the Evidence Highlighter (Traceability)
  const [activeTracePersona, setActiveTracePersona] = useState<string>('lukas');

  // Gateway active tab selection for the carousel
  const [gatewayTab, setGatewayTab] = useState<'simulate' | 'parse' | 'rbac'>('simulate');

  // Selected state for the Orqanix execution showcase (representing slides 10-13)
  const [twinsTab, setTwinsTab] = useState<'cfo' | 'rbac_gov' | 'designer' | 'bpmn'>('cfo');

  // Copy state for standalone release commands
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    if (typeof window !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCommand(id);
      setTimeout(() => setCopiedCommand(null), 2500);
    }
  };

  // CLI State
  const [cliUser, setCliUser] = useState<'marcus' | 'veronika'>('marcus');
  const [cliCommand, setCliCommand] = useState<string>('cat finance/salary_ledger_2026.xlsx');
  const [cliLogs, setCliLogs] = useState<string[]>([]);
  const [isCliRunning, setIsCliRunning] = useState<boolean>(false);

  // Terminal Stream Effect for the active usecase
  useEffect(() => {
    const activeCase = DECISION_USECASES.find(c => c.id === activeTab);
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
      `[AXWISE] Recommendation includes requires_orqanix_authorization=true.`,
      `[ORQANIX] Identity mapped to role: ${cliUser === 'marcus' ? 'Developer' : 'Chief Financial Officer'}.`,
      `[ORQANIX RBAC] Evaluating requested tool action on '${cliCommand.split(' ').pop()}'...`
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
              `[ACCESS DENIED] User 'marcus_chen_dev' does not have Finance-tier clearance.`,
              `[ORQANIX RECEIPT] Action blocked; no tool call executed. AxWise recommendation remains advisory.`
            ]);
          } else {
            setCliLogs(prev => [
              ...prev,
              `[ACCESS GRANTED] User 'marcus_chen_dev' has read access to the research partition.`,
              `[ORQANIX TOOL] Opening 'research/customer_transcripts_bremen.txt'...`,
              `--- Content snippet ---`,
              `"Lukas: Honestly, it's a completely manual mess. We use Excel spreadsheets..."`
            ]);
          }
        } else {
          // CFO has access to everything
          if (isSalaryLedger) {
            setCliLogs(prev => [
              ...prev,
              `[ACCESS GRANTED] Finance read permission confirmed.`,
              `[ORQANIX TOOL] File retrieval authorised and recorded.`,
              `--- Illustrative ledger excerpt ---`,
              `Lukas Beckmann (Lead Engineer): €115,000 / year`,
              `Dennis Kruse (Fleet Coordinator): €78,000 / year`
            ]);
          } else {
            setCliLogs(prev => [
              ...prev,
              `[ACCESS GRANTED] Opening 'research/customer_transcripts_bremen.txt' through an authorised Orqanix connector...`,
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
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}><rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/><path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            <span className="font-serif font-bold text-lg tracking-tight">AxWise</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-8 text-xs xl:text-sm font-medium text-stone-600">
          <a href="#decision-lab" className="hover:text-stone-900 transition-colors">Decision Lab</a>
          <a href="#evidence" className="hover:text-stone-900 transition-colors">Evidence</a>
          <a href="#trust" className="hover:text-stone-900 transition-colors">Trust Boundary</a>
          <a href="#execution" className="hover:text-stone-900 transition-colors">Orqanix Integration</a>
          <a href="#use-cases" className="hover:text-stone-900 transition-colors">Use Cases</a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/AxWise-GmbH/axwise-flow"
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
            <BookOpen className="w-3.5 h-3.5" />
            Documentation
          </a>
        </div>
      </header>

      {/* ----------------- Hero Section: Deep trust ----------------- */}
      <section className="px-6 lg:px-16 pt-10 lg:pt-12 pb-28 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="grid lg:grid-cols-12 gap-12 items-center">

          {/* Left Column: Core Message */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-800">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>A specialist for your AI workspace · Local MCP extension</span>
            </div>

            <h1 className="font-serif text-5xl md:text-6xl font-normal leading-[1.1] tracking-tight text-stone-900">
              Better questions. Clearer evidence.<br />
              <span className="text-emerald-700">Turn vague goals into grounded agent recommendations.</span>
            </h1>

            <div className="max-w-xl space-y-3">
              <p className="text-lg text-stone-600 leading-relaxed">
                AxWise turns a goal into an evidence-bounded execution brief:{' '}
                <strong className="font-semibold text-stone-900">who the work is for, what outcome matters, what is known or uncertain, and which capabilities the work requires</strong>. It produces operational personas, qualitative synthesis, and verified agent recommendations through a local MCP contract.
              </p>
              <p className="text-sm text-stone-500 leading-relaxed">
                Runs locally inside Goose, Codex, Claude Desktop, or your own assistant host—with native desktop integration in Orqanix.
              </p>
            </div>

            {/* Quick Package & Launch Panel */}
            <div className="bg-[#1A1A1A] text-stone-300 rounded-xl p-4 sm:p-5 font-mono text-xs border border-stone-800 shadow-xl max-w-lg space-y-3">
              <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[11px] font-semibold text-stone-200 uppercase tracking-wider">AxWise FastMCP 0.4.2</span>
                </div>
                <span className="text-[10px] text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded">Verified Release</span>
              </div>

              {/* One-click launch command */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1">
                  <span>LAUNCH IN YOUR AGENT (UVX / PIP)</span>
                  <button
                    onClick={() => handleCopy('uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl axwise', 'hero-uvx')}
                    className="text-stone-400 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {copiedCommand === 'hero-uvx' ? (
                      <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> Copied!</span>
                    ) : (
                      <span className="flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</span>
                    )}
                  </button>
                </div>
                <div className="p-2.5 bg-stone-950 border border-stone-800 rounded-md text-[11px] text-stone-200 overflow-x-auto whitespace-pre">
                  <span className="text-emerald-400 select-none mr-1.5">$</span>
                  <span>uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl axwise</span>
                </div>
              </div>

              {/* Direct Download Buttons */}
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <a
                  href="https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise-extension-0.4.2.tgz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-emerald-500/50 rounded-md text-[11px] text-emerald-400 transition-all font-sans"
                >
                  <Download className="w-3 h-3" />
                  <span>Download .tgz (npm)</span>
                </a>
                <a
                  href="https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-emerald-500/50 rounded-md text-[11px] text-emerald-400 transition-all font-sans"
                >
                  <Download className="w-3 h-3" />
                  <span>Download .whl (Python)</span>
                </a>
                <a
                  href="https://orqanix.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-stone-400 hover:text-stone-200 text-[11px] transition-colors font-sans ml-auto"
                >
                  <span>Orqanix Desktop</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-4">
              <a
                href="#decision-lab"
                className="px-6 py-3 bg-[#1C1917] hover:bg-stone-800 text-[#FCFAF7] rounded-md font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
              >
                See the decision flow
                <ChevronRight className="w-4 h-4" />
              </a>
              <a
                href="https://github.com/AxWise-GmbH/axwise-flow"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 border border-stone-300 hover:border-stone-500 rounded-md font-medium text-sm text-stone-700 hover:text-stone-900 transition-all"
              >
                Explore the open-source engine
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
                  <span className="text-xs font-mono font-medium text-stone-500 uppercase tracking-wider">AxWise Decision API</span>
                </div>
                <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-medium">Contract v1.0</span>
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
                  1. Route Goal
                </button>
                <button
                  onClick={() => setGatewayTab('parse')}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono transition-all whitespace-nowrap ${
                    gatewayTab === 'parse'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  2. Build Context
                </button>
                <button
                  onClick={() => setGatewayTab('rbac')}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono transition-all whitespace-nowrap ${
                    gatewayTab === 'rbac'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  3. Recommend Team
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
                        <span>// MCP TOOL INVOCATION</span>
                        <span className="text-emerald-700 font-semibold bg-emerald-100/60 px-1 rounded">GOAL ROUTING</span>
                      </div>
                      <div className="text-[#1C1917] font-semibold font-mono">mcp::prepare_discovery(scope, goal)</div>
                      <p className="text-[10px] text-stone-500 font-sans leading-normal">
                        AxWise evaluates ambiguity, evidence sufficiency, consequence, and the value of more information. It chooses direct, evidence-assisted, bounded research, or human clarification before expensive research begins.
                      </p>
                    </div>

                    <div className="space-y-2 border-l-2 border-emerald-500 pl-3">
                      <div className="flex items-center justify-between text-stone-500 text-[10px]">
                        <span>DECISION INPUT</span>
                        <span>DOMAIN-NEUTRAL</span>
                      </div>
                      <div className="text-stone-800 leading-normal">
                        - Goal: <strong className="text-stone-900">Reduce damage at warehouse handoffs</strong><br />
                        - Stakeholder: <span className="text-emerald-700">declared, not yet verified</span><br />
                        - Evidence: <strong className="text-[#10B981]">insufficient for execution</strong><br />
                        - Candidate agents: <span className="text-stone-600">authenticated Orqanix catalogue</span>
                        <p className="text-[10px] text-stone-500 font-sans mt-1">
                          The same contract works for operations, research, sales, services, compliance, or software goals. It does not assume the answer is code.
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#1A1A1A] p-3 rounded text-[11px] leading-relaxed shadow border border-stone-800 space-y-1.5">
                      <div className="text-stone-500 text-[9px] font-mono flex items-center justify-between border-b border-stone-800 pb-1.5 mb-1.5">
                        <span>// MCP ARTIFACT OUTPUT</span>
                        <span className="text-emerald-400">STATUS: ARTIFACT_GENERATED</span>
                      </div>
                      <div className="text-stone-400">
                        <span className="text-[#10B981]">{"{"}</span><br />
                        &nbsp;&nbsp;<span className="text-stone-300">"routing_mode"</span>: <span className="text-emerald-400">"research_assisted"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"status"</span>: <span className="text-emerald-400">"pending_research"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"research_job"</span>: <span className="text-emerald-400">{"{ \"status\": \"queued\" }"}</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"requires_orqanix_authorization"</span>: <span className="text-[#10B981]">true</span><br />
                        <span className="text-[#10B981]">{"}"}</span>
                      </div>
                      <p className="text-[10px] text-stone-400 font-sans leading-normal">
                        Every recommendation is advisory. Orqanix revalidates tenant ownership, agent availability, policy, approval, budget, and tool access before execution.
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
                        <span>// MCP CONTEXT RESOLUTION</span>
                        <span className="text-blue-700 font-semibold bg-blue-50 px-1 rounded">RESEARCH ONLY WHEN NEEDED</span>
                      </div>
                      <div className="text-[#1C1917] font-semibold font-mono">mcp::generate_personas(context, constraints)</div>
                      <p className="text-[10px] text-stone-500 font-sans leading-normal">
                        When research is justified, AxWise builds a stakeholder map, customer-in-context persona, and ideal executor profile. Synthetic research remains explicitly unverified until a human or operational source confirms it.
                      </p>
                    </div>

                    <div className="space-y-2 border-l-2 border-blue-500 pl-3">
                      <div className="flex items-center justify-between text-stone-500 text-[10px]">
                        <span>STRUCTURED CONTEXT</span>
                        <span>PROVENANCE PRESERVED</span>
                      </div>
                      <div className="text-stone-800 leading-normal">
                        - Problem experiencer: <strong className="text-stone-900">frontline handlers</strong><br />
                        - Decision-maker: <span className="text-blue-700">dispatch operations owner</span><br />
                        - Desired outcome: <strong className="text-[#10B981]">fewer damaged loads and late departures</strong><br />
                        - Ideal executor: <span className="text-stone-600">evidence-led operations specialist</span>
                        <p className="text-[10px] text-stone-500 font-sans mt-1">
                          AxWise keeps problem experiencer, buyer, beneficiary, executor, and outcome owner distinct instead of flattening them into one generic persona.
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#1A1A1A] p-3 rounded text-[11px] leading-relaxed shadow border border-stone-800 space-y-1.5">
                      <div className="text-stone-500 text-[9px] font-mono flex items-center justify-between border-b border-stone-800 pb-1.5 mb-1.5">
                        <span>// MCP PERSONA RESOLUTION</span>
                        <span className="text-blue-400">STATUS: EVIDENCE_LINKED</span>
                      </div>
                      <div className="text-stone-400">
                        <span className="text-blue-400">{"{"}</span><br />
                        &nbsp;&nbsp;<span className="text-stone-300">"customer_persona"</span>: <span className="text-blue-400">{"{ \"trust\": \"synthetic_hypothesis\" }"}</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"ideal_agent_persona"</span>: <span className="text-blue-400">{"{ \"role\": \"Operations Discovery Lead\" }"}</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"evidence_count"</span>: <span className="text-blue-400">14</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"auto_assign_allowed"</span>: <span className="text-[#10B981]">false</span><br />
                        <span className="text-blue-400">{"}"}</span>
                      </div>
                      <p className="text-[10px] text-stone-400 font-sans leading-normal">
                        Quote-backed fields carry speaker, source ID, and character offsets. Inference and synthetic evidence are labelled separately from verified facts.
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
                        <span>// MCP DELIVERY BRIEF</span>
                        <span className="text-purple-700 font-semibold bg-purple-50 px-1 rounded">AGENT &amp; TEAM FIT</span>
                      </div>
                      <div className="text-[#1C1917] font-semibold font-mono">mcp::create_delivery_brief(prd_id, target)</div>
                      <p className="text-[10px] text-stone-500 font-sans leading-normal">
                        AxWise re-scores the authenticated Orqanix catalogue using task fit, generated executor capabilities, customer context, tool readiness, and available performance evidence.
                      </p>
                    </div>

                    <div className="space-y-2 border-l-2 border-purple-500 pl-3">
                      <div className="flex items-center justify-between text-stone-500 text-[10px]">
                        <span>CANDIDATE RANKING</span>
                        <span>SOFT + HARD SIGNALS</span>
                      </div>
                      <div className="text-stone-800 leading-normal">
                        - Recommended: <strong className="text-stone-900">Mara — Operations Discovery</strong><br />
                        - Capability fit: <span className="text-purple-700">stakeholder discovery + evidence synthesis</span><br />
                        - Trust status: <strong className="text-amber-600">synthetic working hypothesis</strong><br />
                        - Execution status: <strong className="text-red-500">BLOCKED UNTIL HUMAN VERIFICATION</strong>
                        <p className="text-[10px] text-stone-500 font-sans mt-1">
                          Research can improve the recommendation without weakening the trust gate. Useful hypotheses remain visible, but cannot silently become customer truth.
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#1A1A1A] p-3 rounded text-[11px] leading-relaxed shadow border border-stone-800 space-y-1.5">
                      <div className="text-stone-500 text-[9px] font-mono flex items-center justify-between border-b border-stone-800 pb-1.5 mb-1.5">
                        <span>// ORQANIX HANDOFF</span>
                        <span className="text-red-400">REVIEW REQUIRED</span>
                      </div>
                      <div className="text-stone-400">
                        <span className="text-purple-400">{"{"}</span><br />
                        &nbsp;&nbsp;<span className="text-stone-300">"recommended_agent_id"</span>: <span className="text-purple-400">"agent-ops-discovery"</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"authoritative"</span>: <span className="text-red-400">false</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"assignable"</span>: <span className="text-red-400">false</span>,<br />
                        &nbsp;&nbsp;<span className="text-stone-300">"requires_orqanix_authorization"</span>: <span className="text-purple-400">true</span><br />
                        <span className="text-purple-400">{"}"}</span>
                      </div>
                      <p className="text-[10px] text-stone-400 font-sans leading-normal">
                        Orqanix decides whether the recommendation may enter planning or execution. AxWise never grants tool access or performs the external action itself.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </section>

      {/* ----------------- Showcase 1: Cognitive decision lab ----------------- */}
      <section id="decision-lab" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// INTERACTIVE COGNITIVE DECISION TRACE</span>
          <h2 className="font-serif text-4xl text-stone-900">From vague goal to grounded recommendation</h2>
          <p className="text-stone-600 text-sm">
            Explore illustrative, domain-neutral scenarios. AxWise decides whether more research is valuable, resolves the customer and ideal executor, ranks existing Orqanix agents, and returns a trust-aware handoff. Orqanix&apos;s Consilium and workflow engine act downstream.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {DECISION_USECASES.map((usecase) => (
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

        {/* Console & Executor Profiles Board */}
        <div className="grid lg:grid-cols-12 gap-8">

          {/* Use-case Description & Executor Profiles */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-[#EAE6DF] p-6 rounded-lg shadow-sm space-y-4">
              <div>
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">ILLUSTRATIVE SCENARIO</span>
                <h3 className="font-serif text-xl text-stone-900 mt-1">
                  {DECISION_USECASES.find(c => c.id === activeTab)?.title}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>{DECISION_USECASES.find(c => c.id === activeTab)?.location}</span>
                </div>
              </div>

              <div className="p-3 bg-stone-50 rounded border border-stone-100 text-xs text-stone-700 leading-relaxed">
                <strong>Goal context:</strong> {DECISION_USECASES.find(c => c.id === activeTab)?.directive}
                <p className="mt-2 text-stone-600">{DECISION_USECASES.find(c => c.id === activeTab)?.challenge}</p>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">ILLUSTRATIVE EXECUTOR PROFILES</span>
                {DECISION_USECASES.find(c => c.id === activeTab)?.twins.map((twin, idx) => (
                  <div key={idx} className="flex gap-3 items-start border border-[#EAE6DF] p-3.5 rounded hover:border-emerald-300 hover:bg-emerald-50/5 transition-all">
                    <div className="w-9 h-9 bg-[#1A1A1A] text-white rounded-full flex items-center justify-center font-mono text-xs font-semibold shadow-sm">
                      {twin.name.split(' ').pop()?.charAt(0)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-stone-900">{twin.name}</div>
                        <span className="text-[9px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded">Goal-specific fit</span>
                      </div>
                      <div className="text-[10px] text-stone-500 font-medium">{twin.role}</div>
                      <div className="text-[10px] text-stone-600 leading-normal bg-stone-50 p-2 rounded border border-stone-100 italic">{twin.background}</div>
                      <div className="text-[9px] font-mono text-emerald-700 font-medium bg-emerald-50/50 p-1.5 rounded flex items-center gap-1">
                        <Activity className="w-3 h-3 text-emerald-600" />
                        <span>Fit signals: {twin.traits}</span>
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
                <span className="text-stone-400">AxWise decision trace</span>
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
              <span>Decision trace {logIndex}/{DECISION_USECASES.find(c => c.id === activeTab)?.consoleOutput.length}</span>
              <span className="text-emerald-500 animate-pulse">● Illustrative trace</span>
            </div>
          </div>

        </div>
      </section>

      {/* ----------------- Showcase 2: Traceability & Evidence ----------------- */}
      <section id="evidence" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="grid lg:grid-cols-12 gap-12 items-start">

          {/* Content Explanation */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// INSPECTABLE EVIDENCE</span>
            <h2 className="font-serif text-4xl text-stone-900 leading-tight">See what is quoted, inferred, or still unknown</h2>
            <p className="text-stone-600 text-sm leading-relaxed">
              Quote-backed persona fields retain the speaker, source document, exact quote, and character offsets. Select one of the <strong>four illustrative persona records</strong>, then hover over an extracted field to inspect its source. AxWise keeps those quotes separate from model inference and labels synthetic research as a hypothesis—not verified customer truth.
            </p>

            {/* Persona Selectors (At least 4 Personas) */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-stone-500 uppercase tracking-wider block">Illustrative persona dataset</label>
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
                <span>Exact quote, speaker, and source document retained</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#10B981]" />
                <span>Character offsets available for field-level review</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#10B981]" />
                <span>Synthetic, inferred, declared, and verified evidence kept distinct</span>
              </div>
            </div>
          </div>

          {/* Interactive Panel */}
          <div className="lg:col-span-7 grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] rounded-xl p-6 shadow-sm overflow-hidden">

            {/* Raw Transcript (Left) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">Illustrative source transcript</span>
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
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">Persona evidence [JSON]</span>
                <span className="text-xs font-mono text-stone-400">Structured output</span>
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

      {/* ----------------- Showcase 3: Orqanix authorization boundary ----------------- */}
      <section id="trust" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// RECOMMENDATION ≠ AUTHORIZATION</span>
          <h2 className="font-serif text-4xl text-stone-900">AxWise advises. The host decides what may run.</h2>
          <p className="text-stone-600 text-sm">
            Every AxWise recommendation requires authorization by the integrating host system. In the reference workflow below, Orqanix validates tenant ownership, identity, agent availability, approval, budget, and connector permissions before any external action.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-center">

          {/* Selector Interface */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-[#EAE6DF] p-6 rounded-lg space-y-5">
              <div>
                <label className="text-xs font-mono text-stone-500 uppercase tracking-wider block mb-2">Illustrative Orqanix identity</label>
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
                <label className="text-xs font-mono text-stone-500 uppercase tracking-wider block mb-2">Requested connector action</label>
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
                    Test downstream authorization
                  </>
                )}
              </button>
            </div>
          </div>

          {/* CLI Display (Right) */}
          <div className="lg:col-span-7 bg-[#1A1A1A] border border-stone-800 rounded-lg overflow-hidden shadow-lg h-[340px] font-mono text-xs flex flex-col">
            <div className="bg-[#1F1F1F] border-b border-stone-800 px-4 py-2.5 flex items-center justify-between text-stone-400">
              <span className="text-[10px] font-semibold tracking-wider">ORQANIX AUTHORIZATION BOUNDARY</span>
              <span className="text-stone-600">Illustrative enforcement</span>
            </div>

            <div className="flex-1 p-4 space-y-2 overflow-y-auto leading-relaxed text-stone-300">
              {cliLogs.length === 0 ? (
                <div className="text-stone-500 italic text-center pt-24">
                  Select an identity and test how Orqanix enforces policy after receiving an AxWise recommendation.
                </div>
              ) : (
                cliLogs.map((log, index) => {
                  let logColor = 'text-stone-300';
                  if (log.startsWith('$')) logColor = 'text-white font-semibold';
                  if (log.startsWith('[AXWISE]') || log.startsWith('[ORQANIX]') || log.startsWith('[ORQANIX RBAC]')) logColor = 'text-blue-400';
                  if (log.startsWith('[ACCESS DENIED]')) logColor = 'text-red-400 font-semibold bg-red-950/20 p-2 rounded border border-red-900/30';
                  if (log.startsWith('[ACCESS GRANTED]') || log.startsWith('[ORQANIX TOOL]')) logColor = 'text-[#10B981] font-semibold';
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

      {/* ----------------- Optional Orqanix reference integration ----------------- */}
      <section id="execution" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// REFERENCE INTEGRATION · COMPLEMENTARY LAYERS</span>
          <h2 className="font-serif text-4xl text-stone-900">AxWise intelligence, connected to Orqanix execution</h2>
          <p className="text-stone-600 text-sm">
            The self-hostable AxWise core can enhance different agentic or workflow products; its current hosted reference API is optimized for Orqanix. The use case below shows the two products working in synergy: AxWise returns context, evidence, an execution persona, and a ranked agent or team; Orqanix plans, authorises, and runs the work.
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
            Goal Persona Example
          </button>
          <button
            onClick={() => setTwinsTab('rbac_gov')}
            className={`px-4 py-2 rounded-md font-medium text-xs transition-all ${
              twinsTab === 'rbac_gov'
                ? 'bg-red-800 text-[#FCFAF7] shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            Orqanix Policy Enforcement
          </button>
          <button
            onClick={() => setTwinsTab('designer')}
            className={`px-4 py-2 rounded-md font-medium text-xs transition-all ${
              twinsTab === 'designer'
                ? 'bg-blue-800 text-[#FCFAF7] shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            Connector-Backed Execution
          </button>
          <button
            onClick={() => setTwinsTab('bpmn')}
            className={`px-4 py-2 rounded-md font-medium text-xs transition-all ${
              twinsTab === 'bpmn'
                ? 'bg-stone-900 text-[#FCFAF7] shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            Responsibility Map
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="bg-white border border-[#EAE6DF] rounded-xl p-6 md:p-8 shadow-sm relative overflow-hidden">
          <AnimatePresence mode="wait">

            {/* 1. CFO Goal Persona Tab */}
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
                      <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase mb-1">Input</span>
                      <h4 className="text-xs font-bold text-stone-900 mb-1">Vague Goal</h4>
                      <p className="text-[11px] text-stone-500 leading-tight">Orqanix sends the goal, tenant context, constraints, and available Agent Hub profiles.</p>
                    </div>

                    <div className="hidden md:flex items-center pt-4 text-emerald-600">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-4-4l4 4-4 4"/></svg>
                    </div>

                    {/* Trigger Node */}
                    <div className="flex-1 flex flex-col items-center text-center max-w-[220px]">
                      <div className="w-11 h-11 rounded-full border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center text-amber-700 shadow-sm mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase mb-1">Intelligence</span>
                      <h4 className="text-xs font-bold text-stone-900 mb-1">Customer + Executor</h4>
                      <p className="text-[11px] text-stone-500 leading-tight">AxWise decides whether research is needed, resolves stakeholders, and recommends the best fit.</p>
                    </div>

                    <div className="hidden md:flex items-center pt-4 text-emerald-600">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-4-4l4 4-4 4"/></svg>
                    </div>

                    {/* Query Node */}
                    <div className="flex-1 flex flex-col items-center text-center max-w-[220px]">
                      <div className="w-11 h-11 rounded-full border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-700 shadow-sm mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase mb-1">Authorization</span>
                      <h4 className="text-xs font-bold text-stone-900 mb-1">Orqanix Validates</h4>
                      <p className="text-[11px] text-stone-500 leading-tight">Orqanix checks the tenant, agent, approval policy, budget, and connector permissions.</p>
                    </div>

                    <div className="hidden md:flex items-center pt-4 text-emerald-600">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-4-4l4 4-4 4"/></svg>
                    </div>

                    {/* Result Node */}
                    <div className="flex-1 flex flex-col items-center text-center max-w-[220px]">
                      <div className="w-11 h-11 rounded-full border-2 border-teal-300 bg-[#059669] flex items-center justify-center text-white shadow-md mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase mb-1">Execution</span>
                      <h4 className="text-xs font-bold text-stone-900 mb-1">Goal-Aware Agent</h4>
                      <p className="text-[11px] text-stone-500 leading-tight">Orqanix plans and runs the work with AxWise context applied as a goal-specific overlay.</p>
                    </div>
                  </div>
                </div>

                {/* Left side info */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                  <div className="border border-emerald-200 bg-emerald-50/30 p-5 rounded-lg space-y-3">
                    <span className="text-[10px] font-mono text-emerald-800 uppercase tracking-wider font-semibold">Illustrative goal-execution use case</span>
                    <h3 className="font-serif text-lg text-stone-950">Veronika Horvat</h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      AxWise can shape a goal-specific CFO execution persona and recommend the matching Agent Hub profile. Orqanix alone activates the agent and grants any authorised, read-only access to finance or communication sources.
                    </p>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono rounded font-semibold">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                      Example · Orqanix-executed
                    </span>
                  </div>

                  <div className="bg-stone-50/50 border border-stone-200 p-5 rounded-lg space-y-3">
                    <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">Potential Orqanix connectors</span>
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
                <div id="real-chats-capture" className="col-span-12 lg:col-span-8 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0 w-full overflow-x-auto py-2">

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
                          <div className="text-[7.5px] text-[#00A884]">Away · Authorized Agent Active</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 flex flex-col">
                      <div className="bg-[#FFEECD] text-[7.5px] text-stone-600 px-2 py-1 rounded border border-[#FFE3B3] text-center self-center max-w-[95%] leading-snug">
                        Veronika is out of office. Requests are handled by an authorized agent using her goal execution persona.
                      </div>

                      <div className="bg-[#D9FDD3] self-end max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm leading-snug">
                        <p>Hey Veronika, I need the latest Q2 projections for the board meeting. Can you send them?</p>
                        <div className="text-[6.5px] text-stone-500 text-right mt-0.5">9:41 AM</div>
                      </div>

                      <div className="bg-white self-start max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm space-y-1.5 leading-snug">
                        <p><span className="text-[7px] font-bold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded mr-1">CFO AGENT</span>Hi! Pulling from Q2 Planning. Here is the file and key points:</p>

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
                    <span className="text-[7.5px] font-mono tracking-wider uppercase text-emerald-600 font-bold opacity-60">same authorized agent</span>
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
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Veronika&apos;s Agent</span>
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
                      AxWise can advise that a requested action requires authorization; Orqanix evaluates the authenticated user, tenant policy, approval state, and connector scope before any tool call runs.
                    </p>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-mono rounded font-semibold">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      Orqanix Policy Active
                    </span>
                  </div>

                  <div className="bg-stone-50/50 border border-stone-200 p-5 rounded-lg space-y-2 text-xs">
                    <div className="font-mono text-[10px] text-stone-500 uppercase tracking-wider">ILLUSTRATIVE ORQANIX POLICIES</div>
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
                          <div className="text-[7.5px] text-[#00A884]">Away · Authorized Agent Active</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 flex flex-col">
                      <div className="bg-[#FFEECD] text-[7.5px] text-stone-600 px-2 py-1 rounded border border-[#FFE3B3] text-center self-center max-w-[95%] leading-snug">
                        Veronika is out of office. Requests are handled by an authorized agent using her goal execution persona.
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
                            <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-medium">@Veronika</span> I also need the AWS billing credentials from Finance. Can the agent retrieve those for me?
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 bg-red-950 text-red-400 rounded flex items-center justify-center text-[9px] font-bold font-mono">AW</div>
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Veronika&apos;s Agent</span>
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

            {/* 3. Design Execution Persona Tab */}
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
                    <span className="text-[10px] font-mono text-blue-800 uppercase tracking-wider font-semibold">Design execution persona</span>
                    <h3 className="font-serif text-lg text-stone-950">Clara Dubois</h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Clara is presenting at a design conference. An authorized Orqanix agent uses her goal execution persona and approved connectors to answer design-system questions.
                    </p>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-mono rounded font-semibold">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                      Agent Authorized &amp; Figma Connected
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
                          <div className="text-[7.5px] text-[#00A884]">Away · Authorized Agent Active</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 flex flex-col">
                      <div className="bg-[#FFEECD] text-[7.5px] text-stone-600 px-2 py-1 rounded border border-[#FFE3B3] text-center self-center max-w-[95%] leading-snug">
                        Clara is at a conference. Requests are handled by an authorized agent using her goal execution persona.
                      </div>

                      <div className="bg-[#D9FDD3] self-end max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm leading-snug">
                        <p>Hey Clara, the devs need the latest onboarding flow mockups. Where can I find them?</p>
                        <div className="text-[6.5px] text-stone-500 text-right mt-0.5">2:22 PM</div>
                      </div>

                      <div className="bg-white self-start max-w-[85%] rounded-lg p-2 text-[9.5px] text-stone-900 shadow-sm space-y-1.5 leading-snug">
                        <p><span className="text-[7px] font-bold text-blue-800 bg-blue-50 px-1 py-0.5 rounded mr-1">DESIGN AGENT</span>Found it! The latest version is in the Design Drive:</p>

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
                    <span className="text-[7.5px] font-mono tracking-wider uppercase text-blue-600 font-bold opacity-60">same authorized agent</span>
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
                            <span className="text-[10px] font-bold text-stone-900 leading-none">Clara&apos;s Agent</span>
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
                  <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">INTEGRATION RESPONSIBILITY BOUNDARY</span>
                  <h3 className="font-serif text-2xl text-stone-950">AxWise intelligence &times; Orqanix execution</h3>
                  <p className="text-stone-600 text-xs leading-relaxed">
                    This use case shows how the products complement each other: AxWise supplies evidence-aware context and recommendations; Orqanix applies them to the goal lifecycle, permanent Agent Hub profiles, planning, authorization, connectors, execution, and delivery.
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
                        <linearGradient id="grad-orqanix-bpmn" x1="0" y1="0" x2="0" y2="1">
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

                      {/* Pool: Orqanix */}
                      <rect x="20" y="95" width="1060" height="110" fill="url(#grad-orqanix-bpmn)" stroke="#059669" strokeWidth="1.5" rx="12" strokeDasharray="4 2"/>
                      <text x="40" y="190" className="text-[10px] font-bold tracking-wider uppercase" fill="#059669">Orqanix — Agentic OS &amp; execution plane</text>

                      {/* Orqanix nodes */}
                      <rect x="160" y="125" width="160" height="42" rx="10" fill="rgba(16,185,129,0.04)" stroke="#059669" strokeWidth="1.5"/>
                      <text x="240" y="142" textAnchor="middle" className="font-semibold" fill="#059669" fontSize="11">Goal Lifecycle</text>
                      <text x="240" y="154" textAnchor="middle" fill="#065f46" fontSize="8.5">Goal, tenant &amp; constraints</text>

                      {/* Arrow to Workflow Engine */}
                      <line x1="320" y1="146" x2="370" y2="146" stroke="#059669" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead-green)"/>

                      <rect x="370" y="125" width="180" height="42" rx="10" fill="rgba(16,185,129,0.04)" stroke="#059669" strokeWidth="1.5"/>
                      <text x="460" y="142" textAnchor="middle" className="font-semibold" fill="#059669" fontSize="11">Agent Hub</text>
                      <text x="460" y="154" textAnchor="middle" fill="#065f46" fontSize="8.5">Permanent agent profiles</text>

                      {/* Arrow to Task Router */}
                      <line x1="550" y1="146" x2="600" y2="146" stroke="#059669" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead-green)"/>

                      <rect x="600" y="125" width="160" height="42" rx="10" fill="rgba(16,185,129,0.04)" stroke="#059669" strokeWidth="1.5"/>
                      <text x="680" y="142" textAnchor="middle" className="font-semibold" fill="#059669" fontSize="11">Planning &amp; Execution</text>
                      <text x="680" y="154" textAnchor="middle" fill="#065f46" fontSize="8.5">Tasks, tools &amp; monitoring</text>

                      {/* Arrow down from Planning & Execution to AxWise via orthogonal path */}
                      <line x1="680" y1="167" x2="680" y2="212" stroke="#059669" strokeWidth="1.5" fill="none"/>
                      <line x1="680" y1="212" x2="490" y2="212" stroke="#059669" strokeWidth="1.5" fill="none"/>
                      <line x1="490" y1="212" x2="490" y2="245" stroke="#059669" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead-green)"/>

                      {/* Arrow down from Orqanix to the AxWise context router via orthogonal dashed green path */}
                      <line x1="680" y1="205" x2="680" y2="212" stroke="#059669" strokeWidth="1.5" strokeDasharray="4 2" fill="none"/>
                      <line x1="680" y1="212" x2="240" y2="212" stroke="#059669" strokeWidth="1.5" strokeDasharray="4 2" fill="none"/>
                      <line x1="240" y1="212" x2="240" y2="245" stroke="#059669" strokeWidth="1.5" strokeDasharray="4 2" fill="none" markerEnd="url(#bpmn-arrowhead-green)"/>

                      {/* Response Builder node */}
                      <rect x="820" y="125" width="160" height="42" rx="10" fill="rgba(16,185,129,0.04)" stroke="#059669" strokeWidth="1.5"/>
                      <text x="900" y="142" textAnchor="middle" className="font-semibold" fill="#059669" fontSize="11">Approval &amp; Delivery</text>
                      <text x="900" y="154" textAnchor="middle" fill="#065f46" fontSize="8.5">Policy, connectors &amp; output</text>

                      {/* Response Arrow back to channel bus */}
                      <line x1="900" y1="125" x2="900" y2="88" stroke="#059669" strokeWidth="1.5" fill="none"/>
                      <line x1="900" y1="88" x2="240" y2="88" stroke="#059669" strokeWidth="1.5" fill="none" strokeDasharray="4 2"/>
                      <line x1="240" y1="88" x2="240" y2="82" stroke="#059669" strokeWidth="1.5" fill="none" markerEnd="url(#bpmn-arrowhead-green)"/>
                      <text x="760" y="81" textAnchor="middle" className="font-semibold" fill="#047857" fontSize="9">Authorized output delivered by Orqanix</text>

                      {/* Pool: AxWise */}
                      <rect x="20" y="220" width="1060" height="120" fill="url(#grad-axwise-bpmn)" stroke="#3b82f6" strokeWidth="1.5" rx="12" strokeDasharray="4 2"/>
                      <text x="40" y="236" className="text-[10px] font-bold tracking-wider uppercase" fill="#3b82f6">AxWise — Cognitive decision layer</text>

                      {/* AxWise nodes */}
                      <rect x="160" y="245" width="160" height="42" rx="10" fill="rgba(59,130,246,0.04)" stroke="#3b82f6" strokeWidth="1.5"/>
                      <text x="240" y="262" textAnchor="middle" className="font-semibold" fill="#1e3a8a" fontSize="11">Context Router</text>
                      <text x="240" y="274" textAnchor="middle" fill="#2563eb" fontSize="8.5">Direct, evidence or research</text>

                      {/* Arrow to customer intelligence */}
                      <line x1="320" y1="266" x2="410" y2="266" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      <rect x="410" y="245" width="160" height="42" rx="10" fill="rgba(59,130,246,0.04)" stroke="#3b82f6" strokeWidth="1.5"/>
                      <text x="490" y="262" textAnchor="middle" className="font-semibold" fill="#1e3a8a" fontSize="11">Customer Intelligence</text>
                      <text x="490" y="274" textAnchor="middle" fill="#2563eb" fontSize="8.5">Stakeholders &amp; outcomes</text>

                      {/* Gateway: Access Check (diamond) */}
                      <polygon points="625,266 650,241 675,266 650,291" fill="rgba(239,68,68,0.04)" stroke="#EF4444" strokeWidth="1.5"/>
                      <text x="650" y="270" textAnchor="middle" fontSize="9" fontWeight="700" fill="#EF4444">FIT</text>

                      {/* Arrow to gateway */}
                      <line x1="570" y1="266" x2="625" y2="266" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      {/* Approved path */}
                      <line x1="675" y1="266" x2="730" y2="266" stroke="#059669" strokeWidth="1.5" fill="none" markerEnd="url(#bpmn-arrowhead-green)"/>
                      <text x="702" y="258" textAnchor="middle" fontSize="8" fill="#059669" fontWeight="700">✓ Confident</text>

                      {/* Denied path */}
                      <line x1="650" y1="291" x2="650" y2="320" stroke="#EF4444" strokeWidth="1.5" fill="none" markerEnd="url(#bpmn-arrowhead-red)"/>
                      <text x="665" y="308" fontSize="8" fill="#EF4444" fontWeight="700">Review</text>
                      <rect x="590" y="320" width="120" height="16" rx="4" fill="rgba(239,68,68,0.08)" stroke="#EF4444" strokeWidth="1"/>
                      <text x="650" y="331" textAnchor="middle" fontSize="8" fill="#EF4444" fontWeight="600">Working hypothesis</text>

                      {/* Data Retriever */}
                      <rect x="730" y="245" width="160" height="42" rx="10" fill="rgba(59,130,246,0.04)" stroke="#3b82f6" strokeWidth="1.5"/>
                      <text x="810" y="262" textAnchor="middle" className="font-semibold" fill="#1e3a8a" fontSize="11">Persona + Agent Fit</text>
                      <text x="810" y="274" textAnchor="middle" fill="#2563eb" fontSize="8.5">Overlay, ranking &amp; rationale</text>

                      {/* Arrow up from Data Retriever to Response Builder */}
                      <line x1="810" y1="245" x2="810" y2="212" stroke="#3b82f6" strokeWidth="1.5" fill="none"/>
                      <line x1="810" y1="212" x2="900" y2="212" stroke="#3b82f6" strokeWidth="1.5" fill="none"/>
                      <line x1="900" y1="212" x2="900" y2="167" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#bpmn-arrowhead)"/>

                      {/* Pool: Data Sources */}
                      <rect x="20" y="350" width="1060" height="55" fill="rgba(0,0,0,0.02)" stroke="#cbd5e1" strokeWidth="1" rx="10"/>
                      <text x="35" y="382" className="text-[9px] font-bold tracking-wider uppercase" fill="#64748b">Context sources</text>

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
                      <text x="948" y="266" fontSize="9" fill="#334155">Orqanix flow</text>
                      <line x1="910" y1="278" x2="940" y2="278" stroke="#3b82f6" strokeWidth="2"/>
                      <text x="948" y="282" fontSize="9" fill="#334155">AxWise flow</text>
                      <line x1="910" y1="294" x2="940" y2="294" stroke="#EF4444" strokeWidth="2"/>
                      <text x="948" y="298" fontSize="9" fill="#334155">Needs review</text>
                      <polygon points="915,310 925,302 935,310 925,318" fill="none" stroke="#EF4444" strokeWidth="1.5"/>
                      <text x="948" y="314" fontSize="9" fill="#334155">Confidence gate</text>
                    </svg>
                  </div>
                </div>

                <div className="bg-stone-50 border border-stone-200 p-4 rounded-lg text-xs text-stone-600 leading-relaxed max-w-2xl mx-auto text-center font-mono">
                  💡 <strong>How it joins:</strong> AxWise returns a traceable recommendation package. Orqanix applies it to the goal, preserves the permanent Agent Hub profile, authorises tools and budgets, executes the workflow, and reports outcomes back for learning.
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </section>

      {/* ----------------- Concrete Chat Prompts & Tangible Workflows ----------------- */}
      <section id="chat-examples" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-b border-[#EAE6DF]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// START WITH WHAT YOU NEED</span>
          <h2 className="font-serif text-4xl text-stone-900">Small prompts. Substantial work.</h2>
          <p className="text-stone-600 text-sm">
            No special command syntax. Ask for the outcome you want in your normal chat inside Goose, Codex, or Orqanix. Your host invokes AxWise for the heavy discovery and research work.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Card 1: Discovery */}
          <div className="bg-white border border-[#EAE6DF] rounded-xl p-6 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2.5 py-0.5 rounded-full font-semibold">
                  01 / DISCOVERY FRAMING
                </span>
                <span className="text-[10px] font-mono text-stone-500">prepare_discovery</span>
              </div>
              <h3 className="font-serif text-lg text-stone-900 font-medium">Get a project off the ground</h3>
              <div className="p-3.5 bg-[#FCFAF7] border border-[#EAE6DF] rounded-lg text-stone-800 font-sans text-xs italic leading-relaxed">
                <span className="not-italic text-[10px] font-mono text-emerald-700 block mb-1 font-semibold uppercase">// YOU ASK YOUR AGENT:</span>
                &ldquo;We&rsquo;re building a booking tool for independent studios. Propose the discovery scope, stakeholder groups and interview questions before we decide what to build.&rdquo;
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span className="text-stone-700 font-medium">↳ Tangible artifact:</span>
              <span className="text-stone-600">Framed scope · Stakeholder matrix · Interview guide</span>
            </div>
          </div>

          {/* Card 2: Research Synthesis */}
          <div className="bg-white border border-[#EAE6DF] rounded-xl p-6 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200/60 px-2.5 py-0.5 rounded-full font-semibold">
                  02 / RESEARCH SYNTHESIS
                </span>
                <span className="text-[10px] font-mono text-stone-500">analyze_interviews</span>
              </div>
              <h3 className="font-serif text-lg text-stone-900 font-medium">Make sense of what you heard</h3>
              <div className="p-3.5 bg-[#FCFAF7] border border-[#EAE6DF] rounded-lg text-stone-800 font-sans text-xs italic leading-relaxed">
                <span className="not-italic text-[10px] font-mono text-blue-700 block mb-1 font-semibold uppercase">// YOU ASK YOUR AGENT:</span>
                &ldquo;Analyze these selected customer interviews. Show recurring themes, patterns, stakeholder sentiment and conflicting needs, linked to supporting quotations.&rdquo;
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span className="text-stone-700 font-medium">↳ Tangible artifact:</span>
              <span className="text-stone-600">Evidence matrix · Quotation offsets · Gaps</span>
            </div>
          </div>

          {/* Card 3: Persona Rehearsal */}
          <div className="bg-white border border-[#EAE6DF] rounded-xl p-6 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider bg-purple-50 text-purple-800 border border-purple-200/60 px-2.5 py-0.5 rounded-full font-semibold">
                  03 / PERSONA REHEARSAL
                </span>
                <span className="text-[10px] font-mono text-stone-500">chat_with_persona</span>
              </div>
              <h3 className="font-serif text-lg text-stone-900 font-medium">Explore another perspective</h3>
              <div className="p-3.5 bg-[#FCFAF7] border border-[#EAE6DF] rounded-lg text-stone-800 font-sans text-xs italic leading-relaxed">
                <span className="not-italic text-[10px] font-mono text-purple-700 block mb-1 font-semibold uppercase">// YOU ASK YOUR AGENT:</span>
                &ldquo;Create three synthetic personas from this scope, simulate the interviews, then let me discuss this exact draft with the studio manager persona.&rdquo;
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span className="text-stone-700 font-medium">↳ Tangible artifact:</span>
              <span className="text-stone-600">Saved personas · Provenance-linked feedback chat</span>
            </div>
          </div>

          {/* Card 4: Product Delivery Brief */}
          <div className="bg-white border border-[#EAE6DF] rounded-xl p-6 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200/60 px-2.5 py-0.5 rounded-full font-semibold">
                  04 / SHAPE &amp; DELIVER
                </span>
                <span className="text-[10px] font-mono text-stone-500">create_prd</span>
              </div>
              <h3 className="font-serif text-lg text-stone-900 font-medium">Move toward implementation</h3>
              <div className="p-3.5 bg-[#FCFAF7] border border-[#EAE6DF] rounded-lg text-stone-800 font-sans text-xs italic leading-relaxed">
                <span className="not-italic text-[10px] font-mono text-amber-700 block mb-1 font-semibold uppercase">// YOU ASK YOUR AGENT:</span>
                &ldquo;Use this saved analysis and selected market evidence to create a PRD. Add onboarding requirements without losing earlier ones, then prepare an outsourcing brief.&rdquo;
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span className="text-stone-700 font-medium">↳ Tangible artifact:</span>
              <span className="text-stone-600">Versioned PRD · Acceptance criteria · Delivery brief</span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------- Cross-domain use cases ----------------- */}
      <section id="use-cases" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">// CROSS-DOMAIN COGNITIVE INTELLIGENCE</span>
          <h2 className="font-serif text-4xl text-stone-900">One decision layer, many kinds of work</h2>
          <p className="text-stone-600 text-sm">
            AxWise is not limited to software delivery or product management. It can clarify the customer, stakeholder, and ideal executor for operational, commercial, research, healthcare, public-service, and technical goals.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* Card 1 */}
          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 space-y-4 hover:border-emerald-300 transition-all shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">Stakeholder Resolution</h3>
              <p className="text-xs font-mono text-emerald-700 mt-1">Who is this really for?</p>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Turns a vague objective into a structured view of customers, users, buyers, affected stakeholders, desired outcomes, constraints, and unresolved assumptions.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 space-y-4 hover:border-emerald-300 transition-all shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">Evidence-Aware Personas</h3>
              <p className="text-xs font-mono text-emerald-700 mt-1">Customer + ideal executor</p>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Produces operational customer and executor profiles with field-level provenance, confidence, quotes, inferences, and explicit working hypotheses when evidence is incomplete.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 space-y-4 hover:border-emerald-300 transition-all shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center">
              <Code className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">Agent &amp; Team Fit</h3>
              <p className="text-xs font-mono text-emerald-700 mt-1">Recommendation, not execution</p>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Ranks Orqanix Agent Hub profiles against task fit, customer fit, tools, constraints, and evidence—then returns the reason, confidence, and goal-specific persona overlay.
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 space-y-4 hover:border-emerald-300 transition-all shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">Decisions That Improve</h3>
              <p className="text-xs font-mono text-emerald-700 mt-1">Outcome feedback loop</p>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Stores immutable decision records and learns from quality, time, cost, customer reaction, and success signals without silently rewriting the evidence behind earlier recommendations.
            </p>
          </div>

        </div>
      </section>

      {/* ----------------- Package Downloads & Installation ----------------- */}
      <section id="install" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto border-t border-[#EAE6DF]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">
            // ONE ENGINE, TWO WAYS IN
          </span>
          <h2 className="font-serif text-4xl text-stone-900">
            Use the desktop. Or bring your own host.
          </h2>
          <p className="text-stone-600 text-sm">
            AxWise runs as a local extension. Choose Orqanix for a complete desktop environment, or run the standalone release in Goose, Codex, or your own MCP workspace.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Card 1: Orqanix Desktop Route */}
          <div className="lg:col-span-5 bg-white border border-[#EAE6DF] rounded-xl p-7 space-y-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <span className="text-[10px] font-mono uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2.5 py-1 rounded-full font-semibold">
                THE READY-TO-USE ROUTE
              </span>
              <h3 className="font-serif text-2xl text-stone-900 font-medium">Included in Orqanix</h3>
              <p className="text-stone-600 text-sm leading-relaxed">
                The desktop bundles AxWise and its local runtime. Enable the extension when you want its specialist capabilities, and keep working in the same chat.
              </p>
              <p className="text-stone-500 text-xs leading-relaxed">
                Orqanix adds its own sign-in, model access, and shared Results experience. Its service terms and model access are separate from the open-source license.
              </p>
            </div>

            <div className="pt-2">
              <a
                href="https://orqanix.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                Get Orqanix Desktop
                <ExternalLink className="w-4 h-4" />
              </a>
              <span className="block text-[11px] text-stone-500 text-center mt-3">
                Bundled macOS desktop app · Zero terminal setup
              </span>
            </div>
          </div>

          {/* Card 2: Standalone Extension & Packages */}
          <div className="lg:col-span-7 bg-[#1A1A1A] text-stone-200 border border-stone-800 rounded-xl p-7 space-y-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-wider bg-stone-800 text-emerald-400 border border-stone-700 px-2.5 py-1 rounded-full font-semibold">
                FOR YOUR OWN MCP WORKSPACE
              </span>
              <span className="text-xs font-mono text-stone-400 font-medium">
                Version 0.4.2 · Verified release
              </span>
            </div>

            <div>
              <h3 className="font-serif text-2xl text-white font-medium">AxWise FastMCP 0.4.2</h3>
              <p className="text-stone-400 text-xs mt-1 leading-relaxed">
                Lightweight, pure-Python MCP specialist runtime with embedded SQLite storage and zero PostgreSQL/Docker dependencies.
              </p>
            </div>

            {/* Direct Download Links */}
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-emerald-500/50 rounded-lg text-xs font-mono text-emerald-400 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Python wheel (.whl)</span>
                <span className="text-stone-500 text-[10px]">168 KB</span>
              </a>

              <a
                href="https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise-extension-0.4.2.tgz"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-emerald-500/50 rounded-lg text-xs font-mono text-emerald-400 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download npm archive (.tgz)</span>
                <span className="text-stone-500 text-[10px]">173 KB</span>
              </a>
            </div>

            {/* Launch Commands with Copy */}
            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <TerminalIcon className="w-3 h-3 text-emerald-400" />
                    Codex 1-Line Setup
                  </span>
                  <button
                    onClick={() => handleCopy('codex mcp add axwise-local -- uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl axwise', 'codex-cli')}
                    className="hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {copiedCommand === 'codex-cli' ? (
                      <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> Copied!</span>
                    ) : (
                      <span className="flex items-center gap-1 text-stone-400 hover:text-stone-200"><Copy className="w-3 h-3" /> Copy</span>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-stone-950 border border-stone-800 rounded-lg text-stone-300 overflow-x-auto text-[11px] leading-relaxed selection:bg-emerald-900 selection:text-emerald-200">
                  <code>codex mcp add axwise-local -- uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl axwise</code>
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <TerminalIcon className="w-3 h-3 text-emerald-400" />
                    Launch directly with uvx (no install needed)
                  </span>
                  <button
                    onClick={() => handleCopy('uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl axwise', 'uvx')}
                    className="hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {copiedCommand === 'uvx' ? (
                      <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> Copied!</span>
                    ) : (
                      <span className="flex items-center gap-1 text-stone-400 hover:text-stone-200"><Copy className="w-3 h-3" /> Copy</span>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-stone-950 border border-stone-800 rounded-lg text-stone-300 overflow-x-auto text-[11px] leading-relaxed selection:bg-emerald-900 selection:text-emerald-200">
                  <code>uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl axwise</code>
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <TerminalIcon className="w-3 h-3 text-emerald-400" />
                    Or install via pip
                  </span>
                  <button
                    onClick={() => handleCopy('pip install https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl', 'pip')}
                    className="hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {copiedCommand === 'pip' ? (
                      <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> Copied!</span>
                    ) : (
                      <span className="flex items-center gap-1 text-stone-400 hover:text-stone-200"><Copy className="w-3 h-3" /> Copy</span>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-stone-950 border border-stone-800 rounded-lg text-stone-300 overflow-x-auto text-[11px] leading-relaxed selection:bg-emerald-900 selection:text-emerald-200">
                  <code>pip install https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.2/axwise_extension-0.4.2-py3-none-any.whl</code>
                </pre>
              </div>
            </div>

            {/* Checksums Accordion / Details */}
            <details className="text-[11px] font-mono text-stone-400 border border-stone-800 rounded-lg p-3 bg-stone-900/50 cursor-pointer">
              <summary className="hover:text-stone-200 select-none flex items-center justify-between">
                <span>Verified SHA-256 download checksums</span>
                <span className="text-stone-500 text-[10px]">Expand</span>
              </summary>
              <div className="mt-3 pt-3 border-t border-stone-800 space-y-2 text-[10px] text-stone-400 break-all">
                <div>
                  <div className="text-stone-300 font-semibold">Python wheel (.whl · 184,921 bytes):</div>
                  <code className="text-emerald-400/90 font-mono">0855d276cd6d596872f98c03a0f150a912f8d774e9febc6687966cdb88569749</code>
                </div>
                <div>
                  <div className="text-stone-300 font-semibold">npm archive (.tgz · 190,305 bytes):</div>
                  <code className="text-emerald-400/90 font-mono">2ce557643498b9b282701c79aedda1d27619a7ab31dfa4fcc78f8ab44f049ab9</code>
                </div>
              </div>
            </details>

            <ul className="text-[11px] text-stone-400 space-y-1 list-disc pl-4 font-sans leading-relaxed">
              <li>Pure Python: Python 3.11 or newer (uv can provide Python).</li>
              <li>Eliminates the legacy Node.js 22 requirement; zero PostgreSQL or Docker containers needed.</li>
              <li>Embedded SQLite storage (~/.axwise/state/axwise.db) and plain Markdown files.</li>
              <li>Zero-config AI discovery: automatically detects GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ----------------- Ecosystem: Accelerators & Stargazers ----------------- */}
      <EcosystemLogos />

      {/* ----------------- Footer Call to Action ----------------- */}
      <section className="bg-[#1A1A1A] text-[#FCFAF7] px-6 lg:px-16 py-20 text-center border-t border-stone-800">
        <div className="max-w-2xl mx-auto space-y-6">
          <span className="text-xs font-mono text-[#10B981] uppercase tracking-wider font-semibold">// OPEN-SOURCE COGNITIVE LAYER</span>
          <h2 className="font-serif text-4xl">Give every agentic goal grounded context before execution.</h2>
          <p className="text-stone-400 text-sm max-w-lg mx-auto">
            Self-host AxWise or embed its API in your own product and agent stack. For governed end-to-end execution, connect it to an orchestration platform such as Orqanix. Deployment control supports your security and governance programme; it does not replace it.
          </p>
          <div className="pt-4 flex flex-wrap justify-center gap-4">
            <a
              href="https://github.com/AxWise-GmbH/axwise-flow"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-[#FCFAF7] hover:bg-stone-100 text-[#1A1A1A] rounded-md font-medium text-sm flex items-center gap-2 transition-all shadow-md"
            >
              Explore AxWise on GitHub
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="/docs"
              className="px-6 py-3 border border-stone-700 hover:border-stone-500 rounded-md font-medium text-sm text-stone-300 hover:text-white transition-all"
            >
              View Documentation
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-[#121212] text-stone-500 px-6 lg:px-16 py-8 border-t border-stone-900 text-xs flex flex-wrap justify-between items-center">
        <div>© 2026 AxWise. AxWise Flow is licensed under Apache 2.0.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="/privacy-policy" className="hover:text-stone-300">Privacy Policy</a>
          <a href="/terms-of-service" className="hover:text-stone-300">Terms of Service</a>
          <a href="/impressum" className="hover:text-stone-300">Impressum</a>
        </div>
      </footer>

    </div>
  );
}
