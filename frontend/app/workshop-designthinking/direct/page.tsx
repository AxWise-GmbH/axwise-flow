/**
 * Direct Workshop Design Thinking Page
 *
 * This page serves the workshop content directly as a React component
 * instead of redirecting to the static HTML file.
 */
export default function DirectWorkshopPage() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <iframe
        src="/api/workshop-designthinking"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          margin: 0,
          padding: 0,
        }}
        title="Design Thinking & User Research Workshop"
      />
    </div>
  );
}

/**
 * Metadata for the direct workshop page
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
