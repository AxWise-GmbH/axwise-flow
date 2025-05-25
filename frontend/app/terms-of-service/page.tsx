import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - AxWise',
  description: 'Terms of service for AxWise - Your AI Co-Pilot for Product Development',
};

/**
 * Terms of Service page with proper Next.js App Router structure
 */
export default function TermsOfServicePage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Terms of Service</h1>
          <p className="text-lg text-muted-foreground">
            Terms and conditions for using AxWise services
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Terms Content */}
        <div className="space-y-8">
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Acceptance of Terms</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                By accessing and using AxWise ("the Service"), you accept and agree to be bound by the terms
                and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
              <p>
                These Terms of Service apply to all users of the Service, including without limitation users who
                are browsers, vendors, customers, merchants, and/or contributors of content.
              </p>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Description of Service</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                AxWise is an AI-powered platform that provides analysis and insights for product development.
                Our service includes but is not limited to:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>AI-powered content analysis and insight generation</li>
                <li>Persona development and user research analysis</li>
                <li>Product requirement document (PRD) generation</li>
                <li>Data visualization and reporting tools</li>
                <li>Integration with various data sources and formats</li>
              </ul>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">User Accounts and Responsibilities</h2>

            <div className="space-y-4 text-muted-foreground">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Account Creation</h3>
                <p>
                  You must provide accurate and complete information when creating an account. You are responsible
                  for maintaining the confidentiality of your account credentials.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Acceptable Use</h3>
                <p>You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:</p>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  <li>Upload malicious, harmful, or illegal content</li>
                  <li>Attempt to gain unauthorized access to the Service</li>
                  <li>Use the Service to violate any applicable laws or regulations</li>
                  <li>Interfere with or disrupt the Service or servers</li>
                  <li>Use the Service for any commercial purpose without authorization</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Intellectual Property Rights</h2>

            <div className="space-y-4 text-muted-foreground">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Your Content</h3>
                <p>
                  You retain ownership of any intellectual property rights that you hold in content that you
                  submit to the Service. However, by submitting content, you grant us a license to use,
                  modify, and analyze your content to provide the Service.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Our Service</h3>
                <p>
                  The Service and its original content, features, and functionality are and will remain the
                  exclusive property of AxWise and its licensors. The Service is protected by copyright,
                  trademark, and other laws.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Payment and Subscription Terms</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                Some features of the Service may require payment. By purchasing a subscription, you agree to pay
                all charges associated with your account. Subscription fees are billed in advance and are non-refundable.
              </p>
              <p>
                We reserve the right to change our pricing at any time. Any price changes will be communicated
                to you in advance and will take effect at the start of your next billing cycle.
              </p>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibent text-foreground mb-6">Limitation of Liability</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                The Service is provided "as is" without any warranties, express or implied. We do not warrant
                that the Service will be uninterrupted, error-free, or completely secure.
              </p>
              <p>
                In no event shall AxWise be liable for any indirect, incidental, special, consequential, or
                punitive damages, including without limitation, loss of profits, data, use, goodwill, or other
                intangible losses.
              </p>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Termination</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                We may terminate or suspend your account and bar access to the Service immediately, without prior
                notice or liability, under our sole discretion, for any reason whatsoever, including without
                limitation if you breach the Terms.
              </p>
              <p>
                You may terminate your account at any time by contacting us. Upon termination, your right to use
                the Service will cease immediately.
              </p>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Contact Information</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <p>
                Email: <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">vitalijs@axwise.de</a><br />
                AxWise UG (haftungsbeschränkt)<br />
                Bremen, Germany
              </p>
            </div>
          </div>
        </div>

        {/* Back to App */}
        <div className="text-center mt-8">
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
