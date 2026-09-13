const READER_FORMATS = Object.freeze([
  { value: 'agenda', pattern: /\bagendas?\b/iu, itemKind: 'agenda_item', itemUnit: 'items?' },
  { value: 'checklist', pattern: /\bchecklists?\b/iu, itemKind: 'checklist_item', itemUnit: 'items?' },
  { value: 'email', pattern: /\bemails?\b/iu, itemKind: 'email_section', itemUnit: 'sections?' },
  {
    value: 'faq',
    pattern: /\b(?:faqs?|frequently asked questions)\b/iu,
    itemKind: 'faq_item',
    itemUnit: '(?:items?|questions?)',
  },
  { value: 'message', pattern: /\bmessages?\b/iu, itemKind: 'message_section', itemUnit: 'sections?' },
  { value: 'post', pattern: /\bposts?\b(?!-)/iu, itemKind: 'post_section', itemUnit: 'sections?' },
  { value: 'script', pattern: /\bscripts?\b/iu, itemKind: 'script_step', itemUnit: 'steps?' },
  { value: 'template', pattern: /\btemplates?\b/iu, itemKind: 'template_section', itemUnit: 'sections?' },
]);

const OWNER_CONSTRAINT_CATEGORIES = new Set(['deliverable', 'limit', 'policy']);
const NUMBER_WORD_VALUES = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
});
const EXACT_ITEM_NUMBER =
  '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';

function parseItemNumber(value) {
  return /^\d+$/u.test(value)
    ? Number.parseInt(value, 10)
    : NUMBER_WORD_VALUES[value.toLocaleLowerCase('en-US')];
}

function constraintError(message, code = 'ORQALY_AMBIGUOUS_READER_OUTPUT_CONSTRAINT') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ownerConstraints(scope) {
  return (scope.requirements || [])
    .filter(
      (requirement) =>
        requirement.authority === 'owner' &&
        OWNER_CONSTRAINT_CATEGORIES.has(requirement.category)
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function clausePrefix(description, matchIndex) {
  return description
    .slice(0, matchIndex)
    .split(/[.!?;\n]|\b(?:but|however|instead)\b/iu)
    .at(-1);
}

function isNegatedClauseMatch(description, matchIndex) {
  const prefix = clausePrefix(description, matchIndex);
  return (
    /\b(?:avoid|don't|never|not|without)\b/iu.test(prefix) ||
    /\bno\s+(?:an?\s+)?$/iu.test(prefix)
  );
}

function isPositiveFormatDirective(requirement, match) {
  if (requirement.category === 'deliverable') return true;
  const prefix = clausePrefix(requirement.description, match.index);
  const suffix = requirement.description.slice(match.index + match[0].length).split(/[.!?;\n]/u)[0];
  const entireClause = `${prefix}${match[0]}${suffix}`.trim();
  return (
    entireClause.toLocaleLowerCase('en-US') === match[0].toLocaleLowerCase('en-US') ||
    /\b(?:create|deliver|format|output|present|produce|provide|render|respond|return|structure|write)\b[^.!?;\n]{0,80}$/iu.test(
      prefix
    ) ||
    /\b(?:must|needs?\s+to|shall|should)\s+be\s+(?:an?\s+)?[^.!?;\n]{0,30}$/iu.test(
      prefix
    ) ||
    /\buse\s+(?:an?\s+)?(?:(?:brief|compact|concise|markdown|short)\s+){0,2}$/iu.test(
      prefix
    ) ||
    /\bonly\s+(?:an?\s+)?$/iu.test(prefix) ||
    /^\s+(?:format|only|output|response)\b/iu.test(suffix)
  );
}

function formatMatches(requirement) {
  return READER_FORMATS.flatMap((format) => {
    const match = format.pattern.exec(requirement.description);
    if (!match) return [];
    if (
      isNegatedClauseMatch(requirement.description, match.index) ||
      !isPositiveFormatDirective(requirement, match)
    ) {
      return [];
    }
    return [{ format, match, requirement }];
  });
}

function explicitWordLimits(requirement) {
  const values = [];
  for (const match of requirement.description.matchAll(
    /\b(?:at\s+most|no\s+more\s+than|up\s+to|within|max(?:imum)?(?:\s+of)?)\s+(\d{1,6})\s+words?\b/giu
  )) {
    if (isNegatedClauseMatch(requirement.description, match.index)) continue;
    values.push(Number.parseInt(match[1], 10));
  }
  for (const match of requirement.description.matchAll(/\b(\d{1,6})[-\s]word\b/giu)) {
    const prefix = requirement.description.slice(Math.max(0, match.index - 35), match.index);
    if (
      isNegatedClauseMatch(requirement.description, match.index) ||
      /\b(?:at\s+least|minimum(?:\s+of)?|more\s+than|no\s+fewer\s+than)\b[^.!?;\n]{0,25}$/iu.test(prefix)
    ) {
      continue;
    }
    values.push(Number.parseInt(match[1], 10));
  }
  for (const match of requirement.description.matchAll(
    /\b(?:under|fewer\s+than|less\s+than)\s+(\d{1,6})\s+words?\b/giu
  )) {
    if (isNegatedClauseMatch(requirement.description, match.index)) continue;
    values.push(Number.parseInt(match[1], 10) - 1);
  }
  return values.map((maximumWords) => ({ maximumWords, requirement }));
}

function hasCompactFormatModifier(description, match) {
  const prefix = description.slice(Math.max(0, match.index - 80), match.index);
  return /\b(?:brief|compact|concise|short|one[-\s]page)(?:\s*,?\s+(?:actionable|markdown|practical|reader[-\s]facing)){0,2}\s*$/iu.test(
    prefix
  );
}

function exactItemLimits(requirement, format) {
  const noun = format.value === 'faq'
    ? '(?:faqs?|frequently asked questions)'
    : `${format.value}s?`;
  const unit = format.itemUnit;
  const patterns = [
    new RegExp(`\\b${EXACT_ITEM_NUMBER}[-\\s]${unit}[-\\s]+${noun}\\b`, 'giu'),
    new RegExp(
      `\\b${noun}\\b[^.!?\\n]{0,40}\\b(?:with|of|containing)\\s+(?:exactly\\s+)?${EXACT_ITEM_NUMBER}\\s+${unit}\\b`,
      'giu'
    ),
    new RegExp(
      `\\b(?:exactly\\s+)?${EXACT_ITEM_NUMBER}\\s+${unit}\\s+(?:in|for)\\s+(?:the\\s+|a\\s+)?${noun}\\b`,
      'giu'
    ),
  ];
  return patterns.flatMap((pattern) =>
    [...requirement.description.matchAll(pattern)].flatMap((match) => {
      const prefix = requirement.description.slice(Math.max(0, match.index - 35), match.index);
      if (
        isNegatedClauseMatch(requirement.description, match.index) ||
        /\b(?:at\s+least|maximum(?:\s+of)?|no\s+more\s+than|up\s+to)\b[^.!?;\n]{0,25}$/iu.test(prefix)
      ) {
        return [];
      }
      return [{
        exactItems: parseItemNumber(match[1]),
        requirement,
      }];
    })
  );
}

function uniqueConstraint(matches, field, maximum) {
  const validMatches = matches.filter(
    (match) =>
      Number.isInteger(match[field]) && match[field] > 0 && match[field] <= maximum
  );
  if (validMatches.length !== matches.length) {
    throw constraintError(
      `${field} must be a positive bounded integer`,
      'ORQALY_INVALID_READER_OUTPUT_CONSTRAINT'
    );
  }
  const values = [...new Set(validMatches.map((match) => match[field]))];
  if (values.length > 1) {
    throw constraintError(`owner requirements contain conflicting ${field} values`);
  }
  return validMatches[0] || null;
}

export function deriveReaderOutputContract(scope) {
  if (!['content_artifact', 'general_artifact'].includes(
    scope.deliverableProfile?.artifactType
  )) {
    return null;
  }

  const requirements = ownerConstraints(scope);
  const rawMatches = requirements.flatMap(formatMatches);
  const allMatches = rawMatches.filter(
    (match) =>
      !(
        ['message', 'template'].includes(match.format.value) &&
        rawMatches.some(
          (candidate) =>
            candidate.requirement.id === match.requirement.id &&
            candidate.format.value !== match.format.value &&
            (match.format.value === 'template' || candidate.format.value === 'email')
        )
      )
  );
  const formats = [...new Set(allMatches.map((match) => match.format.value))];
  if (!formats.length) return null;
  if (formats.length > 1) {
    throw constraintError('owner requirements contain conflicting reader formats');
  }

  const formatMatch = allMatches.find((match) => match.format.value === formats[0]);
  const explicitWords = uniqueConstraint(
    requirements.flatMap(explicitWordLimits),
    'maximumWords',
    120_000
  );
  const itemLimit = uniqueConstraint(
    requirements.flatMap((requirement) => exactItemLimits(requirement, formatMatch.format)),
    'exactItems',
    500
  );
  const compactDefaultRequirement = explicitWords
    ? null
    : allMatches.find(
        (match) =>
          match.format.value === formatMatch.format.value &&
          hasCompactFormatModifier(match.requirement.description, match.match)
      )?.requirement || null;

  return {
    schemaVersion: 'orqaly.reader-output.v1',
    readerFormat: {
      value: formatMatch.format.value,
      requirementId: formatMatch.requirement.id,
    },
    wordLimit: explicitWords
      ? {
          maximumWords: explicitWords.maximumWords,
          basis: 'owner_explicit',
          requirementId: explicitWords.requirement.id,
        }
      : compactDefaultRequirement
        ? {
            maximumWords: 250,
            basis: 'bounded_content_default_v1',
            requirementId: compactDefaultRequirement.id,
          }
        : null,
    itemLimit: itemLimit
      ? {
          exactItems: itemLimit.exactItems,
          itemKind: formatMatch.format.itemKind,
          requirementId: itemLimit.requirement.id,
        }
      : null,
    measurement: {
      scope: 'reader_markdown_before_server_disclosures',
      wordCounter: 'unicode_words_v1',
      itemCounter: 'top_level_markdown_items_v1',
    },
  };
}
