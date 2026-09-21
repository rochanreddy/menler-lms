// Put the four recorded masterclasses on the Webinars tab.
//
// These ran before the LMS existed, so there is nothing to schedule — only an
// archive to publish. Each row is a past webinar carrying its Drive recording,
// which is what the page's "Past masterclasses" list is for.
//
//   node scripts/addMasterclassRecordings.js                        # dry run
//   CONFIRM_DB=menler node scripts/addMasterclassRecordings.js --apply
//
// Idempotent on the title: a run that finds all four already there adds
// nothing and notifies nobody, so it is safe to re-run after adding a fifth.
//
// The notification goes to students only — the same rule the webinars route
// follows. A mentor is told about a masterclass in the mentors' channel; the
// bell is the student's.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Webinar } from '../models/Webinar.js';
import { User } from '../models/User.js';
import { notifyMany } from '../utils/notify.js';

const APPLY = process.argv.includes('--apply');

// Drive holds the masters; the LMS holds a link to them. The folder is shared
// "Anyone with the link → Viewer", which is what makes these open for a
// student — a Drive link that is not shared that way silently shows everyone
// but its owner a request-access screen.
const drive = (id) => `https://drive.google.com/file/d/${id}/view`;

// Dated to the day the recordings were filed (6 Sept 2026), an hour apart so
// the archive has a stable order rather than four rows tied on one instant.
// Change a date here and re-run if the real session dates turn up.
const at = (hourIST) => new Date(`2026-09-06T${String(hourIST).padStart(2, '0')}:00:00+05:30`);

const MASTERCLASSES = [
  { title: 'Build with Generative AI: From Text to Visuals', startsAt: at(18), recordingUrl: drive('1EEecfpjNk8r1vOR7fDFDlQayOykFpNHo') },
  { title: 'Build Your Portfolio with Claude', startsAt: at(19), recordingUrl: drive('11aFbOhk56vFvfuORR2mHA65tTfBVrpLU') },
  { title: 'Build AI Automation With Claude', startsAt: at(20), recordingUrl: drive('1vvGdGEEsZuwXTmkHg_AVKapkjEd9-flA') },
  { title: 'Build AI Agents Lightning Fast', startsAt: at(21), recordingUrl: drive('1s46vZPQgPd66eur_U7vztFcEkIdFCyqb') },
];

async function main() {
  await connectDb();
  const dbName = mongoose.connection.name;
  if (APPLY && (process.env.CONFIRM_DB || '').trim() !== dbName) {
    console.error(`\n✗ Connected to "${dbName}" but CONFIRM_DB is "${process.env.CONFIRM_DB || ''}". Set CONFIRM_DB=${dbName} to apply.\n`);
    process.exit(1);
  }

  const existing = await Webinar.find({ title: { $in: MASTERCLASSES.map((m) => m.title) } }).select('title').lean();
  const have = new Set(existing.map((w) => w.title));
  const missing = MASTERCLASSES.filter((m) => !have.has(m.title));
  const students = await User.find({ role: 'student' }).select('_id').lean();

  console.log(`\n${dbName}: ${MASTERCLASSES.length} masterclass(es), ${have.size} already on the tab`);
  for (const m of MASTERCLASSES) {
    const mark = have.has(m.title) ? '·  already there' : '+  add';
    console.log(`  ${mark.padEnd(18)} ${m.title}`);
  }
  console.log(`\n  ${missing.length} to add, ${missing.length ? students.length : 0} student(s) to notify (mentors and admins see the tab, unnotified).`);

  if (!APPLY) {
    console.log(`\n  Dry run. Re-run with:  CONFIRM_DB=${dbName} node scripts/addMasterclassRecordings.js --apply\n`);
    await mongoose.disconnect();
    return;
  }

  if (missing.length) {
    await Webinar.insertMany(missing);
    // One notification for the batch, not one per recording: four bells in a
    // second is how people learn to ignore the bell.
    await notifyMany(students.map((s) => s._id), {
      type: 'webinar',
      text: missing.length === 1
        ? `Recording is up: ${missing[0].title}`
        : `${missing.length} masterclass recordings are now up`,
      link: '/app/webinar',
    });
    console.log(`\n  ✓ Added ${missing.length} masterclass(es), notified ${students.length} student(s).\n`);
  } else {
    console.log('\n  ✓ Nothing to add.\n');
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
