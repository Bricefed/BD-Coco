-- BD-Coco — la collection n'est visible que par des comptes nommés
-- À exécuter après schema.sql et seed.sql, avant de rendre le dépôt public.
--
-- CE QUE CE FICHIER CHANGE. `schema.sql` laisse la collection en lecture
-- libre et réserve l'écriture au rôle `authenticated`, c'est-à-dire à
-- « toute personne connectée ». Ici, lecture ET écriture passent par la
-- table `public.editeurs` : qui n'y figure pas ne voit rien.
--
-- Trois verrous, parce qu'un seul se rouvre par mégarde :
--   1. Ce fichier. Même un compte créé par surprise ne verra pas la collection.
--   2. `inscriptions.sql`, qui interdit la création de compte elle-même.
--   3. Authentication → Sign In / Providers → Email → décocher
--      « Allow new users to sign up ».
--
-- ATTENTION : réexécuter `schema.sql` après coup rouvrirait la lecture.
-- Si vous le refaites, repassez ce fichier derrière.

-- ------------------------------------------------- la liste des personnes

create table if not exists public.editeurs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ajoute_le  timestamptz not null default now()
);

alter table public.editeurs enable row level security;
grant select on public.editeurs to authenticated;

drop policy if exists editeurs_lecture on public.editeurs;
-- Chacune ne voit que sa propre ligne : c'est ce qui permet au site de dire
-- « ce compte n'a pas accès » plutôt que d'afficher une collection vide.
create policy editeurs_lecture on public.editeurs
  for select to authenticated using (user_id = auth.uid());

-- --------------------------------------------- plus rien pour les visiteurs

revoke select on public.series, public.albums from anon;

-- ------------------------------------ lecture et écriture via la liste

drop policy if exists series_lecture  on public.series;
drop policy if exists albums_lecture  on public.albums;
drop policy if exists series_ecriture on public.series;
drop policy if exists albums_ecriture on public.albums;

create policy series_acces on public.series for all to authenticated
  using      (exists (select 1 from public.editeurs e where e.user_id = auth.uid()))
  with check (exists (select 1 from public.editeurs e where e.user_id = auth.uid()));

create policy albums_acces on public.albums for all to authenticated
  using      (exists (select 1 from public.editeurs e where e.user_id = auth.uid()))
  with check (exists (select 1 from public.editeurs e where e.user_id = auth.uid()));

-- ------------------------------------------------- inscrire les personnes
-- Le compte doit exister : Authentication → Users → Add user, avec
-- « Auto Confirm User » coché. Relancer cette requête pour chaque ajout.

insert into public.editeurs (user_id)
select id from auth.users where email = 'fedou.corinne@bbox.fr'
on conflict (user_id) do nothing;

-- Vérification : doit renvoyer une ligne par personne autorisée.
--   select u.email, e.ajoute_le
--     from public.editeurs e join auth.users u on u.id = e.user_id;
