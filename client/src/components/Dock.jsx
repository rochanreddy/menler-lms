import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';

// The dock, showing as many tabs as actually fit and folding the rest into
// More. It used to be one row that scrolled sideways with the scrollbar hidden,
// which was fine for a student's eight tabs and not for an admin's fifteen: on
// an ordinary laptop everything past Webinar sat off the edge of the screen
// with nothing to say it was there.
//
// The fit is measured, not guessed. Every tab is laid out once in an invisible
// copy of the dock (same classes, so the same fonts and padding at whatever
// breakpoint applies), and the visible row takes tabs in order until the next
// one would push More off the screen. Order never changes with the page you are
// on, so a tab is always where you last saw it; when the current page is one
// of the folded tabs, More takes its icon and label and lights up, so the dock
// still says where you are standing.

const MORE = { label: 'More', path: '__more' };

function isActive(pathname, t) {
  if (t.path === '') return pathname === '/app' || pathname === '/app/';
  const base = `/app/${t.path}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export default function Dock({ tabs, prefetch = {}, badge = () => false }) {
  const { pathname } = useLocation();
  const measureRef = useRef(null);
  const navRef = useRef(null);
  const moreRef = useRef(null);
  const menuRef = useRef(null);
  const [fit, setFit] = useState(tabs.length);
  const [menu, setMenu] = useState(null); // { bottom, right } while open

  // How many tabs fit, re-measured whenever the space or the fonts change.
  const measure = useCallback(() => {
    const row = measureRef.current;
    if (!row) return;
    const items = [...row.children];
    const widths = items.map((el) => el.getBoundingClientRect().width);
    const moreW = widths.pop();
    const cs = getComputedStyle(row);
    const gap = parseFloat(cs.columnGap) || 0;
    const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    // The dock's own limit: max-width calc(100vw - 20px), or left/right 10px on
    // phones. Less a little slack, because the active tab's label is bold and
    // the ruler's are not.
    const avail = document.documentElement.clientWidth - 20 - chrome - 8;

    // On phones the tabs share the width and shorten their labels (styles.css,
    // max-width 900px), so a tab only needs its min-width there, not its
    // label's: eight student tabs fit a 390px phone as before, and only a row
    // that cannot fit even at the minimum folds into More.
    const real = navRef.current?.querySelector('.dock-item');
    const shared = real && parseFloat(getComputedStyle(real).flexGrow) > 0;
    if (shared) {
      const minW = parseFloat(getComputedStyle(real).minWidth) || 44;
      const slots = Math.floor((avail + 8 + gap) / (minW + gap));
      setFit(widths.length <= slots ? widths.length : Math.max(1, slots - 1));
      return;
    }

    const total = widths.reduce((s, w, i) => s + w + (i ? gap : 0), 0);
    if (total <= avail) { setFit(widths.length); return; }
    let used = moreW;
    let n = 0;
    while (n < widths.length && used + gap + widths[n] <= avail) { used += gap + widths[n]; n += 1; }
    setFit(Math.max(1, n));
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (measureRef.current) ro.observe(measureRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, tabs]);

  const shown = tabs.slice(0, fit);
  const folded = tabs.slice(fit);
  const activeFolded = folded.find((t) => isActive(pathname, t));
  const foldedBadge = folded.some(badge);

  const close = useCallback(() => setMenu(null), []);
  function toggle() {
    if (menu) return close();
    const r = moreRef.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    setMenu({ bottom: window.innerHeight - r.top + 8, right: Math.max(10, vw - r.right) });
  }

  // Closes on navigation, a click elsewhere, Escape, or the window changing size.
  useEffect(close, [pathname, fit, close]);
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || moreRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') { close(); moreRef.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    menuRef.current?.querySelector('a')?.focus();
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu, close]);

  const link = (t, className, children) => (
    <NavLink
      key={t.path}
      to={t.path ? `/app/${t.path}` : '/app'}
      end={t.path === ''}
      className={({ isActive: on }) => `${className} ${on ? 'on' : ''}`}
      title={t.label}
      aria-label={t.label}
      // Start fetching the chunk on hover/focus so the click resolves
      // from cache instead of waiting on the network.
      {...(prefetch[t.path] ? { onMouseEnter: prefetch[t.path], onFocus: prefetch[t.path] } : {})}
    >
      {children}
    </NavLink>
  );

  return (
    <>
      <nav className="dock" aria-label="Main" ref={navRef}>
        {shown.map((t) => link(t, 'dock-item', <>
          <Icon name={t.label} />
          <span className="dock-label">{t.label}</span>
          {badge(t) && <span className="dock-dot" aria-label="New messages" />}
        </>))}
        {folded.length > 0 && (
          <button
            ref={moreRef}
            type="button"
            className={`dock-item dock-more ${activeFolded ? 'on' : ''} ${menu ? 'is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={!!menu}
            title={activeFolded ? `${activeFolded.label}, and ${folded.length - 1} more` : `${folded.length} more`}
            onClick={toggle}
          >
            <Icon name={activeFolded ? activeFolded.label : 'more'} />
            <span className="dock-label">{activeFolded ? activeFolded.label : 'More'}</span>
            {foldedBadge && <span className="dock-dot" aria-label="New messages" />}
          </button>
        )}
      </nav>

      {menu && (
        <div ref={menuRef} className="dock-menu" role="menu" style={{ bottom: menu.bottom, right: menu.right }}>
          {folded.map((t) => link(t, 'dock-menu-item', <>
            <Icon name={t.label} />
            <span>{t.label}</span>
            {badge(t) && <span className="dock-menu-dot" aria-label="New messages" />}
          </>))}
        </div>
      )}

      {/* The ruler: every tab plus More, laid out invisibly so the real row
          knows how wide each one is at the current breakpoint. */}
      <div className="dock dock-measure" ref={measureRef} aria-hidden="true">
        {[...tabs, MORE].map((t) => (
          <span key={t.path} className="dock-item">
            <Icon name={t.label === 'More' ? 'more' : t.label} />
            <span className="dock-label">{t.label}</span>
          </span>
        ))}
      </div>
    </>
  );
}
