-- Backfill goals missing org_id with the user's Traktor organization.

UPDATE public.goals g
SET org_id = o.id
FROM public.organizations o
WHERE g.org_id IS NULL
  AND g.user_id = o.user_id
  AND lower(trim(o.name)) = 'traktor';
