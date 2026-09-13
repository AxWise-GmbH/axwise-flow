-- 077: Enable Supabase Realtime for goal-related tables
-- Required for Goal Live Dashboard real-time updates

ALTER PUBLICATION supabase_realtime ADD TABLE goals;
ALTER PUBLICATION supabase_realtime ADD TABLE goal_log;
ALTER PUBLICATION supabase_realtime ADD TABLE goal_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE team_tasks;
