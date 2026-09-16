-- 142_dashboard_templates_seed.sql
-- Seeds 4 starter dashboard templates (is_template=true). These are visible
-- to all authenticated users via the saved_dashboards_read_shared policy
-- when visibility='public'. Users fork them to get an editable personal copy.

-- The owner_user_id for templates uses a special seed-only UUID. The migration
-- assumes you've created a system user; if not, the inserts will be skipped
-- gracefully on FK errors.

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-000000000000';
begin
  -- Insert only if a real system user exists, or use the first admin we can find.
  select id into v_owner from auth.users order by created_at asc limit 1;
  if v_owner is null then
    return; -- no users yet, skip seeding
  end if;

  insert into public.saved_dashboards (owner_user_id, title, description, visibility, is_template, config)
  values
    (
      v_owner,
      'Goals overview',
      'Active vs completed goals, budget burn, and the most expensive 10.',
      'public',
      true,
      jsonb_build_object(
        'version', 1,
        'global_filters', jsonb_build_object('time_range', jsonb_build_object('kind','last_n_days','value',30)),
        'layout', jsonb_build_array(
          jsonb_build_object('i','kpi-active','x',0,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-completed','x',3,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-budget','x',6,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-spent','x',9,'y',0,'w',3,'h',3),
          jsonb_build_object('i','breakdown-status','x',0,'y',3,'w',6,'h',4),
          jsonb_build_object('i','trend-created','x',6,'y',3,'w',6,'h',4)
        ),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','kpi-active','type','kpi','title','Active goals',
            'data', jsonb_build_object('dataset','goals','measure', jsonb_build_object('agg','count'),'filters',jsonb_build_object('status','active'))),
          jsonb_build_object('id','kpi-completed','type','kpi','title','Completed goals',
            'data', jsonb_build_object('dataset','goals','measure', jsonb_build_object('agg','count'),'filters',jsonb_build_object('status','completed'))),
          jsonb_build_object('id','kpi-budget','type','kpi','title','Total budget',
            'data', jsonb_build_object('dataset','goals','measure', jsonb_build_object('agg','sum','field','budget_usd'))),
          jsonb_build_object('id','kpi-spent','type','kpi','title','Total spent',
            'data', jsonb_build_object('dataset','goals','measure', jsonb_build_object('agg','sum','field','spent_usd'))),
          jsonb_build_object('id','breakdown-status','type','breakdown','title','Goals by status',
            'data', jsonb_build_object('dataset','goals','measure', jsonb_build_object('agg','count'),'group_by', jsonb_build_object('field','status'))),
          jsonb_build_object('id','trend-created','type','trend','title','Goals created over time',
            'data', jsonb_build_object('dataset','goals','measure', jsonb_build_object('agg','count'),'group_by', jsonb_build_object('field','created_at','time_bucket','day')))
        )
      )
    ),
    (
      v_owner,
      'AI agents — cost & quality',
      'Total agent spend, cost by provider, success rate trend, most expensive jobs.',
      'public',
      true,
      jsonb_build_object(
        'version', 1,
        'global_filters', jsonb_build_object('time_range', jsonb_build_object('kind','last_n_days','value',30)),
        'layout', jsonb_build_array(
          jsonb_build_object('i','kpi-cost','x',0,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-jobs','x',3,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-avg-cost','x',6,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-p95','x',9,'y',0,'w',3,'h',3),
          jsonb_build_object('i','trend-cost','x',0,'y',3,'w',8,'h',4),
          jsonb_build_object('i','pie-status','x',8,'y',3,'w',4,'h',4)
        ),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','kpi-cost','type','kpi','title','Total agent spend',
            'data', jsonb_build_object('dataset','agent_jobs','measure', jsonb_build_object('agg','sum','field','cost_usd'))),
          jsonb_build_object('id','kpi-jobs','type','kpi','title','Total jobs',
            'data', jsonb_build_object('dataset','agent_jobs','measure', jsonb_build_object('agg','count'))),
          jsonb_build_object('id','kpi-avg-cost','type','kpi','title','Avg cost / job',
            'data', jsonb_build_object('dataset','agent_jobs','measure', jsonb_build_object('agg','avg','field','cost_usd'))),
          jsonb_build_object('id','kpi-p95','type','kpi','title','p95 duration (ms)',
            'data', jsonb_build_object('dataset','agent_jobs','measure', jsonb_build_object('agg','p95','field','duration_ms'))),
          jsonb_build_object('id','trend-cost','type','trend','title','Daily spend',
            'data', jsonb_build_object('dataset','agent_jobs','measure', jsonb_build_object('agg','sum','field','cost_usd'),'group_by', jsonb_build_object('field','created_at','time_bucket','day'))),
          jsonb_build_object('id','pie-status','type','pie','title','Jobs by status',
            'data', jsonb_build_object('dataset','agent_jobs','measure', jsonb_build_object('agg','count'),'group_by', jsonb_build_object('field','status')))
        )
      )
    ),
    (
      v_owner,
      'Lead funnel',
      'Funnel breakdown by status, conversion over time, top sources.',
      'public',
      true,
      jsonb_build_object(
        'version', 1,
        'global_filters', jsonb_build_object('time_range', jsonb_build_object('kind','last_n_days','value',90)),
        'layout', jsonb_build_array(
          jsonb_build_object('i','kpi-leads','x',0,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-revenue','x',3,'y',0,'w',3,'h',3),
          jsonb_build_object('i','breakdown-status','x',6,'y',0,'w',6,'h',4),
          jsonb_build_object('i','trend-new','x',0,'y',4,'w',8,'h',4),
          jsonb_build_object('i','pie-source','x',8,'y',4,'w',4,'h',4)
        ),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','kpi-leads','type','kpi','title','Total leads',
            'data', jsonb_build_object('dataset','leads','measure', jsonb_build_object('agg','count'))),
          jsonb_build_object('id','kpi-revenue','type','kpi','title','Lead revenue',
            'data', jsonb_build_object('dataset','leads','measure', jsonb_build_object('agg','sum','field','revenue_usd'))),
          jsonb_build_object('id','breakdown-status','type','breakdown','title','Leads by status',
            'data', jsonb_build_object('dataset','leads','measure', jsonb_build_object('agg','count'),'group_by', jsonb_build_object('field','status'))),
          jsonb_build_object('id','trend-new','type','trend','title','New leads over time',
            'data', jsonb_build_object('dataset','leads','measure', jsonb_build_object('agg','count'),'group_by', jsonb_build_object('field','created_at','time_bucket','week'))),
          jsonb_build_object('id','pie-source','type','pie','title','Top lead sources',
            'data', jsonb_build_object('dataset','leads','measure', jsonb_build_object('agg','count'),'group_by', jsonb_build_object('field','source')))
        )
      )
    ),
    (
      v_owner,
      'Financial events',
      'Revenue vs spend trend, by event type and source.',
      'public',
      true,
      jsonb_build_object(
        'version', 1,
        'global_filters', jsonb_build_object('time_range', jsonb_build_object('kind','last_n_days','value',90)),
        'layout', jsonb_build_array(
          jsonb_build_object('i','kpi-total','x',0,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-avg','x',3,'y',0,'w',3,'h',3),
          jsonb_build_object('i','breakdown-type','x',6,'y',0,'w',6,'h',4),
          jsonb_build_object('i','trend-amount','x',0,'y',4,'w',12,'h',4)
        ),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','kpi-total','type','kpi','title','Total amount',
            'data', jsonb_build_object('dataset','financial_events','measure', jsonb_build_object('agg','sum','field','amount_usd'))),
          jsonb_build_object('id','kpi-avg','type','kpi','title','Avg amount',
            'data', jsonb_build_object('dataset','financial_events','measure', jsonb_build_object('agg','avg','field','amount_usd'))),
          jsonb_build_object('id','breakdown-type','type','breakdown','title','By event type',
            'data', jsonb_build_object('dataset','financial_events','measure', jsonb_build_object('agg','sum','field','amount_usd'),'group_by', jsonb_build_object('field','event_type'))),
          jsonb_build_object('id','trend-amount','type','trend','title','Amount over time',
            'data', jsonb_build_object('dataset','financial_events','measure', jsonb_build_object('agg','sum','field','amount_usd'),'group_by', jsonb_build_object('field','created_at','time_bucket','day')))
        )
      )
    )
  on conflict do nothing;
end$$;
