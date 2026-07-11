import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

// Batch forum: a general group Chat + a Doubts board (post, like, comment).
// Shared by students and mentors — both are members of the batch.
export default function Forum() {
  const { user } = useOutletContext();
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [tab, setTab] = useState('chat');

  useEffect(() => {
    api('/batches').then((d) => {
      setBatches(d.batches || []);
      if (d.batches?.[0]) setBatchId(d.batches[0].id);
    }).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Forum</div>
          <h1>Batch discussion</h1>
          <p>Chat with your cohort and get your doubts answered.</p>
        </div>
      </div>

      {batches.length === 0 ? (
        <p className="muted">You're not in any batch yet — the forum opens once you're enrolled.</p>
      ) : (
        <>
          <div className="learn-select">
            <label>Batch{' '}
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name.replace(/^Demo — /, '')}</option>)}
              </select>
            </label>
          </div>

          <div className="tabs">
            <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Chat</button>
            <button className={`tab ${tab === 'doubts' ? 'active' : ''}`} onClick={() => setTab('doubts')}>Doubts</button>
          </div>

          {batchId && (tab === 'chat' ? <Chat batchId={batchId} me={user} /> : <Doubts batchId={batchId} me={user} />)}
        </>
      )}
    </div>
  );
}

function Chat({ batchId, me }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  const load = () => api(`/forum/chat?batchId=${batchId}`).then((d) => setMessages(d.messages || [])).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // light polling
    return () => clearInterval(t);
  }, [batchId]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [messages.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text;
    setText('');
    await api('/forum/chat', { method: 'POST', body: { batchId, text: body } });
    load();
  }

  return (
    <div className="panel">
      <div className="chat-window">
        {messages.length === 0 && <p className="muted">No messages yet. Say hello 👋</p>}
        {messages.map((m) => {
          const mine = m.author?.id === me.id;
          return (
            <div key={m.id} className={`chat-msg ${mine ? 'mine' : ''}`}>
              {!mine && <div className="chat-author">{m.author?.name} {m.author?.role === 'mentor' && <span className="badge badge-mentor">mentor</span>}</div>}
              <div className="chat-bubble">{m.text}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={send}>
        <input placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn sm">Send</button>
      </form>
    </div>
  );
}

function Doubts({ batchId, me }) {
  const [doubts, setDoubts] = useState([]);
  const [text, setText] = useState('');
  const isStudent = me.role === 'student';

  const load = () => api(`/forum/doubts?batchId=${batchId}`).then((d) => setDoubts(d.doubts || [])).catch(() => {});
  // Live: refresh every 5s so mentors see new doubts and everyone sees new answers.
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [batchId]);

  async function post(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await api('/forum/doubts', { method: 'POST', body: { batchId, text } });
    setText('');
    load();
  }

  return (
    <div>
      {isStudent ? (
        <form className="panel" onSubmit={post}>
          <h3>Ask a doubt</h3>
          <div className="inline-form">
            <input style={{ flex: 1, minWidth: 260 }} placeholder="What are you stuck on?" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn sm">Post doubt</button>
          </div>
        </form>
      ) : (
        <div className="panel"><h3>Student doubts</h3><p className="muted">Answer your students' questions below. New doubts appear here live.</p></div>
      )}

      <div className="list">
        {doubts.length === 0 && <p className="muted">{isStudent ? 'No doubts yet. Be the first to ask.' : 'No doubts yet — students will post them here.'}</p>}
        {doubts.map((d) => <DoubtCard key={d.id} doubt={d} me={me} onChange={load} />)}
      </div>
    </div>
  );
}

function DoubtCard({ doubt, me, onChange }) {
  const [comment, setComment] = useState('');
  const [open, setOpen] = useState(false);

  async function like() { await api(`/forum/doubts/${doubt.id}/like`, { method: 'POST' }); onChange(); }
  async function addComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    await api(`/forum/doubts/${doubt.id}/comments`, { method: 'POST', body: { text: comment } });
    setComment('');
    onChange();
  }

  return (
    <div className="panel">
      <div className="doubt-head">
        <div>
          <strong>{doubt.author?.name}</strong>
          {doubt.author?.role === 'mentor' && <span className="badge badge-mentor" style={{ marginLeft: 6 }}>mentor</span>}
          <div className="muted" style={{ fontSize: 12 }}>{new Date(doubt.at).toLocaleString()}</div>
        </div>
      </div>
      <p style={{ margin: '8px 0 12px' }}>{doubt.text}</p>
      <div className="row">
        <button className={`like-btn ${doubt.likedByMe ? 'liked' : ''}`} onClick={like}>▲ {doubt.likeCount}</button>
        <button className="btn sm ghost" onClick={() => setOpen((o) => !o)}>{doubt.comments.length} comment{doubt.comments.length === 1 ? '' : 's'}</button>
      </div>

      {open && (
        <div className="comments">
          {doubt.comments.map((c) => (
            <div key={c.id} className="comment">
              <strong>{c.author?.name}</strong>{c.author?.role === 'mentor' && <span className="badge badge-mentor" style={{ marginLeft: 6 }}>mentor</span>}
              <span> — {c.text}</span>
            </div>
          ))}
          <form className="inline-form" onSubmit={addComment}>
            <input style={{ flex: 1, minWidth: 220 }} placeholder={me.role === 'mentor' ? 'Write an answer…' : 'Add a comment…'} value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn sm">{me.role === 'mentor' ? 'Answer' : 'Reply'}</button>
          </form>
        </div>
      )}
    </div>
  );
}
