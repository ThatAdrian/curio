# Curio — Roadmap

Every feature from the mockups and the "worth adding" list, mapped to its tables.
The schema for **all phases ships on day one** — building a phase is UI work, not migrations.

## Phase 0 — Foundation (this repo, day one)
- Repo + Pages deploy + Supabase project + schema + metadata edge function.
- Auth: email magic link, Google, Discord, Apple. *(Apple is contractually required on iOS once any social login exists.)*
- New-user bootstrap trigger: profile, five standard shelves, Watch Later + Wishlist system lists.

## Phase 1 — Social MVP
| Feature | Tables |
|---|---|
| Profiles + customisation tokens (theme/accent/avatar shape/frames) | `profiles.theme` |
| Shelves: per-type, custom, **smart shelves** (stored rules) | `shelves`, `shelf_items` |
| Per-shelf material, sort, show-on-profile | `shelves.material/sort_mode/show_on_profile` |
| Add-to-shelf with metadata autofill | edge fn `metadata` → `media_items` |
| Media pages: details, creators, official link | `media_items`, `media_stats` |
| **Half-star ratings + per-title distribution graph** | `ratings`, `media_stats.histogram` (trigger-maintained) |
| **Reviews: markdown, drafts, spoiler blur** | `reviews` (`status`, `contains_spoilers`) |
| Review likes + threaded comments | `review_likes`, `review_comments` |
| Follows, activity feed | `follows` + queries over reviews/ratings/diary |
| **Diary / calendar view** | `diary_entries` |
| Thickness metric (page counts, disc counts → spine width) | `media_items.metadata` |
| **Import wizards** (Letterboxd/Goodreads/Backloggd/Last.fm CSV) — day-one priority: kills the cold-start problem | `imports` + Storage bucket |
| Notifications bell | `notifications` |
| Blocking + reporting (minimum viable safety before anything social ships) | `blocks`, `reports` |

## Phase 2 — Social depth
| Feature | Tables |
|---|---|
| **Lists + collaborative lists**; Watch Later & Wishlist as system lists | `lists`, `list_collaborators`, `list_items` |
| Guestbook: one author per page, placed stamps/stickers, likes, owner ordering | `guestbook_*` |
| **Clubs**: chronological feeds, corkboard bulletins, **mod tooling** (roles, soft-removal) | `clubs`, `club_members.role`, `club_posts.removed_by`, `club_bulletins` |
| Recommendation bags (taped note, per-item outcomes) | `rec_bags`, `bag_items` |
| Blind-date wraps (3 tags, rip-to-reveal) | `blind_wraps` |
| **Exploration page**: mood doors, taste twins (rating-overlap match %), friends-trending, Dig the Crates | queries over `ratings`/`shelf_items`/`follows`; `media_items.metadata.moods` |
| **Monthly thermal receipts** (collapsible line items) | `receipts` + scheduled edge function over `diary_entries` |
| Connections (Steam, Last.fm, Trakt, AniList, MAL, Discord, RetroAchievements sync; others as display links) | `connections` |
| Badges + curation milestones (unlock shelf materials, frosted poly, etc.) | `badges`, `user_badges` |

## Phase 3 — Spaces & objects
| Feature | Tables |
|---|---|
| **Rooms**: solo or multi-member living rooms, room-as-menu, shared state (TV resume, turntable) | `rooms`, `room_members`, `rooms.state` |
| **Loans / borrowing tokens**: request → accept → due dates → I.O.U. on lender's shelf, pile on a room table | `loans` |
| **Watch-together / listen-along** sessions | `shared_sessions`, `session_participants` |
| **Annual receipt** (December virality sibling of monthly) | `receipts` (`kind='annual'`) |
| The Canvas (fridge/cork/whiteboard/blank; full alphabet, photos, notes, stickers, rotation) | `canvas_items`, surface in `profiles.theme` |
| Variant hunting (real alternate covers; unlocked at `completed_at`) | `media_variants`, `shelf_items.variant_id` |
| Verified-creator autographs (placement targets, legitimacy via `is_verified`) | `autographs`, `profiles.is_verified` |
| Dust / backlog nudges / wear & patina / price stickers | computed from `shelf_items.last_consumed_at`, `times_consumed`, `price_sticker` |
| Wishlist → trading layer | `lists(system_key='wishlist')` + `loans` |

## Phase 4 — Desktop 2.0 (Tauri)
- Wrap the same web app; build installers in GitHub Actions (`tauri-action`) — no local Rust needed.
- Local launcher: `shelf_items.file_link` {path, handler, secondary_paths}; per-extension handler table (melonDS, Citra, Dolphin, PPSSPP, Xenia, Ryujinx, PCSX2, DuckStation, RPCS3, mGBA, Snes9x, simple64, VLC/mpv, readers).
- Folder scanning on boot + manual rescan; app-created folders per type + user-assigned secondary folders; extension decides which metadata DB resolves a title (dune.epub → Open Library, dune.mkv → TMDB); **review-and-confirm list before anything is committed**.
- Playtime tracking → `diary_entries`; cartridge ritual easter egg (toggleable).

## Open design questions (decide before building the relevant phase)
1. Room limits: how many rooms per person; max members per room.
2. Receipt visibility: private by default, shareable as image?
3. Club creation: open to all at launch, or gated until mod tooling matures?
4. Variant covers: community-contributed (needs review queue) vs API-only.
