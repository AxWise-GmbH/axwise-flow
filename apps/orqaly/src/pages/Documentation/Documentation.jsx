import { useState, useMemo, useCallback } from 'react';
import { Box, Stack, Typography, useTheme } from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import PageLayout from '../../components/Common/PageLayout';
import MetricsStrip from '../../components/Common/MetricsStrip';
import { useAuth } from '../../context/AuthContext';

import DocTabBar from './components/DocTabBar';
import DocSearchBox from './components/DocSearchBox';
import { useDocSearch } from './hooks/useDocSearch';
import { buildDocSearchIndex } from './data/searchIndex';
import { TABS, TAB_DESCRIPTIONS } from './data/tabs';

import { PAGES_FEATURES } from './data/pages';
import { API_ENDPOINTS } from './data/api';
import { DB_TABLES, MIGRATION_COUNT } from './data/database';
import { LLM_PROVIDERS } from './data/providers';

import GettingStartedSection from './sections/GettingStartedSection';
import FaqSection from './sections/FaqSection';
import ProductPagesSection from './sections/ProductPagesSection';
import ArchitectureApiSection from './sections/ArchitectureApiSection';
import AgentsSection from './sections/AgentsSection';
import ConsiliumSection from './sections/ConsiliumSection';
import ProvidersSection from './sections/ProvidersSection';
import ToolsSection from './sections/ToolsSection';
import ApiKeysSection from './sections/ApiKeysSection';
import FullDocsSection from './sections/FullDocsSection';

export default function Documentation() {
  const theme = useTheme();
  const p = theme.palette;
  const { user } = useAuth();
  const userId = user?.uid;

  const [activeTab, setActiveTab] = useState('start');
  const [highlightId, setHighlightId] = useState(null);

  const index = useMemo(() => buildDocSearchIndex(), []);
  const { query, setQuery, results, clear } = useDocSearch(index);

  const handleSelectResult = useCallback(
    (record) => {
      setActiveTab(record.tab);
      // Re-set to null first so re-selecting the same anchor still re-triggers the flash.
      setHighlightId(null);
      requestAnimationFrame(() => setHighlightId(record.id));
      clear();
    },
    [clear]
  );

  const statCards = useMemo(
    () => [
      { label: 'Pages', value: PAGES_FEATURES.length, color: p.primary.main, icon: DashboardOutlinedIcon },
      { label: 'Endpoints', value: `${API_ENDPOINTS.length}+`, color: p.success?.main || p.primary.main, icon: ApiOutlinedIcon },
      { label: 'DB tables', value: `${DB_TABLES.length}+`, color: p.info?.main || p.primary.main, icon: StorageOutlinedIcon },
      { label: 'LLM providers', value: LLM_PROVIDERS.length, color: p.warning?.main || p.primary.main, icon: HubOutlinedIcon },
      { label: 'Migrations', value: MIGRATION_COUNT, color: p.error?.main || p.primary.main, icon: SchemaOutlinedIcon },
    ],
    [p]
  );

  return (
    <PageLayout title="Documentation" sx={{ maxWidth: '100%', width: '100%' }} showTitleBlock={false}>
      {/* Hero */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'flex-end' },
          justifyContent: 'space-between',
          gap: 2,
          mb: 2.5,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.7rem' }, letterSpacing: '-0.02em', mb: 0.5 }}
          >
            Documentation
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 620 }}>
            Everything you need to build, run, and integrate with Orqaly - the autonomous AI agent
            orchestration platform. Browse by section or search across every guide.
          </Typography>
        </Box>
        <DocSearchBox query={query} setQuery={setQuery} results={results} onSelect={handleSelectResult} onClear={clear} />
      </Box>

      {/* Stats */}
      <Box sx={{ mb: 1 }}>
        <MetricsStrip cards={statCards} pageKey="documentation" />
      </Box>

      {/* Tabs */}
      <Box sx={{ mb: 2.5 }}>
        <DocTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1.5, px: 0.5, fontSize: '0.82rem', lineHeight: 1.6, maxWidth: 860 }}
        >
          {TAB_DESCRIPTIONS[activeTab]}
        </Typography>
      </Box>

      {/* Active section */}
      {activeTab === 'start' && <GettingStartedSection highlightId={highlightId} />}
      {activeTab === 'faq' && <FaqSection highlightId={highlightId} />}
      {activeTab === 'product' && <ProductPagesSection highlightId={highlightId} />}
      {activeTab === 'architecture' && <ArchitectureApiSection highlightId={highlightId} />}
      {activeTab === 'agents' && <AgentsSection />}
      {activeTab === 'consilium' && <ConsiliumSection />}
      {activeTab === 'providers' && <ProvidersSection highlightId={highlightId} />}
      {activeTab === 'tools' && <ToolsSection />}
      {activeTab === 'keys' && <ApiKeysSection userId={userId} />}
      {activeTab === 'full' && <FullDocsSection />}
    </PageLayout>
  );
}
