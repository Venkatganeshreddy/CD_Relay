
-- 99_clear_ops.sql — wipe all operational data so the app shows a clean slate.
--
-- KEEPS: employees, business_directions, departments, dept_health,
--        relay_agents, farm_agents, codex_workflows, codex_guidelines,
--        knowledge_docs, app_docs, impersonation
--
-- CLEARS: daily reports, worklogs, tasks, flags, weekly summaries/comments,
--         MoMs, engram interactions, eval sets, guideline proposals,
--         AI runs, activity log, task acknowledgements, KPIs, expense doc.
--
-- Safe to re-run.

begin;

truncate table
  daily_reports,
  worklogs,
  tasks,
  task_acknowledgements,
  flags,
  weekly_summaries,
  weekly_comments,
  moms,
  engram_interactions,
  eval_sets,
  guideline_proposals,
  ai_runs,
  activity,
  kpis
restart identity cascade;

-- Reset expense_doc payload but keep the singleton row.
update expense_doc
   set data = jsonb_build_object('byTool', '[]'::jsonb,
                                 'byPerson', '[]'::jsonb,
                                 'monthlyTrend', '[]'::jsonb)
 where id = 'current';

commit;
