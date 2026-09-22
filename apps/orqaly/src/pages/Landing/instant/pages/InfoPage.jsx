import { INFO_PAGES, INFO_SKIP, infoPrefix } from './info/info.data';
import { localize } from '../i18n/localize';
import { useT } from '../i18n/useT';
import AboutPage from './info/AboutPage';
import ContactPage from './info/ContactPage';
import './InfoPage.css';

// The text pages behind the footer. Each has a layout made for what it has to say: a
// manifesto, three ways to write to us. Privacy and Terms moved to the Legal Center.
const LAYOUTS = { about: AboutPage, contact: ContactPage };

export default function InfoPage({ slug }) {
  const { t } = useT('pg');
  const Layout = LAYOUTS[slug];
  return <Layout page={localize(INFO_PAGES[slug], infoPrefix(slug), t, INFO_SKIP)} />;
}
