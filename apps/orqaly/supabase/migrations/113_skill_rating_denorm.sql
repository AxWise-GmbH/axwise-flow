-- ===========================================================================
-- 113_skill_rating_denorm.sql — Denormalize rating count on skill packs
--
-- agent_skill_packs.rating_avg already exists (unused). Adds rating_count
-- so the marketplace card can show "⭐ 4.6 · 23" without a JOIN.
-- ===========================================================================

ALTER TABLE agent_skill_packs
  ADD COLUMN IF NOT EXISTS rating_count int NOT NULL DEFAULT 0;

-- Backfill rating_avg + rating_count from marketplace_ratings for any existing
-- skill ratings (one-shot; future ratings are written denormalized by the
-- submit handler).
UPDATE agent_skill_packs p
SET
  rating_count = sub.cnt,
  rating_avg = sub.avg
FROM (
  SELECT item_id, COUNT(*)::int AS cnt, ROUND(AVG(rating)::numeric, 2) AS avg
  FROM marketplace_ratings
  WHERE item_type = 'skill'
  GROUP BY item_id
) sub
WHERE p.id::text = sub.item_id::text
  AND (p.rating_count <> sub.cnt OR p.rating_avg IS DISTINCT FROM sub.avg);

COMMENT ON COLUMN agent_skill_packs.rating_count IS
  'Number of marketplace_ratings rows with item_type=skill for this skill. Denormalized on every rating submit.';
