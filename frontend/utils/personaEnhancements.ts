/**
 * Utility functions for enhancing persona display with keywords and highlighting
 */

// Category-specific keyword patterns
const KEYWORD_PATTERNS = {
  demographics: [
    'family', 'parent', 'expat', 'international', 'location', 'age', 'experience',
    'background', 'role', 'position', 'team', 'company', 'industry', 'education',
    'years', 'senior', 'junior', 'manager', 'director', 'analyst', 'developer'
  ],
  goals_and_motivations: [
    'efficiency', 'productivity', 'growth', 'success', 'achievement', 'improvement',
    'optimization', 'streamline', 'automate', 'simplify', 'convenience', 'platform',
    'solution', 'tool', 'system', 'process', 'workflow', 'collaboration', 'communication'
  ],
  challenges_and_frustrations: [
    'barrier', 'obstacle', 'difficulty', 'problem', 'issue', 'challenge', 'frustration',
    'pain point', 'bottleneck', 'limitation', 'constraint', 'time-consuming', 'complex',
    'complicated', 'confusing', 'overwhelming', 'stressful', 'inefficient', 'manual'
  ],
  skills_and_expertise: [
    'expertise', 'skill', 'knowledge', 'experience', 'proficiency', 'competency',
    'technical', 'analytical', 'strategic', 'leadership', 'management', 'communication',
    'problem-solving', 'decision-making', 'planning', 'execution', 'innovation'
  ],
  technology_and_tools: [
    'software', 'platform', 'tool', 'system', 'application', 'technology', 'digital',
    'automation', 'integration', 'API', 'dashboard', 'interface', 'mobile', 'web',
    'cloud', 'data', 'analytics', 'reporting', 'workflow', 'process'
  ],
  workflow_and_environment: [
    'workflow', 'process', 'environment', 'collaboration', 'team', 'remote', 'office',
    'meeting', 'communication', 'coordination', 'planning', 'execution', 'review',
    'feedback', 'iteration', 'agile', 'methodology', 'framework', 'structure'
  ]
};

// Common highlighting patterns
const HIGHLIGHT_PATTERNS = [
  // Quoted text
  /"([^"]+)"/g,
  // Emphasized text with asterisks
  /\*([^*]+)\*/g,
  // Time durations
  /\b\d+[-\s]?\d*\s*(minutes?|hours?|days?|weeks?|months?|years?)\b/gi,
  // Percentages and numbers
  /\b\d+%\b/g,
  // Key phrases with specific words
  /\b(language barrier|time constraint|mental load|decision fatigue|logistical nightmare)\b/gi,
  // Problem indicators
  /\b(difficult|challenging|frustrating|overwhelming|time-consuming|inefficient|complex)\b/gi,
  // Solution indicators
  /\b(streamline|optimize|automate|simplify|improve|enhance|efficient|effective)\b/gi,
  // Emotional indicators
  /\b(stressed|anxious|confident|satisfied|frustrated|excited|motivated)\b/gi
];

/**
 * Extract relevant keywords from text based on category
 */
export function extractKeywords(text: any, category: string): string[] {
  if (!text || typeof text !== 'string') return [];

  const normalizedCategory = category.toLowerCase().replace(/[^a-z]/g, '_');
  const categoryKeywords = KEYWORD_PATTERNS[normalizedCategory as keyof typeof KEYWORD_PATTERNS] || [];

  const textLower = String(text).toLowerCase();
  const foundKeywords = new Set<string>();

  // Find category-specific keywords
  categoryKeywords.forEach(keyword => {
    if (textLower.includes(keyword.toLowerCase())) {
      foundKeywords.add(keyword);
    }
  });

  // Extract additional contextual keywords
  const words = String(text).match(/\b[a-zA-Z]{4,}\b/g) || [];
  const contextualKeywords = words
    .filter(word => {
      const wordLower = word.toLowerCase();
      return (
        // Business/UX terms
        ['platform', 'interface', 'experience', 'journey', 'process', 'workflow', 'system'].includes(wordLower) ||
        // Technical terms
        ['integration', 'automation', 'optimization', 'analytics', 'dashboard'].includes(wordLower) ||
        // Problem/solution terms
        ['solution', 'challenge', 'opportunity', 'improvement', 'efficiency'].includes(wordLower)
      );
    })
    .slice(0, 2); // Limit additional keywords

  contextualKeywords.forEach(keyword => foundKeywords.add(keyword));

  // Return top 5 most relevant keywords
  return Array.from(foundKeywords).slice(0, 5);
}

/**
 * Highlight key phrases in text
 */
export function highlightKeyPhrases(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let highlightedText = String(text);

  // First handle bold formatting (**text**)
  highlightedText = highlightedText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Apply highlighting patterns
  HIGHLIGHT_PATTERNS.forEach(pattern => {
    highlightedText = highlightedText.replace(pattern, (match, group1) => {
      // For patterns with capture groups, highlight the captured content
      if (group1) {
        return match.replace(group1, `<span class="highlight">${group1}</span>`);
      }
      // For patterns without capture groups, highlight the entire match
      return `<span class="highlight">${match}</span>`;
    });
  });

  return highlightedText;
}

/**
 * Get keywords array for rendering in React components
 */
export function getKeywordsForRendering(keywords: string[]): string[] {
  return keywords.filter(keyword => keyword && keyword.trim().length > 0);
}

/**
 * Parse markdown bold formatting (**text**) to HTML <strong> tags
 * Based on PROJECT_DEEP_DIVE_ANALYSIS.md requirements for key quotes rendering
 */
export function parseMarkdownBold(text: any): string {
  if (!text || typeof text !== 'string') return String(text || '');

  // Convert **word** to <strong>word</strong>
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Safely render highlighted text as HTML
 */
export function renderHighlightedText(text: any): { __html: string } {
  if (!text || typeof text !== 'string') {
    return { __html: String(text || '') };
  }

  const highlighted = highlightKeyPhrases(text);
  // Basic XSS protection - only allow highlight spans and strong tags
  const sanitized = highlighted.replace(/<(?!\/?(?:span|strong)[^>]*>)[^>]*>/g, '');
  return { __html: sanitized };
}

/**
 * Render text with markdown bold parsing and highlighting
 * Combines markdown bold parsing with keyword highlighting
 */
export function renderMarkdownWithHighlighting(text: any): { __html: string } {
  if (!text || typeof text !== 'string') {
    return { __html: String(text || '') };
  }

  // First parse markdown bold formatting
  const withBold = parseMarkdownBold(text);

  // Then apply keyword highlighting (but preserve existing <strong> tags)
  const highlighted = highlightKeyPhrases(withBold);

  // Basic XSS protection - only allow highlight spans and strong tags
  const sanitized = highlighted.replace(/<(?!\/?(?:span|strong)[^>]*>)[^>]*>/g, '');

  return { __html: sanitized };
}

/**
 * Get category display name for better UX
 */
export function getCategoryDisplayName(category: string): string {
  const displayNames: Record<string, string> = {
    'demographics': 'Demographics & Background',
    'goals_and_motivations': 'Goals & Motivations',
    'challenges_and_frustrations': 'Challenges & Frustrations',
    'skills_and_expertise': 'Skills & Expertise',
    'technology_and_tools': 'Technology & Tools',
    'workflow_and_environment': 'Workflow & Environment',
    'key_quotes': 'Key Quotes'
  };

  return displayNames[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
