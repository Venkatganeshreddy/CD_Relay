// Relay — Codex: one end-to-end architecture map of the entire application.
// Hover a node for what/tech/flows; click an agent for live run stats from
// window.CDC.AI_RUNS. The diagram itself lives in views-architecture.jsx
// (ArchitectureView), which this page embeds.

function CodexView({ tweaks, currentUser, nav, initialTab }) { // initialTab kept for the 'architecture' route alias
  return (
    <div className="fadein">
      <SectionHeader
        title="Codex"
        subtitle="How Relay works, end to end: people → SPA → agents → models → data → surfaces. Hover any node; click an agent for live runs."
        actions={
          <button className="btn" data-size="sm" data-variant="primary"
            onClick={() => nav.go('copilot', { prefill: 'Walk me through the Relay architecture.' })}>
            <Icon name="sparkles" size={12} /> Ask Codex
          </button>
        }
      />
      <ArchitectureView tweaks={tweaks} currentUser={currentUser} nav={nav} embedded />
    </div>
  );
}
window.CodexView = CodexView;
