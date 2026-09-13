-- Allow 'gemini' as a concilium member provider.
-- The member form (and members service) offer Google Gemini, but the original
-- CHECK in 043_concilium_v2_schema.sql omitted it, so adding a Gemini member
-- failed with a constraint violation.

ALTER TABLE public.concilium_members
  DROP CONSTRAINT IF EXISTS concilium_members_provider_check;

ALTER TABLE public.concilium_members
  ADD CONSTRAINT concilium_members_provider_check
  CHECK (provider IN ('groq', 'openai', 'anthropic', 'deepseek', 'glm', 'gemini'));
