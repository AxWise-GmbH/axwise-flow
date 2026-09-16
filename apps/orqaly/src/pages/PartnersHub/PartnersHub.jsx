import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Alert, Button } from '@mui/material';
import PageLayout from '../../components/Common/PageLayout';
import EntityListPage from './components/EntityListPage';
import PartnersOverview from './PartnersOverview';
import PartnersSettings from './PartnersSettings';
import { listEntityTypes } from '../../services/partnerEntityService';
import { DEFAULT_ENTITY_TYPES } from '../../config/partnerEntityTypes';

/**
 * Partners ready-business hub. `/partners-hub/:section` where section is
 * 'overview' | 'settings' | a type_key (partner|supplier|warehouse|crm|custom).
 * Loads the user's type configs once and routes to the right view.
 */
export default function PartnersHub() {
  const { section = 'overview' } = useParams();
  const [types, setTypes] = useState(DEFAULT_ENTITY_TYPES); // optimistic first paint
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTypes = async () => {
    setLoading(true);
    try {
      const rows = await listEntityTypes();
      if (Array.isArray(rows) && rows.length) setTypes(rows);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load entity types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTypes();
  }, []);

  const activeType = useMemo(
    () => types.find((t) => t.type_key === section),
    [types, section]
  );

  const title = activeType
    ? activeType.label
    : section === 'settings'
      ? 'Partners Settings'
      : 'Partners Overview';
  const subtitle = activeType
    ? activeType.description
    : section === 'settings'
      ? 'Personalize the fields, filters, and metrics for each entity type.'
      : 'Partners, suppliers, warehouses, and CRM contacts in one place.';

  let content;
  if (loading && section !== 'overview') {
    content = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  } else if (error) {
    content = (
      <Box sx={{ px: { xs: 1.25, sm: 1.5 } }}>
        <Alert severity="error" action={<Button onClick={loadTypes}>Retry</Button>}>
          {error}
        </Alert>
      </Box>
    );
  } else if (activeType) {
    content = <EntityListPage type={activeType} allTypes={types} />;
  } else if (section === 'settings') {
    content = <PartnersSettings types={types} onChange={loadTypes} />;
  } else {
    content = <PartnersOverview types={types} />;
  }

  // Type sections render their own BentoCard header (EntityListPage), so hide
  // the PageLayout title block for them; overview/settings keep it.
  return (
    <PageLayout title={title} subtitle={subtitle} showTitleBlock={!activeType}>
      {content}
    </PageLayout>
  );
}
