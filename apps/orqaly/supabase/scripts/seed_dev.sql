-- Seed script for local/dev Supabase
-- Run after migrations 001, 002, 003 in Supabase SQL Editor.
-- Replace :user_id with a real auth.users(id) from your project.

-- Example: get a user id from Supabase Auth (run in SQL Editor)
-- SELECT id FROM auth.users LIMIT 1;

-- Insert sample partners (replace 'YOUR_USER_UUID' with real user id)
-- INSERT INTO public.partners (id, user_id, data, created_at, updated_at)
-- VALUES
--   ('P-001', 'YOUR_USER_UUID', '{"name":"Demo Partner A","funnelStatus":"Active"}'::jsonb, NOW(), NOW()),
--   ('P-002', 'YOUR_USER_UUID', '{"name":"Demo Partner B","funnelStatus":"Contacted"}'::jsonb, NOW(), NOW());

-- Run migrations first, then manually insert seed data with your user_id.
-- This file documents the expected structure; actual seed is project-specific.
