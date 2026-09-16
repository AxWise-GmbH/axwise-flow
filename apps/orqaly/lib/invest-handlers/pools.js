/**
 * Pool CRUD + join/leave handler.
 */
export default async function handler(admin, user, req) {
  const op = req.query?.op || req.query?.action;
  const body = req.body || {};

  if (req.method === 'GET' || op === 'list') {
    const { data, error } = await admin.from('investment_pools').select('*, investment_pool_members(id, investor_id, contributed_amount, share_pct)').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return { status: 200, data: data || [] };
  }

  if (op === 'get') {
    const { data, error } = await admin.from('investment_pools').select('*, investment_pool_members(*, investment_investors(name, investor_type))').eq('id', req.query.id).single();
    if (error) throw error;
    return { status: 200, data };
  }

  if (op === 'create') {
    const { name, description, target_amount, min_contribution, max_contribution, target_deal_id, terms, tier_benefits, auto_invest, deadline } = body;
    if (!name || !target_amount) return { status: 400, error: 'name and target_amount required' };
    const { data, error } = await admin.from('investment_pools').insert({
      user_id: user.id, name, description: description || '', target_amount,
      min_contribution: min_contribution || 1, max_contribution: max_contribution || null,
      target_deal_id: target_deal_id || null, terms: terms || {}, tier_benefits: tier_benefits || [],
      auto_invest: auto_invest || false, deadline: deadline || null,
    }).select('*').single();
    if (error) throw error;
    return { status: 201, data };
  }

  if (op === 'join') {
    const { pool_id, investor_id, amount } = body;
    if (!pool_id || !investor_id || !amount) return { status: 400, error: 'pool_id, investor_id, amount required' };

    const { data: pool } = await admin.from('investment_pools').select('*').eq('id', pool_id).single();
    if (!pool) return { status: 404, error: 'Pool not found' };
    if (pool.status !== 'forming') return { status: 400, error: 'Pool not accepting members' };
    if (amount < pool.min_contribution) return { status: 400, error: `Min contribution: $${pool.min_contribution}` };
    if (pool.max_contribution && amount > pool.max_contribution) return { status: 400, error: `Max contribution: $${pool.max_contribution}` };

    const { data: member, error: mErr } = await admin.from('investment_pool_members').insert({
      user_id: user.id, pool_id, investor_id, contributed_amount: amount,
    }).select('*').single();
    if (mErr) throw mErr;

    // Update pool totals
    const newAmount = Number(pool.current_amount || 0) + Number(amount);
    await admin.from('investment_pools').update({ current_amount: newAmount, updated_at: new Date().toISOString() }).eq('id', pool_id);

    // Recalculate all share percentages
    const { data: members } = await admin.from('investment_pool_members').select('id, contributed_amount').eq('pool_id', pool_id);
    for (const m of members || []) {
      const pct = (Number(m.contributed_amount) / newAmount) * 100;
      await admin.from('investment_pool_members').update({ share_pct: pct }).eq('id', m.id);
    }

    // Log transaction
    await admin.from('investment_transactions').insert({
      user_id: user.id, pool_id, investor_id, transaction_type: 'pool_contribution',
      amount, description: `Joined pool "${pool.name}" with $${amount}`,
    });

    // Auto-activate if target reached
    if (newAmount >= pool.target_amount) {
      await admin.from('investment_pools').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', pool_id);
    }

    return { status: 201, data: member };
  }

  if (op === 'leave') {
    const { pool_id, investor_id } = body;
    if (!pool_id || !investor_id) return { status: 400, error: 'pool_id and investor_id required' };
    const { data: member } = await admin.from('investment_pool_members').select('*').eq('pool_id', pool_id).eq('investor_id', investor_id).eq('user_id', user.id).single();
    if (!member) return { status: 404, error: 'Membership not found' };

    await admin.from('investment_pool_members').delete().eq('id', member.id);
    const { data: pool } = await admin.from('investment_pools').select('current_amount').eq('id', pool_id).single();
    if (pool) {
      await admin.from('investment_pools').update({ current_amount: Math.max(0, Number(pool.current_amount) - Number(member.contributed_amount)), updated_at: new Date().toISOString() }).eq('id', pool_id);
    }

    return { status: 200, data: { left: true } };
  }

  if (op === 'update') {
    const { id, ...updates } = body;
    if (!id) return { status: 400, error: 'id required' };
    updates.updated_at = new Date().toISOString();
    const { data, error } = await admin.from('investment_pools').update(updates).eq('id', id).eq('user_id', user.id).select('*').single();
    if (error) throw error;
    return { status: 200, data };
  }

  return { status: 400, error: 'Invalid op' };
}
