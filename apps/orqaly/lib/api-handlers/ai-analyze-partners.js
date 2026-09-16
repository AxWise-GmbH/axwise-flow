/**
 * Deprecated stub: ai-analyze-partners moved to Supabase Edge Function (consolidated under api/app).
 */
import { cors } from '../../api/_lib/cors.js';

export default function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(410).json({
    message: 'This endpoint has been removed. Use the Supabase Edge Function instead.',
  });
}
