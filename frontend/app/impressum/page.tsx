import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum - AxWise',
  description: 'Angaben gemäß § 5 TMG für AxWise - Your AI Co-Pilot for Product Development',
};

/**
 * Impressum page with content from the original HTML file
 */
export default function ImpressumPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-6 relative pb-2">
            Impressum
            <div className="absolute left-0 bottom-0 h-1 w-16 bg-secondary"></div>
          </h1>
          <p className="text-lg text-muted-foreground">
            Angaben gemäß § 5 TMG
          </p>
        </div>

        {/* Impressum Content */}
        <div className="space-y-8">
          {/* Company Information */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Unternehmensangaben</h2>
            <div className="text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground">AxWise UG (in Gründung)</p>
              <p>Aumunder Heerweg 13</p>
              <p>28757 Bremen</p>
              <p>Deutschland</p>
            </div>
          </div>

          {/* Representative */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Vertreten durch</h2>
            <p className="text-muted-foreground">Vitalijs Visnevskis</p>
          </div>

          {/* Contact */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Kontakt</h2>
            <p className="text-muted-foreground">
              E-Mail: <a href="mailto:vitalijs@axwise.de" className="text-primary hover:underline">vitalijs@axwise.de</a>
            </p>
          </div>

          {/* Commercial Register */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Handelsregister</h2>
            <p className="text-muted-foreground">
              Die Eintragung in das Handelsregister ist in Vorbereitung.
            </p>
          </div>

          {/* VAT ID */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Umsatzsteuer-ID</h2>
            <p className="text-muted-foreground">
              Eine Umsatzsteuer-Identifikationsnummer nach §27a Umsatzsteuergesetz wird nach Gründung der Gesellschaft beantragt.
            </p>
          </div>

          {/* Content Responsibility */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
            <div className="text-muted-foreground space-y-2">
              <p>Vitalijs Visnevskis</p>
              <p>Aumunder Heerweg 13</p>
              <p>28757 Bremen</p>
              <p>Deutschland</p>
            </div>
          </div>

          {/* Company Form Notice */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Hinweis zur Unternehmensform</h2>
            <p className="text-muted-foreground">
              AxWise UG befindet sich derzeit in Gründung. Bis zur Eintragung im Handelsregister handelt Vitalijs Visnevskis
              im Namen der Vorgesellschaft. Mit Eintragung im Handelsregister gehen alle Rechte und Pflichten auf die
              AxWise UG (haftungsbeschränkt) über.
            </p>
          </div>

          {/* Dispute Resolution */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Streitschlichtung</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
                <a
                  href="https://ec.europa.eu/consumers/odr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://ec.europa.eu/consumers/odr/
                </a>
              </p>
              <p>Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>
              <p>
                Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
                Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </div>
          </div>

          {/* Content Liability */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Haftung für Inhalte</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den
                allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht
                verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen
                zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
              </p>
              <p>
                Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen
                Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt
                der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden
                Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
              </p>
            </div>
          </div>

          {/* Link Liability */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Haftung für Links</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben.
                Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten
                Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten
                wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren
                zum Zeitpunkt der Verlinkung nicht erkennbar.
              </p>
              <p>
                Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer
                Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links
                umgehend entfernen.
              </p>
            </div>
          </div>

          {/* Copyright */}
          <div className="bg-card rounded-lg border p-8">
            <h2 className="text-2xl font-semibold text-primary mb-6">Urheberrecht</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen
                Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der
                Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
                Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.
              </p>
              <p>
                Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte Dritter
                beachtet. Insbesondere werden Inhalte Dritter als solche gekennzeichnet. Sollten Sie trotzdem auf eine
                Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden
                von Rechtsverletzungen werden wir derartige Inhalte umgehend entfernen.
              </p>
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
