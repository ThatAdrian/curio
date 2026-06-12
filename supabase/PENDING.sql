-- ============================================================================
-- CURIO — everything not yet run, in one paste (idempotent; safe to re-run).
-- Combines migrations 00004 + 00005 + 00006.
-- Dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- 00004: shelf decorations
alter table shelves add column if not exists decorations jsonb not null default '[]'::jsonb;

-- 00005: club role management
drop policy if exists club_members_owner_manage on club_members;
create policy club_members_owner_manage on club_members for update
  using (exists (select 1 from club_members m
                 where m.club_id = club_members.club_id
                   and m.user_id = auth.uid() and m.role = 'owner'));

-- 00006: preferences + mod reports inbox
alter table profiles add column if not exists prefs jsonb not null default '{}'::jsonb;
drop policy if exists reports_club_mods_read on reports;
create policy reports_club_mods_read on reports for select
  using (target_kind = 'club_post' and exists (
    select 1 from club_posts cp join club_members m on m.club_id = cp.club_id
    where cp.id = reports.target_id and m.user_id = auth.uid() and m.role in ('owner','mod')));
drop policy if exists reports_club_mods_update on reports;
create policy reports_club_mods_update on reports for update
  using (target_kind = 'club_post' and exists (
    select 1 from club_posts cp join club_members m on m.club_id = cp.club_id
    where cp.id = reports.target_id and m.user_id = auth.uid() and m.role in ('owner','mod')));

-- 00007: per-shelf display mode
alter table shelves add column if not exists view_mode text not null default 'spines';
