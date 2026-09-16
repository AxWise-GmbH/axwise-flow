-- 190_goal_organization_catalogue.sql
-- Atomically creates a Smart Request workspace and its authorized Agent Hub
-- catalogue. A goal must never start inside a new organization whose candidate
-- set is empty or copied from an unverified tenant.

alter table public.goals drop constraint if exists goals_status_check;
alter table public.goals add constraint goals_status_check
  check (status in (
    'draft',
    'feasibility',
    'analyzing',
    'researching_customer',
    'awaiting_context_approval',
    'planning',
    'forming_team',
    'provisioning_tools',
    'estimating',
    'awaiting_approval',
    'active',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'awaiting_tools',
    'awaiting_po_input',
    'needs_human'
  ));

create or replace function public.create_goal_organization(
  p_user_id uuid,
  p_name text,
  p_description text default '',
  p_industry text default null,
  p_org_type text default 'holding',
  p_parent_id uuid default null,
  p_website text default null,
  p_consilium_id text default null,
  p_agent_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.organizations%rowtype;
  v_org_id uuid := gen_random_uuid();
  v_slug text;
  v_agent_ids uuid[];
  v_seed_batch text := gen_random_uuid()::text;
  v_agent_count integer := 0;
begin
  if p_user_id is null then
    raise exception using message = 'authenticated_user_required', errcode = '22023';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception using message = 'organization_name_required', errcode = '22023';
  end if;
  if p_org_type not in ('holding', 'subsidiary', 'division', 'department') then
    raise exception using message = 'invalid_organization_type', errcode = '22023';
  end if;
  if p_parent_id is not null and not exists (
    select 1
    from public.organizations o
    where o.id = p_parent_id
      and o.user_id = p_user_id
      and o.is_active = true
  ) then
    raise exception using message = 'invalid_parent_organization', errcode = '42501';
  end if;

  if coalesce(cardinality(p_agent_ids), 0) > 0 then
    if exists (
      select 1
      from unnest(p_agent_ids) requested(id)
      left join public.agents a
        on a.id = requested.id
       and a.user_id = p_user_id
       and a.status = 'active'
      where a.id is null
    ) then
      raise exception using message = 'agent_catalogue_contains_unauthorized_agent', errcode = '42501';
    end if;
    select array_agg(distinct requested.id order by requested.id)
      into v_agent_ids
    from unnest(p_agent_ids) requested(id);
  else
    select array_agg(a.id order by a.created_at, a.id)
      into v_agent_ids
    from public.agents a
    where a.user_id = p_user_id
      and a.status = 'active';
  end if;

  -- Fresh accounts may not have opened Agent Hub yet. Seed a compact,
  -- domain-neutral operating catalogue on the server so New Business is
  -- usable without weakening tenant boundaries or relying on browser state.
  if coalesce(cardinality(v_agent_ids), 0) = 0 then
    insert into public.agents (
      user_id, name, description, category, status, pricing_model,
      cost_per_task, capabilities, metadata
    )
    values
      (
        p_user_id,
        'Product Owner',
        'Frames the affected stakeholder, real problem, constraints, and measurable outcome.',
        'Operations',
        'active',
        'per_task',
        0,
        '["stakeholder discovery","problem framing","requirements","success criteria"]'::jsonb,
        jsonb_build_object(
          'source', 'goal-org-bootstrap-v1',
          'bootstrap_batch', v_seed_batch,
          'availability_status', 'available',
          'system_prompt', 'Act as a domain-neutral Problem and Outcome Analyst. Ground every requirement in the stakeholder, evidence, constraints, and observable success. Never assume the answer is software.'
        )
      ),
      (
        p_user_id,
        'Project Manager',
        'Turns an approved goal brief into a cost-aware, domain-appropriate execution plan.',
        'Operations',
        'active',
        'per_task',
        0,
        '["operational planning","task decomposition","budgeting","risk management"]'::jsonb,
        jsonb_build_object(
          'source', 'goal-org-bootstrap-v1',
          'bootstrap_batch', v_seed_batch,
          'availability_status', 'available',
          'system_prompt', 'Create practical plans in the actual domain of the goal. Use the approved customer context and evidence, choose only necessary work, and preserve human approval boundaries.'
        )
      ),
      (
        p_user_id,
        'Researcher',
        'Finds, evaluates, and synthesizes evidence when the decision router determines research is valuable.',
        'Research',
        'active',
        'per_task',
        0,
        '["research","source evaluation","evidence synthesis","customer discovery"]'::jsonb,
        jsonb_build_object(
          'source', 'goal-org-bootstrap-v1',
          'bootstrap_batch', v_seed_batch,
          'availability_status', 'available',
          'system_prompt', 'Research only the approved question. Cite sources, preserve provenance, distinguish observations from inference, and state uncertainty.'
        )
      ),
      (
        p_user_id,
        'Operations Strategist',
        'Designs and improves operational workflows across commerce, services, logistics, and internal operations.',
        'Operations',
        'active',
        'per_task',
        0,
        '["process improvement","service operations","workflow design","implementation"]'::jsonb,
        jsonb_build_object(
          'source', 'goal-org-bootstrap-v1',
          'bootstrap_batch', v_seed_batch,
          'availability_status', 'available',
          'system_prompt', 'Translate evidence-backed goals into implementable operational changes. Optimize for the named stakeholder and measurable outcome.'
        )
      ),
      (
        p_user_id,
        'Analyst',
        'Analyzes operational, commercial, and research data into traceable recommendations.',
        'Analytics',
        'active',
        'per_task',
        0,
        '["data analysis","market analysis","measurement","decision support"]'::jsonb,
        jsonb_build_object(
          'source', 'goal-org-bootstrap-v1',
          'bootstrap_batch', v_seed_batch,
          'availability_status', 'available',
          'system_prompt', 'Analyze the supplied evidence and data without inventing facts. Show assumptions, calculations, provenance, and decision implications.'
        )
      ),
      (
        p_user_id,
        'QA Tester',
        'Independently checks deliverables against approved evidence, constraints, and acceptance criteria.',
        'Quality',
        'active',
        'per_task',
        0,
        '["quality assurance","acceptance testing","risk review","evidence audit"]'::jsonb,
        jsonb_build_object(
          'source', 'goal-org-bootstrap-v1',
          'bootstrap_batch', v_seed_batch,
          'availability_status', 'available',
          'system_prompt', 'Verify outputs against explicit acceptance criteria. Report pass or fail with evidence; never approve unsupported claims.'
        )
      );

    select array_agg(a.id order by a.created_at, a.id)
      into v_agent_ids
    from public.agents a
    where a.user_id = p_user_id
      and a.status = 'active'
      and a.metadata ->> 'bootstrap_batch' = v_seed_batch;
  end if;

  if coalesce(cardinality(v_agent_ids), 0) = 0 then
    raise exception using message = 'agent_catalogue_required', errcode = '23514';
  end if;

  v_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'workspace'; end if;
  if exists (
    select 1 from public.organizations o where o.user_id = p_user_id and o.slug = v_slug
  ) then
    v_slug := v_slug || '-' || left(v_org_id::text, 8);
  end if;

  insert into public.organizations (
    id, user_id, name, description, slug, industry, org_type,
    parent_id, website, consilium_id, is_active
  ) values (
    v_org_id,
    p_user_id,
    btrim(p_name),
    coalesce(p_description, ''),
    v_slug,
    nullif(btrim(coalesce(p_industry, '')), ''),
    p_org_type,
    p_parent_id,
    nullif(btrim(coalesce(p_website, '')), ''),
    p_consilium_id,
    true
  )
  returning * into v_org;

  insert into public.org_agents (user_id, org_id, agent_id)
  select p_user_id, v_org.id, agent_id::text
  from unnest(v_agent_ids) selected(agent_id)
  on conflict (org_id, agent_id) do nothing;

  get diagnostics v_agent_count = row_count;
  if v_agent_count = 0 then
    raise exception using message = 'agent_catalogue_assignment_failed', errcode = '23514';
  end if;

  return jsonb_build_object(
    'organization', to_jsonb(v_org),
    'agent_ids', to_jsonb(v_agent_ids),
    'agent_count', v_agent_count,
    'catalogue_strategy', case
      when p_agent_ids is not null and cardinality(p_agent_ids) > 0 then 'explicit_active_owned'
      else 'all_active_owned'
    end
  );
end;
$$;

revoke all on function public.create_goal_organization(
  uuid, text, text, text, text, uuid, text, text, uuid[]
) from public;
revoke execute on function public.create_goal_organization(
  uuid, text, text, text, text, uuid, text, text, uuid[]
) from anon, authenticated;
grant execute on function public.create_goal_organization(
  uuid, text, text, text, text, uuid, text, text, uuid[]
) to service_role;
