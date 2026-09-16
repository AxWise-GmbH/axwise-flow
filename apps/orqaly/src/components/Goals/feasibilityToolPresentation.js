const SUCCESS_COLOR = '#10B981';
const WARNING_COLOR = '#F59E0B';

export function getFeasibilityToolPresentation(goal, report) {
  const suggestedAvailable = report?.feasibility?.tool_availability?.available || [];
  const suggestedMissing = report?.feasibility?.tool_availability?.missing || [];
  const noToolsPolicy = goal?.data?.tool_mode === 'no_tools';

  if (noToolsPolicy) {
    return {
      noToolsPolicy: true,
      availableTools: [],
      missingTools: [],
      metric: {
        label: 'Tools',
        value: 'None needed',
        valueColor: SUCCESS_COLOR,
        detail: {
          title: 'Tool Policy',
          lines: [
            'This goal is configured for No Tools execution.',
            'Feasibility tool suggestions are informational only; external tools and credentials will not be requested.',
          ],
        },
      },
      reportLines: [
        'TOOL POLICY: NO TOOLS',
        'External tools are disabled for this goal; feasibility suggestions are informational only.',
      ],
    };
  }

  return {
    noToolsPolicy: false,
    availableTools: suggestedAvailable,
    missingTools: suggestedMissing,
    metric: {
      label: 'Tools Missing',
      value: suggestedMissing.length > 0 ? `${suggestedMissing.length} missing` : 'None',
      valueColor: suggestedMissing.length > 0 ? WARNING_COLOR : SUCCESS_COLOR,
      detail: {
        title: 'Tool Availability',
        lines: [
          suggestedMissing.length > 0
            ? `Missing (${suggestedMissing.length}): ${suggestedMissing.join(', ')}`
            : 'All required tools are configured.',
          suggestedAvailable.length > 0
            ? `Available (${suggestedAvailable.length}): ${suggestedAvailable.join(', ')}`
            : null,
          suggestedMissing.length > 0
            ? 'Missing tools may limit agent capabilities. Set up API keys in Settings → Tools.'
            : null,
        ].filter(Boolean),
      },
    },
    reportLines: [
      suggestedAvailable.length ? `AVAILABLE TOOLS: ${suggestedAvailable.join(', ')}` : '',
      suggestedMissing.length ? `MISSING TOOLS: ${suggestedMissing.join(', ')}` : '',
    ],
  };
}
