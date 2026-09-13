import { useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Button,
  Snackbar,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import NavigationOutlinedIcon from '@mui/icons-material/NavigationOutlined';
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import MarketplaceToolbar from './MarketplaceToolbar';
import useMarketplaceSearch from '../../hooks/useMarketplaceSearch';
import usePagination from '../../hooks/usePagination';
import { BUSINESS_MODULES, BUSINESS_MODULE_ICON_MAP } from '../../config/businessModules';
import AppIcon from '../icons/AppIcon';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { useActiveBusinessModules } from '../../hooks/useActiveBusinessModules';

const CATEGORIES = [
  { value: 'operations', label: 'Operations', color: '#0EA5E9' },
  { value: 'gaming', label: 'Gaming', color: '#E53935' },
  { value: 'commerce', label: 'Commerce', color: '#2563EB' },
  { value: 'crypto', label: 'Crypto', color: '#F59E0B' },
  { value: 'marketing', label: 'Marketing', color: '#7C3AED' },
];

const SORT_OPTIONS = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'status', label: 'Status' },
];

const STATUS_CONFIG = {
  active: { label: 'Active', color: '#22c55e' },
  available: { label: 'Available', color: '#3b82f6' },
  coming_soon: { label: 'Coming Soon', color: '#6b7280' },
};

export default function MarketplaceBusinessesTab() {
  const theme = useTheme();
  const { isModuleActive, toggleModule } = useActiveBusinessModules();
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const {
    filteredItems,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
    resultCount,
  } = useMarketplaceSearch(BUSINESS_MODULES, ['name', 'description', 'category'], 'category');

  const pagination = usePagination(filteredItems, {
    surfaceId: 'marketplace.businesses',
    defaultRowsPerPage: 12,
    resetOn: [searchQuery, categoryFilter, sortBy],
  });

  const handleToggle = (mod) => {
    const wasActive = isModuleActive(mod.id);
    toggleModule(mod.id);
    setToast({
      open: true,
      message: wasActive
        ? `${mod.name} deactivated — business pages removed from sidebar`
        : `${mod.name} activated — business pages added to sidebar`,
      severity: wasActive ? 'info' : 'success',
    });
  };

  return (
    <Box>
      <MarketplaceToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={CATEGORIES}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOptions={SORT_OPTIONS}
        placeholder="Search business modules..."
        resultCount={resultCount}
        totalCount={BUSINESS_MODULES.length}
      />
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={BusinessCenterOutlinedIcon}
          title="No modules found"
          description="Adjust your filters to see available business modules."
        />
      ) : (
        <>
          <Grid container spacing={2}>
            {pagination.paginatedData.map((mod, idx) => {
              const active = mod.status === 'available' && isModuleActive(mod.id);
              const comingSoon = mod.status === 'coming_soon';
              const statusKey = active ? 'active' : mod.status;
              const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.available;
              const IconComp = BUSINESS_MODULE_ICON_MAP[mod.iconName];

              return (
                <Grid key={mod.id} size={{ xs: 12, sm: 6, md: 6, lg: 4 }}>
                  <Paper
                    elevation={0}
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: active ? alpha(mod.color, 0.35) : alpha(mod.color, 0.18),
                      overflow: 'hidden',
                      opacity: comingSoon ? 0.7 : 1,
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: comingSoon ? 'none' : 'translateY(-2px)',
                        boxShadow: comingSoon ? 'none' : createHoverGlowShadow(theme),
                      },
                      animation: theme.animations?.fadeInUp,
                      animationDelay: `${Math.min(idx * 50, 400)}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    {/* Icon strip */}
                    <Box
                      sx={{
                        height: 56,
                        bgcolor: alpha(mod.color, 0.06),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1.5,
                        px: 2,
                        borderBottom: active ? `2px solid ${alpha(mod.color, 0.4)}` : 'none',
                      }}
                    >
                      {IconComp && (
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 2,
                            bgcolor: alpha(mod.color, 0.14),
                            color: mod.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <AppIcon name={mod.iconName} fallback={IconComp} size={20} />
                        </Box>
                      )}
                      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: mod.color }}>
                        {mod.name}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      <Chip
                        label={statusCfg.label}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          bgcolor: alpha(statusCfg.color, 0.14),
                          color: statusCfg.color,
                          border: '1px solid',
                          borderColor: alpha(statusCfg.color, 0.3),
                        }}
                      />
                    </Box>

                    {/* Body */}
                    <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                        <Chip
                          label={mod.category}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            bgcolor: alpha(mod.color, 0.1),
                            color: mod.color,
                            textTransform: 'capitalize',
                          }}
                        />
                      </Box>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 1.5,
                          flex: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          fontSize: '0.82rem',
                        }}
                      >
                        {mod.description}
                      </Typography>

                      {/* Nav items preview */}
                      {mod.navItems.length > 0 && (
                        <Box sx={{ mb: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                            <AppIcon
                              name="NavigationOutlined"
                              fallback={NavigationOutlinedIcon}
                              sx={{ fontSize: 12, color: 'text.disabled' }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                color: 'text.disabled',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}
                            >
                              Included Pages
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {mod.navItems.map((ni) => (
                              <Chip
                                key={ni.path}
                                label={ni.label}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}

                      {/* Action */}
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 'auto' }}>
                        {comingSoon ? (
                          <Button
                            size="small"
                            disabled
                            sx={{ fontSize: '0.72rem', textTransform: 'none', borderRadius: 2 }}
                          >
                            Coming Soon
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant={active ? 'outlined' : 'contained'}
                            startIcon={
                              <AppIcon
                                name="PowerSettingsNew"
                                fallback={PowerSettingsNewIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            onClick={() => handleToggle(mod)}
                            sx={{
                              fontSize: '0.72rem',
                              textTransform: 'none',
                              px: 2,
                              borderRadius: 2,
                              fontWeight: 600,
                              ...(active && {
                                borderColor: alpha(mod.color, 0.4),
                                color: mod.color,
                                '&:hover': {
                                  borderColor: mod.color,
                                  bgcolor: alpha(mod.color, 0.06),
                                },
                              }),
                            }}
                          >
                            {active ? 'Deactivate' : 'Activate'}
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
          <Pagination
            count={pagination.totalCount}
            page={pagination.page}
            rowsPerPage={pagination.rowsPerPage}
            rowsPerPageOptions={pagination.rowsPerPageOptions}
            onPageChange={pagination.setPage}
            onRowsPerPageChange={pagination.setRowsPerPage}
            onLoadAll={pagination.loadAll}
            onCollapseAll={pagination.collapseAll}
            allMode={pagination.allMode}
            label="businesses"
            dense
          />
        </>
      )}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          variant="filled"
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
