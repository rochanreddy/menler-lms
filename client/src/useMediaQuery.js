import { useEffect, useState } from 'react';

// The one breakpoint below which a layout switches to its phone form (bottom
// sheets instead of side panels). Matches the stylesheet's phone block.
export const MOBILE = '(max-width: 900px)';

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
