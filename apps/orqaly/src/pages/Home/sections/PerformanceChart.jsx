import { useTheme, useMediaQuery } from '@mui/material';
import TrendChart from '../../Reports/components/TrendChart';
import PanelCard from './PanelCard';
import ChartReveal from './ChartReveal';

/**
 * Agents Performance Overview - the hero chart. Multi-line trend over the
 * selected window. Carries the ambient scan-sweep via the `home-hero` class.
 */
export default function PerformanceChart({ performance, loading = false, delay = 0 }) {
  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.up('md'));
  const isSm = useMediaQuery(theme.breakpoints.up('sm'));
  const height = isMd ? 340 : isSm ? 280 : 220;

  const data = performance?.data || [];
  const lines = performance?.lines || [];

  return (
    <PanelCard
      className="home-hero"
      title="Agents Performance Overview"
      subtitle="Live execution signals across goals, loops, activity and usage"
      delay={delay}
    >
      <ChartReveal minHeight={height}>
        <TrendChart
          data={data}
          xKey="date"
          lines={lines}
          height={height}
          loading={loading}
          showLegendToggle
        />
      </ChartReveal>
    </PanelCard>
  );
}
