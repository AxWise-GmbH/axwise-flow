/**
 * SkillInstallerDialog — Add new skills to a specific agent from the skill library.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  TextField,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Box,
  Typography,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import { listSkills, installSkill } from '../../services/agentSkillsService';
import { SKILL_CATEGORIES } from '../../config/bundledSkills';

import AppIcon from '../icons/AppIcon';

const ICON_MAP = {
  psychology: PsychologyOutlinedIcon,
  code: CodeOutlinedIcon,
  business: BusinessOutlinedIcon,
  article: ArticleOutlinedIcon,
  analytics: AnalyticsOutlinedIcon,
  settings: SettingsOutlinedIcon,
  lightbulb: LightbulbOutlinedIcon,
  extension: ExtensionOutlinedIcon,
};

function SkillIcon({ icon, sx }) {
  const Icon = ICON_MAP[icon] || ExtensionOutlinedIcon;
  return <AppIcon fallback={Icon} sx={sx} />;
}

function getCategoryColor(categoryValue) {
  const cat = SKILL_CATEGORIES.find((c) => c.value === categoryValue);
  return cat?.color || '#888';
}

export default function SkillInstallerDialog({
  open,
  onClose,
  agentId,
  agentName,
  installedSkillIds = [],
  onInstalled,
}) {
  const theme = useTheme();

  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [installingIds, setInstallingIds] = useState(new Set());
  const [justInstalled, setJustInstalled] = useState([]);
  const hasChanges = useRef(false);

  const installedSet = new Set([...installedSkillIds, ...justInstalled]);

  const fetchAvailableSkills = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const params = {};
      if (categoryFilter) params.category = categoryFilter;
      if (search) params.search = search;
      const data = await listSkills(params);
      setSkills(Array.isArray(data) ? data : []);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [open, categoryFilter, search]);

  useEffect(() => {
    fetchAvailableSkills();
  }, [fetchAvailableSkills]);

  useEffect(() => {
    if (open) {
      setJustInstalled([]);
      setInstallingIds(new Set());
      setSearch('');
      setCategoryFilter('');
      hasChanges.current = false;
    }
  }, [open]);

  // Notify parent once when dialog closes (not per-skill)
  const handleClose = () => {
    if (hasChanges.current && onInstalled) onInstalled();
    onClose();
  };

  const handleInstall = async (skillId) => {
    // Mark as installing
    setInstallingIds((prev) => new Set([...prev, skillId]));
    try {
      await installSkill(agentId, skillId);
      setJustInstalled((prev) => [...prev, skillId]);
      hasChanges.current = true;
    } catch (err) {
      console.warn('[SkillInstaller] install failed:', err.message);
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={`Add Skills${agentName ? ` to ${agentName}` : ''}`}
      icon={ExtensionOutlinedIcon}
      contentSx={{ p: 0, pt: 0, px: 0, pb: 0 }}
      hideCancel
      primaryLabel="Done"
      onPrimary={handleClose}
    >
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1, p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          size="small"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon name="Search" fallback={SearchIcon} fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ flex: 1, ...FORM_FIELD_SX }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={categoryFilter}
            label="Category"
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {SKILL_CATEGORIES.map((cat) => (
              <MenuItem key={cat.value} value={cat.value}>
                {cat.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {/* Skill list */}
      {!loading && skills.length > 0 && (
        <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
          {skills.map((skill) => {
            const isInstalled = installedSet.has(skill.id);
            const isInstalling = installingIds.has(skill.id);
            return (
              <ListItem
                key={skill.id}
                secondaryAction={
                  isInstalling ? (
                    <CircularProgress size={20} sx={{ mr: 1.5 }} />
                  ) : isInstalled ? (
                    <AppIcon
                      name="CheckCircleOutline"
                      fallback={CheckCircleOutlineIcon}
                      sx={{ color: 'success.main', fontSize: 24, mr: 1 }}
                    />
                  ) : (
                    <IconButton
                      edge="end"
                      onClick={() => handleInstall(skill.id)}
                      sx={{ color: getCategoryColor(skill.category) }}
                    >
                      <AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />
                    </IconButton>
                  )
                }
                sx={{
                  '&:hover': { bgcolor: alpha(getCategoryColor(skill.category), 0.04) },
                  opacity: isInstalled && !isInstalling ? 0.6 : 1,
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <SkillIcon
                    icon={skill.icon}
                    sx={{ color: getCategoryColor(skill.category), fontSize: 22 }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {skill.name}
                      </Typography>
                      <Chip
                        label={skill.category}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          bgcolor: alpha(getCategoryColor(skill.category), 0.1),
                          color: getCategoryColor(skill.category),
                        }}
                      />
                      {isInstalled && (
                        <Chip
                          label="Added"
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            bgcolor: alpha(theme.palette.success.main, 0.12),
                            color: 'success.main',
                          }}
                        />
                      )}
                    </Box>
                  }
                  secondary={skill.description}
                  secondaryTypographyProps={{ noWrap: true, sx: { maxWidth: '90%' } }}
                />
              </ListItem>
            );
          })}
        </List>
      )}
      {/* Empty state */}
      {!loading && skills.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <AppIcon
            name="ExtensionOutlined"
            fallback={ExtensionOutlinedIcon}
            sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }}
          />
          <Typography color="text.secondary">No skills found.</Typography>
        </Box>
      )}
      {/* Just-installed feedback */}
      {justInstalled.length > 0 && (
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: alpha(theme.palette.success.main, 0.06),
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="success.main" fontWeight={600}>
            {justInstalled.length} skill(s) added this session
          </Typography>
        </Box>
      )}
    </FormDialog>
  );
}
