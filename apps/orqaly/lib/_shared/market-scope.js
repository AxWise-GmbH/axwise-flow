/**
 * Deterministic market-scope resolver shared by the Smart Request UI and API.
 *
 * Language models may suggest a selector, but membership is expanded only by
 * this versioned catalogue or an explicit country list. Ambiguous geography is
 * returned as a confirmation request instead of being guessed silently.
 */

export const MARKET_SCOPE_SCHEMA_VERSION = 'market_scope_v2';
export const MARKET_TAXONOMY_VERSION = 'axwise-market-groups-2026-08';

const ISO_CODES =
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(
    ' '
  );

export const MARKET_GROUPS = Object.freeze({
  'business_region:benelux': group('BENELUX', 'business_region', ['benelux'], ['BE', 'NL', 'LU']),
  'business_region:dach': group('DACH', 'business_region', ['dach', 'd-a-ch'], ['DE', 'AT', 'CH']),
  'business_region:dachli': group(
    'DACHLI',
    'business_region',
    ['dachli', 'dach+', 'dach plus liechtenstein'],
    ['DE', 'AT', 'CH', 'LI']
  ),
  'business_region:baltics': group(
    'Baltics',
    'business_region',
    ['baltics', 'baltic states', 'baltic countries'],
    ['EE', 'LV', 'LT']
  ),
  'business_region:nordics': group(
    'Nordics',
    'business_region',
    ['nordics', 'nordic countries', 'nordic region'],
    ['DK', 'FI', 'IS', 'NO', 'SE']
  ),
  'geographic_region:southeast_asia': group(
    'Southeast Asia',
    'geographic_region',
    ['southeast asia', 'south east asia'],
    ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'TL', 'VN'],
    'versioned'
  ),
  'economic_bloc:asean': group(
    'ASEAN',
    'economic_bloc',
    ['asean'],
    ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'TL', 'VN'],
    'versioned'
  ),
  'geographic_region:southern_europe_un_m49': group(
    'Southern Europe (UN M49)',
    'geographic_region',
    ['southern europe', 'south europe'],
    [
      'AL',
      'AD',
      'BA',
      'HR',
      'GI',
      'GR',
      'VA',
      'IT',
      'MT',
      'ME',
      'MK',
      'PT',
      'SM',
      'RS',
      'SI',
      'ES',
    ],
    'versioned',
    true
  ),
  'geographic_region:balkans_proposed': group(
    'Balkans (proposed commercial scope)',
    'geographic_region',
    ['balkans', 'balkan countries', 'balkan region'],
    ['AL', 'BA', 'BG', 'HR', 'GR', 'XK', 'ME', 'MK', 'RO', 'RS', 'SI'],
    'user_confirmed',
    true
  ),
  'economic_bloc:eu': group(
    'European Union',
    'economic_bloc',
    ['eu', 'european union', 'eu27'],
    [
      'AT',
      'BE',
      'BG',
      'HR',
      'CY',
      'CZ',
      'DK',
      'EE',
      'FI',
      'FR',
      'DE',
      'GR',
      'HU',
      'IE',
      'IT',
      'LV',
      'LT',
      'LU',
      'MT',
      'NL',
      'PL',
      'PT',
      'RO',
      'SK',
      'SI',
      'ES',
      'SE',
    ],
    'versioned'
  ),
  'economic_bloc:efta': group(
    'EFTA',
    'economic_bloc',
    ['efta'],
    ['IS', 'LI', 'NO', 'CH'],
    'versioned'
  ),
  'regulatory_area:eea': group(
    'European Economic Area',
    'regulatory_area',
    ['eea', 'european economic area'],
    [
      'AT',
      'BE',
      'BG',
      'HR',
      'CY',
      'CZ',
      'DK',
      'EE',
      'FI',
      'FR',
      'DE',
      'GR',
      'HU',
      'IE',
      'IT',
      'LV',
      'LT',
      'LU',
      'MT',
      'NL',
      'PL',
      'PT',
      'RO',
      'SK',
      'SI',
      'ES',
      'SE',
      'IS',
      'LI',
      'NO',
    ],
    'versioned'
  ),
});

export const AMBIGUOUS_MARKET_ALIASES = Object.freeze({
  sea: ['geographic_region:southeast_asia', 'economic_bloc:asean'],
  'south east asian markets': ['geographic_region:southeast_asia', 'economic_bloc:asean'],
});

function group(
  label,
  groupType,
  aliases,
  members,
  membershipPolicy = 'fixed',
  requiresConfirmation = false
) {
  return Object.freeze({
    label,
    group_type: groupType,
    aliases,
    members,
    membership_policy: membershipPolicy,
    requires_confirmation: requiresConfirmation,
  });
}

function normal(value) {
  return String(value || '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function displayName(code) {
  if (code === 'XK') return 'Kosovo';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

const COUNTRY_ALIASES = Object.freeze({
  uk: 'GB',
  'u k': 'GB',
  usa: 'US',
  'u s a': 'US',
  'u s': 'US',
  'united states of america': 'US',
  'south korea': 'KR',
  'north korea': 'KP',
  russia: 'RU',
  vietnam: 'VN',
});

let countryLookup;
function countries() {
  if (countryLookup) return countryLookup;
  countryLookup = new Map();
  for (const code of ISO_CODES) {
    countryLookup.set(normal(code), code);
    countryLookup.set(normal(displayName(code)), code);
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) countryLookup.set(alias, code);
  return countryLookup;
}

function countryCode(value) {
  return countries().get(normal(String(value || '').replace(/[.]+$/g, ''))) || null;
}

function marketGroup(value) {
  const key = normal(value);
  return Object.entries(MARKET_GROUPS).find(([, definition]) =>
    [definition.label, ...definition.aliases].some((candidate) => normal(candidate) === key)
  );
}

function splitExpressions(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  const localityParts = text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    localityParts.length === 2 &&
    !countryCode(localityParts[0]) &&
    countryCode(localityParts[1])
  ) {
    return [text];
  }
  if (/\+|;|\band\b/i.test(text)) {
    return text.split(/\s*(?:\+|;|\band\b)\s*/i).flatMap((item) => splitExpressions(item));
  }
  if (countryCode(text) || marketGroup(text) || AMBIGUOUS_MARKET_ALIASES[normal(text)])
    return [text];
  return text
    .split(/\s*,\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveMarketExpression(rawInput, { coverageMode = 'weighted' } = {}) {
  const raw = String(rawInput || '').trim();
  if (!raw) return null;
  let base = raw;
  let exclusions = '';
  let priorities = '';
  const modifierPattern =
    /\b(excluding|exclude|except|without|prioritize|prioritise|prioritized|prioritised|prioritizing|prioritising|primarily|especially|focus on|focused on)\b/gi;
  const modifiers = [...base.matchAll(modifierPattern)];
  if (modifiers.length) {
    const original = base;
    base = original.slice(0, modifiers[0].index).replace(/[\s,;]+$/g, '');
    modifiers.forEach((match, index) => {
      const value = original
        .slice((match.index || 0) + match[0].length, modifiers[index + 1]?.index)
        .replace(/^[\s,;]+|[\s,;]+$/g, '');
      if (/^(excluding|exclude|except|without)$/i.test(match[1])) exclusions = value;
      else priorities = value;
    });
  }

  const included = new Map();
  const excluded = [];
  const selectors = [];
  const ambiguities = [];
  let confirmationRequired = false;

  const resolvePart = (part, operation) => {
    const ambiguous = AMBIGUOUS_MARKET_ALIASES[normal(part)];
    if (ambiguous) {
      ambiguities.push({
        raw_expression: part,
        candidate_group_ids: ambiguous,
        reason: 'named market expression has multiple recognized definitions',
      });
      confirmationRequired = true;
      return;
    }
    const matchedGroup = marketGroup(part);
    const localityParts = String(part)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const localityCountry =
      localityParts.length === 2 && !countryCode(localityParts[0])
        ? countryCode(localityParts[1])
        : null;
    const locality = localityCountry ? localityParts[0] : null;
    const matchedCountry = localityCountry || countryCode(part);
    let codes;
    if (matchedGroup) {
      const [groupId, definition] = matchedGroup;
      codes = definition.members;
      selectors.push({
        operation,
        kind: 'named_group',
        group_id: groupId,
        country_codes: codes,
        raw_expression: part,
        confidence: 1,
      });
      confirmationRequired ||= definition.requires_confirmation;
    } else if (matchedCountry) {
      codes = [matchedCountry];
      selectors.push({
        operation,
        kind: 'countries',
        group_id: null,
        country_codes: codes,
        raw_expression: part,
        confidence: 1,
      });
    } else {
      ambiguities.push({
        raw_expression: part,
        candidate_group_ids: [],
        reason: 'market expression needs a country or recognized market definition',
      });
      confirmationRequired = true;
      return;
    }
    for (const code of codes) {
      if (operation === 'exclude') {
        if (!excluded.includes(code)) excluded.push(code);
        included.delete(code);
      } else {
        const existing = included.get(code);
        const primary = operation === 'prioritize' || existing?.priority === 'primary';
        included.set(code, {
          country_code: code,
          country_name: displayName(code),
          priority: primary ? 'primary' : 'standard',
          localities: locality && code === localityCountry ? [locality] : [],
          research_depth: primary ? 'deep' : 'standard',
        });
      }
    }
  };

  splitExpressions(base).forEach((part) => resolvePart(part, 'include'));
  splitExpressions(exclusions).forEach((part) => resolvePart(part, 'exclude'));
  splitExpressions(priorities).forEach((part) => resolvePart(part, 'prioritize'));
  excluded.forEach((code) => included.delete(code));

  return {
    schema_version: MARKET_SCOPE_SCHEMA_VERSION,
    raw_input: raw,
    selectors,
    resolved_scope: {
      countries: [...included.values()],
      excluded_country_codes: excluded,
      coverage_mode: coverageMode,
    },
    ambiguities,
    taxonomy_versions: {
      countries: 'iso3166',
      market_groups: MARKET_TAXONOMY_VERSION,
    },
    confirmation: {
      required: confirmationRequired,
      confirmed: false,
      reason: confirmationRequired
        ? 'Confirm the exact country expansion before grounded research'
        : null,
    },
  };
}

export function confirmMarketScope(scope) {
  if (!scope) return null;
  return {
    ...scope,
    confirmation: { ...scope.confirmation, confirmed: true },
  };
}

export function marketScopeReady(scope) {
  return Boolean(
    scope?.resolved_scope?.countries?.length &&
    (!scope.confirmation?.required || scope.confirmation?.confirmed) &&
    !(scope.ambiguities || []).length
  );
}

export function marketScopeChoices(scope) {
  const ids = new Set((scope?.ambiguities || []).flatMap((item) => item.candidate_group_ids || []));
  return [...ids].map((id) => ({ id, ...MARKET_GROUPS[id] })).filter((item) => item.label);
}

export function marketScopeHashPayload(scope) {
  if (!scope) return null;
  const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value)
      .filter((key) => !['resolution_hash', 'confirmation'].includes(key))
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalize(value[key]);
        return result;
      }, {});
  };
  return canonicalize(scope);
}
