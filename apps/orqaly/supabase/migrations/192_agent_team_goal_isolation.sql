-- 192: One active execution team per goal.
--
-- Older application code could reuse the first active team owned by a user,
-- regardless of goal. New formation code is goal-scoped, and this migration
-- closes the remaining read-before-insert race at the database boundary.

-- Recover the goal link for legacy teams when exactly one goal selects the
-- team through goals.agent_team_id. Ambiguous shared-team pointers are left
-- untouched: guessing would rewrite project history.
with unambiguous_goal_links as (
  select
    g.agent_team_id as team_id,
    g.id as goal_id,
    g.user_id
  from public.goals g
  where g.agent_team_id is not null
    and not exists (
      select 1
      from public.goals other
      where other.agent_team_id = g.agent_team_id
        and other.id <> g.id
    )
)
update public.agent_teams team
set
  goal_id = link.goal_id,
  updated_at = now()
from unambiguous_goal_links link
where team.id = link.team_id
  and team.user_id = link.user_id
  and team.goal_id is null;

-- Deactivate duplicate active rows before adding the unique index. When the
-- goal already selected one of those rows, keep that exact audit identity;
-- otherwise keep the oldest row deterministically. Membership rows remain in
-- place on inactive historical teams and are intentionally not deleted.
with ranked_active_goal_teams as (
  select
    team.id,
    row_number() over (
      partition by team.goal_id
      order by
        case when goal.agent_team_id = team.id then 0 else 1 end,
        team.created_at asc,
        team.id asc
    ) as active_rank
  from public.agent_teams team
  left join public.goals goal on goal.id = team.goal_id
  where team.goal_id is not null
    and team.is_active = true
), duplicate_active_goal_teams as (
  select id
  from ranked_active_goal_teams
  where active_rank > 1
)
update public.agent_teams team
set
  is_active = false,
  updated_at = now()
from duplicate_active_goal_teams duplicate
where team.id = duplicate.id
  and team.is_active = true;

create unique index if not exists idx_agent_teams_one_active_per_goal
  on public.agent_teams (goal_id)
  where goal_id is not null
    and is_active = true;

comment on index public.idx_agent_teams_one_active_per_goal is
  'Prevents concurrent formation from creating more than one active execution team for a goal.';
