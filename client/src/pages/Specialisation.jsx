import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Empty, { Loading } from '../components/Empty.jsx';
import FileViewer from '../components/FileViewer.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import LineIcon from '../components/LineIcon.jsx';
import Markdown from '../components/Markdown.jsx';
import ReadingPicker, { openOutside, opensInReader } from '../components/ReadingPicker.jsx';

// A student's specialisation: the track they took up after the six weeks of
// the AI Generalist. Its own tab, shown only once the admin has placed them
// (AppShell asks /specialisations/mine), and its own page rather than a
// fourth layout of Learning — a specialisation has no batch, no sessions and
// no progress ticks, and pretending otherwise would put empty rails on screen.
//
// The admin's "Student view" renders the same <SpecialisationView>, so what
// they check there is what a student gets.
export default function Specialisation() {
  const navigate = useNavigate();
  const [state, setState] = useState(null); // { status, specialisation, allotted_at }
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/specialisations/mine').then(setState).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="panel"><Empty icon="specialisations" title="Couldn’t open your specialisation." hint={err} /></div>;
  if (!state) return <div className="panel"><Loading rows={4} /></div>;

  const spec = state.specialisation;
  if (!spec) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="eyebrow">Specialisation</div>
            <h1>After the Generalist</h1>
          </div>
        </div>
        <div className="panel">
          {state.status === 'opted_out' ? (
            <Empty
              icon="specialisations"
              title="You chose not to take a specialisation."
              hint="If that has changed, tell the Menler team and they will place you in one."
              action={{ label: 'Contact support', onClick: () => navigate('/app/support') }}
            />
          ) : (
            <Empty
              icon="specialisations"
              title="You’re not in a specialisation yet."
              hint="Specialisations follow the six weeks of the AI Generalist. Once the Menler team places you in one, its syllabus and teacher notes appear here."
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your specialisation</div>
          <h1>{spec.title}</h1>
          <p>After the AI Generalist{state.allotted_at ? ` · placed ${new Date(state.allotted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
        </div>
      </div>
      <SpecialisationView spec={spec} />
    </div>
  );
}

const named = (url, name, fallback) => name || fallback || url;

/** Everything a student reads, for one specialisation. */
export function SpecialisationView({ spec }) {
  const modules = spec.modules || [];
  const resources = spec.resources || [];
  const [viewer, setViewer] = useState(null);
  const [picker, setPicker] = useState(null);
  // One lesson open at a time, the way a reader works through them.
  const [openLesson, setOpenLesson] = useState(null);

  // One file opens straight away; several open the list. Anything the reader
  // cannot show goes to a new tab, or downloads, rather than a blank box.
  const openItem = (it, label) => {
    setPicker(null);
    if (opensInReader(it.url, it.name)) setViewer({ label, subtitle: it.name || label, url: it.url });
    else openOutside(it);
  };
  const openList = (items, title, label) => {
    if (items.length === 1) openItem(items[0], label);
    else setPicker({ title, items, label });
  };

  // The lesson's notes, then its module's, deduped on url: the module's
  // notes are the promise that "a file for the whole module goes on the
  // module", so they are listed on every lesson in it.
  const notesFor = (m, l) => {
    const seen = new Set();
    const out = [];
    const add = (list, from) => (list || []).forEach((x) => {
      if (!x.url || seen.has(x.url)) return;
      seen.add(x.url);
      out.push({ url: x.url, name: named(x.url, x.name), kind: x.kind || 'notes', from });
    });
    if (l) add(l.materials, 'This lesson');
    add(m.materials, m.title);
    return out;
  };

  const tools = ({ reading, readingName, notes, classLink, subtitle }) => (
    <div className="sp-tools">
      <button
        type="button"
        className="sp-chip"
        disabled={!reading}
        title={reading ? undefined : 'The reading for this hasn’t been attached yet'}
        onClick={() => setViewer({ label: 'Reading material', subtitle: readingName || subtitle, url: reading })}
      >
        <LessonIcon type="pdf" size={14} /> {reading ? 'Reading material' : 'No reading yet'}
      </button>
      <button
        type="button"
        className="sp-chip"
        disabled={!notes.length}
        title={notes.length ? undefined : 'No teacher notes for this yet'}
        onClick={() => openList(notes, subtitle, 'Teacher notes')}
      >
        <LineIcon name="slides" size={14} /> {notes.length === 0 ? 'No teacher notes yet' : notes.length === 1 ? 'Teacher notes' : `Teacher notes · ${notes.length}`}
      </button>
      {classLink !== undefined && (classLink ? (
        <a className="sp-chip" href={classLink} target="_blank" rel="noreferrer"><LineIcon name="video" size={14} /> Watch class video</a>
      ) : (
        <button type="button" className="sp-chip" disabled title="This class’s video hasn’t been posted yet"><LineIcon name="video" size={14} /> Video not available yet</button>
      ))}
    </div>
  );

  return (
    <div className="sp-view">
      {spec.description && (
        <div className="panel sp-about"><Markdown text={spec.description} /></div>
      )}

      {resources.length > 0 && (
        <div className="panel sp-track-res">
          <h3>Track resources</h3>
          <div className="sp-tools">
            {resources.map((r) => (
              <button type="button" className="sp-chip" key={r._id || r.url} onClick={() => openItem({ ...r, name: named(r.url, r.name) }, 'Track resources')}>
                <LessonIcon type={opensInReader(r.url, r.name) ? 'pdf' : 'text'} size={14} /> {named(r.url, r.name)}
              </button>
            ))}
          </div>
        </div>
      )}

      {modules.length === 0 && (
        <div className="panel">
          <Empty
            icon="learning"
            title="Your syllabus is on its way."
            hint="The modules, reading and teacher notes for this specialisation will appear here as they are added. You’ll find them on this tab."
          />
        </div>
      )}

      {modules.map((m, mi) => (
        <section className="panel sp-vmod" key={m._id || mi}>
          <div className="sp-kicker">Module {mi + 1}</div>
          <h2 className="sp-vmod-title">{m.title}</h2>
          {m.summary && <div className="sp-summary"><Markdown text={m.summary} /></div>}
          {tools({ reading: m.readingUrl, readingName: m.readingName, notes: notesFor(m, null), subtitle: m.title })}

          {(m.lessons || []).length > 0 && (
            <ol className="sp-vlessons">
              {m.lessons.map((l, li) => {
                const key = l._id || `${mi}-${li}`;
                const isOpen = openLesson === key;
                const reading = l.readingUrl || m.readingUrl;
                return (
                  <li key={key} className={`sp-vlesson ${isOpen ? 'open' : ''}`}>
                    <button type="button" className="sp-vlesson-head" aria-expanded={isOpen} onClick={() => setOpenLesson(isOpen ? null : key)}>
                      <span className="sp-lesson-n">{li + 1}</span>
                      <span className="sp-vlesson-title">{l.title}</span>
                      <span className="sp-vlesson-chev" aria-hidden="true"><LineIcon name="chevron" size={14} /></span>
                    </button>
                    {isOpen && (
                      <div className="sp-vlesson-body">
                        {tools({
                          reading,
                          readingName: l.readingUrl ? l.readingName : m.readingName,
                          notes: notesFor(m, l),
                          classLink: l.classLink || '',
                          subtitle: l.title,
                        })}
                        {l.body ? <Markdown text={l.body} /> : <p className="muted">Nothing written for this lesson yet — the reading and notes above are where it lives.</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}

      {viewer && <FileViewer {...viewer} onClose={() => setViewer(null)} />}
      {picker && <ReadingPicker title={picker.title} items={picker.items} label={picker.label} onOpen={(it) => openItem(it, picker.label)} onClose={() => setPicker(null)} />}
    </div>
  );
}
