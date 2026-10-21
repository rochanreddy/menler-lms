// `npm run dev:test` — the dev server, on the menler_test database.
//
// server/.env points MONGODB_URI at the LIVE database, so a plain `npm run dev`
// is the real cohort: the test accounts on the login page do not exist there,
// and a chat message sent while testing lands in a room real students read
// (rooms are named after the batch id). This starts the same watcher with the
// database name swapped to <name>_test, without editing .env, and refuses to
// start if it cannot tell which database it would be pointed at.
import 'dotenv/config';
import { spawn } from 'node:child_process';

const uri = process.env.MONGODB_URI || '';
const m = uri.match(/^(mongodb(?:\+srv)?:\/\/[^/]+\/)([^/?]+)(.*)$/);
if (!m) {
  console.error('dev:test: MONGODB_URI has no database name to swap; refusing to start.');
  process.exit(1);
}
const db = m[2].endsWith('_test') ? m[2] : `${m[2]}_test`;
console.log(`dev:test: starting on database "${db}"`);

const child = spawn(process.execPath, ['--watch', 'index.js'], {
  stdio: 'inherit',
  env: { ...process.env, MONGODB_URI: `${m[1]}${db}${m[3]}` },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
