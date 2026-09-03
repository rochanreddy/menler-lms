import { useEffect, useRef, useState } from 'react';
import { heartbeatPlayback, releasePlayback, releasePlaybackOnUnload } from '../api.js';

// DRM playback for a VdoCipher video — a session recording or a lesson video,
// whichever `fetchOtp` resolves for. otp/playbackInfo are single-use and
// short-lived (minted server-side on demand), so they're fetched fresh on
// mount, and again on retry, never cached across mounts.
//
// Minting the OTP is also what takes the account's watch lock (see
// server/routes/playback.js): one device plays at a time. That means three
// states this component has to render rather than one —
//
//   playing   the OTP came back, the lock is ours, and we keep it by
//             heartbeating while the iframe is mounted.
//   busy      the OTP was refused because another device is watching. The
//             student is told which, and offered "watch here instead".
//   taken     we were playing and lost the lock — the other device took over,
//             or this session was signed out. The iframe is torn down, which
//             is what actually stops playback.

// Comfortably inside the server's 70s lease TTL: two heartbeats may be lost to
// a bad connection before the lock is considered abandoned.
const HEARTBEAT_MS = 20_000;

export default function VdoCipherPlayer({ fetchOtp }) {
  const [creds, setCreds] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // { device, title } — someone else is watching
  const [lost, setLost] = useState(null); // { device } — we were watching and lost it
  const [attempt, setAttempt] = useState(0);
  // Set by the "watch here instead" button and consumed by the next fetch, so
  // a takeover is always a deliberate act rather than a retry that silently
  // escalates.
  const takeover = useRef(false);

  useEffect(() => {
    let alive = true;
    setCreds(null);
    setError('');
    setBusy(null);
    setLost(null);
    const wanted = takeover.current;
    takeover.current = false;
    fetchOtp(wanted)
      .then((d) => { if (alive) setCreds(d); })
      .catch((e) => {
        if (!alive) return;
        if (e.code === 'playback_busy') setBusy({ device: e.data?.device, title: e.data?.title });
        else setError(e.message || 'Could not load the video.');
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Hold the lock for as long as the video is on screen, and give it back the
  // moment it isn't. Without the release, closing a lesson would leave the
  // account locked out of video for the length of the lease.
  useEffect(() => {
    if (!creds) return undefined;
    const timer = setInterval(() => {
      heartbeatPlayback().catch((e) => {
        // 409: another device took over. 401: this session was signed out from
        // elsewhere — api() has already raised that globally, and dropping the
        // iframe here is what stops the audio playing under the stop page.
        if (e.code === 'playback_busy') setLost({ device: e.data?.device });
        else if (e.code === 'session_revoked') setLost({ device: '' });
        // Anything else (a flaky network) is left alone: the lease survives
        // two missed heartbeats, so one failure is not worth stopping over.
      });
    }, HEARTBEAT_MS);
    // A closed tab never runs cleanup, so the unload path needs its own release.
    const onUnload = () => releasePlaybackOnUnload();
    window.addEventListener('pagehide', onUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', onUnload);
      releasePlayback();
    };
  }, [creds]);

  const retry = (asTakeover) => { takeover.current = !!asTakeover; setAttempt((n) => n + 1); };

  if (error) {
    return (
      <div className="panel empty-state lesson-video-error">
        <p className="muted">{error}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-3)' }}>
          <button className="btn sm" onClick={() => retry(false)}>Try again</button>
        </div>
      </div>
    );
  }

  // Either we never got the lock, or we had it and it was taken. Same shape,
  // and both end in the same offer, so they share a panel.
  const blocked = busy || lost;
  if (blocked) {
    const device = blocked.device || 'another device';
    return (
      <div className="panel empty-state lesson-video-error">
        <p><strong>{lost ? 'Playback stopped' : 'Already watching somewhere else'}</strong></p>
        <p className="muted">
          {lost
            ? `This account started watching on ${device}, so playback stopped here.`
            : `This account is currently being used on ${device}${busy.title ? ` — watching ${busy.title}` : ''}.`}
          {' '}Only one device can watch at a time.
        </p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-3)' }}>
          <button className="btn sm" onClick={() => retry(true)}>Watch here instead</button>
        </div>
      </div>
    );
  }

  if (!creds) return <div className="skeleton sk-path" style={{ aspectRatio: '16/9' }} />;

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
      <iframe
        src={`https://player.vdocipher.com/v2/?otp=${encodeURIComponent(creds.otp)}&playbackInfo=${encodeURIComponent(creds.playbackInfo)}`}
        style={{ border: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 'var(--radius-sm)' }}
        allow="encrypted-media"
        allowFullScreen
        title="Class recording"
      />
    </div>
  );
}
