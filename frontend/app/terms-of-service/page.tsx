import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - AxWise',
  description: 'Terms of service for AxWise - Your AI Co-Pilot for Product Development',
};

/**
 * Terms of Service page with content from the original HTML file
 */
export default function TermsOfServicePage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-6 relative pb-2">
            Terms of Service
            <div className="absolute left-0 bottom-0 h-1 w-16 bg-secondary"></div>
          </h1>
          <p className="text-lg text-muted-foreground">
            Terms and conditions for using AxWise services
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: January 2025
          </p>
        </div>

        {/* Terms Content */}
        <div className="space-y-8">
          {/* Acceptance of Terms */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">1. Acceptance of Terms</h2>
            <div className="text-muted-foreground">
              <p>
                By accessing or using the Interview Analysis application and related services (collectively, the "Service") provided by AxWise UG (in formation) ("we", "our", or "us"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our Service.
              </p>
            </div>
          </div>

          {/* Description of Service */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">2. Description of Service</h2>
            <div className="text-muted-foreground">
              <p>
                Our Service provides tools for analyzing interview transcripts, generating insights, and creating personas based on user research data. The Service may include AI-powered analysis, data visualization, and report generation features.
              </p>
            </div>
          </div>

          {/* User Accounts */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">3. User Accounts</h2>
            <div className="text-muted-foreground">
              <p>
                To access certain features of the Service, you may be required to create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
              </p>
            </div>
          </div>

          {/* User Content */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">4. User Content</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                Our Service allows you to upload, submit, and share content, including interview transcripts and related data ("User Content"). You retain all rights to your User Content, but you grant us a non-exclusive, worldwide, royalty-free license to use, reproduce, modify, and display your User Content solely for the purpose of providing and improving the Service.
              </p>
              <p>You are solely responsible for your User Content and the consequences of uploading it. You represent and warrant that:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>You own or have the necessary rights to use and authorize us to use your User Content</li>
                <li>Your User Content does not violate the privacy rights, publicity rights, copyright, contractual rights, or any other rights of any person or entity</li>
                <li>Your User Content does not contain confidential information that you do not have the right to disclose</li>
              </ul>
            </div>
          </div>

          {/* Prohibited Uses */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">5. Prohibited Uses</h2>
            <div className="text-muted-foreground space-y-4">
              <p>You agree not to use the Service:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>In any way that violates any applicable law or regulation</li>
                <li>To transmit any material that is defamatory, offensive, or otherwise objectionable</li>
                <li>To attempt to interfere with, compromise the system integrity or security, or decipher any transmissions to or from the servers running the Service</li>
                <li>To collect or track the personal information of others</li>
                <li>To impersonate or attempt to impersonate another person or entity</li>
                <li>To engage in any automated use of the system, such as using scripts to send comments or messages</li>
              </ul>
            </div>
          </div>

          {/* Intellectual Property */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">6. Intellectual Property</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                The Service and its original content (excluding User Content), features, and functionality are and will remain the exclusive property of AxWise UG and its licensors. The Service is protected by copyright, trademark, and other laws of Germany and foreign countries.
              </p>
              <p>
                Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of AxWise UG.
              </p>
            </div>
          </div>

          {/* Limitation of Liability */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">7. Limitation of Liability</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                To the maximum extent permitted by law, in no event shall AxWise UG, its directors, employees, partners, agents, suppliers, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>Your access to or use of or inability to access or use the Service</li>
                <li>Any conduct or content of any third party on the Service</li>
                <li>Any content obtained from the Service</li>
                <li>Unauthorized access, use, or alteration of your transmissions or content</li>
              </ul>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">8. Disclaimer</h2>
            <div className="text-muted-foreground">
              <p>
                Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance.
              </p>
            </div>
          </div>

          {/* Changes to Terms */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">9. Changes to Terms</h2>
            <div className="text-muted-foreground">
              <p>
                We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
              </p>
            </div>
          </div>

          {/* Governing Law */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">10. Governing Law</h2>
            <div className="text-muted-foreground">
              <p>
                These Terms shall be governed and construed in accordance with the laws of Germany, without regard to its conflict of law provisions.
              </p>
            </div>
          </div>

          {/* Contact Us */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">11. Contact Us</h2>
            <div className="text-muted-foreground space-y-4">
              <p>If you have any questions about these Terms, please contact us:</p>
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
