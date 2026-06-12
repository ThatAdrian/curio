-- ============================================================================
-- CURIO — migration 00003: badges seed + policies for the feature build
-- Paste into Supabase Dashboard → SQL Editor → Run (after 00002).
-- ============================================================================

insert into badges (slug, name, description, icon) values
  ('first_shelf',  'Shelf Life',        'Shelved your first item',            '📚'),
  ('archivist',    'Archivist',         '50 items shelved',                   '🗃️'),
  ('first_review', 'Opening Statement', 'Published your first review',        '✍️'),
  ('ten_ratings',  'Calibrated',        'Rated 10 things in half-stars',      '⭐'),
  ('completionist','100% Club',         'Took something all the way',         '💯'),
  ('diarist',      'Dear Diary',        'Logged 7 diary entries',             '📔'),
  ('club_founder', 'Founder',           'Founded a club',                     '📌'),
  ('roommate',     'Cohabiting',        'Member of a living room',            '🛋️'),
  ('gifter',       'No Skips',          'Sent a recommendation bag',          '🛍️')
on conflict (slug) do nothing;

-- users may record their own earned badges (client-evaluated v1)
create policy user_badges_self on user_badges for insert
  with check (auth.uid() = user_id);

-- completionists may contribute variant covers
create policy variants_contribute on media_variants for insert
  with check (auth.uid() = contributed_by);

-- users may archive their own receipts
create policy receipts_self_insert on receipts for insert
  with check (auth.uid() = user_id);
