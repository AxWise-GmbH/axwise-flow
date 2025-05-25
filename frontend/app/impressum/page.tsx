import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum - AxWise',
  description: 'Legal information and imprint for AxWise - Your AI Co-Pilot for Product Development',
};

/**
 * Impressum page with proper Next.js App Router structure
 */
export default function ImpressumPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Impressum</h1>
          <p className="text-lg text-muted-foreground">
            Legal information according to § 5 TMG (German Telemedia Act)
          </p>
        </div>

        {/* Company Information */}
        <div className="bg-card rounded-lg border p-8 mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6">Company Information</h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">Service Provider</h3>
              <p className="text-muted-foreground">
                AxWise UG (haftungsbeschränkt)<br />
                (in formation)
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">Address</h3>
              <p className="text-muted-foreground">
                Bremen, Germany<br />
                (Full address will be provided upon company registration)
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">Contact</h3>
              <p className="text-muted-foreground">
                Email: <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">vitalijs@axwise.de</a><br />
                Contact Person: Vitalijs Visnevskis
              </p>
            </div>
          </div>
        </div>

        {/* Legal Information */}
        <div className="bg-card rounded-lg border p-8 mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6">Legal Information</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">Registration</h3>
              <p className="text-muted-foreground">
                Company registration is currently in progress.<br />
                Registration details will be updated upon completion.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">VAT ID</h3>
              <p className="text-muted-foreground">
                VAT identification number will be provided upon registration.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">Responsible for Content</h3>
              <p className="text-muted-foreground">
                Vitalijs Visnevskis<br />
                Email: <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">vitalijs@axwise.de</a>
              </p>
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
