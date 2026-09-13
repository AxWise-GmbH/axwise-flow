/**
 * AssistantMarkdown — semantic Markdown for assistant replies.
 *
 * Markdown is parsed to a Markdown AST and mapped directly to trusted React
 * components. Raw HTML is never mounted, links are allow-listed, and generated
 * elements inherit the current MUI chat surface.
 */
import { Fragment, createContext, useContext, useMemo } from 'react';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import {
  Box,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { composerInk, composerSurfaceTone } from '../../theme/composerSurface';

const MarkdownStyleContext = createContext(null);
const markdownOptions = {
  extensions: [gfmTable(), gfmTaskListItem()],
  mdastExtensions: [gfmTableFromMarkdown(), gfmTaskListItemFromMarkdown()],
};
const RAW_CONTENT_TAGS = new Set([
  'iframe',
  'math',
  'object',
  'script',
  'style',
  'svg',
  'template',
]);

function useMarkdownStyle() {
  return useContext(MarkdownStyleContext);
}

function safeLinkHref(value) {
  const href = String(value || '').trim();
  const localPath = href.startsWith('/') && !href.startsWith('//') && !/^\/(?:\\|%5c)/iu.test(href);
  if (/^(https?:|mailto:)/iu.test(href) || localPath || href.startsWith('#')) {
    return href;
  }
  return null;
}

function localLinkHref(href) {
  return (
    href.startsWith('#') ||
    (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\'))
  );
}

function safeImageSrc(value) {
  const href = safeLinkHref(value);
  return href && !href.startsWith('#') && !/^mailto:/iu.test(href) ? href : null;
}

function cellAlignment(value) {
  return ['left', 'center', 'right'].includes(value) ? value : 'left';
}

function mdastText(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.value === 'string' && node.type !== 'html') return node.value;
  if (node.type === 'image' || node.type === 'imageReference') return node.alt || '';
  if (!Array.isArray(node.children)) return '';
  return visibleMdastChildren(node.children).map(mdastText).join('');
}

function taskItemText(node) {
  if (!Array.isArray(node?.children)) return '';
  return node.children
    .filter((child) => child?.type !== 'list')
    .map(mdastText)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function rawHtmlBoundary(value) {
  const match = /^<\s*(\/?)\s*([a-z][\w:-]*)\b[^>]*>/iu.exec(String(value || ''));
  if (!match) return null;
  const tag = match[2].toLowerCase();
  if (!RAW_CONTENT_TAGS.has(tag)) return null;
  return {
    tag,
    closing: Boolean(match[1]),
    selfClosing: /\/\s*>\s*$/u.test(match[0]),
  };
}

/**
 * Raw HTML nodes are discarded. Text inside raw-content elements such as
 * script/style is discarded too, while harmless wrapper tags still leave their
 * human-readable text available.
 */
function visibleMdastChildren(children) {
  const visible = [];
  let blockedTag = null;
  let blockedDepth = 0;

  for (const child of Array.isArray(children) ? children : []) {
    if (child?.type === 'html') {
      const boundary = rawHtmlBoundary(child.value);
      if (!boundary) continue;

      if (!blockedTag && !boundary.closing && !boundary.selfClosing) {
        blockedTag = boundary.tag;
        blockedDepth = 1;
      } else if (blockedTag === boundary.tag) {
        if (boundary.closing) blockedDepth -= 1;
        else if (!boundary.selfClosing) blockedDepth += 1;
        if (blockedDepth <= 0) {
          blockedTag = null;
          blockedDepth = 0;
        }
      }
      continue;
    }

    if (!blockedTag) visible.push(child);
  }

  return visible;
}

function definitionKey(value) {
  return String(value || '').toLowerCase();
}

function nodeHasVisibleContent(node, definitions) {
  if (!node || node.type === 'definition' || node.type === 'html') return false;
  if (node.type === 'thematicBreak' || node.type === 'break' || node.type === 'code') return true;
  if (node.type === 'image') return Boolean(node.alt || safeImageSrc(node.url));
  if (node.type === 'imageReference') {
    const definition = definitions.get(definitionKey(node.identifier));
    return Boolean(node.alt || safeImageSrc(definition?.url));
  }
  if (typeof node.value === 'string') return Boolean(node.value.trim());
  return visibleMdastChildren(node.children).some((child) =>
    nodeHasVisibleContent(child, definitions)
  );
}

function parseMarkdown(source) {
  return fromMarkdown(source, markdownOptions);
}

function collectDefinitions(node, definitions = new Map()) {
  if (!node || typeof node !== 'object') return definitions;
  if (node.type === 'definition' && typeof node.identifier === 'string') {
    const identifier = node.identifier.toLowerCase();
    if (!definitions.has(identifier)) definitions.set(identifier, node);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectDefinitions(child, definitions);
  }
  return definitions;
}

function renderableRootBlocks(tree, definitions = collectDefinitions(tree)) {
  return (tree?.children || []).filter((node) => nodeHasVisibleContent(node, definitions));
}

function MarkdownParagraph({ className, children }) {
  const { bodySx, conversation, mutedInk } = useMarkdownStyle();
  const ellipsis = className?.includes('assistant-markdown-ellipsis');
  return (
    <Typography
      component="p"
      className={className}
      sx={{
        ...bodySx,
        mt: 0,
        mb: conversation ? 1.125 : 0.875,
        color: ellipsis ? mutedInk : bodySx.color,
        letterSpacing: ellipsis ? '0.08em' : undefined,
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </Typography>
  );
}

function MarkdownHeading({ children, sourceLevel }) {
  const { bodySx, conversation } = useMarkdownStyle();
  // The page owns h1. Assistant-authored headings begin at h2 so every
  // message does not create a competing document title.
  const semanticLevel = Math.min(sourceLevel + 1, 6);
  const sizes = conversation
    ? ['1.125rem', '1.0625rem', '1rem', '0.9375rem', '0.875rem', '0.875rem']
    : ['1.05rem', '0.98rem', '0.92rem', '0.9rem', '0.875rem', '0.875rem'];

  return (
    <Typography
      component={`h${semanticLevel}`}
      sx={{
        ...bodySx,
        fontSize: sizes[sourceLevel - 1],
        fontWeight: 700,
        lineHeight: conversation ? 1.4 : 1.45,
        mt: sourceLevel === 1 ? 2 : 1.5,
        mb: 0.625,
      }}
    >
      {children}
    </Typography>
  );
}

function MarkdownLink({ href, title, children }) {
  const { darkSurface, theme } = useMarkdownStyle();
  const safeHref = safeLinkHref(href);
  if (!safeHref) return <Fragment>{children}</Fragment>;

  const local = localLinkHref(safeHref);
  return (
    <Link
      href={safeHref}
      title={title}
      target={local ? undefined : '_blank'}
      rel={local ? undefined : 'noopener noreferrer'}
      sx={{
        color: darkSurface ? theme.palette.primary.light : theme.palette.primary.dark,
        fontWeight: 500,
        textDecorationThickness: 'from-font',
        textUnderlineOffset: '0.16em',
      }}
    >
      {children}
    </Link>
  );
}

function MarkdownImage({ alt, src, title }) {
  const safeSrc = safeImageSrc(src);
  if (!safeSrc) return alt ? <Fragment>{alt}</Fragment> : null;

  return (
    <Box
      component="img"
      src={safeSrc}
      alt={alt || ''}
      title={title || undefined}
      loading="lazy"
      sx={{
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        my: 1,
        borderRadius: 1,
      }}
    />
  );
}

function MarkdownStrong({ children }) {
  return (
    <Box component="strong" sx={{ fontWeight: 700 }}>
      {children}
    </Box>
  );
}

function MarkdownEmphasis({ children }) {
  return (
    <Box component="em" sx={{ fontStyle: 'italic' }}>
      {children}
    </Box>
  );
}

function MarkdownUnorderedList({ className, children }) {
  const { bodySx } = useMarkdownStyle();
  return (
    <Box
      component="ul"
      className={className}
      sx={{
        ...bodySx,
        my: 0.75,
        pl: className?.includes('contains-task-list') ? 0 : 2.75,
        '& ul, & ol': { mt: 0.375, mb: 0.25 },
      }}
    >
      {children}
    </Box>
  );
}

function MarkdownOrderedList({ start, children }) {
  const { bodySx } = useMarkdownStyle();
  return (
    <Box
      component="ol"
      start={start}
      sx={{
        ...bodySx,
        my: 0.75,
        pl: 2.75,
        '& ul, & ol': { mt: 0.375, mb: 0.25 },
      }}
    >
      {children}
    </Box>
  );
}

function MarkdownListItem({ checked, label, children }) {
  const task = typeof checked === 'boolean';
  return (
    <Box
      component="li"
      className={task ? 'task-list-item' : undefined}
      sx={{
        mb: 0.375,
        pl: 0.25,
        '&:last-child': { mb: 0 },
        '& > p': { display: 'inline', m: 0 },
        '& > ul, & > ol': { display: 'block' },
        '&.task-list-item': {
          display: 'flex',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 0.75,
          pl: 0,
        },
        '&.task-list-item > ul, &.task-list-item > ol': { flexBasis: '100%', ml: 2.5 },
      }}
    >
      {task ? <MarkdownTaskCheckbox checked={checked} label={label} /> : null}
      {children}
    </Box>
  );
}

function MarkdownTaskCheckbox({ checked, label }) {
  const stateLabel = checked ? 'Completed task' : 'Not completed task';
  return (
    <Box
      component="input"
      type="checkbox"
      checked={Boolean(checked)}
      readOnly
      disabled
      aria-label={label ? `${stateLabel}: ${label}` : stateLabel}
      sx={{
        width: 15,
        height: 15,
        mt: '0.28em',
        flex: '0 0 auto',
        accentColor: 'primary.main',
      }}
    />
  );
}

function MarkdownBlockquote({ children }) {
  const { ink, mutedInk } = useMarkdownStyle();
  return (
    <Box
      component="blockquote"
      sx={{
        my: 1.25,
        mx: 0,
        pl: 1.5,
        borderLeft: '3px solid',
        borderColor: alpha(ink, 0.24),
        color: mutedInk,
        '& p, & li': { color: 'inherit' },
        '& > :last-child': { mb: 0 },
      }}
    >
      {children}
    </Box>
  );
}

function MarkdownRule() {
  const { ink } = useMarkdownStyle();
  return (
    <Box
      component="hr"
      sx={{ my: 2, border: 0, borderTop: '1px solid', borderColor: alpha(ink, 0.14) }}
    />
  );
}

function MarkdownPreformatted({ children, language }) {
  const { blockCodeBackground, conversation, ink, mutedInk } = useMarkdownStyle();
  const languageLabel = String(language || '')
    .trim()
    .slice(0, 80);
  const languageClass = languageLabel
    ? `language-${languageLabel.toLowerCase().replace(/[^a-z0-9_-]+/gu, '-')}`
    : undefined;
  return (
    <Box
      component="pre"
      sx={{
        p: 1.25,
        my: 1,
        border: '1px solid',
        borderColor: alpha(ink, 0.1),
        borderRadius: 1.5,
        bgcolor: blockCodeBackground,
        color: ink,
        fontFamily: 'monospace',
        fontSize: conversation ? '0.8125rem' : '0.8rem',
        lineHeight: 1.55,
        overflowX: 'auto',
        whiteSpace: 'pre',
      }}
    >
      {languageLabel ? (
        <Box
          component="span"
          sx={{
            display: 'block',
            mb: 0.75,
            color: mutedInk,
            fontFamily: 'monospace',
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            lineHeight: 1.4,
            textTransform: 'uppercase',
            userSelect: 'none',
          }}
        >
          {languageLabel}
        </Box>
      ) : null}
      <Box
        component="code"
        className={languageClass}
        sx={{ display: 'block', minWidth: 'max-content', font: 'inherit' }}
      >
        {children}
      </Box>
    </Box>
  );
}

function MarkdownInlineCode({ children }) {
  const { inlineCodeBackground } = useMarkdownStyle();
  return (
    <Box
      component="code"
      sx={{
        px: 0.5,
        py: 0.125,
        borderRadius: 0.75,
        bgcolor: inlineCodeBackground,
        fontFamily: 'monospace',
        fontSize: '0.86em',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </Box>
  );
}

function MarkdownTable({ children }) {
  return (
    <TableContainer
      component={Box}
      sx={{
        my: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflowX: 'auto',
      }}
    >
      <Table size="small" aria-label="Markdown table" sx={{ minWidth: 480 }}>
        {children}
      </Table>
    </TableContainer>
  );
}

function MarkdownTableHead({ children }) {
  return <TableHead>{children}</TableHead>;
}

function MarkdownTableBody({ children }) {
  return <TableBody>{children}</TableBody>;
}

function MarkdownTableRow({ children }) {
  return <TableRow>{children}</TableRow>;
}

function MarkdownTableHeader({ children, style }) {
  const { ink } = useMarkdownStyle();
  return (
    <TableCell
      component="th"
      scope="col"
      align={cellAlignment(style?.textAlign)}
      sx={{ color: ink, fontWeight: 700, whiteSpace: 'normal' }}
    >
      {children}
    </TableCell>
  );
}

function MarkdownTableCell({ children, style }) {
  const { ink } = useMarkdownStyle();
  return (
    <TableCell
      align={cellAlignment(style?.textAlign)}
      sx={{ color: ink, whiteSpace: 'normal', overflowWrap: 'anywhere', verticalAlign: 'top' }}
    >
      {children}
    </TableCell>
  );
}

function renderKey(node, path) {
  const offset = node?.position?.start?.offset;
  return `${path}:${node?.type || 'unknown'}:${Number.isFinite(offset) ? offset : 'generated'}`;
}

function renderMdastChildren(children, context, path) {
  return visibleMdastChildren(children).map((node, index) =>
    renderMdastNode(node, context, `${path}.${index}`)
  );
}

function renderReferencedImage(node, context, key) {
  const definition = context.definitions.get(definitionKey(node.identifier));
  if (!definition) return node.alt || null;
  return <MarkdownImage key={key} alt={node.alt} src={definition.url} title={definition.title} />;
}

function renderTableRow(row, context, path, header, alignments) {
  return (
    <MarkdownTableRow key={renderKey(row, path)}>
      {(row.children || []).map((cell, index) => {
        const Cell = header ? MarkdownTableHeader : MarkdownTableCell;
        return (
          <Cell
            key={renderKey(cell, `${path}.${index}`)}
            style={{ textAlign: cellAlignment(alignments[index]) }}
          >
            {renderMdastChildren(cell.children, context, `${path}.${index}`)}
          </Cell>
        );
      })}
    </MarkdownTableRow>
  );
}

function renderTable(node, context, key, path) {
  const [header, ...body] = node.children || [];
  const alignments = node.align || [];
  return (
    <MarkdownTable key={key}>
      {header ? (
        <MarkdownTableHead>
          {renderTableRow(header, context, `${path}.head`, true, alignments)}
        </MarkdownTableHead>
      ) : null}
      {body.length ? (
        <MarkdownTableBody>
          {body.map((row, index) =>
            renderTableRow(row, context, `${path}.body.${index}`, false, alignments)
          )}
        </MarkdownTableBody>
      ) : null}
    </MarkdownTable>
  );
}

function renderMdastNode(node, context, path) {
  if (!node || node.type === 'html' || node.type === 'definition') return null;
  const key = renderKey(node, path);
  const children = () => renderMdastChildren(node.children, context, path);

  switch (node.type) {
    case 'text':
      return node.value;
    case 'paragraph':
      return <MarkdownParagraph key={key}>{children()}</MarkdownParagraph>;
    case 'heading':
      return (
        <MarkdownHeading key={key} sourceLevel={Math.min(Math.max(node.depth || 1, 1), 6)}>
          {children()}
        </MarkdownHeading>
      );
    case 'strong':
      return <MarkdownStrong key={key}>{children()}</MarkdownStrong>;
    case 'emphasis':
      return <MarkdownEmphasis key={key}>{children()}</MarkdownEmphasis>;
    case 'inlineCode':
      return <MarkdownInlineCode key={key}>{node.value}</MarkdownInlineCode>;
    case 'code':
      return (
        <MarkdownPreformatted key={key} language={node.lang}>
          {node.value}
        </MarkdownPreformatted>
      );
    case 'break':
      return <br key={key} />;
    case 'thematicBreak':
      return <MarkdownRule key={key} />;
    case 'blockquote':
      return <MarkdownBlockquote key={key}>{children()}</MarkdownBlockquote>;
    case 'link':
      return (
        <MarkdownLink key={key} href={node.url} title={node.title}>
          {children()}
        </MarkdownLink>
      );
    case 'linkReference': {
      const definition = context.definitions.get(definitionKey(node.identifier));
      if (!definition) return <Fragment key={key}>{children()}</Fragment>;
      return (
        <MarkdownLink key={key} href={definition.url} title={definition.title}>
          {children()}
        </MarkdownLink>
      );
    }
    case 'image':
      return <MarkdownImage key={key} alt={node.alt} src={node.url} title={node.title} />;
    case 'imageReference':
      return renderReferencedImage(node, context, key);
    case 'list': {
      const listChildren = children();
      if (node.ordered) {
        return (
          <MarkdownOrderedList
            key={key}
            start={Number.isInteger(node.start) ? node.start : undefined}
          >
            {listChildren}
          </MarkdownOrderedList>
        );
      }
      const taskList = (node.children || []).some((item) => typeof item.checked === 'boolean');
      return (
        <MarkdownUnorderedList key={key} className={taskList ? 'contains-task-list' : undefined}>
          {listChildren}
        </MarkdownUnorderedList>
      );
    }
    case 'listItem':
      return (
        <MarkdownListItem
          key={key}
          checked={node.checked}
          label={typeof node.checked === 'boolean' ? taskItemText(node) : undefined}
        >
          {children()}
        </MarkdownListItem>
      );
    case 'table':
      return renderTable(node, context, key, path);
    default:
      return Array.isArray(node.children) ? children() : null;
  }
}

/** Count the same complete top-level AST blocks used by maxBlocks previews. */
// eslint-disable-next-line react-refresh/only-export-components
export function markdownBlockCount(text) {
  const source = String(text || '');
  if (!source.trim()) return 0;
  const tree = parseMarkdown(source);
  return renderableRootBlocks(tree, collectDefinitions(tree)).length;
}

/**
 * @param {object} props
 * @param {string} props.text markdown source
 * @param {string} [props.color] text colour for the host surface
 * @param {'default'|'conversation'} [props.variant] conversational type scale
 * @param {number} [props.maxBlocks] render complete top-level blocks up to this limit
 */
export default function AssistantMarkdown({ text, color, variant = 'default', maxBlocks }) {
  const theme = useTheme();
  const ink = color || composerInk(theme);
  const conversation = variant === 'conversation';
  const source = String(text || '');
  const darkSurface = composerSurfaceTone(theme) === 'dark';

  const document = useMemo(() => {
    if (!source.trim()) return null;
    const tree = parseMarkdown(source);
    const definitions = collectDefinitions(tree);
    return {
      blocks: renderableRootBlocks(tree, definitions),
      definitions,
    };
  }, [source]);

  const style = useMemo(() => {
    const mutedInk = alpha(ink, darkSurface ? 0.72 : 0.68);
    return {
      theme,
      ink,
      mutedInk,
      conversation,
      darkSurface,
      bodySx: {
        color: ink,
        fontSize: conversation ? '0.9375rem' : '0.9rem',
        lineHeight: conversation ? 1.65 : 1.55,
        overflowWrap: 'anywhere',
      },
      inlineCodeBackground: alpha(darkSurface ? '#fff' : theme.palette.text.primary, 0.09),
      blockCodeBackground: darkSurface
        ? alpha('#000', 0.4)
        : alpha(theme.palette.text.primary, 0.055),
    };
  }, [conversation, darkSurface, ink, theme]);

  if (!document) return null;

  const limit = Number.isInteger(maxBlocks) && maxBlocks >= 0 ? maxBlocks : null;
  const truncated = limit !== null && document.blocks.length > limit;
  const visibleBlocks = truncated ? document.blocks.slice(0, limit) : document.blocks;
  const renderContext = { definitions: document.definitions };

  return (
    <MarkdownStyleContext.Provider value={style}>
      <Box
        sx={{
          color: ink,
          '& > :first-of-type': { mt: 0 },
          '& > :last-child': { mb: 0 },
        }}
      >
        {visibleBlocks.map((node, index) => renderMdastNode(node, renderContext, `root.${index}`))}
        {truncated ? (
          <MarkdownParagraph className="assistant-markdown-ellipsis">…</MarkdownParagraph>
        ) : null}
      </Box>
    </MarkdownStyleContext.Provider>
  );
}
