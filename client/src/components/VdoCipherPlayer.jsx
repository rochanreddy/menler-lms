import { useEffect, useState } from 'react';

// DRM playback for a VdoCipher video — a session recording or a lesson video,
// whichever `fetchOtp` resolves for. otp/playbackInfo are single-use and
// short-lived (minted server-side on demand), so they're fetched fresh on
// mount, and again on retry, never cached across mounts.
export default function VdoCipherPlayer({ fetchOtp }) {
  const [creds, setCreds] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setCreds(null);
    setError('');
    fetchOtp()
      .then((d) => { if (alive) setCreds(d); })
      .catch((e) => { if (alive) setError(e.message || 'Could not load the video.'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (error) {
    return (
      <div className="panel empty-state lesson-video-error">
        <p className="muted">{error}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-3)' }}>
          <button className="btn sm" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
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
