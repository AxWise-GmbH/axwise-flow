import { describe, expect, it } from 'vitest';
import {
  confirmMarketScope,
  marketScopeChoices,
  marketScopeReady,
  resolveMarketExpression,
  marketScopeHashPayload,
} from './market-scope.js';
import { createHash } from 'node:crypto';

describe('market scope v2', () => {
  it.each([
    ['BENELUX', ['BE', 'NL', 'LU']],
    ['DACH', ['DE', 'AT', 'CH']],
    ['Baltics', ['EE', 'LV', 'LT']],
    ['Nordics', ['DK', 'FI', 'IS', 'NO', 'SE']],
    ['USA + Canada', ['US', 'CA']],
  ])('resolves %s into a deterministic country snapshot', (expression, expected) => {
    const scope = resolveMarketExpression(expression);
    expect(scope.resolved_scope.countries.map((item) => item.country_code)).toEqual(expected);
    expect(marketScopeReady(scope)).toBe(true);
  });

  it('preserves unions, priorities and exclusions', () => {
    const scope = resolveMarketExpression(
      'DACH + BENELUX prioritising Switzerland and Netherlands excluding Luxembourg'
    );
    expect(scope.resolved_scope.countries.map((item) => item.country_code)).toEqual([
      'DE',
      'AT',
      'CH',
      'BE',
      'NL',
    ]);
    expect(scope.resolved_scope.countries.find((item) => item.country_code === 'CH')).toMatchObject(
      {
        priority: 'primary',
        research_depth: 'deep',
      }
    );
    expect(scope.resolved_scope.excluded_country_codes).toEqual(['LU']);
    expect(scope.resolved_scope.countries.find((item) => item.country_code === 'NL')).toMatchObject(
      { priority: 'primary', research_depth: 'deep' }
    );
    expect(
      createHash('sha256')
        .update(JSON.stringify(marketScopeHashPayload(scope)))
        .digest('hex')
    ).toBe('d1c98a610cc7c25c15640a95213586c2cd62950dca66a948643fd12c499d76a4');
  });

  it.each([
    ['DACH excluding Switzerland prioritising Germany', ['DE', 'AT']],
    ['DACH prioritising Germany excluding Switzerland', ['DE', 'AT']],
  ])('parses modifier order without changing semantics: %s', (expression, expected) => {
    const scope = resolveMarketExpression(expression);
    expect(scope.resolved_scope.countries.map((item) => item.country_code)).toEqual(expected);
    expect(scope.resolved_scope.excluded_country_codes).toEqual(['CH']);
    expect(scope.resolved_scope.countries[0]).toMatchObject({
      country_code: 'DE',
      priority: 'primary',
    });
  });

  it.each([
    ['Southeast Asia', 11, false],
    ['ASEAN', 11, false],
    ['Southern Europe', 16, true],
    ['European Union', 27, false],
    ['EEA', 30, false],
  ])(
    'expands broad market definition %s exactly',
    (expression, expectedCount, needsConfirmation) => {
      const scope = resolveMarketExpression(expression);
      expect(scope.resolved_scope.countries).toHaveLength(expectedCount);
      expect(scope.confirmation.required).toBe(needsConfirmation);
    }
  );

  it('supports explicit localities without treating a city as a country', () => {
    const scope = resolveMarketExpression('Tallinn, Estonia + Riga, Latvia');
    expect(scope.resolved_scope.countries).toEqual([
      expect.objectContaining({ country_code: 'EE', localities: ['Tallinn'] }),
      expect.objectContaining({ country_code: 'LV', localities: ['Riga'] }),
    ]);
  });

  it('requires a definition choice for ambiguous SEA', () => {
    const scope = resolveMarketExpression('SEA');
    expect(marketScopeReady(scope)).toBe(false);
    expect(marketScopeChoices(scope).map((item) => item.label)).toEqual([
      'Southeast Asia',
      'ASEAN',
    ]);
  });

  it('requires explicit confirmation for proposed market definitions', () => {
    const scope = resolveMarketExpression('Balkans');
    expect(scope.resolved_scope.countries.length).toBeGreaterThan(5);
    expect(marketScopeReady(scope)).toBe(false);
    expect(marketScopeReady(confirmMarketScope(scope))).toBe(true);
  });

  it('fails closed on an unknown location instead of routing to a default market', () => {
    const scope = resolveMarketExpression('Somewhere convenient');
    expect(scope.resolved_scope.countries).toEqual([]);
    expect(scope.ambiguities).toHaveLength(1);
    expect(marketScopeReady(scope)).toBe(false);
  });

  it('does not infer a country from a city name alone', () => {
    const scope = resolveMarketExpression('Tallinn');
    expect(scope.resolved_scope.countries).toEqual([]);
    expect(scope.ambiguities[0].raw_expression).toBe('Tallinn');
    expect(marketScopeReady(scope)).toBe(false);
  });
});
