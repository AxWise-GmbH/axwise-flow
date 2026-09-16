-- Add linked_partner_id to user_roles for Partner role (scope user to one partner)
alter table public.user_roles
  add column if not exists linked_partner_id text;

comment on column public.user_roles.linked_partner_id is 'For role-partner: partner id this user is scoped to. Null for other roles.';
