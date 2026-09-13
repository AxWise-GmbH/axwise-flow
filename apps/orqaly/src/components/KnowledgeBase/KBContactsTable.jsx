import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Chip,
  Avatar,
  useTheme,
  alpha,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LocalPhoneOutlinedIcon from '@mui/icons-material/LocalPhoneOutlined';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import MoodOutlinedIcon from '@mui/icons-material/MoodOutlined';
import SentimentNeutralOutlinedIcon from '@mui/icons-material/SentimentNeutralOutlined';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import LinkIcon from '@mui/icons-material/Link';

import AppIcon from '../icons/AppIcon';

const ATTITUDE_META = {
  vip: { label: 'VIP', color: '#D97706', bg: '#FEF3C7', icon: StarBorderOutlinedIcon },
  friendly: { label: 'Friendly', color: '#059669', bg: '#D1FAE5', icon: MoodOutlinedIcon },
  neutral: {
    label: 'Neutral',
    color: '#4B5563',
    bg: '#F3F4F6',
    icon: SentimentNeutralOutlinedIcon,
  },
  cold_lead: { label: 'Cold Lead', color: '#2563EB', bg: '#DBEAFE', icon: AcUnitOutlinedIcon },
  hostile: { label: 'Hostile', color: '#DC2626', bg: '#FEE2E2', icon: ReportProblemOutlinedIcon },
};

export default function KBContactsTable({ contacts = [], onEdit, onDelete }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [orderBy, setOrderBy] = useState('name');
  const [orderDir, setOrderDir] = useState('asc');

  const handleSort = (property) => {
    const isAsc = orderBy === property && orderDir === 'asc';
    setOrderDir(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedContacts = [...contacts].sort((a, b) => {
    const aVal = a[orderBy] || '';
    const bVal = b[orderBy] || '';
    if (orderDir === 'asc') {
      return aVal.localeCompare(bVal);
    } else {
      return bVal.localeCompare(aVal);
    }
  });

  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const handleHistoryClick = (contact) => {
    if (contact.goal_id) {
      navigate(`/communicator?view=workspace&section=rooms&goal=${contact.goal_id}`);
    } else {
      // If no thread exists, redirect to communicator rooms generally or prompt
      navigate(`/communicator?view=workspace&section=rooms`);
    }
  };

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, overflow: 'hidden' }}
    >
      <Table sx={{ minWidth: 650 }} size="medium">
        <TableHead sx={{ bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
          <TableRow>
            <TableCell>
              <TableSortLabel
                active={orderBy === 'name'}
                direction={orderBy === 'name' ? orderDir : 'asc'}
                onClick={() => handleSort('name')}
                sx={{ fontWeight: 600 }}
              >
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Contact Info</TableCell>
            <TableCell>
              <TableSortLabel
                active={orderBy === 'attitude'}
                direction={orderBy === 'attitude' ? orderDir : 'asc'}
                onClick={() => handleSort('attitude')}
                sx={{ fontWeight: 600 }}
              >
                Attitude
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Comment</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Match</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>
              History
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, pr: 3 }}>
              Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedContacts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                No contacts found. Click the "Add" button or "Import" to populate contacts.
              </TableCell>
            </TableRow>
          ) : (
            sortedContacts.map((contact) => {
              const meta = ATTITUDE_META[contact.attitude] || ATTITUDE_META.neutral;
              const AttitudeIcon = meta.icon;

              return (
                <TableRow key={contact.id} hover sx={{ '&:last-child cell': { border: 0 } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        sx={{
                          width: 36,
                          height: 36,
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          bgcolor: alpha(theme.palette.primary.main, 0.1),
                          color: 'primary.main',
                          border: '1px solid',
                          borderColor: alpha(theme.palette.primary.main, 0.2),
                        }}
                      >
                        {getInitials(contact.name)}
                      </Avatar>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {contact.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {contact.email && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            color: 'text.secondary',
                          }}
                        >
                          <AppIcon
                            name="EmailOutlined"
                            fallback={EmailOutlinedIcon}
                            sx={{ fontSize: 14 }}
                          />
                          <Typography variant="caption">{contact.email}</Typography>
                        </Box>
                      )}
                      {contact.phone && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            color: 'text.secondary',
                          }}
                        >
                          <AppIcon
                            name="LocalPhoneOutlined"
                            fallback={LocalPhoneOutlinedIcon}
                            sx={{ fontSize: 14 }}
                          />
                          <Typography variant="caption">{contact.phone}</Typography>
                        </Box>
                      )}
                      {!contact.email && !contact.phone && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.disabled', fontStyle: 'italic' }}
                        >
                          No email/phone
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={meta.label}
                      icon={
                        <AppIcon
                          fallback={AttitudeIcon}
                          sx={{ '&&': { color: meta.color, fontSize: 15 } }}
                        />
                      }
                      size="small"
                      sx={{
                        bgcolor: meta.bg,
                        color: meta.color,
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: alpha(meta.color, 0.2),
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Tooltip
                      title={contact.comment || ''}
                      arrow
                      disableHoverListener={!contact.comment}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {contact.comment || '—'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 180 }}>
                    {contact.metadata?.matches && contact.metadata.matches.length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {contact.metadata.matches.map((m) => (
                          <Tooltip
                            key={m.id}
                            title={`Matches in ${m.contact_type === 'mail' ? 'Mail' : 'Phone'} Contacts on: ${m.match_by.join(', ')}`}
                            arrow
                          >
                            <Chip
                              label={m.name}
                              size="small"
                              icon={
                                <AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: 13 }} />
                              }
                              sx={{
                                fontSize: '0.7rem',
                                height: 20,
                                bgcolor: alpha(theme.palette.success.main, 0.08),
                                color: 'success.main',
                                border: '1px solid',
                                borderColor: alpha(theme.palette.success.main, 0.15),
                                cursor: 'help',
                              }}
                            />
                          </Tooltip>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip
                      title={
                        contact.goal_id
                          ? 'Go to active goal conversation room'
                          : 'Open communicator workspace'
                      }
                      arrow
                    >
                      <IconButton
                        size="small"
                        onClick={() => handleHistoryClick(contact)}
                        sx={{
                          color: contact.goal_id ? 'primary.main' : 'text.secondary',
                          bgcolor: contact.goal_id
                            ? alpha(theme.palette.primary.main, 0.08)
                            : 'transparent',
                          '&:hover': {
                            bgcolor: contact.goal_id
                              ? alpha(theme.palette.primary.main, 0.16)
                              : alpha(theme.palette.text.primary, 0.04),
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        <AppIcon
                          name="ForumOutlined"
                          fallback={ForumOutlinedIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        onClick={() => onEdit(contact)}
                        sx={{ color: 'text.secondary' }}
                      >
                        <AppIcon
                          name="EditOutlined"
                          fallback={EditOutlinedIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => onDelete(contact)}
                        sx={{ color: 'error.main' }}
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
