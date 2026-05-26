// Relay — Phase 3 login screen. Email + password via Supabase Auth.
// "Continue in demo mode" bypasses auth and uses the bundled data + free role
// switcher (the prototype's original behavior) for offline demos.
function LoginScreen({ onAuthed, onDemo }) {
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const canAuth = !!(window.CDC && window.CDC.auth);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !pw) { setErr('Enter your email and password.'); return; }
    setBusy(true); setErr('');
    try {
      const { error } = await window.CDC.auth.signIn(email.trim(), pw);
      if (error) { setErr(error.message); setBusy(false); return; }
      // Start every session as yourself — clear any stale impersonation.
      try { if (window.CDC.setImpersonation) await window.CDC.setImpersonation(null); } catch (_) {}
      onAuthed();
    } catch (ex) { setErr(ex.message || 'Sign-in failed.'); setBusy(false); }
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
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Sign in</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 18 }}>Department Operating Copilot · use your company email</div>
          <form onSubmit={submit}>
            <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@nxtwave.co.in" disabled={!canAuth || busy}
              style={inp} />
            <label style={{ fontSize: 12, fontWeight: 500, display: 'block', margin: '14px 0 4px' }}>Password</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder="••••••••" disabled={!canAuth || busy}
              style={inp} />
            {err && <div style={{ color: 'var(--rose, #c0392b)', fontSize: 12, marginTop: 12 }}>{err}</div>}
            <button className="btn" type="submit" disabled={!canAuth || busy}
              style={{ width: '100%', marginTop: 18, justifyContent: 'center', background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', padding: '9px 0', fontWeight: 600 }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
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
