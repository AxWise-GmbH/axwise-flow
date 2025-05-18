/**
 * PRD Component Script
 * This script is loaded in the iframe to render the PRD component
 */

// Initialize the PRD component
window.initPRD = function(resultId) {
  const container = document.getElementById('prd-container');

  if (!container) {
    console.error('PRD container not found');
    return;
  }

  // Create the PRD UI
  createPRDUI(container, resultId);

  // Auto-generate the PRD when the component loads
  setTimeout(() => {
    generatePRD(resultId, 'both', false); // Use cached version if available
  }, 500);
};

// Create the PRD UI
function createPRDUI(container, resultId) {
  // Create the main UI elements
  const ui = document.createElement('div');
  ui.className = 'prd-ui';
  ui.style.fontFamily = 'Roboto, sans-serif';
  ui.style.maxWidth = '1200px';
  ui.style.margin = '0 auto';
  ui.style.padding = '20px';
  ui.style.backgroundColor = '#fff';
  ui.style.borderRadius = '8px';
  ui.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';

  // Create the header
  const header = document.createElement('div');
  header.style.marginBottom = '20px';

  const title = document.createElement('h1');
  title.textContent = 'Product Requirements Document';
  title.style.fontSize = '24px';
  title.style.marginBottom = '10px';

  const description = document.createElement('p');
  description.textContent = 'Generated from interview analysis results';
  description.style.color = '#666';
  description.style.marginBottom = '20px';

  header.appendChild(title);
  header.appendChild(description);

  // Create the controls
  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.marginBottom = '20px';
  controls.style.alignItems = 'center';

  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'PRD Type:';
  typeLabel.style.marginRight = '10px';

  const typeSelect = document.createElement('select');
  typeSelect.style.padding = '8px';
  typeSelect.style.borderRadius = '4px';
  typeSelect.style.border = '1px solid #ccc';
  typeSelect.style.marginRight = '20px';

  const bothOption = document.createElement('option');
  bothOption.value = 'both';
  bothOption.textContent = 'Both (Operational & Technical)';

  const operationalOption = document.createElement('option');
  operationalOption.value = 'operational';
  operationalOption.textContent = 'Operational';

  const technicalOption = document.createElement('option');
  technicalOption.value = 'technical';
  technicalOption.textContent = 'Technical';

  typeSelect.appendChild(bothOption);
  typeSelect.appendChild(operationalOption);
  typeSelect.appendChild(technicalOption);

  const generateButton = document.createElement('button');
  generateButton.textContent = 'Generate PRD';
  generateButton.style.padding = '8px 16px';
  generateButton.style.backgroundColor = '#4a90e2';
  generateButton.style.color = '#fff';
  generateButton.style.border = 'none';
  generateButton.style.borderRadius = '4px';
  generateButton.style.cursor = 'pointer';

  controls.appendChild(typeLabel);
  controls.appendChild(typeSelect);
  controls.appendChild(generateButton);

  // Create the content area
  const content = document.createElement('div');
  content.id = 'prd-content';
  content.style.minHeight = '400px';

  // Create the loading indicator
  const loading = document.createElement('div');
  loading.id = 'prd-loading';
  loading.style.display = 'none';
  loading.style.textAlign = 'center';
  loading.style.padding = '40px';

  const loadingText = document.createElement('p');
  loadingText.textContent = 'Generating PRD...';

  loading.appendChild(loadingText);

  // Create the tabs
  const tabs = document.createElement('div');
  tabs.id = 'prd-tabs';
  tabs.style.display = 'none';

  const tabButtons = document.createElement('div');
  tabButtons.style.borderBottom = '1px solid #ccc';
  tabButtons.style.marginBottom = '20px';

  const operationalTabButton = document.createElement('button');
  operationalTabButton.textContent = 'Operational PRD';
  operationalTabButton.className = 'tab-button active';
  operationalTabButton.style.padding = '10px 20px';
  operationalTabButton.style.backgroundColor = 'transparent';
  operationalTabButton.style.border = 'none';
  operationalTabButton.style.borderBottom = '2px solid #4a90e2';
  operationalTabButton.style.cursor = 'pointer';
  operationalTabButton.style.marginRight = '10px';

  const technicalTabButton = document.createElement('button');
  technicalTabButton.textContent = 'Technical PRD';
  technicalTabButton.className = 'tab-button';
  technicalTabButton.style.padding = '10px 20px';
  technicalTabButton.style.backgroundColor = 'transparent';
  technicalTabButton.style.border = 'none';
  technicalTabButton.style.borderBottom = '2px solid transparent';
  technicalTabButton.style.cursor = 'pointer';

  tabButtons.appendChild(operationalTabButton);
  tabButtons.appendChild(technicalTabButton);

  const operationalContent = document.createElement('div');
  operationalContent.id = 'operational-content';
  operationalContent.className = 'tab-content active';

  const technicalContent = document.createElement('div');
  technicalContent.id = 'technical-content';
  technicalContent.className = 'tab-content';
  technicalContent.style.display = 'none';

  tabs.appendChild(tabButtons);
  tabs.appendChild(operationalContent);
  tabs.appendChild(technicalContent);

  // Add everything to the container
  ui.appendChild(header);
  ui.appendChild(controls);
  ui.appendChild(loading);
  ui.appendChild(tabs);

  container.appendChild(ui);

  // Add event listeners
  generateButton.addEventListener('click', () => {
    generatePRD(resultId, typeSelect.value, true); // Force regenerate when button is clicked
  });

  operationalTabButton.addEventListener('click', () => {
    operationalTabButton.style.borderBottom = '2px solid #4a90e2';
    technicalTabButton.style.borderBottom = '2px solid transparent';
    operationalContent.style.display = 'block';
    technicalContent.style.display = 'none';
  });

  technicalTabButton.addEventListener('click', () => {
    operationalTabButton.style.borderBottom = '2px solid transparent';
    technicalTabButton.style.borderBottom = '2px solid #4a90e2';
    operationalContent.style.display = 'none';
    technicalContent.style.display = 'block';
  });
}

// Generate the PRD
function generatePRD(resultId, prdType, forceRegenerate = false) {
  const loading = document.getElementById('prd-loading');
  const tabs = document.getElementById('prd-tabs');
  const operationalContent = document.getElementById('operational-content');
  const technicalContent = document.getElementById('technical-content');

  // Show loading indicator
  loading.style.display = 'block';
  tabs.style.display = 'none';

  // Call the API to generate the PRD
  const url = forceRegenerate
    ? `/api/prd/${resultId}?prd_type=${prdType}&force_regenerate=true`
    : `/api/prd/${resultId}?prd_type=${prdType}`;

  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to generate PRD');
      }
      return response.json();
    })
    .then(data => {
      // Hide loading indicator
      loading.style.display = 'none';

      // Show tabs
      tabs.style.display = 'block';

      // Render the PRD
      if (data.prd_data.operational_prd) {
        renderOperationalPRD(operationalContent, data.prd_data.operational_prd);
      }

      if (data.prd_data.technical_prd) {
        renderTechnicalPRD(technicalContent, data.prd_data.technical_prd);
      }
    })
    .catch(error => {
      console.error('Error generating PRD:', error);

      // Hide loading indicator
      loading.style.display = 'none';

      // Show error message
      const content = document.getElementById('prd-content');
      content.innerHTML = `
        <div style="padding: 20px; background-color: #ffebee; border-radius: 4px; margin-bottom: 20px;">
          <h3 style="color: #c62828; margin-top: 0;">Error</h3>
          <p>Failed to generate PRD. Please try again.</p>
        </div>
      `;
    });
}

// Render the operational PRD
function renderOperationalPRD(container, prd) {
  container.innerHTML = '';

  // Objectives
  const objectivesSection = document.createElement('div');
  objectivesSection.className = 'prd-section';
  objectivesSection.style.marginBottom = '30px';

  const objectivesTitle = document.createElement('h2');
  objectivesTitle.textContent = 'Objectives';
  objectivesTitle.style.borderBottom = '1px solid #eee';
  objectivesTitle.style.paddingBottom = '10px';

  objectivesSection.appendChild(objectivesTitle);

  prd.objectives.forEach(objective => {
    const objectiveItem = document.createElement('div');
    objectiveItem.style.marginBottom = '20px';

    const objectiveTitle = document.createElement('h3');
    objectiveTitle.textContent = objective.title;
    objectiveTitle.style.marginBottom = '5px';

    const objectiveDescription = document.createElement('p');
    objectiveDescription.textContent = objective.description;

    objectiveItem.appendChild(objectiveTitle);
    objectiveItem.appendChild(objectiveDescription);

    objectivesSection.appendChild(objectiveItem);
  });

  container.appendChild(objectivesSection);

  // Scope
  const scopeSection = document.createElement('div');
  scopeSection.className = 'prd-section';
  scopeSection.style.marginBottom = '30px';

  const scopeTitle = document.createElement('h2');
  scopeTitle.textContent = 'Scope';
  scopeTitle.style.borderBottom = '1px solid #eee';
  scopeTitle.style.paddingBottom = '10px';

  scopeSection.appendChild(scopeTitle);

  const includedTitle = document.createElement('h3');
  includedTitle.textContent = 'Included';

  const includedList = document.createElement('ul');
  prd.scope.included.forEach(item => {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    includedList.appendChild(listItem);
  });

  const excludedTitle = document.createElement('h3');
  excludedTitle.textContent = 'Excluded';

  const excludedList = document.createElement('ul');
  prd.scope.excluded.forEach(item => {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    excludedList.appendChild(listItem);
  });

  scopeSection.appendChild(includedTitle);
  scopeSection.appendChild(includedList);
  scopeSection.appendChild(excludedTitle);
  scopeSection.appendChild(excludedList);

  container.appendChild(scopeSection);

  // User Stories
  renderUserStories(container, prd.user_stories);

  // Requirements
  renderRequirements(container, prd.requirements);

  // Success Metrics
  renderSuccessMetrics(container, prd.success_metrics);
}

// Render the technical PRD
function renderTechnicalPRD(container, prd) {
  container.innerHTML = '';

  // Objectives
  const objectivesSection = document.createElement('div');
  objectivesSection.className = 'prd-section';
  objectivesSection.style.marginBottom = '30px';

  const objectivesTitle = document.createElement('h2');
  objectivesTitle.textContent = 'Technical Objectives';
  objectivesTitle.style.borderBottom = '1px solid #eee';
  objectivesTitle.style.paddingBottom = '10px';

  objectivesSection.appendChild(objectivesTitle);

  prd.objectives.forEach(objective => {
    const objectiveItem = document.createElement('div');
    objectiveItem.style.marginBottom = '20px';

    const objectiveTitle = document.createElement('h3');
    objectiveTitle.textContent = objective.title;
    objectiveTitle.style.marginBottom = '5px';

    const objectiveDescription = document.createElement('p');
    objectiveDescription.textContent = objective.description;

    objectiveItem.appendChild(objectiveTitle);
    objectiveItem.appendChild(objectiveDescription);

    objectivesSection.appendChild(objectiveItem);
  });

  container.appendChild(objectivesSection);

  // Scope
  const scopeSection = document.createElement('div');
  scopeSection.className = 'prd-section';
  scopeSection.style.marginBottom = '30px';

  const scopeTitle = document.createElement('h2');
  scopeTitle.textContent = 'Technical Scope';
  scopeTitle.style.borderBottom = '1px solid #eee';
  scopeTitle.style.paddingBottom = '10px';

  scopeSection.appendChild(scopeTitle);

  const includedTitle = document.createElement('h3');
  includedTitle.textContent = 'Included';

  const includedList = document.createElement('ul');
  prd.scope.included.forEach(item => {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    includedList.appendChild(listItem);
  });

  const excludedTitle = document.createElement('h3');
  excludedTitle.textContent = 'Excluded';

  const excludedList = document.createElement('ul');
  prd.scope.excluded.forEach(item => {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    excludedList.appendChild(listItem);
  });

  scopeSection.appendChild(includedTitle);
  scopeSection.appendChild(includedList);
  scopeSection.appendChild(excludedTitle);
  scopeSection.appendChild(excludedList);

  container.appendChild(scopeSection);

  // Architecture
  renderArchitecture(container, prd.architecture);

  // Implementation Requirements
  renderImplementationRequirements(container, prd.implementation_requirements);

  // Testing & Validation
  renderTestingValidation(container, prd.testing_validation);

  // Success Metrics
  renderSuccessMetrics(container, prd.success_metrics, true);
}

// Helper functions for rendering sections
function renderUserStories(container, userStories) {
  const section = document.createElement('div');
  section.className = 'prd-section';
  section.style.marginBottom = '30px';

  const title = document.createElement('h2');
  title.textContent = 'User Stories';
  title.style.borderBottom = '1px solid #eee';
  title.style.paddingBottom = '10px';

  section.appendChild(title);

  userStories.forEach(story => {
    const storyItem = document.createElement('div');
    storyItem.style.marginBottom = '20px';
    storyItem.style.padding = '15px';
    storyItem.style.backgroundColor = '#f9f9f9';
    storyItem.style.borderRadius = '4px';

    const storyText = document.createElement('h3');
    storyText.textContent = story.story;
    storyText.style.marginBottom = '10px';

    const acceptanceCriteriaTitle = document.createElement('h4');
    acceptanceCriteriaTitle.textContent = 'Acceptance Criteria';
    acceptanceCriteriaTitle.style.marginBottom = '5px';

    const acceptanceCriteriaList = document.createElement('ul');
    story.acceptance_criteria.forEach(criteria => {
      const listItem = document.createElement('li');
      listItem.textContent = criteria;
      acceptanceCriteriaList.appendChild(listItem);
    });

    const whatTitle = document.createElement('h4');
    whatTitle.textContent = 'What';
    whatTitle.style.marginTop = '15px';
    whatTitle.style.marginBottom = '5px';

    const whatText = document.createElement('p');
    whatText.textContent = story.what;

    const whyTitle = document.createElement('h4');
    whyTitle.textContent = 'Why';
    whyTitle.style.marginTop = '15px';
    whyTitle.style.marginBottom = '5px';

    const whyText = document.createElement('p');
    whyText.textContent = story.why;

    const howTitle = document.createElement('h4');
    howTitle.textContent = 'How';
    howTitle.style.marginTop = '15px';
    howTitle.style.marginBottom = '5px';

    const howText = document.createElement('p');
    howText.textContent = story.how;

    storyItem.appendChild(storyText);
    storyItem.appendChild(acceptanceCriteriaTitle);
    storyItem.appendChild(acceptanceCriteriaList);
    storyItem.appendChild(whatTitle);
    storyItem.appendChild(whatText);
    storyItem.appendChild(whyTitle);
    storyItem.appendChild(whyText);
    storyItem.appendChild(howTitle);
    storyItem.appendChild(howText);

    section.appendChild(storyItem);
  });

  container.appendChild(section);
}

function renderRequirements(container, requirements) {
  const section = document.createElement('div');
  section.className = 'prd-section';
  section.style.marginBottom = '30px';

  const title = document.createElement('h2');
  title.textContent = 'Requirements';
  title.style.borderBottom = '1px solid #eee';
  title.style.paddingBottom = '10px';

  section.appendChild(title);

  requirements.forEach(requirement => {
    const reqItem = document.createElement('div');
    reqItem.style.marginBottom = '20px';

    const reqHeader = document.createElement('div');
    reqHeader.style.display = 'flex';
    reqHeader.style.alignItems = 'center';
    reqHeader.style.marginBottom = '5px';

    const reqId = document.createElement('span');
    reqId.textContent = requirement.id;
    reqId.style.fontWeight = 'bold';
    reqId.style.marginRight = '10px';

    const reqTitle = document.createElement('h3');
    reqTitle.textContent = requirement.title;
    reqTitle.style.margin = '0';
    reqTitle.style.flex = '1';

    const reqPriority = document.createElement('span');
    reqPriority.textContent = requirement.priority;
    reqPriority.style.padding = '3px 8px';
    reqPriority.style.borderRadius = '4px';
    reqPriority.style.fontSize = '12px';
    reqPriority.style.fontWeight = 'bold';

    if (requirement.priority === 'High') {
      reqPriority.style.backgroundColor = '#ffebee';
      reqPriority.style.color = '#c62828';
    } else if (requirement.priority === 'Medium') {
      reqPriority.style.backgroundColor = '#fff8e1';
      reqPriority.style.color = '#f57f17';
    } else {
      reqPriority.style.backgroundColor = '#e8f5e9';
      reqPriority.style.color = '#2e7d32';
    }

    reqHeader.appendChild(reqId);
    reqHeader.appendChild(reqTitle);
    reqHeader.appendChild(reqPriority);

    const reqDescription = document.createElement('p');
    reqDescription.textContent = requirement.description;

    reqItem.appendChild(reqHeader);
    reqItem.appendChild(reqDescription);

    if (requirement.related_user_stories && requirement.related_user_stories.length > 0) {
      const relatedStoriesTitle = document.createElement('h4');
      relatedStoriesTitle.textContent = 'Related User Stories';
      relatedStoriesTitle.style.marginTop = '10px';
      relatedStoriesTitle.style.marginBottom = '5px';
      relatedStoriesTitle.style.fontSize = '14px';

      const relatedStoriesText = document.createElement('p');
      relatedStoriesText.textContent = requirement.related_user_stories.join(', ');
      relatedStoriesText.style.fontSize = '14px';
      relatedStoriesText.style.color = '#666';

      reqItem.appendChild(relatedStoriesTitle);
      reqItem.appendChild(relatedStoriesText);
    }

    section.appendChild(reqItem);
  });

  container.appendChild(section);
}

function renderSuccessMetrics(container, metrics, isTechnical = false) {
  const section = document.createElement('div');
  section.className = 'prd-section';
  section.style.marginBottom = '30px';

  const title = document.createElement('h2');
  title.textContent = isTechnical ? 'Technical Success Metrics' : 'Success Metrics';
  title.style.borderBottom = '1px solid #eee';
  title.style.paddingBottom = '10px';

  section.appendChild(title);

  metrics.forEach(metric => {
    const metricItem = document.createElement('div');
    metricItem.style.marginBottom = '20px';

    const metricTitle = document.createElement('h3');
    metricTitle.textContent = metric.metric;
    metricTitle.style.marginBottom = '5px';

    const metricTarget = document.createElement('p');
    metricTarget.innerHTML = '<strong>Target:</strong> ' + metric.target;

    const metricMethod = document.createElement('p');
    metricMethod.innerHTML = '<strong>Measurement Method:</strong> ' + metric.measurement_method;

    metricItem.appendChild(metricTitle);
    metricItem.appendChild(metricTarget);
    metricItem.appendChild(metricMethod);

    section.appendChild(metricItem);
  });

  container.appendChild(section);
}

function renderArchitecture(container, architecture) {
  const section = document.createElement('div');
  section.className = 'prd-section';
  section.style.marginBottom = '30px';

  const title = document.createElement('h2');
  title.textContent = 'Architecture';
  title.style.borderBottom = '1px solid #eee';
  title.style.paddingBottom = '10px';

  section.appendChild(title);

  const overviewTitle = document.createElement('h3');
  overviewTitle.textContent = 'Overview';

  const overviewText = document.createElement('p');
  overviewText.textContent = architecture.overview;

  section.appendChild(overviewTitle);
  section.appendChild(overviewText);

  const componentsTitle = document.createElement('h3');
  componentsTitle.textContent = 'Components';

  section.appendChild(componentsTitle);

  architecture.components.forEach(component => {
    const componentItem = document.createElement('div');
    componentItem.style.marginBottom = '15px';
    componentItem.style.padding = '10px';
    componentItem.style.backgroundColor = '#f9f9f9';
    componentItem.style.borderRadius = '4px';

    const componentName = document.createElement('h4');
    componentName.textContent = component.name;
    componentName.style.marginBottom = '5px';

    const componentPurpose = document.createElement('p');
    componentPurpose.innerHTML = '<strong>Purpose:</strong> ' + component.purpose;

    const interactionsTitle = document.createElement('p');
    interactionsTitle.innerHTML = '<strong>Interactions:</strong>';

    const interactionsList = document.createElement('ul');
    component.interactions.forEach(interaction => {
      const listItem = document.createElement('li');
      listItem.textContent = interaction;
      interactionsList.appendChild(listItem);
    });

    componentItem.appendChild(componentName);
    componentItem.appendChild(componentPurpose);
    componentItem.appendChild(interactionsTitle);
    componentItem.appendChild(interactionsList);

    section.appendChild(componentItem);
  });

  const dataFlowTitle = document.createElement('h3');
  dataFlowTitle.textContent = 'Data Flow';

  const dataFlowText = document.createElement('p');
  dataFlowText.textContent = architecture.data_flow;

  section.appendChild(dataFlowTitle);
  section.appendChild(dataFlowText);

  container.appendChild(section);
}

function renderImplementationRequirements(container, requirements) {
  const section = document.createElement('div');
  section.className = 'prd-section';
  section.style.marginBottom = '30px';

  const title = document.createElement('h2');
  title.textContent = 'Implementation Requirements';
  title.style.borderBottom = '1px solid #eee';
  title.style.paddingBottom = '10px';

  section.appendChild(title);

  requirements.forEach(requirement => {
    const reqItem = document.createElement('div');
    reqItem.style.marginBottom = '20px';

    const reqHeader = document.createElement('div');
    reqHeader.style.display = 'flex';
    reqHeader.style.alignItems = 'center';
    reqHeader.style.marginBottom = '5px';

    const reqId = document.createElement('span');
    reqId.textContent = requirement.id;
    reqId.style.fontWeight = 'bold';
    reqId.style.marginRight = '10px';

    const reqTitle = document.createElement('h3');
    reqTitle.textContent = requirement.title;
    reqTitle.style.margin = '0';
    reqTitle.style.flex = '1';

    const reqPriority = document.createElement('span');
    reqPriority.textContent = requirement.priority;
    reqPriority.style.padding = '3px 8px';
    reqPriority.style.borderRadius = '4px';
    reqPriority.style.fontSize = '12px';
    reqPriority.style.fontWeight = 'bold';

    if (requirement.priority === 'High') {
      reqPriority.style.backgroundColor = '#ffebee';
      reqPriority.style.color = '#c62828';
    } else if (requirement.priority === 'Medium') {
      reqPriority.style.backgroundColor = '#fff8e1';
      reqPriority.style.color = '#f57f17';
    } else {
      reqPriority.style.backgroundColor = '#e8f5e9';
      reqPriority.style.color = '#2e7d32';
    }

    reqHeader.appendChild(reqId);
    reqHeader.appendChild(reqTitle);
    reqHeader.appendChild(reqPriority);

    const reqDescription = document.createElement('p');
    reqDescription.textContent = requirement.description;

    reqItem.appendChild(reqHeader);
    reqItem.appendChild(reqDescription);

    if (requirement.dependencies && requirement.dependencies.length > 0) {
      const dependenciesTitle = document.createElement('h4');
      dependenciesTitle.textContent = 'Dependencies';
      dependenciesTitle.style.marginTop = '10px';
      dependenciesTitle.style.marginBottom = '5px';
      dependenciesTitle.style.fontSize = '14px';

      const dependenciesText = document.createElement('p');
      dependenciesText.textContent = requirement.dependencies.join(', ');
      dependenciesText.style.fontSize = '14px';
      dependenciesText.style.color = '#666';

      reqItem.appendChild(dependenciesTitle);
      reqItem.appendChild(dependenciesText);
    }

    section.appendChild(reqItem);
  });

  container.appendChild(section);
}

function renderTestingValidation(container, testing) {
  const section = document.createElement('div');
  section.className = 'prd-section';
  section.style.marginBottom = '30px';

  const title = document.createElement('h2');
  title.textContent = 'Testing & Validation';
  title.style.borderBottom = '1px solid #eee';
  title.style.paddingBottom = '10px';

  section.appendChild(title);

  testing.forEach(test => {
    const testItem = document.createElement('div');
    testItem.style.marginBottom = '20px';

    const testTitle = document.createElement('h3');
    testTitle.textContent = test.test_type;
    testTitle.style.marginBottom = '5px';

    const testDescription = document.createElement('p');
    testDescription.innerHTML = '<strong>Description:</strong> ' + test.description;

    const testCriteria = document.createElement('p');
    testCriteria.innerHTML = '<strong>Success Criteria:</strong> ' + test.success_criteria;

    testItem.appendChild(testTitle);
    testItem.appendChild(testDescription);
    testItem.appendChild(testCriteria);

    section.appendChild(testItem);
  });

  container.appendChild(section);
}
