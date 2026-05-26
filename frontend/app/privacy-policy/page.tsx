import React from 'react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
    return (
        <div className="container mx-auto py-24 px-4 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="prose prose-slate dark:prose-invert max-w-none">
                <h1 className="text-4xl font-bold mb-4 tracking-tight">Privacy Policy</h1>
                <p className="text-xl text-muted-foreground mb-8">How we collect, use, and protect your personal information</p>
                <p className="text-sm text-muted-foreground mb-12">Last updated: January 2025</p>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
                    <p>
                        AxWise UG (in formation) (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Interview Analysis application and related services (collectively, the &quot;Service&quot;).
                    </p>
                    <p>
                        Please read this Privacy Policy carefully. By accessing or using our Service, you acknowledge that you have read, understood, and agree to be bound by all the terms of this Privacy Policy.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
                    <p>We may collect several types of information from and about users of our Service:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Personal Data:</strong> Information that can be used to identify you, such as your name, email address, and company information.</li>
                        <li><strong>Usage Data:</strong> Information about how you access and use our Service, including your browser type, IP address, and the pages you visit.</li>
                        <li><strong>Interview Data:</strong> Transcripts and other content you upload for analysis.</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
                    <p>We use the information we collect for various purposes, including:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>To provide and maintain our Service</li>
                        <li>To notify you about changes to our Service</li>
                        <li>To allow you to participate in interactive features of our Service</li>
                        <li>To provide customer support</li>
                        <li>To gather analysis or valuable information to improve our Service</li>
                        <li>To monitor the usage of our Service</li>
                        <li>To detect, prevent, and address technical issues</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">4. Data Storage and Security</h2>
                    <p>
                        We implement appropriate technical and organizational measures to protect your personal data against unauthorized or unlawful processing, accidental loss, destruction, or damage.
                    </p>
                    <p>
                        Your interview data is processed and stored securely, and we do not share this data with third parties except as necessary to provide our Service or as required by law.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">5. Third-Party Services</h2>
                    <p>
                        Our Service may use third-party services, such as Google&apos;s Gemini API for AI processing. These third parties have their own privacy policies addressing how they use such information.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">6. Your Data Protection Rights</h2>
                    <p>Under the GDPR, you have the following rights:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>The right to access your personal data</li>
                        <li>The right to rectification of inaccurate personal data</li>
                        <li>The right to erasure of your personal data</li>
                        <li>The right to restrict processing of your personal data</li>
                        <li>The right to data portability</li>
                        <li>The right to object to processing of your personal data</li>
                    </ul>
                    <p className="mt-4">
                        To exercise these rights, please contact us at <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">vitalijs@axwise.de</a>.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">7. Changes to This Privacy Policy</h2>
                    <p>
                        We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date.
                    </p>
                    <p>
                        You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">8. Contact Us</h2>
                    <p>If you have any questions about this Privacy Policy, please contact us:</p>
                    <div className="mt-4 p-6 bg-muted rounded-lg">
                        <p className="font-semibold">AxWise UG (in formation)</p>
                        <p>Aumunder Heerweg 13</p>
                        <p>28757 Bremen</p>
                        <p>Germany</p>
                        <p className="mt-2">Email: <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">vitalijs@axwise.de</a></p>
                    </div>
                </section>

                <div className="flex gap-4 pt-8 border-t">
                    <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">← Back to AxWise</Link>
                </div>
            </div>
        </div>
    );
}
