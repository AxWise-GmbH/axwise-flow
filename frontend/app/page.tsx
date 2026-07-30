import HomePageClient from './HomePageClient';

// Keep the public homepage revision-aware on Cloud Run. A previously static
// response remained in a shared cache after a new frontend revision deployed.
export const dynamic = 'force-dynamic';

export default function HomePage(): React.JSX.Element {
  return <HomePageClient />;
}
