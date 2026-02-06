'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Navigation } from '@/components/layout/Navigation';
import { Footer } from '@/components/layout/Footer';
import { Button3D } from '@/components/layout/Button3D';
import { CodeCarousel } from '@/components/b2b/CodeCarousel';
import { ChevronRight, ShieldCheck, Zap, Users, BarChart3, Lock, Server } from 'lucide-react';

export default function B2BPage() {
    const features = [
        {
            title: "Research at Lightning Speed",
            description: "Generate unlimited interviews in hours instead of weeks.",
            icon: Zap,
        },
        {
            title: "Demographically Realistic",
            description: "Grounded in real-world distributions, not random generation.",
            icon: Users,
        },
        {
            title: "Conflict Simulation",
            description: "Model complex organizational dynamics and multi-stakeholder conflicts.",
            icon: BarChart3,
        },
        {
            title: "Zero Privacy Risk",
            description: "100% synthetic data with absolutely no PII concerns.",
            icon: Lock,
        },
        {
            title: "Enterprise Governance",
            description: "Column-level lineage and quality monitoring for compliance.",
            icon: ShieldCheck,
        },
        {
            title: "Lakehouse Native",
            description: "Deployed directly in your secure environment.",
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
                            The Behavioral Simulation Engine <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                                for Enterprise Decisions
                            </span>
                        </h1>
                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
                            Generate reliable, compliant synthetic datasets on demand in your own lakehouse,
                            powered by the AxWise engine that turns slow qualitative research into a quantitative capability.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <Button3D href="https://tidycal.com/team/axwise/demo" size="lg">
                                Schedule Architecture Review
                            </Button3D>
                            <Button3D variant="secondary" size="lg" href="#">
                                Download Sample Dataset
                            </Button3D>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Persona Dataset Highlights */}
            <section className="pt-8 pb-24 bg-gradient-to-b from-background to-blue-950/20">
                <CodeCarousel />
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
