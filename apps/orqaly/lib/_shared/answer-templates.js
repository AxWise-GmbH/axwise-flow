/**
 * [module: shared]
 * Answer-template registry for the copilot.
 *
 * Each template turns a free-text answer (which varies wildly by model quality)
 * into a fixed set of JSON slots the model fills, plus a deterministic render()
 * that owns the final structure and tone. Weak models stay consistent because
 * they only supply content, never layout. Run one via
 * runStructuredTemplate() in lib/_shared/structured-llm.js.
 *
 * A template = {
 *   kind,                // stable id
 *   schema,              // { field: 'string' | 'string[]' | 'number' (+ '?') }
 *   systemInstruction,   // role + rules for filling the slots
 *   fewShot: [{ context, output }],
 *   render(fields) -> { content, title }   // deterministic markdown
 * }
 */

/** Render a bullet list, dropping empty items. */
function bullets(items) {
  return (items || [])
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .map((x) => `- ${x}`)
    .join('\n');
}

export const ANSWER_TEMPLATES = {
  brief: {
    kind: 'brief',
    schema: {
      overview: 'string',
      focus_areas: 'string[]',
      risks: 'string[]',
      next_steps: 'string[]',
    },
    systemInstruction:
      'You are a sharp business analyst writing a concise business brief for an operator. Summarize only what the input supports.',
    fewShot: [
      {
        context:
          'Recent goals:\n- Grow LinkedIn to 5k (active, $6/$20)\n- Launch casino landing page (planning, $0/$15)',
        output: JSON.stringify({
          overview:
            'Two initiatives are in flight: LinkedIn growth is underway and mid-budget, while the casino landing page is still in planning.',
          focus_areas: ['Ship the casino landing page out of planning', 'Sustain LinkedIn growth momentum'],
          risks: ['Casino page has spent nothing yet and may be stalled'],
          next_steps: ['Confirm the casino page owner and timeline', 'Review LinkedIn spend pace against the $20 cap'],
        }),
      },
    ],
    render(fields) {
      const content = [
        '## Overview',
        String(fields.overview || '').trim(),
        '',
        '## Current Focus',
        bullets(fields.focus_areas),
        '',
        '## Risks',
        bullets(fields.risks),
        '',
        '## Next Steps',
        bullets(fields.next_steps),
      ].join('\n');
      return { title: 'Business brief', content };
    },
  },
};

/** @returns {object|null} the template for a kind, or null if unknown. */
export function getAnswerTemplate(kind) {
  return ANSWER_TEMPLATES[kind] || null;
}
