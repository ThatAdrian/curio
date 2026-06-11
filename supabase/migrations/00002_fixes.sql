-- ============================================================================
-- CURIO — migration 00002: policy fixes found during the app build
-- Paste into Supabase Dashboard → SQL Editor → Run (safe to run once).
--
-- Fixes:
--  1. room_members SELECT policy referenced its own table → infinite recursion.
--     Postgres rejects every room query with "infinite recursion detected".
--  2. Anyone could insert themselves into ANY room (privacy hole).
--  3. clubs had no INSERT/UPDATE policy → founding a club was impossible.
--  4. notifications had no INSERT policy → app couldn't notify anyone.
--  5. Room owners couldn't add members (invites).
-- ============================================================================

-- security-definer helpers break the RLS recursion
create or replace function is_room_member(rid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = rid and user_id = uid);
$$;
create or replace function is_room_owner(rid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = rid and user_id = uid and role = 'owner');
$$;

-- 1 + 2: rebuild room_members policies
drop policy if exists room_members_read on room_members;
drop policy if exists room_members_join on room_members;
drop policy if exists room_members_leave on room_members;

create policy room_members_read on room_members for select
  using (user_id = auth.uid() or is_room_member(room_id, auth.uid()));

-- creator bootstraps themselves as the first member of their own room
create policy room_members_bootstrap on room_members for insert
  with check (auth.uid() = user_id
              and exists (select 1 from rooms r where r.id = room_id and r.created_by = auth.uid()));

-- 5: owners add members (invite flow)
create policy room_members_owner_add on room_members for insert
  with check (is_room_owner(room_id, auth.uid()));

create policy room_members_leave on room_members for delete
  using (auth.uid() = user_id or is_room_owner(room_id, auth.uid()));

-- rebuild rooms policies on the helpers too (they queried room_members)
drop policy if exists rooms_member_read on rooms;
drop policy if exists rooms_owner_update on rooms;
create policy rooms_member_read on rooms for select
  using (created_by = auth.uid() or is_room_member(id, auth.uid()));
create policy rooms_member_update on rooms for update
  using (is_room_member(id, auth.uid()));

-- 3: clubs can be founded and edited by their owner
create policy clubs_create on clubs for insert
  with check (auth.uid() = created_by);
create policy clubs_owner_update on clubs for update
  using (exists (select 1 from club_members m
                 where m.club_id = id and m.user_id = auth.uid() and m.role = 'owner'));

-- 4: notifications can be inserted by the acting user, for anyone
create policy notifications_insert on notifications for insert
  with check (auth.uid() = actor_id);
