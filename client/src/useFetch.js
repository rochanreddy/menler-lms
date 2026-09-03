import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

// The fetch-into-state pattern, written once.
//
// Every list screen in this app was hand-rolling the same four pieces — a data
// state, a loading flag, a swallowed catch, and a reload function — and getting
// the same two details wrong. This hook fixes both in one place:
//
//   1. `loading` is true only until the FIRST response settles. A reload after
//      a submit or a delete leaves the list on screen instead of replacing it
//      with a skeleton the student then watches repopulate.
//   2. An empty result and a not-yet-arrived result are different things.
//      Callers render `loading` before they render "nothing here yet", which is
//      what stopped empty states being used as loading states.
//
// Returns { data, loading, error, reload, setData }. `setData` is there for the
// callers that already know what changed — splicing one item from a mutation
// response beats refetching the whole collection to update a single card.
export default function useFetch(path, { select, initial = null } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Kept in a ref so an inline arrow (`select: (d) => d.quizzes || []`) doesn't
  // change identity every render and re-fire the effect forever.
  const selectRef = useRef(select);
  selectRef.current = select;

  // Guards against setting state on an unmounted component — a student who
  // taps a card and immediately hits back would otherwise land a response on
  // a gone component.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const reload = useCallback(async () => {
    try {
      const raw = await api(path);
      if (!alive.current) return undefined;
      const next = selectRef.current ? selectRef.current(raw) : raw;
      setData(next);
      setError('');
      return next;
    } catch (err) {
      if (alive.current) setError(err.message || 'Something went wrong.');
      return undefined;
    } finally {
      // Only ever clears — never set back to true, which is rule 1 above.
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload, setData };
}
