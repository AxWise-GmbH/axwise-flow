/**
 * Investor CRUD handler.
 */
export default async function handler(admin, user, req) {
  const op = req.query?.op || req.query?.action;
  const body = req.body || {};

  if (req.method === 'GET' || op === 'list') {
    const { data, error } = await admin.from('investment_investors').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return { status: 200, data: data || [] };
  }

  if (op === 'get') {
    const { data, error } = await admin.from('investment_investors').select('*').eq('id', req.query.id).single();
    if (error) throw error;
    return { status: 200, data };
  }

  if (op === 'create') {
    const { name, bio, investor_type, investment_capacity, risk_profile, preferred_industries, ai_criteria, agent_id } = body;
    if (!name) return { status: 400, error: 'name required' };
    const { data, error } = await admin.from('investment_investors').insert({
      user_id: user.id, name, bio: bio || '', investor_type: investor_type || 'human',
      investment_capacity: investment_capacity || 0, risk_profile: risk_profile || 'moderate',
      preferred_industries: preferred_industries || [], ai_criteria: ai_criteria || {},
      agent_id: agent_id || null,
    }).select('*').single();
    if (error) throw error;
    return { status: 201, data };
  }

  if (op === 'update') {
    const { id, ...updates } = body;
    if (!id) return { status: 400, error: 'id required' };
    updates.updated_at = new Date().toISOString();
    const { data, error } = await admin.from('investment_investors').update(updates).eq('id', id).eq('user_id', user.id).select('*').single();
    if (error) throw error;
    return { status: 200, data };
  }

  if (op === 'delete') {
    const { id } = body;
    if (!id) return { status: 400, error: 'id required' };
    const { error } = await admin.from('investment_investors').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    return { status: 200, data: { deleted: true } };
  }

  return { status: 400, error: 'Invalid op' };
}
