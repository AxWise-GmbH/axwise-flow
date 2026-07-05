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
        id: 'spatial',
        label: 'Spatial Analytics',
        title: 'Airport Navigation & Spatial Flow Analysis',
        filename: 'airport-terminal-flow-sample',
        content: {
            businessIdea: "Optimize terminal layouts and security checkpoints by simulating passenger flow and analyzing real video feeds.",
            primaryPersona: "The Terminal Operations Architect - balances passenger throughput with security mandates and commercial revenue.",
            problem: "Bottlenecks in security and retail zones cause 15% revenue loss and decrease passenger satisfaction scores.",
            themes: [
                "Real-time video stream ingestion & spatial mapping",
                "Predictive bottleneck simulation",
                "Retail conversion optimization via flow adjustments"
            ],
            stakeholders: [
                "VP of Airport Operations",
                "Chief Commercial Officer",
                "Head of Security",
                "Aviation Authority Liaisons"
            ],
            keyQuote: "If we can simulate the impact of moving the duty-free entrance based on Saturday morning's video feeds, we can recover millions in lost dwell time."
        },
        parquetSchema: `// Parquet projection: airport-terminal-flow-sample
root
 |-- dataset: string
 |-- terminal_id: string
 |-- simulation_timestamp: timestamp
 |-- passenger_persona: struct
 |    |-- type: string
 |    |-- stress_tolerance_index: double
 |    |-- dwell_time_minutes: int
 |-- spatial_coordinates: struct
 |    |-- x_map: double
 |    |-- y_map: double
 |    |-- zone_type: string
 |-- bottleneck_probability_pct: double
 |-- projected_retail_conversion_pct: double
 |-- quote: string`
    },
    {
        id: 'ecommerce',
        label: 'E-Commerce',
        title: 'Cart Abandonment & Dynamic Pricing',
        filename: 'global-retail-checkout-sample',
        content: {
            businessIdea: "Decrease cart abandonment rates through real-time behavioral simulation and dynamic pricing triggers.",
            primaryPersona: "The Conversion Rate Optimization Lead - obsessed with frictionless checkout and maximizing lifetime value.",
            problem: "70% of high-intent carts are abandoned at the shipping calculation step, costing $12M annually in lost revenue.",
            themes: [
                "Frictionless localized checkout experiences",
                "Price elasticity and dynamic discount triggers",
                "Post-purchase retention engines"
            ],
            stakeholders: [
                "VP of E-Commerce",
                "Head of Performance Marketing",
                "Fraud & Risk Manager",
                "Supply Chain Director"
            ],
            keyQuote: "We are losing customers seconds before the swipe. We need to instantly simulate thousands of checkout flows to pinpoint the exact pricing threshold that converts."
        },
        parquetSchema: `// Parquet projection: global-retail-checkout-sample
root
 |-- dataset: string
 |-- session_id: string
 |-- cart_value_usd: double
 |-- user_segment: string
 |-- geographic_region: string
 |-- dropoff_step: string
 |-- simulated_price_elasticity: double
 |-- optimal_discount_pct: double
 |-- conversion_probability: double
 |-- quote: string`
    },
    {
        id: 'automotive',
        label: 'Automotive',
        title: 'In-Cabin UX & Autonomous Trust',
        filename: 'ev-cabin-experience-sample',
        content: {
            businessIdea: "Design intuitive in-cabin software interfaces that build driver trust in Level 3 and 4 autonomous systems.",
            primaryPersona: "The Human-Machine Interface (HMI) Designer - focuses on cognitive load and seamless driver-to-vehicle handoffs.",
            problem: "Drivers disengage autonomous features due to confusing UI alerts and lack of transparency regarding the system's intent.",
            themes: [
                "Cognitive load during autonomous handoffs",
                "Gaze tracking and driver attention metrics",
                "Auditory vs. visual alert effectiveness"
            ],
            stakeholders: [
                "Head of Autonomous Driving",
                "VP of User Experience Design",
                "Safety & Compliance Officer",
                "Chief Software Engineer"
            ],
            keyQuote: "If the car needs the driver to take the wheel at 70mph, the screen can't just beep. We need to simulate the cognitive panic and design a UX that builds instant system trust."
        },
        parquetSchema: `// Parquet projection: ev-cabin-experience-sample
root
 |-- dataset: string
 |-- simulation_id: string
 |-- autonomy_level: string
 |-- event_type: string
 |-- driver_gaze_zone: string
 |-- cognitive_load_index: double
 |-- handoff_reaction_time_ms: int
 |-- ui_alert_modality: string
 |-- system_trust_score: double
 |-- quote: string`
    },
    {
        id: 'adtech',
        label: 'AdTech',
        title: 'Privacy-First Ad Bidding Simulation',
        filename: 'cookieless-bidding-algorithm-sample',
        content: {
            businessIdea: "Optimize real-time bidding algorithms using synthetic consumer cohorts in a cookieless, privacy-first ecosystem.",
            primaryPersona: "The Programmatic Yield Optimizer - balances publisher revenue with strict multi-region privacy compliance.",
            problem: "The deprecation of third-party cookies is degrading targeting accuracy, leading to a 25% drop in ROAS (Return on Ad Spend) for major brands.",
            themes: [
                "Synthetic cohort generation & clean rooms",
                "Zero-party data utilization",
                "Algorithmic bid pacing and yield management"
            ],
            stakeholders: [
                "Chief Revenue Officer",
                "Head of Programmatic Media",
                "Data Privacy Officer",
                "Brand Agency Partner"
            ],
            keyQuote: "Without tracking pixels, we're flying blind. We must deploy synthetic cohorts that perfectly mimic our target segments so we can train our bidding models without touching PII."
        },
        parquetSchema: `// Parquet projection: cookieless-bidding-algorithm-sample
root
 |-- dataset: string
 |-- bid_request_id: string
 |-- synthetic_cohort_id: string
 |-- simulated_intent_score: double
 |-- context_category: string
 |-- privacy_framework: string
 |-- predicted_ctr: double
 |-- optimal_cpm_bid: double
 |-- conversion_likelihood: double
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
                                    key={`${activeData.id} - ${format}`}
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
