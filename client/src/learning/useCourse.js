import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { driveEmbedUrl, lessonMinutes, tierNames, workKind, materialLabels } from '../features.js';
import { assignmentState } from '../components/AssignmentCard.jsx';

// One data layer for every Learning layout in the lab. The four layouts
// differ in what they put where; they must not differ in what a lesson's
// reading is, which assignment belongs to which week, or what counts as
// done — so all of that lives here and the layouts only draw it.

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
// "S01 · AI Foundations", "Week 1: AI Foundations", "G01 · …" are one title
// once the code in front is dropped.
export const bare = (s) => norm(s).replace(/^(s\d+|g\d+|week \d+|session \d+)\s*[·:.-]\s*/i, '').replace(/\s*·\s*\d+\s*min$/i, '');
const stripWork = (s) => norm(s).replace(/^(weekly assignment|assignment|milestone project \d+|p\d+)\s*[:·.-]\s*/i, '');
const sameWork = (nodeTitle, rowTitle) => { const a = stripWork(nodeTitle), b = stripWork(rowTitle); return a === b || a.endsWith(b) || b.endsWith(a); };
export const workTitle = (t) => String(t || '').replace(/^(weekly assignment|assignment|milestone project \d+|p\d+)\s*[:·.-]\s*/i, '');
export const chapLabel = (t) => String(t || '').replace(/\s*·\s*Week\s*\d+:\s*/, ' · ');

const LAST_KEY = (pid) => `lms:learning:last:${pid}`;
const readLast = (pid) => { try { return localStorage.getItem(LAST_KEY(pid)) || ''; } catch { return ''; } };
const writeLast = (pid, tid) => { try { localStorage.setItem(LAST_KEY(pid), String(tid)); } catch {} };

export const fmtMin = (n) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} m` : ''}` : `${n} min`);
export const fmtWhen = (d) => new Date(d).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
export const classState = (s, now = Date.now()) => {
  const start = new Date(s.startsAt).getTime();
  const end = s.endsAt ? new Date(s.endsAt).getTime() : start + 4 * 3600e3;
  if (now >= start - 5 * 60e3 && now <= end + 5 * 60e3) return 'live';
  return now > end + 5 * 60e3 ? 'past' : 'ahead';
};

export default function useCourse({ isStudent }) {
  const [params, setParams] = useSearchParams();
  const [programs, setPrograms] = useState([]);
  const [program, setProgram] = useState(null);
  const [completed, setCompleted] = useState(new Set());
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topicId, setTopicId] = useState(null);

  async function pick(id, preferTopic) {
    const [{ program: p }, prog] = await Promise.all([
      api(`/programs/${id}`),
      isStudent ? api(`/progress/me?programId=${id}`).catch(() => ({ completedTopics: [] })) : { completedTopics: [] },
    ]);
    const done = new Set(prog.completedTopics || []);
    setProgram(p); setCompleted(done);
    // Open on the lesson named in the URL, else where you left off if it is
    // still open, else the first lesson not yet done.
    const all = (p.modules || []).flatMap((m) => (m.chapters || []).flatMap((c) => c.topics || []));
    const want = preferTopic || readLast(p._id);
    const pickT = (want && all.find((t) => String(t._id) === String(want) && (preferTopic || !done.has(t._id))))
      || all.find((t) => !done.has(t._id)) || all[0] || null;
    setTopicId(pickT ? String(pickT._id) : null);
  }
  useEffect(() => {
    Promise.all([
      api('/programs?fields=summary'),
      isStudent ? api('/batches') : Promise.resolve({ batches: null }),
      isStudent ? api('/assignments?scope=mine').catch(() => ({ assignments: [] })) : { assignments: [] },
      isStudent ? api('/quizzes?scope=mine').catch(() => ({ quizzes: [] })) : { quizzes: [] },
      api('/sessions').catch(() => ({ sessions: [] })),
    ]).then(async ([pd, bd, ad, qd, sd]) => {
      let list = pd.programs || [];
      if (bd.batches) { const mine = new Set(bd.batches.map((b) => b.programId).filter(Boolean)); list = list.filter((p) => mine.has(p._id) && p.published); }
      setPrograms(list); setAssignments(ad.assignments || []); setQuizzes(qd.quizzes || []); setSessions(sd.sessions || []);
      const wantP = params.get('program');
      const start = (wantP && list.find((p) => p._id === wantP)) ? wantP : list[0]?._id;
      if (start) await pick(start, params.get('topic'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const mods = program?.modules || [];
  const flat = useMemo(() => {
    const out = [];
    mods.forEach((m, mi) => (m.chapters || []).forEach((c, ci) => (c.topics || []).forEach((t) => out.push({ topic: t, mod: m, chap: c, mi, ci, id: String(t._id) }))));
    return out;
  }, [program]);
  const byId = useMemo(() => new Map(flat.map((f) => [f.id, f])), [flat]);
  const current = topicId ? byId.get(String(topicId)) || null : null;
  const idx = current ? flat.indexOf(current) : -1;
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  const done = flat.filter((f) => completed.has(f.topic._id)).length;
  const pct = flat.length ? Math.round((done / flat.length) * 100) : 0;
  const firstOpen = flat.find((f) => !completed.has(f.topic._id)) || null;
  const hereIdx = firstOpen ? firstOpen.mi : Math.max(0, mods.length - 1);
  const isDone = (t) => completed.has(t._id);

  const modLessons = (m) => (m?.chapters || []).flatMap((c) => c.topics || []);
  const modDone = (m) => modLessons(m).filter((t) => completed.has(t._id)).length;
  const modState = (mi) => { const m = mods[mi]; const n = modLessons(m).length; if (n > 0 && modDone(m) === n) return 'done'; if (mi === hereIdx) return 'here'; return mi < hereIdx ? 'done' : 'ahead'; };
  const modMinutes = (m, onlyOpen = true) => modLessons(m).filter((t) => !onlyOpen || !completed.has(t._id)).reduce((s, t) => s + lessonMinutes(t.title), 0);
  const tier = (m) => tierNames(m?.title);

  // The work and the class that belong to a module.
  const workFor = (m) => {
    const nodes = [];
    for (const c of m?.chapters || []) {
      if (workKind({ chapter: c.title })) nodes.push({ node: c, kind: workKind({ chapter: c.title }), lesson: (c.topics || [])[0] || null });
      for (const t of c.topics || []) { const k = workKind({ lesson: t.title }); if (k) nodes.push({ node: t, kind: k, lesson: t }); }
    }
    return nodes.map((n) => { const row = assignments.find((a) => sameWork(n.node.title, a.title)) || null; return { ...n, row, state: row ? assignmentState(row) : null, id: String(n.node._id) }; });
  };
  const classFor = (m) => { const titles = [m.title, ...(m.chapters || []).map((c) => c.title)].map(bare).filter(Boolean); return sessions.filter((s) => { const b = bare(s.title); return b && titles.includes(b); }); };
  const openQuizzes = quizzes.filter((q) => !q.myAttempt);
  const isWorkLesson = (t) => !!workKind({ lesson: t.title });
  const isWorkChap = (c) => !!workKind({ chapter: c.title });

  // A lesson's reading, notes and video, resolved the way the classic reader
  // resolves them: lesson → session → week, except a piece of work never
  // climbs.
  const mediaFor = (f) => {
    if (!f) return { reading: '', notes: [], video: '', drive: '', kind: null, L: materialLabels(null) };
    const kind = workKind({ lesson: f.topic.title, chapter: f.chap.title });
    const workChap = isWorkChap(f.chap);
    const inherit = (field) => (kind ? f.topic[field] || (workChap ? f.chap[field] : '') || '' : f.topic[field] || f.chap[field] || f.mod[field] || '');
    const L = materialLabels(kind);
    const notes = []; const seen = new Set();
    const push = (url, name, k = 'notes') => { if (!url || seen.has(url)) return; seen.add(url); notes.push({ url, name: name || L.notes, kind: k === 'resource' ? 'resource' : 'notes' }); };
    push(inherit('notesUrl'), L.notes);
    for (const x of f.topic.materials || []) push(x.url, x.name, x.kind);
    if (!kind) { for (const x of f.chap.materials || []) push(x.url, x.name, x.kind); for (const x of f.mod.materials || []) push(x.url, x.name, x.kind); }
    const video = f.topic.classLink || (f.topic.contentType === 'video' ? f.topic.contentUrl : '') || '';
    return { reading: inherit('readingUrl'), notes, video, drive: driveEmbedUrl(video) ? video : '', kind, L };
  };
  // The week's own ebook and notes, for a layout that lists them beside the lessons.
  const weekMedia = (m) => ({ reading: m?.readingUrl || '', notes: [m?.notesUrl ? { url: m.notesUrl, name: 'Teacher notes', kind: 'notes' } : null, ...(m?.materials || [])].filter(Boolean) });

  const open = (f) => { if (!f) return; setTopicId(f.id); writeLast(program._id, f.id); setParams({ program: program._id, topic: f.id }, { replace: true }); };
  async function toggle(tid = topicId) {
    if (!tid) return null;
    const { completedTopics } = await api('/progress/toggle', { method: 'POST', body: { programId: program._id, topicId: tid } });
    const nextSet = new Set(completedTopics);
    const f = byId.get(String(tid));
    const weekDone = f && !completed.has(tid) && modLessons(f.mod).every((t) => nextSet.has(t._id));
    setCompleted(nextSet);
    return weekDone ? f.mi : null;
  }
  const reloadWork = () => { api('/assignments?scope=mine').then((d) => setAssignments(d.assignments || [])).catch(() => {}); api('/quizzes?scope=mine').then((d) => setQuizzes(d.quizzes || [])).catch(() => {}); };
  const spliceSubmission = (id, sub) => setAssignments((prev) => prev.map((a) => (a._id === id ? { ...a, mySubmission: sub } : a)));
  const certificate = async () => { const c = await api(`/progress/certificate?programId=${program._id}`); return c.eligible ? c : null; };
  const switchProgram = (id) => { setParams({ program: id }, { replace: true }); pick(id); };

  return {
    loading, programs, program, switchProgram, mods, flat, byId, current, idx, prev, next, done, pct, hereIdx, isDone, completed,
    modLessons, modDone, modState, modMinutes, tier, workFor, classFor, openQuizzes, isWorkLesson, isWorkChap, mediaFor, weekMedia,
    open, toggle, reloadWork, spliceSubmission, certificate, assignments, quizzes, sessions, lessonMinutes,
  };
}
