import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLog, unseenEntries, groupByDay } from '../src/changelog.js';

const log = ['c\t2026-10-07\tThird\twith a tab', 'b\t2026-10-07\tSecond', 'a\t2026-10-06\tFirst', ''].join('\n');

test('parseGitLog reads hash, date and subject', () => {
  const e = parseGitLog(log);
  assert.equal(e.length, 3);
  assert.deepEqual(e[0], { hash: 'c', date: '2026-10-07', subject: 'Third\twith a tab' });
});

test('unseenEntries returns what is newer than the last seen hash', () => {
  const e = parseGitLog(log);
  assert.deepEqual(unseenEntries(e, 'c'), []);
  assert.deepEqual(unseenEntries(e, 'a').map((x) => x.hash), ['c', 'b']);
  assert.equal(unseenEntries(e, null).length, 3); // first visit: the latest few
  assert.equal(unseenEntries(e, 'gone').length, 3); // unknown hash: same
  const many = Array.from({ length: 40 }, (_, i) => ({ hash: `h${i}`, date: '2026-10-01', subject: 's' }));
  assert.equal(unseenEntries(many, null).length, 15);
});

test('groupByDay groups consecutive entries by date, newest first', () => {
  const days = groupByDay(parseGitLog(log));
  assert.deepEqual(days.map((d) => [d.date, d.entries.length]), [['2026-10-07', 2], ['2026-10-06', 1]]);
});
