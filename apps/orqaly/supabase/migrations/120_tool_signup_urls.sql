-- 120_tool_signup_urls.sql
-- Phase 8b — backfill signup_url into existing user tools.data rows.
-- Required for h40-missing-credential to auto-dispatch Sandris without
-- falling through to the human fallback.
--
-- Uses jsonb_set with create_missing=true but scoped with a WHERE clause so
-- we never overwrite a value the user has already customized.

DO $$
DECLARE
  t RECORD;
  -- Mapping tool_id → public signup page. Additions welcome; keep to
  -- providers that explicitly allow developer self-service signup.
  mapping jsonb := '{
    "tool-web-search":      "https://tavily.com/#api",
    "tool-email":           "https://resend.com/signup",
    "tool-github":          "https://github.com/signup",
    "tool-vercel":          "https://vercel.com/signup",
    "tool-cloudflare-pages":"https://dash.cloudflare.com/sign-up",
    "tool-stability-ai":    "https://platform.stability.ai/account/signup",
    "tool-pexels":          "https://www.pexels.com/api/",
    "tool-unsplash":        "https://unsplash.com/oauth/applications",
    "tool-figma":           "https://www.figma.com/signup",
    "tool-http-client":     null,
    "tool-browser":         "https://www.browserless.io/sign-up",
    "tool-captcha-solver":  "https://2captcha.com/enterpage",
    "tool-capsolver-solver":"https://dashboard.capsolver.com/passport/register",
    "tool-sms-verify":      "https://5sim.net/register",
    "tool-rentahuman":      "https://rentahuman.ai/signup",
    "tool-twitter":         "https://developer.twitter.com/en/portal/petition/essential/basic-info",
    "tool-analytics":       "https://analytics.google.com/",
    "tool-canva":           "https://www.canva.com/developers/apps",
    "tool-slack":           "https://api.slack.com/apps",
    "tool-notion":          "https://www.notion.so/my-integrations",
    "tool-linear":          "https://linear.app/settings/api",
    "tool-pdf-generator":   "https://pdfshift.io/account/signup"
  }'::jsonb;
  key text;
  url text;
BEGIN
  FOR key, url IN SELECT * FROM jsonb_each_text(mapping) LOOP
    IF url IS NULL THEN CONTINUE; END IF;
    UPDATE public.tools
       SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{signup_url}', to_jsonb(url), true),
           updated_at = now()
     WHERE id = key
       AND (data ? 'signup_url') = false;  -- only fill in when missing
  END LOOP;
END $$;
