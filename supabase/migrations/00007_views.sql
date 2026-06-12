-- CURIO — migration 00007: per-shelf display mode (spines / covers / list)
alter table shelves add column if not exists view_mode text not null default 'spines';
