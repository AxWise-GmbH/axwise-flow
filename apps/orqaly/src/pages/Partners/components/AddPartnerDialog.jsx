import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stepper,
  Step,
  StepLabel,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Autocomplete,
  Checkbox,
  FormHelperText,
  Divider,
  Alert,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  alpha,
  Fade,
  Paper,
  Chip,
} from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import FormDialog from '../../../components/Common/FormDialog';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import {
  TRAFFIC_SOURCES,
  AGREEMENT_TYPES,
  FUNNEL_STATUSES,
  GROUP_TYPES,
  GROUP_SUBTYPES,
} from '../../../utils/constants';
import { COUNTRY_FLAGS } from '../../../utils/constants';
import {
  extractTextFromImages,
  structureExtractedText,
  suggestFormFromExtracted,
} from '../../../utils/screenshotExtractor';

import AppIcon from '../../../components/icons/AppIcon';

const steps = ['Profile', 'Group & Traffic', 'Contact & Agreement', 'Review'];

const initialForm = {
  name: '',
  notes: '',
  team: '',
  group: 'Webmaster',
  groupSubtype: 'Personal Traffic',
  trafficSources: ['FB'],
  geos: ['BR'],
  telegramNick: '',
  telegramGroup: '',
  agreement: 'Revshare',
  funnelStatus: 'Contacted',
  category: 'Gambling',
};

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp';

export default function AddPartnerDialog({ open, onClose, onSubmit, existingTeams = [] }) {
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [screenshots, setScreenshots] = useState([]);
  const [extracted, setExtracted] = useState(null); // { structured, categorized }
  const [extractStage, setExtractStage] = useState('idle'); // idle | reading | analyzing | structuring | done
  const [extractProgress, setExtractProgress] = useState(0);
  const [screenshotDragOver, setScreenshotDragOver] = useState(false);
  const screenshotInputRef = useRef(null);

  const addScreenshots = useCallback((files) => {
    if (!files?.length) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setScreenshots((prev) => {
      const next = [...prev];
      imageFiles.forEach((file) => {
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      });
      return next;
    });
  }, []);

  const removeScreenshot = useCallback((id) => {
    setScreenshots((prev) => {
      const item = prev.find((s) => s.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
    setExtracted(null);
    setExtractStage('idle');
  }, []);

  const handleExtract = useCallback(async () => {
    if (!screenshots.length) return;
    setExtractStage('reading');
    setExtractProgress(0);
    setExtracted(null);
    try {
      setExtractStage('reading');
      const text = await extractTextFromImages(
        screenshots.map((s) => s.file),
        (p) => setExtractProgress(p)
      );
      setExtractStage('analyzing');
      setExtractProgress(100);
      await new Promise((r) => setTimeout(r, 400));
      setExtractStage('structuring');
      await new Promise((r) => setTimeout(r, 300));
      const result = structureExtractedText(text);
      setExtracted(result);
      setExtractStage('done');
      // Auto-apply to form and go to Review so the user only verifies and submits
      const suggested = suggestFormFromExtracted(result);
      setForm((prev) => ({
        ...prev,
        ...(suggested.name?.trim() && { name: suggested.name.trim() }),
        ...(suggested.notes?.trim() && { notes: suggested.notes.trim() }),
        ...(suggested.team?.trim() && { team: suggested.team.trim() }),
        ...(suggested.group && { group: suggested.group }),
        ...(suggested.trafficSources?.length && { trafficSources: suggested.trafficSources }),
        ...(suggested.geos?.length && { geos: suggested.geos }),
        ...(suggested.telegramNick?.trim() && { telegramNick: suggested.telegramNick.trim() }),
        ...(suggested.telegramGroup?.trim() && { telegramGroup: suggested.telegramGroup.trim() }),
        ...(suggested.agreement && { agreement: suggested.agreement }),
        ...(suggested.funnelStatus && { funnelStatus: suggested.funnelStatus }),
      }));
      setActiveStep(steps.length - 1);
    } catch (err) {
      console.error('Screenshot extraction failed:', err);
      setExtracted({
        structured: {},
        categorized: {
          profileInfo: '',
          groupTraffic: '',
          contactsAndAgreements: '',
          review: err?.message || 'Extraction failed. Try clearer images.',
        },
      });
      setExtractStage('done');
    }
  }, [screenshots]);

  const updateField = (field, value) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      // Auto-update subtype when group changes
      if (field === 'group') {
        updated.groupSubtype = GROUP_SUBTYPES[value] || '';
      }
      return updated;
    });
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validateStep = () => {
    const newErrors = {};
    if (activeStep === 0) {
      if (!form.name.trim()) newErrors.name = 'Name is required';
    }
    if (activeStep === 1) {
      if (!form.team.trim()) newErrors.team = 'Team is required';
      if (!form.trafficSources.length)
        newErrors.trafficSources = 'Select at least one traffic source';
      if (!form.geos.length) newErrors.geos = 'Select at least one geo';
    }
    if (activeStep === 2) {
      if (!form.telegramNick.trim()) newErrors.telegramNick = 'Telegram nick is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep()) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => setActiveStep((prev) => prev - 1);

  const handleSubmit = () => {
    const normalizedPayload = {
      ...form,
      // Keep backward compatibility with existing table/service fields.
      trafficSource: form.trafficSources?.[0] || 'FB',
      geo: form.geos?.[0] || 'BR',
    };
    onSubmit(normalizedPayload);
    setForm(initialForm);
    setActiveStep(0);
    onClose();
  };

  const handleClose = () => {
    setForm(initialForm);
    setActiveStep(0);
    setErrors({});
    screenshots.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
    setScreenshots([]);
    setExtracted(null);
    setExtractStage('idle');
    onClose();
  };

  const countries = Object.keys(COUNTRY_FLAGS);
  const geoOptions = countries.map((code) => ({
    code,
    label: `${COUNTRY_FLAGS[code] || ''} ${code}`.trim(),
  }));
  const emptyCheckIcon = (
    <AppIcon
      name="CheckBoxOutlineBlankRounded"
      fallback={CheckBoxOutlineBlankRoundedIcon}
      fontSize="small"
    />
  );
  const filledCheckIcon = (
    <AppIcon name="CheckBoxRounded" fallback={CheckBoxRoundedIcon} fontSize="small" />
  );

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Add New Partner"
      icon={PersonAddOutlinedIcon}
      maxWidth="sm"
      contentDividers={false}
      contentSx={{ px: 3, py: 0, minHeight: 280 }}
      actions={
        <>
          <Button onClick={handleClose} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Box sx={{ flex: 1 }} />
          {activeStep > 0 && (
            <Button onClick={handleBack} variant="outlined" size="small">
              Back
            </Button>
          )}
          {activeStep === 0 && screenshots.length > 0 ? (
            <Button
              onClick={handleExtract}
              variant="contained"
              size="small"
              disabled={
                extractStage === 'reading' ||
                extractStage === 'analyzing' ||
                extractStage === 'structuring'
              }
              startIcon={<AppIcon name="Image" fallback={ImageIcon} />}
            >
              {extractStage === 'reading' ||
              extractStage === 'analyzing' ||
              extractStage === 'structuring'
                ? 'Extracting…'
                : 'Extract data'}
            </Button>
          ) : activeStep < steps.length - 1 ? (
            <Button onClick={handleNext} variant="contained" size="small">
              Next
            </Button>
          ) : (
            <Button onClick={handleSubmit} variant="contained" color="primary" size="small">
              Submit
            </Button>
          )}
        </>
      }
    >
      <Box sx={{ py: 2 }}>
        <Stepper
          activeStep={activeStep}
          alternativeLabel
          sx={{ '& .MuiStepLabel-label': { fontSize: '0.8rem', fontWeight: 600 } }}
        >
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>
      <Box sx={{ minHeight: 280 }}>
        {/* Import from screenshots - always visible */}
        <Paper
          variant="outlined"
          sx={{
            mb: 2.5,
            borderRadius: 2,
            overflow: 'hidden',
            borderColor: 'divider',
            bgcolor: (t) => alpha(t.palette.primary.main, 0.02),
          }}
        >
          <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: 'text.primary',
              }}
            >
              <AppIcon
                name="Image"
                fallback={ImageIcon}
                sx={{ fontSize: 20, color: 'primary.main' }}
              />
              Import from screenshots
              {screenshots.length > 0 && (
                <Chip
                  label={`${screenshots.length} file${screenshots.length !== 1 ? 's' : ''}`}
                  size="small"
                  sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
                />
              )}
            </Typography>
          </Box>
          <Box
            onDragOver={(e) => {
              e.preventDefault();
              setScreenshotDragOver(true);
            }}
            onDragLeave={() => setScreenshotDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setScreenshotDragOver(false);
              addScreenshots(e.dataTransfer.files);
            }}
            onClick={() => screenshotInputRef.current?.click()}
            sx={{
              mx: 2,
              mb: 2,
              py: 3,
              px: 2,
              border: '2px dashed',
              borderColor: screenshotDragOver ? 'primary.main' : 'divider',
              borderRadius: 2,
              textAlign: 'center',
              bgcolor: screenshotDragOver
                ? (t) => alpha(t.palette.primary.main, 0.06)
                : (t) => alpha(t.palette.grey[500], 0.06),
              cursor: 'pointer',
              transition: 'border-color 0.2s, background-color 0.2s',
              '&:hover': {
                borderColor: (t) => t.palette.primary.main,
                bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
              },
            }}
          >
            <input
              ref={screenshotInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                addScreenshots(e.target.files);
                e.target.value = '';
              }}
            />
            <AppIcon
              name="CloudUpload"
              fallback={CloudUploadIcon}
              sx={{
                color: screenshotDragOver ? 'primary.main' : 'text.secondary',
                fontSize: 40,
                mb: 1,
                display: 'block',
                mx: 'auto',
              }}
            />
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: screenshotDragOver ? 'primary.main' : 'text.primary' }}
            >
              Drop screenshots here or click to browse
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              PNG, JPG, WebP · multiple files supported
            </Typography>
          </Box>
          {screenshots.length > 0 && (
            <>
              <Divider />
              <List dense sx={{ py: 0, maxHeight: 140, overflow: 'auto' }}>
                {screenshots.map((s) => (
                  <ListItem
                    key={s.id}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeScreenshot(s.id);
                        }}
                        aria-label="Remove screenshot"
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          fontSize="small"
                        />
                      </IconButton>
                    }
                    sx={{ alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}
                  >
                    <Box
                      component="img"
                      src={s.previewUrl}
                      alt=""
                      sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 1, mr: 1.5 }}
                    />
                    <ListItemText
                      primary={s.file.name}
                      secondary={`${(s.file.size / 1024).toFixed(1)} KB`}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItem>
                ))}
              </List>
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  bgcolor: (t) => alpha(t.palette.grey[500], 0.04),
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Use the &quot;Extract data&quot; button below to run extraction.
                </Typography>
                {(extractStage === 'reading' ||
                  extractStage === 'analyzing' ||
                  extractStage === 'structuring') && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <LinearProgress
                      variant={extractStage === 'reading' ? 'determinate' : 'indeterminate'}
                      value={extractStage === 'reading' ? extractProgress : undefined}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                      {[
                        { stage: 'reading', label: 'Reading images' },
                        { stage: 'analyzing', label: 'Analyzing text' },
                        { stage: 'structuring', label: 'Structuring data' },
                      ].map(({ stage, label }) => (
                        <Typography
                          key={stage}
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            color: extractStage === stage ? 'primary.main' : 'text.secondary',
                            opacity: extractStage === stage ? 1 : 0.7,
                            '@keyframes pulse': {
                              '0%, 100%': { opacity: 1 },
                              '50%': { opacity: 0.5 },
                            },
                            ...(extractStage === stage && {
                              animation: 'pulse 1.2s ease-in-out infinite',
                            }),
                          }}
                        >
                          {label}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
              {extracted && extractStage === 'done' && (
                <Fade in timeout={400}>
                  <Box sx={{ px: 2, pb: 2, pt: 1 }}>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      sx={{ display: 'block', mb: 1 }}
                    >
                      Extracted data - verify on the Review step below and submit.
                    </Typography>
                    {[
                      { key: 'profileInfo', label: 'Profile information' },
                      { key: 'groupTraffic', label: 'Group & Traffic' },
                      { key: 'contactsAndAgreements', label: 'Contacts and agreements' },
                      { key: 'review', label: 'Review' },
                    ].map(({ key, label }, idx) => (
                      <Fade in key={key} timeout={300} style={{ transitionDelay: `${idx * 60}ms` }}>
                        <Box sx={{ mb: 1.5 }}>
                          <Typography
                            variant="caption"
                            fontWeight={600}
                            color="text.secondary"
                            sx={{ display: 'block' }}
                          >
                            {label}
                          </Typography>
                          <TextField
                            size="small"
                            fullWidth
                            multiline
                            minRows={1}
                            maxRows={3}
                            value={extracted.categorized?.[key] ?? extracted[key] ?? ''}
                            readOnly
                            variant="outlined"
                            sx={{ mt: 0.25, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                          />
                        </Box>
                      </Fade>
                    ))}
                  </Box>
                </Fade>
              )}
            </>
          )}
        </Paper>

        <Divider sx={{ mb: 2 }} />

        {/* Step 1: Profile */}
        {activeStep === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="Partner Name"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              error={!!errors.name}
              helperText={errors.name}
              fullWidth
              required
              size="small"
            />
            <TextField
              label="Notes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              fullWidth
              multiline
              rows={3}
              size="small"
              placeholder="Any relevant notes about this partner..."
            />
          </Box>
        )}

        {/* Step 2: Group & Traffic */}
        {activeStep === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Autocomplete
              freeSolo
              options={existingTeams}
              value={form.team}
              onInputChange={(event, newInputValue) => updateField('team', newInputValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Team Name"
                  error={!!errors.team}
                  helperText={errors.team || 'Select existing team or type a new one'}
                  fullWidth
                  required
                  size="small"
                />
              )}
            />
            <FormControl>
              <FormLabel sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Group Type</FormLabel>
              <RadioGroup
                row
                value={form.group}
                onChange={(e) => updateField('group', e.target.value)}
              >
                {GROUP_TYPES.map((type) => (
                  <FormControlLabel
                    key={type}
                    value={type}
                    control={<Radio size="small" />}
                    label={
                      <Typography variant="body2">
                        {type} {GROUP_SUBTYPES[type] ? `(${GROUP_SUBTYPES[type]})` : ''}
                      </Typography>
                    }
                  />
                ))}
              </RadioGroup>
            </FormControl>
            <FormControl>
              <FormLabel sx={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Category / Industry
              </FormLabel>
              <RadioGroup
                row
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
              >
                {['Gambling', 'Ecommerce', 'Fintech'].map((cat) => (
                  <FormControlLabel
                    key={cat}
                    value={cat}
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">{cat}</Typography>}
                  />
                ))}
              </RadioGroup>
            </FormControl>
            <FormControl size="small" fullWidth error={!!errors.trafficSources}>
              <Autocomplete
                multiple
                blurOnSelect
                disablePortal
                popupIcon={<AppIcon name="ExpandMoreRounded" fallback={ExpandMoreRoundedIcon} />}
                options={TRAFFIC_SOURCES}
                value={form.trafficSources}
                onChange={(_, nextValues) => updateField('trafficSources', nextValues)}
                renderOption={(props, option, { selected }) => (
                  <li {...props}>
                    <Checkbox
                      icon={emptyCheckIcon}
                      checkedIcon={filledCheckIcon}
                      checked={selected}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    {option}
                  </li>
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, idx) => (
                    <Chip
                      size="small"
                      label={option}
                      {...getTagProps({ index: idx })}
                      key={option}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Traffic Sources"
                    placeholder={form.trafficSources.length ? '' : 'Choose one or more'}
                    error={!!errors.trafficSources}
                  />
                )}
              />
              <FormHelperText>
                {errors.trafficSources ||
                  'Select traffic sources. Dropdown closes immediately after each pick.'}
              </FormHelperText>
            </FormControl>
            <FormControl size="small" fullWidth error={!!errors.geos}>
              <Autocomplete
                multiple
                blurOnSelect
                disablePortal
                popupIcon={<AppIcon name="ExpandMoreRounded" fallback={ExpandMoreRoundedIcon} />}
                options={geoOptions}
                value={geoOptions.filter((opt) => form.geos.includes(opt.code))}
                onChange={(_, nextValues) =>
                  updateField(
                    'geos',
                    nextValues.map((item) => item.code)
                  )
                }
                isOptionEqualToValue={(opt, val) => opt.code === val.code}
                getOptionLabel={(opt) => opt.label}
                renderOption={(props, option, { selected }) => (
                  <li {...props}>
                    <Checkbox
                      icon={emptyCheckIcon}
                      checkedIcon={filledCheckIcon}
                      checked={selected}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    {option.label}
                  </li>
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, idx) => (
                    <Chip
                      size="small"
                      label={option.label}
                      {...getTagProps({ index: idx })}
                      key={option.code}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Country / Geo"
                    placeholder={form.geos.length ? '' : 'Choose one or more'}
                    error={!!errors.geos}
                  />
                )}
              />
              <FormHelperText>
                {errors.geos || 'Select GEO targets. Dropdown closes immediately after each pick.'}
              </FormHelperText>
            </FormControl>
          </Box>
        )}

        {/* Step 3: Contact & Agreement */}
        {activeStep === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="Telegram Nick"
              value={form.telegramNick}
              onChange={(e) => updateField('telegramNick', e.target.value)}
              error={!!errors.telegramNick}
              helperText={errors.telegramNick}
              fullWidth
              required
              size="small"
              placeholder="@nickname"
            />
            <TextField
              label="Telegram Group URL"
              value={form.telegramGroup}
              onChange={(e) => updateField('telegramGroup', e.target.value)}
              fullWidth
              size="small"
              placeholder="https://t.me/group_name"
            />
            <FormControl>
              <FormLabel sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Agreement Type</FormLabel>
              <RadioGroup
                row
                value={form.agreement}
                onChange={(e) => updateField('agreement', e.target.value)}
              >
                {AGREEMENT_TYPES.map((type) => (
                  <FormControlLabel
                    key={type}
                    value={type}
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">{type}</Typography>}
                  />
                ))}
              </RadioGroup>
            </FormControl>
            <Autocomplete
              disablePortal
              options={FUNNEL_STATUSES}
              value={form.funnelStatus}
              onChange={(_, value) => updateField('funnelStatus', value || FUNNEL_STATUSES[0])}
              renderInput={(params) => <TextField {...params} label="Funnel Status" size="small" />}
            />
          </Box>
        )}

        {/* Step 4: Review */}
        {activeStep === 3 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2, fontSize: '0.8rem' }}>
              Review the details below and click Submit to add the partner.
            </Alert>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                ['Name', form.name],
                ['Team', form.team],
                ['Group', `${form.group} (${form.groupSubtype})`],
                ['Category', form.category],
                ['Traffic Source', form.trafficSources.join(', ')],
                ['Geo', form.geos.map((code) => `${COUNTRY_FLAGS[code] || ''} ${code}`).join(', ')],
                ['Telegram', form.telegramNick],
                ['Agreement', form.agreement],
                ['Funnel Status', form.funnelStatus],
              ].map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
              {form.notes && (
                <>
                  <Divider />
                  <Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontWeight: 500, mb: 0.5 }}
                    >
                      Notes
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                      {form.notes}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </FormDialog>
  );
}
