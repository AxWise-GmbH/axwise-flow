/**
 * Utility functions for exporting questionnaires in various formats
 */

/**
 * Generate comprehensive questionnaire text for export
 */
export const generateComprehensiveQuestionnaireText = (questionnaire: any, title: string): string => {
  let content = `# Research Questionnaire: ${title}\n\n`;
  content += `Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString()}\n\n`;

  if (questionnaire.timeEstimate) {
    content += `## Time Estimate\n`;
    content += `Total Questions: ${questionnaire.timeEstimate.totalQuestions || 'N/A'}\n`;
    content += `Estimated Duration: ${questionnaire.timeEstimate.estimatedMinutesDisplay || questionnaire.timeEstimate.estimatedMinutes || 'N/A'} minutes\n\n`;
  }

  // Primary Stakeholders
  if (questionnaire.primaryStakeholders && questionnaire.primaryStakeholders.length > 0) {
    content += `## 🎯 Primary Stakeholders\n\n`;
    content += `Focus on these ${questionnaire.primaryStakeholders.length} stakeholders first to validate core business assumptions.\n\n`;

    questionnaire.primaryStakeholders.forEach((stakeholder: any, index: number) => {
      content += `### ${index + 1}. ${stakeholder.name}\n`;
      if (stakeholder.description) {
        content += `**Description:** ${stakeholder.description}\n\n`;
      }

      if (stakeholder.questions) {
        if (stakeholder.questions.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0) {
          content += `**🔍 Problem Discovery Questions:**\n`;
          stakeholder.questions.problemDiscovery.forEach((q: string, qIndex: number) => {
            content += `${qIndex + 1}. ${q}\n`;
          });
          content += `\n`;
        }

        if (stakeholder.questions.solutionValidation && stakeholder.questions.solutionValidation.length > 0) {
          content += `**✅ Solution Validation Questions:**\n`;
          stakeholder.questions.solutionValidation.forEach((q: string, qIndex: number) => {
            content += `${qIndex + 1}. ${q}\n`;
          });
          content += `\n`;
        }

        if (stakeholder.questions.followUp && stakeholder.questions.followUp.length > 0) {
          content += `**💡 Follow-up Questions:**\n`;
          stakeholder.questions.followUp.forEach((q: string, qIndex: number) => {
            content += `${qIndex + 1}. ${q}\n`;
          });
          content += `\n`;
        }
      }
      content += `---\n\n`;
    });
  }

  // Secondary Stakeholders
  if (questionnaire.secondaryStakeholders && questionnaire.secondaryStakeholders.length > 0) {
    content += `## 👥 Secondary Stakeholders\n\n`;
    content += `Expand to these ${questionnaire.secondaryStakeholders.length} stakeholders after validating primary assumptions.\n\n`;

    questionnaire.secondaryStakeholders.forEach((stakeholder: any, index: number) => {
      content += `### ${index + 1}. ${stakeholder.name}\n`;
      if (stakeholder.description) {
        content += `**Description:** ${stakeholder.description}\n\n`;
      }

      if (stakeholder.questions) {
        if (stakeholder.questions.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0) {
          content += `**🔍 Problem Discovery Questions:**\n`;
          stakeholder.questions.problemDiscovery.forEach((q: string, qIndex: number) => {
            content += `${qIndex + 1}. ${q}\n`;
          });
          content += `\n`;
        }

        if (stakeholder.questions.solutionValidation && stakeholder.questions.solutionValidation.length > 0) {
          content += `**✅ Solution Validation Questions:**\n`;
          stakeholder.questions.solutionValidation.forEach((q: string, qIndex: number) => {
            content += `${qIndex + 1}. ${q}\n`;
          });
          content += `\n`;
        }

        if (stakeholder.questions.followUp && stakeholder.questions.followUp.length > 0) {
          content += `**💡 Follow-up Questions:**\n`;
          stakeholder.questions.followUp.forEach((q: string, qIndex: number) => {
            content += `${qIndex + 1}. ${q}\n`;
          });
          content += `\n`;
        }
      }
      content += `---\n\n`;
    });
  }

  // Next Steps
  content += `## 📋 Next Steps\n\n`;
  content += `1. **Find 5-10 people** who match your target customer profile\n`;
  content += `2. **Schedule 25-45 minute conversations** - keep them focused and manageable\n`;
  content += `3. **Use your questions and listen carefully** - ask follow-up questions and dig deeper into their specific pain points\n`;
  content += `4. **Look for patterns in their responses** - identify common themes, pain points, and feature priorities\n`;
  content += `5. **Analyze your interview data for insights** - upload your interview transcripts to AxWise for automated analysis\n\n`;

  content += `## 🚀 AxWise Analysis Features\n\n`;
  content += `After completing your interviews:\n`;
  content += `• **Automatically identifies themes and patterns** from responses\n`;
  content += `• **Generates Product Requirement Documentation (PRD)** based on interview insights\n`;
  content += `• **Creates user stories** based on interview insights\n`;
  content += `• **Analysis completed in approximately 2 minutes** vs 3-5 days for manual analysis\n\n`;

  content += `---\n\n`;
  content += `Generated by AxWise Customer Research Assistant\n`;
  content += `Ready for simulation bridge and interview analysis\n`;
  content += `\n💡 **Pro tip:** After completing your interviews, use AxWise to automatically transform your insights into actionable product requirements.`;

  return content;
};

/**
 * Generate questionnaire in JSON format
 */
export const generateQuestionnaireJSON = (questionnaire: any, title: string): string => {
  const exportData = {
    title,
    generatedAt: new Date().toISOString(),
    questionnaire,
    metadata: {
      version: "3.0",
      format: "comprehensive",
      exportedBy: "AxWise Customer Research Assistant"
    }
  };

  return JSON.stringify(exportData, null, 2);
};

/**
 * Generate questionnaire in CSV format
 */
export const generateQuestionnaireCSV = (questionnaire: any, title: string): string => {
  let csv = "Stakeholder Type,Stakeholder Name,Description,Question Category,Question Number,Question Text\n";

  // Primary Stakeholders
  if (questionnaire.primaryStakeholders) {
    questionnaire.primaryStakeholders.forEach((stakeholder: any) => {
      const stakeholderName = stakeholder.name.replace(/"/g, '""');
      const description = (stakeholder.description || '').replace(/"/g, '""');

      if (stakeholder.questions?.problemDiscovery) {
        stakeholder.questions.problemDiscovery.forEach((q: string, index: number) => {
          const question = q.replace(/"/g, '""');
          csv += `Primary,"${stakeholderName}","${description}",Problem Discovery,${index + 1},"${question}"\n`;
        });
      }

      if (stakeholder.questions?.solutionValidation) {
        stakeholder.questions.solutionValidation.forEach((q: string, index: number) => {
          const question = q.replace(/"/g, '""');
          csv += `Primary,"${stakeholderName}","${description}",Solution Validation,${index + 1},"${question}"\n`;
        });
      }

      if (stakeholder.questions?.followUp) {
        stakeholder.questions.followUp.forEach((q: string, index: number) => {
          const question = q.replace(/"/g, '""');
          csv += `Primary,"${stakeholderName}","${description}",Follow-up,${index + 1},"${question}"\n`;
        });
      }
    });
  }

  // Secondary Stakeholders
  if (questionnaire.secondaryStakeholders) {
    questionnaire.secondaryStakeholders.forEach((stakeholder: any) => {
      const stakeholderName = stakeholder.name.replace(/"/g, '""');
      const description = (stakeholder.description || '').replace(/"/g, '""');

      if (stakeholder.questions?.problemDiscovery) {
        stakeholder.questions.problemDiscovery.forEach((q: string, index: number) => {
          const question = q.replace(/"/g, '""');
          csv += `Secondary,"${stakeholderName}","${description}",Problem Discovery,${index + 1},"${question}"\n`;
        });
      }

      if (stakeholder.questions?.solutionValidation) {
        stakeholder.questions.solutionValidation.forEach((q: string, index: number) => {
          const question = q.replace(/"/g, '""');
          csv += `Secondary,"${stakeholderName}","${description}",Solution Validation,${index + 1},"${question}"\n`;
        });
      }

      if (stakeholder.questions?.followUp) {
        stakeholder.questions.followUp.forEach((q: string, index: number) => {
          const question = q.replace(/"/g, '""');
          csv += `Secondary,"${stakeholderName}","${description}",Follow-up,${index + 1},"${question}"\n`;
        });
      }
    });
  }

  return csv;
};

/**
 * Download questionnaire in specified format
 */
export const downloadQuestionnaire = (
  questionnaire: any,
  title: string,
  format: 'txt' | 'json' | 'csv' = 'txt'
): void => {
  let content: string;
  let mimeType: string;
  let extension: string;

  switch (format) {
    case 'txt':
      content = generateComprehensiveQuestionnaireText(questionnaire, title);
      mimeType = 'text/plain';
      extension = 'txt';
      break;
    case 'json':
      content = generateQuestionnaireJSON(questionnaire, title);
      mimeType = 'application/json';
      extension = 'json';
      break;
    case 'csv':
      content = generateQuestionnaireCSV(questionnaire, title);
      mimeType = 'text/csv';
      extension = 'csv';
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `questionnaire-${title.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.${extension}`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
