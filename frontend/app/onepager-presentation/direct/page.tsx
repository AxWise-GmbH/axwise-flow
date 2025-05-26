/**
 * Direct Onepager Presentation Page
 * 
 * This page serves the onepager presentation content directly as a React component
 * instead of redirecting to the static HTML file.
 */
export default function DirectOnepagerPage() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <iframe
        src="/onepager-presentation/index.html"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          margin: 0,
          padding: 0,
        }}
        title="AxWise Onepager Presentation"
      />
    </div>
  );
}

/**
 * Metadata for the direct onepager presentation page
 */
export const metadata = {
  title: 'AxWise – Focus on building products, not analyzing what users said',
  description: 'Empowering every team to build better products by making customer understanding actionable.',
  robots: {
    index: false, // Internal presentation, don't index
    follow: false,
  },
};
