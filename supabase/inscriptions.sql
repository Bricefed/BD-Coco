-- BD-Coco — interdire la création de compte, sauf pour des adresses nommées
-- À exécuter après acces.sql.
--
-- POURQUOI. Le réglage « Allow new users to sign up » du dashboard est le
-- bouton officiel, mais c'est un réglage : il se rouvre d'un clic, et rien
-- dans le dépôt ne garde trace de son état. Ce fichier pose la même règle
-- dans la base, où elle ne dépend plus de personne.
--
-- CE QUE ÇA CHANGE. Toute création de compte est refusée si l'adresse ne
-- figure pas dans `public.adresses_autorisees` — y compris depuis le
-- dashboard Supabase. Pour ajouter quelqu'un : inscrire son adresse ici
-- d'abord, créer le compte ensuite, puis l'ajouter à `public.editeurs`
-- (voir acces.sql).
--
-- Les comptes qui existent déjà ne sont pas touchés : ce verrou ne porte
-- que sur les créations.

-- ------------------------------------------- les adresses qui ont le droit

create table if not exists public.adresses_autorisees (
  email       text primary key,
  ajoutee_le  timestamptz not null default now()
);

-- Cette table ne doit jamais être lisible par l'API : elle ne sert qu'au
-- déclencheur ci-dessous. Pas de policy, pas de privilège.
alter table public.adresses_autorisees enable row level security;
revoke all on public.adresses_autorisees from anon, authenticated;

insert into public.adresses_autorisees (email)
values ('fedou.corinne@bbox.fr')
on conflict (email) do nothing;

-- ------------------------------------------------------ le verrou lui-même
-- `security definer` : le déclencheur s'exécute sous le rôle de GoTrue, qui
-- n'a aucun droit sur le schéma public. La fonction emprunte donc celui de
-- son propriétaire pour lire la liste.

create or replace function public.verifier_adresse_autorisee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or not exists (
    select 1 from public.adresses_autorisees a
     where lower(a.email) = lower(new.email)
  ) then
    raise exception 'Inscription refusee : adresse non autorisee'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists verifier_adresse_autorisee_trg on auth.users;
create trigger verifier_adresse_autorisee_trg
  before insert on auth.users
  for each row execute function public.verifier_adresse_autorisee();

-- ------------------------------------------------------------ pour défaire
-- Si ce verrou gêne un jour — une création de compte légitime qui échoue, un
-- doute sur son comportement — il se retire en une ligne :
--   drop trigger verifier_adresse_autorisee_trg on auth.users;
-- Les tables et la fonction peuvent rester : sans le déclencheur, elles ne
-- font plus rien.

-- ------------------------------------------------------------ vérification
-- Doit renvoyer une ligne : le déclencheur est posé.
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- Et la liste des adresses admises :
--   select email, ajoutee_le from public.adresses_autorisees order by email;
