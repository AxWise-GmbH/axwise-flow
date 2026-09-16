import { Fragment, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  Collapse,
  Paper,
  Popover,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  ToggleButtonGroup,
  ToggleButton,
  Tabs,
  Tab,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import TuneIcon from '@mui/icons-material/Tune';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import GitHubIcon from '@mui/icons-material/GitHub';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import GroupsIcon from '@mui/icons-material/Groups';
import HandshakeIcon from '@mui/icons-material/Handshake';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import FormDialog from '../../components/Common/FormDialog';

import PageLayout from '../../components/Common/PageLayout';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import KnowledgeBaseArt from '../../components/illustrations/pages/KnowledgeBaseArt';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import KBDocumentCard from '../../components/KnowledgeBase/KBDocumentCard';
import KBCategoryCard from '../../components/KnowledgeBase/KBCategoryCard';
import KBAddDialog from '../../components/KnowledgeBase/KBAddDialog';
import KBSourcesPanel from '../../components/KnowledgeBase/KBSourcesPanel';
import KBStorageMonitor from '../../components/KnowledgeBase/KBStorageMonitor';
import { showsViewToggle } from './kbViewToggle';
import PageExplain from '../../components/Common/PageExplain';
import { slugifyTitle } from '../../config/explainContent';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import KBDocumentViewDialog from '../../components/KnowledgeBase/KBDocumentViewDialog';
import KBVersionDiffDialog from './KBVersionDiffDialog';
import KBContactsTable from '../../components/KnowledgeBase/KBContactsTable';
import KBContactsImportDialog from '../../components/KnowledgeBase/KBContactsImportDialog';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
// TODO: KBGithubOffersTable + KBRefreshOffersButton exist locally but are untracked;
// re-enable these imports once those component files are committed.
// import KBGithubOffersTable from '../../components/KnowledgeBase/KBGithubOffersTable';
// import KBRefreshOffersButton from '../../components/KnowledgeBase/KBRefreshOffersButton';

import { useKnowledgeBase } from '../../hooks/useKnowledgeBase';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import {
  updateDocument,
  deleteDocument,
  searchKnowledge,
  addBookmark,
} from '../../services/knowledgeBaseService';
import { parseBookmarksFile } from '../../utils/parseBookmarks';
import { listOrganizations } from '../../services/organizationService';
import { loadConcilium } from '../../services/conciliumBackend';
import {
  listContacts,
  addContact,
  updateContact,
  deleteContact,
  importContacts,
  findMatches,
} from '../../services/contactsService';
import { logAction, loadAuditLogs } from '../../services/auditLogBackend';
import { getKBFileUrl } from '../../services/kbFileService';
import { CATEGORY_GROUP_LIST, docToType } from '../../utils/kbConstants';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ClearIcon from '@mui/icons-material/Clear';

import AppIcon from '../../components/icons/AppIcon';

// ── Helpers ──────────────────────────────────────────────
function timeAgo(date) {
  if (!date) return '-';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const ADV_COLUMNS = [
  { id: 'id', label: 'ID', sortable: false, minWidth: 140 },
  { id: 'title', label: 'Name', sortable: true, minWidth: 200 },
  { id: 'content_type', label: 'Type', sortable: true, minWidth: 90, align: 'center' },
  { id: 'category', label: 'Category', sortable: true, minWidth: 140 },
  { id: 'owner_type', label: 'Owner', sortable: true, minWidth: 120 },
  { id: 'organization', label: 'Organization', sortable: false, minWidth: 150 },
  { id: 'tags', label: 'Tags', sortable: false, minWidth: 160 },
  { id: 'created_at', label: 'Added', sortable: true, minWidth: 100 },
];

const TYPE_META = {
  note: { label: 'Note', color: '#2563EB', bg: '#DBEAFE', icon: NoteOutlinedIcon },
  file: { label: 'File', color: '#059669', bg: '#D1FAE5', icon: InsertDriveFileOutlinedIcon },
  link: { label: 'Link', color: '#D97706', bg: '#FEF3C7', icon: LinkOutlinedIcon },
  template: { label: 'Template', color: '#7C3AED', bg: '#EDE9FE', icon: DescriptionOutlinedIcon },
};

const OWNER_META = {
  user: { label: 'My KB', icon: PersonOutlineIcon, color: '#2563EB' },
  agent: { label: 'Agent', icon: SmartToyIcon, color: '#7C3AED' },
  team: { label: 'Team', icon: GroupsIcon, color: '#059669' },
  partner: { label: 'Partner', icon: HandshakeIcon, color: '#D97706' },
};

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'user', label: 'My KB' },
  { value: 'agent', label: 'Agents' },
  { value: 'team', label: 'Teams' },
  { value: 'partner', label: 'Partners' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'note', label: 'Notes' },
  { value: 'file', label: 'Files' },
  { value: 'link', label: 'Links' },
  { value: 'template', label: 'Templates' },
];

// ── Main Component ───────────────────────────────────────
export default function KnowledgeBase({ embedded = false, showMetrics: showMetricsProp } = {}) {
  const theme = useTheme();
  const [showMetricsLocal, setShowMetrics] = useShowMetrics('kb');
  // When embedded, mirror the parent page's metrics toggle instead of tracking our own.
  const showMetrics = showMetricsProp !== undefined ? showMetricsProp : showMetricsLocal;

  // Tab - default to the connected-sources view when the page opens.
  const [tab, setTab] = useState('sources');

  // Filters
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [contentType, setContentType] = useState('all');
  const [categoryGroup, setCategoryGroup] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [conciliumFilter, setConciliumFilter] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [boards, setBoards] = useState([]);
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [categoryAnchor, setCategoryAnchor] = useState(null);

  // Semantic search
  const [semanticQuery, setSemanticQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // View mode, sort, pagination. Soft default: cards in simple mode, table in advanced.
  const { simpleMode } = useSimpleMode();
  const [viewMode, setViewMode] = useState(simpleMode ? 'cards' : 'table');
  const [orderBy, setOrderBy] = useState('created_at');
  const [orderDir, setOrderDir] = useState('desc');

  // CRUD
  const [addOpen, setAddOpen] = useState(false);
  const [editDoc, setEditDoc] = useState(null);

  // Bookmark import (Firefox/Chrome/Edge exports)
  const bookmarkFileRef = useRef(null);
  const [importingBookmarks, setImportingBookmarks] = useState(false);
  const [notice, setNotice] = useState('');

  // Deep link: /knowledge-base?action=create opens the Add dialog on mount
  // (used by the Home "Explain?" tour CTA). Ref-guarded so it fires once.
  const [searchParams, setSearchParams] = useSearchParams();
  const actionHandled = useRef(false);
  useEffect(() => {
    if (embedded || actionHandled.current) return;
    if (searchParams.get('action') === 'create') {
      actionHandled.current = true;
      setAddOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [embedded, searchParams, setSearchParams]);

  // Deep-link a category tab from the URL (e.g. /knowledge-base?tab=phone-contacts,
  // used by the assistant setup panel). Consume the param so later manual tab
  // changes are not overridden.
  const tabHandled = useRef(false);
  useEffect(() => {
    if (embedded || tabHandled.current) return;
    const wanted = searchParams.get('tab');
    if (!wanted) return;
    tabHandled.current = true;
    const KNOWN_TABS = [
      'sources', 'monitor', 'all', 'documents', 'bookmarks',
      'phone-contacts', 'mail-contacts', 'goals', 'memory', 'reports', 'github-offers',
    ];
    if (KNOWN_TABS.includes(wanted)) setTab(wanted);
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [embedded, searchParams, setSearchParams]);
  const [viewDoc, setViewDoc] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // Inline organization assignment (from the Organization column)
  const [orgAssignAnchor, setOrgAssignAnchor] = useState(null);
  const [orgAssignDoc, setOrgAssignDoc] = useState(null);

  // Contacts states
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    attitude: 'neutral',
    comment: '',
    goal_id: null,
    contact_type: 'phone',
  });

  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const type = tab === 'phone-contacts' ? 'phone' : 'mail';
      const data = await listContacts({ search_text: search, contact_type: type });
      setContacts(data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch contacts');
    } finally {
      setContactsLoading(false);
    }
  }, [search, tab]);

  useEffect(() => {
    if (tab === 'phone-contacts' || tab === 'mail-contacts') {
      fetchContacts();
    }
  }, [tab, fetchContacts]);

  useEffect(() => {
    if (editingContact) {
      setContactForm({
        name: editingContact.name || '',
        email: editingContact.email || '',
        phone: editingContact.phone || '',
        attitude: editingContact.attitude || 'neutral',
        comment: editingContact.comment || '',
        goal_id: editingContact.goal_id || null,
        contact_type: editingContact.contact_type || 'phone',
      });
    } else {
      setContactForm({
        name: '',
        email: '',
        phone: '',
        attitude: 'neutral',
        comment: '',
        goal_id: null,
        contact_type: tab === 'mail-contacts' ? 'mail' : 'phone',
      });
    }
  }, [editingContact, contactDialogOpen, tab]);

  // ── KB operation logging (Activity log + Home Data Operations) ──
  // Actions are normalized to read | write | create | delete; details carry the
  // KB "type" (docToType) + title/agent so downstream views can label rows.
  const kbReadLogged = useRef(new Set());
  const kbOpDetails = (doc, summary, overrides = {}) => ({
    summary,
    type: overrides.type || docToType(doc),
    title: doc?.title || doc?.name || overrides.title || 'Untitled',
    content_type: doc?.content_type || null,
    category: doc?.category || null,
    agent_name:
      doc?.metadata?.agent_name || (doc?.owner_type === 'agent' ? doc?.owner_id : null) || null,
  });

  // Log a 'read' once per document per page session when its viewer opens.
  useEffect(() => {
    if (!viewDoc?.id || kbReadLogged.current.has(viewDoc.id)) return;
    kbReadLogged.current.add(viewDoc.id);
    logAction({
      action: 'read',
      entity: 'Knowledge',
      entityId: viewDoc.id,
      details: kbOpDetails(viewDoc, `Viewed "${viewDoc.title || 'Untitled'}"`),
      meta: { source: 'knowledgeBase', importance: 'low', tags: ['read'] },
    }).catch(() => {});
  }, [viewDoc]);

  const handleContactSave = async () => {
    if (!contactForm.name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      if (editingContact) {
        await updateContact(editingContact.id, contactForm);
        logAction({
          action: 'write',
          entity: 'Knowledge',
          entityId: editingContact.id,
          details: kbOpDetails(editingContact, `Updated contact "${contactForm.name}"`, {
            type: tab === 'mail-contacts' ? 'Mail Contact' : 'Phone Contact',
            title: contactForm.name,
          }),
          meta: { source: 'knowledgeBase', importance: 'medium', tags: ['update'] },
        }).catch(() => {});
      } else {
        const result = await addContact(contactForm);
        logAction({
          action: 'create',
          entity: 'Knowledge',
          entityId: result.id,
          details: kbOpDetails(result, `Added contact "${contactForm.name}"`, {
            type: tab === 'mail-contacts' ? 'Mail Contact' : 'Phone Contact',
            title: contactForm.name,
          }),
          meta: { source: 'knowledgeBase', importance: 'medium', tags: ['create'] },
        }).catch(() => {});
      }
      setContactDialogOpen(false);
      fetchContacts();
    } catch (err) {
      setError(err.message || 'Failed to save contact');
    }
  };

  const handleImportContacts = async (contactsList) => {
    try {
      const type = tab === 'mail-contacts' ? 'mail' : 'phone';
      const contactsWithType = contactsList.map((c) => ({
        ...c,
        contact_type: type,
      }));
      await importContacts(contactsWithType);
      logAction({
        action: 'create',
        entity: 'Knowledge',
        details: kbOpDetails(null, `Imported ${contactsList.length} contacts`, {
          type: tab === 'mail-contacts' ? 'Mail Contact' : 'Phone Contact',
        }),
        meta: { source: 'knowledgeBase', importance: 'medium', tags: ['create', 'import'] },
      }).catch(() => {});
      setImportDialogOpen(false);
      fetchContacts();
    } catch (err) {
      setError(err.message || 'Failed to import contacts');
    }
  };

  const handleFindMatches = async () => {
    setMatching(true);
    setError('');
    try {
      await findMatches();
      logAction({
        action: 'write',
        entity: 'Knowledge',
        details: kbOpDetails(null, 'Triggered contacts duplicate / cross-matching scan', {
          type: tab === 'mail-contacts' ? 'Mail Contact' : 'Phone Contact',
        }),
        meta: { source: 'knowledgeBase', importance: 'medium', tags: ['update', 'match'] },
      }).catch(() => {});
      await fetchContacts();
    } catch (err) {
      setError(err.message || 'Failed to find matches');
    } finally {
      setMatching(false);
    }
  };

  // Organizations + consilium boards — for the scoping filters and row labels.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [orgList, boardList] = await Promise.all([
        listOrganizations().catch(() => []),
        loadConcilium().catch(() => []),
      ]);
      if (!alive) return;
      setOrgs(Array.isArray(orgList) ? orgList : []);
      setBoards(Array.isArray(boardList) ? boardList : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const orgNameById = useMemo(() => Object.fromEntries(orgs.map((o) => [o.id, o.name])), [orgs]);
  const boardNameById = useMemo(
    () => Object.fromEntries(boards.map((b) => [b.id, b.name])),
    [boards]
  );

  const filters = useMemo(() => {
    const f = {};
    if (scope !== 'all') f.owner_type = scope;
    if (contentType !== 'all') f.content_type = contentType;
    if (categoryGroup) f.category_group = categoryGroup;
    if (dateFrom) f.date_from = dateFrom;
    if (dateTo) f.date_to = dateTo;
    if (agentFilter) f.agent_name = agentFilter;
    if (search) f.search_text = search;
    if (orgFilter) f.organization_id = orgFilter;
    if (conciliumFilter) f.concilium_id = conciliumFilter;
    return f;
  }, [
    scope,
    contentType,
    categoryGroup,
    dateFrom,
    dateTo,
    agentFilter,
    search,
    orgFilter,
    conciliumFilter,
  ]);

  const { documents, tags, agents, loading, refetch } = useKnowledgeBase(filters);

  // Deep-link support: /knowledge-base?doc=<id> opens the document viewer
  // on mount. Used by the inline viewer in GoalDetailDialog's "Open in
  // Knowledge Base" button - previously the page ignored the query param
  // and users had to search for the doc manually (reported as "broken link").
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const docId = params.get('doc');
    if (!docId || loading) return;
    const found = documents.find((d) => d.id === docId);
    if (found) setViewDoc(found);
  }, [documents, loading]);

  // Metrics
  const metrics = useMemo(() => {
    const m = { total: documents.length, notes: 0, files: 0, links: 0, pinned: 0 };
    for (const d of documents) {
      if (d.content_type === 'note') m.notes++;
      else if (d.content_type === 'file') m.files++;
      else if (d.content_type === 'link') m.links++;
      if (d.is_pinned) m.pinned++;
    }
    return m;
  }, [documents]);

  const statCards = useMemo(
    () => [
      {
        label: 'Total',
        value: metrics.total,
        helper: 'All documents',
        color: theme.palette.primary.main,
        icon: MenuBookOutlinedIcon,
      },
      {
        label: 'Notes',
        value: metrics.notes,
        helper: 'Text entries',
        color: theme.palette.info.main,
        icon: DescriptionOutlinedIcon,
      },
      {
        label: 'Files',
        value: metrics.files,
        helper: 'Uploaded files',
        color: theme.palette.success.main,
        icon: InsertDriveFileOutlinedIcon,
      },
      {
        label: 'Links',
        value: metrics.links,
        helper: 'Web links',
        color: theme.palette.warning.main,
        icon: LinkOutlinedIcon,
      },
      {
        label: 'Pinned',
        value: metrics.pinned,
        helper: 'Starred items',
        color: theme.palette.secondary.main,
        icon: PushPinOutlinedIcon,
      },
    ],
    [metrics, theme]
  );

  // Tab filter helper
  const applyTabFilter = useCallback(
    (list) => {
      if (tab === 'all') return list;
      if (tab === 'documents')
        return list.filter((d) => d.owner_type === 'user' && (!d.source || d.source === ''));
      if (tab === 'bookmarks')
        return list.filter(
          (d) =>
            d.content_type === 'link' &&
            (d.category === 'bookmark' || (d.tags || []).some((t) => t === 'bookmark'))
        );
      if (tab === 'goals')
        return list.filter(
          (d) =>
            ['goal-plan', 'goal-output'].includes(d.category) ||
            (d.tags || []).some((t) => t === 'goal')
        );
      if (tab === 'memory')
        return list.filter(
          (d) =>
            d.owner_type === 'agent' ||
            ['job-memory', 'agent-work-memory'].includes(d.category) ||
            (d.tags || []).some((t) => t === 'pulse-learning' || t === 'auto-memory')
        );
      if (tab === 'reports')
        return list.filter(
          (d) =>
            ['goal-report', 'goal-retrospective', 'agent-report'].includes(d.category) ||
            (d.tags || []).some((t) => t === 'report' || t === 'final')
        );
      if (tab === 'github-offers')
        return list.filter(
          (d) => d.category === 'github-offer' || (d.tags || []).some((t) => t === 'github-offer')
        );
      return list;
    },
    [tab]
  );

  // Display data
  const displayData = useMemo(() => {
    const source = searchResults ?? documents;
    const list = applyTabFilter(source);
    return [...list].sort((a, b) => {
      const av = a[orderBy] ?? '';
      const bv = b[orderBy] ?? '';
      if (typeof av === 'string')
        return orderDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return orderDir === 'asc' ? av - bv : bv - av;
    });
  }, [documents, searchResults, orderBy, orderDir, applyTabFilter]);

  const kbPagination = usePagination(displayData, {
    surfaceId: 'kb.documents',
    defaultRowsPerPage: 10,
    resetOn: [
      tab,
      viewMode,
      scope,
      contentType,
      categoryGroup,
      dateFrom,
      dateTo,
      agentFilter,
      search,
      orgFilter,
      conciliumFilter,
      searchResults,
    ],
  });
  const pagedData = viewMode === 'table' ? kbPagination.paginatedData : displayData;

  const handleSort = useCallback(
    (col) => {
      setOrderDir((prev) => (orderBy === col && prev === 'desc' ? 'asc' : 'desc'));
      setOrderBy(col);
    },
    [orderBy]
  );

  const handleSemanticSearch = useCallback(async () => {
    if (!semanticQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchKnowledge(semanticQuery.trim(), { limit: 20 });
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err) {
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [semanticQuery]);

  const handlePin = useCallback(
    async (doc) => {
      try {
        const nextPinned = !doc.is_pinned;
        await updateDocument(doc.id, { is_pinned: nextPinned });
        logAction({
          action: 'write',
          entity: 'Knowledge',
          entityId: doc.id,
          details: kbOpDetails(
            doc,
            `${nextPinned ? 'Pinned' : 'Unpinned'} "${doc.title || 'Untitled'}"`
          ),
          meta: { source: 'knowledgeBase', importance: 'low', tags: ['update', 'pin'] },
        }).catch(() => {});
        refetch();
      } catch (err) {
        setError(err.message || 'Failed to update pin');
      }
    },
    [refetch]
  );

  // Assign (or clear) a document's organization from the Organization column.
  // Picking an org also applies that org's linked consilium board.
  const handleAssignOrg = useCallback(
    async (orgId) => {
      const doc = orgAssignDoc;
      setOrgAssignAnchor(null);
      setOrgAssignDoc(null);
      if (!doc) return;
      try {
        const org = orgs.find((o) => o.id === orgId);
        await updateDocument(doc.id, {
          organization_id: orgId || null,
          concilium_id: orgId ? org?.consilium_id || null : null,
        });
        logAction({
          action: 'write',
          entity: 'Knowledge',
          entityId: doc.id,
          details: kbOpDetails(
            doc,
            orgId
              ? `Assigned "${doc.title || 'Untitled'}" to ${org?.name || 'organization'}`
              : `Cleared organization on "${doc.title || 'Untitled'}"`
          ),
          meta: { source: 'knowledgeBase', importance: 'low', tags: ['update', 'organization'] },
        }).catch(() => {});
        refetch();
      } catch (err) {
        setError(err.message || 'Failed to assign organization');
      }
    },
    [orgAssignDoc, orgs, refetch]
  );

  const handleDownload = useCallback(async (doc) => {
    if (!doc.file_path) return;
    try {
      const url = await getKBFileUrl(doc.file_path);
      window.open(url, '_blank');
    } catch (err) {
      setError(err.message || 'Failed to get file URL');
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { id, name, title, content_type } = deleteTarget;
      if (tab === 'phone-contacts' || tab === 'mail-contacts') {
        await deleteContact(id);
        logAction({
          action: 'delete',
          entity: 'Knowledge',
          entityId: id,
          details: kbOpDetails(deleteTarget, `Deleted contact "${name || 'Untitled'}"`, {
            type: tab === 'mail-contacts' ? 'Mail Contact' : 'Phone Contact',
            title: name,
          }),
          meta: { source: 'knowledgeBase', importance: 'medium', tags: ['delete'] },
        }).catch(() => {});
        setDeleteTarget(null);
        fetchContacts();
      } else {
        await deleteDocument(id);
        logAction({
          action: 'delete',
          entity: 'Knowledge',
          entityId: id,
          details: kbOpDetails(
            deleteTarget,
            `Deleted ${content_type || 'entry'} "${title || 'Untitled'}"`
          ),
          meta: { source: 'knowledgeBase', importance: 'medium', tags: ['delete'] },
        }).catch(() => {});
        setDeleteTarget(null);
        refetch();
      }
    } catch (err) {
      setError(err.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, tab, refetch, fetchContacts]);

  const handleKBSaved = useCallback(
    (evt) => {
      const mode = evt?.mode;
      const doc = evt?.doc;
      if (mode === 'edit') {
        logAction({
          action: 'write',
          entity: 'Knowledge',
          entityId: evt?.id,
          details: kbOpDetails(doc, `Updated "${doc?.title || 'Untitled'}"`),
          meta: { source: 'knowledgeBase', importance: 'medium', tags: ['update'] },
        }).catch(() => {});
      } else if (mode === 'add') {
        logAction({
          action: 'create',
          entity: 'Knowledge',
          entityId: evt?.id,
          details: kbOpDetails(
            doc,
            `Added ${doc?.content_type || 'entry'} "${doc?.title || 'Untitled'}"`
          ),
          meta: { source: 'knowledgeBase', importance: 'medium', tags: ['create'] },
        }).catch(() => {});
      }
      refetch();
    },
    [refetch]
  );

  // Import bookmarks from a browser export (Netscape HTML or Firefox JSON).
  // Parsed client-side, deduped against existing bookmark URLs, then bulk-added
  // with a small delay between inserts to respect the KB rate limit (30/min).
  const handleBookmarkImport = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-importing the same file
      if (!file) return;
      setImportingBookmarks(true);
      setError('');
      setNotice('');
      try {
        const text = await file.text();
        const parsed = parseBookmarksFile(text, file.name);
        if (!parsed.length) {
          setError('No bookmarks found in that file. Export as HTML from Chrome/Edge/Firefox.');
          return;
        }
        const existing = new Set(
          (documents || [])
            .filter((d) => d.content_type === 'link' && d.url)
            .map((d) => d.url.toLowerCase())
        );
        const fresh = parsed.filter((b) => !existing.has(b.url.toLowerCase()));
        let imported = 0;
        for (const bm of fresh) {
          try {
            await addBookmark({ url: bm.url, title: bm.title, collection: bm.collection });
            imported += 1;
          } catch {
            // Skip failures (e.g. a transient error) and keep importing the rest.
          }
        }
        const skipped = parsed.length - imported;
        setNotice(
          `Imported ${imported} bookmark${imported !== 1 ? 's' : ''}` +
            (skipped > 0 ? ` (${skipped} skipped as duplicates or errors)` : '') +
            '.'
        );
        logAction({
          action: 'create',
          entity: 'Knowledge',
          details: `Imported ${imported} bookmarks from ${file.name}`,
          meta: { source: 'knowledgeBase', importance: 'medium', tags: ['create', 'bookmark', 'import'] },
        }).catch(() => {});
        refetch();
      } catch (err) {
        setError(err.message || 'Bookmark import failed');
      } finally {
        setImportingBookmarks(false);
      }
    },
    [documents, refetch]
  );

  // ── Activity Log ──
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => log.entity === 'Knowledge');
      setActivityLogs(filtered);
    } catch {
      setActivityLogs([]);
    } finally {
      setActivityLogsLoading(false);
    }
  }, []);

  const closeActivityLog = useCallback(() => {
    setActivityLogOpen(false);
    setActivityLogs([]);
  }, []);

  const formatLogDateTime = (ts) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const getLogActionColor = (action) => {
    const a = (action || '').toLowerCase();
    if (a.includes('added') || a.includes('created') || a.includes('add')) return 'success';
    if (a.includes('deleted') || a.includes('delete')) return 'error';
    if (a.includes('updated') || a.includes('pinned') || a.includes('unpinned')) return 'info';
    return 'default';
  };

  const getUserFromLog = (log) => (log.user && log.user !== '-' ? log.user : '-');
  const getIpFromLog = (log) => log.detailsStructured?.network?.ip || '-';
  const isDark = theme.palette.mode === 'dark';

  const handleResetFilters = useCallback(() => {
    setScope('all');
    setContentType('all');
    setCategoryGroup('');
    setDateFrom('');
    setDateTo('');
    setAgentFilter('');
    setOrgFilter('');
    setConciliumFilter('');
    setSearch('');
    setSemanticQuery('');
    setSearchResults(null);
    setFilterAnchor(null);
  }, []);

  if (loading) return <LoadingSpinner />;

  const isSearchMode = searchResults !== null;
  const activeFilterCount =
    (scope !== 'all' ? 1 : 0) +
    (contentType !== 'all' ? 1 : 0) +
    (search ? 1 : 0) +
    (categoryGroup ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (agentFilter ? 1 : 0) +
    (orgFilter ? 1 : 0) +
    (conciliumFilter ? 1 : 0);

  const OuterWrapper = embedded ? Fragment : PageLayout;
  const outerWrapperProps = embedded ? {} : { showTitleBlock: false };
  const InnerWrapper = embedded ? Fragment : BentoCard;
  const innerWrapperProps = embedded
    ? {}
    : {
        title: 'Knowledge Base',
        hideTitle: true,
        subtitle: showMetrics
          ? `${documents.length} document${documents.length !== 1 ? 's' : ''}`
          : undefined,
        icon: MenuBookOutlinedIcon,
        iconColor: theme.palette.primary.main,
        noPadding: true,
        noTour: true, // the page wrapper itself isn't a tour step; its sections are
        action: (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PageExplain pageKey="/knowledge-base" />
            <MetricsToggleButton
              showMetrics={showMetrics}
              onToggle={() => setShowMetrics(!showMetrics)}
            />
          </Box>
        ),
      };

  return (
    <OuterWrapper {...outerWrapperProps}>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      <InnerWrapper {...innerWrapperProps}>
        {/* ── Metrics grid ── */}
        <Collapse in={showMetrics}>
          <Box
            data-tour-block="kb-metrics"
            data-tour-label="Library stats"
            sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}
          >
            <Box
              sx={{
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(3, minmax(0, 1fr))',
                  md: 'repeat(5, minmax(0, 1fr))',
                },
              }}
            >
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Paper
                    key={card.label}
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(card.color, 0.22),
                      background: `linear-gradient(135deg, ${alpha(card.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontWeight: 600 }}
                        >
                          {card.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.35rem',
                            fontWeight: 800,
                            color: 'text.primary',
                            lineHeight: 1.15,
                            mt: 0.45,
                          }}
                        >
                          {card.value}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                        >
                          {card.helper}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: 2,
                          bgcolor: alpha(card.color, 0.16),
                          color: card.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        </Collapse>

        {/* ── Toolbar ── */}
        <Box
          data-tour-block="kb-toolbar"
          data-tour-label="Controls"
          sx={{
            py: 1,
            px: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1, sm: 1.5 },
            flexWrap: 'wrap',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          {/* Filter button */}
          <Tooltip title="Filters: search, scope, type" placement="bottom" arrow>
            <IconButton
              onClick={(e) => setFilterAnchor(e.currentTarget)}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: activeFilterCount > 0 ? 'primary.main' : 'divider',
                borderRadius: 2,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
            >
              <AppIcon
                name="Tune"
                fallback={TuneIcon}
                sx={{
                  fontSize: 20,
                  color: activeFilterCount > 0 ? 'primary.main' : 'text.secondary',
                }}
              />
              {activeFilterCount > 0 && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    color: '#fff',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {activeFilterCount}
                </Box>
              )}
            </IconButton>
          </Tooltip>

          {/* Filter popover */}
          <Popover
            open={Boolean(filterAnchor)}
            anchorEl={filterAnchor}
            onClose={() => setFilterAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1.5,
                  p: 0,
                  borderRadius: 3,
                  minWidth: 340,
                  maxWidth: 400,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                },
              },
            }}
          >
            {/* Popover header */}
            <Box
              sx={{
                px: 2.5,
                py: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    color: 'primary.main',
                  }}
                >
                  <AppIcon name="FilterList" fallback={FilterListIcon} sx={{ fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    Filters
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    Search, scope, content type
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Popover body */}
            <Box
              sx={{
                p: 2.5,
                maxHeight: 480,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {/* Search */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Search
                </Typography>
                <TextField
                  size="small"
                  placeholder="Search documents..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  fullWidth
                  sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AppIcon
                          name="Search"
                          fallback={SearchIcon}
                          sx={{ fontSize: 16, color: 'text.secondary' }}
                        />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {/* Category Group */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Category
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={categoryGroup}
                    onChange={(e) => {
                      setCategoryGroup(e.target.value);
                    }}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    {CATEGORY_GROUP_LIST.map((g) => (
                      <MenuItem key={g.value} value={g.value}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {g.color && (
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: g.color,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {g.label}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* Date Range */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Date Range
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    type="date"
                    label="From"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                    }}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{
                      flex: 1,
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.8rem' },
                    }}
                  />
                  <TextField
                    size="small"
                    type="date"
                    label="To"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                    }}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{
                      flex: 1,
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.8rem' },
                    }}
                  />
                </Box>
              </Box>

              {/* AI Agent */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  AI Agent
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={agentFilter}
                    onChange={(e) => {
                      setAgentFilter(e.target.value);
                    }}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                    startAdornment={
                      agentFilter ? (
                        <AppIcon
                          name="SmartToyOutlined"
                          fallback={SmartToyOutlinedIcon}
                          sx={{ fontSize: 16, mr: 0.75, color: 'info.main' }}
                        />
                      ) : undefined
                    }
                  >
                    <MenuItem value="">All Agents</MenuItem>
                    {agents.map((name) => (
                      <MenuItem key={name} value={name}>
                        {name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* Scope */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Scope
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value);
                    }}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    {SCOPE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* Organization */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Organization
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={orgFilter}
                    onChange={(e) => {
                      setOrgFilter(e.target.value);
                    }}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="">All Organizations</MenuItem>
                    {orgs.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* Consilium */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Consilium
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={conciliumFilter}
                    onChange={(e) => {
                      setConciliumFilter(e.target.value);
                    }}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="">All Consiliums</MenuItem>
                    {boards.map((b) => (
                      <MenuItem key={b.id} value={b.id}>
                        {b.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* Content Type */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Content Type
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={contentType}
                    onChange={(e) => {
                      setContentType(e.target.value);
                    }}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* AI Search */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    letterSpacing: '0.08em',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  AI Semantic Search
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    placeholder="Semantic search..."
                    value={semanticQuery}
                    onChange={(e) => setSemanticQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
                    fullWidth
                    sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <AppIcon
                            name="TravelExplore"
                            fallback={TravelExploreIcon}
                            sx={{ fontSize: 16, color: 'text.secondary' }}
                          />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <IconButton
                    onClick={handleSemanticSearch}
                    disabled={!semanticQuery.trim() || searching}
                    sx={{
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      borderRadius: 2,
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
                    }}
                  >
                    {searching ? (
                      <CircularProgress size={16} />
                    ) : (
                      <AppIcon
                        name="Search"
                        fallback={SearchIcon}
                        sx={{ fontSize: 16, color: 'primary.main' }}
                      />
                    )}
                  </IconButton>
                </Box>
              </Box>

              {activeFilterCount > 0 && (
                <Button
                  fullWidth
                  variant="outlined"
                  size="small"
                  onClick={handleResetFilters}
                  startIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Clear all filters
                </Button>
              )}
            </Box>
          </Popover>

          {/* View toggle - only while browsing a document category */}
          {showsViewToggle(tab) && (
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => v != null && setViewMode(v)}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.background.default, 0.8),
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                '& .MuiToggleButton-root': {
                  px: 1.25,
                  py: 0.75,
                  border: 'none',
                  color: 'text.secondary',
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                    color: 'primary.main',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
                  },
                },
              }}
            >
              <ToggleButton value="cards" aria-label="Card view">
                <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
              </ToggleButton>
              <ToggleButton value="table" aria-label="Table view">
                <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          {/* Activity log */}
          <Tooltip title="Activity Log" placement="bottom" arrow>
            <IconButton
              onClick={openActivityLog}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
              aria-label="Activity Log"
            >
              <AppIcon
                name="History"
                fallback={HistoryIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>

          {/* Active filter chips */}
          {categoryGroup && (
            <Chip
              label={categoryGroup}
              size="small"
              onDelete={() => setCategoryGroup('')}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
              }}
            />
          )}
          {agentFilter && (
            <Chip
              label={agentFilter}
              size="small"
              icon={
                <AppIcon
                  name="SmartToyOutlined"
                  fallback={SmartToyOutlinedIcon}
                  sx={{ fontSize: '14px !important' }}
                />
              }
              onDelete={() => setAgentFilter('')}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
            />
          )}
          {orgFilter && (
            <Chip
              label={orgNameById[orgFilter] || 'Organization'}
              size="small"
              onDelete={() => setOrgFilter('')}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
              }}
            />
          )}
          {conciliumFilter && (
            <Chip
              label={boardNameById[conciliumFilter] || 'Consilium'}
              size="small"
              onDelete={() => setConciliumFilter('')}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
              }}
            />
          )}
          {(dateFrom || dateTo) && (
            <Chip
              label={`${dateFrom || '...'} - ${dateTo || '...'}`}
              size="small"
              onDelete={() => {
                setDateFrom('');
                setDateTo('');
              }}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
            />
          )}
          {search && (
            <Chip
              label={`"${search.length > 15 ? search.slice(0, 15) + '…' : search}"`}
              size="small"
              onDelete={() => setSearch('')}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
            />
          )}
          {isSearchMode && (
            <Chip
              label={`${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
              color="primary"
              variant="outlined"
              size="small"
              onDelete={() => {
                setSearchResults(null);
                setSemanticQuery('');
              }}
              sx={{ fontSize: '0.7rem' }}
            />
          )}

          <Box sx={{ flex: 1 }} />

          {/* Sources (icon only) — opens the connected-sources view */}
          <Tooltip title="Sources" placement="bottom" arrow>
            <IconButton
              onClick={() => setTab('sources')}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: tab === 'sources' ? 'primary.main' : 'divider',
                borderRadius: 2,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
              aria-label="Sources"
            >
              <AppIcon
                name="Hub"
                fallback={HubOutlinedIcon}
                sx={{ fontSize: 20, color: tab === 'sources' ? 'primary.main' : 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>

          {/* Storage monitor (icon only) — real-data dashboard over the sources */}
          <Tooltip title="Storage monitor" placement="bottom" arrow>
            <IconButton
              onClick={() => setTab('monitor')}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: tab === 'monitor' ? 'primary.main' : 'divider',
                borderRadius: 2,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
              aria-label="Storage monitor"
            >
              <AppIcon
                name="MonitorHeart"
                fallback={MonitorHeartOutlinedIcon}
                sx={{ fontSize: 20, color: tab === 'monitor' ? 'primary.main' : 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>

          {/* Category button (icon) */}
          {(() => {
            const categories = [
              { id: 'all', label: 'All', icon: MenuBookOutlinedIcon },
              { id: 'documents', label: 'Documents', icon: DescriptionOutlinedIcon },
              { id: 'bookmarks', label: 'Bookmarks', icon: BookmarkBorderOutlinedIcon },
              { id: 'phone-contacts', label: 'Phone Contact', icon: PhoneAndroidIcon },
              { id: 'mail-contacts', label: 'Mail Contact', icon: AlternateEmailIcon },
              { id: 'goals', label: 'Goals', icon: TrackChangesOutlinedIcon },
              { id: 'memory', label: 'Agent Memory', icon: PsychologyOutlinedIcon },
              { id: 'reports', label: 'Reports', icon: AssessmentOutlinedIcon },
              { id: 'github-offers', label: 'Github offers', icon: GitHubIcon },
            ];
            return (
              <>
                <Tooltip title="Category" placement="bottom" arrow>
                  <IconButton
                    onClick={(e) => setCategoryAnchor(e.currentTarget)}
                    sx={{
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.06),
                        borderColor: 'primary.main',
                      },
                    }}
                    aria-label="Categories"
                  >
                    <AppIcon
                      name="CategoryOutlined"
                      fallback={CategoryOutlinedIcon}
                      sx={{ fontSize: 20, color: 'text.secondary' }}
                    />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={categoryAnchor}
                  open={Boolean(categoryAnchor)}
                  onClose={() => setCategoryAnchor(null)}
                  slotProps={{ paper: { sx: { mt: 1, minWidth: 220, borderRadius: 2 } } }}
                >
                  {categories.map((c) => {
                    const Icon = c.icon;
                    const selected = c.id === tab;
                    return (
                      <MenuItem
                        key={c.id}
                        selected={selected}
                        onClick={() => {
                          setTab(c.id);
                          setCategoryAnchor(null);
                        }}
                        sx={{
                          gap: 1,
                          '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                          '&.Mui-selected:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.14),
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{ minWidth: 28, color: selected ? 'primary.main' : 'text.secondary' }}
                        >
                          <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={c.label}
                          primaryTypographyProps={{
                            fontWeight: selected ? 700 : 500,
                            color: selected ? 'primary.main' : 'text.primary',
                            fontSize: '0.85rem',
                          }}
                        />
                      </MenuItem>
                    );
                  })}
                </Menu>
              </>
            );
          })()}

          {/* Import contacts (Contacts tabs only) */}
          {(tab === 'phone-contacts' || tab === 'mail-contacts') && (
            <Tooltip title="Import contacts from CSV">
              <IconButton
                onClick={() => setImportDialogOpen(true)}
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  color: 'text.secondary',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    borderColor: 'primary.main',
                    color: 'primary.main',
                  },
                  mr: 0.5,
                }}
              >
                <AppIcon
                  name="CloudUploadOutlined"
                  fallback={CloudUploadOutlinedIcon}
                  sx={{ fontSize: 20 }}
                />
              </IconButton>
            </Tooltip>
          )}

          {/* Find matches (Contacts tabs only) */}
          {(tab === 'phone-contacts' || tab === 'mail-contacts') && (
            <Tooltip title="Find matches across phone and mail contacts">
              <IconButton
                onClick={handleFindMatches}
                disabled={matching}
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  color: 'text.secondary',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    borderColor: 'primary.main',
                    color: 'primary.main',
                  },
                  mr: 0.5,
                }}
              >
                {matching ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <AppIcon
                    name="CompareArrows"
                    fallback={CompareArrowsIcon}
                    sx={{ fontSize: 20 }}
                  />
                )}
              </IconButton>
            </Tooltip>
          )}

          {/* Import bookmarks (Bookmarks tab only) — Firefox/Chrome/Edge exports */}
          {tab === 'bookmarks' && (
            <Tooltip title="Import bookmarks from Chrome, Edge, or Firefox (HTML/JSON export)">
              <span>
                <input
                  ref={bookmarkFileRef}
                  type="file"
                  accept=".html,.htm,.json,text/html,application/json"
                  hidden
                  onChange={handleBookmarkImport}
                />
                <IconButton
                  onClick={() => bookmarkFileRef.current?.click()}
                  disabled={importingBookmarks}
                  sx={{
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    color: 'text.secondary',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                      borderColor: 'primary.main',
                      color: 'primary.main',
                    },
                    mr: 0.5,
                  }}
                >
                  {importingBookmarks ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <AppIcon
                      name="CloudUploadOutlined"
                      fallback={CloudUploadOutlinedIcon}
                      sx={{ fontSize: 20 }}
                    />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}

          {/* Add button */}
          <Tooltip
            title={
              tab === 'phone-contacts' || tab === 'mail-contacts'
                ? 'Add new contact'
                : tab === 'bookmarks'
                  ? 'Add bookmark'
                  : 'Add new entry'
            }
          >
            <IconButton
              onClick={() => {
                if (tab === 'phone-contacts' || tab === 'mail-contacts') {
                  setEditingContact(null);
                  setContactDialogOpen(true);
                } else {
                  setAddOpen(true);
                }
              }}
              sx={{
                bgcolor: 'background.paper',
                border: '2px solid',
                borderColor: alpha(theme.palette.primary.main, 0.5),
                borderRadius: 2,
                color: 'primary.main',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
            >
              <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* ── Content ── */}
        <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>
          {tab === 'monitor' ? (
            <Box data-tour-block="storage-monitor" data-tour-label="Storage monitor">
              <KBStorageMonitor />
            </Box>
          ) : tab === 'sources' ? (
            <Box data-tour-block="connected-sources" data-tour-label="Connected sources">
              <KBSourcesPanel />
            </Box>
          ) : tab === 'github-offers' ? (
            <EmptyState
              icon={MenuBookOutlinedIcon}
              title="GitHub offers coming soon"
              description="This tab will be wired up once the KBGithubOffersTable and KBRefreshOffersButton components are committed to the repo."
            />
          ) : tab === 'phone-contacts' || tab === 'mail-contacts' ? (
            contactsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : (
              <KBContactsTable
                contacts={contacts}
                onEdit={(c) => {
                  setEditingContact(c);
                  setContactDialogOpen(true);
                }}
                onDelete={(c) => {
                  setDeleteTarget(c);
                }}
              />
            )
          ) : displayData.length === 0 ? (
            <EmptyState
              illustration={isSearchMode ? undefined : KnowledgeBaseArt}
              icon={isSearchMode ? TravelExploreIcon : undefined}
              title={
                isSearchMode
                  ? 'No matches found'
                  : search || contentType !== 'all'
                    ? 'No matching documents'
                    : 'No documents yet'
              }
              description={
                isSearchMode
                  ? 'Try a different search query'
                  : 'Add notes, files, or links to build your knowledge base'
              }
              actionLabel={!isSearchMode ? 'Add Document' : undefined}
              onAction={!isSearchMode ? () => setAddOpen(true) : undefined}
            />
          ) : viewMode === 'cards' ? (
            <Box data-tour-block="kb-content" data-tour-label="Your knowledge">
              <Typography
                variant="overline"
                sx={{
                  fontWeight: 700,
                  color: 'text.secondary',
                  letterSpacing: '0.08em',
                  fontSize: '0.68rem',
                  display: 'block',
                  mb: 1.5,
                }}
              >
                {displayData.length} document{displayData.length !== 1 ? 's' : ''}
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, minmax(0, 1fr))',
                    lg: 'repeat(3, minmax(0, 1fr))',
                  },
                }}
              >
                {displayData.map((doc) => (
                  <KBCategoryCard
                    key={doc.id}
                    doc={doc}
                    orgName={orgNameById[doc.organization_id]}
                    onView={(d) => setViewDoc(d)}
                    onEdit={(d) => setEditDoc(d)}
                    onDelete={(d) => setDeleteTarget(d)}
                    onPin={handlePin}
                    onDownload={handleDownload}
                  />
                ))}
              </Box>
            </Box>
          ) : (
            <Box data-tour-block="kb-content" data-tour-label="Your knowledge">
              <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {ADV_COLUMNS.map((col) => (
                        <TableCell
                          key={col.id}
                          align={col.align || 'left'}
                          sx={{
                            minWidth: col.minWidth,
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'text.secondary',
                          }}
                        >
                          {col.sortable ? (
                            <TableSortLabel
                              active={orderBy === col.id}
                              direction={orderBy === col.id ? orderDir : 'asc'}
                              onClick={() => handleSort(col.id)}
                            >
                              {col.label}
                            </TableSortLabel>
                          ) : (
                            col.label
                          )}
                        </TableCell>
                      ))}
                      {isSearchMode && (
                        <TableCell
                          align="center"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'text.secondary',
                          }}
                        >
                          Similarity
                        </TableCell>
                      )}
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.72rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'text.secondary',
                          minWidth: 110,
                        }}
                      >
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedData.map((doc) => {
                      const typeMeta = TYPE_META[doc.content_type] || TYPE_META.note;
                      const TypeIcon = typeMeta.icon;
                      const ownerMeta = OWNER_META[doc.owner_type] || OWNER_META.user;
                      const OwnerIcon = ownerMeta.icon;
                      return (
                        <TableRow
                          key={doc.id}
                          hover
                          onClick={() => setViewDoc(doc)}
                          sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                        >
                          <TableCell>
                            <Tooltip title={doc.id} arrow>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 600,
                                  fontFamily: 'monospace',
                                  color: 'text.secondary',
                                  fontSize: '0.72rem',
                                }}
                              >
                                {doc.id.length > 16 ? `${doc.id.slice(0, 16)}…` : doc.id}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Box
                              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}
                            >
                              {doc.is_pinned && (
                                <AppIcon
                                  name="PushPin"
                                  fallback={PushPinIcon}
                                  sx={{
                                    fontSize: 14,
                                    color: theme.palette.secondary.main,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <Tooltip title={doc.content?.slice(0, 300) || doc.title || ''} arrow>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 700, maxWidth: 280, color: 'text.primary' }}
                                  noWrap
                                >
                                  {doc.title || 'Untitled'}
                                </Typography>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              size="small"
                              icon={
                                <AppIcon
                                  fallback={TypeIcon}
                                  sx={{
                                    fontSize: '14px !important',
                                    color: `${typeMeta.color} !important`,
                                  }}
                                />
                              }
                              label={typeMeta.label}
                              sx={{
                                height: 22,
                                fontWeight: 600,
                                fontSize: '0.68rem',
                                bgcolor: alpha(typeMeta.color, 0.12),
                                color: typeMeta.color,
                                border: `1px solid ${alpha(typeMeta.color, 0.25)}`,
                                '& .MuiChip-icon': { ml: '6px' },
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={doc.category || 'general'}
                              variant="outlined"
                              sx={{
                                height: 22,
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                textTransform: 'capitalize',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AppIcon
                                fallback={OwnerIcon}
                                sx={{ fontSize: 14, color: ownerMeta.color }}
                              />
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                              >
                                {ownerMeta.label}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {doc.organization_id ? (
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                  minWidth: 0,
                                }}
                              >
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 600, fontSize: '0.75rem', display: 'block' }}
                                    noWrap
                                  >
                                    {orgNameById[doc.organization_id] || 'Organization'}
                                  </Typography>
                                  {doc.concilium_id && (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ fontSize: '0.66rem' }}
                                      noWrap
                                    >
                                      {boardNameById[doc.concilium_id] || doc.concilium_id}
                                    </Typography>
                                  )}
                                </Box>
                                <Tooltip title="Change organization">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      setOrgAssignAnchor(e.currentTarget);
                                      setOrgAssignDoc(doc);
                                    }}
                                    sx={{ p: 0.25, flexShrink: 0 }}
                                  >
                                    <AppIcon
                                      name="EditOutlined"
                                      fallback={EditOutlinedIcon}
                                      sx={{ fontSize: 13, color: 'text.secondary' }}
                                    />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ) : (
                              <Tooltip title="Assign organization">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    setOrgAssignAnchor(e.currentTarget);
                                    setOrgAssignDoc(doc);
                                  }}
                                  sx={{
                                    p: 0.25,
                                    border: '1px dashed',
                                    borderColor: 'divider',
                                    borderRadius: 1.5,
                                    color: 'text.secondary',
                                    '&:hover': {
                                      borderColor: 'primary.main',
                                      color: 'primary.main',
                                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                                    },
                                  }}
                                >
                                  <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 15 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap' }}>
                              {(doc.tags || []).slice(0, 3).map((t) => (
                                <Chip
                                  key={t}
                                  size="small"
                                  label={`#${t}`}
                                  variant="outlined"
                                  sx={{ height: 18, fontSize: '0.62rem', fontWeight: 500 }}
                                />
                              ))}
                              {(doc.tags || []).length > 3 && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'text.disabled',
                                    fontSize: '0.62rem',
                                    alignSelf: 'center',
                                  }}
                                >
                                  +{doc.tags.length - 3}
                                </Typography>
                              )}
                              {(doc.tags || []).length === 0 && (
                                <Typography
                                  variant="caption"
                                  color="text.disabled"
                                  sx={{ fontSize: '0.7rem' }}
                                >
                                  -
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontSize: '0.72rem' }}
                            >
                              {timeAgo(doc.created_at)}
                            </Typography>
                          </TableCell>
                          {isSearchMode && (
                            <TableCell align="center">
                              <Chip
                                size="small"
                                label={`${((doc.similarity || 0) * 100).toFixed(0)}%`}
                                color={
                                  doc.similarity >= 0.7
                                    ? 'success'
                                    : doc.similarity >= 0.4
                                      ? 'warning'
                                      : 'default'
                                }
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                              />
                            </TableCell>
                          )}
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end' }}>
                              <Tooltip title={doc.is_pinned ? 'Unpin' : 'Pin'}>
                                <IconButton
                                  size="small"
                                  onClick={() => handlePin(doc)}
                                  sx={{ p: 0.5 }}
                                >
                                  {doc.is_pinned ? (
                                    <AppIcon
                                      name="PushPin"
                                      fallback={PushPinIcon}
                                      sx={{ fontSize: 16, color: theme.palette.secondary.main }}
                                    />
                                  ) : (
                                    <AppIcon
                                      name="PushPinOutlined"
                                      fallback={PushPinOutlinedIcon}
                                      sx={{ fontSize: 16, color: 'text.secondary' }}
                                    />
                                  )}
                                </IconButton>
                              </Tooltip>
                              {doc.file_path && (
                                <Tooltip title="Download">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDownload(doc)}
                                    sx={{ p: 0.5 }}
                                  >
                                    <AppIcon
                                      name="DownloadOutlined"
                                      fallback={DownloadOutlinedIcon}
                                      sx={{ fontSize: 16, color: 'text.secondary' }}
                                    />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip title="View">
                                <IconButton
                                  size="small"
                                  onClick={() => setViewDoc(doc)}
                                  sx={{ p: 0.5 }}
                                >
                                  <AppIcon
                                    name="VisibilityOutlined"
                                    fallback={VisibilityOutlinedIcon}
                                    sx={{ fontSize: 16, color: 'text.secondary' }}
                                  />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Review changes">
                                <IconButton
                                  size="small"
                                  onClick={() => setHistoryDoc(doc)}
                                  sx={{ p: 0.5 }}
                                >
                                  <AppIcon
                                    name="History"
                                    fallback={HistoryIcon}
                                    sx={{ fontSize: 16, color: 'text.secondary' }}
                                  />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit">
                                <IconButton
                                  size="small"
                                  onClick={() => setEditDoc(doc)}
                                  sx={{ p: 0.5 }}
                                >
                                  <AppIcon
                                    name="EditOutlined"
                                    fallback={EditOutlinedIcon}
                                    sx={{ fontSize: 16, color: 'text.secondary' }}
                                  />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  onClick={() => setDeleteTarget(doc)}
                                  sx={{ p: 0.5, color: 'error.main' }}
                                >
                                  <AppIcon
                                    name="DeleteOutline"
                                    fallback={DeleteOutlineIcon}
                                    sx={{ fontSize: 16 }}
                                  />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Pagination
                count={kbPagination.totalCount}
                page={kbPagination.page}
                rowsPerPage={kbPagination.rowsPerPage}
                rowsPerPageOptions={kbPagination.rowsPerPageOptions}
                onPageChange={kbPagination.setPage}
                onRowsPerPageChange={kbPagination.setRowsPerPage}
                onLoadAll={kbPagination.loadAll}
                onCollapseAll={kbPagination.collapseAll}
                allMode={kbPagination.allMode}
                label="documents"
              />
            </Box>
          )}
        </Box>
      </InnerWrapper>
      {/* Inline organization assignment menu (from the Organization column) */}
      <Menu
        anchorEl={orgAssignAnchor}
        open={Boolean(orgAssignAnchor)}
        onClose={() => {
          setOrgAssignAnchor(null);
          setOrgAssignDoc(null);
        }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 240, maxHeight: 360, borderRadius: 2 } } }}
      >
        <Typography
          variant="overline"
          sx={{
            px: 2,
            pt: 1,
            display: 'block',
            fontWeight: 700,
            color: 'text.secondary',
            fontSize: '0.6rem',
            letterSpacing: '0.08em',
          }}
        >
          Assign organization
        </Typography>
        {orgs.length === 0 && (
          <MenuItem disabled sx={{ fontSize: '0.8rem' }}>
            No organizations. Create one first.
          </MenuItem>
        )}
        {orgs.map((o) => (
          <MenuItem
            key={o.id}
            selected={orgAssignDoc?.organization_id === o.id}
            onClick={() => handleAssignOrg(o.id)}
            sx={{ gap: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 28, color: 'text.secondary' }}>
              <AppIcon
                name="BusinessOutlined"
                fallback={BusinessOutlinedIcon}
                sx={{ fontSize: 18 }}
              />
            </ListItemIcon>
            <ListItemText
              primary={o.name}
              secondary={
                o.consilium_id
                  ? boardNameById[o.consilium_id] || o.org_type || undefined
                  : o.org_type || undefined
              }
              primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
              secondaryTypographyProps={{ fontSize: '0.7rem' }}
            />
          </MenuItem>
        ))}
        {orgAssignDoc?.organization_id && (
          <MenuItem onClick={() => handleAssignOrg(null)} sx={{ gap: 1, color: 'error.main' }}>
            <ListItemIcon sx={{ minWidth: 28, color: 'error.main' }}>
              <AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 16 }} />
            </ListItemIcon>
            <ListItemText
              primary="Clear organization"
              primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
            />
          </MenuItem>
        )}
      </Menu>
      {/* View dialog */}
      <KBDocumentViewDialog
        open={!!viewDoc}
        onClose={() => setViewDoc(null)}
        doc={viewDoc}
        onEdit={(d) => {
          setViewDoc(null);
          setEditDoc(d);
        }}
      />
      {/* Review changes (version diff) dialog */}
      <KBVersionDiffDialog
        open={!!historyDoc}
        doc={historyDoc}
        onClose={() => setHistoryDoc(null)}
      />
      {/* Add / Edit dialog */}
      {(addOpen || editDoc) && (
        <KBAddDialog
          open
          onClose={() => {
            setAddOpen(false);
            setEditDoc(null);
          }}
          onSaved={handleKBSaved}
          editDoc={editDoc}
          existingTags={tags}
          bookmarkMode={tab === 'bookmarks'}
        />
      )}
      {/* ===== Activity Log Dialog ===== */}
      <FormDialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        title="Knowledge Activity"
        subtitle="Document change history"
        icon={HistoryIcon}
        maxWidth="md"
        paperSx={{ maxHeight: '80vh' }}
        contentDividers={false}
        contentSx={{ p: 0 }}
        actions={
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ flex: 1 }}
            >{`${activityLogs.length} log entr${activityLogs.length !== 1 ? 'ies' : 'y'}`}</Typography>
            <Button
              onClick={closeActivityLog}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Close
            </Button>
          </>
        }
        footerJustify="flex-start"
      >
        <Tabs
          value={0}
          sx={{
            px: 3,
            minHeight: 40,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.82rem',
            },
          }}
        >
          <Tab
            icon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`Action Log (${activityLogs.length})`}
          />
        </Tabs>
        {activityLogsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading...
            </Typography>
          </Box>
        ) : activityLogs.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
            <AppIcon
              name="History"
              fallback={HistoryIcon}
              sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.95rem' }}>
              No actions recorded yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Adding, editing, pinning, and deleting knowledge entries will appear here.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Action', 'User', 'IP Address', 'Date & Time', 'Details'].map((h) => (
                    <TableCell
                      key={h}
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        bgcolor: isDark ? alpha(theme.palette.background.paper, 0.95) : 'grey.50',
                        borderBottom: '2px solid',
                        borderColor: 'divider',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {activityLogs.map((log) => (
                  <TableRow key={log.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ py: 1.25 }}>
                      <Chip
                        label={log.action}
                        size="small"
                        color={getLogActionColor(log.action)}
                        sx={{ fontWeight: 700, fontSize: '0.68rem', borderRadius: 1.5, height: 24 }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
                        {getUserFromLog(log)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          fontFamily: 'monospace',
                          color: 'text.secondary',
                        }}
                      >
                        {getIpFromLog(log)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                      >
                        {formatLogDateTime(log.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          color: 'text.primary',
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {log.details || '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </FormDialog>
      {/* Delete confirmation */}
      <FormDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title={
          tab === 'phone-contacts' || tab === 'mail-contacts' ? 'Delete Contact' : 'Delete Document'
        }
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDelete}
              disabled={deleting}
              startIcon={
                deleting ? (
                  <CircularProgress size={16} />
                ) : (
                  <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} />
                )
              }
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary">
          Are you sure you want to delete &quot;
          {deleteTarget?.title || deleteTarget?.name || 'Untitled'}&quot;? This cannot be undone.
        </Typography>
      </FormDialog>
      {/* Contact Add/Edit Dialog */}
      <Dialog
        open={contactDialogOpen}
        onClose={() => setContactDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, p: 1 } } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
          {editingContact ? 'Edit Contact' : 'Add Contact'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1.5 }}>
          <TextField
            label="Name"
            required
            value={contactForm.name}
            onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            label="Email"
            value={contactForm.email}
            onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            label="Phone"
            value={contactForm.phone}
            onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <FormControl
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          >
            <InputLabel>Attitude</InputLabel>
            <Select
              label="Attitude"
              value={contactForm.attitude}
              onChange={(e) => setContactForm({ ...contactForm, attitude: e.target.value })}
            >
              <MenuItem value="neutral">Neutral</MenuItem>
              <MenuItem value="vip">VIP</MenuItem>
              <MenuItem value="friendly">Friendly</MenuItem>
              <MenuItem value="cold_lead">Cold Lead</MenuItem>
              <MenuItem value="hostile">Hostile</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Comment"
            multiline
            rows={3}
            value={contactForm.comment}
            onChange={(e) => setContactForm({ ...contactForm, comment: e.target.value })}
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setContactDialogOpen(false)}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleContactSave}
            variant="contained"
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      {/* Contact CSV Import Dialog */}
      <KBContactsImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImport={handleImportContacts}
      />
    </OuterWrapper>
  );
}
