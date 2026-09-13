/**
 * The two lines under a chat message: when it was said, to the second.
 *
 * The two threads store their timestamps differently - the assistant keeps an
 * ISO string on `msg.time`, a goal keeps epoch milliseconds on `message.at` -
 * so this takes either and both threads read the same.
 *
 * Local time on purpose. A conversation is read where it happened; UTC would be
 * correct and useless.
 */

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {string|number|Date|null|undefined} value
 * @returns {{ time: string, date: string }|null} `hh:mm:ss` and `dd.mm.yyyy`,
 *   or null for anything that is not a usable instant.
 */
export function messageStamp(value) {
  if (value === null || value === undefined || value === '') return null;

  let input = value;
  // Epoch milliseconds sometimes arrive as a string; Date would read those
  // digits as a year and hand back something plausible but wrong.
  if (typeof input === 'string' && /^\d+$/.test(input)) input = Number(input);

  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;

  return {
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
  };
}

export default messageStamp;
