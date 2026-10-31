-- BD-Coco — regrouper les albums isolés, compléter Valentin
-- À exécuter après completer.sql et completer2.sql.

begin;

-- Valentin le vagabond : 1 → 7 albums
update public.series set name = 'Valentin le vagabond' where id = 'valentin';
delete from public.albums where series_id = 'valentin';
insert into public.albums (series_id, k, num, title, owned) values
  ('valentin', '0.1', 1, 'Les Mauvais instincts', false),
  ('valentin', '0.2', 2, 'Le Prisonnier récalcitrant', false),
  ('valentin', '0.3', 3, 'Valentin le vagabond et les hippies', false),
  ('valentin', '0.4', 4, 'Valentin le vagabond fait le singe', false),
  ('valentin', '0.5', 5, 'Valentin et les autres', false),
  ('valentin', '0.6', 6, 'L''Héritage diabolique', true),
  ('valentin', '0.7', 7, 'Aux fous', false);

-- Albums isolés : neuf one-shots rassemblés en une seule entrée
insert into public.series (id, name, cover_path, custom) values
  ('albums-isoles', 'Albums isolés', null, false)
on conflict (id) do nothing;
insert into public.albums (series_id, k, num, title, owned) values
  ('albums-isoles', '0.1', 1, 'Agrippine (Claire Bretécher)', true),
  ('albums-isoles', '0.2', 2, 'Calagan — Rallye raid', true),
  ('albums-isoles', '0.3', 3, 'Charly la Rouille', true),
  ('albums-isoles', '0.4', 4, 'Idées noires', true),
  ('albums-isoles', '0.5', 5, 'Il était une fois… Yannick Noah', true),
  ('albums-isoles', '0.6', 6, 'La Vérité sur le tennis', true),
  ('albums-isoles', '0.7', 7, 'Le Guide de la cinquantaine', true),
  ('albums-isoles', '0.8', 8, 'Les Accros de MSN', true),
  ('albums-isoles', '0.9', 9, 'Rocky Luke — Banlieue West', true);
delete from public.series where id in ('calagan', 'charly-la-rouille', 'claire-bretecher', 'idees-noires', 'il-etait-une-fois', 'la-verite-sur', 'le-guide-de', 'les-accros-de-msn', 'rocky-luke');

commit;
