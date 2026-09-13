-- Migrate existing concilium data: populate uuid_id, create members from llms JSONB,
-- create default criteria and consensus rules for each board.
-- Phase 2: Schema Foundation — data backfill

-- ── 1. Backfill uuid_id on existing boards ────────────────────────────

UPDATE public.concilium
SET uuid_id = gen_random_uuid(),
    legacy_id = id
WHERE uuid_id IS NULL;

-- ── 2. Create concilium_members from existing llms JSONB array ────────

-- Each existing board has a `llms` JSONB array like:
-- [{"provider":"groq","model":"llama-3.3-70b-versatile","label":"Groq – Llama 3.3 70B"}, ...]
-- Convert each entry into a proper concilium_member row.

INSERT INTO public.concilium_members (user_id, concilium_id, name, role, provider, model)
SELECT
  c.user_id,
  c.id,
  COALESCE(llm->>'label', CONCAT(llm->>'provider', ' – ', llm->>'model')),
  'evaluator',
  COALESCE(llm->>'provider', 'groq'),
  COALESCE(llm->>'model', 'llama-3.3-70b-versatile')
FROM public.concilium c,
     jsonb_array_elements(c.llms) AS llm
WHERE c.user_id IS NOT NULL
  AND jsonb_array_length(c.llms) > 0
ON CONFLICT DO NOTHING;

-- ── 3. Create default criteria for each existing board ────────────────

INSERT INTO public.concilium_criteria (user_id, concilium_id, name, weight, rubric, sort_order)
SELECT
  c.user_id,
  c.id,
  crit.name,
  crit.weight,
  crit.rubric,
  crit.sort_order
FROM public.concilium c
CROSS JOIN (VALUES
  ('Quality',        0.30, 'Evaluate overall quality of the work product.', 0),
  ('Completeness',   0.25, 'Assess whether all requirements are addressed.', 1),
  ('Accuracy',       0.25, 'Check factual correctness and precision.', 2),
  ('Actionability',  0.20, 'Rate how actionable and practical the recommendations are.', 3)
) AS crit(name, weight, rubric, sort_order)
WHERE c.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 4. Create default consensus rules for each existing board ─────────

INSERT INTO public.concilium_consensus_rules (user_id, concilium_id, consensus_type, quorum, approval_threshold, split_decision_strategy)
SELECT
  c.user_id,
  c.id,
  'majority',
  2,
  0.50,
  'chairman_decides'
FROM public.concilium c
WHERE c.user_id IS NOT NULL
ON CONFLICT (concilium_id) DO NOTHING;
