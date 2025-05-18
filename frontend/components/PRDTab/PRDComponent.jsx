import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Paper,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

/**
 * PRD Component for direct integration with React
 */
const PRDComponent = ({ resultId, prdService }) => {
  const [prdType, setPrdType] = useState('both');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prdData, setPrdData] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Generate PRD
  const handleGeneratePRD = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await prdService.generatePRD(resultId, prdType);
      setPrdData(response.prd_data);
    } catch (err) {
      console.error('Error generating PRD:', err);
      setError('Failed to generate PRD. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  // Handle PRD type change
  const handlePrdTypeChange = (event) => {
    setPrdType(event.target.value);
  };

  // Render operational PRD
  const renderOperationalPRD = () => {
    const operationalPRD = prdData?.operational_prd;
    
    if (!operationalPRD) {
      return <Alert severity="info">No operational PRD data available.</Alert>;
    }
    
    return (
      <Box>
        {/* Objectives */}
        <Typography variant="h5" sx={{ mb: 2 }}>Objectives</Typography>
        {operationalPRD.objectives.map((objective, index) => (
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="h6">{objective.title}</Typography>
            <Typography variant="body2">{objective.description}</Typography>
          </Box>
        ))}
        
        <Divider sx={{ my: 3 }} />
        
        {/* Scope */}
        <Typography variant="h5" sx={{ mb: 2 }}>Scope</Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">Included</Typography>
          <ul>
            {operationalPRD.scope.included.map((item, index) => (
              <li key={index}><Typography variant="body2">{item}</Typography></li>
            ))}
          </ul>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">Excluded</Typography>
          <ul>
            {operationalPRD.scope.excluded.map((item, index) => (
              <li key={index}><Typography variant="body2">{item}</Typography></li>
            ))}
          </ul>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        {/* User Stories */}
        <Typography variant="h5" sx={{ mb: 2 }}>User Stories</Typography>
        {operationalPRD.user_stories.map((story, index) => (
          <Accordion key={index} sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{story.story}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6">Acceptance Criteria:</Typography>
                <Box sx={{ pl: 2 }}>
                  {story.acceptance_criteria.map((criteria, idx) => (
                    <Typography key={idx} variant="body2">{criteria}</Typography>
                  ))}
                </Box>
              </Box>
              
              <Box sx={{ mb: 1 }}>
                <Typography variant="h6">What:</Typography>
                <Typography variant="body2">{story.what}</Typography>
              </Box>
              
              <Box sx={{ mb: 1 }}>
                <Typography variant="h6">Why:</Typography>
                <Typography variant="body2">{story.why}</Typography>
              </Box>
              
              <Box>
                <Typography variant="h6">How:</Typography>
                <Typography variant="body2">{story.how}</Typography>
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
        
        <Divider sx={{ my: 3 }} />
        
        {/* Requirements */}
        <Typography variant="h5" sx={{ mb: 2 }}>Requirements</Typography>
        {operationalPRD.requirements.map((requirement, index) => (
          <Accordion key={index} sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">
                <strong>{requirement.id}:</strong> {requirement.title} 
                <Box component="span" sx={{ ml: 2, color: 
                  requirement.priority === 'High' ? 'error.main' : 
                  requirement.priority === 'Medium' ? 'warning.main' : 'success.main' 
                }}>
                  ({requirement.priority})
                </Box>
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">{requirement.description}</Typography>
              
              {requirement.related_user_stories && requirement.related_user_stories.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>Related User Stories:</strong> {requirement.related_user_stories.join(', ')}
                  </Typography>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        ))}
        
        <Divider sx={{ my: 3 }} />
        
        {/* Success Metrics */}
        <Typography variant="h5" sx={{ mb: 2 }}>Success Metrics</Typography>
        {operationalPRD.success_metrics.map((metric, index) => (
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="h6">{metric.metric}</Typography>
            <Typography variant="body2"><strong>Target:</strong> {metric.target}</Typography>
            <Typography variant="body2"><strong>Measurement Method:</strong> {metric.measurement_method}</Typography>
          </Box>
        ))}
      </Box>
    );
  };

  // Render technical PRD
  const renderTechnicalPRD = () => {
    const technicalPRD = prdData?.technical_prd;
    
    if (!technicalPRD) {
      return <Alert severity="info">No technical PRD data available.</Alert>;
    }
    
    return (
      <Box>
        {/* Objectives */}
        <Typography variant="h5" sx={{ mb: 2 }}>Technical Objectives</Typography>
        {technicalPRD.objectives.map((objective, index) => (
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="h6">{objective.title}</Typography>
            <Typography variant="body2">{objective.description}</Typography>
          </Box>
        ))}
        
        <Divider sx={{ my: 3 }} />
        
        {/* Scope */}
        <Typography variant="h5" sx={{ mb: 2 }}>Technical Scope</Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">Included</Typography>
          <ul>
            {technicalPRD.scope.included.map((item, index) => (
              <li key={index}><Typography variant="body2">{item}</Typography></li>
            ))}
          </ul>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">Excluded</Typography>
          <ul>
            {technicalPRD.scope.excluded.map((item, index) => (
              <li key={index}><Typography variant="body2">{item}</Typography></li>
            ))}
          </ul>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        {/* Architecture */}
        <Typography variant="h5" sx={{ mb: 2 }}>Architecture</Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">Overview</Typography>
          <Typography variant="body2">{technicalPRD.architecture.overview}</Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">Components</Typography>
          {technicalPRD.architecture.components.map((component, index) => (
            <Box key={index} sx={{ mb: 2, pl: 2 }}>
              <Typography variant="subtitle1">{component.name}</Typography>
              <Typography variant="body2"><strong>Purpose:</strong> {component.purpose}</Typography>
              <Typography variant="body2"><strong>Interactions:</strong></Typography>
              <ul>
                {component.interactions.map((interaction, idx) => (
                  <li key={idx}><Typography variant="body2">{interaction}</Typography></li>
                ))}
              </ul>
            </Box>
          ))}
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">Data Flow</Typography>
          <Typography variant="body2">{technicalPRD.architecture.data_flow}</Typography>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        {/* Implementation Requirements */}
        <Typography variant="h5" sx={{ mb: 2 }}>Implementation Requirements</Typography>
        {technicalPRD.implementation_requirements.map((requirement, index) => (
          <Accordion key={index} sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">
                <strong>{requirement.id}:</strong> {requirement.title}
                <Box component="span" sx={{ ml: 2, color: 
                  requirement.priority === 'High' ? 'error.main' : 
                  requirement.priority === 'Medium' ? 'warning.main' : 'success.main' 
                }}>
                  ({requirement.priority})
                </Box>
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">{requirement.description}</Typography>
              
              {requirement.dependencies && requirement.dependencies.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>Dependencies:</strong> {requirement.dependencies.join(', ')}
                  </Typography>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        ))}
        
        <Divider sx={{ my: 3 }} />
        
        {/* Testing & Validation */}
        <Typography variant="h5" sx={{ mb: 2 }}>Testing & Validation</Typography>
        {technicalPRD.testing_validation.map((test, index) => (
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="h6">{test.test_type}</Typography>
            <Typography variant="body2"><strong>Description:</strong> {test.description}</Typography>
            <Typography variant="body2"><strong>Success Criteria:</strong> {test.success_criteria}</Typography>
          </Box>
        ))}
        
        <Divider sx={{ my: 3 }} />
        
        {/* Success Metrics */}
        <Typography variant="h5" sx={{ mb: 2 }}>Technical Success Metrics</Typography>
        {technicalPRD.success_metrics.map((metric, index) => (
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="h6">{metric.metric}</Typography>
            <Typography variant="body2"><strong>Target:</strong> {metric.target}</Typography>
            <Typography variant="body2"><strong>Measurement Method:</strong> {metric.measurement_method}</Typography>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Product Requirements Document</Typography>
      
      <Box sx={{ mb: 3 }}>
        <FormControl sx={{ minWidth: 200, mr: 2 }}>
          <InputLabel id="prd-type-label">PRD Type</InputLabel>
          <Select
            labelId="prd-type-label"
            id="prd-type-select"
            value={prdType}
            label="PRD Type"
            onChange={handlePrdTypeChange}
            disabled={loading}
          >
            <MenuItem value="both">Both (Operational & Technical)</MenuItem>
            <MenuItem value="operational">Operational</MenuItem>
            <MenuItem value="technical">Technical</MenuItem>
          </Select>
        </FormControl>
        
        <Button 
          variant="contained" 
          onClick={handleGeneratePRD}
          disabled={loading}
          sx={{ mt: 1 }}
        >
          {loading ? <CircularProgress size={24} /> : 'Generate PRD'}
        </Button>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}
      
      {prdData && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={activeTab} onChange={handleTabChange}>
              {prdData.operational_prd && (
                <Tab label="Operational PRD" />
              )}
              {prdData.technical_prd && (
                <Tab label="Technical PRD" />
              )}
            </Tabs>
          </Box>
          
          {activeTab === 0 && prdData.operational_prd && renderOperationalPRD()}
          {activeTab === (prdData.operational_prd ? 1 : 0) && prdData.technical_prd && renderTechnicalPRD()}
        </Paper>
      )}
    </Box>
  );
};

export default PRDComponent;
