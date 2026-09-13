/**
 * Commitment handler — invest in deals, withdraw, track returns.
 */
export default async function handler(admin, user, req) {
  const op = req.query?.op || req.query?.action;
  const body = req.body || {};

  if (req.method === 'GET' || op === 'list') {
    const investorId = req.query?.investor_id;
    const dealId = req.query?.deal_id;
    let q = admin.from('investment_commitments').select('*, investment_deals(title, status, industry), investment_investors(name)').eq('user_id', user.id).order('committed_at', { ascending: false });
    if (investorId) q = q.eq('investor_id', investorId);
    if (dealId) q = q.eq('deal_id', dealId);
    const { data, error } = await q;
    if (error) throw error;
    return { status: 200, data: data || [] };
  }

  if (op === 'commit') {
    const { deal_id, investor_id, amount, pool_id } = body;
    if (!deal_id || !investor_id || !amount) return { status: 400, error: 'deal_id, investor_id, amount required' };

    // Insert commitment
    const { data: commitment, error: cErr } = await admin.from('investment_commitments').insert({
      user_id: user.id, deal_id, investor_id, amount,
      pool_id: pool_id || null,
      commitment_type: pool_id ? 'pooled' : 'direct',
    }).select('*').single();
    if (cErr) throw cErr;

    // Update deal funding
    const { data: deal } = await admin.from('investment_deals').select('current_funded, required_amount').eq('id', deal_id).single();
    if (deal) {
      const newFunded = Number(deal.current_funded || 0) + Number(amount);
      const pct = Math.min(100, (newFunded / deal.required_amount) * 100);
      await admin.from('investment_deals').update({ current_funded: newFunded, funding_pct: pct, updated_at: new Date().toISOString() }).eq('id', deal_id);
      // Auto-transition to funded
      if (pct >= 100) {
        await admin.from('investment_deals').update({ status: 'funded', updated_at: new Date().toISOString() }).eq('id', deal_id).eq('status', 'seeking_funding');
      }
    }

    // Update investor total
    await admin.from('investment_investors').update({
      total_invested: admin.rpc ? undefined : undefined, // handled by trigger or manual
      updated_at: new Date().toISOString(),
    }).eq('id', investor_id);

    // Log transaction
    await admin.from('investment_transactions').insert({
      user_id: user.id, deal_id, investor_id, pool_id: pool_id || null,
      transaction_type: 'invest', amount, description: `Invested $${amount} in deal`,
    });

    return { status: 201, data: commitment };
  }

  if (op === 'withdraw') {
    const { id } = body;
    if (!id) return { status: 400, error: 'id required' };
    const { data: c } = await admin.from('investment_commitments').select('*').eq('id', id).eq('user_id', user.id).single();
    if (!c) return { status: 404, error: 'Commitment not found' };

    await admin.from('investment_commitments').update({ status: 'withdrawn', updated_at: new Date().toISOString() }).eq('id', id);

    // Update deal funding
    const { data: deal } = await admin.from('investment_deals').select('current_funded, required_amount').eq('id', c.deal_id).single();
    if (deal) {
      const newFunded = Math.max(0, Number(deal.current_funded || 0) - Number(c.amount));
      await admin.from('investment_deals').update({ current_funded: newFunded, funding_pct: (newFunded / deal.required_amount) * 100, updated_at: new Date().toISOString() }).eq('id', c.deal_id);
    }

    await admin.from('investment_transactions').insert({
      user_id: user.id, deal_id: c.deal_id, investor_id: c.investor_id,
      transaction_type: 'withdraw', amount: c.amount, description: 'Withdrew investment',
    });

    return { status: 200, data: { withdrawn: true } };
  }

  return { status: 400, error: 'Invalid op' };
}
