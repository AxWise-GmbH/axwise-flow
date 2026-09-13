import { describe, expect, it } from 'vitest';
import {
  enforceNoToolsPlanPolicy,
  effectiveGoalTaskToolIds,
  goalCreationRequestsNoTools,
  goalSkipsTools,
} from './goal-tool-policy.js';

describe('goal tool policy', () => {
  it('recognizes both durable and legacy no-tools goal state', () => {
    expect(goalSkipsTools({ data: { tool_mode: 'no_tools' } })).toBe(true);
    expect(goalSkipsTools({ data: { skip_tools: true } })).toBe(true);
    expect(goalSkipsTools({ data: { tool_mode: 'with_tools' } })).toBe(false);
  });

  it('projects task tools through no-tools and existing-only policy without mutating tasks', () => {
    expect(
      effectiveGoalTaskToolIds({ data: { tool_mode: 'no_tools' } }, [
        'web-search',
        'tool-doc-generator',
      ])
    ).toEqual([]);
    expect(
      effectiveGoalTaskToolIds(
        { data: { tool_mode: 'existing_only', required_tools: ['tool-doc-generator'] } },
        ['web-search', 'tool-doc-generator']
      )
    ).toEqual(['tool-doc-generator']);
  });

  it('preserves an explicit tool-free assistant request when the model omits tool_mode', () => {
    expect(
      goalCreationRequestsNoTools({
        description: 'Create the commercial plan without external tools or API calls.',
      })
    ).toBe(true);
  });

  it('lets a structured with-tools choice override incidental wording', () => {
    expect(
      goalCreationRequestsNoTools({
        tool_mode: 'with_tools',
        description: 'Explain which steps need no tools and which need research.',
      })
    ).toBe(false);
  });

  it('removes hidden tool instructions from a no-tools plan', () => {
    const plan = {
      phases: [
        {
          description:
            'Run live web searches. Produce a concise Bremen market brief with three segments.',
          tool_requirements: ['web-search'],
          acceptance_criteria: [
            'Minimum 5 distinct web search queries executed',
            'Three commercial segments documented',
            'All claims backed by source citations',
          ],
          jobs: [
            {
              description: 'Use the browser and external API calls. Deliver three ICP profiles.',
              requirements: 'Browse the internet before writing.',
              tool_requirements: ['browser', 'web-search'],
              acceptance_criteria: ['Three ICP profiles', 'Source citations included'],
            },
          ],
        },
      ],
    };

    const { diagnostics } = enforceNoToolsPlanPolicy(plan);

    expect(diagnostics.clearedToolRequirements).toBe(3);
    expect(diagnostics.scrubbedFields).toBeGreaterThanOrEqual(5);
    expect(plan.phases[0].tool_requirements).toEqual([]);
    expect(plan.phases[0].jobs[0].tool_requirements).toEqual([]);
    expect(JSON.stringify(plan)).not.toMatch(/web search|browser|api calls|source citations/i);
    expect(plan.phases[0].jobs[0].description).toMatch(/three ICP profiles/i);
    expect(plan.phases[0].jobs[0].acceptance_criteria.join(' ')).toContain(
      'externally unverified claims labeled as assumptions'
    );
  });
});
