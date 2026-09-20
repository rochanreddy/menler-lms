import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { Badge, Button, Card, Progress, Skeleton, Stack, Tabs, Text } from '../../components/ui/index.js';
import Empty from '../../components/Empty.jsx';

// What every student said about every class. The admin sees the whole board; a
// mentor opens the same page and sees their own batches' classes, with no name
// against any review — the scores and the words are how a mentor gets better,
// and the anonymity is what keeps them worth reading.
//
// Three levels, narrowing: programme → batch → the reviews themselves. The
// batch row is not hidden while a programme has only one cohort; it is the
// level a second September intake appears at, and a filter that appears from
// nowhere is harder to trust than one that was always there.
//
// Reviews are grouped by class, not listed flat: the question an admin arrives
// with is "how did Saturday's class go", and a class averaging 2.1 is the
// thing to see first, not the newest comment.
const QUESTIONS = [
  ['overall', 'Session'],
  ['useful', 'Usefulness'],
  ['understanding', 'Understood'],
  ['instructor', 'Instructor'],
];
const SCORE_KEYS = QUESTIONS.map(([k]) => k);
const avgOf = (rows, key) => (rows.length ? Math.round((rows.reduce((n, r) => n + (r.scores[key] || 0), 0) / rows.length) * 10) / 10 : 0);
const dayLabel = (d) => (d ? new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const timeLabel = (d) => (d ? new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/** A rating as stars. Always beside a number, never colour alone. */
function Stars({ n, size = 'md' }) {
  return (
    <span className={`fb-stars fb-stars-${size}`} role="img" aria-label={`${n} out of 5`}>
      <span className="fb-stars-on">{'★'.repeat(n)}</span>
      <span className="fb-stars-off">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

/** One row of mutually exclusive filters. The first option is always "any". */
function ChipRow({ label, options, value, onChange }) {
  return (
    <div className="fb-chips">
      <Text role="label">{label}</Text>
      {options.map((o) => (
        <Button key={String(o.value)} size="sm" variant={o.value === value ? 'secondary' : 'ghost'} onClick={() => onChange(o.value)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export default function AdminFeedback() {
  const { user } = useOutletContext();
  const mentor = user?.role === 'mentor';
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [programId, setProgramId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [metric, setMetric] = useState('overall'); // which score the rating filter reads
  const [rating, setRating] = useState(0); // 0 = any

  // The scope (programme + batch) is a server query; the rating filter narrows
  // what came back, so the summary keeps describing the whole cohort while the
  // list below shows only the 2★ comments you clicked.
  useEffect(() => {
    setData(null);
    setErr('');
    const qs = new URLSearchParams();
    if (programId) qs.set('programId', programId);
    if (batchId) qs.set('batchId', batchId);
    api(`/reviews${qs.toString() ? `?${qs}` : ''}`).then(setData).catch((e) => setErr(e.message));
  }, [programId, batchId]);

  const allBatches = data?.batches || [];
  const scope = data?.reviews || [];

  const programmes = useMemo(() => {
    const seen = new Map();
    for (const b of allBatches) if (b.programId && !seen.has(b.programId)) seen.set(b.programId, b.program || b.name);
    return [...seen].map(([id, name]) => ({ value: id, label: name }));
  }, [allBatches]);

  const batchesHere = useMemo(() => allBatches.filter((b) => !programId || b.programId === programId), [allBatches, programId]);

  const visible = useMemo(
    () => scope.filter((r) => !rating || r.scores[metric] === rating),
    [scope, rating, metric],
  );

  // How the chosen question was answered, 5 down to 1.
  const spread = useMemo(() => {
    const by = [5, 4, 3, 2, 1].map((n) => ({ n, count: scope.filter((r) => r.scores[metric] === n).length }));
    return { by, most: Math.max(1, ...by.map((b) => b.count)) };
  }, [scope, metric]);

  const classes = useMemo(() => {
    const map = new Map();
    for (const r of visible) {
      if (!map.has(r.session.id)) map.set(r.session.id, { session: r.session, batch: r.batch, rows: [] });
      map.get(r.session.id).rows.push(r);
    }
    return [...map.values()].sort((a, b) => new Date(b.session.startsAt || 0) - new Date(a.session.startsAt || 0));
  }, [visible]);

  const metricLabel = QUESTIONS.find(([k]) => k === metric)?.[1] || 'Session';

  return (
    <Stack gap="6">
      <div className="page-head">
        <div>
          <div className="eyebrow">{mentor ? 'Your classes' : 'Admin board'}</div>
          <Text role="heading-1">Feedback</Text>
          <Text role="body" tone="muted">
            {mentor
              ? 'How your classes landed, in the students’ words. Reviews are anonymous — you see what was said, never who said it.'
              : 'How every class landed, in the students’ words.'}
          </Text>
        </div>
      </div>

      {programmes.length > 0 && (
        <Tabs
          tabs={[{ value: '', label: 'All programmes' }, ...programmes]}
          value={programId}
          onChange={(v) => { setProgramId(v); setBatchId(''); }}
          label="Programme"
        />
      )}

      {batchesHere.length > 0 && (
        <ChipRow
          label="Batch"
          value={batchId}
          onChange={setBatchId}
          options={[{ value: '', label: batchesHere.length > 1 ? 'All batches' : 'All' }, ...batchesHere.map((b) => ({ value: b.id, label: b.name }))]}
        />
      )}

      {err && <Text role="body" tone="destructive">{err}</Text>}
      {!data && !err && <Skeleton rows={4} label="Loading feedback…" />}

      {data && scope.length === 0 && (
        <Empty
          icon="forum"
          title="No reviews here yet."
          hint={mentor
            ? 'Your students are asked to review a class the first time they open the LMS after it ends.'
            : 'Students are asked to review a class the first time they open the LMS after it ends.'}
        />
      )}

      {data && scope.length > 0 && (
        <>
          <Card>
            <div className="fb-summary">
              <div className="fb-score">
                <Text role="display">{avgOf(scope, 'overall')}</Text>
                <Stars n={Math.round(avgOf(scope, 'overall'))} size="lg" />
                <Text role="caption">
                  {scope.length} review{scope.length === 1 ? '' : 's'} · {new Set(scope.map((r) => r.session.id)).size} class{new Set(scope.map((r) => r.session.id)).size === 1 ? '' : 'es'}
                </Text>
              </div>

              {/* Each question's average. Clicking one makes it the question
                  the spread and the rating filter read. */}
              <div className="fb-metrics">
                {QUESTIONS.map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    className={`fb-spread-row fb-spread-btn ${metric === key ? 'on' : ''}`}
                    onClick={() => setMetric(key)}
                    aria-pressed={metric === key}
                  >
                    <span className="fb-pace-label">{label}</span>
                    <Progress value={avgOf(scope, key)} max={5} label="" showValue={false} />
                    <span className="fb-spread-count">{avgOf(scope, key)}</span>
                  </button>
                ))}
              </div>

              {/* The spread doubles as the rating filter: click 2★ to read those. */}
              <div className="fb-spread">
                <Text role="label">{metricLabel} scores</Text>
                {spread.by.map((b) => (
                  <button
                    type="button"
                    className={`fb-spread-row fb-spread-btn ${rating === b.n ? 'on' : ''}`}
                    key={b.n}
                    onClick={() => setRating(rating === b.n ? 0 : b.n)}
                    aria-pressed={rating === b.n}
                    aria-label={`${b.count} review${b.count === 1 ? '' : 's'} at ${b.n} for ${metricLabel}`}
                  >
                    <span className="fb-spread-label">{b.n}★</span>
                    <Progress value={b.count} max={spread.most} label="" showValue={false} />
                    <span className="fb-spread-count">{b.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <div className="fb-filters">
            <ChipRow label="Question" value={metric} onChange={(v) => setMetric(v)} options={QUESTIONS.map(([k, l]) => ({ value: k, label: l }))} />
            <ChipRow
              label={`${metricLabel} rating`}
              value={rating}
              onChange={setRating}
              options={[{ value: 0, label: 'Any' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${n}★` }))]}
            />
            {rating > 0 && (
              <div className="fb-filter-note">
                <Text role="caption">Showing {visible.length} of {scope.length}</Text>
                <Button size="sm" variant="link" onClick={() => setRating(0)}>Clear</Button>
              </div>
            )}
          </div>
        </>
      )}

      {data && scope.length > 0 && visible.length === 0 && (
        <Empty icon="forum" title="Nothing matches that filter." hint="Clear it to see every review in this batch." />
      )}

      {classes.map((c) => (
        <Card key={c.session.id}>
          <Stack gap="4">
            <div className="fb-class-head">
              <div>
                <Text role="heading-3">{c.session.title || 'A class'}</Text>
                <Text role="caption">{dayLabel(c.session.startsAt)}{c.batch ? ` · ${c.batch}` : ''}</Text>
              </div>
              <div className="fb-class-score">
                <Stars n={Math.round(avgOf(c.rows, 'overall'))} />
                <Text role="caption">{avgOf(c.rows, 'overall')} from {c.rows.length}</Text>
              </div>
            </div>

            <div className="fb-reviews">
              {c.rows.map((r) => (
                <div className="fb-review" key={r.id}>
                  <div className="fb-review-head">
                    <Stars n={r.scores.overall} size="sm" />
                    {!r.attended && <Badge>Did not attend</Badge>}
                    <span className="fb-review-who">{r.student.name || r.student.email || 'A student'} · {timeLabel(r.createdAt)}</span>
                  </div>
                  <div className="fb-review-scores">
                    {SCORE_KEYS.filter((k) => k !== 'overall').map((k) => (
                      <span className="fb-review-score" key={k}>
                        {QUESTIONS.find(([q]) => q === k)[1]} <strong>{r.scores[k]}</strong>/5
                      </span>
                    ))}
                  </div>
                  {r.comment
                    ? <Text role="body">{r.comment}</Text>
                    : <Text role="caption">No comment left.</Text>}
                </div>
              ))}
            </div>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
