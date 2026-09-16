import { useParams } from 'react-router-dom';
import { SOLUTION_PAGES } from './solutions';
import SolutionPage from './SolutionPage';

// Dispatch /solutions/:industry to a bespoke page if one exists,
// otherwise fall through to the dynamic SolutionPage template.
export default function SolutionRouter() {
  const { industry } = useParams();
  const Page = SOLUTION_PAGES[industry];
  if (Page) return <Page />;
  return <SolutionPage />;
}
