// Relay — Phase 3 login screen. Email + password via Supabase Auth, plus a
// self-serve "Request access" mode: a rostered employee (added in the app)
// creates their own account and chooses their password on first login.
// "Continue in demo mode" bypasses auth and uses the bundled data + free role
// switcher (the prototype's original behavior) for offline demos.
function LoginScreen({ onAuthed, onDemo, initialError }) {
  const [mode, setMode] = React.useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const [err, setErr] = React.useState(initialError || '');
  const [info, setInfo] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const canAuth = !!(window.CDC && window.CDC.auth);
  const signup = mode === 'signup';

  function switchMode(m) { setMode(m); setErr(''); setInfo(''); setPw(''); setPw2(''); }

  async function googleSignIn() {
    if (!window.CDC || !window.CDC.auth || !window.CDC.auth.signInWithGoogle) {
      setErr('Google sign-in is unavailable.'); return;
    }
    setBusy(true); setErr('');
    const { error } = await window.CDC.auth.signInWithGoogle();
    if (error) { setErr(error.message); setBusy(false); }
  }

  async function forgot() {
    if (!email.trim()) { setErr('Enter your email above first, then click "Forgot password?".'); return; }
    setBusy(true); setErr(''); setInfo('');
    try {
      const { error } = await window.CDC.auth.resetPassword(email.trim());
      if (error) setErr(error.message);
      else setInfo(`Password-reset link sent to ${email.trim()} — check your inbox.`);
    } catch (ex) { setErr(ex.message || 'Could not send reset email.'); }
    setBusy(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !pw) { setErr('Enter your email and password.'); return; }
    if (signup) {
      if (pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
      if (pw !== pw2) { setErr('Passwords do not match.'); return; }
    }
    setBusy(true); setErr(''); setInfo('');
    try {
      if (signup) {
        const { data, error } = await window.CDC.auth.signUp(email.trim(), pw);
        if (error) { setErr(error.message); setBusy(false); return; }
        if (!data || !data.session) {
          // "Confirm email" is still ON in the dashboard — no instant session.
          setInfo('Account created — confirm via the email we sent, then sign in.');
          switchMode('signin'); setBusy(false); return;
        }
        try { await window.CDC.auth.logAuthEvent('activated their account and set their first password'); } catch (_) {}
      } else {
        const { error } = await window.CDC.auth.signIn(email.trim(), pw);
        if (error) { setErr(error.message); setBusy(false); return; }
      }
      // Start every session as yourself — clear any stale impersonation.
      try { if (window.CDC.setImpersonation) await window.CDC.setImpersonation(null); } catch (_) {}
      onAuthed();
    } catch (ex) { setErr(ex.message || (signup ? 'Sign-up failed.' : 'Sign-in failed.')); setBusy(false); }
  }

  React.useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = 'light'; r.dataset.density = 'cozy';
    r.style.setProperty('--accent', 'oklch(0.55 0.16 265)');
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--panel-2, #f6f7f9)', padding: 24 }}>
      <div style={{ width: 380, maxWidth: '92vw' }}>
        <div className="row" style={{ gap: 10, marginBottom: 18, justifyContent: 'center' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700 }}>R</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Relay</div>
        </div>
        <div className="card" style={{ background: 'var(--panel, #fff)', border: '1px solid var(--border, #e6e7ea)', borderRadius: 14, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{signup ? 'Request access' : 'Sign in'}</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 18 }}>
            {signup ? 'Create an account with your company email — you must already be on the employee roster.'
              : 'Department Operating Copilot · use your company email'}
          </div>
          {!signup && (
            <React.Fragment>
              <button type="button" onClick={googleSignIn} disabled={!canAuth || busy}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--panel, #fff)', color: 'var(--text, #1b1b1b)',
                  border: '1px solid var(--border, #d8d9dd)', borderRadius: 8 }}>
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
                </svg>
                Sign in with Google
              </button>
              <div className="row" style={{ alignItems: 'center', gap: 10, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border, #e6e7ea)' }} />
                <span className="muted" style={{ fontSize: 11.5 }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border, #e6e7ea)' }} />
              </div>
            </React.Fragment>
          )}
          <form onSubmit={submit}>
            <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@nxtwave.co.in" disabled={!canAuth || busy}
              style={inp} />
            <label style={{ fontSize: 12, fontWeight: 500, display: 'block', margin: '14px 0 4px' }}>Password</label>
            <PwInput value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder={signup ? 'At least 8 characters' : '••••••••'} disabled={!canAuth || busy} />
            {signup && (
              <React.Fragment>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', margin: '14px 0 4px' }}>Confirm password</label>
                <PwInput value={pw2} onChange={(e) => setPw2(e.target.value)}
                  placeholder="Repeat your password" disabled={!canAuth || busy} />
              </React.Fragment>
            )}
            {err && <div style={{ color: 'var(--rose, #c0392b)', fontSize: 12, marginTop: 12 }}>{err}</div>}
            {info && <div style={{ color: 'var(--green, #1e7e34)', fontSize: 12, marginTop: 12 }}>{info}</div>}
            <button className="btn" type="submit" disabled={!canAuth || busy}
              style={{ width: '100%', marginTop: 18, justifyContent: 'center', background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', padding: '9px 0', fontWeight: 600 }}>
              {busy ? (signup ? 'Creating account…' : 'Signing in…') : (signup ? 'Create account' : 'Sign in')}
            </button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              {signup
                ? <span style={{ fontSize: 12 }} className="muted">Already have an account?{' '}
                    <button type="button" onClick={() => switchMode('signin')} disabled={busy}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', padding: 0, fontWeight: 600 }}>Sign in</button>
                  </span>
                : <React.Fragment>
                    <button type="button" onClick={forgot} disabled={!canAuth || busy}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', padding: 0 }}>
                      Forgot password?
                    </button>
                    <span className="muted" style={{ fontSize: 12, margin: '0 8px' }}>·</span>
                    <span style={{ fontSize: 12 }} className="muted">New here?{' '}
                      <button type="button" onClick={() => switchMode('signup')} disabled={!canAuth || busy}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', padding: 0, fontWeight: 600 }}>Create account</button>
                    </span>
                  </React.Fragment>}
            </div>
          </form>
          {!canAuth && <div className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>Auth unavailable (Supabase not loaded) — use demo mode.</div>}
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn" data-variant="ghost" data-size="sm" onClick={onDemo}
            style={{ fontSize: 12 }}>Continue in demo mode →</button>
        </div>
      </div>
    </div>
  );
}

const inp = {
  width: '100%', boxSizing: 'border-box', padding: '8px 11px', fontSize: 13,
  border: '1px solid var(--border, #d8d9dd)', borderRadius: 8, outline: 'none',
  background: 'var(--panel-2, #fafafa)', color: 'var(--text, #111)',
};

// Password input with a show/hide (eye) toggle — used by every password field
// on the auth screens (sign in, sign up, reset, change-password modal).
function PwInput({ value, onChange, placeholder, disabled, autoFocus }) {
  const [show, setShow] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={placeholder} disabled={disabled} autoFocus={autoFocus}
        style={{ ...inp, paddingRight: 38 }} />
      <button type="button" onClick={() => setShow((s) => !s)} tabIndex={-1} disabled={disabled}
        title={show ? 'Hide password' : 'Show password'} aria-label={show ? 'Hide password' : 'Show password'}
        style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
          color: 'var(--muted, #6b7280)', display: 'grid', placeItems: 'center', lineHeight: 0 }}>
        {show
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>}
      </button>
    </div>
  );
}

// Shared new-password + confirm form. Used by the recovery-link screen and the
// in-app Change-password modal — both end in CDC.auth.changePassword().
function NewPasswordForm({ onSaved, saveLabel }) {
  const [pw1, setPw1] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(e) {
    e.preventDefault();
    if (pw1.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (pw1 !== pw2) { setErr('Passwords do not match.'); return; }
    setBusy(true); setErr('');
    try {
      const { error } = await window.CDC.auth.changePassword(pw1);
      if (error) { setErr(error.message); setBusy(false); return; }
      // Audit: record the event (never the password) in the activity feed.
      try { if (window.CDC.auth.logAuthEvent) await window.CDC.auth.logAuthEvent('changed their password'); } catch (_) {}
      onSaved();
    } catch (ex) { setErr(ex.message || 'Could not update password.'); setBusy(false); }
  }

  return (
    <form onSubmit={submit}>
      <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>New password</label>
      <PwInput autoFocus value={pw1} onChange={(e) => setPw1(e.target.value)}
        placeholder="At least 8 characters" disabled={busy} />
      <label style={{ fontSize: 12, fontWeight: 500, display: 'block', margin: '14px 0 4px' }}>Confirm new password</label>
      <PwInput value={pw2} onChange={(e) => setPw2(e.target.value)}
        placeholder="••••••••" disabled={busy} />
      {err && <div style={{ color: 'var(--rose, #c0392b)', fontSize: 12, marginTop: 12 }}>{err}</div>}
      <button className="btn" type="submit" disabled={busy}
        style={{ width: '100%', marginTop: 18, justifyContent: 'center', background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', padding: '9px 0', fontWeight: 600 }}>
        {busy ? 'Saving…' : (saveLabel || 'Set new password')}
      </button>
    </form>
  );
}

// Landing screen for the password-recovery email link (window.__RELAY_RECOVERY).
// The link already established a session, so changePassword works directly.
function ResetPasswordScreen({ onDone }) {
  React.useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = 'light'; r.dataset.density = 'cozy';
    r.style.setProperty('--accent', 'oklch(0.55 0.16 265)');
  }, []);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--panel-2, #f6f7f9)', padding: 24 }}>
      <div style={{ width: 380, maxWidth: '92vw' }}>
        <div className="row" style={{ gap: 10, marginBottom: 18, justifyContent: 'center' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700 }}>R</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Relay</div>
        </div>
        <div className="card" style={{ background: 'var(--panel, #fff)', border: '1px solid var(--border, #e6e7ea)', borderRadius: 14, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Set a new password</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 18 }}>You followed a password-reset link — choose a new password to continue.</div>
          <NewPasswordForm onSaved={onDone} />
        </div>
      </div>
    </div>
  );
}

// In-app password change, opened from the topbar next to Sign out.
function ChangePasswordModal({ open, onClose }) {
  const [done, setDone] = React.useState(false);
  React.useEffect(() => { if (open) setDone(false); }, [open]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="card"
        style={{ width: 380, maxWidth: '92vw', background: 'var(--panel, #fff)', border: '1px solid var(--border, #e6e7ea)', borderRadius: 14, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Change password</div>
          <button className="btn" data-size="sm" data-variant="ghost" onClick={onClose}>✕</button>
        </div>
        {done
          ? <div style={{ fontSize: 13 }}>
              <div style={{ color: 'var(--green, #1e7e34)', marginBottom: 16 }}>Password updated. Use it the next time you sign in.</div>
              <button className="btn" onClick={onClose}
                style={{ width: '100%', justifyContent: 'center', background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', padding: '9px 0', fontWeight: 600 }}>Done</button>
            </div>
          : <NewPasswordForm saveLabel="Update password" onSaved={() => setDone(true)} />}
      </div>
    </div>
  );
}
