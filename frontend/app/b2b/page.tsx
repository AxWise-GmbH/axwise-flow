'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Navigation } from '@/components/layout/Navigation';
import { Footer } from '@/components/layout/Footer';
import { Button3D } from '@/components/layout/Button3D';
import { ShieldCheck, Zap, Users, BarChart3, Target, Server } from 'lucide-react';

export default function B2BPage() {
    const features = [
        {
            title: "Resolve the Real Customer",
            description: "Turn an underspecified goal into customers, users, buyers, stakeholders, pains, outcomes, and constraints.",
            icon: Zap,
        },
        {
            title: "Model the Ideal Executor",
            description: "Define the experience, capabilities, tools, communication style, and boundaries the work actually requires.",
            icon: Users,
        },
        {
            title: "Rank Agents and Teams",
            description: "Compare authenticated Orqaly Agent Hub profiles using task, customer, tool, constraint, and evidence fit.",
            icon: BarChart3,
        },
        {
            title: "Keep Evidence Inspectable",
            description: "Separate source quotes, derived inferences, and working hypotheses with field-level confidence and provenance.",
            icon: Target,
        },
        {
            title: "Preserve the Trust Boundary",
            description: "AxWise recommends; Orqaly owns tenant authorization, approvals, budgets, connectors, and execution.",
            icon: ShieldCheck,
        },
        {
            title: "Self-Host the Decision Layer",
            description: "Run the open-source API in your environment and retain control of the decision context and evidence data plane.",
            icon: Server,
        },
    ];

    return (
        <div className="min-h-screen bg-background">
            <Navigation />
            {/* Hero Section */}
            <section className="relative overflow-hidden pt-32 pb-12 lg:pt-48 lg:pb-16">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background" />
                <div className="container relative mx-auto px-4 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h1 className="text-4xl lg:text-7xl font-bold tracking-tight mb-8">
                            The cognitive decision layer <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                                for agentic operations
                            </span>
                        </h1>
                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
                            AxWise turns vague operational goals into evidence-aware customer context, ideal executor profiles, and traceable agent or team recommendations. Orqaly plans, authorizes, and executes the work.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <Button3D href="https://calendar.app.google/LTCGuJt8RBN7XrD47" size="lg">
                                Schedule Architecture Review
                            </Button3D>
                            <Button3D variant="secondary" size="lg" href="/docs">
                                Read Integration Docs
                            </Button3D>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-24">
                <div className="container mx-auto px-4">
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="p-6 rounded-2xl border bg-card/50 backdrop-blur-sm hover:border-blue-500/50 transition-colors group"
                            >
                                <feature.icon className="w-10 h-10 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                                <p className="text-muted-foreground">{feature.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>
            <Footer />
        </div>
    );
}
