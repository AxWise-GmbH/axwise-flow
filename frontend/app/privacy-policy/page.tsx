import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - AxWise',
  description: 'Privacy policy for AxWise - Your AI Co-Pilot for Product Development',
};

/**
 * Privacy Policy page with proper Next.js App Router structure
 */
export default function PrivacyPolicyPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Privacy Policy</h1>
          <p className="text-lg text-muted-foreground">
            How we collect, use, and protect your personal information
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Privacy Policy Content */}
        <div className="space-y-8">
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Information We Collect</h2>

            <div className="space-y-4 text-muted-foreground">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Account Information</h3>
                <p>
                  When you create an account, we collect your email address, name, and authentication information
                  provided through our authentication service (Clerk).
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Usage Data</h3>
                <p>
                  We collect information about how you use our service, including uploaded files, analysis results,
                  and interaction patterns to improve our AI models and user experience.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Technical Information</h3>
                <p>
                  We automatically collect certain technical information including IP addresses, browser type,
                  device information, and usage analytics through Firebase and other services.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">How We Use Your Information</h2>

            <div className="space-y-4 text-muted-foreground">
              <ul className="list-disc list-inside space-y-2">
                <li>Provide and improve our AI-powered analysis services</li>
                <li>Process your uploaded content and generate insights</li>
                <li>Communicate with you about your account and our services</li>
                <li>Ensure security and prevent fraud</li>
                <li>Comply with legal obligations</li>
                <li>Develop and improve our AI models and algorithms</li>
              </ul>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Data Sharing and Disclosure</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                We do not sell your personal information. We may share your information in the following circumstances:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>With your explicit consent</li>
                <li>To comply with legal obligations or court orders</li>
                <li>To protect our rights, privacy, safety, or property</li>
                <li>With service providers who assist in our operations (under strict confidentiality agreements)</li>
                <li>In connection with a business transfer or acquisition</li>
              </ul>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Data Security and Retention</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                We implement appropriate technical and organizational measures to protect your personal information
                against unauthorized access, alteration, disclosure, or destruction.
              </p>
              <p>
                We retain your information for as long as necessary to provide our services and comply with legal
                obligations. You may request deletion of your account and associated data at any time.
              </p>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Your Rights</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                Under applicable data protection laws (including GDPR), you have the right to:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>Access your personal information</li>
                <li>Correct inaccurate information</li>
                <li>Delete your personal information</li>
                <li>Restrict processing of your information</li>
                <li>Data portability</li>
                <li>Object to processing</li>
                <li>Withdraw consent</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, please contact us at{' '}
                <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">
                  vitalijs@axwise.de
                </a>
              </p>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Contact Information</h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                If you have any questions about this Privacy Policy, please contact us:
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
