/**
 * Deal detail page - full deal view with VC document management.
 * Route: /investments/deal/:id  (protected, requires login)
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Grid,
  Paper,
  Button,
  LinearProgress,
  CircularProgress,
  Divider,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Alert,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
} from '@mui/material';
import FormDialog from '../../components/Common/FormDialog';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import {
  getDeal,
  listDocuments,
  getUploadUrl,
  getDownloadUrl,
  deleteDocument,
} from '../../services/investmentService';

import AppIcon from '../../components/icons/AppIcon';

const RISK_COLORS = { low: '#059669', medium: '#D97706', high: '#DC2626', critical: '#7C3AED' };
const STATUS_COLORS = {
  draft: '#888',
  pending_review: '#D97706',
  seeking_funding: '#2563EB',
  funded: '#059669',
  active: '#10B981',
  distributing_returns: '#7C3AED',
  completed: '#059669',
  failed: '#DC2626',
  cancelled: '#888',
};

const DOC_CATEGORIES = [
  { value: 'pitch_deck', label: 'Pitch Deck' },
  { value: 'business_plan', label: 'Business Plan' },
  { value: 'financial_model', label: 'Financial Model' },
  { value: 'term_sheet', label: 'Term Sheet' },
  { value: 'executive_summary', label: 'Executive Summary' },
  { value: 'due_diligence', label: 'Due Diligence' },
  { value: 'other', label: 'Other' },
];

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [deal, setDeal] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docTab, setDocTab] = useState('all');
  const [councilExpanded, setCouncilExpanded] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  const loadDeal = async () => {
    try {
      const [d, docs] = await Promise.all([getDeal(id), listDocuments(id)]);
      setDeal(d);
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (err) {
      showToast(err.message || 'Failed to load deal', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeal();
  }, [id]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { upload_url } = await getUploadUrl(
        id,
        file.name,
        uploadCategory,
        file.type,
        file.size
      );
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!uploadRes.ok) throw new Error('Upload to storage failed');
      showToast('Document uploaded successfully');
      setUploadDialog(false);
      await loadDeal();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (docId, docName) => {
    try {
      const { url } = await getDownloadUrl(docId);
      const a = document.createElement('a');
      a.href = url;
      a.download = docName;
      a.click();
    } catch {
      showToast('Download failed', 'error');
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      showToast('Document deleted');
    } catch {
      showToast('Delete failed', 'error');
    }
  };

  const filteredDocs =
    docTab === 'all' ? documents : documents.filter((d) => d.category === docTab);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!deal) {
    return (
      <Box sx={{ textAlign: 'center', mt: 10 }}>
        <Typography variant="h5" color="error">
          Deal not found
        </Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/investments')}>
          Back to Investments
        </Button>
      </Box>
    );
  }

  const fundingPct = Number(deal.funding_pct || 0);
  const councilSummary = deal.strategy_plan?.council_summary;
  const councilResponses = deal.strategy_plan?.council_responses;

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Button
        startIcon={<AppIcon name="ArrowBack" fallback={ArrowBackIcon} />}
        onClick={() => navigate('/investments')}
        sx={{ mb: 2 }}
      >
        Back to Investments
      </Button>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Chip
            label={deal.status?.replace(/_/g, ' ')}
            size="small"
            sx={{
              bgcolor: `${STATUS_COLORS[deal.status] || '#888'}22`,
              color: STATUS_COLORS[deal.status] || '#888',
              fontWeight: 600,
            }}
          />
          {deal.risk_level && (
            <Chip
              label={`${deal.risk_level} risk`}
              size="small"
              sx={{
                bgcolor: `${RISK_COLORS[deal.risk_level]}22`,
                color: RISK_COLORS[deal.risk_level],
              }}
            />
          )}
          {deal.industry && <Chip label={deal.industry} size="small" variant="outlined" />}
        </Box>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
          {deal.title}
        </Typography>
        <Typography color="text.secondary">{deal.description}</Typography>
        {deal.deadline && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Deadline: {new Date(deal.deadline).toLocaleDateString()}
          </Typography>
        )}
      </Paper>
      {/* Funding Progress */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Funding Progress
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h4" fontWeight={700} sx={{ color: '#059669' }}>
            ${Number(deal.current_funded || 0).toLocaleString()}
          </Typography>
          <Typography variant="h5" color="text.secondary">
            / ${Number(deal.required_amount || 0).toLocaleString()}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, fundingPct)}
          sx={{
            height: 10,
            borderRadius: 5,
            mb: 1,
            bgcolor: '#e0e0e0',
            '& .MuiLinearProgress-bar': { bgcolor: fundingPct >= 100 ? '#059669' : '#2563EB' },
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            {fundingPct.toFixed(1)}% funded
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {deal.commitments?.length || 0} investors
          </Typography>
        </Box>
        {deal.roi_projections?.expected && (
          <Chip
            label={`${deal.roi_projections.expected}% expected ROI`}
            sx={{ mt: 1, color: '#059669', borderColor: '#059669' }}
            variant="outlined"
            size="small"
          />
        )}
        {deal.revenue_share_terms?.share_pct && (
          <Chip
            label={`${deal.revenue_share_terms.share_pct}% revenue share`}
            sx={{ mt: 1, ml: 1 }}
            variant="outlined"
            size="small"
          />
        )}
      </Paper>
      {/* Council Summary (if AI-generated) */}
      {(councilSummary || councilResponses) && (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2, border: '1px solid #7C3AED44' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setCouncilExpanded((p) => !p)}
          >
            <Typography variant="h6" fontWeight={600} sx={{ color: '#7C3AED' }}>
              AI Council Summary
            </Typography>
            <IconButton size="small">
              {councilExpanded ? (
                <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
              ) : (
                <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
              )}
            </IconButton>
          </Box>
          {councilSummary && (
            <Typography sx={{ mt: 1, color: 'text.secondary' }}>{councilSummary}</Typography>
          )}
          {councilExpanded && councilResponses && (
            <Box sx={{ mt: 2 }}>
              {councilResponses.map((r, i) => (
                <Box key={i} sx={{ mb: 1.5, pl: 2, borderLeft: '2px solid #7C3AED44' }}>
                  <Typography variant="caption" fontWeight={600} sx={{ color: '#7C3AED' }}>
                    {r.role} ({r.agent})
                  </Typography>
                  <Typography variant="body2">{r.opinion}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      )}
      {/* Documents Section */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Documents
          </Typography>
          <Button
            variant="contained"
            startIcon={<AppIcon name="UploadFile" fallback={UploadFileIcon} />}
            size="small"
            onClick={() => setUploadDialog(true)}
          >
            Upload
          </Button>
        </Box>

        <Tabs
          value={docTab}
          onChange={(_, v) => setDocTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
        >
          <Tab label={`All (${documents.length})`} value="all" />
          {DOC_CATEGORIES.map((c) => {
            const count = documents.filter((d) => d.category === c.value).length;
            return count > 0 ? (
              <Tab key={c.value} label={`${c.label} (${count})`} value={c.value} />
            ) : null;
          })}
        </Tabs>

        {filteredDocs.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            No documents in this category yet. Upload a file to get started.
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Uploaded</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDocs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell
                      sx={{
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {doc.name}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          DOC_CATEGORIES.find((c) => c.value === doc.category)?.label ||
                          doc.category
                        }
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : '-'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Download">
                        <IconButton size="small" onClick={() => handleDownload(doc.id, doc.name)}>
                          <AppIcon name="Download" fallback={DownloadIcon} fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteDoc(doc.id)}
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            fontSize="small"
                          />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      {/* Commitments */}
      {deal.commitments?.length > 0 && (
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Investors ({deal.commitments.length})
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Investor</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deal.commitments.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.investment_investors?.name || 'Anonymous'}</TableCell>
                    <TableCell>
                      <Chip label={c.commitment_type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">${Number(c.amount).toLocaleString()}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(c.committed_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
      <FormDialog
        open={uploadDialog}
        onClose={() => setUploadDialog(false)}
        title="Upload Document"
        icon={UploadFileIcon}
        maxWidth="xs"
        hideFooter
      >
        <FormControl fullWidth>
          <InputLabel>Category</InputLabel>
          <Select
            value={uploadCategory}
            label="Category"
            onChange={(e) => setUploadCategory(e.target.value)}
          >
            {DOC_CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          fullWidth
          sx={{ mt: 2 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <CircularProgress size={20} /> : 'Choose File'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFileUpload}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        />
      </FormDialog>
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((p) => ({ ...p, open: false }))}
      >
        <Alert severity={toast.severity} onClose={() => setToast((p) => ({ ...p, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
