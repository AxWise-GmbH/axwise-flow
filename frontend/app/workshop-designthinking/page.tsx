import { redirect } from 'next/navigation';

/**
 * Design Thinking Workshop Page
 * 
 * This page redirects to the static HTML workshop content in the public directory.
 * The workshop is served as a static asset for better performance and compatibility.
 */
export default function WorkshopDesignThinkingPage() {
  // Redirect to the static HTML file
  redirect('/workshop-designthinking/index.html');
}

/**
 * Metadata for the workshop design thinking page
 */
export const metadata = {
  title: 'Design Thinking & User Research Workshop',
  description: 'Validating for Impact: From Ideas to Actionable Insights. Expert workshop by Vitalijs Visnevskis.',
  keywords: ['design thinking', 'user research', 'workshop', 'validation', 'product development'],
  robots: {
    index: true,
    follow: true,
  },
};
