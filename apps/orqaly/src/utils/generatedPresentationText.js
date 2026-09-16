const EMPTY_GENERATED_VALUES = /^(?:null|undefined|n\/a|\[object object\])$/i;

function cleanMathNotation(content) {
  return String(content || '')
    .replace(/\\_/g, '\uE000')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 / $2')
    .replace(/\\sum(?=[^A-Za-z]|$)/g, 'Σ')
    .replace(/\\(?:times|cdot)\b/g, ' × ')
    .replace(/\\(?:leq|le)\b/g, '≤')
    .replace(/\\(?:geq|ge)\b/g, '≥')
    .replace(/\\(?:approx)\b/g, '≈')
    .replace(/\\(?:rightarrow|to)\b/g, '→')
    .replace(/_\{([^{}]+)\}|_([A-Za-z0-9]+)/g, (_, group, token) => ` sub ${group || token}`)
    .replace(
      /\^\{([^{}]+)\}|\^([A-Za-z0-9]+)/g,
      (_, group, token) => ` to the power of ${group || token}`
    )
    .replace(/\uE000/g, '_')
    .replace(/\\[A-Za-z]+(?=[^A-Za-z]|$)/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

function cleanGeneratedLine(value) {
  const input = String(value || '')
    .trim()
    .replace(
      /(?:^|\s*[·;,]\s*)[^·;,\n:]{1,80}:\s*(?:null|undefined|n\/a|\[object object\])(?=\s*(?:[·;,]|$))/gi,
      ''
    )
    .replace(/\[object object\]/gi, '')
    .replace(/^\s*[·;,]\s*|\s*[·;,]\s*$/g, '')
    .trim();
  if (!input || EMPTY_GENERATED_VALUES.test(input)) return '';
  if (/^[^:]{1,80}:\s*(?:null|undefined|n\/a|\[object object\])$/i.test(input)) return '';
  const looseMath = /(?:=|≤|≥|≈|→|[+÷×])/.test(input);
  return input
    .replace(/\\_/g, '\uE000')
    .replace(/\\begin\{[^{}]+\}|\\end\{[^{}]+\}/g, '')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, content) => cleanMathNotation(content))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, content) => cleanMathNotation(content))
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 / $2')
    .replace(/\\sum(?=[^A-Za-z]|$)/g, 'Σ')
    .replace(/\\(?:textbf|textit|emph|mathrm|mathbf|text|operatorname)\{([^{}]*)\}/g, '$1')
    .replace(/\${1,2}([^$\n]+)\${1,2}/g, (match, content) =>
      /[=^_\\{}]|\b(?:frac|times|cdot|sum|sqrt)\b/.test(content)
        ? cleanMathNotation(content)
        : match
    )
    .replace(/\\(?:times|cdot)\b/g, ' × ')
    .replace(/\\(?:leq|le)\b/g, '≤')
    .replace(/\\(?:geq|ge)\b/g, '≥')
    .replace(/\\(?:approx)\b/g, '≈')
    .replace(/\\(?:rightarrow|to)\b/g, '→')
    .replace(/\\(?:%|_|&|#|\*|`)/g, (match) => match.slice(1))
    .replace(/_\{([^{}]+)\}|_([A-Za-z0-9]+)/g, (match, group, token) =>
      looseMath ? ` sub ${group || token}` : match
    )
    .replace(/\^\{([^{}]+)\}|\^([A-Za-z0-9]+)/g, (match, group, token) =>
      looseMath ? ` to the power of ${group || token}` : match
    )
    .replace(/\uE000/g, '_')
    .replace(/\\[A-Za-z]+(?=[^A-Za-z]|$)/g, '')
    .replace(/\\[()[\]]/g, '')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '$1 — $2')
    .replace(/^#{1,6}\s*/g, '')
    .replace(/^\s*[-+*]\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/([A-Za-z0-9_)])\s*\*\s*([A-Za-z0-9_(])/g, '$1 × $2')
    .replace(/\*+/g, '')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Convert provider-authored Markdown/LaTeX decoration into safe plain UI text. */
export function cleanGeneratedPresentationText(value) {
  if (typeof value !== 'string') return value;
  return cleanGeneratedLine(value.replace(/\s+/g, ' '));
}

/** Preserve document paragraphs while removing raw provider formatting tokens. */
export function cleanGeneratedDocumentText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(cleanGeneratedLine)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
