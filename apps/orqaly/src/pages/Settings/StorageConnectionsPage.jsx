import PageLayout from '../../components/Common/PageLayout';
import StorageConnections from '../../components/Settings/StorageConnections';

export default function StorageConnectionsPage() {
  return (
    <PageLayout
      title="Storage"
      subtitle="Connect your own Supabase storage to own your goal deliverables end-to-end."
    >
      <StorageConnections />
    </PageLayout>
  );
}
