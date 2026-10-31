'use strict';

/* BD-Coco — la collection de BD, adossée à Supabase.
 *
 * Trois choses à savoir sur la forme des données :
 *  - un album appartient à une série et porte une clé `k` de la forme
 *    « bloc.numéro » : les sous-collections (« Hors série », « Saison 2 »)
 *    repartent à l'album n°1, le numéro seul ne suffit donc pas à l'identifier ;
 *  - l'ordre d'affichage est l'ordre d'insertion (`albums.id` croissant), qui
 *    reprend celui du fichier d'origine, sections comprises ;
 *  - tout le monde peut lire, seules les personnes connectées peuvent cocher.
 *    La page reste donc consultable sans compte.
 */

/* ========================= état ========================= */
let sb = null;                 // client Supabase
let session = null;            // session d'authentification, ou null
let autorise = null;           // le compte figure-t-il dans public.editeurs ?
let series = [];               // [{id, name, cover_path, custom, albums:[…]}]
const byId = new Map();

let view = { name: 'shelf', id: null };
let filter = 'all', query = '', adding = null, authStep = null;
let editMode = false, editingAlbum = null;   // modification d'une série et de ses albums
let pendingWrites = 0, lastError = null, loadError = null;

// Le cache est propre à un projet : deux bases différentes ne doivent jamais
// se relire l'une l'autre. Affiné dans boot() une fois la configuration lue.
let LS = 'bdcoco.v1';
const CONFIG = window.BD_CONFIG || {};

/* ========================= utilitaires ========================= */
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byName = (a, b) => norm(a.name).localeCompare(norm(b.name), 'fr');
const slug = n => norm(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 58) || 'serie';
const $ = id => document.getElementById(id);

const total = s => s.albums.length;
const count = s => s.albums.filter(a => a.owned).length;
const missingOf = s => s.albums.filter(a => !a.owned);
const canWrite = () => !!session && autorise !== false;
// La collection n'est servie qu'aux comptes de la liste : tant que l'un et
// l'autre ne sont pas acquis, la page ne montre que l'écran de connexion.
const ouvert = () => !!session && autorise !== false;

/* La table `editeurs` ne laisse voir à chacun que sa propre ligne : son
   absence répond donc « ce compte n'a pas accès ». Si la table n'existe pas
   encore (acces.sql pas joué), on laisse la base trancher seule. */
async function verifierAcces() {
  if (!session) { autorise = false; return; }
  const { data, error } = await sb.from('editeurs')
    .select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (error) {
    const absente = error.code === 'PGRST205'
      || /schema cache|does not exist/i.test(String(error.message || ''));
    autorise = absente ? true : null;
    return;
  }
  autorise = !!data;
}

/* ========================= cache local =========================
   Permet d'afficher la collection tout de suite, et de la consulter même
   sans réseau. Ce n'est jamais la source de vérité : la base l'est. */
function saveLocal() {
  try { localStorage.setItem(LS, JSON.stringify({ at: Date.now(), series })); } catch (e) {}
}
function readLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || 'null');
    return d && Array.isArray(d.series) ? d.series : null;
  } catch (e) { return null; }
}
const bloc = a => parseInt(String(a.k).split('.')[0], 10) || 0;

function indexSeries() {
  byId.clear();
  series.sort(byName);
  for (const s of series) {
    // Les sous-collections d'abord (bloc), puis le numéro de tome. L'identifiant
    // ne sert qu'à départager : renuméroter un album le déplace vraiment.
    s.albums.sort((a, b) => bloc(a) - bloc(b) || (a.num || 0) - (b.num || 0) || (a.id || 0) - (b.id || 0));
    byId.set(s.id, s);
  }
}

/* ========================= lecture ========================= */
async function loadAll() {
  const { data: ss, error: e1 } = await sb.from('series').select('id,name,cover_path,custom');
  if (e1) throw e1;

  // PostgREST plafonne le nombre de lignes par requête : on pagine.
  const albums = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('albums')
      .select('id,series_id,k,num,title,section,owned')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    albums.push(...data);
    if (data.length < 1000) break;
  }

  const parAserie = new Map(ss.map(s => [s.id, { ...s, albums: [] }]));
  for (const a of albums) parAserie.get(a.series_id)?.albums.push(a);
  series = [...parAserie.values()];
  indexSeries();
  saveLocal();
}

/* ========================= écriture ========================= */
async function write(fn) {
  pendingWrites++; setSync();
  try {
    const { error } = await fn();
    if (error) throw error;
    lastError = null;
  } catch (e) {
    lastError = e;
  } finally {
    pendingWrites--; saveLocal(); setSync();
  }
  return !lastError;
}

async function createSerie(name, albums) {
  let id = slug(name), n = 2;
  while (byId.has(id)) id = slug(name) + '-' + n++;
  const rec = { id, name, custom: true, cover_path: null };

  const ok = await write(async () => {
    const r1 = await sb.from('series').insert(rec);
    if (r1.error) return r1;
    return sb.from('albums').insert(albums.map((a, i) => ({
      series_id: id, k: `0.${a.n || i + 1}`, num: a.n || i + 1, title: a.t, owned: false,
    })));
  });
  if (!ok) return null;
  await loadAll();
  return id;
}

async function deleteSerie(id) {
  const ok = await write(() => sb.from('series').delete().eq('id', id));
  if (ok) { series = series.filter(s => s.id !== id); indexSeries(); }
  return ok;
}

async function addAlbum(serieId, num, title) {
  const s = byId.get(serieId);
  // Un album ajouté rejoint la série principale (bloc 0), pas la dernière
  // sous-collection : on complète presque toujours la série elle-même.
  let k = `0.${num}`, i = 1;
  while (s.albums.some(a => a.k === k)) k = `0.${num}-${i++}`;

  const ok = await write(async () => {
    const r = await sb.from('albums')
      .insert({ series_id: serieId, k, num, title, owned: true })
      .select().single();
    if (!r.error && r.data) { s.albums.push(r.data); indexSeries(); }
    return r;
  });
  return ok;
}

async function updateAlbum(album, num, title) {
  const avant = { num: album.num, title: album.title };
  album.num = num; album.title = title;
  indexSeries();
  const ok = await write(() => sb.from('albums').update({ num, title }).eq('id', album.id));
  if (!ok) { Object.assign(album, avant); indexSeries(); }
  return ok;
}

async function deleteAlbum(album) {
  const s = byId.get(album.series_id);
  const ok = await write(() => sb.from('albums').delete().eq('id', album.id));
  if (ok) { s.albums = s.albums.filter(a => a.id !== album.id); indexSeries(); }
  return ok;
}

async function renameSerie(s, name) {
  const avant = s.name;
  s.name = name; indexSeries();
  const ok = await write(() => sb.from('series').update({ name }).eq('id', s.id));
  if (!ok) { s.name = avant; indexSeries(); }
  return ok;
}

/* ========================= bandeau d'état ========================= */
function setSync() {
  const el = $('sync'), t = $('sync-t'), btn = $('auth-btn');
  let etat = 'ok', texte = 'Tout est enregistré';

  // Un échec de lecture passe avant tout le reste : sinon la page affiche une
  // liste périmée en annonçant tranquillement que tout va bien.
  if (!sb) { etat = 'local'; texte = 'Configuration incomplète'; }
  else if (loadError) { etat = 'local'; texte = 'Hors connexion — liste du dernier passage'; }
  else if (pendingWrites > 0) { etat = 'saving'; texte = 'Enregistrement…'; }
  else if (lastError) { etat = 'local'; texte = 'Enregistrement impossible — réessayez'; }
  else if (!canWrite()) { etat = 'signin'; texte = 'Connectez-vous pour cocher'; }

  el.dataset.s = etat;
  t.textContent = texte;
  btn.hidden = !sb;
  btn.textContent = canWrite() ? 'Déconnexion' : 'Se connecter';
}

/* ========================= visuels ========================= */
const TINTS = ['#1F4E79', '#8A4B2A', '#2C6A4E', '#6B3A6E', '#9C6B13', '#2B5E6B', '#7A2E3C', '#3F5330'];
const tint = id => TINTS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];
const initial = n => (norm(n).replace(/^(le|la|les|l|un|une|des) /, '')[0] || '?').toUpperCase();

function art(s) {
  if (s.cover_path) return `<img src="${esc(s.cover_path)}" alt="" loading="lazy" decoding="async">`;
  return `<span class="ph" style="background:${tint(s.id)}">
      <i aria-hidden="true">${esc(initial(s.name))}</i><span>${esc(s.name)}</span></span>`;
}

const CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5L20 7"/></svg>`;

/* ========================= rendu ========================= */
function albumRow(a, o = {}) {
  const sub = o.series ? `<span class="srs">${esc(byId.get(a.series_id).name)}</span>` : '';
  const right = o.verdict
    ? `<span class="verdict">${a.owned ? 'Vous l’avez' : 'Pas encore'}</span>`
    : `<span class="tick" aria-hidden="true">${CHECK}</span>`;
  return `<li><button class="al" role="switch" aria-pressed="${!!a.owned}" data-id="${a.id}">
      <span class="num tnum">${a.num || '•'}</span>
      <span class="ttl">${esc(a.title)}${sub}</span>${right}</button></li>`;
}

const PENCIL = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/></svg>`;
const TRASH = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg>`;

/* En mode modification, la ligne n'est plus une case à cocher : elle porte
   le crayon et la corbeille, ou le formulaire quand on l'édite. */
function editRow(a) {
  if (editingAlbum === a.id) {
    return `<li><div class="al-form">
      <div class="field">
        <input type="text" class="num" id="ed-n" inputmode="numeric" value="${a.num || ''}" aria-label="Numéro">
        <input type="text" id="ed-t" value="${esc(a.title)}" aria-label="Titre de l’album">
      </div>
      <div class="btns">
        <button class="btn" data-edit-cancel>Annuler</button>
        <button class="btn pri" data-edit-save="${a.id}">Enregistrer</button>
      </div></div></li>`;
  }
  return `<li><div class="al edit">
    <span class="num tnum">${a.num || '•'}</span>
    <span class="ttl">${esc(a.title)}</span>
    <button class="icon" data-edit-album="${a.id}" aria-label="Modifier ${esc(a.title)}">${PENCIL}</button>
    <button class="icon danger" data-del-album="${a.id}" aria-label="Supprimer ${esc(a.title)}">${TRASH}</button>
  </div></li>`;
}

function tile(s) {
  const c = count(s), t = total(s), done = c >= t && t > 0;
  return `<li><button class="tile" data-go="${esc(s.id)}">
    <span class="art">${art(s)}
      <span class="veil" aria-hidden="true"></span>
      ${s.custom ? '<span class="mine">ajoutée</span>' : ''}
      ${done ? `<span class="flag" aria-hidden="true">${CHECK}</span>` : ''}
      <span class="on-art">
        <span class="bar" aria-hidden="true"><i style="width:${t ? (c / t * 100).toFixed(1) : 0}%"></i></span>
        <span class="cnt">${done ? 'Complète' : `${c} / ${t}`}</span>
      </span></span>
    <span class="name">${esc(s.name)}</span></button></li>`;
}

function renderShelf() {
  const list = series.filter(s => filter === 'all'
    || (filter === 'todo' ? count(s) < total(s) : count(s) >= total(s)));
  const todo = series.filter(s => count(s) < total(s)).length;
  $('v-shelf').innerHTML = `
    <div class="chips" role="group" aria-label="Filtrer">
      ${[['all', 'Toutes', series.length], ['todo', 'À compléter', todo], ['done', 'Complètes', series.length - todo]]
      .map(([k, l, n]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${l}<span class="n tnum">${n}</span></button>`).join('')}
    </div>
    <ul class="shelf">
      <li><button class="tile add" data-add-serie>
        <span class="art"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        <span>Ajouter une série</span></span></button></li>
      ${list.map(tile).join('')}
    </ul>`;
}

function renderDetail() {
  const s = byId.get(view.id);
  if (!s) { view = { name: 'shelf', id: null }; return renderShelf(); }
  const c = count(s), t = total(s);

  const blocks = [];
  for (const a of s.albums) {
    const bi = String(a.k).split('.')[0];
    if (!blocks.length || blocks[blocks.length - 1].bi !== bi)
      blocks.push({ bi, label: a.section || null, rows: [] });
    blocks[blocks.length - 1].rows.push(editMode ? editRow(a) : albumRow(a));
  }

  const suivant = s.albums.length ? Math.max(...s.albums.map(a => a.num || 0)) + 1 : 1;

  $('v-detail').innerHTML = `
    <div class="detail-bar">
      <button class="back" data-back>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg>
        Ma collection</button>
      ${editMode
      ? '<button class="btn small pri" data-edit-off>Terminé</button>'
      : '<button class="btn small" data-edit-on>Modifier</button>'}
    </div>
    <div class="hero">
      <span class="art">${art(s)}</span>
      <span class="meta">
        <h2>${esc(s.name)}</h2>
        <p class="sub"><b id="d-c">${c}</b> sur ${t}${c >= t ? ' — complète' : `, il en manque ${t - c}`}</p>
        <span class="pbar${c >= t ? ' full' : ''}" id="d-bar"><i style="width:${t ? (c / t * 100).toFixed(1) : 0}%"></i></span>
      </span>
    </div>

    ${editMode ? `<div class="panel" style="margin-top:16px">
      <p class="eyebrow">La série</p>
      <div class="field">
        <input type="text" id="se-name" value="${esc(s.name)}" aria-label="Nom de la série">
      </div>
      <div class="btns"><button class="btn pri" data-rename>Renommer</button></div>
      <p class="note">Supprimer la série efface aussi ses ${t} album${t > 1 ? 's' : ''}
         et ce qui était coché. C'est définitif.</p>
      <div class="btns"><button class="btn danger" data-del-serie>Supprimer la série</button></div>
    </div>` : ''}

    ${blocks.map(b => (b.label ? `<p class="section-label">${esc(b.label)}</p>` : '<div style="height:14px"></div>')
      + `<ul class="albums">${b.rows.join('')}</ul>`).join('')}

    <div class="btns" style="margin-top:18px">
      <button class="btn wide" data-add-album>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Ajouter un album</button>
    </div>
    <div class="panel" id="add-album" hidden style="margin-top:14px">
      <p class="eyebrow">Nouvel album — ${esc(s.name)}</p>
      <div class="field">
        <input type="text" class="num" id="aa-n" inputmode="numeric" value="${suivant}" aria-label="Numéro">
        <input type="text" id="aa-t" placeholder="Titre de l’album" aria-label="Titre de l’album">
      </div>
      <div class="btns"><button class="btn" data-cancel>Annuler</button>
        <button class="btn pri" data-save-album disabled>Ajouter</button></div>
    </div>`;
}

function renderMissing() {
  const groups = series.map(s => ({ s, m: missingOf(s) })).filter(g => g.m.length)
    .sort((a, b) => a.m.length - b.m.length || byName(a.s, b.s));
  const n = groups.reduce((k, g) => k + g.m.length, 0);
  $('v-missing').innerHTML = !n
    ? `<p class="empty"><strong>Rien ne manque</strong>Toutes les séries de la liste sont complètes.</p>`
    : `<p class="eyebrow">Votre liste de courses</p>
       <p class="hint"><b class="tnum">${n}</b> albums ne sont pas encore chez vous. Les séries qui
          demandent le moins d’achats sont en premier. Touchez un album dès que vous l’avez.</p>
       ${groups.map(g => `<div data-grp="${esc(g.s.id)}">
         <div class="group-head"><span class="thumb">${art(g.s)}</span>
           <span class="gt">${esc(g.s.name)}</span>
           <span class="gn"><b data-gn>${g.m.length}</b> à trouver</span></div>
         <ul class="albums fade">${g.m.map(a => albumRow(a)).join('')}</ul>
       </div>`).join('')}`;
}

function renderStats() {
  const t = series.reduce((k, s) => k + total(s), 0), c = series.reduce((k, s) => k + count(s), 0);
  const done = series.filter(s => count(s) >= total(s)).length;
  const near = series.map(s => ({ s, m: total(s) - count(s) })).filter(g => g.m > 0 && g.m <= 3)
    .sort((a, b) => a.m - b.m || byName(a.s, b.s));
  $('v-stats').innerHTML = `
    <span class="pbar" style="height:14px"><i style="width:${t ? (c / t * 100).toFixed(1) : 0}%"></i></span>
    <p class="hint" style="margin-top:9px">${t ? (c / t * 100).toFixed(0) : 0} % de la liste est chez vous.</p>
    <div class="stats">
      <div class="stat have"><div class="k tnum">${c}</div><div class="l">albums possédés</div></div>
      <div class="stat gold"><div class="k tnum">${t - c}</div><div class="l">albums à trouver</div></div>
      <div class="stat"><div class="k tnum">${series.length}</div><div class="l">séries suivies</div></div>
      <div class="stat have"><div class="k tnum">${done}</div><div class="l">séries complètes</div></div>
    </div>
    ${near.length ? `<p class="eyebrow">Bientôt complètes</p>
      <p class="hint">Trois albums ou moins vous séparent de la série entière.</p>
      <ul class="shelf">${near.map(g => tile(g.s)).join('')}</ul>` : ''}`;
}

function renderSearch() {
  const q = norm(query.trim());
  if (!q) return;
  const hits = [];
  for (const s of series) {
    const inName = norm(s.name).includes(q);
    for (const a of s.albums) if (inName || norm(a.title).includes(q)) hits.push(a);
    if (hits.length > 400) break;
  }
  const have = hits.filter(a => a.owned).length;
  $('v-search').innerHTML = hits.length
    ? `<p class="eyebrow">${hits.length} résultat${hits.length > 1 ? 's' : ''} — ${have} chez vous</p>
       <p class="hint">Touchez une ligne pour changer la réponse.</p>
       <ul class="albums">${hits.slice(0, 120).map(a => albumRow(a, { series: true, verdict: true })).join('')}</ul>`
    : `<p class="empty"><strong>Aucun album de ce nom</strong>
         Ce titre n’est pas dans la liste. Vérifiez l’orthographe, ou ajoutez la série
         depuis « Ma collection ».</p>`;
}

function renderAuth() {
  const a = authStep || { step: 'ask', email: '' };
  const gate = !ouvert();          // écran d'entrée, ou simple passage par là

  if (session && autorise === false) {
    $('v-auth').innerHTML = `<div class="panel">
      <h3>Ce compte n’a pas accès</h3>
      <p class="note">Vous êtes connectée avec <span class="mail">${esc(session.user.email || '')}</span>,
         mais cette adresse ne figure pas parmi celles autorisées pour cette collection.</p>
      <p class="note">Si c’est une erreur, il faut ajouter cette adresse à la liste côté
         Supabase. Sinon, reconnectez-vous avec la bonne adresse.</p>
      <div class="btns"><button class="btn pri" data-auth-signout>Changer de compte</button></div>
    </div>`;
    return;
  }

  $('v-auth').innerHTML = `<div class="panel">
      <h3>${gate ? 'Bienvenue' : 'Se connecter'}</h3>
      <p class="note">Cette collection est privée. Connectez-vous avec l’adresse et le
         mot de passe qui vous ont été donnés. Une fois entrée, vous le restez :
         il n’y a pas à recommencer à chaque visite.</p>
      <div class="field"><input type="email" id="auth-mail" inputmode="email"
        autocomplete="username" placeholder="votre adresse e-mail" aria-label="Adresse e-mail"
        value="${esc(a.email || '')}"></div>
      <div class="field"><input type="password" id="auth-pass"
        autocomplete="current-password" placeholder="votre mot de passe"
        aria-label="Mot de passe"></div>
      ${a.err ? `<p class="note warn">${esc(a.err)}</p>` : ''}
      <div class="btns">
        ${gate ? '' : '<button class="btn" data-auth-close>Annuler</button>'}
        <button class="btn pri wide" data-auth-send${a.busy ? ' disabled' : ''}>
          ${a.busy ? 'Connexion…' : 'Se connecter'}</button>
      </div>
    </div>`;
}

function renderAddPanel() {
  const host = $('v-shelf');
  let p = $('add-serie');
  if (!p) { p = document.createElement('div'); p.id = 'add-serie'; host.prepend(p); }
  const a = adding;
  const next = a.albums.length ? Math.max(...a.albums.map(x => x.n || 0)) + 1 : 1;
  p.innerHTML = `<div class="panel">
    <h3>Ajouter une série</h3>
    <div class="field"><input type="text" id="as-name" value="${esc(a.name || '')}"
      placeholder="Nom de la série" aria-label="Nom de la série"></div>
    ${a.albums.length ? `<ul class="prop">${a.albums.map((al, i) => `<li>
        <span class="pn tnum">${al.n}</span><span class="pt">${esc(al.t)}</span>
        <button class="rm" data-rm="${i}" aria-label="Retirer ${esc(al.t)}">×</button></li>`).join('')}</ul>
      <p class="note">${a.albums.length} album${a.albums.length > 1 ? 's' : ''}. Ils seront ajoutés
         comme « pas encore chez vous » : vous les cocherez ensuite.</p>`
    : '<p class="note">Ajoutez les albums un par un, ou collez-en une liste entière.</p>'}

    <p class="eyebrow" style="margin:4px 0 0">Ajouter un album</p>
    <div class="field">
      <input type="text" class="num" id="ae-n" inputmode="numeric" value="${next}" aria-label="Numéro">
      <input type="text" id="ae-t" placeholder="Titre de l’album" aria-label="Titre de l’album">
      <button class="btn ae-add" data-ae-add aria-label="Ajouter cet album">+</button>
    </div>

    <details${a.paste ? ' open' : ''}>
      <summary>Coller plusieurs titres d’un coup</summary>
      <p class="note" style="margin:8px 0">Un titre par ligne, dans l’ordre des tomes.
         Un numéro en début de ligne est repris tel quel.</p>
      <textarea id="ae-paste" placeholder="Ceux qui restent&#10;Bonny and Pierrot&#10;Celui qui part"
        aria-label="Liste de titres à coller"></textarea>
      <div class="btns" style="margin-top:9px">
        <button class="btn" data-ae-paste>Ajouter ces titres</button></div>
    </details>
    ${a.err ? `<p class="note warn">${esc(a.err)}</p>` : ''}
    <div class="btns"><button class="btn" data-add-cancel>Annuler</button>
      <button class="btn pri" data-add-save${a.albums.length && (a.name || '').trim() ? '' : ' disabled'}>
        Créer la série</button></div>
  </div>`;
}

function syncAddName() { const el = $('as-name'); if (el && adding) adding.name = el.value; }

function updateTallies() {
  const t = series.reduce((k, s) => k + total(s), 0), c = series.reduce((k, s) => k + count(s), 0);
  $('t-own').textContent = c;
  $('t-tot').textContent = t;
  $('tab-missing').textContent = t - c ? `(${t - c})` : '';
}

function render() {
  // Tant que la porte est fermée, la page n'est qu'un écran de connexion :
  // ni recherche, ni compteur, ni onglets.
  const gate = !ouvert();
  const searching = query.trim().length > 0;
  const name = (gate || authStep) ? 'auth' : (searching ? 'search' : view.name);
  $('v-boot').hidden = true;
  $('tabs').hidden = gate;
  $('search').hidden = gate;
  $('tally').hidden = gate;
  $('sync').hidden = gate;
  for (const v of ['auth', 'search', 'shelf', 'detail', 'missing', 'stats'])
    $('v-' + v).hidden = v !== name;
  ({ auth: renderAuth, search: renderSearch, shelf: renderShelf, detail: renderDetail,
    missing: renderMissing, stats: renderStats })[name]();
  if (adding && name === 'shelf') renderAddPanel();
  updateTallies();
  $('q-clear').hidden = !searching;
  for (const b of document.querySelectorAll('.tab'))
    b.setAttribute('aria-current',
      !searching && !authStep && b.dataset.tab === (view.name === 'detail' ? 'shelf' : view.name)
        ? 'page' : 'false');
}

function toTop() {
  try { window.scrollTo(0, 0); } catch (e) {}
  const se = document.scrollingElement || document.documentElement;
  if (se) se.scrollTop = 0;
}
const go = (name, id) => {
  view = { name, id: id || null };
  authStep = null; editMode = false; editingAlbum = null;
  toTop(); render();
};

/* ========================= cocher / décocher ========================= */
function albumById(id) {
  for (const s of series) { const a = s.albums.find(x => String(x.id) === String(id)); if (a) return a; }
  return null;
}

async function toggle(btn, id) {
  const a = albumById(id);
  if (!a) return;
  if (!canWrite()) { authStep = { step: 'ask', email: '' }; return render(); }

  // On coche tout de suite et on écrit ensuite : la liste ne doit pas attendre
  // le réseau sous le doigt. Si la base refuse, on revient en arrière.
  const avant = !!a.owned, on = !avant;
  a.owned = on;

  btn.setAttribute('aria-pressed', String(on));
  const v = btn.querySelector('.verdict');
  if (v) v.textContent = on ? 'Vous l’avez' : 'Pas encore';
  updateTallies();
  if (view.name === 'detail' && !query.trim()) majEnteteDetail();
  if (view.name === 'missing' && !query.trim() && on) retirerLigne(btn);
  if (view.name === 'stats' && !query.trim()) renderStats();

  const ok = await write(() => sb.from('albums').update({ owned: on }).eq('id', a.id));
  if (!ok) { a.owned = avant; render(); }
}

function majEnteteDetail() {
  const s = byId.get(view.id); if (!s) return;
  const c = count(s), t = total(s);
  const cEl = $('d-c'), bar = $('d-bar');
  if (cEl) cEl.parentNode.innerHTML =
    `<b id="d-c">${c}</b> sur ${t}${c >= t ? ' — complète' : `, il en manque ${t - c}`}`;
  if (bar) { bar.classList.toggle('full', c >= t); bar.firstElementChild.style.width = (t ? c / t * 100 : 0) + '%'; }
}

function retirerLigne(btn) {
  const li = btn.parentNode, grp = li.closest('[data-grp]');
  li.style.opacity = '0'; li.style.transform = 'translateX(14px)';
  setTimeout(() => {
    li.remove();
    if (grp && !grp.querySelector('.al')) grp.remove();
    else if (grp) grp.querySelector('[data-gn]').textContent = grp.querySelectorAll('.al').length;
    if (!document.querySelector('#v-missing .al')) renderMissing();
  }, 200);
}

/* ========================= lecture des titres collés ========================= */
function parsePasted(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d{1,3})\s*[.)\-–—:]?\s+(.+)$/);
    return m ? { n: Number(m[1]), t: m[2].trim() } : { n: null, t: l };
  });
}

/* ========================= connexion ========================= */
/* Connexion classique : seuls les comptes créés dans Supabase passent. Aucun
   compte ne peut naître ici — ni par ce formulaire, ni par l'API, le
   déclencheur d'inscriptions.sql s'en charge. */
async function seConnecter(email, motDePasse) {
  authStep = { step: 'ask', email, busy: true }; render();
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
    if (error) throw error;
    authStep = null;          // surChangementCompte prend le relais
  } catch (e) {
    authStep = { step: 'ask', email, err: messageAuth(e) };
  }
  render();
}

function messageAuth(e) {
  const m = String((e && e.message) || '').toLowerCase();
  const code = String((e && e.code) || '');
  // Un refus ne dit jamais si l'adresse existe : ce serait renseigner qui
  // cherche à entrer.
  if (code === 'invalid_credentials' || m.includes('invalid login credentials'))
    return 'Adresse ou mot de passe incorrect.';
  if (code === 'email_not_confirmed' || m.includes('not confirmed'))
    return 'Ce compte n’est pas encore confirmé. Prévenez la personne qui l’a créé.';
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds'))
    return 'Trop de tentatives d’affilée. Patientez une minute.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'Pas de connexion. Vérifiez le réseau et réessayez.';
  return 'La connexion a échoué. Réessayez.';
}

/* ========================= interactions ========================= */
document.addEventListener('click', async e => {
  // `.al.edit` porte le crayon et la corbeille : ce n'est plus une case à cocher.
  const al = e.target.closest('.al:not(.edit)');
  if (al) return toggle(al, al.dataset.id);

  const t = e.target.closest('[data-go]');
  if (t) return go('detail', t.dataset.go);
  if (e.target.closest('[data-back]')) return go('shelf');

  const chip = e.target.closest('.chip');
  if (chip) { filter = chip.dataset.f; return render(); }

  const tab = e.target.closest('.tab');
  if (tab) {
    query = ''; $('q').value = ''; adding = null; authStep = null;
    try { localStorage.setItem(LS + '.tab', tab.dataset.tab); } catch (err) {}
    return go(tab.dataset.tab);
  }
  if (e.target.closest('#q-clear')) {
    query = ''; $('q').value = ''; render(); return $('q').focus();
  }

  /* connexion */
  if (e.target.closest('#auth-btn')) {
    if (canWrite()) { await sb.auth.signOut(); return; }
    authStep = { step: 'ask', email: '' }; toTop(); return render();
  }
  if (e.target.closest('[data-auth-close]')) { authStep = null; return render(); }
  if (e.target.closest('[data-auth-signout]')) { await sb.auth.signOut(); return; }
  if (e.target.closest('[data-auth-send]')) {
    const v = ($('auth-mail').value || '').trim();
    const p = $('auth-pass').value || '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      authStep = { step: 'ask', email: v, err: 'Tapez une adresse e-mail complète.' };
      return render();
    }
    if (!p) {
      authStep = { step: 'ask', email: v, err: 'Tapez votre mot de passe.' };
      render(); return $('auth-pass')?.focus();
    }
    return seConnecter(v, p);
  }

  /* un album isolé dans une série existante */
  if (e.target.closest('[data-add-album]')) {
    if (!canWrite()) { authStep = { step: 'ask', email: '' }; return render(); }
    $('add-album').hidden = false;
    e.target.closest('[data-add-album]').hidden = true;
    return $('aa-t').focus();
  }
  if (e.target.closest('[data-cancel]')) {
    $('add-album').hidden = true;
    document.querySelector('[data-add-album]').hidden = false; return;
  }
  if (e.target.closest('[data-save-album]')) {
    const ti = $('aa-t').value.trim();
    const n = parseInt($('aa-n').value, 10);
    if (!ti) return;
    await addAlbum(view.id, Number.isFinite(n) ? n : 0, ti);
    return render();
  }

  /* une série entière */
  if (e.target.closest('[data-add-serie]')) {
    if (!canWrite()) { authStep = { step: 'ask', email: '' }; return render(); }
    adding = { name: '', albums: [] }; toTop(); render();
    $('add-serie')?.scrollIntoView({ block: 'start' });
    return $('as-name')?.focus();
  }
  if (e.target.closest('[data-add-cancel]')) { adding = null; return render(); }

  const rm = e.target.closest('[data-rm]');
  if (rm) { syncAddName(); adding.albums.splice(Number(rm.dataset.rm), 1); return render(); }

  if (e.target.closest('[data-ae-add]')) {
    syncAddName();
    const ti = $('ae-t').value.trim(), n = parseInt($('ae-n').value, 10);
    if (!ti) { adding.err = 'Tapez le titre de l’album.'; return render(); }
    adding.err = null;
    adding.albums.push({ n: Number.isFinite(n) ? n : adding.albums.length + 1, t: ti });
    render();
    return $('ae-t')?.focus();
  }
  if (e.target.closest('[data-ae-paste]')) {
    syncAddName();
    const lignes = parsePasted($('ae-paste').value);
    if (!lignes.length) { adding.err = 'Collez au moins un titre.'; adding.paste = true; return render(); }
    let suivant = adding.albums.length ? Math.max(...adding.albums.map(x => x.n || 0)) + 1 : 1;
    for (const l of lignes) adding.albums.push({ n: l.n != null ? l.n : suivant++, t: l.t });
    adding.err = null; adding.paste = true;
    return render();
  }
  if (e.target.closest('[data-add-save]')) {
    syncAddName();
    const { name, albums } = adding;
    if (!(name || '').trim() || !albums.length) return;
    const id = await createSerie(name.trim(), albums);
    adding = null;
    if (id) return go('detail', id);
    return render();
  }

  /* ---- mode modification ---- */
  if (e.target.closest('[data-edit-on]')) {
    if (!canWrite()) { authStep = { step: 'ask', email: '' }; return render(); }
    editMode = true; editingAlbum = null; return render();
  }
  if (e.target.closest('[data-edit-off]')) { editMode = false; editingAlbum = null; return render(); }

  const ed = e.target.closest('[data-edit-album]');
  if (ed) {
    editingAlbum = Number(ed.dataset.editAlbum); render();
    return $('ed-t')?.focus();
  }
  if (e.target.closest('[data-edit-cancel]')) { editingAlbum = null; return render(); }

  const sv = e.target.closest('[data-edit-save]');
  if (sv) {
    const a = albumById(sv.dataset.editSave);
    const ti = $('ed-t').value.trim(), n = parseInt($('ed-n').value, 10);
    if (!a || !ti) return;
    editingAlbum = null;
    await updateAlbum(a, Number.isFinite(n) ? n : a.num, ti);
    return render();
  }

  const da = e.target.closest('[data-del-album]');
  if (da) {
    if (da.dataset.sure) {
      const a = albumById(da.dataset.delAlbum);
      if (a) await deleteAlbum(a);
      return render();
    }
    da.dataset.sure = '1';
    da.classList.add('wide-confirm');
    da.textContent = 'Supprimer ?';
    return;
  }

  if (e.target.closest('[data-rename]')) {
    const s = byId.get(view.id), v = $('se-name').value.trim();
    if (!s || !v || v === s.name) return;
    await renameSerie(s, v);
    return render();
  }

  const del = e.target.closest('[data-del-serie]');
  if (del) {
    if (del.dataset.sure) {
      const id = view.id;
      editMode = false;
      await deleteSerie(id);
      return go('shelf');
    }
    del.dataset.sure = '1'; del.textContent = 'Confirmer la suppression';
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') { query = e.target.value; render(); }
  if (e.target.id === 'aa-t') {
    const b = document.querySelector('[data-save-album]');
    if (b) b.disabled = !e.target.value.trim();
  }
  if (e.target.id === 'as-name' && adding) {
    const b = document.querySelector('[data-add-save]');
    if (b) b.disabled = !(e.target.value.trim() && adding.albums.length);
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = e.target.id;
  if (id === 'ae-t' || id === 'ae-n') { e.preventDefault(); document.querySelector('[data-ae-add]')?.click(); }
  if (id === 'aa-t' || id === 'aa-n') { e.preventDefault(); document.querySelector('[data-save-album]')?.click(); }
  if (id === 'auth-mail') { e.preventDefault(); $('auth-pass')?.focus(); }
  if (id === 'auth-pass') { e.preventDefault(); document.querySelector('[data-auth-send]')?.click(); }
  if (id === 'ed-t' || id === 'ed-n') { e.preventDefault(); document.querySelector('[data-edit-save]')?.click(); }
  if (id === 'se-name') { e.preventDefault(); document.querySelector('[data-rename]')?.click(); }
});

/* ========================= démarrage ========================= */
/* Connexion ou déconnexion : on recharge, ou on efface tout — le cache local
   contient la collection, qui est privée. */
async function surChangementCompte(s) {
  const avant = !!session;
  session = s || null;
  if (!!session === avant) { setSync(); return; }

  autorise = null;
  if (session) {
    authStep = null;
    await verifierAcces();
    if (ouvert()) { try { await loadAll(); } catch (e) { loadError = e; } }
  } else {
    series = []; byId.clear(); loadError = null; lastError = null;
    try { localStorage.removeItem(LS); } catch (e) {}
    for (const v of ['search', 'shelf', 'detail', 'missing', 'stats']) $('v-' + v).innerHTML = '';
    authStep = { step: 'ask', email: '' };
  }
  setSync(); render();
}

function bloquer(titre, corps) {
  $('v-boot').hidden = false;
  $('v-boot').innerHTML = `<div class="blocker"><h3>${esc(titre)}</h3>${corps}</div>`;
}

async function boot() {
  // `key` est la clé publiable actuelle ; `anonKey` reste accepté pour les
  // projets créés avant le changement de format.
  const cle = CONFIG.key || CONFIG.anonKey;
  if (!CONFIG.url || !cle) {
    const manque = !CONFIG.url && !cle ? 'L’adresse du projet et la clé manquent'
      : !CONFIG.url ? 'L’adresse du projet manque' : 'La clé publiable manque';
    return bloquer('Configuration à compléter', `
      <p class="note">${manque}. Ouvrez <code>assets/config.js</code> et renseignez
         les valeurs trouvées dans Supabase, sous Settings → API.</p>
      <pre>window.BD_CONFIG = {
  url: 'https://xxxxxxxx.supabase.co',
  key: 'sb_publishable_…',
};</pre>`);
  }

  LS = 'bdcoco.v1.' + String(CONFIG.url).replace(/[^a-z0-9]/gi, '').slice(-14);

  sb = window.supabase.createClient(CONFIG.url, cle, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const { data } = await sb.auth.getSession();
  session = data.session || null;
  sb.auth.onAuthStateChange((_e, s) => { void surChangementCompte(s); });

  try {
    const tb = localStorage.getItem(LS + '.tab');
    if (['shelf', 'missing', 'stats'].includes(tb)) view = { name: tb, id: null };
  } catch (e) {}

  // Porte fermée : on ne demande rien à la base, on affiche l'écran d'entrée.
  // Et on n'y laisse traîner aucune collection d'une session précédente.
  if (!session) {
    try { localStorage.removeItem(LS); } catch (e) {}
    authStep = { step: 'ask', email: '' }; setSync(); return render();
  }
  await verifierAcces();
  if (!ouvert()) { setSync(); return render(); }

  // affichage immédiat depuis le cache, le temps que la base réponde
  const cache = readLocal();
  if (cache && cache.length) { series = cache; indexSeries(); render(); }

  try {
    await loadAll();
  } catch (e) {
    if (!series.length) {
      // PGRST205 : PostgREST joint bien le projet, mais la table n'existe pas.
      // C'est le cas le plus courant au premier lancement, et il a sa réponse.
      const tablesAbsentes = e && (e.code === 'PGRST205'
        || /schema cache|does not exist/i.test(String(e.message || '')));
      return tablesAbsentes
        ? bloquer('La base est vide', `
          <p class="note">Le projet répond, mais les tables n’y sont pas encore.
             Dans le SQL Editor de Supabase, exécutez d’abord
             <code>supabase/schema.sql</code>, puis <code>supabase/seed.sql</code>.</p>
          <p class="note">Ensuite, rechargez cette page.</p>`)
        : bloquer('La base ne répond pas', `
          <p class="note">${esc((e && e.message) || 'Erreur inconnue')}</p>
          <p class="note">Vérifiez l’adresse et la clé dans <code>assets/config.js</code>,
             puis que <code>supabase/schema.sql</code> et <code>supabase/seed.sql</code>
             ont bien été exécutés.</p>`);
    }
    loadError = e;   // on garde l'affichage du cache, en le disant
  }
  setSync();
  render();
}

boot();
