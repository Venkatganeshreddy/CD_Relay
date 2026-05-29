-- Relay — add Task flow + Escalation flow to the live codex_workflows table
-- (the Codex > Workflows view loads from here when signed in). Idempotent.

insert into codex_workflows (id, data) values
('wf-task', jsonb_build_object(
  'id','wf-task','name','Task flow','version','v1',
  'trigger','User clicks Create task · 6:00 PM snapshot',
  'agents', jsonb_build_array('(no LLM — structured form)'),
  'outputs', jsonb_build_array('tasks','worklogs'),
  'objective','Capture work in the CD Task-flow format with auto-mapped Metric and Task categories.',
  'steps', jsonb_build_array(
    jsonb_build_object('n',1,'title','Open Create task','detail','Structured form. EMP ID auto-filled from the signed-in owner (or pick another owner).','done',true),
    jsonb_build_object('n',2,'title','Product-Audience + Stack','detail','Product-Audience is multi-select and required; Stack is multi-select and optional.','done',true),
    jsonb_build_object('n',3,'title','Output Category → auto Metric & Task category','detail','Choosing an Output Category auto-derives Metric, Activity and Task Category from the v.11 mapping table.','done',true),
    jsonb_build_object('n',4,'title','Output Count + Task template','detail','Output Count is optional (0 allowed; N/A for Executive Ops & Business Impact metrics). The Task template is optional.','done',true),
    jsonb_build_object('n',5,'title','Status + Due date','detail','Status (In-progress / Done / Blocked / Overdue / Backlog) and Due date are mandatory. Reason required when Blocked or Overdue.','done',true),
    jsonb_build_object('n',6,'title','Create — task saved','detail','Stored with its auto Metric/Task category and shown on the task board and the dashboard Captured-work table.','done',true),
    jsonb_build_object('n',7,'title','6:00 PM snapshot','detail','Each evening the owner reviews open + backlog tasks, changes only the status, and notes the backlog.','done',true),
    jsonb_build_object('n',8,'title','Feeds the Escalation flow','detail','Blocked / overdue / unacknowledged tasks are picked up by the Escalation flow.','done',true)
  ))),
('wf-escalation', jsonb_build_object(
  'id','wf-escalation','name','Escalation flow','version','v2',
  'trigger','Task blocked/overdue · pg_cron every 30 min · 6:00 PM check-in',
  'agents', jsonb_build_array('Sentry'),
  'outputs', jsonb_build_array('notifications','escalations'),
  'objective','Track blocked/overdue tasks and escalate through the reporting hierarchy.',
  'steps', jsonb_build_array(
    jsonb_build_object('n',1,'title','Task marked as Blocked','detail','Notifies the immediate reporting manager (and the originator).','done',true),
    jsonb_build_object('n',2,'title','Task remains blocked (> 1 day)','detail','Escalates to the next hierarchy level, climbing one level per scan (L1 → L2 → L3).','done',true),
    jsonb_build_object('n',3,'title','Task crosses due date (> 2 days)','detail','Sends an overdue trigger to the uploader / originator.','done',true),
    jsonb_build_object('n',4,'title','In-progress > 2 days, or unacknowledged at 6:00 PM','detail','Crosses the threshold and escalates up the chain via the same engine.','done',true),
    jsonb_build_object('n',5,'title','Escalated tasks shown separately','detail','An L3/L2 sees escalated/blocked/overdue items in the dedicated Escalated tab.','done',true),
    jsonb_build_object('n',6,'title','Server-side auto-scan','detail','Runs every 30 min via pg_cron; the 6:00 PM job drives the unacknowledged path.','done',true)
  )))
on conflict (id) do update set data = excluded.data;

select id, data->>'name' as name, data->>'version' as version, jsonb_array_length(data->'steps') as steps
from codex_workflows where id in ('wf-task','wf-escalation');
