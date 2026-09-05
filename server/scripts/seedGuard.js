// The rail that stops a fixture seed landing on real students.
//
// This exists because it already happened: `npm run seed:full` was run with
// the default MONGODB_URI, which points at the live database, and it replaced
// the launch cohorts with sixteen invented students mid-course. Nothing in the
// script objected, because nothing in the script knew where it was.
//
// The rule: a script that rewrites or deletes other people's data runs freely
// against a database whose name ends in `_test`, and against anything else
// only when the operator names that database in CONFIRM_DB. Naming it is the
// point — it cannot be satisfied by a stale env var or a copied command line,
// only by someone who looked at where they were pointing.
import mongoose from 'mongoose';

const isScratch = (name) => /_test$/.test(name);

/**
 * Abort unless the connected database is a scratch one or explicitly named.
 * Call it AFTER connectDb(), so it judges the connection rather than the URI.
 * @param {string} script  how to refer to this script in the error
 * @param {string} what    one line on what it is about to do
 */
export function assertSeedTarget(script, what) {
  const name = mongoose.connection.name;
  if (isScratch(name)) return name;
  if (process.env.CONFIRM_DB === name) {
    console.log(`\n⚠  ${script} is running against "${name}", NOT a _test database. CONFIRM_DB says that is deliberate.\n`);
    return name;
  }
  console.error(`
✗ Refusing to run ${script} against "${name}".

  ${what}

  "${name}" is not a scratch database (those end in _test), so this is very
  likely the live one. Two ways forward:

    • Point at the scratch database, which is what you almost certainly want:
        MONGODB_URI="<same URI, /${name} → /${name}_test>" npm run <script>

    • Or, if you really do mean this database, name it:
        CONFIRM_DB=${name} npm run <script>
`);
  process.exit(1);
}
