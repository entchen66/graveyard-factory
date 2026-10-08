// Writes the change log for the published site from the git history:
//   node tools/build-changelog.js _site/changelog.json
// Run by the Pages workflow (which needs the full history); not part of the app.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { parseGitLog } from '../src/changelog.js';

const out = process.argv[2];
if (!out) throw new Error('usage: node tools/build-changelog.js <output.json>');
const log = execFileSync('git', ['log', '--no-merges', '--date=short', '--format=%H%x09%ad%x09%s'], { encoding: 'utf8' });
const entries = parseGitLog(log);
fs.writeFileSync(out, JSON.stringify({ entries }));
console.log(`changelog: ${entries.length} commits`);
