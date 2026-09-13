import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Paper,
  Divider,
  Button,
  alpha,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LinkIcon from '@mui/icons-material/Link';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import { KYB_STATUS_MAP } from './orgDrawerUtils';

import AppIcon from '../../icons/AppIcon';

export default function OrgGovernanceTab({
  org,
  parentOrg,
  consiliumBoard,
  childOrgs,
  getTypeColor,
  getTypeLabel,
  concilium = [],
  onAttachConsilium,
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleAttach = async (value) => {
    if (!onAttachConsilium) return;
    setSaving(true);
    try {
      await onAttachConsilium(value || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Governance hierarchy */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Structure
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
        {parentOrg && (
          <Paper
            elevation={0}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <AppIcon
              name="AccountTreeOutlined"
              fallback={AccountTreeOutlinedIcon}
              sx={{ fontSize: 18, color: 'text.secondary' }}
            />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Parent organization
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {parentOrg.name}
              </Typography>
            </Box>
          </Paper>
        )}
        {consiliumBoard && (
          <Paper
            elevation={0}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: 18, color: '#8B5CF6' }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Consilium board
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {consiliumBoard.name}
                </Typography>
              </Box>
            </Box>
            <Button
              size="small"
              onClick={() => navigate('/consilium')}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem' }}
            >
              Open
            </Button>
          </Paper>
        )}
        {childOrgs.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}
            >
              Subsidiaries ({childOrgs.length})
            </Typography>
            {childOrgs.map((child) => (
              <Paper
                key={child.id}
                elevation={0}
                sx={{
                  p: 1,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  mb: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <AppIcon
                  name="CorporateFareOutlined"
                  fallback={CorporateFareOutlinedIcon}
                  sx={{ fontSize: 16, color: getTypeColor(child.org_type) }}
                />
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                  {child.name}
                </Typography>
                <Chip
                  label={getTypeLabel(child.org_type)}
                  size="small"
                  sx={{ height: 16, fontSize: '0.55rem', ml: 'auto' }}
                />
              </Paper>
            ))}
          </Box>
        )}
        {!parentOrg && !consiliumBoard && childOrgs.length === 0 && !onAttachConsilium && (
          <Typography variant="body2" color="text.secondary">
            No governance hierarchy linked
          </Typography>
        )}
      </Box>
      {/* Attach / change the org's Consilium board */}
      {onAttachConsilium && (
        <Box sx={{ mb: 2 }}>
          <FormControl fullWidth size="small" disabled={saving}>
            <InputLabel id="org-consilium-select">Consilium board</InputLabel>
            <Select
              labelId="org-consilium-select"
              label="Consilium board"
              value={org.consilium_id || ''}
              onChange={(e) => handleAttach(e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              {(concilium || []).map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name || c.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Links this organization to a Consilium board (shown in Home → Consilium Activity).
          </Typography>
        </Box>
      )}
      <Divider sx={{ my: 2 }} />
      {/* KYB */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        KYB
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <Chip
          label={org.kyb_level === 'full' ? 'Full KYB' : 'Basic KYB'}
          size="small"
          sx={{
            fontWeight: 700,
            bgcolor: alpha(org.kyb_level === 'full' ? '#8B5CF6' : '#888', 0.12),
            color: org.kyb_level === 'full' ? '#8B5CF6' : '#888',
          }}
        />
        {org.kyb_status && KYB_STATUS_MAP[org.kyb_status] && (
          <Chip
            label={KYB_STATUS_MAP[org.kyb_status].label}
            size="small"
            sx={{
              fontWeight: 700,
              bgcolor: alpha(KYB_STATUS_MAP[org.kyb_status].color, 0.12),
              color: KYB_STATUS_MAP[org.kyb_status].color,
            }}
          />
        )}
      </Box>
      {[
        { label: 'Legal Name', value: org.legal_name },
        { label: 'Registration #', value: org.registration_number },
        { label: 'Country', value: org.country },
        { label: 'Legal Form', value: org.legal_form },
        { label: 'Contact Email', value: org.contact_email },
        { label: 'Contact Phone', value: org.contact_phone },
        { label: 'Tax ID', value: org.tax_id },
        { label: 'Incorporation Date', value: org.incorporation_date },
      ]
        .filter((f) => f.value)
        .map((field) => (
          <Box
            key={field.label}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              py: 0.75,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {field.label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {field.value}
            </Typography>
          </Box>
        ))}
      {org.registered_address && Object.values(org.registered_address).some(Boolean) && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Registered Address
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {[
              org.registered_address.street,
              org.registered_address.city,
              org.registered_address.state,
              org.registered_address.zip,
              org.registered_address.country,
            ]
              .filter(Boolean)
              .join(', ')}
          </Typography>
        </Box>
      )}
      {(org.directors || []).length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Directors ({org.directors.length})
          </Typography>
          {org.directors.map((d, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {d.name}
              </Typography>
              {d.role && (
                <Chip label={d.role} size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
              )}
              {d.nationality && (
                <Typography variant="caption" color="text.secondary">
                  {d.nationality}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
      {(org.ubos || []).length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Beneficial Owners ({org.ubos.length})
          </Typography>
          {org.ubos.map((u, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {u.name}
              </Typography>
              {u.ownership_pct && (
                <Chip
                  label={`${u.ownership_pct}%`}
                  size="small"
                  sx={{ height: 18, fontSize: '0.6rem' }}
                />
              )}
            </Box>
          ))}
        </Box>
      )}
      {org.kyb_notes && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Notes
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {org.kyb_notes}
          </Typography>
        </Box>
      )}
      {!org.legal_name && !org.registration_number && !org.tax_id && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <AppIcon
            name="DescriptionOutlined"
            fallback={DescriptionOutlinedIcon}
            sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }}
          />
          <Typography variant="body2" color="text.secondary">
            No KYB details provided yet
          </Typography>
        </Box>
      )}
    </>
  );
}
