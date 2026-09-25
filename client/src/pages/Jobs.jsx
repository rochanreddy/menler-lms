import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Empty from '../components/Empty.jsx';
import { Alert, Button, Checkbox, Input, Select, Skeleton, Textarea } from '../components/ui/index.js';

// The job board. Students and admins read the same list; only the admin can
// post an opening by hand, and remove one they posted.
//
// It is NOT the whole feed. The server picks the 300 postings that best fit
// what Menler teaches (server/utils/jobShortlist.js) and this page is those
// 300, fifty to a page. Every filter narrows within them. A board of 25,000
// is a search engine; a student finishing the course needs an editor.
//
// Each card says why it made the list ("internship · Bengaluru · direct
// apply · matches claude"), because a curated list nobody can account for
// reads as an arbitrary one.

const EMPTY = { domain: '', place: '', workType: '', experience: '', search: '' };

const buildPath = (filters, page) => {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) q.set(key, value);
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `/jobs?${s}` : '/jobs';
};

/** How long ago, in the units people think in. */
function ago(value) {
  if (!value) return '';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

const isFresh = (value) => value && Date.now() - new Date(value).getTime() < 2 * 86400000;

/** Two letters and a tone for the company, when there is no logo. */
function monogram(company) {
  const name = (company || '?').trim() || '?';
  const words = name.split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return { initials, tone: String((hash % 6) + 1) };
}

/**
 * The employer's logo where a source gave one, the monogram otherwise. Most of
 * the feed ships no logo, so the monogram is the normal case; onError covers a
 * logo URL that has since died, which would otherwise show a broken image.
 */
function CompanyLogo({ src, company }) {
  const [failed, setFailed] = useState(false);
  const { initials, tone } = monogram(company);

  if (src && !failed) {
    return (
      <img
        className="job-logo job-logo-img"
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <div className="job-logo" data-tone={tone} aria-hidden="true">{initials}</div>;
}

export default function Jobs() {
  const { user } = useOutletContext();
  const isAdmin = user.role === 'admin';

  const [filters, setFilters] = useState(EMPTY);
  const [searchBox, setSearchBox] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [postOpen, setPostOpen] = useState(false);
  const topRef = useRef(null);

  const load = () => {
    setErr('');
    return api(buildPath(filters, page))
      .then(setData)
      .catch((e) => setErr(e.message || 'Could not load the job board.'));
  };

  useEffect(() => { load(); }, [filters, page]);

  // Search waits for a pause in typing, rather than asking on every letter.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchBox.trim() ? f : { ...f, search: searchBox.trim() }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchBox]);

  const setFilter = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value }));
    setPage(1);
  };

  const clearAll = () => {
    setFilters(EMPTY);
    setSearchBox('');
    setPage(1);
  };

  const goTo = (next) => {
    setPage(next);
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const facets = data?.facets;
  const filtered = Object.values(filters).some(Boolean);

  // A domain with nothing in the 300 is shown and disabled rather than hidden,
  // so the menu says "none right now" instead of looking incomplete.
  const domainOptions = useMemo(
    () => (facets?.domains || []).map((d) => ({
      value: d.value,
      label: `${d.label} (${d.count})`,
      disabled: d.count === 0,
    })),
    [facets],
  );
  const without = (list) => (list || []).filter((o) => o.value !== 'unspecified');

  const labelOf = useMemo(() => {
    const map = new Map();
    for (const list of [facets?.domains, facets?.workTypes, facets?.levels]) {
      for (const o of list || []) map.set(o.value, o.label);
    }
    return (v) => map.get(v) || v;
  }, [facets]);

  return (
    <div className="jobs">
      <div className="page-head" ref={topRef}>
        <div>
          <div className="eyebrow">Jobs</div>
          <h1>{isAdmin ? 'Job board' : 'Jobs picked for you'}</h1>
          <p>
            The 300 openings that best fit what Menler teaches, chosen from every live listing and
            refreshed each morning.
          </p>
        </div>
        {isAdmin && !postOpen && (
          <Button onClick={() => setPostOpen(true)}>Post an opening</Button>
        )}
      </div>

      {isAdmin && postOpen && (
        <PostOpening
          domains={facets?.domains || []}
          workTypes={without(facets?.workTypes)}
          levels={without(facets?.levels)}
          onClose={() => setPostOpen(false)}
          onPosted={() => { setPostOpen(false); load(); }}
        />
      )}

      {data && !data.feedAvailable && (
        <Alert tone="warning" title="The job feed is not connected">
          {isAdmin
            ? 'Only openings posted here are showing. The feed needs JOBS_MONGODB_URI set on the server.'
            : 'Only openings shared by the team are showing right now.'}
        </Alert>
      )}

      <div className="jobs-bar">
        <div className="jobs-search">
          <Input
            ariaLabel="Search jobs"
            placeholder="Search role or company"
            value={searchBox}
            onChange={(e) => setSearchBox(e.target.value)}
          />
        </div>
        <Select ariaLabel="Domain" placeholder="All domains" value={filters.domain} onChange={setFilter('domain')} options={domainOptions} />
        <Select ariaLabel="Place" placeholder="Anywhere" value={filters.place} onChange={setFilter('place')} options={facets?.places || []} />
        <Select ariaLabel="Type" placeholder="Any type" value={filters.workType} onChange={setFilter('workType')} options={without(facets?.workTypes)} />
        <Select ariaLabel="Level" placeholder="Any level" value={filters.experience} onChange={setFilter('experience')} options={without(facets?.levels)} />
        {filtered && <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button>}
      </div>

      {err && <Alert tone="error">{err}</Alert>}

      {!data && !err && <Skeleton rows={6} label="Loading the job board…" />}

      {data && (
        <>
          <div className="jobs-count">
            <strong>
              {filtered ? `${data.total} of ${data.shortlistSize}` : data.total} openings
            </strong>
            {data.pages > 1 && <span className="muted">Page {data.page} of {data.pages}</span>}
          </div>

          {data.jobs.length === 0 ? (
            <div className="list">
              <Empty
                inline
                icon="jobs"
                title={filtered ? 'Nothing in the 300 matches these filters.' : 'No openings on the board right now.'}
                hint={filtered
                  ? 'The board holds the 300 best-fit roles, so a narrow filter can come up empty. Loosen one and try again.'
                  : 'New roles arrive every morning.'}
                action={filtered ? { label: 'Clear filters', onClick: clearAll } : undefined}
              />
            </div>
          ) : (
            <div className="list">
              {data.jobs.map((job) => (
                <JobRow key={job.id} job={job} isAdmin={isAdmin} labelOf={labelOf} onRemoved={load} />
              ))}
            </div>
          )}

          {data.pages > 1 && (
            <nav className="jobs-pager" aria-label="Pages">
              <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => goTo(data.page - 1)}>
                Previous
              </Button>
              <span>Page {data.page} of {data.pages}</span>
              <Button variant="secondary" size="sm" disabled={data.page >= data.pages} onClick={() => goTo(data.page + 1)}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function JobRow({ job, isAdmin, labelOf, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const place = job.location || job.country || '';
  const workType = job.workType !== 'unspecified' ? job.workType : '';
  const level = job.experienceLevel !== 'unspecified' ? job.experienceLevel : '';
  const canRemove = isAdmin && job.origin === 'manual';

  async function remove() {
    if (!window.confirm('Remove this opening?')) return;
    setBusy(true);
    try {
      await api(`/jobs/${job.id}`, { method: 'DELETE' });
      onRemoved();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    // The whole card opens the posting: the Apply button is a real link
    // stretched across the panel (row-link), so middle-click, "copy link" and
    // the focus ring all still work. Remove is lifted above it.
    <article className={`panel list-row job-row ${job.url ? 'is-linked' : ''}`}>
      <div className="job-main">
        <CompanyLogo src={job.companyLogo} company={job.company} />
        <div className="job-id">
          <h3 className="job-title">{job.title || 'Untitled role'}</h3>
          <div className="job-meta">
            <b>{job.company || 'Company not stated'}</b>
            {place && <><i aria-hidden="true">·</i><span>{place}</span></>}
          </div>

          <div className="job-tags">
            {job.domain && <span className="badge">{labelOf(job.domain)}</span>}
            {job.origin === 'manual' && <span className="badge badge-submitted">Shared by the team</span>}
            {job.country === 'India' && <span className="badge badge-muted">India</span>}
            {job.isRemote && <span className="badge badge-muted">Remote</span>}
            {workType && <span className="badge badge-muted">{labelOf(workType)}</span>}
            {/* An internship is a level and an engagement at once; printing it
                twice makes the row look broken. */}
            {level && level !== workType && <span className="badge badge-muted">{labelOf(level)}</span>}
          </div>

          {job.reasons?.length > 0 && (
            <p className="job-why">Why it’s here: <b>{job.reasons.join(' · ')}</b></p>
          )}
          {job.description && <p className="job-desc">{job.description}</p>}
        </div>
      </div>

      <div className="row job-side">
        <span className={isFresh(job.postedAt) ? 'job-new' : 'job-age'}>{ago(job.postedAt)}</span>
        {job.url && (
          <a
            className="btn job-apply row-link"
            href={job.url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Apply for ${job.title || 'this role'}${job.company ? ` at ${job.company}` : ''} (opens in a new tab)`}
          >
            Apply <span aria-hidden="true">↗</span>
          </a>
        )}
        {canRemove && (
          <Button variant="destructive" size="sm" loading={busy} onClick={remove}>Remove</Button>
        )}
      </div>
    </article>
  );
}

const BLANK = {
  title: '', company: '', location: '', applyUrl: '', description: '',
  domain: '', workType: 'unspecified', experienceLevel: 'unspecified', isRemote: false,
};

function PostOpening({ domains, workTypes, levels, onClose, onPosted }) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.company.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/jobs', { method: 'POST', body: { ...form, domain: form.domain || null } });
      setForm(BLANK);
      onPosted();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel jobs-post" onSubmit={submit}>
      <div className="jobs-post-head">
        <div>
          <h3>Post an opening</h3>
          <p className="muted">
            For roles that never reach a job board. It goes to the top of the list for every
            student, and drops off after ten days like any other.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>

      <div className="jobs-post-grid">
        <Input label="Title" required value={form.title} onChange={set('title')} />
        <Input label="Company" required value={form.company} onChange={set('company')} />
        <Input label="Location" placeholder="Bengaluru, or Anywhere" value={form.location} onChange={set('location')} />
        <Input label="Apply link" type="url" placeholder="https://" value={form.applyUrl} onChange={set('applyUrl')} />
        <Select
          label="Domain"
          placeholder="No domain"
          value={form.domain}
          onChange={set('domain')}
          options={domains.map((d) => ({ value: d.value, label: d.label }))}
        />
        <Select label="Type" value={form.workType} onChange={set('workType')} options={[{ value: 'unspecified', label: 'Not specified' }, ...workTypes]} />
        <Select label="Level" value={form.experienceLevel} onChange={set('experienceLevel')} options={[{ value: 'unspecified', label: 'Not specified' }, ...levels]} />
        <div className="jobs-post-check">
          <Checkbox
            label="Remote"
            checked={form.isRemote}
            onChange={(e) => setForm((f) => ({ ...f, isRemote: e.target.checked }))}
          />
        </div>
      </div>

      <Textarea
        label="Description"
        rows={3}
        placeholder="Optional. What the role is, and who it suits."
        value={form.description}
        onChange={set('description')}
      />

      {err && <Alert tone="error">{err}</Alert>}

      <div className="jobs-post-actions">
        <Button type="submit" loading={busy} disabled={!form.title.trim() || !form.company.trim()}>
          Post opening
        </Button>
      </div>
    </form>
  );
}
