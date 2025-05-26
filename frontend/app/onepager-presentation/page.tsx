import { redirect } from 'next/navigation';

/**
 * Onepager Presentation Page
 * 
 * This page redirects to the static HTML presentation in the public directory.
 * The presentation is served as a static asset for better performance and compatibility.
 */
export default function OnepagerPresentationPage() {
  // Redirect to the static HTML file
  redirect('/onepager-presentation/index.html');
}

/**
 * Metadata for the onepager presentation page
 */
export const metadata = {
  title: 'AxWise – Focus on building products, not analyzing what users said',
  description: 'Empowering every team to build better products by making customer understanding actionable.',
  robots: {
    index: false, // Internal presentation, don't index
    follow: false,
  },
};
