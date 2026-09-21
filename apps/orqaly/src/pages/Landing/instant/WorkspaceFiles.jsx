import { useId } from 'react';
import { fileStatus } from './watchItWorkMachine';

/*
 * The Workspace's Files card, drawn after the desktop app's "Latest files" rows
 * (orqaly-goose FilesView FileRow + FileIcon): a neutral tile with the type's line icon, a PDF
 * tag in its corner, the name with a small outlined badge, "Type · folder" underneath.
 *
 * The app only lists a file once it is written. Here the files are known from the plan, so a
 * row waits on a dashed, empty tile, unbadged, until its roadmap step runs (WRITING), then
 * reads NEW.
 */

// lucide's FileText, FileImage, FileSpreadsheet and Globe on their 24px grid, as drawn by the
// lucide-react the desktop app ships (0.575, the rounded dog-ear).
const FILE_SHAPE =
  'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5';

const TYPES = {
  document: { label: 'Document', path: `${FILE_SHAPE}M10 9H8M16 13H8M16 17H8` },
  pdf: { label: 'PDF', path: `${FILE_SHAPE}M10 9H8M16 13H8M16 17H8`, tag: 'PDF' },
  spreadsheet: { label: 'Spreadsheet', path: `${FILE_SHAPE}M8 13h2M14 13h2M8 17h2M14 17h2` },
  image: {
    label: 'Image',
    path: `${FILE_SHAPE}M8 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M20 17l-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22`,
  },
  web: {
    label: 'Web page',
    path: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20',
  },
};

export const FILE_TYPES = Object.keys(TYPES);

const BADGES = { writing: 'WRITING', done: 'NEW' };

function FileTile({ type }) {
  const { path, tag } = TYPES[type];
  return (
    <span className="wiw-ws-tile" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {tag && <span className="wiw-ws-tag">{tag}</span>}
    </span>
  );
}

export default function WorkspaceFiles({ files, state, arrived }) {
  const labelId = useId();
  return (
    <section
      className="wiw-ws-files"
      aria-labelledby={labelId}
      data-arrived={arrived}
      aria-hidden={!arrived || undefined}
    >
      <div className="wiw-ws-head">
        <p className="wiw-label" id={labelId}>
          Files
        </p>
        <span className="wiw-ws-all" aria-hidden="true">
          All {files.length}
        </span>
      </div>
      <ul className="wiw-ws-list" aria-labelledby={labelId}>
        {files.map((file) => {
          const status = fileStatus(file.step, state);
          return (
            <li className="wiw-ws-file" key={file.name} data-state={status}>
              <FileTile type={file.type} />
              <span className="wiw-ws-text">
                <span className="wiw-ws-name">{file.name}</span>
                {/* The badge rides the meta line, not the name's as in the app: the panel
                    here is narrower, and a badge that wrapped would make rows jump. */}
                <span className="wiw-ws-meta">
                  <span className="wiw-ws-type">
                    {TYPES[file.type].label}
                    <span className="wiw-ws-folder"> · {file.folder}</span>
                  </span>
                  {BADGES[status] && (
                    // Keyed by state, so WRITING -> NEW mounts afresh and fades in.
                    <span className="wiw-ws-badge" data-state={status} key={status}>
                      {BADGES[status]}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
