/*
 * The facts the footer, the About / Contact pages and the legal documents print.
 * Change them here only. A line that is left empty is simply not shown, so nothing
 * made up ever reaches the site: fill the company lines before going live.
 * The legal documents print these through {company.<key>} tokens (pages/legal/).
 */
export const COMPANY = {
  name: 'Orqanix',
  email: 'hello@orqanix.com',
  privacyEmail: 'privacy@orqanix.com',
  securityEmail: 'security@orqanix.com',
  // The registered company behind Orqanix, e.g. 'Example GmbH'.
  legalName: '',
  // Its registered address, on one line.
  address: '',
  // The law the terms follow, e.g. 'Germany'.
  law: '',
  // Register court and number, e.g. 'Amtsgericht Bremen, HRB 12345'.
  register: '',
  // VAT identification number.
  vatId: '',
  // The managing director(s) who represent the company.
  representative: '',
  // A second quick way to reach us besides email (the German imprint asks for one).
  phone: '',
  // The person responsible for the News page's content (§ 18 (2) MStV).
  newsResponsible: '',
  // Only for a company outside the EU: its EU representative (GDPR Art. 27, DSA Art. 13).
  euRepresentative: '',
  // Set to 'yes' once the Gemini API key runs on Google's paid tier (required to serve
  // people in the EEA, UK and Switzerland); the lines about Google's paid-tier data terms
  // stay hidden until then.
  geminiPaidTier: '',
};

export const LAST_UPDATED = '20 September 2026';
