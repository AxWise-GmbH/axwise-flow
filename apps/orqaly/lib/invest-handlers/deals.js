/**
 * Deal CRUD + status lifecycle handler.
 */
import { deterministicAgentJobId, enqueueAgentJob } from '../goal-handlers/_helpers.js';

export default async function handler(admin, user, req) {
  const op = req.query?.op || req.query?.action;
  const body = req.body || {};

  if ((req.method === 'GET' && op !== 'council-status') || op === 'list') {
    const status = req.query?.status;
    let q = admin
      .from('investment_deals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return { status: 200, data: data || [] };
  }

  if (op === 'get') {
    const { data: deal, error } = await admin
      .from('investment_deals')
      .select('*')
      .eq('id', req.query.id)
      .single();
    if (error) throw error;
    // Load commitments and analytics
    const { data: commitments } = await admin
      .from('investment_commitments')
      .select('*, investment_investors(name, investor_type)')
      .eq('deal_id', deal.id);
    const { data: analytics } = await admin
      .from('investment_deal_analytics')
      .select('*')
      .eq('deal_id', deal.id)
      .maybeSingle();
    const { data: transactions } = await admin
      .from('investment_transactions')
      .select('*')
      .eq('deal_id', deal.id)
      .order('created_at', { ascending: false })
      .limit(50);
    return {
      status: 200,
      data: {
        ...deal,
        commitments: commitments || [],
        analytics,
        transactions: transactions || [],
      },
    };
  }

  if (op === 'create') {
    const {
      title,
      description,
      industry,
      tags,
      required_amount,
      min_investment,
      roi_projections,
      revenue_share_terms,
      strategy_plan,
      risk_level,
      deadline,
      goal_id,
      created_by_agent_id,
    } = body;
    if (!title || !required_amount)
      return { status: 400, error: 'title and required_amount required' };
    const { data, error } = await admin
      .from('investment_deals')
      .insert({
        user_id: user.id,
        title,
        description: description || '',
        industry: industry || null,
        tags: tags || [],
        required_amount,
        min_investment: min_investment || 1,
        roi_projections: roi_projections || {},
        revenue_share_terms: revenue_share_terms || {},
        strategy_plan: strategy_plan || {},
        risk_level: risk_level || 'medium',
        deadline: deadline || null,
        goal_id: goal_id || null,
        created_by_agent_id: created_by_agent_id || null,
        status: 'draft',
      })
      .select('*')
      .single();
    if (error) throw error;
    return { status: 201, data };
  }

  if (op === 'update') {
    const { id, ...updates } = body;
    if (!id) return { status: 400, error: 'id required' };
    updates.updated_at = new Date().toISOString();
    // Recalculate funding_pct if current_funded changed
    if (updates.current_funded != null) {
      const { data: deal } = await admin
        .from('investment_deals')
        .select('required_amount')
        .eq('id', id)
        .single();
      if (deal)
        updates.funding_pct = Math.min(100, (updates.current_funded / deal.required_amount) * 100);
    }
    const { data, error } = await admin
      .from('investment_deals')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) throw error;
    return { status: 200, data };
  }

  if (op === 'transition') {
    const { id, new_status } = body;
    if (!id || !new_status) return { status: 400, error: 'id and new_status required' };
    const { data, error } = await admin
      .from('investment_deals')
      .update({ status: new_status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) throw error;
    return { status: 200, data };
  }

  if (op === 'delete') {
    const { id } = body;
    if (!id) return { status: 400, error: 'id required' };
    const { error } = await admin
      .from('investment_deals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
    return { status: 200, data: { deleted: true } };
  }

  if (op === 'council-start') {
    const { team_id } = body;
    if (!team_id) return { status: 400, error: 'team_id required' };

    // Check 24h cooldown
    const { data: team, error: teamErr } = await admin
      .from('agent_teams')
      .select('id, name, last_deal_posted_at')
      .eq('id', team_id)
      .eq('user_id', user.id)
      .single();
    if (teamErr || !team) return { status: 404, error: 'Team not found' };

    if (team.last_deal_posted_at) {
      const lastPost = new Date(team.last_deal_posted_at);
      const hoursSince = (Date.now() - lastPost.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const remainingMs = 24 * 60 * 60 * 1000 - (Date.now() - lastPost.getTime());
        const remainingHrs = Math.floor(remainingMs / (1000 * 60 * 60));
        const remainingMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        return {
          status: 429,
          error: `Cooldown active. Next council available in ${remainingHrs}h ${remainingMins}m`,
          data: { cooldown_remaining_ms: remainingMs, team_name: team.name },
        };
      }
    }

    // Enqueue the council-meeting job
    const jobPayload = {
      type: 'council-meeting',
      team_id,
      user_id: user.id,
      _userId: user.id,
      userId: user.id,
      _ts: Date.now(),
    };

    const job = await enqueueAgentJob(
      admin,
      {
        id: deterministicAgentJobId('council-meeting', {
          teamId: team_id,
          lastPostedAt: team.last_deal_posted_at || null,
        }),
        user_id: user.id,
        payload: jobPayload,
      },
      { idempotent: true }
    );

    return { status: 202, data: { job_id: job.id, status: job.status, team_name: team.name } };
  }

  if (op === 'council-status') {
    const { job_id } = req.query;
    if (!job_id) return { status: 400, error: 'job_id required' };
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, status, result, error, created_at, updated_at, user_id')
      .eq('id', job_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !job || job.user_id !== user.id) {
      return { status: 404, error: 'Job not found' };
    }
    return {
      status: 200,
      data: {
        id: job.id,
        status: job.status,
        result: job.result,
        error: job.error,
        created_at: job.created_at,
        updated_at: job.updated_at,
      },
    };
  }

  return { status: 400, error: 'Invalid op' };
}
