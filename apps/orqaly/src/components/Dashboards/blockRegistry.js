/**
 * Block type → component registry.
 * Used by DashboardView and DashboardEditor to render any block by its type.
 */
import KpiBlock from './blocks/KpiBlock';
import TrendBlock from './blocks/TrendBlock';
import BreakdownBlock from './blocks/BreakdownBlock';
import PieBlock from './blocks/PieBlock';
import TableBlock from './blocks/TableBlock';
import AlertsBlock from './blocks/AlertsBlock';
import MarkdownBlock from './blocks/MarkdownBlock';

// Default sizes come from bentoLayout.bentoSizeFor() so the per-type sizes
// stay consistent between manual block adds, auto-arrange, and auto-build.
import { bentoSizeFor } from './bentoLayout';

export const BLOCK_REGISTRY = {
  kpi: { Component: KpiBlock, label: 'KPI tile', defaultLayout: bentoSizeFor('kpi') },
  trend: { Component: TrendBlock, label: 'Trend (line)', defaultLayout: bentoSizeFor('trend') },
  breakdown: {
    Component: BreakdownBlock,
    label: 'Breakdown (bars)',
    defaultLayout: bentoSizeFor('breakdown'),
  },
  pie: { Component: PieBlock, label: 'Pie / donut', defaultLayout: bentoSizeFor('pie') },
  table: { Component: TableBlock, label: 'Table', defaultLayout: bentoSizeFor('table') },
  alerts: { Component: AlertsBlock, label: 'Alerts list', defaultLayout: bentoSizeFor('alerts') },
  markdown: {
    Component: MarkdownBlock,
    label: 'Text / note',
    defaultLayout: bentoSizeFor('markdown'),
  },
  // Custom queries return the same { rows, total, sample_count } shape as the
  // generic resolver, so they render via the TableBlock.
  custom_query: {
    Component: TableBlock,
    label: 'Custom query',
    defaultLayout: bentoSizeFor('custom_query'),
  },
};

export function getBlockComponent(type) {
  return BLOCK_REGISTRY[type]?.Component || null;
}
