// Gives the two Generalist cohorts separate class recordings. Dry run by default.
//
//   node scripts/separateGeneralistDrives.js            # shows what would change
//   node scripts/separateGeneralistDrives.js --apply    # needs CONFIRM_DB
//
// Two writes, both for the same reason (utils/classLinks.js):
//
//   AI Generalist · Nov 2026   takes its Drive as "none yet", so its students
//                              stop opening September's folder. Its own link
//                              goes on the batch page when there is one.
//   Weeks 5 and 6              their class lessons get the folder Weeks 1-4
//                              already use, so September has all six weeks.
//
// Only fills empty slots, and only touches a batch whose Drive was never set,
// so a re-run changes nothing and a link pasted since is left alone.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { titleQuery, PROGRAMME_TITLES } from '../utils/programmes.js';
import { assertSeedTarget } from './seedGuard.js';

const APPLY = process.argv.includes('--apply');
const NOV_BATCH = 'AI Generalist · Nov 2026';
const CLASS_CHAPTER = /^S[12] · Week [56]:/;

async function run() {
  await connectDb();
  if (APPLY) assertSeedTarget('separateGeneralistDrives --apply', 'It edits one batch and four lessons of the Generalist curriculum.');

  const batch = await Batch.findOne({ name: NOV_BATCH });
  if (!batch) throw new Error(`No batch called "${NOV_BATCH}".`);
  const program = await Program.findOne(titleQuery(PROGRAMME_TITLES.generalist));
  if (!program) throw new Error('No Generalist programme.');

  if (batch.classDriveUrl == null) {
    console.log(`${NOV_BATCH}: Drive set to none yet`);
    if (APPLY) await Batch.updateOne({ _id: batch._id }, { $set: { classDriveUrl: '' } });
  } else {
    console.log(`${NOV_BATCH}: already "${batch.classDriveUrl}", left alone`);
  }

  // Read from the lessons rather than written here: anyone holding this link
  // can open the recordings, so it stays out of git.
  const links = new Set(program.modules.flatMap((m) => (m.chapters || []).flatMap((c) => (c.topics || []).map((t) => t.classLink))).filter(Boolean));
  if (links.size !== 1) throw new Error(`Expected one Drive on the lessons, found ${links.size}.`);
  const [septDrive] = links;

  // In place, never p.modules = …, which would re-mint every lesson id.
  let filled = 0;
  for (const mod of program.modules) {
    for (const chapter of mod.chapters || []) {
      if (!CLASS_CHAPTER.test(chapter.title)) continue;
      for (const topic of chapter.topics || []) {
        if (topic.classLink) { console.log(`  has a link already: ${chapter.title}`); continue; }
        topic.classLink = septDrive;
        filled += 1;
        console.log(`  link added: ${chapter.title} / ${topic.title}`);
      }
    }
  }
  if (APPLY && filled) await program.save();

  console.log(`\n${filled} lesson${filled === 1 ? '' : 's'} to fill.`);
  if (!APPLY) console.log('Dry run. Nothing was written. Re-run with --apply (and CONFIRM_DB) to write.');
}

run()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
