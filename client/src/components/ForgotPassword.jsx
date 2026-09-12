import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Alert, Button, Input, Stack, Text } from './ui/index.js';

// Forgotten password, in three steps on the login page itself: send a code,
// type it in, choose a new password.
//
// Three screens rather than one form, because they fail differently and a
// person should find out which step went wrong as soon as it does. Asking for
// the code and the new password together means typing a password twice before
// learning the code was mistyped.
//
// The server never says whether an address has an account — so neither does
// this. The wording after step one is deliberately conditional.
const RESEND_SECONDS = 30;

export default function ForgotPassword({ initialEmail = '', onCancel, onDone }) {
  const [step, setStep] = useState('email'); // email → code → password → done
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef(null);

  // A resend button that can be hammered is how one person gets ten identical
  // emails and the address lands in spam.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  const run = async (fn) => {
    if (busy) return;
    setErr(''); setBusy(true);
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const sendCode = (e) => {
    e?.preventDefault();
    return run(async () => {
      await api('/auth/forgot', { method: 'POST', body: { email: email.trim() } });
      setStep('code');
      setCooldown(RESEND_SECONDS);
    });
  };

  const verify = (e) => {
    e.preventDefault();
    return run(async () => {
      const r = await api('/auth/verify-otp', { method: 'POST', body: { email: email.trim(), code } });
      setToken(r.token);
      setStep('password');
    });
  };

  const reset = (e) => {
    e.preventDefault();
    if (password !== confirm) { setErr('Those two passwords are different.'); return undefined; }
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return undefined; }
    return run(async () => {
      await api('/auth/reset', { method: 'POST', body: { email: email.trim(), token, password } });
      setStep('done');
    });
  };

  return (
    <div className="auth-form-wrap">
      <form className="auth-form" onSubmit={step === 'email' ? sendCode : step === 'code' ? verify : reset}>
        <Stack gap="6">
          <div>
            <Text role="heading-1">
              {step === 'done' ? 'Password changed' : 'Reset your password'}
            </Text>
            {step === 'email' && <Text role="body" tone="muted">We’ll email you a six-digit code.</Text>}
            {step === 'code' && (
              <Text role="body" tone="muted">
                If an account exists for <strong>{email}</strong>, a six-digit code is on its way. It expires in 10 minutes.
              </Text>
            )}
            {step === 'password' && <Text role="body" tone="muted">Code accepted. Choose a new password.</Text>}
          </div>

          {step === 'email' && (
            <Input
              label="Email"
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          )}

          {step === 'code' && (
            <Stack gap="3">
              <Input
                label="Six-digit code"
                id="forgot-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                // Digits only, six of them: pasting "123 456" from a phone
                // notification should just work.
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
              />
              <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <Button type="button" variant="link" size="sm" disabled={cooldown > 0 || busy} onClick={() => sendCode()}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </Button>
                <Button type="button" variant="link" size="sm" onClick={() => { setStep('email'); setCode(''); setErr(''); }}>
                  Use a different email
                </Button>
              </div>
            </Stack>
          )}

          {step === 'password' && (
            <Stack gap="4">
              <Input
                label="New password"
                id="forgot-new"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                help="At least 8 characters."
                required
                autoFocus
              />
              <Input
                label="Confirm new password"
                id="forgot-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Stack>
          )}

          {err && <Alert tone="error">{err}</Alert>}

          {step === 'done' ? (
            <>
              <Alert tone="success" title="You can sign in now.">
                Any device that was signed in to this account has been signed out.
              </Alert>
              <Button type="button" size="lg" onClick={() => onDone?.(email.trim())}>Back to sign in</Button>
            </>
          ) : (
            <>
              <Button type="submit" size="lg" loading={busy}>
                {step === 'email' ? 'Send code' : step === 'code' ? 'Verify code' : 'Change password'}
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>Back to sign in</Button>
            </>
          )}
        </Stack>
      </form>
    </div>
  );
}
