-- Relay — Phase 6. Agent self-learning loop.
--
-- Curator distills engram_interactions (where humans edited/rejected an agent's
-- drafts) into durable preference rules and writes them to
-- relay_agents.data.memory. memoryFor() in supabase-client.js then injects those
-- rules as a system message on that agent's future runs.
--
-- relay_agents was L3/Admin-only (ra_admin "for all" in 02_rls.sql). Agents also
-- run for L1/L2 (e.g. Concierge), so the catalog — including distilled memory —
-- must be readable by any signed-in user. Writes stay L3/Admin (ra_admin still
-- governs insert/update/delete); Curator runs under that scope. Run after 01-09.

drop policy if exists ra_read on relay_agents;
create policy ra_read on relay_agents for select using ( auth.uid() is not null );
