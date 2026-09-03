import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Empty from '../components/Empty.jsx';

// Batch forum: a Doubts board (post, like, comment). Students ask, mentors answer.
export default function Forum() {
  const { user } = useOutletContext();
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');

  useEffect(() => {
    api('/batches').then((d) => {
      setBatches(d.batches || []);
      if (d.batches?.[0]) setBatchId(d.batches[0].id);
    }).catch(() => {});
  }, []);

  return (
    <div>
      {/* One name for one place. This page carried three: the nav tab said
          "Forum", the eyebrow repeated "Forum", and the heading said "Doubts" —
          the eyebrow was printing the tab the reader had just clicked. */}
      <div className="page-head">
        <div>
          <h1>Forum</h1>
          <p>Ask a doubt and get it answered by your mentor and peers.</p>
        </div>
        {batches.length > 1 && (
          <div className="learn-select">
            <label htmlFor="forum-batch">Batch</label>
            <select id="forum-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name.replace(/^Demo[^A-Za-z0-9]+/, '')}</option>)}
            </select>
          </div>
        )}
      </div>

      {batches.length === 0 ? (
        <p className="muted">You're not in any batch yet. The forum opens once you're enrolled.</p>
      ) : (
        batchId && <Doubts batchId={batchId} me={user} />
      )}
    </div>
  );
}

function Doubts({ batchId, me }) {
  const [doubts, setDoubts] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isStudent = me.role === 'student';

  const load = () => api(`/forum/doubts?batchId=${batchId}`).then((d) => setDoubts(d.doubts || [])).catch(() => {});
  // Live: refresh so mentors see new doubts and everyone sees new answers.
  // 12s, not 5s — this runs per student with the tab open, so a batch of 18
  // was 3.6 requests a second against the database forever, just to poll.
  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [batchId]);

  async function post(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/forum/doubts', { method: 'POST', body: { batchId, text } });
      setText('');
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      {isStudent ? (
        <form className="panel ask-box" onSubmit={post}>
          <h3 className="ruled-head">Ask a doubt</h3>
          <div className="ask-row">
            <input className="ask-input" placeholder="What are you stuck on?" value={text} onChange={(e) => setText(e.target.value)} aria-label="Your doubt" />
            <button className={`btn ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Posting…' : 'Post doubt'}</button>
          </div>
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      ) : (
        <div className="panel ask-box">
          <h3 className="ruled-head">Student doubts</h3>
          <p className="muted">Answer your students' questions below. New doubts appear here live.</p>
        </div>
      )}

      <div className="doubt-list">
        {doubts.length === 0
          ? <Empty icon="forum" title="No doubts yet." hint={isStudent ? 'Be the first to ask. Your mentor and your batch both see it.' : 'Students post here, and you will see them arrive live.'} />
          : doubts.map((d) => <DoubtCard key={d.id} doubt={d} me={me} onChange={load} />)}
      </div>
    </div>
  );
}

function DoubtCard({ doubt, me, onChange }) {
  const [comment, setComment] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function like() { try { await api(`/forum/doubts/${doubt.id}/like`, { method: 'POST' }); onChange(); } catch { /* transient, next poll reconciles */ } }
  async function addComment(e) {
    e.preventDefault();
    if (!comment.trim() || busy) return;
    setBusy(true);
    try {
      await api(`/forum/doubts/${doubt.id}/comments`, { method: 'POST', body: { text: comment } });
      setComment('');
      onChange();
    } catch { /* keep the draft so the reply isn't lost on a failed send */ }
    finally { setBusy(false); }
  }

  return (
    <div className="panel doubt">
      <div className="doubt-head">
        <span className="doubt-avatar" aria-hidden="true">{initial(doubt.author?.name)}</span>
        <div className="doubt-byline">
          <div className="doubt-who">
            <strong>{doubt.author?.name}</strong>
            {doubt.author?.role === 'mentor' && <span className="badge badge-mentor">mentor</span>}
          </div>
          <time className="doubt-when">{fmtWhen(doubt.at)}</time>
        </div>
      </div>

      <p className="doubt-text">{doubt.text}</p>

      {/* The two actions sit on one ruled footer as a toolbar. They were a
          rounded like-pill next to a ghost button of a different height, which
          read as two unrelated controls that happened to land side by side. */}
      <div className="doubt-foot">
        <button className={`doubt-act ${doubt.likedByMe ? 'liked' : ''}`} onClick={like} aria-pressed={doubt.likedByMe}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5l7 12H5l7-12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill={doubt.likedByMe ? 'currentColor' : 'none'} />
          </svg>
          {doubt.likeCount}
          <span className="sr-only"> likes</span>
        </button>
        <button className={`doubt-act ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3v4l5-4h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          {doubt.comments.length} comment{doubt.comments.length === 1 ? '' : 's'}
        </button>
      </div>

      {open && (
        <div className="comments">
          {doubt.comments.map((c) => (
            <div key={c.id} className="comment">
              <span className="doubt-avatar sm" aria-hidden="true">{initial(c.author?.name)}</span>
              <div className="comment-body">
                <div className="doubt-who">
                  <strong>{c.author?.name}</strong>
                  {c.author?.role === 'mentor' && <span className="badge badge-mentor">mentor</span>}
                </div>
                <p className="comment-text">{c.text}</p>
              </div>
            </div>
          ))}
          <form className="ask-row comment-form" onSubmit={addComment}>
            <input className="ask-input" placeholder={me.role === 'mentor' ? 'Write an answer…' : 'Add a comment…'} value={comment} onChange={(e) => setComment(e.target.value)} aria-label={me.role === 'mentor' ? 'Your answer' : 'Your comment'} />
            <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Sending…' : (me.role === 'mentor' ? 'Answer' : 'Reply')}</button>
          </form>
        </div>
      )}
    </div>
  );
}

const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

// "8/24/2026, 1:22:14 AM" is a machine timestamp. Nobody needs the seconds, and
// the rest of the app already formats dates this way.
function fmtWhen(at) {
  const d = new Date(at);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
