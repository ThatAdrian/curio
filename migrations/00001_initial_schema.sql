-- ============================================================================
-- CURIO — initial schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Everything is RLS-protected. Service-role bypasses RLS (edge functions).
-- ============================================================================

create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type media_type      as enum ('film','tv','game','book','music');
create type visibility_t    as enum ('public','followers','private');
create type shelf_kind      as enum ('standard','custom','smart');
create type review_status   as enum ('draft','published');
create type loan_status     as enum ('requested','active','returned','declined','overdue');
create type bag_status      as enum ('pending','opened','finished','returned');
create type wrap_status     as enum ('pending','accepted','ripped','declined');
create type bag_outcome     as enum ('shelved','watch_later','skipped');
create type room_role       as enum ('owner','member');
create type club_role       as enum ('owner','mod','member');
create type mark_kind       as enum ('date','sticker');
create type canvas_kind     as enum ('letter','photo','note','sticker','ticket','custom');
create type report_status   as enum ('open','reviewed','actioned','dismissed');
create type report_target   as enum ('profile','review','comment','club_post','guestbook_entry','list');
create type import_source   as enum ('letterboxd','goodreads','backloggd','lastfm','storygraph','csv');
create type receipt_kind    as enum ('monthly','annual');
create type session_kind    as enum ('watch_together','listen_along');
create type autograph_target as enum ('shelf_item','guestbook_page','profile_module');
create type notif_type as enum (
  'follow','review_like','review_comment','comment_reply','guestbook_signed',
  'loan_requested','loan_accepted','loan_due','loan_returned',
  'bag_received','bag_returned','wrap_received',
  'club_invite','club_post','room_invite','session_invite',
  'autograph_fulfilled','badge_earned','import_finished','receipt_ready','report_update'
);

-- ----------------------------------------------------------------------------
-- PROFILES & SOCIAL GRAPH
-- ----------------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      citext unique not null check (length(username) between 2 and 24 and username ~ '^[a-z0-9_]+$'),
  display_name  text,
  bio           text check (length(bio) <= 400),
  avatar_url    text,
  is_verified   boolean not null default false,        -- verified creators (autographs)
  visibility    visibility_t not null default 'public',
  -- the entire customisation token dictionary lives here:
  -- {theme, accent, radius, frame, avatar_shape, avatar_deco, banner,
  --  canvas_surface, default_shelf_material, module_layout:[...]}
  theme         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index on follows (followee_id);

create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- helper: can `viewer` see content owned by `owner` with visibility `vis`?
create or replace function can_view(owner uuid, vis visibility_t, viewer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when viewer = owner then true
    when exists (select 1 from blocks b where b.blocker_id = owner and b.blocked_id = viewer) then false
    when vis = 'public' then true
    when vis = 'followers' then exists (
      select 1 from follows f where f.follower_id = viewer and f.followee_id = owner)
    else false
  end;
$$;

-- ----------------------------------------------------------------------------
-- MEDIA (canonical metadata cache, written by the metadata edge function)
-- ----------------------------------------------------------------------------
create table media_items (
  id              uuid primary key default gen_random_uuid(),
  media_type      media_type not null,
  external_source text not null,            -- 'tmdb' | 'igdb' | 'openlibrary' | 'musicbrainz'
  external_id     text not null,
  title           text not null,
  sort_title      text,
  year            int,
  creators        jsonb not null default '[]'::jsonb,   -- [{role,name}]
  cover_url       text,
  official_url    text,
  description     text,
  -- thickness metric + media-page facts live here:
  -- {page_count, runtime_min, episode_count, disc_count, platforms:[],
  --  genres:[], moods:[], is_box_set, is_gatefold}
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (media_type, external_source, external_id)
);
create index on media_items using gin (to_tsvector('simple', title));

-- variant covers (regional pressings, first editions) — unlock at 100% completion
create table media_variants (
  id             uuid primary key default gen_random_uuid(),
  media_item_id  uuid not null references media_items(id) on delete cascade,
  name           text not null,
  region         text,
  kind           text,                      -- 'regional' | 'first_edition' | 'collector' | ...
  cover_url      text not null,
  contributed_by uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SHELVES (standard per-type, custom, and smart shelves with stored rules)
-- ----------------------------------------------------------------------------
create table shelves (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles(id) on delete cascade,
  name            text not null,
  media_type      media_type,               -- null = mixed
  kind            shelf_kind not null default 'custom',
  -- smart shelves: rules evaluated client-side, e.g.
  -- {all:[{field:'rating',op:'>=',value:4.5},{field:'year',op:'<',value:1990}]}
  smart_rules     jsonb,
  material        text not null default 'default',   -- per-shelf skin
  sort_mode       text not null default 'curated',   -- curated | az | year | added
  position        int  not null default 0,
  visibility      visibility_t not null default 'public',
  show_on_profile boolean not null default true,
  created_at      timestamptz not null default now()
);
create index on shelves (owner_id);

create table shelf_items (
  id               uuid primary key default gen_random_uuid(),
  shelf_id         uuid not null references shelves(id) on delete cascade,
  media_item_id    uuid not null references media_items(id) on delete cascade,
  variant_id       uuid references media_variants(id) on delete set null,
  position         int not null default 0,
  completion       int not null default 0 check (completion between 0 and 100),
  completed_at     timestamptz,             -- gate for variant hunting
  times_consumed   int not null default 0,  -- wear & patina source
  last_consumed_at timestamptz,             -- dust / backlog-nudge source
  price_sticker    jsonb,                   -- {label:'£3.50', peeled:false}
  -- 2.0 launcher hooks (desktop app fills these):
  file_link        jsonb,                   -- {path, handler, secondary_paths:[]}
  decorations      jsonb not null default '[]'::jsonb, -- placed sprites on this row segment
  added_at         timestamptz not null default now(),
  unique (shelf_id, media_item_id)
);
create index on shelf_items (media_item_id);

-- ----------------------------------------------------------------------------
-- RATINGS (half-stars) + per-title distribution kept hot by trigger
-- ----------------------------------------------------------------------------
create table ratings (
  user_id       uuid not null references profiles(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  rating        numeric(2,1) not null
                check (rating between 0.5 and 5.0 and mod((rating*10)::int, 5) = 0),
  rated_at      timestamptz not null default now(),
  primary key (user_id, media_item_id)
);
create index on ratings (media_item_id);

create table media_stats (
  media_item_id uuid primary key references media_items(id) on delete cascade,
  rating_count  int not null default 0,
  rating_sum    numeric not null default 0,
  -- histogram[1] = 0.5★ ... histogram[10] = 5.0★
  histogram     int[] not null default array[0,0,0,0,0,0,0,0,0,0]
);

create or replace function bump_media_stats() returns trigger
language plpgsql security definer set search_path = public as $$
declare slot_old int; slot_new int;
begin
  if tg_op in ('UPDATE','DELETE') then
    slot_old := (old.rating * 2)::int;
    update media_stats set rating_count = rating_count - 1,
      rating_sum = rating_sum - old.rating,
      histogram[slot_old] = histogram[slot_old] - 1
      where media_item_id = old.media_item_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    insert into media_stats (media_item_id) values (new.media_item_id)
      on conflict (media_item_id) do nothing;
    slot_new := (new.rating * 2)::int;
    update media_stats set rating_count = rating_count + 1,
      rating_sum = rating_sum + new.rating,
      histogram[slot_new] = histogram[slot_new] + 1
      where media_item_id = new.media_item_id;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_media_stats after insert or update or delete on ratings
  for each row execute function bump_media_stats();

-- ----------------------------------------------------------------------------
-- REVIEWS (markdown, drafts, spoiler tags) + likes + threaded comments
-- ----------------------------------------------------------------------------
create table reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  media_item_id     uuid not null references media_items(id) on delete cascade,
  body_md           text not null check (length(body_md) <= 20000),
  status            review_status not null default 'draft',
  contains_spoilers boolean not null default false,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on reviews (media_item_id) where status = 'published';
create index on reviews (user_id);

create table review_likes (
  review_id uuid not null references reviews(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table review_comments (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references reviews(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  parent_id  uuid references review_comments(id) on delete cascade,
  body_md    text not null check (length(body_md) <= 4000),
  created_at timestamptz not null default now()
);
create index on review_comments (review_id);

-- ----------------------------------------------------------------------------
-- DIARY (calendar view of consumption; powers receipts)
-- ----------------------------------------------------------------------------
create table diary_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  consumed_on   date not null default current_date,
  is_rewatch    boolean not null default false,
  -- {minutes, pages, episodes:'S2E7', plays, session_no}
  progress      jsonb not null default '{}'::jsonb,
  note          text check (length(note) <= 2000),
  created_at    timestamptz not null default now()
);
create index on diary_entries (user_id, consumed_on);

-- ----------------------------------------------------------------------------
-- LISTS (collaborative; watch-later is a per-user system list)
-- ----------------------------------------------------------------------------
create table lists (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references profiles(id) on delete cascade,
  title            text not null,
  description_md   text,
  is_collaborative boolean not null default false,
  is_system        boolean not null default false,   -- 'Watch later', 'Wishlist'
  system_key       text,                             -- 'watch_later' | 'wishlist'
  visibility       visibility_t not null default 'public',
  created_at       timestamptz not null default now(),
  unique (owner_id, system_key)
);

create table list_collaborators (
  list_id  uuid not null references lists(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table list_items (
  list_id       uuid not null references lists(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  position      int not null default 0,
  note          text,
  added_by      uuid references profiles(id) on delete set null,
  added_at      timestamptz not null default now(),
  primary key (list_id, media_item_id)
);

-- ----------------------------------------------------------------------------
-- ROOMS (living rooms: solo or multi-member) + LOANS (borrowing tokens)
-- ----------------------------------------------------------------------------
create table rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  -- {tv:{media_item_id, position_s}, player:{media_item_id, spinning},
  --  lighting:'dim', furniture_layout:[...]}  ← future room editor
  state      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table room_members (
  room_id   uuid not null references rooms(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      room_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index on room_members (user_id);

create table loans (
  id            uuid primary key default gen_random_uuid(),
  lender_id     uuid not null references profiles(id) on delete cascade,
  borrower_id   uuid not null references profiles(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  shelf_item_id uuid references shelf_items(id) on delete set null,
  room_id       uuid references rooms(id) on delete set null,  -- which table it sits on
  status        loan_status not null default 'requested',
  requested_at  timestamptz not null default now(),
  accepted_at   timestamptz,
  due_at        timestamptz,
  returned_at   timestamptz,
  check (lender_id <> borrower_id)
);
create index on loans (borrower_id) where status = 'active';
create index on loans (lender_id)   where status = 'active';

-- shared sessions (watch-together / listen-along), usually inside a room
create table shared_sessions (
  id            uuid primary key default gen_random_uuid(),
  kind          session_kind not null,
  room_id       uuid references rooms(id) on delete cascade,
  club_id       uuid,                       -- fk added after clubs table
  host_id       uuid not null references profiles(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  state         jsonb not null default '{}'::jsonb,   -- {position_s, paused}
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);

create table session_participants (
  session_id uuid not null references shared_sessions(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- ----------------------------------------------------------------------------
-- GIFTS: recommendation bags + blind-date wraps
-- ----------------------------------------------------------------------------
create table rec_bags (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  note         text check (length(note) <= 280),      -- taped to the bag
  status       bag_status not null default 'pending',
  created_at   timestamptz not null default now(),
  opened_at    timestamptz,
  finished_at  timestamptz,
  check (sender_id <> recipient_id)
);

create table bag_items (
  bag_id        uuid not null references rec_bags(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  position      int not null default 0,
  pulled_at     timestamptz,
  outcome       bag_outcome,
  primary key (bag_id, media_item_id)
);

create table blind_wraps (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references profiles(id) on delete cascade,
  recipient_id  uuid not null references profiles(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  tags          text[] not null check (array_length(tags,1) = 3),
  status        wrap_status not null default 'pending',
  created_at    timestamptz not null default now(),
  ripped_at     timestamptz,
  check (sender_id <> recipient_id)
);

-- ----------------------------------------------------------------------------
-- GUESTBOOK (one author per page; user-placed stamps & stickers)
-- ----------------------------------------------------------------------------
create table guestbook_entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,  -- whose book
  author_id   uuid not null references profiles(id) on delete cascade,  -- who signed
  body        text not null check (length(body) <= 600),
  page_order  int,                       -- owner-controlled ordering; null = chronological
  created_at  timestamptz not null default now()
);
create index on guestbook_entries (owner_id);

create table guestbook_marks (
  id        uuid primary key default gen_random_uuid(),
  entry_id  uuid not null references guestbook_entries(id) on delete cascade,
  kind      mark_kind not null,
  value     text not null,               -- date string or emoji
  x         numeric(5,2) not null check (x between 0 and 100),
  y         numeric(5,2) not null check (y between 0 and 100),
  rotation  numeric(5,1) not null default 0
);

create table guestbook_likes (
  entry_id uuid not null references guestbook_entries(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  primary key (entry_id, user_id)
);

-- ----------------------------------------------------------------------------
-- CLUBS (chronological feeds + corkboard bulletins + mod tooling)
-- ----------------------------------------------------------------------------
create table clubs (
  id          uuid primary key default gen_random_uuid(),
  slug        citext unique not null,
  name        text not null,
  description text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table club_members (
  club_id   uuid not null references clubs(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      club_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index on club_members (user_id);

create table club_posts (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references clubs(id) on delete cascade,
  author_id     uuid not null references profiles(id) on delete cascade,
  body_md       text not null check (length(body_md) <= 10000),
  media_item_id uuid references media_items(id) on delete set null,
  removed_by    uuid references profiles(id),     -- mod removal (soft)
  created_at    timestamptz not null default now()
);
create index on club_posts (club_id, created_at desc);

create table club_post_likes (
  post_id uuid not null references club_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

create table club_bulletins (
  id        uuid primary key default gen_random_uuid(),
  club_id   uuid not null references clubs(id) on delete cascade,
  title     text not null,
  body      text,
  position  int not null default 0,
  pinned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table shared_sessions
  add constraint shared_sessions_club_fk
  foreign key (club_id) references clubs(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- MODERATION (reports; blocks defined above)
-- ----------------------------------------------------------------------------
create table reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_kind report_target not null,
  target_id   uuid not null,
  reason      text not null,
  details     text,
  status      report_status not null default 'open',
  handled_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index on reports (status);

-- ----------------------------------------------------------------------------
-- CONNECTIONS, IMPORTS, BADGES, AUTOGRAPHS, CANVAS, RECEIPTS, NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  provider          text not null,         -- 'steam','discord','lastfm','trakt',...
  external_username text,
  external_id       text,
  show_on_profile   boolean not null default true,
  sync_enabled      boolean not null default false,
  last_synced_at    timestamptz,
  meta              jsonb not null default '{}'::jsonb,
  unique (user_id, provider)
);

create table imports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  source     import_source not null,
  file_path  text,                          -- storage path of uploaded CSV
  status     text not null default 'pending',
  stats      jsonb not null default '{}'::jsonb,  -- {rows, matched, skipped}
  created_at timestamptz not null default now()
);

create table badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  icon        text
);

create table user_badges (
  user_id   uuid not null references profiles(id) on delete cascade,
  badge_id  uuid not null references badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  meta      jsonb not null default '{}'::jsonb,
  primary key (user_id, badge_id)
);

create table autographs (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references profiles(id) on delete cascade,  -- must be verified
  requester_id uuid not null references profiles(id) on delete cascade,
  target_kind  autograph_target not null,
  target_id    uuid not null,
  -- either a stamp image or stored stroke data
  signature    jsonb not null,
  fulfilled_at timestamptz,
  created_at   timestamptz not null default now()
);

create table canvas_items (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references profiles(id) on delete cascade,
  kind     canvas_kind not null,
  content  jsonb not null default '{}'::jsonb,  -- {char,color} | {image_url,caption} | {text}
  x        numeric(6,2) not null default 0,
  y        numeric(6,2) not null default 0,
  rotation numeric(5,1) not null default 0,
  z        int not null default 0,
  created_at timestamptz not null default now()
);
create index on canvas_items (user_id);

create table receipts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  kind         receipt_kind not null,
  period_start date not null,
  data         jsonb not null,              -- fully rendered line items
  generated_at timestamptz not null default now(),
  unique (user_id, kind, period_start)
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       notif_type not null,
  actor_id   uuid references profiles(id) on delete set null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc) where read_at is null;

-- ----------------------------------------------------------------------------
-- NEW-USER BOOTSTRAP: profile + default shelves + system lists
-- ----------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username',
                    'user_' || substr(new.id::text, 1, 8));
  insert into profiles (id, username, display_name)
    values (new.id, uname, coalesce(new.raw_user_meta_data->>'display_name', uname));
  insert into shelves (owner_id, name, media_type, kind, position) values
    (new.id, 'The video shop',    'film',  'standard', 0),
    (new.id, 'The box-set pile',  'tv',    'standard', 1),
    (new.id, 'The console cabinet','game', 'standard', 2),
    (new.id, 'The bookcase',      'book',  'standard', 3),
    (new.id, 'The crate',         'music', 'standard', 4);
  insert into lists (owner_id, title, is_system, system_key, visibility) values
    (new.id, 'Watch later', true, 'watch_later', 'private'),
    (new.id, 'Wishlist',    true, 'wishlist',    'followers');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger t_profiles_touch before update on profiles    for each row execute function touch_updated_at();
create trigger t_media_touch    before update on media_items for each row execute function touch_updated_at();
create trigger t_reviews_touch  before update on reviews     for each row execute function touch_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table profiles           enable row level security;
alter table follows            enable row level security;
alter table blocks             enable row level security;
alter table media_items        enable row level security;
alter table media_variants     enable row level security;
alter table media_stats        enable row level security;
alter table shelves            enable row level security;
alter table shelf_items        enable row level security;
alter table ratings            enable row level security;
alter table reviews            enable row level security;
alter table review_likes       enable row level security;
alter table review_comments    enable row level security;
alter table diary_entries      enable row level security;
alter table lists              enable row level security;
alter table list_collaborators enable row level security;
alter table list_items         enable row level security;
alter table rooms              enable row level security;
alter table room_members       enable row level security;
alter table loans              enable row level security;
alter table shared_sessions    enable row level security;
alter table session_participants enable row level security;
alter table rec_bags           enable row level security;
alter table bag_items          enable row level security;
alter table blind_wraps        enable row level security;
alter table guestbook_entries  enable row level security;
alter table guestbook_marks    enable row level security;
alter table guestbook_likes    enable row level security;
alter table clubs              enable row level security;
alter table club_members       enable row level security;
alter table club_posts         enable row level security;
alter table club_post_likes    enable row level security;
alter table club_bulletins     enable row level security;
alter table reports            enable row level security;
alter table connections        enable row level security;
alter table imports            enable row level security;
alter table badges             enable row level security;
alter table user_badges        enable row level security;
alter table autographs         enable row level security;
alter table canvas_items       enable row level security;
alter table receipts           enable row level security;
alter table notifications      enable row level security;

-- profiles: readable per visibility, self-managed
create policy profiles_read   on profiles for select using (can_view(id, visibility, auth.uid()));
create policy profiles_update on profiles for update using (auth.uid() = id);

-- follows / blocks
create policy follows_read   on follows for select using (true);
create policy follows_write  on follows for insert with check (auth.uid() = follower_id);
create policy follows_delete on follows for delete using (auth.uid() = follower_id);
create policy blocks_self    on blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- media: world-readable; writes via service role (edge function) only
create policy media_read    on media_items    for select using (true);
create policy variants_read on media_variants for select using (true);
create policy stats_read    on media_stats    for select using (true);
create policy badges_read   on badges         for select using (true);
create policy clubs_read    on clubs          for select using (true);

-- shelves & items: owner-managed, visible per shelf visibility
create policy shelves_read  on shelves for select
  using (can_view(owner_id, visibility, auth.uid()));
create policy shelves_own   on shelves for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy shelf_items_read on shelf_items for select
  using (exists (select 1 from shelves s where s.id = shelf_id
                 and can_view(s.owner_id, s.visibility, auth.uid())));
create policy shelf_items_own on shelf_items for all
  using (exists (select 1 from shelves s where s.id = shelf_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from shelves s where s.id = shelf_id and s.owner_id = auth.uid()));

-- ratings: public read, self-write
create policy ratings_read on ratings for select using (true);
create policy ratings_own  on ratings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- reviews: published per author visibility; drafts only to self
create policy reviews_read on reviews for select using (
  (status = 'published'
     and exists (select 1 from profiles p where p.id = user_id
                 and can_view(p.id, p.visibility, auth.uid())))
  or auth.uid() = user_id);
create policy reviews_own on reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy review_likes_read on review_likes for select using (true);
create policy review_likes_own  on review_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy comments_read on review_comments for select using (true);
create policy comments_own  on review_comments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- diary: private by default to owner (surface publicly later if wanted)
create policy diary_own on diary_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- lists
create policy lists_read on lists for select
  using (can_view(owner_id, visibility, auth.uid())
         or exists (select 1 from list_collaborators c where c.list_id = id and c.user_id = auth.uid()));
create policy lists_own on lists for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy list_collab_read on list_collaborators for select using (true);
create policy list_collab_manage on list_collaborators for all
  using (exists (select 1 from lists l where l.id = list_id and l.owner_id = auth.uid()));
create policy list_items_read on list_items for select
  using (exists (select 1 from lists l where l.id = list_id
                 and (can_view(l.owner_id, l.visibility, auth.uid())
                      or exists (select 1 from list_collaborators c where c.list_id = l.id and c.user_id = auth.uid()))));
create policy list_items_write on list_items for all
  using (exists (select 1 from lists l where l.id = list_id
                 and (l.owner_id = auth.uid()
                      or (l.is_collaborative and exists
                          (select 1 from list_collaborators c where c.list_id = l.id and c.user_id = auth.uid())))))
  with check (exists (select 1 from lists l where l.id = list_id
                 and (l.owner_id = auth.uid()
                      or (l.is_collaborative and exists
                          (select 1 from list_collaborators c where c.list_id = l.id and c.user_id = auth.uid())))));

-- rooms: members only
create policy rooms_member_read on rooms for select
  using (exists (select 1 from room_members m where m.room_id = id and m.user_id = auth.uid()));
create policy rooms_create on rooms for insert with check (auth.uid() = created_by);
create policy rooms_owner_update on rooms for update
  using (exists (select 1 from room_members m where m.room_id = id and m.user_id = auth.uid()));
create policy room_members_read on room_members for select
  using (exists (select 1 from room_members m where m.room_id = room_members.room_id and m.user_id = auth.uid()));
create policy room_members_join on room_members for insert with check (auth.uid() = user_id);
create policy room_members_leave on room_members for delete using (auth.uid() = user_id);

-- loans: both parties
create policy loans_parties on loans for select using (auth.uid() in (lender_id, borrower_id));
create policy loans_request on loans for insert with check (auth.uid() = borrower_id);
create policy loans_update  on loans for update using (auth.uid() in (lender_id, borrower_id));

-- sessions: room/club members & participants
create policy sessions_read on shared_sessions for select using (
  auth.uid() = host_id
  or exists (select 1 from session_participants sp where sp.session_id = id and sp.user_id = auth.uid())
  or (room_id is not null and exists (select 1 from room_members m where m.room_id = shared_sessions.room_id and m.user_id = auth.uid()))
  or (club_id is not null and exists (select 1 from club_members m where m.club_id = shared_sessions.club_id and m.user_id = auth.uid())));
create policy sessions_host on shared_sessions for all using (auth.uid() = host_id) with check (auth.uid() = host_id);
create policy session_join on session_participants for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- bags & wraps: sender + recipient
create policy bags_parties on rec_bags for select using (auth.uid() in (sender_id, recipient_id));
create policy bags_send    on rec_bags for insert with check (auth.uid() = sender_id);
create policy bags_update  on rec_bags for update using (auth.uid() in (sender_id, recipient_id));
create policy bag_items_parties on bag_items for select
  using (exists (select 1 from rec_bags b where b.id = bag_id and auth.uid() in (b.sender_id, b.recipient_id)));
create policy bag_items_send on bag_items for insert
  with check (exists (select 1 from rec_bags b where b.id = bag_id and b.sender_id = auth.uid()));
create policy bag_items_pull on bag_items for update
  using (exists (select 1 from rec_bags b where b.id = bag_id and b.recipient_id = auth.uid()));
create policy wraps_parties on blind_wraps for select using (auth.uid() in (sender_id, recipient_id));
create policy wraps_send    on blind_wraps for insert with check (auth.uid() = sender_id);
create policy wraps_update  on blind_wraps for update using (auth.uid() = recipient_id);

-- guestbook: visible with the profile; authors write; owner may reorder/remove
create policy gb_read on guestbook_entries for select
  using (exists (select 1 from profiles p where p.id = owner_id and can_view(p.id, p.visibility, auth.uid())));
create policy gb_sign   on guestbook_entries for insert with check (auth.uid() = author_id);
create policy gb_owner  on guestbook_entries for update using (auth.uid() = owner_id);
create policy gb_remove on guestbook_entries for delete using (auth.uid() in (owner_id, author_id));
create policy gb_marks_read on guestbook_marks for select using (true);
create policy gb_marks_author on guestbook_marks for all
  using (exists (select 1 from guestbook_entries e where e.id = entry_id and e.author_id = auth.uid()))
  with check (exists (select 1 from guestbook_entries e where e.id = entry_id and e.author_id = auth.uid()));
create policy gb_likes on guestbook_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- clubs: world-readable feed, member writes, mods moderate
create policy club_members_read on club_members for select using (true);
create policy club_join  on club_members for insert with check (auth.uid() = user_id);
create policy club_leave on club_members for delete using (auth.uid() = user_id);
create policy club_posts_read on club_posts for select using (removed_by is null or auth.uid() = author_id);
create policy club_posts_write on club_posts for insert
  with check (auth.uid() = author_id
              and exists (select 1 from club_members m where m.club_id = club_posts.club_id and m.user_id = auth.uid()));
create policy club_posts_moderate on club_posts for update
  using (exists (select 1 from club_members m where m.club_id = club_posts.club_id
                 and m.user_id = auth.uid() and m.role in ('owner','mod')));
create policy club_post_likes_all on club_post_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy bulletins_read on club_bulletins for select using (true);
create policy bulletins_mod on club_bulletins for all
  using (exists (select 1 from club_members m where m.club_id = club_bulletins.club_id
                 and m.user_id = auth.uid() and m.role in ('owner','mod')));

-- moderation
create policy reports_create on reports for insert with check (auth.uid() = reporter_id);
create policy reports_own    on reports for select using (auth.uid() = reporter_id);

-- personal data
create policy connections_own on connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy connections_public_read on connections for select using (show_on_profile = true);
create policy imports_own  on imports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_badges_read on user_badges for select using (true);
create policy autographs_read on autographs for select using (true);
create policy autographs_request on autographs for insert with check (auth.uid() = requester_id);
create policy autographs_fulfil on autographs for update using (auth.uid() = creator_id);
create policy canvas_read on canvas_items for select
  using (exists (select 1 from profiles p where p.id = user_id and can_view(p.id, p.visibility, auth.uid())));
create policy canvas_own on canvas_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy receipts_own on receipts for select using (auth.uid() = user_id);
create policy notifications_own on notifications for select using (auth.uid() = user_id);
create policy notifications_mark on notifications for update using (auth.uid() = user_id);
