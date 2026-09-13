import { useState, useEffect, useRef } from 'react';
import {
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Divider,
  Alert,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../../../components/Common/FormDialog';
import CloudUploadIcon from '@mui/icons-material/CloudUploadOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import CodeIcon from '@mui/icons-material/Code';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import AppIcon from '../../../components/icons/AppIcon';
export default function MaterialDialog({ open, onClose, partner, material, onSave }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('creatives');
  const [affiliateNetworks, setAffiliateNetworks] = useState([]);
  const [links, setLinks] = useState('');
  const [step, setStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setProcessing(false);
      setProcessedData(null);
      setIsDragging(false);

      if (material) {
        setName(material.name || '');
        setType(material.type || 'creatives');
        setAffiliateNetworks(
          material.affiliateNetworks ||
            (material.affiliateNetwork ? [material.affiliateNetwork] : [])
        );
        setLinks(Array.isArray(material.links) ? material.links.join('\n') : material.links || '');
        setFiles(material.files || []);
      } else {
        setName('');
        setType('creatives');
        setAffiliateNetworks([]);
        setLinks('');
        setFiles([]);
      }
    }
  }, [open, material]);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
      // Auto-set name from first file if empty
      if (!name && newFiles.length > 0) {
        setName(newFiles[0].name);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFiles((prev) => [...prev, ...newFiles]);
      if (!name && newFiles.length > 0) {
        setName(newFiles[0].name);
      }
    }
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    if (!name.trim()) return;

    if (type === 'landing' && step === 1) {
      setProcessing(true);
      setTimeout(() => {
        setProcessedData({
          files: ['index.html', 'thankyou.html', 'css/style.css', 'js/app.js', 'assets/logo.png'],
          postbacks: [
            { file: 'index.html', action: 'Injected click ID capture script' },
            { file: 'thankyou.html', action: 'Added conversion postback pixel' },
          ],
          analytics: [
            { file: 'index.html', action: 'Added GA4 Container (GTM-XXXX)' },
            { file: 'thankyou.html', action: 'Added Purchase Event trigger' },
          ],
        });
        setProcessing(false);
        setStep(2);
      }, 1500);
    } else {
      handleFinalSave();
    }
  };

  const handleFinalSave = () => {
    if (!name.trim()) return;

    const linksArray = links
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    onSave(partner.id, {
      ...(material || {}), // Keep existing ID and other fields if editing
      name: name.trim(),
      type,
      affiliateNetworks,
      links: linksArray,
      files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })), // Store file metadata
      ...(processedData ? { processingDetails: processedData } : {}),
    });
    onClose();
  };

  if (!partner) return null;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={step === 1 ? (material ? 'Edit Material' : 'Upload Material') : 'Review Modifications'}
      subtitle={`${partner.name}${step === 2 ? ' • Landing Page Processing' : ''}`}
      icon={CloudUploadIcon}
      actions={
        <>
          {step === 2 && (
            <Button onClick={() => setStep(1)} sx={{ color: 'text.secondary', mr: 'auto' }}>
              Back
            </Button>
          )}
          <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            onClick={step === 1 && type === 'landing' ? handleNext : handleFinalSave}
            variant="contained"
            size="small"
            disabled={!name.trim() || processing}
          >
            {step === 1 && type === 'landing' ? 'Next' : material ? 'Save Changes' : 'Upload'}
          </Button>
        </>
      }
    >
      {step === 1 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          {!material && (
            <Box
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              sx={{
                border: '2px dashed',
                borderColor: isDragging ? 'primary.main' : 'divider',
                bgcolor: isDragging ? 'action.hover' : 'transparent',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <input type="file" hidden multiple ref={fileInputRef} onChange={handleFileSelect} />
              <AppIcon
                name="CloudUploadOutlined"
                fallback={CloudUploadIcon}
                sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary">
                Click to browse or drag & drop files
              </Typography>
              <Typography variant="caption" color="text.secondary">
                (Supports multiple files)
              </Typography>
            </Box>
          )}

          {files.length > 0 && (
            <Paper variant="outlined" sx={{ maxHeight: 150, overflow: 'auto', bgcolor: '#F8FAFC' }}>
              <List dense disablePadding>
                {files.map((file, idx) => (
                  <ListItem
                    key={idx}
                    divider={idx < files.length - 1}
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={() => handleRemoveFile(idx)}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <AppIcon
                        name="Description"
                        fallback={DescriptionIcon}
                        fontSize="small"
                        color="action"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={file.name}
                      primaryTypographyProps={{ fontSize: '0.85rem', noWrap: true }}
                      secondary={file.size ? `${Math.round(file.size / 1024)} KB` : null}
                      secondaryTypographyProps={{ fontSize: '0.75rem' }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          <TextField
            label="File / Material Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            required
            placeholder="e.g., Creatives_Pack_Feb.zip"
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={type} label="Type" onChange={(e) => setType(e.target.value)}>
                <MenuItem value="creatives">Creatives</MenuItem>
                <MenuItem value="landing">Landing Page</MenuItem>
                <MenuItem value="templates">Templates</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>Affiliate Networks</InputLabel>
              <Select
                multiple
                value={affiliateNetworks}
                onChange={(e) => {
                  const { value } = e.target;
                  setAffiliateNetworks(typeof value === 'string' ? value.split(',') : value);
                }}
                input={<OutlinedInput label="Affiliate Networks" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value} size="small" />
                    ))}
                  </Box>
                )}
              >
                {['ClickDealer', 'Mobidea', 'MaxBounty', 'AdCombo'].map((net) => (
                  <MenuItem key={net} value={net}>
                    {net}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <TextField
            label="Links (one per line)"
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            placeholder="https://example.com/resource1&#10;https://example.com/resource2"
            size="small"
          />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Alert
            severity="success"
            icon={<AppIcon name="CheckCircle" fallback={CheckCircleIcon} fontSize="inherit" />}
          >
            Archive successfully unzipped. <strong>{processedData?.files.length} files</strong>{' '}
            extracted.
          </Alert>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Modifications Applied
            </Typography>
            <Paper variant="outlined" sx={{ bgcolor: '#F8FAFC' }}>
              <List dense disablePadding>
                {processedData?.postbacks.map((item, idx) => (
                  <ListItem key={`pb-${idx}`} divider={idx < processedData.postbacks.length - 1}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <AppIcon name="Code" fallback={CodeIcon} fontSize="small" color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.action}
                      secondary={`File: ${item.file}`}
                      primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 500 }}
                      secondaryTypographyProps={{ fontSize: '0.75rem' }}
                    />
                  </ListItem>
                ))}
                <Divider />
                {processedData?.analytics.map((item, idx) => (
                  <ListItem key={`an-${idx}`} divider={idx < processedData.analytics.length - 1}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <AppIcon
                        name="Analytics"
                        fallback={AnalyticsIcon}
                        fontSize="small"
                        color="secondary"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.action}
                      secondary={`File: ${item.file}`}
                      primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 500 }}
                      secondaryTypographyProps={{ fontSize: '0.75rem' }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Extracted Files
            </Typography>
            <Paper variant="outlined" sx={{ p: 1, maxHeight: 100, overflow: 'auto' }}>
              {processedData?.files.map((file, idx) => (
                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <AppIcon
                    name="Description"
                    fallback={DescriptionIcon}
                    fontSize="small"
                    color="action"
                    sx={{ fontSize: 16 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {file}
                  </Typography>
                </Box>
              ))}
            </Paper>
          </Box>
        </Box>
      )}
      {processing && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(255,255,255,0.9)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress size={40} />
          <Typography variant="body2" sx={{ mt: 2, fontWeight: 600, color: 'text.secondary' }}>
            Unarchiving & Applying Postbacks...
          </Typography>
        </Box>
      )}
    </FormDialog>
  );
}
