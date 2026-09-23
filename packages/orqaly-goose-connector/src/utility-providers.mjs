const CONDITIONS = new Map([
  [0, 'Clear sky'], [1, 'Mainly clear'], [2, 'Partly cloudy'], [3, 'Overcast'],
  [45, 'Fog'], [48, 'Rime fog'], [51, 'Light drizzle'], [53, 'Moderate drizzle'],
  [55, 'Dense drizzle'], [56, 'Light freezing drizzle'], [57, 'Dense freezing drizzle'],
  [61, 'Light rain'], [63, 'Moderate rain'], [65, 'Heavy rain'], [66, 'Light freezing rain'],
  [67, 'Heavy freezing rain'], [71, 'Light snow'], [73, 'Moderate snow'],
  [75, 'Heavy snow'], [77, 'Snow grains'], [80, 'Light rain showers'],
  [81, 'Moderate rain showers'], [82, 'Violent rain showers'], [85, 'Light snow showers'],
  [86, 'Heavy snow showers'], [95, 'Thunderstorm'], [96, 'Thunderstorm with light hail'],
  [99, 'Thunderstorm with heavy hail'],
]);
const AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const CODE = /^[A-Z]{3}$/;
const MAX_BODY_BYTES = 1_048_576;
const MAX_CACHE_ENTRIES = 256;
const DAY_MS = 86_400_000;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export class UtilityLookupError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const invalid = (message = 'The provider returned unusable data.') =>
  new UtilityLookupError('PROVIDER_INVALID', message);
const finite = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid();
  return value;
};
const displayNumber = (value, places = 2) => {
  const rounded = Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;
  return String(rounded);
};
const temperature = (value, unit) => {
  const number = finite(value);
  const [low, high] = unit === 'C' ? [-100, 70] : [-148, 158];
  if (number < low || number > high) throw invalid();
  return displayNumber(number);
};
const condition = (value) => {
  if (!Number.isInteger(value) || !CONDITIONS.has(value)) throw invalid();
  return CONDITIONS.get(value);
};
const fold = (value) => value.toLocaleLowerCase('en').normalize('NFKD').replace(/\p{M}/gu, '').trim();
const text = (value, maximum = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f]/.test(value))
    throw invalid();
  return value.trim();
};
const source = (title, url) => ({ title, url });

function decimalParts(value) {
  const match = String(value).match(/^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) throw invalid();
  const exponent = Number(match[4] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) throw invalid();
  const coefficient = BigInt(`${match[1]}${match[2]}${match[3] || ''}`);
  const scale = (match[3] || '').length - exponent;
  return scale < 0 ? { coefficient: coefficient * 10n ** BigInt(-scale), scale: 0 }
    : { coefficient, scale };
}

function decimalText(coefficient, scale, maximumPlaces = 12) {
  if (scale > maximumPlaces) {
    const divisor = 10n ** BigInt(scale - maximumPlaces);
    let quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    if (remainder * 2n > divisor || (remainder * 2n === divisor && quotient % 2n !== 0n)) quotient++;
    coefficient = quotient;
    scale = maximumPlaces;
  }
  if (scale === 0) return String(coefficient);
  const digits = String(coefficient).padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '');
}

function dateInZone(date, timezone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
  } catch { throw invalid(); }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function selectPlace(location, data) {
  const rows = object(data) ? data.results ?? [] : null;
  if (!Array.isArray(rows)) throw invalid();
  const seen = new Set();
  const usable = [];
  for (const row of rows) {
    if (!object(row) || typeof row.name !== 'string') continue;
    const latitude = finite(row.latitude), longitude = finite(row.longitude);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw invalid();
    const coordinates = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    if (!seen.has(coordinates)) { seen.add(coordinates); usable.push(row); }
  }
  const [placeName, ...regions] = location.split(',').map((part) => part.trim()).filter(Boolean);
  const target = fold(placeName);
  let exact = usable.filter((row) => fold(row.name) === target
    || (Array.isArray(row.postcodes) && row.postcodes.includes(placeName)));
  if (regions.length) {
    exact = exact.filter((row) => regions.every((region) =>
      ['admin1', 'admin2', 'country', 'country_code'].some((key) =>
        typeof row[key] === 'string' && fold(row[key]) === fold(region))));
    if (!exact.length)
      throw new UtilityLookupError('LOCATION_NOT_FOUND', 'I could not find that location.');
  }
  const choices = [...(exact.length ? exact : usable)];
  if (!choices.length) throw new UtilityLookupError('LOCATION_NOT_FOUND', 'I could not find that location.');
  const population = (row) => Number.isInteger(row.population) && row.population >= 0 ? row.population : 0;
  choices.sort((a, b) => population(b) - population(a));
  if (choices.length > 1 && !(exact.length && population(choices[0]) >= 100_000
    && population(choices[0]) >= 10 * Math.max(1, population(choices[1])))) {
    throw new UtilityLookupError('LOCATION_AMBIGUOUS', 'Several places match that location. Add a region or country.');
  }
  const picked = choices[0];
  const timezone = text(picked.timezone, 120);
  dateInZone(new Date(), timezone);
  return {
    latitude: picked.latitude, longitude: picked.longitude, timezone,
    name: [...new Set(['name', 'admin1', 'country'].map((key) => picked[key])
      .filter((value) => typeof value === 'string' && value.trim()).map((value) => text(value)))].join(', '),
  };
}

async function boundedJson(fetchImpl, url, signal) {
  if (signal.aborted) throw new UtilityLookupError('DEADLINE', 'The public data source did not respond in time.');
  if (url.protocol !== 'https:' || ![
    'geocoding-api.open-meteo.com', 'api.open-meteo.com', 'api.frankfurter.dev',
  ].includes(url.hostname) || url.username || url.password || url.hash) throw invalid();
  let response;
  try { response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal }); }
  catch (error) {
    if (signal.aborted) throw new UtilityLookupError('DEADLINE', 'The public data source did not respond in time.');
    throw new UtilityLookupError('PROVIDER_UNAVAILABLE', 'The public data source is unavailable.');
  }
  if (signal.aborted) throw new UtilityLookupError('DEADLINE', 'The public data source did not respond in time.');
  if ([400, 404, 422].includes(response.status))
    throw new UtilityLookupError('PROVIDER_NO_DATA', 'The public data source has no matching data.');
  if (!response.ok || response.redirected) throw new UtilityLookupError('PROVIDER_UNAVAILABLE', 'The public data source is unavailable.');
  if (!response.headers.get('content-type')?.includes('application/json')) throw invalid();
  const claimed = Number(response.headers.get('content-length'));
  if (Number.isFinite(claimed) && claimed > MAX_BODY_BYTES) throw invalid();
  let bytes = 0;
  const chunks = [];
  if (!response.body) throw invalid();
  const reader = response.body.getReader();
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw invalid();
      chunks.push(value);
    }
  } catch (error) {
    if (signal.aborted) throw new UtilityLookupError('DEADLINE', 'The public data source did not respond in time.');
    throw error;
  } finally { await reader.cancel().catch(() => {}); }
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  try { return JSON.parse(body); } catch { throw invalid(); }
}

function cacheRead(cache, key, clock, fresh) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires <= clock() || !fresh(entry.value)) { cache.delete(key); return null; }
  cache.delete(key); cache.set(key, entry);
  return { ...entry.value, cacheHit: true };
}
function cacheWrite(cache, key, value, ttl, clock) {
  if (ttl <= 0) return;
  cache.delete(key); cache.set(key, { expires: clock() + ttl * 1000, value });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

export function createUtilityProviders({ fetchImpl = fetch, now = () => new Date(),
  clock = () => performance.now(), weatherTtlSeconds = 300, currencyTtlSeconds = 900 } = {}) {
  if (![weatherTtlSeconds, currencyTtlSeconds].every((ttl) => Number.isFinite(ttl) && ttl >= 0 && ttl <= 3600))
    throw new Error('Invalid utility cache TTL');
  const cache = new Map(), geocache = new Map();
  const present = () => {
    const value = now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error('Invalid utility clock');
    return value;
  };
  const deadline = (signal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);

  async function geocode(location, signal) {
    signal.throwIfAborted();
    const key = `geo:${fold(location)}`;
    const saved = cacheRead(geocache, key, clock, () => true);
    if (saved) return saved;
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: location.split(',')[0].trim(), count: '10', language: 'en' }).toString();
    const place = selectPlace(location, await boundedJson(fetchImpl, url, signal));
    cacheWrite(geocache, key, place, 3600, clock);
    return place;
  }

  async function weather(location, temperatureUnit = 'C', signal) {
    signal?.throwIfAborted();
    if (typeof location !== 'string' || !location.trim() || location.length > 500
      || !['C', 'F'].includes(temperatureUnit))
      throw new UtilityLookupError('INVALID_INPUT', 'Use a city or region and C or F temperature units.');
    const normalized = location.replace(/\s+/g, ' ').trim();
    const key = `weather:${fold(normalized)}:${temperatureUnit}`;
    const cached = cacheRead(cache, key, clock, (value) => {
      const age = present().getTime() - Date.parse(value.presentation.observedAt);
      return age >= -600_000 && age <= 7_200_000
        && dateInZone(present(), value.timezone) === value.localDate;
    });
    if (cached) return cached;
    const requestSignal = deadline(signal);
    const place = await geocode(normalized, requestSignal);
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: String(place.latitude), longitude: String(place.longitude),
      current: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code',
      timezone: 'auto', timeformat: 'unixtime', forecast_days: '7',
      temperature_unit: temperatureUnit === 'C' ? 'celsius' : 'fahrenheit',
    }).toString();
    const data = await boundedJson(fetchImpl, url, requestSignal);
    if (!object(data) || !object(data.current) || !object(data.daily)
      || !object(data.current_units) || !object(data.daily_units)
      || data.current_units.temperature_2m !== `°${temperatureUnit}`
      || data.daily_units.temperature_2m_max !== `°${temperatureUnit}`
      || data.daily_units.temperature_2m_min !== `°${temperatureUnit}`)
      throw invalid();
    const timezone = text(data.timezone, 120);
    if (timezone !== place.timezone) throw invalid();
    const observed = new Date(finite(data.current.time) * 1000);
    if (!Number.isFinite(observed.getTime())) throw invalid();
    const age = present().getTime() - observed.getTime();
    if (age < -600_000 || age > 7_200_000) throw new UtilityLookupError('STALE', 'The weather source returned old data.');
    const localDate = dateInZone(present(), timezone);
    const daily = data.daily;
    if (!['time', 'weather_code', 'temperature_2m_max', 'temperature_2m_min']
      .every((key) => Array.isArray(daily[key]))) throw invalid();
    const forecast = [];
    const seen = new Set();
    for (let index = 0; index < Math.min(7, daily.time.length); index++) {
      const date = new Date(finite(daily.time[index]) * 1000);
      if (!Number.isFinite(date.getTime())) throw invalid();
      const label = dateInZone(date, timezone);
      const offset = (Date.parse(`${label}T00:00:00Z`) - Date.parse(`${localDate}T00:00:00Z`)) / DAY_MS;
      if (!Number.isInteger(offset) || offset < 0 || offset > 6 || seen.has(label)) continue;
      seen.add(label);
      const high = temperature(daily.temperature_2m_max[index], temperatureUnit);
      const low = temperature(daily.temperature_2m_min[index], temperatureUnit);
      if (Number(high) < Number(low)) throw invalid();
      forecast.push({ label, condition: condition(daily.weather_code[index]), high, low });
    }
    if (!forecast.length) throw invalid();
    const today = forecast.find((item) => item.label === localDate);
    const citation = source('Open-Meteo · weather model', url.toString());
    const presentation = {
      schemaVersion: 'axwise.presentation.weather.v1', kind: 'weather',
      location: text(place.name), observedAt: observed.toISOString(),
      temperatureUnit, temperature: temperature(data.current.temperature_2m, temperatureUnit),
      condition: condition(data.current.weather_code),
      ...(today ? { high: today.high, low: today.low } : {}),
      forecast, source: citation,
    };
    const markdown = `Weather in ${presentation.location}: ${presentation.temperature} °${temperatureUnit}, ${presentation.condition.toLowerCase()}. ${forecast.length}-day forecast available. [Open-Meteo](<${citation.url}>).`;
    const value = { presentation, markdown, sources: [citation], timezone, localDate, cacheHit: false };
    cacheWrite(cache, key, value, weatherTtlSeconds, clock);
    return value;
  }

  async function currency(base, quote, amount, signal) {
    signal?.throwIfAborted();
    if (typeof base !== 'string' || typeof quote !== 'string' || typeof amount !== 'string'
      || !CODE.test(base) || !CODE.test(quote) || !AMOUNT.test(amount))
      throw new UtilityLookupError('INVALID_INPUT', 'Use two uppercase currency codes and a nonnegative decimal amount.');
    const key = `currency:${base}:${quote}:${amount}`;
    const cached = cacheRead(cache, key, clock, (value) => {
      const age = present().getTime() - Date.parse(value.presentation.asOf);
      return age > -DAY_MS && age <= 7 * DAY_MS;
    });
    if (cached) return cached;
    const url = new URL(`https://api.frankfurter.dev/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`);
    const data = await boundedJson(fetchImpl, url, deadline(signal));
    if (!object(data) || String(data.base || '').toUpperCase() !== base
      || String(data.quote || '').toUpperCase() !== quote) throw invalid();
    const rate = finite(data.rate);
    if (rate < 1e-12 || rate > 1e12 || (base === quote && rate !== 1)) throw invalid();
    if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw invalid();
    const asOf = new Date(`${data.date}T00:00:00Z`);
    if (!Number.isFinite(asOf.getTime()) || asOf.toISOString().slice(0, 10) !== data.date) throw invalid();
    const age = present().getTime() - asOf.getTime();
    if (age <= -DAY_MS || age > 7 * DAY_MS) throw new UtilityLookupError('STALE', 'The reference rate is out of date.');
    const amountParts = decimalParts(amount), rateParts = decimalParts(rate);
    const convertedAmount = decimalText(amountParts.coefficient * rateParts.coefficient,
      amountParts.scale + rateParts.scale);
    const inverseNumerator = 10n ** BigInt(rateParts.scale + 12);
    let inverseQuotient = inverseNumerator / rateParts.coefficient;
    const inverseRemainder = inverseNumerator % rateParts.coefficient;
    if (inverseRemainder * 2n > rateParts.coefficient
      || (inverseRemainder * 2n === rateParts.coefficient && inverseQuotient % 2n !== 0n))
      inverseQuotient++;
    const inverseRate = decimalText(inverseQuotient, 12);
    const citation = source('Frankfurter · daily reference rate', url.toString());
    const presentation = {
      schemaVersion: 'axwise.presentation.currency.v1', kind: 'currency',
      base, quote, amount, convertedAmount, rate: decimalText(rateParts.coefficient, rateParts.scale),
      inverseRate, asOf: asOf.toISOString(), source: citation,
    };
    const markdown = `${amount} ${base} ≈ ${convertedAmount} ${quote} at the ${data.date} daily reference rate. This is not a tradable quote. [Frankfurter](<${citation.url}>).`;
    const value = { presentation, markdown, sources: [citation], cacheHit: false };
    cacheWrite(cache, key, value, currencyTtlSeconds, clock);
    return value;
  }

  return { weather, currency };
}
