import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us - AxWise',
  description: 'Get in touch with AxWise - Your AI Co-Pilot for Product Development',
};

/**
 * Contact page with proper Next.js App Router structure
 */
export default function ContactPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Contact Us</h1>
          <p className="text-lg text-muted-foreground">
            Get in touch with our team. We'd love to hear from you!
          </p>
        </div>

        {/* Contact Information */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Get in Touch</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Email</h3>
                <p className="text-muted-foreground">
                  <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">
                    vitalijs@axwise.de
                  </a>
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Business Inquiries</h3>
                <p className="text-muted-foreground">
                  For partnerships, enterprise solutions, and business development opportunities.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Support</h3>
                <p className="text-muted-foreground">
                  Technical support and customer service inquiries.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Company Information</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">AxWise UG</h3>
                <p className="text-muted-foreground">
                  (haftungsbeschränkt)<br />
                  (in formation)
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Location</h3>
                <p className="text-muted-foreground">
                  Bremen, Germany
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Contact Person</h3>
                <p className="text-muted-foreground">
                  Vitalijs Visnevskis
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Back to App */}
        <div className="text-center">
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
