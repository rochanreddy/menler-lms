// Give a name to every account that has none, where its email spells one.
//
// Students enrolled through a batch's "New paid student" box were created from
// an email alone (the box had no name field), so the admin's Students list
// shows them as "-". Most of those addresses are the name already:
// vanshika.madan26m@iimranchi.ac.in is Vanshika Madan. This reads them back
// with the same rule new accounts now use (utils/names.js).
//
// An address that does not spell a name (aryaagrim13@gmail.com) is listed and
// left alone: type it on the Students page, where a nameless row has an
// "Add name" box. A name somebody already set is never touched.
//
//   node scripts/fillMissingNames.js                        # dry run
//   CONFIRM_DB=menler node scripts/fillMissingNames.js --apply
//
// Idempotent: a second run finds only the addresses it could not read.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { nameFromEmail } from '../utils/names.js';

const APPLY = process.argv.includes('--apply');
const NAMELESS = { $or: [{ fullName: '' }, { fullName: null }, { fullName: /^\s+$/ }] };

async function main() {
  await connectDb();
  const dbName = mongoose.connection.name;
  if (APPLY && (process.env.CONFIRM_DB || '').trim() !== dbName) {
    console.error(`\n✗ Connected to "${dbName}" but CONFIRM_DB is "${process.env.CONFIRM_DB || ''}". Set CONFIRM_DB=${dbName} to apply.\n`);
    process.exit(1);
  }

  const nameless = await User.find(NAMELESS)
    .select('email role fullName')
    .sort({ role: 1, email: 1 });
  const plan = nameless.map((u) => ({ u, to: nameFromEmail(u.email) }));
  const named = plan.filter((r) => r.to);
  const left = plan.filter((r) => !r.to);

  console.log(`\n${dbName}: ${nameless.length} account(s) with no name`);
  if (!nameless.length) {
    console.log('  Every account has a name.\n');
    await mongoose.disconnect();
    return;
  }
  const w = Math.max(...plan.map((r) => r.u.email.length));
  for (const r of named) console.log(`  ${r.u.role.padEnd(7)} ${r.u.email.padEnd(w)}  →  ${r.to}`);
  if (left.length) {
    console.log(`\n  ${left.length} address(es) do not spell a name. Type these on the Students page:`);
    for (const r of left) console.log(`  ${r.u.role.padEnd(7)} ${r.u.email}`);
  }

  if (!APPLY) {
    if (named.length) console.log(`\n  Dry run. Re-run with:  CONFIRM_DB=${dbName} node scripts/fillMissingNames.js --apply\n`);
    else console.log('');
  } else {
    let n = 0;
    for (const r of named) {
      // Filtered on the name still being empty, so an admin who typed one in
      // while this ran keeps theirs.
      const res = await User.updateOne({ _id: r.u._id, ...NAMELESS }, { $set: { fullName: r.to } });
      n += res.modifiedCount;
    }
    console.log(`\n  ✓ Named ${n} account(s).\n`);
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
