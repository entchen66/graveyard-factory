// @ts-check
// The change log shown on the published page: commits grouped by day, and
// which of them a visitor hasn't seen yet. No DOM, so tests can use it.

/** @typedef {{ hash: string, date: string, subject: string }} ChangeEntry newest first */
/** @typedef {{ date: string, entries: ChangeEntry[] }} ChangeDay */

/** How many entries to show on a first visit, or when the last-seen commit isn't in the list (history was rewritten). */
const FALLBACK_COUNT = 15;

/**
 * Parse `git log --no-merges --format=%H%x09%ad%x09%s --date=short` output.
 * @param {string} text
 * @returns {ChangeEntry[]}
 */
export function parseGitLog(text) {
  /** @type {ChangeEntry[]} */
  const out = [];
  for (const line of text.split('\n')) {
    const [hash, date, ...rest] = line.split('\t');
    const subject = rest.join('\t').trim();
    if (hash && date && subject) out.push({ hash, date, subject });
  }
  return out;
}

/**
 * Entries after the last one the visitor saw (the latest few if never seen).
 * @param {ChangeEntry[]} entries newest first
 * @param {string | null} seenHash
 * @returns {ChangeEntry[]}
 */
export function unseenEntries(entries, seenHash) {
  const i = seenHash ? entries.findIndex((e) => e.hash === seenHash) : -1;
  return i < 0 ? entries.slice(0, FALLBACK_COUNT) : entries.slice(0, i);
}

/**
 * @param {ChangeEntry[]} entries newest first
 * @returns {ChangeDay[]} newest day first, commit order kept within a day
 */
export function groupByDay(entries) {
  /** @type {ChangeDay[]} */
  const days = [];
  for (const e of entries) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else days.push({ date: e.date, entries: [e] });
  }
  return days;
}
