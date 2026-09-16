import { Box, Collapse } from '@mui/material';
import StatCard from './StatCard';
import MetricsToggleButton from './MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';

function gridColumnsForCount(count) {
  if (count === 4) {
    return {
      xs: 'repeat(2, minmax(0, 1fr))',
      sm: 'repeat(2, minmax(0, 1fr))',
      md: 'repeat(4, minmax(0, 1fr))',
    };
  }
  if (count === 5) {
    return {
      xs: 'repeat(2, minmax(0, 1fr))',
      sm: 'repeat(3, minmax(0, 1fr))',
      md: 'repeat(5, minmax(0, 1fr))',
    };
  }
  return { xs: 'repeat(auto-fit, minmax(140px, 1fr))' };
}

/**
 * Responsive metrics strip used at the top of pages/tabs.
 *
 * Props:
 *   cards               — array of { label, value, helper, color, icon } for each StatCard
 *   pageKey             — localStorage key for the show/hide toggle (via useShowMetrics)
 *   showToggle          — render the inline Hide/Show button above the grid (default true)
 *   showMetrics         — controlled override; when provided, parent owns the toggle
 *   onToggle            — controlled setter paired with showMetrics
 */
export default function MetricsStrip({
  cards = [],
  pageKey,
  showToggle = true,
  showMetrics: showMetricsProp,
  onToggle,
}) {
  const [showMetricsLocal, setShowMetricsLocal] = useShowMetrics(pageKey || 'default');
  const isControlled = showMetricsProp !== undefined;
  const showMetrics = isControlled ? showMetricsProp : showMetricsLocal;
  const toggle = () => {
    if (isControlled) onToggle?.(!showMetrics);
    else setShowMetricsLocal(!showMetrics);
  };

  if (!cards.length) return null;

  const gridTemplateColumns = gridColumnsForCount(cards.length);

  return (
    <Box>
      {showToggle && !isControlled && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: { xs: 1.25, sm: 1.5 }, pt: 1 }}>
          <MetricsToggleButton showMetrics={showMetrics} onToggle={toggle} />
        </Box>
      )}
      <Collapse in={showMetrics}>
        <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns }}>
            {cards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
