'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, Target, Shield, Upload, FileText, Play,
  Loader2, Check, AlertCircle, Sparkles, MessageSquare,
  DollarSign, Activity, Lock, ArrowRight, BookOpen, Send, CheckCircle
} from 'lucide-react';

interface SimulatedPerson {
  name: string;
  role: string;
  age: number;
  background: string;
  avatar: string;
  motivations: string[];
  pain_points: string[];
  communication_style: string;
  ocean: {
    o: number;
    c: number;
    e: number;
    a: number;
    n: number;
  };
  partition: string;
  active_rules: string[];
}

export default function OrqalyConsole(): JSX.Element {
  // 1. Digital Twins Registry
  const twins: SimulatedPerson[] = [
    {
      name: "Veronika Horvat",
      role: "Chief Financial Officer (CFO)",
      age: 45,
      background: "Slovenian corporate finance director with strict budgeting principles. Manages corporate cash flows and unit-economic risk assessments.",
      avatar: "👩‍💼",
      motivations: ["Maximizing runway", "Detailed ROI calculations", "Quantifying project risk profiles"],
      pain_points: ["Fragile, unmonitored workflows", "Lack of clear audit logs", "Database sync drift during OOO"],
      communication_style: "Formal, direct, highly analytical, completely devoid of emojis.",
      ocean: { o: 0.53, c: 0.87, e: 0.49, a: 0.58, n: 0.26 },
      partition: "finance-q2-planning-and-ledgers",
      active_rules: [
        "Manual redirects over $10,000 require two-tier executive signatures.",
        "Operational cost anomalies trigger JIT Slack audits.",
        "Monthly burn budget is capped at $45,000 USD."
      ]
    },
    {
      name: "Clara Dubois",
      role: "Lead Product Designer",
      age: 37,
      background: "UX expert focused on user onboarding, design-to-development handoffs, and visual identity token consistency.",
      avatar: "👩‍🎨",
      motivations: ["Design system alignment", "Polished onboarding conversion flows", "Consistent visual styling"],
      pain_points: ["Disjointed assets folders", "Lack of developer component specs", "OOO bottlenecking on asset handoffs"],
      communication_style: "Enthusiastic, descriptive, collaborative, highly visual.",
      ocean: { o: 0.85, c: 0.58, e: 0.72, a: 0.76, n: 0.41 },
      partition: "product-onboarding-design-flows",
      active_rules: [
        "All visual components must adhere to the 2026 Inter-system design token standard.",
        "Onboarding screens require formal UX feedback loops before development."
      ]
    },
    {
      name: "Marcus Chen",
      role: "Lead Platform Security & CISO",
      age: 42,
      background: "Cybersecurity specialist focused on sandboxed runtime isolation, container protection, and strict identity governance.",
      avatar: "👨‍💻",
      motivations: ["Zero-trust security models", "Container isolation", "Tamper-proof audit logs"],
      pain_points: ["Unauthorized API privilege escalations", "Unvetted prompt injections", "Tool abuse vulnerabilities"],
      communication_style: "Extremely concise, highly technical, skeptical.",
      ocean: { o: 0.55, c: 0.80, e: 0.40, a: 0.42, n: 0.50 },
      partition: "platform-security-and-rbac-policies",
      active_rules: [
        "All third-party tool connections require strict gVisor/Docker container sandboxing.",
        "Developers are strictly barred from querying financial employee salary database sheets."
      ]
    }
  ];

  const [selectedTwin, setSelectedTwin] = useState<SimulatedPerson>(twins[0]);
  
  // 2. Cognitive Grounding State (Phase 2 Uploads)
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ [key: string]: string[] }>({
    "finance-q2-planning-and-ledgers": ["Q2_Budget_Projections_v4.pdf", "Munich_Logistics_SOP_v2.md"],
    "product-onboarding-design-flows": ["Header_Specs_Final.pdf", "Design_System_Tokens.json"],
    "platform-security-and-rbac-policies": ["Zero_Trust_VPC_Guidelines.pdf"]
  });
  const [newFileName, setNewFile] = useState("");

  // 3. Execution Playground State (Orqaly Task Delegator)
  const [taskPrompt, setTaskPrompt] = useState("Hey Veronika, can we approve cargo batch #8821 priority redirect? Estimated cost is $12,500.");
  const [budgetCap, setBudgetCap] = useState("15,000");
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeLedger, setActiveLedger] = useState<any[]>([]);

  // Pre-seed some default logs to make the console look functional on turn 1
  useEffect(() => {
    setActiveLedger([
      {
        timestamp: "2026-07-01 20:10:02",
        type: "SYSTEM",
        detail: "Orqaly Operational Console online. Twin Registry successfully instantiated with 3 Active Twins.",
        icon: "🟢"
      },
      {
        timestamp: "2026-07-01 20:12:15",
        type: "SECURITY",
        detail: "Zero-Trust gVisor Container Isolation verification: OK.",
        icon: "🛡️"
      }
    ]);
  }, []);

  const handleUpload = () => {
    if (!newFileName.trim()) return;
    setIsUploading(true);
    setTimeout(() => {
      setUploadedFiles(prev => ({
        ...prev,
        [selectedTwin.partition]: [...(prev[selectedTwin.partition] || []), newFileName.trim()]
      }));
      setActiveLedger(prev => [
        {
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          type: "GROUNDING",
          detail: `Ingested '${newFileName.trim()}' into namespaced partition '${selectedTwin.partition}'. Vector index computed successfully.`,
          icon: "📚"
        },
        ...prev
      ]);
      setNewFile("");
      setIsUploading(false);
    }, 1500);
  };

  const handleExecuteTask = () => {
    if (!taskPrompt.trim()) return;
    setIsExecuting(true);
    
    // Simulate real-time multi-agent execution & ledger commits
    const steps = [
      { delay: 1000, type: "COUNCIL", icon: "🧠", detail: "Consilium (Board Council) parsing instruction and initializing pipeline..." },
      { delay: 2200, type: "GROUNDING", icon: "🔍", detail: `Performing cosine similarity search against namespaced partition '${selectedTwin.partition}' using text-embedding-004...` },
      { delay: 3500, type: "SECURITY", icon: "🔑", detail: `RBAC gateway checking caller credentials against security policies...` },
      { delay: 4800, type: "TWIN", icon: "💬", detail: `Twin ${selectedTwin.name} activated with OCEAN profiles (C: ${selectedTwin.ocean.c}, E: ${selectedTwin.ocean.e}). Preparing in-character execution response...` }
    ];

    steps.forEach(step => {
      setTimeout(() => {
        setActiveLedger(prev => [
          {
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            type: step.type,
            detail: step.detail,
            icon: step.icon
          },
          ...prev
        ]);
      }, step.delay);
    });

    setTimeout(() => {
      // Create grounded output based on who is selected and the query
      let answer = "";
      if (selectedTwin.name === "Veronika Horvat") {
        if (taskPrompt.toLowerCase().includes("salary") || taskPrompt.toLowerCase().includes("payroll")) {
          answer = "ACCESS DENIED. I cannot share salary details or payroll reports with you. Your role (Developer) does not have Finance-tier read clearance. This incident has been logged for CISO audit.";
        } else {
          answer = "I cannot approve cargo batch #8821 priority redirect immediately. Per 'Munich_Logistics_SOP_v2.md', page 12, manual redirects exceeding $10,000 require two-tier executive signatures. Please provide the estimated ROI and payback period so I can model the trade-off. This request has been logged in the audit database.";
        }
      } else if (selectedTwin.name === "Clara Dubois") {
        answer = "Header components must stick to standard spacing tokens. According to 'Header_Specs_Final.pdf' page 3, heights must be exactly 64px with padding set at 16px 24px and border-radius set to 12px. Please push the changes directly to Figma branch v7.";
      } else {
        answer = "WASM sandboxing requires strict gVisor process boundaries. Running tool actions on raw host files is blocked by policy. I have logged this deployment block to the zero-trust system trace.";
      }

      setActiveLedger(prev => [
        {
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          type: "DELIVERY",
          detail: `Twin Response: "${answer}" | [Total Cost: $0.045 USD | Tokens: 1,821]`,
          icon: "📦"
        },
        ...prev
      ]);
      setIsExecuting(false);
    }, 5500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto min-h-screen p-6 space-y-6">
      
      {/* Top Banner Branding */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-slate-900 border border-emerald-500/20 rounded-2xl gap-4 shadow-2xl shadow-emerald-950/10">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Orqaly Operational Console</h1>
              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-full">v1.2.6</span>
            </div>
            <p className="text-slate-400 text-sm mt-0.5">Ground, test, and delegate operations to secure, auditable, personality-modulated digital twins.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-center">
            <div className="text-emerald-400 font-mono font-bold text-lg">$14.22</div>
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Today's Token Burn</div>
          </div>
          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-center">
            <div className="text-emerald-400 font-mono font-bold text-lg">3 / 3</div>
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Twins Online</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Digital Twin Registry */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 flex flex-col h-fit">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Users className="h-5 w-5 text-emerald-400" />
            <h2 className="font-bold text-lg">Active Twin Registry</h2>
          </div>
          <p className="text-xs text-slate-400">Select an active twin to review their behavioral traits, connected files, and security policies.</p>
          
          <div className="space-y-3">
            {twins.map(twin => (
              <div 
                key={twin.name}
                onClick={() => setSelectedTwin(twin)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedTwin.name === twin.name 
                    ? 'bg-slate-950 border-emerald-500/40 shadow-lg shadow-emerald-950/20' 
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{twin.avatar}</span>
                    <div>
                      <h3 className="font-bold text-sm text-slate-100">{twin.name}</h3>
                      <p className="text-[11px] text-emerald-400 font-medium">{twin.role}</p>
                    </div>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full ${
                    selectedTwin.name === twin.name ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {selectedTwin.name === twin.name ? 'Active' : 'Offline'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Persona Behavioral Specs Card */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Behavioral DNA (OCEAN Fit)</h4>
            
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Openness</span>
                  <span className="text-emerald-400 font-bold">{selectedTwin.ocean.o.toFixed(2)}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full" style={{ width: `${selectedTwin.ocean.o * 100}%` }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Conscientiousness</span>
                  <span className="text-emerald-400 font-bold">{selectedTwin.ocean.c.toFixed(2)}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full" style={{ width: `${selectedTwin.ocean.c * 100}%` }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Extraversion</span>
                  <span className="text-emerald-400 font-bold">{selectedTwin.ocean.e.toFixed(2)}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full" style={{ width: `${selectedTwin.ocean.e * 100}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Agreeableness</span>
                  <span className="text-emerald-400 font-bold">{selectedTwin.ocean.a.toFixed(2)}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full" style={{ width: `${selectedTwin.ocean.a * 100}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Neuroticism</span>
                  <span className="text-emerald-400 font-bold">{selectedTwin.ocean.n.toFixed(2)}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full" style={{ width: `${selectedTwin.ocean.n * 100}%` }}></div>
                </div>
              </div>
            </div>
            
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] text-slate-400">Communication Style: </span>
              <p className="text-xs italic text-slate-300 mt-1">"{selectedTwin.communication_style}"</p>
            </div>
          </div>
        </div>

        {/* Center/Right Area: Grounding & Playground */}
        <div className="lg:col-span-2 space-y-6 flex flex-col">
          
          {/* Top Panel: Grounding Partition Upload */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-emerald-400" />
                <h2 className="font-bold text-lg">Cognitive Grounding: {selectedTwin.name}'s Partition</h2>
              </div>
              <span className="text-xs bg-slate-950 px-3 py-1 rounded-md text-emerald-400 border border-slate-800 font-mono">
                {selectedTwin.partition}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Connected Rules & SOPs</h4>
                  <ul className="space-y-1.5">
                    {(uploadedFiles[selectedTwin.partition] || []).map(file => (
                      <li key={file} className="text-xs flex items-center gap-2 text-slate-300">
                        <FileText className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="truncate">{file}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800/60">
                  <p className="text-[10px] text-slate-500">Every upload triggers a sliding-window text split and a pgvector HNSW database mapping.</p>
                </div>
              </div>

              {/* Upload Input */}
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 border-dashed flex flex-col justify-center items-center text-center gap-3">
                <Upload className="h-8 w-8 text-slate-500" />
                <div className="w-full max-w-xs space-y-2">
                  <input 
                    type="text" 
                    value={newFileName}
                    onChange={(e) => setNewFile(e.target.value)}
                    placeholder="e.g. Shipping_Rules_v3.pdf"
                    className="w-full text-xs bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                  <button 
                    onClick={handleUpload}
                    disabled={isUploading || !newFileName.trim()}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Ingesting file...
                      </>
                    ) : (
                      <>
                        Incorporate New Rules (RAG)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Panel: Task Execution Playground */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex-grow flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Play className="h-5 w-5 text-emerald-400" />
                <h2 className="font-bold text-lg">Task Delegator & Executor Playground</h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Budget Limit:</span>
                <div className="flex items-center bg-slate-950 px-2 py-1 rounded border border-slate-800">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                  <input 
                    type="text" 
                    value={budgetCap}
                    onChange={(e) => setBudgetCap(e.target.value)}
                    className="w-12 bg-transparent text-slate-200 focus:outline-none font-mono font-bold text-right"
                  />
                  <span className="text-slate-500 ml-1">USD</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <textarea 
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder="Delegate an operational task or query to this twin..."
                  className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>Targets Grounded Partition: <code className="text-emerald-400 font-mono">{selectedTwin.partition}</code></span>
                  <span>Max Budget Cap active.</span>
                </div>
              </div>

              <div className="flex flex-col justify-end md:w-32">
                <button
                  onClick={handleExecuteTask}
                  disabled={isExecuting || !taskPrompt.trim()}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-slate-950 font-bold rounded-xl flex flex-col items-center justify-center gap-1 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-[10px]">Processing...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      <span className="text-xs">Delegate Task</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Live Ledger / Audit Log */}
            <div className="flex-grow flex flex-col space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">Secure Live Audit Ledger</h3>
              </div>
              
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 h-64 overflow-y-auto font-mono text-xs text-slate-300 space-y-3">
                {activeLedger.map((log, index) => (
                  <div key={index} className="flex items-start gap-3 py-1 border-b border-slate-900 last:border-b-0 hover:bg-slate-900/40 px-2 rounded transition-colors">
                    <span className="flex-shrink-0">{log.icon}</span>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span className="font-semibold text-emerald-500/80">[{log.type}]</span>
                        <span>{log.timestamp}</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed break-words">{log.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
