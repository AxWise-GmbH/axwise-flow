import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - AxWise',
  description: 'Privacy policy for AxWise - Your AI Co-Pilot for Product Development',
};

/**
 * Privacy Policy page with content from the original HTML file
 */
export default function PrivacyPolicyPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-6 relative pb-2">
            Privacy Policy
            <div className="absolute left-0 bottom-0 h-1 w-16 bg-secondary"></div>
          </h1>
          <p className="text-lg text-muted-foreground">
            How we collect, use, and protect your personal information
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: January 2025
          </p>
        </div>

        {/* Privacy Policy Content */}
        <div className="space-y-8">
          {/* Introduction */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">1. Introduction</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                AxWise UG (in formation) ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Interview Analysis application and related services (collectively, the "Service").
              </p>
              <p>
                Please read this Privacy Policy carefully. By accessing or using our Service, you acknowledge that you have read, understood, and agree to be bound by all the terms of this Privacy Policy.
              </p>
            </div>
          </div>

          {/* Information We Collect */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">2. Information We Collect</h2>
            <div className="text-muted-foreground space-y-4">
              <p>We may collect several types of information from and about users of our Service:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong className="text-foreground">Personal Data</strong>: Information that can be used to identify you, such as your name, email address, and company information.</li>
                <li><strong className="text-foreground">Usage Data</strong>: Information about how you access and use our Service, including your browser type, IP address, and the pages you visit.</li>
                <li><strong className="text-foreground">Interview Data</strong>: Transcripts and other content you upload for analysis.</li>
              </ul>
            </div>
          </div>

          {/* How We Use Your Information */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">3. How We Use Your Information</h2>
            <div className="text-muted-foreground space-y-4">
              <p>We use the information we collect for various purposes, including:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>To provide and maintain our Service</li>
                <li>To notify you about changes to our Service</li>
                <li>To allow you to participate in interactive features of our Service</li>
                <li>To provide customer support</li>
                <li>To gather analysis or valuable information to improve our Service</li>
                <li>To monitor the usage of our Service</li>
                <li>To detect, prevent, and address technical issues</li>
              </ul>
            </div>
          </div>

          {/* Data Storage and Security */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">4. Data Storage and Security</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                We implement appropriate technical and organizational measures to protect your personal data against unauthorized or unlawful processing, accidental loss, destruction, or damage.
              </p>
              <p>
                Your interview data is processed and stored securely, and we do not share this data with third parties except as necessary to provide our Service or as required by law.
              </p>
            </div>
          </div>

          {/* Third-Party Services */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">5. Third-Party Services</h2>
            <div className="text-muted-foreground">
              <p>
                Our Service may use third-party services, such as Google's Gemini API for AI processing. These third parties have their own privacy policies addressing how they use such information.
              </p>
            </div>
          </div>

          {/* Your Data Protection Rights */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">6. Your Data Protection Rights</h2>
            <div className="text-muted-foreground space-y-4">
              <p>Under the GDPR, you have the following rights:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>The right to access your personal data</li>
                <li>The right to rectification of inaccurate personal data</li>
                <li>The right to erasure of your personal data</li>
                <li>The right to restrict processing of your personal data</li>
                <li>The right to data portability</li>
                <li>The right to object to processing of your personal data</li>
              </ul>
              <p>To exercise these rights, please contact us at vitalijs@axwise.de.</p>
            </div>
          </div>

          {/* Changes to Privacy Policy */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">7. Changes to This Privacy Policy</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.
              </p>
              <p>
                You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
              </p>
            </div>
          </div>

          {/* Contact Us */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">8. Contact Us</h2>
            <div className="text-muted-foreground space-y-4">
              <p>If you have any questions about this Privacy Policy, please contact us:</p>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">AxWise UG (in formation)</p>
                <p>Aumunder Heerweg 13</p>
                <p>28757 Bremen</p>
                <p>Germany</p>
                <p>Email: <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">vitalijs@axwise.de</a></p>
              </div>
            </div>
          </div>
        </div>

        {/* Back to App */}
        <div className="text-center mt-12">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            ← Back to AxWise
          </a>
        </div>
      </div>
    </div>
  );
}
