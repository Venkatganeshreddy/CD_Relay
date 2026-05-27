// CD-Copilot — shared UI primitives.
// All components attached to window for cross-script sharing.

const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

// ── Icons (lightweight stroke set) ──────────────────────────────────────
function Icon({ name, size = 14, stroke = 1.6 }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'dashboard':
      return <svg {...props}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>;
    case 'copilot':
      return <svg {...props}><path d="M12 2.5L13.6 8.4 19.5 10 13.6 11.6 12 17.5 10.4 11.6 4.5 10 10.4 8.4Z" /><circle cx="18" cy="18" r="2.2" /><circle cx="5" cy="19" r="1.4" /></svg>;
    case 'weekly':
      return <svg {...props}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18" /><path d="M8 2v4M16 2v4" /></svg>;
    case 'tasks':
      return <svg {...props}><path d="M9 11l2 2 4-4" /><rect x="3" y="4" width="18" height="17" rx="2" /></svg>;
    case 'flag':
      return <svg {...props}><path d="M4 21V4h14l-3 4 3 4H4" /></svg>;
    case 'runs':
      return <svg {...props}><path d="M4 4h6v6H4zM14 14h6v6h-6zM10 7h4M7 10v4M14 17h-4M17 14v-4" /></svg>;
    case 'admin':
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case 'search':
      return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case 'chev-down':
      return <svg {...props}><path d="M6 9l6 6 6-6" /></svg>;
    case 'chev-right':
      return <svg {...props}><path d="M9 6l6 6-6 6" /></svg>;
    case 'arrow-up':
      return <svg {...props}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
    case 'arrow-down':
      return <svg {...props}><path d="M12 5v14M5 12l7 7 7-7" /></svg>;
    case 'check':
      return <svg {...props}><path d="M5 12l5 5L20 7" /></svg>;
    case 'x':
      return <svg {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
    case 'sparkles':
      return <svg {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>;
    case 'send':
      return <svg {...props}><path d="M22 2L11 13M22 2L15 22 11 13 2 9z" /></svg>;
    case 'lock':
      return <svg {...props}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></svg>;
    case 'sheet':
      return <svg {...props}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M9 3v18" /></svg>;
    case 'plug':
      return <svg {...props}><path d="M9 2v6M15 2v6M5 8h14v3a7 7 0 0 1-14 0z M12 18v4" /></svg>;
    case 'clock':
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'menu':
      return <svg {...props}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
    case 'filter':
      return <svg {...props}><path d="M3 5h18l-7 9v6l-4-2v-4z" /></svg>;
    case 'refresh':
      return <svg {...props}><path d="M3 12a9 9 0 0 1 16-5L21 4M21 12a9 9 0 0 1-16 5L3 20M3 4v4h4M21 20v-4h-4" /></svg>;
    case 'edit':
      return <svg {...props}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" /></svg>;
    case 'eye':
      return <svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    default: return null;
  }
}
window.Icon = Icon;

// ── Pill, Dot, Avatar, ConfChip ─────────────────────────────────────────
function Pill({ tone = 'neutral', children, dot }) {
  return (
    <span className="pill" data-tone={tone}>
      {dot && <span className="dot" data-tone={tone} />}
      {children}
    </span>
  );
}
window.Pill = Pill;

function Avatar({ user, size = 22 }) {
  if (!user) return null;
  return <div className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}>{user.initials}</div>;
}
window.Avatar = Avatar;

function ConfChip({ value, show = true }) {
  if (!show || value == null) return null;
  const pct = Math.round(value * 100);
  const low = value < 0.75; const vlow = value < 0.6;
  return (
    <span className="conf" data-low={low} data-vlow={vlow}>
      <span className="conf-bar"><span className="conf-fill" style={{ width: `${pct}%` }} /></span>
      {pct}%
    </span>
  );
}
window.ConfChip = ConfChip;

// ── RAG indicator — renders per the chosen treatment ────────────────────
function RAG({ score, status, trend = 0, treatment = 'numeric' }) {
  const tone = status; // 'green' | 'amber' | 'red'
  if (treatment === 'dot') {
    return (
      <span className="rag" data-tone={tone}>
        <span className="dot" data-tone={tone} />
        <span className="rag-num">{score}</span>
        {trend !== 0 && <span className="rag-trend">{trend > 0 ? '↑' : '↓'}{Math.abs(trend)}</span>}
      </span>
    );
  }
  // numeric (default) — small filled bar + score
  return (
    <span className="rag" data-tone={tone}>
      <span className="rag-bar"><span className="rag-fill" style={{ width: `${score}%` }} /></span>
      <span className="rag-num">{score}</span>
      {trend !== 0 && <span className="rag-trend">{trend > 0 ? '↑' : '↓'}{Math.abs(trend)}</span>}
    </span>
  );
}
window.RAG = RAG;

// ── Sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data, width = 120, height = 28, color }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data); const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => `${i * stepX},${height - 4 - ((v - min) / range) * (height - 8)}`).join(' ');
  const last = data[data.length - 1];
  const lastY = height - 4 - ((last - min) / range) * (height - 8);
  const lastX = width;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color || 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX - 1} cy={lastY} r="2" fill={color || 'currentColor'} />
    </svg>
  );
}
window.Sparkline = Sparkline;

// ── Modal ───────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, footer, width = 720 }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal fadein" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
          <button className="btn" data-variant="ghost" data-size="sm" onClick={onClose}><Icon name="x" size={12} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}
window.Modal = Modal;

// ── Cite chip — renders [n] citation with hover popover ─────────────────
function Cite({ n, sourceId, lookupFn, onEnter, onLeave }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!hovered || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 6 });
  }, [hovered]);

  const src = lookupFn(sourceId);

  return (
    <>
      <span
        ref={ref}
        className="cite"
        data-cite-id={sourceId}
        data-hovered={hovered}
        onMouseEnter={() => { setHovered(true); onEnter?.(sourceId); }}
        onMouseLeave={() => { setHovered(false); onLeave?.(sourceId); }}
      >{n}</span>
      {hovered && pos && src && ReactDOM.createPortal(
        <div ref={popRef} className="cite-pop fadein" style={{ left: pos.left, top: pos.top }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 4 }}>{src.kind}</div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>{src.title}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{src.detail}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
window.Cite = Cite;

// Resolve a source id into a citation card.
function resolveCitation(id) {
  const r = window.CDC.lookup.report(id);
  if (r) {
    const author = window.CDC.lookup.author(r.author);
    return {
      kind: 'Daily Report',
      title: `${author?.sub || ''} — ${r.date}`,
      detail: `${author?.name || ''} · ${r.items.length} items · conf ${Math.round((r.confidence || 0) * 100)}%`,
    };
  }
  const k = window.CDC.lookup.kpi(id);
  if (k) {
    return { kind: 'KPI', title: k.name, detail: `current ${k.current}${k.unit || ''} · target ${k.target}${k.unit || ''}` };
  }
  const t = window.CDC.lookup.task(id);
  if (t) return { kind: 'Task', title: t.title, detail: `${t.status}${t.dueDate ? ' · due ' + t.dueDate : ''}` };
  const f = window.CDC.lookup.flag(id);
  if (f) return { kind: 'Data Quality Flag', title: f.title, detail: f.detail };
  return { kind: 'Source', title: id, detail: '' };
}
window.resolveCitation = resolveCitation;

// ── Section header ──────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="h-row" style={{ marginBottom: 18 }}>
      <div>
        <h1 className="h-title">{title}</h1>
        {subtitle && <div className="h-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="row" style={{ gap: 6 }}>{actions}</div>}
    </div>
  );
}
window.SectionHeader = SectionHeader;

// ── Personalized greeting header (used by every dashboard) ───────────────
// Time-of-day greeting for the signed-in user + live IST date/time that ticks
// every 30s, so it changes with the user and as time passes.
function GreetingHeader({ currentUser, context, actions }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const ist = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', ...opts }).format(now);
  const hour = Number(ist({ hour: '2-digit', hour12: false }));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Working late';
  const first = (currentUser && currentUser.name ? currentUser.name.split(' ')[0] : 'there');
  const dateline = `${ist({ weekday: 'long' })} · ${ist({ month: 'long', day: 'numeric', year: 'numeric' })} · ${ist({ hour: '2-digit', minute: '2-digit', hour12: false })} IST`;
  return <SectionHeader title={`${greet}, ${first}.`} subtitle={context ? `${context} · ${dateline}` : dateline} actions={actions} />;
}
window.GreetingHeader = GreetingHeader;

// ── Card wrapper ────────────────────────────────────────────────────────
function Card({ title, meta, actions, children, pad = true, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="card-h">
          <div className="row" style={{ gap: 8 }}>
            <h3>{title}</h3>
            {meta && <span className="card-h-meta">· {meta}</span>}
          </div>
          {actions && <div className="row" style={{ gap: 6 }}>{actions}</div>}
        </div>
      )}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </div>
  );
}
window.Card = Card;

// ── Confirm if writing ──────────────────────────────────────────────────
function relTime(iso) {
  // very lightweight relative formatter
  return iso;
}
window.relTime = relTime;

// expose hooks too (for downstream files that load before React global wiring)
window.Hooks = { useState, useEffect, useRef, useMemo, useCallback };
