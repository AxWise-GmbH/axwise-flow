import { useParams } from 'react-router-dom';
import { CONTROL_PAGES } from './control';
import InstrumentPage from './InstrumentPage';

// Dispatch /control/:slug to a bespoke page if one exists,
// otherwise fall through to the dynamic InstrumentPage template.
export default function ControlRouter() {
  const { slug } = useParams();
  const Page = CONTROL_PAGES[slug];
  if (Page) return <Page />;
  return <InstrumentPage group="control" />;
}
