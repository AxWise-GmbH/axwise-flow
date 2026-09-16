-- 143_dashboard_templates_fix.sql
-- Replaces the seed templates from migration 142. The original 142 referenced
-- columns that don't exist (agent_jobs.cost_usd, etc.) and used the wrong
-- count syntax. This migration deletes the old seeds and inserts corrected
-- ones using ONLY columns that exist (verified against migrations 069, 076,
-- 048, 031, 140).
--
-- Safe to re-run: drops only is_template=true rows.

do $$
declare
  v_owner uuid;
begin
  -- Pick the first user (matches 142's logic)
  select id into v_owner from auth.users order by created_at asc limit 1;
  if v_owner is null then
    return;
  end if;

  -- Remove the broken seeds from 142
  delete from public.saved_dashboards where is_template = true;

  -- Re-insert with correct measures and datasets
  insert into public.saved_dashboards (owner_user_id, title, description, visibility, is_template, config)
  values
    (
      v_owner,
      'Goals overview',
      'Active vs completed goals, budget burn, spend trend.',
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
            'data', jsonb_build_object('dataset','goals','measure', jsonb_build_object('agg','count'),'filters', jsonb_build_object('status','active'))),
          jsonb_build_object('id','kpi-completed','type','kpi','title','Completed goals',
            'data', jsonb_build_object('dataset','goals','measure', jsonb_build_object('agg','count'),'filters', jsonb_build_object('status','completed'))),
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
      'LLM usage — cost & tokens',
      'Total LLM spend, token volume, daily cost trend, by provider.',
      'public',
      true,
      jsonb_build_object(
        'version', 1,
        'global_filters', jsonb_build_object('time_range', jsonb_build_object('kind','last_n_days','value',30)),
        'layout', jsonb_build_array(
          jsonb_build_object('i','kpi-cost','x',0,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-calls','x',3,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-tokens','x',6,'y',0,'w',3,'h',3),
          jsonb_build_object('i','kpi-p95','x',9,'y',0,'w',3,'h',3),
          jsonb_build_object('i','trend-cost','x',0,'y',3,'w',8,'h',4),
          jsonb_build_object('i','pie-provider','x',8,'y',3,'w',4,'h',4)
        ),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','kpi-cost','type','kpi','title','Total LLM spend',
            'data', jsonb_build_object('dataset','llm_usage','measure', jsonb_build_object('agg','sum','field','estimated_cost_usd'))),
          jsonb_build_object('id','kpi-calls','type','kpi','title','LLM calls',
            'data', jsonb_build_object('dataset','llm_usage','measure', jsonb_build_object('agg','count'))),
          jsonb_build_object('id','kpi-tokens','type','kpi','title','Tokens used',
            'data', jsonb_build_object('dataset','llm_usage','measure', jsonb_build_object('agg','sum','field','total_tokens'))),
          jsonb_build_object('id','kpi-p95','type','kpi','title','p95 duration (ms)',
            'data', jsonb_build_object('dataset','llm_usage','measure', jsonb_build_object('agg','p95','field','duration_ms'))),
          jsonb_build_object('id','trend-cost','type','trend','title','Daily LLM spend',
            'data', jsonb_build_object('dataset','llm_usage','measure', jsonb_build_object('agg','sum','field','estimated_cost_usd'),'group_by', jsonb_build_object('field','created_at','time_bucket','day'))),
          jsonb_build_object('id','pie-provider','type','pie','title','Cost share by provider',
            'data', jsonb_build_object('dataset','llm_usage','measure', jsonb_build_object('agg','sum','field','estimated_cost_usd'),'group_by', jsonb_build_object('field','provider')))
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
    );
end$$;
