/**
 * Deal documents handler — list, get signed upload URL, delete.
 * Files live in Supabase Storage bucket: deal-documents
 */

const VALID_CATEGORIES = ['pitch_deck','business_plan','financial_model','term_sheet','executive_summary','due_diligence','other'];

export default async function handler(admin, user, req) {
  const op = req.query?.op || req.query?.action;
  const body = req.body || {};

  if (op === 'list' || req.method === 'GET') {
    const { deal_id } = req.query;
    if (!deal_id) return { status: 400, error: 'deal_id required' };
    // Intentional: any authenticated user can list documents for a deal (deal viewers/investors)
    const { data, error } = await admin
      .from('deal_documents')
      .select('*')
      .eq('deal_id', deal_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { status: 200, data: data || [] };
  }

  if (op === 'get-upload-url') {
    const { deal_id, filename, category, mime_type, file_size } = body;
    if (!deal_id || !filename || !category) {
      return { status: 400, error: 'deal_id, filename, and category required' };
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return { status: 400, error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` };
    }

    // Verify deal belongs to this user before issuing upload URL
    const { data: deal, error: dealErr } = await admin
      .from('investment_deals')
      .select('id')
      .eq('id', deal_id)
      .eq('user_id', user.id)
      .single();
    if (dealErr || !deal) return { status: 403, error: 'Deal not found or access denied' };

    // Sanitize filename and build a unique storage path
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${deal_id}/${category}/${Date.now()}_${safe}`;

    const { data: signedData, error: signErr } = await admin.storage
      .from('deal-documents')
      .createSignedUploadUrl(storagePath);
    if (signErr) throw signErr;

    // Pre-register the document row (file_size/mime_type filled in after upload)
    const { data: doc, error: insertErr } = await admin
      .from('deal_documents')
      .insert({
        user_id: user.id,
        deal_id,
        category,
        name: filename,
        storage_path: storagePath,
        file_size: file_size || null,
        mime_type: mime_type || null,
      })
      .select('*')
      .single();
    if (insertErr) throw insertErr;

    return {
      status: 201,
      data: {
        document: doc,
        upload_url: signedData.signedUrl,
        token: signedData.token,
        path: storagePath,
      },
    };
  }

  if (op === 'get-download-url') {
    const { id } = req.query;
    if (!id) return { status: 400, error: 'id required' };
    // Intentional: any authenticated user who knows a document ID can download it (deal viewers/investors)
    const { data: doc, error: docErr } = await admin
      .from('deal_documents')
      .select('storage_path, name')
      .eq('id', id)
      .single();
    if (docErr) throw docErr;

    const { data: signed, error: signErr } = await admin.storage
      .from('deal-documents')
      .createSignedUrl(doc.storage_path, 3600); // 1 hour expiry
    if (signErr) throw signErr;

    return { status: 200, data: { url: signed.signedUrl, name: doc.name } };
  }

  if (op === 'delete') {
    const { id } = body;
    if (!id) return { status: 400, error: 'id required' };
    const { data: doc, error: fetchErr } = await admin
      .from('deal_documents')
      .select('storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (fetchErr) return { status: 404, error: 'Document not found' };

    // Delete from storage first
    const { error: storageErr } = await admin.storage.from('deal-documents').remove([doc.storage_path]);
    if (storageErr) {
      // Log but don't fail — DB row deletion still proceeds to keep DB consistent
      console.warn('deal-documents: storage delete failed', storageErr.message, doc.storage_path);
    }

    // Then delete DB row
    const { error: delErr } = await admin
      .from('deal_documents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (delErr) throw delErr;
    return { status: 200, data: { deleted: true } };
  }

  return { status: 400, error: 'Invalid op. Valid ops: list, get-upload-url, get-download-url, delete' };
}
