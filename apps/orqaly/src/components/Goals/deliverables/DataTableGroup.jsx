/**
 * DataTableGroup — renders one DeliverableRow per data export:
 * CSV / JSON / Excel / TSV files, Google Sheets, Airtable bases.
 *
 * Preview: generic 📊 icon tile (no inline CSV parse for v1 — avoids
 * Papa Parse dep). Label shows the file format. Actions: Open in new
 * tab (works for both file downloads and Sheets/Airtable) + Download
 * (only for direct file URLs; hidden for Sheets/Airtable).
 */
import { Box } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import DeliverableRow from './DeliverableRow';
import IconTile from './IconTile';
import GroupHeader from './GroupHeader';
import GlassIcon from '../../icons/GlassIcon';
import { useDeliverableViewer } from './deliverableViewerContext';
import { VIEW_FORMAT } from './deliverableFormats';

const KIND_LABELS = {
  csv: 'CSV data',
  json: 'JSON data',
  xlsx: 'Excel spreadsheet',
  tsv: 'TSV data',
  sheets: 'Google Sheets',
  airtable: 'Airtable base',
};

const KIND_TILE_LABELS = {
  csv: 'CSV',
  json: 'JSON',
  xlsx: 'XLSX',
  tsv: 'TSV',
  sheets: 'SHEETS',
  airtable: 'AIRTABLE',
};

const DOWNLOADABLE_KINDS = new Set(['csv', 'json', 'xlsx', 'tsv']);

/**
 * Kinds the viewer can actually render, mapped to how.
 *
 * xlsx is deliberately absent: it is a zip of XML that needs a parser this app
 * does not carry, and Sheets and Airtable both refuse to be framed. Offering a
 * View that opens a blank panel would be worse than sending them to the file.
 */
const VIEWABLE_KINDS = {
  csv: VIEW_FORMAT.csv,
  tsv: VIEW_FORMAT.tsv,
  json: VIEW_FORMAT.json,
};

export default function DataTableGroup({ items, icon, label, G, glassIconName }) {
  const viewer = useDeliverableViewer();
  return (
    <Box>
      <GroupHeader
        icon={icon}
        glassIconName={glassIconName}
        label={label}
        count={items.length}
        G={G}
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {items.map((item) => {
          const actions = [];
          if (DOWNLOADABLE_KINDS.has(item.kind)) {
            actions.push({
              label: 'Download',
              href: item.url,
              download: true,
              icon: <GlassIcon name="Download" size={14} tone="neutral" />,
            });
          }
          if (viewer && VIEWABLE_KINDS[item.kind]) {
            actions.push({
              label: 'View',
              icon: <GlassIcon name="Visibility" size={14} tone="neutral" />,
              href: '#',
              onClick: (e) => {
                e.preventDefault();
                viewer.view({
                  title: item.filename,
                  format: VIEWABLE_KINDS[item.kind],
                  url: item.url,
                });
              },
            });
          }
          actions.push({
            label:
              item.kind === 'sheets'
                ? 'Open in Sheets'
                : item.kind === 'airtable'
                  ? 'Open in Airtable'
                  : 'Open',
            href: item.url,
            icon: <GlassIcon name="OpenInNew" size={12} tone="neutral" />,
          });

          return (
            <DeliverableRow
              key={item.url}
              G={G}
              preview={<IconTile emoji="📊" label={KIND_TILE_LABELS[item.kind] || 'DATA'} G={G} />}
              title={item.filename}
              meta={[item.url.replace(/^https?:\/\//, ''), KIND_LABELS[item.kind] || 'Data export']}
              actions={actions}
              parentKind={item.parentKind}
              parentId={item.parentId}
              originalUrl={item.url}
              artifactKind={item.artifactKind}
            />
          );
        })}
      </Box>
    </Box>
  );
}
