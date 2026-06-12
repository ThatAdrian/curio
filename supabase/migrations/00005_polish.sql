-- ============================================================================
-- CURIO — migration 00005: club role management
-- Paste into Supabase Dashboard → SQL Editor → Run (after 00004).
-- Owners can promote/demote mods; without this the role buttons silently fail.
-- ============================================================================
create policy club_members_owner_manage on club_members for update
  using (exists (select 1 from club_members m
                 where m.club_id = club_members.club_id
                   and m.user_id = auth.uid() and m.role = 'owner'));
