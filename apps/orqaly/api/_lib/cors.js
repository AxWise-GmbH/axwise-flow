/** Shared CORS for API routes. Production: orqaly.com + orchestratori.vercel.app (no other *.vercel.app). */
const PROD_ORIGINS = [
  'https://orqaly.com',
  'https://www.orqaly.com',
  'https://orchestratori.orqaly.com',
  'https://orchestratori.vercel.app',
];

export function getAllowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS || '';
  if (env)
    return env
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  return [
    ...PROD_ORIGINS,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
  ];
}

export function cors(res, req) {
  const origin = req.headers.origin || '';
  const allowed = getAllowedOrigins();
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const allowLocalhost = process.env.ALLOW_LOCALHOST_ORIGIN === 'true' || !isProd;
  const isAllowed =
    allowed.includes(origin) || PROD_ORIGINS.includes(origin) || (allowLocalhost && /^http:\/\/localhost:\d+$/i.test(origin));
  const allow = isAllowed ? origin : allowed[0] || 'https://orqaly.com';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-API-Version', '1');
}
