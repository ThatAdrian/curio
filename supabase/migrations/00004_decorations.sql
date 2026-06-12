-- ============================================================================
-- CURIO — migration 00004: shelf decorations (placeable trinkets)
-- Paste into Supabase Dashboard → SQL Editor → Run (after 00003).
-- ============================================================================
alter table shelves add column if not exists decorations jsonb not null default '[]'::jsonb;
