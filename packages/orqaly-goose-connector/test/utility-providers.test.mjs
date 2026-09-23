import test from 'node:test';
import assert from 'node:assert/strict';
import { createUtilityProviders, UtilityLookupError } from '../src/utility-providers.mjs';

const at = new Date('2026-09-23T12:00:00.000Z');
const response = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const geocode = (rows = [{
  name: 'Bremen', admin1: 'Bremen', country: 'Germany', latitude: 53.0793,
  longitude: 8.8017, timezone: 'UTC', population: 570_000,
}]) => ({ results: rows });
const forecast = (currentTime = Date.parse('2026-09-23T11:30:00Z') / 1000) => ({
  timezone: 'UTC',
  current_units: { temperature_2m: '°C' },
  daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C' },
  current: { time: currentTime, temperature_2m: 18.4, weather_code: 2 },
  daily: {
    time: Array.from({ length: 7 }, (_, day) => Date.parse(`2026-09-${String(23 + day).padStart(2, '0')}T00:00:00Z`) / 1000),
    temperature_2m_max: [20, 21, 22, 19, 18, 17, 16],
    temperature_2m_min: [9, 10, 11, 8, 7, 6, 5],
    weather_code: [2, 1, 0, 3, 61, 63, 2],
  },
});

test('weather uses only fixed public hosts, yields current plus seven days, and caches fresh results', async () => {
  const calls = [];
  const providers = createUtilityProviders({ now: () => at, clock: () => 1_000,
    fetchImpl: async (url, options) => {
      calls.push([url.toString(), options.redirect, options.method]);
      return response(url.hostname.startsWith('geocoding') ? geocode() : forecast());
    },
  });
  const first = await providers.weather('Bremen');
  const second = await providers.weather('Bremen');
  assert.equal(first.presentation.schemaVersion, 'axwise.presentation.weather.v1');
  assert.equal(first.presentation.temperature, '18.4');
  assert.equal(first.presentation.condition, 'Partly cloudy');
  assert.equal(first.presentation.high, '20');
  assert.equal(first.presentation.forecast.length, 7);
  assert.equal(first.presentation.forecast[6].label, '2026-09-29');
  assert.match(first.markdown, /\[Open-Meteo\]\(<https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  assert.equal(second.cacheHit, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => new URL(call[0]).hostname), [
    'geocoding-api.open-meteo.com', 'api.open-meteo.com',
  ]);
  assert.ok(calls.every((call) => call[1] === 'error' && call[2] === 'GET'));
});

test('weather refuses an ambiguous place instead of guessing a same-named city', async () => {
  const providers = createUtilityProviders({ now: () => at,
    fetchImpl: async () => response(geocode([
      { name: 'Bremen', latitude: 53.07, longitude: 8.8, timezone: 'UTC', population: 100_000 },
      { name: 'Bremen', latitude: 40.0, longitude: -80.0, timezone: 'UTC', population: 90_000 },
    ])),
  });
  await assert.rejects(providers.weather('Bremen'), (error) =>
    error instanceof UtilityLookupError && error.code === 'LOCATION_AMBIGUOUS');
});

test('a city with country qualifier selects the matching place, not a same-named city', async () => {
  const places = geocode([
    { name: 'Bremen', country: 'United States', country_code: 'US', latitude: 40,
      longitude: -80, timezone: 'UTC', population: 110_000 },
    { name: 'Bremen', country: 'Germany', country_code: 'DE', latitude: 53.0793,
      longitude: 8.8017, timezone: 'UTC', population: 100_000 },
  ]);
  let searchedName;
  const providers = createUtilityProviders({ now: () => at,
    fetchImpl: async (url) => {
      if (url.hostname.startsWith('geocoding')) {
        searchedName = url.searchParams.get('name');
        return response(places);
      }
      assert.equal(url.searchParams.get('latitude'), '53.0793');
      return response(forecast());
    },
  });
  const result = await providers.weather('Bremen, Germany');
  assert.equal(searchedName, 'Bremen');
  assert.equal(result.presentation.location, 'Bremen, Germany');
  await assert.rejects(providers.weather('Bremen, Canada'), (error) =>
    error.code === 'LOCATION_NOT_FOUND');
});

test('weather rejects stale current conditions and invalid temperature units', async () => {
  const providers = createUtilityProviders({ now: () => at,
    fetchImpl: async (url) => response(url.hostname.startsWith('geocoding')
      ? geocode() : forecast(Date.parse('2026-09-23T08:00:00Z') / 1000)),
  });
  await assert.rejects(providers.weather('Bremen'), (error) => error.code === 'STALE');
  await assert.rejects(providers.weather('Bremen', 'kelvin'), (error) => error.code === 'INVALID_INPUT');
});

test('currency uses exact decimal multiplication, retains the daily source, and caches result', async () => {
  let calls = 0;
  const providers = createUtilityProviders({ now: () => at, clock: () => 1_000,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.toString(), 'https://api.frankfurter.dev/v2/rate/eur/usd');
      assert.equal(options.redirect, 'error');
      return response({ base: 'EUR', quote: 'USD', rate: 1.25, date: '2026-09-23' });
    },
  });
  const first = await providers.currency('EUR', 'USD', '10.50');
  const second = await providers.currency('EUR', 'USD', '10.50');
  assert.equal(first.presentation.schemaVersion, 'axwise.presentation.currency.v1');
  assert.equal(first.presentation.convertedAmount, '13.125');
  assert.equal(first.presentation.inverseRate, '0.8');
  assert.equal(first.presentation.asOf, '2026-09-23T00:00:00.000Z');
  assert.match(first.markdown, /daily reference rate.*not a tradable quote/i);
  assert.equal(second.cacheHit, true);
  assert.equal(calls, 1);
});

test('currency rejects stale dates, mismatched pairs, and invalid amounts', async () => {
  const providers = createUtilityProviders({ now: () => at,
    fetchImpl: async () => response({ base: 'EUR', quote: 'USD', rate: 1.25, date: '2026-09-01' }),
  });
  await assert.rejects(providers.currency('EUR', 'USD', '1'), (error) => error.code === 'STALE');
  await assert.rejects(providers.currency('EUR', 'USD', '-1'), (error) => error.code === 'INVALID_INPUT');
  await assert.rejects(providers.currency('EUR', 'USD', 10), (error) => error.code === 'INVALID_INPUT');
  await assert.rejects(providers.currency(new String('EUR'), 'USD', '10'), (error) => error.code === 'INVALID_INPUT');
  const mismatch = createUtilityProviders({ now: () => at,
    fetchImpl: async () => response({ base: 'GBP', quote: 'USD', rate: 1.25, date: '2026-09-23' }),
  });
  await assert.rejects(mismatch.currency('EUR', 'USD', '1'), (error) => error.code === 'PROVIDER_INVALID');
});

test('provider responses have a one-megabyte cap and cannot redirect', async () => {
  const providers = createUtilityProviders({ now: () => at,
    fetchImpl: async () => new Response('x'.repeat(1_048_577), {
      headers: { 'content-type': 'application/json' },
    }),
  });
  await assert.rejects(providers.weather('Bremen'), (error) => error.code === 'PROVIDER_INVALID');
});
