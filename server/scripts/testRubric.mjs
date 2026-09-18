// The rubric's arithmetic and the curriculum classifier, checked without a
// network, a database or an API key:
//
//   npm run test:rubric
//
// Everything here is the part of the automated review that is NOT the model:
// the arithmetic, the curriculum classifier, the link checker's refusals and
// the duplicate detector.
// That split is the point: a grade is a model's six judgements put through
// fixed arithmetic, and the arithmetic is the half that can be proved. If a
// weighting stops summing to 100, or a dropped criterion starts scoring zero
// instead of leaving the average, or a video finds its way into a prompt, this
// says so in a second and without spending a token.

import { scoreSubmission, creditedCriteria, buildUserMessage, CLASSES, CRITERION_KEYS, CREDITED_SCORE } from '../utils/rubric.js';
import { extractUrls, checkUrls } from '../utils/urlCheck.js';
import { fingerprint, similarity, findDuplicates, NEAR_DUPLICATE } from '../utils/similarity.js';
import { classifyWork } from '../utils/curriculumRubric.js';

let bad = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : ' FAIL '}${m}`); if (!c) bad++; };

// ── weights sum to 100 (rubric.js asserts this at import, so reaching here proves it)
ok(true, 'all five class weightings sum to 100 (checked at import)');

// ── a perfect submission is 100 in every class
for (const cls of Object.keys(CLASSES)) {
  const all5 = CRITERION_KEYS.map((key) => ({ key, score: 5, feedback: '' }));
  const r = scoreSubmission({ rubricClass: cls, criteria: all5 });
  ok(r.weighted_score === 100 && r.result === 'PASS', `class ${cls}: all 5s -> ${r.weighted_score}/100 ${r.result} (${r.suggested_grade})`);
}

// ── all 1s is 20 in every class, and a FAIL
for (const cls of Object.keys(CLASSES)) {
  const all1 = CRITERION_KEYS.map((key) => ({ key, score: 1, feedback: '' }));
  const r = scoreSubmission({ rubricClass: cls, criteria: all1 });
  ok(r.weighted_score === 20 && r.result === 'FAIL', `class ${cls}: all 1s -> ${r.weighted_score}/100 ${r.result}`);
}

// ── the weights actually bite: a drill (A) is punished for a missing deliverable
//    far harder than a capstone (E) is, which is the entire point of the classes.
const weakC1 = CRITERION_KEYS.map((key) => ({ key, score: key === 'C1' ? 1 : 5, feedback: '' }));
const a = scoreSubmission({ rubricClass: 'A', criteria: weakC1 }).weighted_score;
const e = scoreSubmission({ rubricClass: 'E', criteria: weakC1 }).weighted_score;
ok(a < e, `missing deliverables cost a Drill more than a Capstone: A=${a} vs E=${e}`);

// ── and the reverse: thin documentation barely dents a drill, sinks a system build
const weakC6 = CRITERION_KEYS.map((key) => ({ key, score: key === 'C6' ? 1 : 5, feedback: '' }));
const a6 = scoreSubmission({ rubricClass: 'A', criteria: weakC6 }).weighted_score;
const c6 = scoreSubmission({ rubricClass: 'C', criteria: weakC6 }).weighted_score;
ok(c6 < a6, `thin transfer docs cost a System build more than a Drill: C=${c6} vs A=${a6}`);

// ── a credited criterion is lifted to "good", never scored low, never dropped
const mixed = CRITERION_KEYS.map((key) => ({ key, score: key === 'C5' ? 1 : 4, feedback: '' }));
const raw = scoreSubmission({ rubricClass: 'D', criteria: mixed }).weighted_score;
const cr = scoreSubmission({ rubricClass: 'D', criteria: mixed, credited: [{ key: 'C5', why: 'not assessed' }] });
ok(cr.weighted_score === 80, `crediting C5 lifts it to ${CREDITED_SCORE}/5 rather than counting the 1: ${raw} -> ${cr.weighted_score}`);
const c5 = cr.criteria.find((c) => c.key === 'C5');
ok(c5.score === CREDITED_SCORE && c5.credited === true, 'the credited criterion is scored 4 and flagged as credited');
ok(c5.counted === true, 'it still counts towards the grade, so the denominator never shifts');
ok(c5.feedback === 'not assessed', 'its feedback says it was not assessed, rather than inventing praise');
ok(cr.weighted_score >= raw, 'crediting can only ever help the student, never hurt them');

// ── creditedCriteria: only when the images never reached the model
// With one multimodal call there is no "the vision model was down" state left.
// What remains is an image we could not pull out of Drive: too big, wrong
// format, or broken sharing. imagesSent counts the ones that got through.
const withDocs = { readableNonImages: true };
ok(creditedCriteria({ rubricClass: 'D', imagesSent: 0, imageCount: 4, ...withDocs }).length === 1, 'class D + images none readable -> C5 credited');
ok(creditedCriteria({ rubricClass: 'D', imagesSent: 4, imageCount: 4, ...withDocs }).length === 0, 'class D + images reached the model -> nothing credited');
ok(creditedCriteria({ rubricClass: 'B', imagesSent: 0, imageCount: 4, ...withDocs }).length === 0, 'class B + unreadable images -> nothing credited (a screenshot corroborates a doc)');
ok(creditedCriteria({ rubricClass: 'D', imagesSent: 0, imageCount: 0, ...withDocs }).length === 0, 'no images at all -> nothing credited, it is a C1 matter');
ok(creditedCriteria({ rubricClass: 'A', imagesSent: 0, imageCount: 2, readableNonImages: false }).length === 6,
   'images were the WHOLE submission and none could be read -> all six credited, not one');

// ── a screenshot-only assignment whose vision failed still passes, not fails
const allOnes = CRITERION_KEYS.map((key) => ({ key, score: 1, feedback: '' }));
const rescued = scoreSubmission({
  rubricClass: 'A',
  criteria: allOnes,
  credited: creditedCriteria({ rubricClass: 'A', imagesSent: 0, imageCount: 2, readableNonImages: false }),
});
ok(rescued.weighted_score === 80 && rescued.result === 'PASS',
   `4.4-style screenshot-only work is not failed for OUR outage: ${rescued.weighted_score}/100 ${rescued.result}`);

// ── a missing criterion cannot silently change the denominator
try {
  scoreSubmission({ rubricClass: 'A', criteria: [] });
  ok(false, 'an empty criteria list should throw');
} catch { ok(true, 'an empty criteria list throws rather than grading over nothing'); }

// ── the prompt names the video and never feeds it
const msg = buildUserMessage({
  programName: 'AI Kickstarter',
  assignmentTitle: 'Assignment: Capstone Project, Final Polish',
  assignmentType: 'assignment',
  rubricClass: 'E',
  brief: 'Finalise your capstone.',
  deliverables: ['90-second Loom demo', '3-sentence summary', 'public URL'],
  taught: 'S04 - Capstone Build Sprint',
  manifest: {
    items: [
      { n: 1, kind: 'document', name: 'writeup.pdf', meta: '1200 characters', content: 'My capstone is a triage bot.' },
      { n: 2, kind: 'artifact', name: 'summary.html', meta: '3 headings, 1 table', content: 'Setup summary' },
      { n: 3, kind: 'video', name: 'demo.mp4', meta: 'for the mentor to watch' },
      { n: 4, kind: 'screenshot', name: 'run.png', unreadable: 'the image reviewer could not be reached' },
    ],
  },
});
ok(msg.includes('NOT REVIEWED'), 'the video is listed as NOT REVIEWED');
ok(!msg.includes('demo.mp4\n<content>'), 'no video content is ever put in the prompt');
ok(msg.includes('UNREADABLE'), 'an unreadable screenshot is declared, not silently dropped');
ok(msg.includes('1. 90-second Loom demo'), 'the deliverables checklist is numbered into the prompt');
ok(msg.includes('RUBRIC CLASS: E'), 'the rubric class and its description reach the prompt');

// ── the classifier, on the two cases that matter most
const kick = classifyWork({
  title: 'Assignment: Prompt Rewrite Battle + Personal Prompt Library',
  description: 'Take 5 prompts.\nSubmit: Claude Artifact, Prompt Cheat Sheet. Becomes a portfolio asset.',
  moduleTitle: 'S01', chapterTitle: '1.3',
});
ok(!kick.requiredDriveTypes.includes('video'), 'an artifact assignment does not demand a video');
ok(kick.allowHtml, 'an artifact assignment allows an .html file');
ok(!kick.requiredDriveTypes.includes('html'), '...but does not REQUIRE one, so a PDF export still passes');
ok(kick.deliverables.length === 2, `checklist is ${JSON.stringify(kick.deliverables)}`);

const loom = classifyWork({
  title: 'Assignment: Capstone Project, Final Polish',
  description: 'Record a 90-second Loom walkthrough. Submit before Demo Day.',
  moduleTitle: 'S04', chapterTitle: '4.2',
});
ok(loom.requiredDriveTypes.includes('video'), 'a brief that asks for a Loom still REQUIRES the video');


// ── link extraction ──────────────────────────────────────────────
const prose = 'My app is at https://myapp.lovable.app/ and the post is (https://linkedin.com/posts/abc). Repo: https://github.com/me/x.';
const found = extractUrls(prose);
ok(found.length === 3, `three links found in prose: ${JSON.stringify(found)}`);
ok(found[0] === 'https://myapp.lovable.app/', 'a trailing full stop is not swallowed into the URL');
ok(found[1] === 'https://linkedin.com/posts/abc', 'a closing bracket is not swallowed into the URL');
ok(extractUrls('same https://a.example and https://a.example').length === 1, 'a repeated link is listed once');
ok(extractUrls('no links here at all').length === 0, 'prose with no links yields none');

// ── the checker must never become a request-forgery tool ─────────────────
// A write-up is untrusted text and this runs on our server, so a student
// pasting a metadata or loopback address must be refused before any fetch.
const ssrf = await checkUrls('see http://169.254.169.254/latest/meta-data/ and http://127.0.0.1:4100/admin and ftp://x.example/f');
ok(ssrf.results.length === 2 && ssrf.results.every((r) => r.status === 'refused'),
   `the metadata and loopback addresses are refused without a fetch, and ftp:// is never even extracted: ${ssrf.results.length} considered, ${ssrf.results.map((r) => r.status).join(', ')}`);
const drive = await checkUrls('https://drive.google.com/drive/folders/abc123');
ok(drive.results[0].status === 'skipped', 'a Drive link is skipped, not re-checked');

// ── duplicate detection ─────────────────────────────────────────
const brief = 'Take 5 prompts; rewrite each using CLEAR; show before and after. Build a Prompt Cheat Sheet with ten prompts organised by category.';
const wordsOf = (n, seed) => Array.from({ length: n }, (_, i) => `${seed}word${i % 40}`).join(' ');

const studentA = `${brief} I rewrote my five prompts for the marketing digest I send on Fridays. ${wordsOf(90, 'alpha')}`;
const studentB = `${brief} I rewrote my five prompts for the marketing digest I send on Fridays. ${wordsOf(90, 'alpha')}`;
const studentC = `${brief} I work on a Kannada podcast and rewrote prompts for episode summaries. ${wordsOf(90, 'gamma')}`;

const fpA = fingerprint(studentA, brief);
const fpB = fingerprint(studentB, brief);
const fpC = fingerprint(studentC, brief);
ok(fpA !== null, 'a real write-up produces a fingerprint');
ok(similarity(fpA, fpB) > 0.9, `two identical write-ups look identical: ${similarity(fpA, fpB).toFixed(2)}`);
ok(similarity(fpA, fpC) < 0.3, `two different write-ups do not: ${similarity(fpA, fpC).toFixed(2)}`);

// The brief is the trap: a cohort all quoting the same four sentences must not
// read as a cohort all copying each other.
const onlyBriefA = `${brief} ${wordsOf(80, 'alpha')}`;
const onlyBriefC = `${brief} ${wordsOf(80, 'gamma')}`;
const sameBrief = similarity(fingerprint(onlyBriefA, brief), fingerprint(onlyBriefC, brief));
ok(sameBrief < NEAR_DUPLICATE, `quoting the brief alone does not trip the flag: ${sameBrief.toFixed(2)}`);

ok(fingerprint('too short to say anything about', brief) === null, 'a very short note produces no fingerprint at all');
ok(findDuplicates(null, [{ studentName: 'X', fingerprint: fpA }]).length === 0, 'no fingerprint means no accusation');

const dupes = findDuplicates(fpA, [
  { studentName: 'Priya S', fingerprint: fpB },
  { studentName: 'Rahul M', fingerprint: fpC },
]);
ok(dupes.length === 1, 'only the genuine match is flagged');
ok(dupes[0].evidence.includes('Priya S'), 'the flag names the other student, for the mentor');
ok(/not a conclusion/i.test(dupes[0].evidence), 'the flag says outright that it is a measurement, not a verdict');

console.log(bad ? `\n${bad} check(s) failed.` : '\nAll checks passed.');
process.exit(bad ? 1 : 0);
