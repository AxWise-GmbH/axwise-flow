/*
 * Which version (US or EU) the Legal Center shows. The URL says it when it names one; else
 * the visitor's own earlier click; else DEFAULT_REGION. Where the visitor seems to be may only
 * *suggest* the other version: the EU Geo-blocking Regulation (Art. 3(2)) forbids switching or
 * redirecting by location without the visitor's say.
 *
 * The click is kept in localStorage, and only a click writes it: a setting the visitor asked
 * for, so it needs no consent (German TDDDG § 25(2)). The Cookies & Storage page lists it.
 */
import { useCallback, useState } from 'react';
import { DEFAULT_REGION, isRegion } from './legal.links';

export const REGION_KEY = 'orqanix_legal_region';

export function readSavedRegion() {
  try {
    const value = window.localStorage.getItem(REGION_KEY);
    return isRegion(value) ? value : null;
  } catch {
    return null;
  }
}

function saveRegion(region) {
  try {
    window.localStorage.setItem(REGION_KEY, region);
  } catch {
    // Private windows and blocked storage: the choice simply lasts for this page view.
  }
}

// The time zones of the EEA (the EU with its outermost regions, Iceland, Liechtenstein,
// Norway), the UK and Switzerland. A list, not a prefix: "Europe/" also holds Moscow,
// Minsk and Istanbul, and misses Iceland, the Canaries, Madeira and the Azores.
const EUROPE_ZONES = new Set([
  'Europe/Vienna',
  'Europe/Brussels',
  'Europe/Sofia',
  'Europe/Zagreb',
  'Asia/Nicosia',
  'Asia/Famagusta',
  'Europe/Nicosia',
  'Europe/Prague',
  'Europe/Copenhagen',
  'Europe/Tallinn',
  'Europe/Helsinki',
  'Europe/Mariehamn',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Busingen',
  'Europe/Athens',
  'Europe/Budapest',
  'Europe/Dublin',
  'Europe/Rome',
  'Europe/Riga',
  'Europe/Vilnius',
  'Europe/Luxembourg',
  'Europe/Malta',
  'Europe/Amsterdam',
  'Europe/Warsaw',
  'Europe/Lisbon',
  'Atlantic/Madeira',
  'Atlantic/Azores',
  'Europe/Bucharest',
  'Europe/Bratislava',
  'Europe/Ljubljana',
  'Europe/Madrid',
  'Africa/Ceuta',
  'Atlantic/Canary',
  'Europe/Stockholm',
  'Atlantic/Reykjavik',
  'Europe/Vaduz',
  'Europe/Oslo',
  'Arctic/Longyearbyen',
  'Europe/London',
  'Europe/Belfast',
  'Europe/Zurich',
  'America/Guadeloupe',
  'America/Martinique',
  'America/Cayenne',
  'Indian/Reunion',
  'Indian/Mayotte',
]);

/** Where the browser's clock suggests the visitor is: 'eu', 'us' (every other place), or null. */
export function hintedRegion() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return null;
    return EUROPE_ZONES.has(zone) ? 'eu' : 'us';
  } catch {
    return null;
  }
}

/**
 * `fromUrl` is the region the address names (or null). Returns the region to show, the
 * region to suggest (only before the visitor has ever chosen, and only when it differs),
 * and `choose`, which remembers a click.
 */
export function useLegalRegion(fromUrl) {
  const [saved, setSaved] = useState(readSavedRegion);
  const [hint] = useState(hintedRegion);
  const region = fromUrl ?? saved ?? DEFAULT_REGION;
  const suggest = !saved && hint && hint !== region ? hint : null;
  const choose = useCallback((next) => {
    saveRegion(next);
    setSaved(next);
  }, []);
  return { region, suggest, choose };
}
