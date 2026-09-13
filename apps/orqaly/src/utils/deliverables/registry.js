/**
 * Deliverable registry — central config mapping every supported
 * `deliverable_type` to its extractor + renderer component.
 *
 * Adding a new deliverable shape:
 *   1. Create a new extractor at `./extractors/<name>.js` exporting a
 *      pure function `(tasks) => Array<item>`.
 *   2. Create a new renderer at `../../components/Goals/deliverables/
 *      <Name>Group.jsx` accepting { items, icon, label, G } props.
 *   3. Add one entry to DELIVERABLE_REGISTRY below with a unique id,
 *      a sensible `priority` (lower renders higher), the emoji icon,
 *      the uppercase label, the `matchDeliverableType` values, and
 *      references to the extractor + renderer.
 *
 * Priority convention (rough):
 *   1-9     deployed / live things (user opens these first)
 *   10-19   downloadable files (PDFs, contracts, invoices)
 *   20-29   visual assets (images, videos)
 *   30-39   structured data (CSVs, sheets, tables)
 *   40-49   code repositories
 *   50-59   documents / specs / briefs
 *   60+     supporting metadata (logs, audit reports)
 */
import { extractLiveSites } from './extractors/liveSite.js';
import { extractPdfs } from './extractors/pdf.js';
import { extractImages } from './extractors/image.js';
import { extractMarkdownDocs } from './extractors/markdown.js';
import { extractCodeRepos } from './extractors/code.js';
import { extractDataExports } from './extractors/data.js';

import LiveSiteGroup from '../../components/Goals/deliverables/LiveSiteGroup';
import PdfGroup from '../../components/Goals/deliverables/PdfGroup';
import ImageGrid from '../../components/Goals/deliverables/ImageGrid';
import DocumentGroup from '../../components/Goals/deliverables/DocumentGroup';
import CodeGroup from '../../components/Goals/deliverables/CodeGroup';
import DataTableGroup from '../../components/Goals/deliverables/DataTableGroup';

export const DELIVERABLE_REGISTRY = [
  {
    id: 'liveSite',
    priority: 1,
    icon: '🌐',
    glassIconName: 'OpenInNew',
    label: 'Live Site',
    matchDeliverableType: ['deployment'],
    extract: extractLiveSites,
    Renderer: LiveSiteGroup,
  },
  {
    id: 'downloads',
    priority: 10,
    icon: '📄',
    glassIconName: 'Description',
    label: 'Downloads',
    matchDeliverableType: ['presentation'],
    extract: extractPdfs,
    Renderer: PdfGroup,
  },
  {
    id: 'visualAssets',
    priority: 20,
    icon: '🎨',
    glassIconName: 'LightbulbOutlined',
    label: 'Visual Assets',
    matchDeliverableType: ['asset'],
    extract: extractImages,
    Renderer: ImageGrid,
  },
  {
    id: 'dataExports',
    priority: 30,
    icon: '📊',
    glassIconName: 'BarChartOutlined',
    label: 'Data Exports',
    matchDeliverableType: ['data', 'data_table'],
    extract: extractDataExports,
    Renderer: DataTableGroup,
  },
  {
    id: 'codeRepos',
    priority: 40,
    icon: '💻',
    glassIconName: 'Build',
    label: 'Code Repositories',
    matchDeliverableType: ['code'],
    extract: extractCodeRepos,
    Renderer: CodeGroup,
  },
  {
    id: 'documents',
    priority: 50,
    icon: '📝',
    glassIconName: 'Description',
    label: 'Documents',
    matchDeliverableType: ['markdown', 'strategy', 'report', 'audit'],
    extract: extractMarkdownDocs,
    Renderer: DocumentGroup,
  },
];

/**
 * Default filter: tasks that are done and have a non-empty output.
 * Extractors can assume their input has already been filtered through this.
 */
export function getRelevantTasks(tasks) {
  return (tasks || [])
    .filter((t) => t?.status === 'done' && t?.data?.output)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
}

/**
 * Given a list of done tasks, filter to only those whose
 * deliverable_type matches one of the values in `matchDeliverableType`.
 * Falls back to 'markdown' when the field is missing (legacy tasks).
 */
export function filterByType(tasks, matchDeliverableType) {
  return tasks.filter((t) => {
    const type = t.data?.deliverable_type || 'markdown';
    return matchDeliverableType.includes(type);
  });
}
