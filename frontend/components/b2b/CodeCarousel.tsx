'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Copy, FileJson, Table } from 'lucide-react';
import { cn } from '@/lib/utils';

const HIGHLIGHTS_DATA = [
    {
        id: 'erpImplementation',
        label: 'ERP',
        title: 'ERP implementations (SAP / Oracle / IFS)',
        filename: 'stuttgart-erp-implementation-sample',
        content: {
            businessIdea: "Help enterprises plan and execute ERP implementations (SAP, Oracle, IFS) with multi-stakeholder alignment.",
            primaryPersona: "The Holistic De-Risking Orchestrator - de-risks technical, financial, operational, and human dimensions through robust alignment and transparent governance.",
            problem: "Legacy ERPs are out of support; 18–36 month, $5–50M programs are slowed by internal politics, misaligned ROI expectations, downtime risk, and change-management complexity.",
            themes: [
                "Legacy ERP technical debt & modernization imperative",
                "Multi-stakeholder alignment and transparent governance",
                "Operational disruption, downtime risk, and change-management complexity"
            ],
            stakeholders: [
                "CIO / CTO",
                "CFO / Finance Transformation Lead",
                "Operations & Plant Leadership",
                "HR / Change Management"
            ],
            decisionGates: [
                "Tooling & vendor selection",
                "Blueprint sign-off and scope freeze",
                "Cutover strategy and hypercare plan"
            ],
            successMetrics: {
                valueRealizationHorizon: "24–36 months",
                targetDowntimeReductionPct: 35,
                targetOpexReductionPct: 12,
                stakeholderAlignmentIndex: 0.82
            },
            riskSignals: [
                "No single owner for cross-functional decision rights",
                "Conflicting success metrics between finance and operations",
                "Under-resourced change-management budget"
            ],
            keyQuote: "A structured service that acts as an impartial orchestrator, bringing those disparate priorities into alignment... would significantly de-risk the entire project.",
            exampleInterview: {
                interviewId: "ERP-DE-001",
                company: "Stuttgart Components GmbH",
                location: "Stuttgart, Germany",
                role: "Program Lead ERP Transformation",
                currentERP: "SAP ECC 6.0",
                targetERP: "SAP S/4HANA",
                budgetEurMillions: 18,
                goLiveHorizonMonths: 24
            }
        },
        parquetSchema: `// Parquet projection: stuttgart-erp-implementation-sample
root
 |-- dataset: string
 |-- interview_id: string
 |-- company: string
 |-- location: string
 |-- role: string
 |-- current_erp: string
 |-- target_erp: string
 |-- budget_eur: double
 |-- go_live_horizon_months: int
 |-- key_problems: array<string>
 |    |-- element: string
 |-- stakeholders: array<string>
 |    |-- element: string
 |-- quote: string`
    },
    {
        id: 'supplier',
        label: 'Supplier',
        title: 'Supplier consolidation & resilience',
        filename: 'global-supply-chain-risk-sample',
        content: {
            businessIdea: "Optimize supplier base for resilience and cost efficiency across global manufacturing hubs.",
            primaryPersona: "The Strategic Sourcing Architect - balances cost savings with supply chain robustness and ethical compliance.",
            problem: "Fragmented supplier networks lead to 15-20% higher costs and increased vulnerability to geopolitical shocks.",
            themes: [
                "Supply chain resilience & diversification",
                "Cost optimization via consolidation",
                "ESG compliance & vendor transparency"
            ],
            stakeholders: [
                "Chief Procurement Officer",
                "VP of Supply Chain",
                "Sustainability Director",
                "Regional Operations Heads"
            ],
            keyQuote: "We need to move from transactional relationships to strategic partnerships, but we lack the visibility to identify who our critical partners truly are.",
        },
        parquetSchema: `// Parquet projection: stuttgart-supplier-consolidation-sample interview
root
 |-- dataset: string
 |-- interview_id: string
 |-- company: string
 |-- location: string
 |-- persona: struct
 |    |-- name: string
 |    |-- role: string
 |    |-- archetype: string
 |-- objective: string
 |-- constraints: struct
 |    |-- max_concentration_per_category_pct: double
 |    |-- min_geographic_regions_per_critical_part: int
 |    |-- min_dual_source_coverage_pct: double
 |-- themes: array<string>
 |    |-- element: string
 |-- current_risks: array<string>
 |    |-- element: string
 |-- quote: string`
    },
    {
        id: 'industry',
        label: 'Industry',
        title: 'Industry 4.0 / IoT & predictive maintenance',
        filename: 'smart-factory-iot-sample',
        content: {
            businessIdea: "Implement predictive maintenance via IoT sensors to reduce unplanned downtime in automotive manufacturing.",
            primaryPersona: "The Digital Factory Transformation Lead - bridges the gap between OT and IT to drive operational excellence.",
            problem: "Unplanned equipment failure costs $22k/minute in lost production; preventive maintenance is too costly and inefficient.",
            themes: [
                "IT/OT convergence challenges",
                "Data silo integration",
                "Workforce upskilling for digital tools"
            ],
            stakeholders: [
                "Plant Manager",
                "Head of Maintenance",
                "IT Infrastructure Lead",
                "Production Scheduler"
            ],
            keyQuote: "The sensors are there, but the insights are trapped in proprietary systems. We need a unified view to predict failures before they stop the line.",
        },
        parquetSchema: `// Parquet projection: smart-factory-iot-sample
root
 |-- dataset: string
 |-- interview_id: string
 |-- factory_id: string
 |-- location: string
 |-- role: string
 |-- machine_type: string
 |-- sensor_protocol: string
 |-- downtime_cost_per_min: double
 |-- maintenance_strategy: string
 |-- challenges: array<string>
 |    |-- element: string
 |-- quote: string`
    }
];

export function CodeCarousel() {
    const [activeTab, setActiveTab] = useState(0);
    const [format, setFormat] = useState<'json' | 'parquet'>('json');
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            setActiveTab((prev) => (prev + 1) % HIGHLIGHTS_DATA.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [isPaused]);

    const activeData = HIGHLIGHTS_DATA[activeTab];
    const fileExtension = format === 'json' ? '.json' : '.parquet';

    const renderParquet = () => (
        <pre className="font-mono text-xs leading-relaxed opacity-90 text-blue-200">
            {activeData.parquetSchema}
        </pre>
    );

    return (
        <div className="w-full max-w-6xl mx-auto p-4 lg:p-8" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
            <div className="flex flex-col lg:flex-row gap-12 items-start">
                {/* Left Side: Info & Tabs */}
                <div className="w-full lg:w-1/3 space-y-8">
                    <div>
                        <h2 className="text-sm font-bold tracking-widest text-blue-500 mb-2">PERSONA DATASET HIGHLIGHTS</h2>
                        <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                            {activeData.title}
                        </h3>
                    </div>

                    <div className="flex flex-col gap-2">
                        {HIGHLIGHTS_DATA.map((item, index) => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setActiveTab(index);
                                    setIsPaused(true);
                                }}
                                className={cn(
                                    "text-left px-6 py-4 rounded-xl transition-all duration-300 border",
                                    activeTab === index
                                        ? "bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-105 origin-left"
                                        : "bg-transparent border-transparent text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white"
                                )}
                            >
                                <div className="font-semibold">{item.label}</div>
                                <div className="text-xs opacity-70 truncate max-w-[200px]">{item.title}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Side: Code Window */}
                <div className="w-full lg:w-2/3 relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                    <div className="relative bg-[#0F1117] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
                        {/* Window Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"></div>
                                <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                                <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
                            </div>
                            <div className="text-xs text-gray-400 font-mono flex items-center gap-2">
                                {format === 'json' ? <FileJson size={12} /> : <Table size={12} />}
                                {activeData.filename}{fileExtension}
                            </div>
                            <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/10">
                                <button
                                    onClick={() => setFormat('json')}
                                    className={cn(
                                        "px-2 py-0.5 text-[10px] font-bold rounded-md transition-all",
                                        format === 'json' ? "bg-blue-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    JSON
                                </button>
                                <button
                                    onClick={() => setFormat('parquet')}
                                    className={cn(
                                        "px-2 py-0.5 text-[10px] font-bold rounded-md transition-all",
                                        format === 'parquet' ? "bg-blue-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    PARQUET
                                </button>
                            </div>
                        </div>

                        {/* Code Content */}
                        <div className="p-6 overflow-x-auto min-h-[400px] max-h-[600px] custom-scrollbar">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={`${activeData.id}-${format}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {format === 'json' ? (
                                        <pre className="font-mono text-sm leading-relaxed text-gray-300">
                                            <code>
                                                <span className="text-purple-400">const</span> <span className="text-blue-300">{activeData.id}Highlights</span> = <span className="text-yellow-300">{JSON.stringify(activeData.content, null, 2)}</span>;
                                            </code>
                                        </pre>
                                    ) : (
                                        renderParquet()
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Status Bar */}
                        <div className="bg-white/5 px-4 py-2 border-t border-white/5 flex justify-between text-[10px] text-gray-500 font-mono">
                            <div>Ln 1, Col 1</div>
                            <div>UTF-8</div>
                            <div>JavaScript</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
