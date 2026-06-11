# Curio

Your shelves, everywhere. A social platform for films, TV, games, books and music —
ratings, reviews, shelves, rooms, clubs, and (in 2.0) a local-media launcher.

**Stack:** React 18 + TypeScript + Vite · Supabase (Postgres, Auth, Edge Functions, Storage) · GitHub Pages via Actions.

**Design reference:** `curio-mockup-v5.html` (kept outside this repo) is the source of truth for look, feel and interactions. Port views from it one component at a time.

---

## Setup — entirely from the browser (no terminal needed)

### 1. Create the Supabase project
1. supabase.com → New project → region **West EU (London)** (the one that works on your corporate network).
2. **SQL Editor → New query** → paste the entire contents of
   `supabase/migrations/00001_initial_schema.sql` → **Run**.
   This creates every table, trigger and RLS policy (profiles, shelves, ratings with
   half-star histograms, reviews/drafts/spoilers, diary, lists, rooms, loans, bags,
   wraps, guestbook, clubs, moderation, connections, imports, badges, autographs,
   canvas, receipts, notifications).
3. **Authentication → Providers**: enable Email, Google, Discord, Apple.
   (Steam is OpenID 2.0, not OAuth — it becomes a profile *connection* later, not a login.)
4. **Settings → API**: copy the **Project URL** and **anon public** key.

### 2. Create this repo on GitHub
1. New repository (e.g. `curio`) → upload these files (drag-and-drop onto the repo
   page, or open the repo in **github.dev** and paste files there).
2. **Settings → Pages** → Source: **GitHub Actions**.
3. **Settings → Secrets and variables → Actions** → add:
   - `VITE_SUPABASE_URL` — the Project URL
   - `VITE_SUPABASE_ANON_KEY` — the anon key
   - `SUPABASE_ACCESS_TOKEN` — supabase.com → Account → Access Tokens
   - `SUPABASE_PROJECT_REF` — Dashboard → Settings → General → Reference ID
4. If your repo isn't named `curio`, edit `base` in `vite.config.ts` to `"/<repo-name>/"`.

### 3. Edge function secrets (metadata API keys)
Supabase Dashboard → **Edge Functions → Secrets** → add:
- `TMDB_API_KEY` — free at themoviedb.org → Settings → API
- `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` — dev.twitch.tv → Applications
- `SB_URL` / `SB_SERVICE_ROLE` — Settings → API (service_role key; needed only for `?save=1` caching)

Open Library and MusicBrainz need no keys.

### 4. Ship it
Push to `main` (or use *Actions → run workflow*):
- **Deploy to GitHub Pages** builds the app and publishes it.
- **Supabase** deploys the `metadata` edge function whenever `supabase/` changes.

Your site appears at `https://<user>.github.io/<repo>/`.

---

## Where things live

```
.github/workflows/   deploy.yml (Pages) · supabase.yml (edge functions)
supabase/
  migrations/        00001_initial_schema.sql — the entire database
  functions/metadata Search proxy: TMDB · IGDB · Open Library · MusicBrainz
src/
  lib/supabase.ts    client + searchMetadata() helper
  pages/             one stub per view — port each from the v5 mockup
docs/ROADMAP.md      every feature, phased, mapped to its tables
```

## Conventions
- All writes go through RLS — never ship the service-role key to the client.
- `media_items` is only written by the edge function (`?save=1`).
- Customisation tokens (theme, accent, avatar shape, canvas surface, module layout)
  live in `profiles.theme` as JSON — one column, infinitely extensible.
- Smart-shelf rules live in `shelves.smart_rules` and are evaluated client-side.
