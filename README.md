# BD-Coco

La collection de BD : 61 séries, 1 085 albums, 574 déjà là. Un site statique qui
parle à Supabase depuis le navigateur — pas de serveur à administrer.

**La collection est privée.** Le site s'ouvre sur un écran de connexion : sans
compte autorisé, on ne voit rien. Le dépôt, lui, peut être public — il ne
contient que du code et des adresses publiques par construction, ce sont les
règles RLS qui gardent les données.

## Le dépôt

| | |
|---|---|
| `index.html` | La page. C'est tout le site. |
| `assets/app.js` | Toute la logique : affichage, recherche, cases à cocher, connexion. |
| `assets/styles.css` | Les styles. |
| `assets/config.js` | **À remplir** : l'adresse du projet Supabase et la clé publique. |
| `covers/` | 50 couvertures de séries. |
| `supabase/schema.sql` | Les deux tables, les privilèges Data API et les règles RLS. |
| `supabase/seed.sql` | Les 61 séries et les 1 085 albums, dont 574 marqués possédés. |
| `supabase/acces.sql` | Le verrou d'accès : seuls les comptes nommés voient la collection. |
| `supabase/inscriptions.sql` | Interdit la création de compte hors adresses nommées. |
| `.github/workflows/deploy.yml` | Publie le site à chaque poussée sur `main`. |
| `artifact/` | La version Claude d'origine, gardée comme référence de maquette. |

Onze séries n'ont pas de couverture (trop confidentielles pour la base
Open Library d'où viennent les autres) : `cover_path` vaut `null` et le site
leur dessine une vignette à partir de leur nom.

## Mise en service

### 1. La base

Dans le SQL Editor du projet Supabase, exécuter dans l'ordre :

1. `supabase/schema.sql`
2. `supabase/seed.sql`

Vérification :

```sql
select count(*) from public.albums;              -- 1085
select count(*) from public.albums where owned;  --  574
select count(*) from public.series;              --   61
```

Le projet a été créé avec « Automatically expose new tables » décoché : c'est
voulu, `schema.sql` pose lui-même les `GRANT` dont l'API REST a besoin.

### 2. Le compte, et le verrou d'écriture

**Authentication → Users → Add user** : son adresse e-mail, et cocher
« Auto Confirm User ».

Ensuite — et c'est le point à ne pas sauter avant de rendre le dépôt public :

1. Exécuter `supabase/acces.sql` après y avoir mis la bonne adresse e-mail.
   Seuls les comptes inscrits dans `public.editeurs` voient la collection.
2. Exécuter `supabase/inscriptions.sql`. Plus personne ne peut créer de
   compte, sauf avec une adresse inscrite dans `public.adresses_autorisees`.
3. **Authentication → Sign In / Providers → Email** : décocher **Allow new
   users to sign up**.

Pourquoi trois verrous. `schema.sql` laisse la collection en lecture libre et
réserve l'écriture à *toute personne connectée* ; la clé publiable, qui sera
dans le dépôt public, suffit à appeler `/auth/v1/signup` et à le devenir. Le
`shouldCreateUser: false` du site ne protège que son propre formulaire, et le
réglage du dashboard se rouvre d'un clic sans laisser de trace. Les deux
fichiers SQL, eux, tiennent tout seuls.

### Ajouter quelqu'un plus tard

Dans l'ordre, sinon la création de compte sera refusée :

```sql
insert into public.adresses_autorisees (email) values ('nouvelle@adresse.fr');
```

puis Authentication → Users → Add user avec cette adresse, puis :

```sql
insert into public.editeurs (user_id)
select id from auth.users where email = 'nouvelle@adresse.fr'
on conflict (user_id) do nothing;
```

### Vérifier le verrouillage

Avec la clé publiable, depuis n'importe où :

```bash
P=https://<projet>.supabase.co ; K=sb_publishable_…
curl -s -o /dev/null -w "collection : %{http_code}\n" \
  "$P/rest/v1/series?select=id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"
# doit afficher 401

curl -s -X POST "$P/auth/v1/signup" -H "apikey: $K" \
  -H "Content-Type: application/json" \
  -d '{"email":"intrus@gmail.com","password":"MotDePasseAuHasard123!"}'
# doit refuser, pas créer de compte
```

### 3. Les adresses de retour

**Authentication → URL Configuration** :

- Site URL : `https://bricefed.github.io/BD-Coco/`
- Redirect URLs : ajouter la même adresse, plus `http://localhost:8788/` pour
  travailler en local.

Sans cela, le lien de connexion reçu par e-mail ne ramène nulle part.

### 4. La configuration du site

**Settings → API**, puis recopier les deux valeurs dans `assets/config.js` :

```js
window.BD_CONFIG = {
  url: 'https://xxxxxxxx.supabase.co',
  key: 'sb_publishable_…',
};
```

`key` est la **clé publiable** (`sb_publishable_…`, qui remplace l'ancienne clé
`anon` en `eyJ…` ; les deux formats sont acceptés). Avec l'adresse du projet,
ce sont des valeurs publiques par construction : elles peuvent rester dans le
dépôt, ce sont les règles RLS qui protègent les données.

La clé **`sb_secret_…`** (anciennement `service_role`) et le mot de passe
Postgres contournent ces règles : ils ne doivent jamais figurer dans le dépôt.

### 5. La mise en ligne

Le dépôt doit être **public** pour que GitHub Pages fonctionne sans formule
payante. Ensuite, **Settings → Pages → Source : GitHub Actions**, et pousser
sur `main` :

```bash
git add .
git commit -m "Le site"
git push -u origin main
```

Le site paraît sur `https://bricefed.github.io/BD-Coco/`.

## Travailler en local

```bash
python3 -m http.server 8788
```

- `http://localhost:8788/` — le vrai site, qui parle au vrai Supabase.
- `http://localhost:8788/_dev/` — un banc d'essai avec une fausse base en
  mémoire, pour voir l'interface sans toucher aux données. Ajouter
  `?connecte` pour démarrer déjà connectée. Ce dossier n'est ni commité ni
  déployé.

## Modifier la collection

Rien n'est figé : les 61 séries du fichier d'origine se modifient comme les
autres.

Sur la page d'une série, le bouton **Modifier** bascule la liste : les cases à
cocher laissent place à un crayon et une corbeille sur chaque ligne, et un
panneau apparaît en haut pour renommer ou supprimer la série entière. **Terminé**
rend la liste à son usage normal.

- **Renommer une série** — le champ en haut du panneau.
- **Supprimer une série** — en deux temps, et ses albums partent avec elle.
- **Modifier un album** — le crayon ouvre le numéro et le titre. Changer le
  numéro déplace vraiment l'album dans la liste.
- **Supprimer un album** — la corbeille, confirmée en deux temps.
- **Ajouter un album** — le bouton en bas de la série, hors mode modification.

Les albums sont rangés par sous-collection puis par numéro. Un album ajouté
rejoint la série principale, pas la dernière sous-collection.

## Ce que le site ne fait pas

L'application Claude d'origine savait proposer la liste des albums d'une série
qu'on lui nommait. Ça reposait sur Claude, qui n'existe pas ici : **l'ajout
d'une série est entièrement manuel**, album par album ou en collant une liste
(un titre par ligne, un numéro en tête de ligne est repris tel quel).

## Si quelque chose cloche

| Ce qu'on voit | Ce que c'est |
|---|---|
| « Configuration à compléter » | `assets/config.js` est encore vide. |
| « La base est vide » | `schema.sql` et `seed.sql` n'ont pas été exécutés. |
| « La base ne répond pas » | Les valeurs de `config.js` ne correspondent pas au projet. |
| « Ce compte n'a pas accès » | Le compte existe mais n'est pas dans `public.editeurs` : repassez la dernière requête d'`acces.sql` avec la bonne adresse. |
| « Cette adresse n'a pas accès » à l'envoi du lien | Aucun compte n'existe pour cette adresse. Créez-le dans Authentication → Users. |
| Le lien de connexion ne revient pas | L'adresse du site n'est pas dans Redirect URLs (étape 3). |
| « Enregistrement impossible » une fois entrée | Les policies d'`acces.sql` ou les `GRANT` de `schema.sql` manquent. |
