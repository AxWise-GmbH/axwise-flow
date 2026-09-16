-- Fix concilium_evaluations RLS: scope reads to user's own data
-- Previously allowed ALL authenticated users to read all rows

drop policy if exists "Users can manage concilium_evaluations" on public.concilium_evaluations;

-- Users can read their own evaluations
create policy "Users read own evaluations"
  on public.concilium_evaluations for select
  using (auth.uid() = user_id);

-- Service role handles all inserts (from API workers)
-- No explicit insert policy needed — service role bypasses RLS

-- Add composite index for common query pattern
create index if not exists idx_concilium_eval_user_created
  on public.concilium_evaluations(user_id, created_at desc);
