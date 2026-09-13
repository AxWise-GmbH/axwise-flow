import PanelCard, { HOME_BLOCK_BODY_HEIGHT } from './PanelCard';
import DataOperationsTable from './DataOperationsTable';

/** Full-width "Data Operations" panel (recent knowledge-base operations). */
export default function DataOperationsCard({
  rows = [],
  loading = false,
  onAgentClick,
  delay = 0,
}) {
  return (
    <PanelCard
      title="Data Operations"
      subtitle="Recent knowledge base operations"
      delay={delay}
      bodyHeight={HOME_BLOCK_BODY_HEIGHT}
    >
      <DataOperationsTable rows={rows} loading={loading} onAgentClick={onAgentClick} />
    </PanelCard>
  );
}
