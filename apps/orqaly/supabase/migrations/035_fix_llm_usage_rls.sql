-- Fix llm_usage RLS: scope reads to user's own data
-- The OR auth.role()='authenticated' clause makes the user_id check meaningless

drop policy if exists "Users read own llm_usage" on public.llm_usage;

create policy "Users read own llm_usage"
  on public.llm_usage for select
  using (auth.uid() = user_id);

-- Service role handles inserts (from API workers) — bypasses RLS
