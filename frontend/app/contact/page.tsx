import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us - AxWise UG',
  description: 'Get in touch with AxWise - Your AI Co-Pilot for Product Development',
};

/**
 * Contact page with content from the original HTML file
 */
export default function ContactPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-6 relative pb-2">
            Contact Us
            <div className="absolute left-0 bottom-0 h-1 w-16 bg-secondary"></div>
          </h1>
          <p className="text-lg text-muted-foreground">
            We'd love to hear from you. Please use the contact information below or fill out the form to get in touch with us.
          </p>
        </div>

        {/* Contact Wrapper */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Contact Information */}
          <div className="bg-card rounded-lg border p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-primary mb-6">Contact Information</h2>

            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="text-2xl">📍</div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Address:</p>
                  <p className="text-muted-foreground">Aumunder Heerweg 13</p>
                  <p className="text-muted-foreground">28757, Bremen</p>
                  <p className="text-muted-foreground">Germany</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="text-2xl">✉️</div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Email:</p>
                  <p className="text-muted-foreground">
                    <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">
                      vitalijs@axwise.de
                    </a>
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="text-2xl">👤</div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Contact Person:</p>
                  <p className="text-muted-foreground">Vitalijs Visnevskis</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="text-2xl">ℹ️</div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Company Status:</p>
                  <p className="text-muted-foreground">AxWise UG (in formation)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-card rounded-lg border p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-primary mb-6">Send Us a Message</h2>

            <form action="https://formspree.io/f/vitalijs@axwise.de" method="POST" className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-semibold text-foreground mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-foreground mb-2">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={6}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors resize-vertical"
                ></textarea>
              </div>

              <div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-10 px-6 py-2"
                >
                  Send Message
                </button>
              </div>
            </form>
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
