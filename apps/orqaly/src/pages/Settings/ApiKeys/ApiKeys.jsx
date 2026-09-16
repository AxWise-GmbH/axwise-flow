import { useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PageLayout from '../../../components/Common/PageLayout';
import { CATEGORIES, PROVIDERS_BY_CATEGORY } from './providerCatalog';
import { useUserApiKeys } from './useUserApiKeys';
import KeyCategorySection from './KeyCategorySection';
import KeyRow from './KeyRow';
import KeyDialog from './KeyDialog';
import ImportKeysButton from './Import/ImportKeysButton';

import AppIcon from '../../../components/icons/AppIcon';

export default function ApiKeys() {
  const { keysByProvider, providers, loading, error, save, remove, test, refresh } =
    useUserApiKeys();
  const [dialogProvider, setDialogProvider] = useState(null);

  const totals = useMemo(() => {
    const map = {};
    for (const cat of CATEGORIES) {
      const items = PROVIDERS_BY_CATEGORY[cat.id] || [];
      const set = items.filter((p) => keysByProvider[`${p.id}:default`]).length;
      map[cat.id] = { set, total: items.length };
    }
    return map;
  }, [keysByProvider]);

  return (
    <PageLayout
      title="API Keys"
      subtitle="Provide your own provider keys - they're used first, with platform defaults as fallback. Encrypted at rest."
      action={<ImportKeysButton onImported={refresh} />}
    >
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <AppIcon name="LockOutlined" fallback={LockOutlinedIcon} color="primary" />
        <Stack>
          <Typography variant="body2" fontWeight={600}>
            Envelope-encrypted storage
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Keys are AES-256-GCM encrypted with a per-row data key before they reach the database.
            Plaintext is never returned to this page after you save.
          </Typography>
        </Stack>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        CATEGORIES.map((cat) => {
          const items = PROVIDERS_BY_CATEGORY[cat.id] || [];
          if (items.length === 0) return null;
          return (
            <KeyCategorySection
              key={cat.id}
              category={cat}
              countSet={totals[cat.id].set}
              countTotal={totals[cat.id].total}
              defaultExpanded={cat.id === 'llm'}
            >
              {items.map((provider) => {
                const keyRow = keysByProvider[`${provider.id}:default`];
                const platformFallback = providers[provider.id]?.platformFallbackAvailable;
                return (
                  <KeyRow
                    key={provider.id}
                    provider={provider}
                    keyRow={keyRow}
                    platformFallback={platformFallback}
                    onReplace={() => setDialogProvider(provider)}
                    onClear={keyRow ? () => remove(keyRow.id) : undefined}
                  />
                );
              })}
            </KeyCategorySection>
          );
        })
      )}
      <KeyDialog
        open={!!dialogProvider}
        provider={dialogProvider}
        onClose={() => setDialogProvider(null)}
        onSave={save}
        onTest={test}
      />
    </PageLayout>
  );
}
