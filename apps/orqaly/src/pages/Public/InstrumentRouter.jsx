import { useParams } from 'react-router-dom';
import { INSTRUMENT_PAGES } from './instruments';
import InstrumentPage from './InstrumentPage';

// Dispatch /instruments/:slug to a bespoke page if one exists,
// otherwise fall through to the dynamic InstrumentPage template.
export default function InstrumentRouter() {
  const { slug } = useParams();
  const Page = INSTRUMENT_PAGES[slug];
  if (Page) return <Page />;
  return <InstrumentPage group="instruments" />;
}
