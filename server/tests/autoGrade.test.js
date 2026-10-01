// The automatic grader's rules: what score a review becomes, which feedback
// sentences reach the student, and when a submission is due. No database and
// no model: all three are pure functions.
//
//   node --test tests/autoGrade.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tenPointScore, assignmentOnly, autoGradeFilter, AUTO_GRADE_DELAY_MS, AUTO_GRADE_FLOOR, MAX_ATTEMPTS,
} from '../utils/autoGrade.js';

test('the rubric percentage becomes a grade out of 10', () => {
  assert.equal(tenPointScore({ weighted_score: 100 }), 10);
  assert.equal(tenPointScore({ weighted_score: 84 }), 8);
  assert.equal(tenPointScore({ weighted_score: 66 }), 7);
});

test('real work is never graded below average', () => {
  assert.equal(AUTO_GRADE_FLOOR, 5);
  assert.equal(tenPointScore({ weighted_score: 20 }), 5); // the rubric's floor: six 1s
  assert.equal(tenPointScore({ weighted_score: 44 }), 5);
});

test('an empty or copied submission does not get the floor', () => {
  const flagged = (flag) => ({ weighted_score: 20, red_flags: [{ flag, evidence: '…' }] });
  assert.equal(tenPointScore(flagged('insufficient content')), 2);
  assert.equal(tenPointScore(flagged('Copied brief')), 2);
  // Any other flag (a duplicate match, say) is for a human, and moves no number.
  assert.equal(tenPointScore(flagged('possible duplicate')), 5);
});

test('style remarks are dropped from the student feedback', () => {
  const fb = 'You mapped all five workflows and timed each one. The formatting of your document is inconsistent. Add the prompt you used for workflow three.';
  assert.equal(
    assignmentOnly(fb),
    'You mapped all five workflows and timed each one. Add the prompt you used for workflow three.',
  );
  assert.equal(assignmentOnly('Your documentation style needs work. Use clearer headings.'),
    'Your submission has been reviewed against the brief for this assignment.');
});

test('a style word the brief itself asks for is about the work', () => {
  const fb = 'Your documentation lets a peer rerun the flow. Grammar aside, it works.';
  assert.equal(
    assignmentOnly(fb, { brief: 'Write documentation another person could follow.' }),
    'Your documentation lets a peer rerun the flow.',
  );
  assert.equal(assignmentOnly(fb, { deliverables: ['SOP documentation'] }), 'Your documentation lets a peer rerun the flow.');
});

test('nothing is graded until fifteen minutes after hand-in', () => {
  const now = Date.parse('2026-10-01T10:00:00+05:30');
  assert.equal(AUTO_GRADE_DELAY_MS, 15 * 60 * 1000);
  const f = autoGradeFilter(now);
  assert.equal(f.submittedAt.$lte.getTime(), now - AUTO_GRADE_DELAY_MS);
  assert.notEqual(f.submittedAt.$ne, undefined); // a hand-in from before auto-grading is left alone
  assert.equal(f.status, 'submitted');           // a mentor's grade is never overwritten
  assert.equal(f.locked, false);
  assert.equal(f.checkStatus, 'READY');          // nothing is graded that failed the Drive check
  assert.deepEqual(f['aiReview.attempts'], { $not: { $gte: MAX_ATTEMPTS } });
});
