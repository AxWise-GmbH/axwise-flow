import { useParams } from 'react-router-dom';
import IndustrySolutionLayout from './solutions/IndustrySolutionLayout';

/** Fallback /solutions/:industry when no bespoke page is registered in SOLUTION_PAGES. */
export default function SolutionPage() {
  const { industry } = useParams();
  return <IndustrySolutionLayout slug={industry} />;
}
