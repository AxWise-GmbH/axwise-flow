import { describe, it, expect } from 'vitest';
import {
  resolveRate,
  personCost,
  computeDepartmentStats,
  confidenceFor,
  recommend,
  projectMoney,
  MIN_SAMPLE,
  GOOD_SAMPLE,
} from './decision.js';

/** Build n identical pairs, the first `agentWins` of them won by the agents. */
function pairs(n, agentWins, { people = {}, agents = {} } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    verdict: i < agentWins ? 'agents' : 'people',
    people: { rating: 4, cost_usd: 100, minutes_spent: 120, outcome: 'accepted', ...people },
    agents: { rating: 4, cost_usd: 1, minutes_spent: 5, outcome: 'accepted', ...agents },
  }));
}

describe('resolveRate', () => {
  const rates = [
    {
      scope: 'department',
      key: 'legal',
      currency: 'EUR',
      hourly_rate: 80,
      effective_from: '2026-01-01',
    },
    {
      scope: 'role',
      key: 'Lawyer',
      currency: 'EUR',
      hourly_rate: 120,
      effective_from: '2026-01-01',
    },
    {
      scope: 'person',
      key: 'Marta K.',
      currency: 'EUR',
      hourly_rate: 140,
      effective_from: '2026-01-01',
    },
  ];

  it('prefers the person rate over the role and the department', () => {
    const r = resolveRate(rates, { person: 'Marta K.', role: 'Lawyer', department: 'legal' });
    expect(r.hourlyRate).toBe(140);
    expect(r.scope).toBe('person');
  });

  it('falls back to the role when there is no person rate', () => {
    const r = resolveRate(rates, { person: 'Someone Else', role: 'Lawyer', department: 'legal' });
    expect(r.hourlyRate).toBe(120);
    expect(r.scope).toBe('role');
  });

  it('falls back to the department when there is no person or role rate', () => {
    const r = resolveRate(rates, { role: 'Paralegal', department: 'legal' });
    expect(r.hourlyRate).toBe(80);
    expect(r.scope).toBe('department');
  });

  it('matches ignoring case and whitespace', () => {
    expect(resolveRate(rates, { role: '  lawyer ' }).hourlyRate).toBe(120);
  });

  it('returns null when nothing matches, rather than a default rate', () => {
    expect(resolveRate(rates, { role: 'Astronaut' })).toBeNull();
    expect(resolveRate([], { role: 'Lawyer' })).toBeNull();
    expect(resolveRate(null, { role: 'Lawyer' })).toBeNull();
  });

  it('ignores a rate that is not yet in effect and takes the newest that is', () => {
    const versioned = [
      { scope: 'role', key: 'Lawyer', hourly_rate: 120, effective_from: '2026-01-01' },
      { scope: 'role', key: 'Lawyer', hourly_rate: 150, effective_from: '2026-06-01' },
      { scope: 'role', key: 'Lawyer', hourly_rate: 999, effective_from: '2027-01-01' },
    ];
    expect(resolveRate(versioned, { role: 'Lawyer', on: '2026-08-21' }).hourlyRate).toBe(150);
    expect(resolveRate(versioned, { role: 'Lawyer', on: '2026-03-01' }).hourlyRate).toBe(120);
  });
});

describe('personCost', () => {
  it('uses the per-job price over the hourly rate, because it is what was paid', () => {
    expect(personCost({ hourlyRate: 120, perJobCost: 300 }, 60)).toBe(300);
  });

  it('bills hourly time correctly', () => {
    expect(personCost({ hourlyRate: 120, perJobCost: null }, 90)).toBe(180);
  });

  it('returns null, never zero, when the rate or the time is missing', () => {
    expect(personCost(null, 90)).toBeNull();
    expect(personCost({ hourlyRate: null, perJobCost: null }, 90)).toBeNull();
    expect(personCost({ hourlyRate: 120, perJobCost: null }, null)).toBeNull();
    expect(personCost({ hourlyRate: 120, perJobCost: null }, undefined)).toBeNull();
  });
});

describe('computeDepartmentStats', () => {
  it('counts only jobs where both sides delivered', () => {
    const mixed = [
      ...pairs(3, 3),
      { verdict: null, people: { rating: 4 }, agents: null },
      { verdict: null, people: null, agents: { rating: 5 } },
    ];
    expect(computeDepartmentStats(mixed).n).toBe(3);
  });

  it('averages a measure only over pairs where both sides have it', () => {
    const some = [
      ...pairs(2, 2),
      {
        verdict: 'agents',
        people: { rating: 4, cost_usd: null, minutes_spent: 120, outcome: 'accepted' },
        agents: { rating: 5, cost_usd: 1, minutes_spent: 5, outcome: 'accepted' },
      },
    ];
    const s = computeDepartmentStats(some);
    // The third pair has no human cost, so it sits out of the cost averages.
    expect(s.avgCost.pairs).toBe(2);
    expect(s.avgCost.people).toBe(100);
    // ...but it still counts for time, which both sides have.
    expect(s.avgMinutes.pairs).toBe(3);
  });

  it('reports coverage against the real monthly volume', () => {
    const s = computeDepartmentStats(pairs(10, 8), { monthlyVolume: 100 });
    expect(s.coverage).toBeCloseTo(0.1);
  });

  it('leaves coverage null when nobody said how many jobs a month there are', () => {
    expect(computeDepartmentStats(pairs(10, 8)).coverage).toBeNull();
  });

  it('counts rework from either the outcome or a rework tally', () => {
    const s = computeDepartmentStats([
      ...pairs(2, 2),
      {
        verdict: 'people',
        people: { rating: 4, cost_usd: 100, minutes_spent: 120, outcome: 'accepted' },
        agents: {
          rating: 3,
          cost_usd: 1,
          minutes_spent: 5,
          outcome: 'accepted',
          reworked_count: 2,
        },
      },
    ]);
    expect(s.reworkRate.agents).toBeCloseTo(1 / 3);
    expect(s.reworkRate.people).toBe(0);
  });
});

describe('confidenceFor', () => {
  it('calls a sample below the minimum no confidence at all', () => {
    expect(confidenceFor(MIN_SAMPLE - 1)).toBe('none');
  });

  it('grows from low to good as the sample grows', () => {
    expect(confidenceFor(MIN_SAMPLE)).toBe('low');
    expect(confidenceFor(GOOD_SAMPLE)).toBe('good');
  });

  it('drops high-stakes departments one level, so they need far more evidence', () => {
    expect(confidenceFor(GOOD_SAMPLE, 'high')).toBe('low');
    expect(confidenceFor(MIN_SAMPLE, 'high')).toBe('none');
    expect(confidenceFor(GOOD_SAMPLE, 'low')).toBe('good');
  });
});

describe('recommend', () => {
  it('refuses to recommend on a thin sample, however lopsided the wins', () => {
    const s = computeDepartmentStats(pairs(4, 4), { stakes: 'low' });
    const r = recommend(s);
    expect(r.recommendation).toBe('not_enough_yet');
    expect(r.reasons[0]).toContain(String(MIN_SAMPLE));
  });

  it('hands over when agents win convincingly, hold quality and cost less', () => {
    const s = computeDepartmentStats(
      pairs(20, 16, { agents: { rating: 5, cost_usd: 1, minutes_spent: 5, outcome: 'accepted' } }),
      { stakes: 'low' }
    );
    const r = recommend(s);
    expect(r.recommendation).toBe('hand_over');
    expect(r.confidence).toBe('good');
  });

  it('will not hand over a high-stakes department on a mid-sized sample', () => {
    const args = pairs(10, 9, {
      agents: { rating: 5, cost_usd: 1, minutes_spent: 5, outcome: 'accepted' },
    });
    expect(recommend(computeDepartmentStats(args, { stakes: 'low' })).recommendation).toBe(
      'hand_over'
    );
    // Same evidence, higher stakes: confidence falls to none, so it downgrades.
    const strict = recommend(computeDepartmentStats(args, { stakes: 'high' }));
    expect(strict.confidence).toBe('none');
    expect(strict.recommendation).not.toBe('hand_over');
  });

  it('keeps the work human when people win most of it', () => {
    const s = computeDepartmentStats(pairs(20, 4), { stakes: 'medium' });
    expect(recommend(s).recommendation).toBe('keep_human');
  });

  it('keeps the work human when agent quality is far below, even if they win', () => {
    const s = computeDepartmentStats(
      pairs(20, 18, {
        people: { rating: 5, cost_usd: 100, minutes_spent: 120, outcome: 'accepted' },
        agents: { rating: 3, cost_usd: 1, minutes_spent: 5, outcome: 'accepted' },
      }),
      { stakes: 'medium' }
    );
    expect(recommend(s).recommendation).toBe('keep_human');
  });

  it('recommends assist when agents are cheaper but quality still trails', () => {
    const s = computeDepartmentStats(
      pairs(20, 12, {
        people: { rating: 5, cost_usd: 100, minutes_spent: 120, outcome: 'accepted' },
        agents: { rating: 4.5, cost_usd: 1, minutes_spent: 5, outcome: 'accepted' },
      }),
      { stakes: 'medium' }
    );
    const r = recommend(s);
    expect(r.recommendation).toBe('assist');
    expect(r.reasons.join(' ')).toMatch(/cheaper|review/i);
  });

  it('always explains itself', () => {
    for (const n of [3, 10, 20]) {
      const r = recommend(
        computeDepartmentStats(pairs(n, Math.floor(n * 0.8)), { stakes: 'medium' })
      );
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('projectMoney', () => {
  const stats = computeDepartmentStats(
    pairs(20, 16, {
      people: { rating: 4, cost_usd: 100, minutes_spent: 120, outcome: 'accepted' },
    }),
    { stakes: 'low', monthlyVolume: 100 }
  );

  it('multiplies the saving by the win rate, not by the full volume', () => {
    const m = projectMoney(stats, { windowDays: 30 });
    // costDelta 99 x volume 100 x winRate 0.8 — never the full 9,900.
    expect(m.projectedSaving).toBeCloseTo(99 * 100 * 0.8, 1);
    expect(m.projectedSaving).toBeLessThan(99 * 100);
  });

  it('reports released capacity in hours, also scaled by the win rate', () => {
    const m = projectMoney(stats, { windowDays: 30 });
    expect(m.capacityReleasedHours).toBeCloseTo((115 * 100 * 0.8) / 60, 1);
  });

  it('projects nothing when nobody said how many jobs a month there are', () => {
    const noVolume = computeDepartmentStats(pairs(20, 16), { stakes: 'low' });
    const m = projectMoney(noVolume, { windowDays: 30 });
    expect(m.projectedSaving).toBeNull();
    expect(m.capacityReleasedHours).toBeNull();
  });

  it('leaves money blank rather than zero when no human cost could be resolved', () => {
    const noRate = computeDepartmentStats(
      pairs(20, 16, {
        people: { rating: 4, cost_usd: null, minutes_spent: 120, outcome: 'accepted' },
      }),
      { stakes: 'low', monthlyVolume: 100 }
    );
    const m = projectMoney(noRate, { windowDays: 30 });
    expect(noRate.costDelta).toBeNull();
    expect(m.projectedSaving).toBeNull();
    expect(m.monthlyPeopleCost).toBeNull();
    // Time still works, because both sides recorded minutes.
    expect(noRate.timeDelta).toBe(115);
    expect(m.capacityReleasedHours).not.toBeNull();
  });

  it('scales a short window up to a month so spend reads against a real budget', () => {
    const week = projectMoney(stats, { windowDays: 7 });
    const month = projectMoney(stats, { windowDays: 30 });
    expect(week.monthlyAgentSpend).toBeGreaterThan(month.monthlyAgentSpend);
  });
});
