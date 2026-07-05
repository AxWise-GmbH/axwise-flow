import React from 'react';
import Link from 'next/link';

export default function TermsOfServicePage() {
    return (
        <div className="container mx-auto py-24 px-4 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="prose prose-slate dark:prose-invert max-w-none">
                <h1 className="text-4xl font-bold mb-4 tracking-tight">Terms of Service</h1>
                <p className="text-xl text-muted-foreground mb-12">Please read these terms carefully before using our service.</p>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
                    <p>
                        By accessing or using the Interview Analysis application and related services (collectively, the "Service") provided by AxWise UG (in formation) ("we", "our", or "us"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our Service.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
                    <p>
                        Our Service provides tools for analyzing interview transcripts, generating insights, and creating personas based on user research data. The Service may include AI-powered analysis, data visualization, and report generation features.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
                    <p>
                        To access certain features of the Service, you may be required to create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">4. User Content</h2>
                    <p>
                        Our Service allows you to upload, submit, and share content, including interview transcripts and related data ("User Content"). You retain all rights to your User Content, but you grant us a non-exclusive, worldwide, royalty-free license to use, reproduce, modify, and display your User Content solely for the purpose of providing and improving the Service.
                    </p>
                    <p>You are solely responsible for your User Content and the consequences of uploading it. You represent and warrant that:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>You own or have the necessary rights to use and authorize us to use your User Content</li>
                        <li>Your User Content does not violate the privacy rights, publicity rights, copyright, contractual rights, or any other rights of any person or entity</li>
                        <li>Your User Content does not contain confidential information that you do not have the right to disclose</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">5. Prohibited Uses</h2>
                    <p>You agree not to use the Service:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>In any way that violates any applicable law or regulation</li>
                        <li>To transmit any material that is defamatory, offensive, or otherwise objectionable</li>
                        <li>To attempt to interfere with, compromise the system integrity or security, or decipher any transmissions to or from the servers running the Service</li>
                        <li>To collect or track the personal information of others</li>
                        <li>To impersonate or attempt to impersonate another person or entity</li>
                        <li>To engage in any automated use of the system, such as using scripts to send comments or messages</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property</h2>
                    <p>
                        The Service and its original content (excluding User Content), features, and functionality are and will remain the exclusive property of AxWise UG and its licensors. The Service is protected by copyright, trademark, and other laws of Germany and foreign countries.
                    </p>
                    <p>
                        Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of AxWise UG.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">7. Limitation of Liability</h2>
                    <p>
                        To the maximum extent permitted by law, in no event shall AxWise UG, its directors, employees, partners, agents, suppliers, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Your access to or use of or inability to access or use the Service</li>
                        <li>Any conduct or content of any third party on the Service</li>
                        <li>Any content obtained from the Service</li>
                        <li>Unauthorized access, use, or alteration of your transmissions or content</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">8. Disclaimer</h2>
                    <p>
                        Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">9. Changes to Terms</h2>
                    <p>
                        We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">10. Governing Law</h2>
                    <p>
                        These Terms shall be governed and construed in accordance with the laws of Germany, without regard to its conflict of law provisions.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-4">11. Contact Us</h2>
                    <p>If you have any questions about these Terms, please contact us:</p>
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
