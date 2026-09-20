import { INFO_PAGES } from './info/info.data';
import AboutPage from './info/AboutPage';
import ContactPage from './info/ContactPage';
import PrivacyPage from './info/PrivacyPage';
import TermsPage from './info/TermsPage';
import './InfoPage.css';

// The text pages behind the footer. Each has a layout made for what it has to say:
// a manifesto, three ways to write to us, a map of where data goes, a grid of clauses.
const LAYOUTS = { about: AboutPage, contact: ContactPage, privacy: PrivacyPage, terms: TermsPage };

export default function InfoPage({ slug }) {
  const Layout = LAYOUTS[slug];
  return <Layout page={INFO_PAGES[slug]} />;
}
