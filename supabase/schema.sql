-- BD-Coco — schéma Postgres pour Supabase
-- À exécuter en premier, dans le SQL Editor du projet, puis seed.sql.
--
-- Hypothèse de départ : une seule collectionneuse. Tout le monde peut LIRE,
-- seules les personnes connectées peuvent COCHER. Si vous préférez que même
-- la lecture demande une connexion, voyez la note en bas du fichier.

-- ---------------------------------------------------------------- tables

create table if not exists public.series (
  id          text primary key,           -- ex. « asterix », « blake-et-mortimer »
  name        text not null,
  cover_path  text,                       -- ex. « covers/asterix.jpg », ou null
  custom      boolean not null default false,  -- série ajoutée depuis l'application
  created_at  timestamptz not null default now()
);

create table if not exists public.albums (
  id          bigint generated always as identity primary key,
  series_id   text not null references public.series(id) on delete cascade,
  k           text not null,              -- clé « bloc.numéro » : les sous-collections
                                          -- repartent à l'album n°1, le numéro seul
                                          -- ne suffit donc pas à identifier un album
  num         integer,
  title       text not null,
  section     text,                       -- « Hors série », « Saison 2 »…
  owned       boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (series_id, k)
);

create index if not exists albums_series_idx on public.albums (series_id);
create index if not exists albums_owned_idx  on public.albums (owned) where owned = false;

-- Garde la date de dernière modification à jour, pour pouvoir trier ou
-- détecter les changements plus tard.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists albums_touch on public.albums;
create trigger albums_touch before update on public.albums
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------- privilèges Data API
-- « Automatically expose new tables » est décoché sur ce projet : sans ces
-- GRANT, l'API REST renverrait une table vide ou une erreur de permission.

grant usage on schema public to anon, authenticated;

grant select                         on public.series, public.albums to anon, authenticated;
grant insert, update, delete         on public.series, public.albums to authenticated;
grant usage, select on all sequences in schema public                to authenticated;

-- ------------------------------------------------------------------- RLS
-- Les GRANT ouvrent la porte, les policies disent qui passe. Il faut les deux.

alter table public.series enable row level security;
alter table public.albums enable row level security;

drop policy if exists series_lecture   on public.series;
drop policy if exists series_ecriture  on public.series;
drop policy if exists albums_lecture   on public.albums;
drop policy if exists albums_ecriture  on public.albums;

create policy series_lecture  on public.series for select using (true);
create policy albums_lecture  on public.albums for select using (true);

create policy series_ecriture on public.series for all
  to authenticated using (true) with check (true);
create policy albums_ecriture on public.albums for all
  to authenticated using (true) with check (true);

-- Variante « tout est privé » : remplacez les deux policies de lecture par
--   create policy series_lecture on public.series for select to authenticated using (true);
--   create policy albums_lecture on public.albums for select to authenticated using (true);
-- et retirez `anon` du GRANT SELECT plus haut. Le site demandera alors une
-- connexion avant d'afficher quoi que ce soit.
