import { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import Empty, { Loading } from '../components/Empty.jsx';
import Content from '../components/Classroom.jsx';
import QuizCard from '../components/QuizCard.jsx';
import AssignmentCard, { assignmentState, relative } from '../components/AssignmentCard.jsx';
import useFetch from '../useFetch.js';

// Learning. For students: Content + Assignments (submit) + Quizzes (take).
// For mentors/admins: just the course content to teach from — they create &
// grade assignments/quizzes under Programs → a batch, not here.
//
// This module is the tab shell and the two list wrappers, nothing more. The
// three screens it switches between are their own components under
// ../components — they had no reason to share a file beyond having grown up
// in one.
export default function Learning() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // ?tab= lets search results (and shared links) open straight onto the right
  // tab — "assignments" hits from ⌘K would otherwise land on Content.
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = params.get('tab');
    return ['content', 'assignments', 'quizzes'].includes(t) ? t : 'content';
  });

  // …and keeps working when a result is opened while already on this page.
  const wantTab = params.get('tab');
  const wantTopic = params.get('topic');
  useEffect(() => {
    if (wantTab && ['content', 'assignments', 'quizzes'].includes(wantTab)) setTab(wantTab);
    else if (wantTopic) setTab('content');
  }, [wantTab, wantTopic]);

  // One compact row for the title and the switcher: the Content tab sizes its
  // workspace to whatever is left of the viewport, so every pixel of chrome
  // above it comes straight out of the reading.
  if (!isStudent) {
    return (
      <div>
        <div className="learn-page-head">
          <h1>Learning</h1>
          <p className="muted">The course content your students see. Teach from this. Create &amp; grade assignments and quizzes under <b>Programs → your batch</b>.</p>
        </div>
        <Content />
      </div>
    );
  }

  return (
    <div>
      <div className="learn-page-head">
        <h1>Learning</h1>
        <div className="tabs learn-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'content'} className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>Content</button>
          <button role="tab" aria-selected={tab === 'assignments'} className={`tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>Assignments & Projects</button>
          <button role="tab" aria-selected={tab === 'quizzes'} className={`tab ${tab === 'quizzes' ? 'active' : ''}`} onClick={() => setTab('quizzes')}>Quizzes</button>
        </div>
      </div>
      {tab === 'content' && <Content />}
      {tab === 'assignments' && <Assignments />}
      {tab === 'quizzes' && <Quizzes />}
    </div>
  );
}

// ── Quizzes ──────────────────────────────────────────────────────────────────
function Quizzes() {
  // useFetch keeps the list on screen across a reload after an attempt, and
  // keeps "no quizzes yet" from being shown before the answer has arrived.
  const { data: items, loading, reload } = useFetch('/quizzes?scope=mine', {
    select: (d) => d.quizzes || [],
    initial: [],
  });
  if (loading) return <Loading rows={3} />;
  if (items.length === 0) return <Empty icon="learning" title="No quizzes yet." hint="Your mentor posts them here as the programme moves along. Nothing for you to do until then." />;

  const taken = items.filter((q) => q.myAttempt);
  const avg = taken.length ? Math.round(taken.reduce((s, q) => s + (q.myAttempt.total ? q.myAttempt.score / q.myAttempt.total : 0), 0) / taken.length * 100) : null;
  // Untaken first — that's the work; results after, in the order the API sends them.
  const ordered = [...items.filter((q) => !q.myAttempt), ...taken];

  return (
    <div className="work">
      <div className="work-bar">
        <div className="work-stats">
          <div className="work-stat"><b>{items.length - taken.length}</b><span>to take</span></div>
          <div className="work-stat"><b>{taken.length}</b><span>taken</span></div>
          {avg != null && <div className="work-stat"><b>{avg}%</b><span>average</span></div>}
        </div>
      </div>
      <div className="list work-list">{ordered.map((q) => <QuizCard key={q._id} quiz={q} onDone={reload} />)}</div>
    </div>
  );
}

// ── Assignments & projects ───────────────────────────────────────────────────
// Sorted by what needs the student: overdue and fixes first, then open work by
// nearest deadline, then what's waiting on the mentor, then upcoming, then
// graded. The filter strip is also the summary — the counts ARE the numbers
// you'd want to see.
const ORDER = { overdue: 0, fixes: 1, todo: 2, review: 3, upcoming: 4, graded: 5 };
const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'todo', label: 'To do', match: (s) => s === 'todo' || s === 'overdue' || s === 'fixes' },
  { key: 'review', label: 'In review', match: (s) => s === 'review' },
  { key: 'graded', label: 'Graded', match: (s) => s === 'graded' },
];

function Assignments() {
  const { data: items, loading, reload, setData } = useFetch('/assignments?scope=mine', {
    select: (d) => d.assignments || [],
    initial: [],
  });
  const [filter, setFilter] = useState('all');

  // Splice one assignment's submission in place — a submit/edit response
  // already describes exactly what changed, so there's no need to refetch
  // every assignment (and every submission) to update one card.
  const updateSubmission = (assignmentId, submission) =>
    setData((prev) => prev.map((a) => (a._id === assignmentId ? { ...a, mySubmission: submission } : a)));

  const rows = useMemo(() => {
    const withState = items.map((a) => ({ a, state: assignmentState(a) }));
    withState.sort((x, y) => (ORDER[x.state] - ORDER[y.state]) || (new Date(x.a.dueDate || 0) - new Date(y.a.dueDate || 0)));
    return withState;
  }, [items]);

  if (loading) return <Loading rows={3} />;
  if (items.length === 0) return <Empty icon="grades" title="No assignments yet." hint="They appear here once your mentor sets them, with the deadline and what your Drive folder needs to contain." />;

  const count = (f) => rows.filter((r) => f.match(r.state)).length;
  const visible = rows.filter((r) => FILTERS.find((f) => f.key === filter).match(r.state));
  const nextDue = rows.find((r) => (r.state === 'todo' || r.state === 'fixes') && r.a.dueDate);
  const overdueN = rows.filter((r) => r.state === 'overdue').length;

  return (
    <div className="work">
      <div className="work-bar">
        <div className="work-filters" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} className={`work-filter ${filter === f.key ? 'on' : ''} ${f.key === 'todo' && overdueN ? 'has-overdue' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} <b>{count(f)}</b>
            </button>
          ))}
        </div>
        {overdueN > 0
          ? <div className="work-next is-overdue">{overdueN} overdue, the deadline has passed with nothing handed in.</div>
          : nextDue && <div className="work-next">Next up: <b>{nextDue.a.title}</b> · due {relative(nextDue.a.dueDate)}</div>}
      </div>

      {visible.length === 0 ? (
        <Empty icon="grades" title="Nothing here." hint="Try another filter." />
      ) : (
        <div className="list work-list">
          {visible.map(({ a }) => <AssignmentCard key={a._id} a={a} onChange={reload} onSubmissionChange={updateSubmission} />)}
        </div>
      )}
    </div>
  );
}
