-- 089: team council cooldown — tracks when a team last posted a deal via AI council
ALTER TABLE public.agent_teams
  ADD COLUMN IF NOT EXISTS last_deal_posted_at TIMESTAMPTZ DEFAULT NULL;
