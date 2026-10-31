# Audit de la collection

État au 31 octobre 2026 — 61 séries, 1 085 albums, 574 possédés.

Croisement de la structure des données avec les séries réelles. L'objectif
n'est pas de corriger tout de suite, mais de savoir ce qu'on regarde.

---

## 1. La trouvaille principale : « 33 séries complètes » est faux

Le Bilan annonce 33 séries complètes. Ce sont en réalité les 33 séries où la
liste **s'arrête à ce que Maman possède** : elle n'a pas noté les albums
qu'elle n'a pas. Le compteur affiche donc 100 % sur des séries dont elle a
parfois un album sur soixante-dix.

Vérifié par recherche :

| Série | Dans l'application | Série réelle |
|---|---:|---:|
| Ric Hochet | 1 | **78** |
| Les Tuniques Bleues | 1 | **~66** |
| Spirou et Fantasio | 5 | **56+** |
| Les Schtroumpfs | 4 | **~41** |
| Cédric | 3 | **~35** |
| Natacha | 23 | **23** ✓ |

Natacha est la seule vérifiée qui soit réellement complète. Les autres sont
des listes de possession déguisées en séries.

**Les 33 concernées**, par taille décroissante :

Lefranc (29), Natacha (23), Éric Castel (16), Les Reportages de Lefranc (9),
La Découverte du monde (8), Carmen Cru (5), Spirou et Fantasio (5), Kador (4),
Les Schtroumpfs (4), Cédric (3), Durango (3), Jari (3), Les Simpson (3),
Iznogoud (2), Marsupilami (2), Une année de BD (2), Une vie de merde (2),
puis seize séries à un seul album : Calagan, Charly la Rouille,
Claire Bretécher, Idées noires, Il était une fois, L'Agent 212,
La Vérité sur…, Le Guide de…, Les Accros de MSN, Les Tuniques Bleues,
Mac Coy, Papyrus, Ric Hochet, Rocky Luke, Sammy, Valentin.

**Conséquence** : l'onglet « À trouver » est aveugle sur ces 33 séries. Il
annonce 511 albums manquants ; le vrai chiffre se compte en milliers.

---

## 2. Les 16 albums isolés ne sont pas des séries

Seize entrées n'ont qu'un album, souvent un one-shot ou un album d'humour
acheté seul. Les traiter comme des séries gonfle le compte (16 des 61) et
encombre l'étagère.

**Piste** : une catégorie « Albums isolés » qui les regroupe, plutôt que
seize vignettes à 1/1.

À distinguer des vrais débuts de collection cachés là-dedans : Ric Hochet,
Les Tuniques Bleues et Papyrus sont de longues séries dont elle n'a qu'un
tome.

---

## 3. Des hors-série noyés dans la numérotation

Quatre séries mélangent la série principale et ses hors-série dans une seule
suite numérotée. Les éditeurs les numérotent séparément (Bédéthèque utilise
des codes `HS01`, `HS02`…).

| Série | Hors-série | Sur un total de |
|---|---:|---:|
| Les Bidochons | 12 | 36 |
| Lucky Luke | 8 | 89 |
| Blueberry | 3 | 33 |
| Yoko Tsuno | 2 | 32 |

C'est ce qui explique les 89 albums de Lucky Luke : la série principale
tourne autour de 70, le reste est hors-série.

**Piste** : un bloc « Hors série » par série, comme celui qui existe déjà
pour Blake et Mortimer. Le titre de l'album le dit déjà, il suffit de s'en
servir.

---

## 4. Michel Vaillant : un bloc de 16 albums sans titre

La série a six blocs. Le troisième, sans nom, mélange trois choses :

```
 1  Retour a konigsfeld                    ← Michel Vaillant
 2  Les labourdet #1 ni toi ni lui         ← Les Labourdet
 3  Ça c'est du sport                      ← Michel Vaillant
 5  Dossier v2001                          ← Michel Vaillant
 9  L'oncle paul 1                         ← L'Oncle Paul
10  Les labourdet #5 le faux pas           ← Les Labourdet
…   9 « Labourdet », 3 « Oncle Paul », 4 autres
```

**Les Labourdet** et **L'Oncle Paul** sont des séries à part entière de Jean
Graton, pas des Michel Vaillant. Le bloc « Saison 2 » (12 albums) est lui
correct : la Nouvelle Saison repart bien d'un tome 1 en 2012.

**Piste** : sortir « Les Labourdet » (9) et « L'Oncle Paul » (3) en séries
propres, ou au minimum en blocs nommés.

---

## 5. Cinquante-trois albums sans vrai titre

| Série | Titres factices | Sur |
|---|---:|---:|
| Boule et Bill | 27 | 62 |
| Blake et Mortimer | 11 | 37 |
| Les Foots Furieux | 9 | 9 |
| Kador | 4 | 4 |
| Idées noires | 1 | 1 |
| Les Accros de MSN | 1 | 1 |

« boule et bill tome 13 », « tome 4 »… Ces albums sont introuvables par la
recherche : taper un vrai titre ne les atteindra jamais. Les onze de Blake et
Mortimer sont un cas à part et légitime — ce sont des diptyques dont le titre
comporte réellement « tome 1 » et « tome 2 ».

---

## 6. Ce qui va bien

- **Aucun trou de numérotation**, sur aucune des 61 séries. Les listes sont
  continues : rien ne manque *à l'intérieur* de ce qui a été noté.
- **Aucun numéro en double** après la correction des sous-collections.
- Les séries longues renseignées album par album (Astérix 40, Tintin 24,
  Buck Danny 55, Dan Cooper 41, Achille Talon 48, Les 4 As 43) sont
  cohérentes avec les séries réelles.

---

## Avancement

**14 séries sur 33 sont complétées**, en deux fichiers à exécuter dans le
SQL Editor : `supabase/completer.sql` puis `supabase/completer2.sql`. Les
listes viennent de Wikipédia ; les albums déjà cochés ont été retrouvés
par leur titre et le restent.

| Série | Avant | Après | | Série | Avant | Après |
|---|---:|---:|---|---|---:|---:|
| Ric Hochet | 1 | **78** | | Spirou et Fantasio | 5 | **59** |
| Les Tuniques Bleues | 1 | **70** | | Les Schtroumpfs | 4 | **43** |
| Sammy | 1 | **40** | | Lefranc | 29 | **37** |
| Cédric | 3 | **37** | | L'Agent 212 | 1 | **30** |
| Marsupilami | 2 | **36** | | Mac Coy | 1 | **21** |
| Iznogoud | 2 | **33** | | Durango | 3 | **19** |
| Papyrus | 1 | **33** | | Carmen Cru | 5 | **8** |

**485 albums ajoutés, aucune coche perdue.**

Douze titres ont été rapprochés malgré une faute de frappe : « Terrains
minets » → « Terrain minets », « Enfins seuls » → « Enfin seuls ! »,
« La mome bleue » → « La Momie bleue », « Le sctroumpfissime » → « Le
Schtroumpfissime », « L'ecorché vive » → « L'Écorchée vive », et d'autres
du même ordre. Chacun a été relu avant d'être accepté.

Deux albums de Spirou qu'elle possède — *Tu comprendras quand tu s'ras
grand* et *Mes amis à poil* — n'appartiennent pas à la série numérotée.
Ils sont conservés dans un bloc « Autres », toujours cochés.

**Éric Castel n'a pas été touchée** : la liste de référence en donne 15,
elle en a 16. Réduire aurait fait disparaître un album. Un garde-fou
empêche désormais toute série de rétrécir.

**Réserve sur Sammy** : Wikipédia présente la série en deux numérotations
qui repartent à 1 (la série s'appelait d'abord « Les Gorilles »). Les
albums 21 à 40 ont été renumérotés à la suite ; à confronter à ses albums
si elle en acquiert d'autres.

### Le regroupement

`supabase/regrouper.sql`, à exécuter en troisième. Il fait deux choses :

**Valentin le vagabond** passe de 1 à 7 albums, et la série reprend son
vrai nom — elle s'appelait « Valentin ».

**Neuf one-shots sont rassemblés** dans une entrée « Albums isolés ».
Leurs titres ne voulaient rien dire seuls : « Le tennis », « Tome 1 »,
« La cinquantaine ». Ils sont recomposés avec le nom de leur série.

| Avant | Après |
|---|---|
| Claire Bretécher → « Agripppine » | Agrippine (Claire Bretécher) |
| Calagan → « Rallye raid » | Calagan — Rallye raid |
| Idées noires → « Tome 1 » | Idées noires |
| Il était une fois → « Yannick noah » | Il était une fois… Yannick Noah |
| La Vérité sur… → « Le tennis » | La Vérité sur le tennis |
| Le Guide de… → « La cinquantaine » | Le Guide de la cinquantaine |
| Les Accros de MSN → « Tome 1 » | Les Accros de MSN |
| Rocky Luke → « Banlieue west » | Rocky Luke — Banlieue West |
| Charly la Rouille | Charly la Rouille |

**L'étagère passe de 61 à 53 séries**, et « Albums isolés » affiche 9/9
au lieu de neuf vignettes à 1/1.

### Ce qui reste

**Jari** (3 albums) et **Kador** (4) : aucune liste trouvée sur
Wikipédia, les pages n'existent pas ou ne la contiennent pas.

**Les Simpson** (3) et **La Découverte du monde** (8) : des collections
plutôt que des séries, à compléter à la main si le besoin s'en fait
sentir.

**Natacha** (23) et **Les Reportages de Lefranc** (9) sont vérifiées
complètes. **Éric Castel** est laissée en l'état, voir plus haut.

## Dans quel ordre s'y prendre

1. **Compléter les 33 listes tronquées.** C'est ce qui débloque l'onglet
   « À trouver », donc l'usage principal de l'application en brocante.
   À faire série par série, en commençant par celles qu'elle collectionne
   vraiment (Spirou, Les Schtroumpfs, Cédric, Ric Hochet).
2. **Sortir les hors-série** en blocs nommés — mécanique, le titre contient
   déjà l'information.
3. **Démêler Michel Vaillant** : Les Labourdet et L'Oncle Paul en séries
   propres.
4. **Regrouper les albums isolés.**
5. **Retrouver les 53 titres factices**, au moins pour Boule et Bill et
   Les Foots Furieux.
