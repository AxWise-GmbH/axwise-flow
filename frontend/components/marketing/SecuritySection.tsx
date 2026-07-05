import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Lock, Eye, Server, FileCheck, Users } from 'lucide-react';
import { ComplianceBadges } from '@/components/ui/ComplianceBadges';

export const SecuritySection = () => {
  const securityFeatures = [
    {
      icon: Lock,
      title: "End-to-End Encryption",
      description: "All data is encrypted in transit and at rest using AES-256 encryption",
      details: "Your interview data is protected with bank-grade encryption from upload to analysis."
    },
    {
      icon: Shield,
      title: "SOC 2 Type II Compliance",
      description: "Independently audited security controls and processes",
      details: "We maintain the highest standards for security, availability, and confidentiality."
    },
    {
      icon: Eye,
      title: "Zero Data Retention",
      description: "Your data is processed and deleted according to your preferences",
      details: "You control how long your data stays in our system, with automatic deletion options."
    },
    {
      icon: Server,
      title: "Data Residency Control",
      description: "Choose where your data is processed and stored",
      details: "Select from multiple geographic regions to meet your compliance requirements."
    },
    {
      icon: FileCheck,
      title: "GDPR & CCPA Compliant",
      description: "Full compliance with global privacy regulations",
      details: "Built-in privacy controls and data subject rights management."
    },
    {
      icon: Users,
      title: "Role-Based Access Control",
      description: "Granular permissions and access management",
      details: "Control who can access what data with fine-grained permission settings."
    }
  ];

  // Certifications are now handled by the ComplianceBadges component

  const dataHandling = [
    {
      phase: "Upload",
      description: "Files encrypted during transfer",
      security: "TLS 1.3 encryption"
    },
    {
      phase: "Processing",
      description: "Analysis in secure, isolated environments",
      security: "Zero-trust architecture"
    },
    {
      phase: "Storage",
      description: "Encrypted at rest with key rotation",
      security: "AES-256 encryption"
    },
    {
      phase: "Access",
      description: "Multi-factor authentication required",
      security: "Role-based permissions"
    },
    {
      phase: "Deletion",
      description: "Secure deletion with verification",
      security: "Cryptographic erasure"
    }
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center mb-16">
          <Badge variant="default" className="mb-4">Security & Privacy</Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            <span className="text-primary">Enterprise-Grade</span> Security You Can Trust
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Your user research data is sensitive. We protect it with the same level of security
            used by banks and healthcare organizations.
          </p>
        </div>

        {/* Security Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {securityFeatures.map((feature, index) => (
            <Card key={index} className="border-primary/20 hover:border-primary/40 transition-colors">
              <CardContent className="p-6">
                <div className="w-12 h-12 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{feature.description}</p>
                <p className="text-xs text-muted-foreground">{feature.details}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Data Handling Process */}
        <div className="bg-muted/30 rounded-2xl p-8 md:p-12 mb-16">
          <h3 className="text-2xl md:text-3xl font-bold text-center mb-8">
            How We Handle Your Data
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {dataHandling.map((phase, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  {index + 1}
                </div>
                <h4 className="font-semibold mb-2">{phase.phase}</h4>
                <p className="text-sm text-muted-foreground mb-2">{phase.description}</p>
                <Badge variant="secondary" className="text-xs">{phase.security}</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Certifications */}
        <div className="bg-card rounded-2xl p-8 border border-primary/20 mb-16">
          <h3 className="text-2xl font-bold text-center mb-8">Certifications & Compliance</h3>
          <ComplianceBadges
            layout="horizontal"
            size="lg"
            showTitle={false}
          />
        </div>

        {/* Trust Statement */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl p-8 md:p-12 border border-primary/20">
            <Shield className="w-16 h-16 mx-auto mb-6 text-primary" />
            <h3 className="text-2xl md:text-3xl font-bold mb-4">
              Your Data, Your Control
            </h3>
            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              We believe privacy is a fundamental right. That's why we've built AxWise
              with privacy-by-design principles and give you complete control over your data.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Badge variant="outline" className="text-sm px-4 py-2">
                🔒 Zero-knowledge architecture
              </Badge>
              <Badge variant="outline" className="text-sm px-4 py-2">
                🌍 Global compliance
              </Badge>
              <Badge variant="outline" className="text-sm px-4 py-2">
                🛡️ Regular security audits
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
