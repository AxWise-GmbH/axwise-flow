/**
 * Robust demographics parsing utilities for handling diverse interview data formats
 *
 * This module provides production-ready parsing logic that can handle:
 * - Bullet-point formats (•, -, *)
 * - Structured key-value pairs (key on one line, value on next)
 * - Inline key-value pairs (key: value in same line)
 * - Mixed and unstructured text formats
 * - Concatenated text separation (e.g., "Tech They are..." → "Industry: Tech" + "Professional Context: They are...")
 *
 * Key improvements:
 * - Eliminates duplicate "Details" entries by accumulating unstructured text
 * - Prevents text fragmentation by grouping related content
 * - Intelligently separates short values from long descriptive text
 * - Deduplicates entries with the same key
 *
 * The parsing is designed to be flexible and graceful, falling back to
 * displaying original content when structured parsing fails.
 */

export interface DemographicItem {
  key: string;
  value: string;
}

/**
 * Clean text content by removing HTML tags, formatting artifacts, and normalizing whitespace
 * @param text - Raw text content that may contain HTML or formatting artifacts
 * @returns Clean, readable text
 */
function cleanTextContent(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Remove HTML tags (including highlight spans)
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Remove asterisks used for highlighting (but preserve content between them)
  cleaned = cleaned.replace(/\*+([^*]*)\*+/g, '$1');
  cleaned = cleaned.replace(/\*+/g, '');

  // Fix spacing around punctuation
  cleaned = cleaned.replace(/\s+\./g, '.');
  cleaned = cleaned.replace(/\s+,/g, ',');
  cleaned = cleaned.replace(/\s+"/g, '"');
  cleaned = cleaned.replace(/"\s+/g, '"');

  // Fix broken sentences and standalone periods
  cleaned = cleaned.replace(/\s+\.\s+/g, '. ');
  cleaned = cleaned.replace(/\.\s*\.\s*/g, '. ');
  cleaned = cleaned.replace(/\.\s*,/g, ',');
  cleaned = cleaned.replace(/,\s*\./g, '.');

  // Fix specific broken word patterns from backend processing
  cleaned = cleaned.replace(/\bfull\.\s*time\b/gi, 'full-time');
  cleaned = cleaned.replace(/\bpart\.\s*time\b/gi, 'part-time');
  cleaned = cleaned.replace(/\blong\.\s*term\b/gi, 'long-term');
  cleaned = cleaned.replace(/\bshort\.\s*term\b/gi, 'short-term');
  cleaned = cleaned.replace(/\breal\.\s*time\b/gi, 'real-time');
  cleaned = cleaned.replace(/\bwell\.\s*being\b/gi, 'well-being');
  cleaned = cleaned.replace(/\bself\.\s*employed\b/gi, 'self-employed');
  cleaned = cleaned.replace(/\bco\.\s*worker\b/gi, 'co-worker');
  cleaned = cleaned.replace(/\be\.\s*g\b/gi, 'e.g');
  cleaned = cleaned.replace(/\bi\.\s*e\b/gi, 'i.e');
  cleaned = cleaned.replace(/\barchitect\.\s*designed\b/gi, 'architect-designed');
  cleaned = cleaned.replace(/\bhigh\.\s*value\b/gi, 'high-value');
  cleaned = cleaned.replace(/\bhigh\.\s*quality\b/gi, 'high-quality');
  cleaned = cleaned.replace(/\blow\.\s*cost\b/gi, 'low-cost');
  cleaned = cleaned.replace(/\bmid\.\s*level\b/gi, 'mid-level');
  cleaned = cleaned.replace(/\btop\.\s*tier\b/gi, 'top-tier');

  // Remove duplicate quotes and fix quote spacing
  cleaned = cleaned.replace(/"+/g, '"');
  cleaned = cleaned.replace(/"\s*"/g, '"');

  // Fix common text artifacts from HTML parsing
  cleaned = cleaned.replace(/\s*\.\s*\.\s*/g, '. ');
  cleaned = cleaned.replace(/\s*,\s*,\s*/g, ', ');
  cleaned = cleaned.replace(/\s*;\s*;\s*/g, '; ');

  // Fix broken sentence structures and word fragments
  cleaned = cleaned.replace(/\.\s*time\b/gi, ' time');
  cleaned = cleaned.replace(/\.\s*designed\b/gi, '-designed');
  cleaned = cleaned.replace(/\.\s*based\b/gi, '-based');
  cleaned = cleaned.replace(/\.\s*focused\b/gi, '-focused');
  cleaned = cleaned.replace(/\.\s*oriented\b/gi, '-oriented');
  cleaned = cleaned.replace(/\.\s*driven\b/gi, '-driven');
  cleaned = cleaned.replace(/\.\s*related\b/gi, '-related');

  // Fix spacing issues around common abbreviations and locations
  cleaned = cleaned.replace(/\(\s*e\s*\.\s*g\s*,?\s*/gi, '(e.g., ');
  cleaned = cleaned.replace(/\(\s*i\s*\.\s*e\s*,?\s*/gi, '(i.e., ');
  cleaned = cleaned.replace(/\s*\)\s*/g, ')');

  // Fix double periods and comma-period combinations
  cleaned = cleaned.replace(/\.\s*,\s*\./g, '.');
  cleaned = cleaned.replace(/,\s*\.\s*,/g, ',');
  cleaned = cleaned.replace(/\.\s*\.\s*/g, '. ');

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Remove leading/trailing whitespace and punctuation artifacts
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/^[.,;:]+|[.,;:]+$/g, '');
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Check if text content looks like profile information
 */
function isProfileContent(text: string): boolean {
  const profileKeywords = [
    'homeowner', 'property', 'investment', 'architect', 'designed', 'standards',
    'care', 'testament', 'significant', 'long-term', 'high-value', 'urban setting',
    'european', 'bremen', 'years', 'home', 'house', 'residence', 'dwelling',
    'full time', 'demanding jobs', 'marketing', 'retail store', 'employee',
    'single mother', 'kids', 'children', 'household decisions', 'home budget',
    'prioritizes', 'well-being', 'time over', 'maintenance chores', 'solely responsible'
  ];

  const lowerText = text.toLowerCase();
  return profileKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Consolidate fragmented profile information across multiple demographic entries
 */
function consolidateProfileInformation(demographics: DemographicItem[]): void {
  const profileRelatedKeys = ['profile', 'additional information', 'demographics', 'background', 'context', 'details'];
  const profileEntries: { index: number; item: DemographicItem }[] = [];

  // Find all profile-related entries (more aggressive consolidation)
  demographics.forEach((item, index) => {
    const keyLower = item.key.toLowerCase();
    const isKeyProfileRelated = profileRelatedKeys.some(key => keyLower.includes(key));
    const isValueProfileRelated = isProfileContent(item.value);

    if (isKeyProfileRelated || isValueProfileRelated) {
      profileEntries.push({ index, item });
    }
  });

  // If we have multiple profile-related entries, consolidate them
  if (profileEntries.length > 1) {
    const consolidatedValue = profileEntries
      .map(entry => entry.item.value)
      .filter(value => value && value.trim())
      .join(' ')
      .trim();

    if (consolidatedValue) {
      const cleanedValue = cleanTextContent(consolidatedValue);

      // Keep the first entry and update its value
      demographics[profileEntries[0].index] = {
        key: 'Profile',
        value: cleanedValue
      };

      // Remove the other entries (in reverse order to maintain indices)
      for (let i = profileEntries.length - 1; i > 0; i--) {
        demographics.splice(profileEntries[i].index, 1);
      }
    }
  }
}

/**
 * Main demographics parsing function that handles multiple formats intelligently
 * @param content - Raw demographics text content or structured object
 * @returns Array of structured key-value pairs
 */
export function parseDemographics(content: any): DemographicItem[] {
  const demographics: DemographicItem[] = [];

  if (!content) {
    return demographics;
  }

  // Handle structured object format (from backend processing)
  if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
    const structuredFields = [
      { key: 'experience_level', label: 'Experience Level' },
      { key: 'roles', label: 'Roles' },
      { key: 'industry', label: 'Industry' },
      { key: 'location', label: 'Location' },
      { key: 'age_range', label: 'Age Range' },
      { key: 'professional_context', label: 'Professional Context' }
    ];

    structuredFields.forEach(({ key, label }) => {
      if (content[key]) {
        let value = content[key];

        // Handle arrays (like roles)
        if (Array.isArray(value)) {
          value = value.join(', ');
        }

        // Only add if value is meaningful
        if (value && String(value).trim()) {
          demographics.push({
            key: label,
            value: String(value).trim()
          });
        }
      }
    });

    return demographics;
  }

  // Handle string format (original logic)
  if (typeof content !== 'string' || !content.trim()) {
    return demographics;
  }

  const trimmedContent = content.trim();

  // Strategy 1: Handle bullet-point format (• or - prefixed items)
  if (trimmedContent.includes('•') || /^\s*[-*]\s+/m.test(trimmedContent)) {
    return parseBulletPointFormat(trimmedContent);
  }
  // Strategy 2: Handle structured key-value pairs (key on one line, value on next)
  else if (trimmedContent.includes('\n')) {
    return parseMultiLineFormat(trimmedContent);
  }
  // Strategy 3: Handle inline key-value pairs in single block
  else {
    return parseInlineFormat(trimmedContent);
  }
}

/**
 * Parse bullet-point formatted demographics
 */
function parseBulletPointFormat(content: string): DemographicItem[] {
  const demographics: DemographicItem[] = [];
  const bulletRegex = /[•\-*]\s*(.+?)(?=[•\-*]|$)/g;
  const matches = content.match(bulletRegex);

  let unstructuredItems: string[] = [];

  if (matches) {
    matches.forEach(match => {
      const cleanItem = match.replace(/^[•\-*]\s*/, '').trim();
      if (cleanItem.includes(':')) {
        const [key, ...valueParts] = cleanItem.split(':');
        const value = valueParts.join(':').trim();
        if (key.trim() && value) {
          const cleanedValue = cleanTextContent(value);
          demographics.push({ key: key.trim(), value: cleanedValue });
        }
      } else if (cleanItem.length > 0) {
        // Accumulate unstructured items instead of creating individual "Details" entries
        unstructuredItems.push(cleanItem);
      }
    });

    // Combine all unstructured items into a single entry
    if (unstructuredItems.length > 0) {
      const combinedText = cleanTextContent(unstructuredItems.join('. ').trim());

      // Check if this looks like profile content that should be merged
      const isProfileLikeContent = isProfileContent(combinedText);
      const profileIndex = demographics.findIndex(item => item.key.toLowerCase() === 'profile');

      if (isProfileLikeContent && profileIndex >= 0) {
        // Merge with existing profile
        demographics[profileIndex].value = `${demographics[profileIndex].value} ${combinedText}`.trim();
      } else if (isProfileLikeContent) {
        // Create new profile entry
        demographics.push({ key: 'Profile', value: combinedText });
      } else {
        // Only create Additional Information for clearly non-profile content
        demographics.push({ key: 'Additional Information', value: combinedText });
      }
    }
  }

  return cleanAndValidate(demographics, content);
}

/**
 * Parse multi-line formatted demographics (key on one line, value on next)
 */
function parseMultiLineFormat(content: string): DemographicItem[] {
  const demographics: DemographicItem[] = [];
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  let unprocessedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];

    // Check if this line looks like a key (ends with colon, short, no periods)
    if (currentLine.endsWith(':') && currentLine.length < 50 && !currentLine.includes('.')) {
      // Before processing this key, handle any accumulated unprocessed lines
      if (unprocessedLines.length > 0) {
        const combinedText = unprocessedLines.join(' ').trim();
        if (combinedText) {
          // Check if this looks like profile content that should be merged
          const isProfileLikeContent = isProfileContent(combinedText);
          const profileIndex = demographics.findIndex(item => item.key.toLowerCase() === 'profile');

          if (isProfileLikeContent && profileIndex >= 0) {
            // Merge with existing profile
            demographics[profileIndex].value = `${demographics[profileIndex].value} ${combinedText}`.trim();
          } else if (isProfileLikeContent) {
            // Create new profile entry
            demographics.push({ key: 'Profile', value: combinedText });
          } else {
            // Only create Additional Information for clearly non-profile content
            demographics.push({ key: 'Additional Information', value: combinedText });
          }
        }
        unprocessedLines = [];
      }

      const key = currentLine.replace(':', '').trim();
      let value = '';
      let j = i + 1;

      // Collect value lines until we hit another key or end
      while (j < lines.length && (!lines[j].endsWith(':') || lines[j].length > 50 || lines[j].includes('.'))) {
        value += (value ? ' ' : '') + lines[j];
        j++;
      }

      if (value.trim()) {
        // Clean the value first - remove HTML tags and formatting artifacts
        const cleanedValue = cleanTextContent(value.trim());

        // Check if this is profile-related content that might need special handling
        const isProfileKey = key.toLowerCase() === 'profile';
        const isAdditionalInfoKey = key.toLowerCase().includes('additional');
        const isWorkExperience = key.toLowerCase().includes('work') || key.toLowerCase().includes('experience');
        const isIndustry = key.toLowerCase().includes('industry');

        // Only treat as profile content if it contains profile indicators AND is not work experience or industry
        const isProfileContent = !isWorkExperience && !isIndustry && (
                                 cleanedValue.toLowerCase().includes('homeowner') ||
                                 cleanedValue.toLowerCase().includes('property') ||
                                 cleanedValue.toLowerCase().includes('investment') ||
                                 cleanedValue.toLowerCase().includes('standards') ||
                                 cleanedValue.toLowerCase().includes('architect') ||
                                 cleanedValue.toLowerCase().includes('designed') ||
                                 cleanedValue.toLowerCase().includes('care') ||
                                 cleanedValue.toLowerCase().includes('testament') ||
                                 cleanedValue.toLowerCase().includes('significant') ||
                                 cleanedValue.toLowerCase().includes('long-term'));

        // Always consolidate profile-related content into a single Profile entry
        if (isProfileKey || isAdditionalInfoKey || isProfileContent) {
          const existingProfileIndex = demographics.findIndex(item => item.key.toLowerCase() === 'profile');

          if (existingProfileIndex >= 0) {
            // Merge with existing profile entry
            const existingValue = demographics[existingProfileIndex].value;
            const mergedValue = `${existingValue} ${cleanedValue}`.trim();
            demographics[existingProfileIndex].value = mergedValue;
          } else {
            // Create new profile entry
            demographics.push({ key: 'Profile', value: cleanedValue });
          }
        } else {
          // Conservative text separation for non-profile content
          const words = cleanedValue.split(/\s+/);
          let shouldSeparate = false;
          let separationPoint = -1;

          // ONLY separate if we have a very clear pattern: single word + pronoun (like "Tech They are...")
          if (words.length > 8 && words.length > 2 && words[0].length <= 15 &&
              ['They', 'He', 'She', 'This', 'These'].includes(words[1])) {

            const firstWord = words[0].toLowerCase();
            const commonStandaloneValues = ['tech', 'finance', 'healthcare', 'education', 'retail', 'manufacturing'];

            if (commonStandaloneValues.includes(firstWord) ||
                (words[0].length <= 10 && !words[0].includes('.'))) {
              shouldSeparate = true;
              separationPoint = 1;
            }
          }

          // Apply separation only if we're confident it's correct
          if (shouldSeparate && separationPoint > 0 && separationPoint < words.length - 3) {
            const shortValue = words.slice(0, separationPoint).join(' ');
            const descriptiveText = words.slice(separationPoint).join(' ');

            demographics.push({ key, value: shortValue });
            demographics.push({ key: 'Professional Context', value: descriptiveText });
          } else {
            // Keep the content together as a single coherent entry
            demographics.push({ key, value: cleanedValue });
          }
        }
        i = j - 1; // Skip processed lines
      }
    }
    // Handle inline key:value format
    else if (currentLine.includes(':') && !currentLine.endsWith(':')) {
      const colonIndex = currentLine.indexOf(':');
      const key = currentLine.substring(0, colonIndex).trim();
      const value = currentLine.substring(colonIndex + 1).trim();

      // Only treat as key-value if key is reasonable length and doesn't look like a sentence
      if (key.length > 0 && key.length < 50 && value.length > 0 && !key.includes('.')) {
        // Before processing this key-value, handle any accumulated unprocessed lines conservatively
        if (unprocessedLines.length > 0) {
          const combinedText = cleanTextContent(unprocessedLines.join(' ').trim());
          if (combinedText) {
            // Check if this looks like profile content that should be merged
            const isProfileLikeContent = isProfileContent(combinedText);

            const profileIndex = demographics.findIndex(item => item.key.toLowerCase() === 'profile');
            if (isProfileLikeContent && profileIndex >= 0) {
              // Merge with existing profile
              demographics[profileIndex].value = `${demographics[profileIndex].value} ${combinedText}`.trim();
            } else if (isProfileLikeContent) {
              // Create new profile entry
              demographics.push({ key: 'Profile', value: combinedText });
            } else {
              // Only create Additional Information for clearly non-profile content
              demographics.push({ key: 'Additional Information', value: combinedText });
            }
          }
          unprocessedLines = [];
        }
        // Clean the value before adding
        const cleanedValue = cleanTextContent(value);
        demographics.push({ key, value: cleanedValue });
      } else {
        // Accumulate this line for later processing
        unprocessedLines.push(currentLine);
      }
    }
    // Regular text line - accumulate for later processing
    else {
      unprocessedLines.push(currentLine);
    }
  }

  // Post-processing: Consolidate fragmented profile information
  consolidateProfileInformation(demographics);

  // Handle any remaining unprocessed lines - be conservative about creating "Additional Information"
  if (unprocessedLines.length > 0) {
    const combinedText = cleanTextContent(unprocessedLines.join(' ').trim());

    if (combinedText) {
      const isProfileLikeContent = isProfileContent(combinedText);

      // If it looks like profile content, merge with existing profile or create one
      const profileIndex = demographics.findIndex(item => item.key.toLowerCase() === 'profile');
      if (isProfileLikeContent && profileIndex >= 0) {
        // Merge with existing profile entry
        demographics[profileIndex].value = `${demographics[profileIndex].value} ${combinedText}`.trim();
      } else if (isProfileLikeContent) {
        // Create new profile entry
        demographics.push({ key: 'Profile', value: combinedText });
      } else if (demographics.length > 0) {
        // Only create Additional Information for non-profile content if we have other demographics
        demographics.push({ key: 'Additional Information', value: combinedText });
      }
    }
  }

  return cleanAndValidate(demographics, content);
}

/**
 * Parse inline formatted demographics (key: value key2: value2)
 */
function parseInlineFormat(content: string): DemographicItem[] {
  const demographics: DemographicItem[] = [];

  // Improved pattern to better capture key-value pairs
  // This pattern looks for word-based keys followed by colons and captures everything until the next key or end
  const keyValuePattern = /([A-Za-z][A-Za-z\s]{1,40}):\s*([^:]*?)(?=\s+[A-Z][A-Za-z\s]{1,40}:\s|$)/g;
  const matches = [...content.matchAll(keyValuePattern)];

  if (matches.length > 1) {
    matches.forEach((match, index) => {
      const key = match[1].trim();
      let value = match[2].trim();

      // Clean up the value by removing trailing punctuation and extra whitespace
      value = value.replace(/[.,;]+$/, '').trim();

      if (key && value && value.length > 0) {
        demographics.push({ key, value });
      }
    });
  } else {
    // Try a simpler approach for single key-value pairs
    const simplePattern = /^([^:]+):\s*(.+)$/;
    const simpleMatch = content.match(simplePattern);

    if (simpleMatch) {
      const key = simpleMatch[1].trim();
      const value = simpleMatch[2].trim();

      // Only treat as key-value if key looks reasonable
      if (key.length > 0 && key.length < 50 && !key.includes('.') && value.length > 0) {
        demographics.push({ key, value });
      } else {
        // Single block of unstructured text - use as-is
        demographics.push({ key: 'Demographics', value: content });
      }
    } else {
      // Single block of unstructured text - use as-is
      demographics.push({ key: 'Demographics', value: content });
    }
  }

  return cleanAndValidate(demographics, content);
}

/**
 * Clean up parsed demographics and validate results
 */
function cleanAndValidate(demographics: DemographicItem[], originalContent: string): DemographicItem[] {
  // Clean up and deduplicate
  const cleanedDemographics = demographics
    .filter(item => item.key && item.value && item.value.length > 0)
    .map(item => ({
      key: item.key.replace(/[^\w\s]/g, '').trim() || 'Information',
      value: item.value.trim()
    }));

  // Deduplicate by key - if there are multiple entries with the same key, combine their values
  const deduplicatedMap = new Map<string, string[]>();

  cleanedDemographics.forEach(item => {
    const normalizedKey = item.key.toLowerCase();
    if (!deduplicatedMap.has(normalizedKey)) {
      deduplicatedMap.set(normalizedKey, []);
    }
    deduplicatedMap.get(normalizedKey)!.push(item.value);
  });

  // Convert back to array, combining duplicate values
  const finalDemographics: DemographicItem[] = [];
  deduplicatedMap.forEach((values, normalizedKey) => {
    // Find the original case version of the key
    const originalKey = cleanedDemographics.find(item =>
      item.key.toLowerCase() === normalizedKey
    )?.key || normalizedKey;

    if (values.length === 1) {
      finalDemographics.push({ key: originalKey, value: values[0] });
    } else {
      // Combine multiple values, avoiding redundancy
      const combinedValue = values
        .filter((value, index, arr) => arr.indexOf(value) === index) // Remove exact duplicates
        .join('. ')
        .replace(/\.\s*\./g, '.') // Clean up double periods
        .trim();
      finalDemographics.push({ key: originalKey, value: combinedValue });
    }
  });

  // If we couldn't parse anything meaningful, return the original content
  if (finalDemographics.length === 0) {
    return [{ key: 'Demographics', value: originalContent.trim() }];
  }

  return finalDemographics;
}

/**
 * Utility function to check if demographics content appears to be structured
 * This can be used to determine if LLM-based parsing might be beneficial
 */
export function isStructuredContent(content: string): boolean {
  if (!content || !content.trim()) {
    return false;
  }

  const trimmedContent = content.trim();

  // Check for bullet points
  if (trimmedContent.includes('•') || /^\s*[-*]\s+/m.test(trimmedContent)) {
    return true;
  }

  // Check for multiple key-value pairs
  const colonCount = (trimmedContent.match(/:/g) || []).length;
  if (colonCount > 1) {
    return true;
  }

  // Check for multi-line structure
  if (trimmedContent.includes('\n') && trimmedContent.split('\n').length > 2) {
    return true;
  }

  return false;
}

/**
 * Utility function to suggest if content would benefit from LLM-based parsing
 * This can be used by the backend to determine when to apply more sophisticated parsing
 */
export function shouldUseLLMParsing(content: string): boolean {
  if (!content || !content.trim()) {
    return false;
  }

  const trimmedContent = content.trim();

  // Long, complex content that might benefit from semantic understanding
  if (trimmedContent.length > 200 && !isStructuredContent(trimmedContent)) {
    return true;
  }

  // Content with mixed formats or unclear structure
  if (trimmedContent.includes(':') && trimmedContent.includes('.') && trimmedContent.length > 100) {
    return true;
  }

  // Content that appears to have concatenated information
  const words = trimmedContent.split(/\s+/);
  if (words.length > 20 && !trimmedContent.includes('\n') && !trimmedContent.includes('•')) {
    return true;
  }

  return false;
}

/**
 * Example LLM prompt for backend demographics parsing
 * This can be used as a template for implementing LLM-based parsing in the backend
 */
export const LLM_PARSING_PROMPT = `
Parse the following demographics text into structured key-value pairs.
Extract meaningful demographic attributes such as:
- Age/Age Range
- Role/Position
- Industry
- Experience Level
- Location
- Education
- Company Size
- Background/Context

Format the output as a JSON array of objects with 'key' and 'value' properties.
If the text contains mixed or concatenated information, separate it appropriately.
Preserve the original meaning and context while creating clear, distinct categories.

Demographics text:
{content}

Return only the JSON array, no additional text.
`;
