// Réglages du projet Supabase.
//
// Ces deux valeurs sont PUBLIQUES par construction : la clé publiable est faite
// pour vivre dans le navigateur, et ce sont les règles RLS de `supabase/schema.sql`
// qui décident qui peut lire et écrire. Elles peuvent donc rester dans le dépôt.
//
// À ne JAMAIS mettre ici : la clé `sb_secret_…` (anciennement « service_role »)
// et le mot de passe Postgres. Elles contournent les règles RLS.
//
// Où les trouver : dashboard Supabase → Settings → API.

window.BD_CONFIG = {
  // L'adresse du projet, ex. « https://abcdefghijklm.supabase.co »
  url: 'https://ijlbpvhnpqsrezhyivxi.supabase.co',

  // La clé publiable : « sb_publishable_… », ou l'ancienne clé « anon » en « eyJ… »
  key: 'sb_publishable_gNLv4o9gIGsUnnnsKpPUIQ_gKevrgGf',
};
