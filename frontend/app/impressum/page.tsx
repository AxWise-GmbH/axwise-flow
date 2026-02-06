import React from 'react';

export default function ImpressumPage() {
    return (
        <div className="container mx-auto py-24 px-4 max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-4xl font-bold mb-12 tracking-tight">Impressum</h1>

            <div className="space-y-12">
                <section>
                    <h2 className="text-xl font-semibold mb-4 text-primary">Angaben gemäß § 5 TMG</h2>
                    <div className="text-muted-foreground leading-relaxed">
                        <p className="font-medium text-foreground">Viral Buddy UG (haftungsbeschränkt)</p>
                        <p>Kolonnenstraße</p>
                        <p>10827 Berlin</p>
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4 text-primary">Kontakt</h2>
                    <div className="text-muted-foreground leading-relaxed">
                        <p>E-Mail: <a href="mailto:support@axwise.de" className="text-primary hover:underline">support@axwise.de</a></p>
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4 text-primary">Registereintrag</h2>
                    <div className="text-muted-foreground leading-relaxed">
                        <p className="mb-1">Eintragung im Handelsregister.</p>
                        <p className="mb-1">Registergericht: Amtsgericht Charlottenburg (Berlin)</p>
                        <p>Registernummer: HRB 261047 B</p>
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4 text-primary">EU-Streitschlichtung</h2>
                    <div className="text-muted-foreground leading-relaxed">
                        <p className="mb-2">
                            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
                            <a
                                href="https://ec.europa.eu/consumers/odr/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                            >
                                https://ec.europa.eu/consumers/odr/
                            </a>
                            .
                        </p>
                        <p>Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4 text-primary">Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
                    <div className="text-muted-foreground leading-relaxed">
                        <p>
                            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
