-- ============================================================================
-- CURIO — migration 00006: preferences + mod reports inbox
-- ============================================================================
alter table profiles add column if not exists prefs jsonb not null default '{}'::jsonb;

-- club owners/mods can see + resolve open reports against posts in their club
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
