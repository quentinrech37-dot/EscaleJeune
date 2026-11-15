/* Calculs purs pour les tournois (aucun accès au navigateur : testables seuls). */

/* ---------- Hasard reproductible ---------- */

// Générateur pseudo-aléatoire à graine : un même tirage se retrouve avec la même graine
export function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function melanger(tableau, graine) {
  const r = mulberry32(graine | 0);
  const a = tableau.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Participants et équipes ---------- */

// Un nom par ligne (virgules et points-virgules acceptés). Les doublons sont distingués.
export function lireNoms(texte) {
  const brut = String(texte || "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const vus = new Map();
  return brut.map((n) => {
    const k = n.toLowerCase();
    const c = (vus.get(k) || 0) + 1;
    vus.set(k, c);
    return c === 1 ? n : `${n} (${c})`;
  });
}

/**
 * Forme des équipes au hasard.
 * taille <= 1 : chaque nom est déjà une équipe.
 * reste : "trio" (les joueurs en trop complètent des équipes) ou "remplacant" (ils restent en réserve).
 */
export function formerEquipes(noms, taille, reste, graine) {
  if (taille <= 1) {
    return { equipes: noms.map((n) => ({ nom: n, membres: [n] })), remplacants: [] };
  }
  const m = melanger(noms, graine);
  const k = Math.floor(m.length / taille);
  if (k === 0) return { equipes: [], remplacants: m };
  const groupes = [];
  for (let i = 0; i < k; i++) groupes.push(m.slice(i * taille, (i + 1) * taille));
  const restants = m.slice(k * taille);
  let remplacants = [];
  if (reste === "remplacant") {
    remplacants = restants;
  } else {
    restants.forEach((p, i) => groupes[i % k].push(p));
  }
  return {
    equipes: groupes.map((g) => ({ nom: g.join(" & "), membres: g })),
    remplacants,
  };
}

/* ---------- Poules ---------- */

export function nbPoulesAuto(n) {
  if (n <= 5) return 1;
  return Math.max(2, Math.round(n / 4));
}

// Répartit n équipes (déjà tirées au sort) dans nbPoules poules de tailles presque égales
export function repartirPoules(n, nbPoules) {
  const poules = Array.from({ length: nbPoules }, () => []);
  for (let i = 0; i < n; i++) poules[i % nbPoules].push(i);
  return poules;
}

// Méthode du cercle : liste de tours, chaque équipe affronte toutes les autres une fois
export function toursChampionnat(ids) {
  const a = ids.slice();
  if (a.length % 2 === 1) a.push(null);
  const n = a.length;
  const tours = [];
  for (let t = 0; t < n - 1; t++) {
    const tour = [];
    for (let i = 0; i < n / 2; i++) {
      const x = a[i], y = a[n - 1 - i];
      if (x !== null && y !== null) tour.push([x, y]);
    }
    tours.push(tour);
    a.splice(1, 0, a.pop());
  }
  return tours;
}

// Tous les matchs de poule, entrelacés par tour pour que les tables ne soient jamais inactives
export function matchsDePoules(poules) {
  const parPoule = poules.map((p) => toursChampionnat(p));
  const maxTours = Math.max(0, ...parPoule.map((t) => t.length));
  const liste = [];
  for (let t = 0; t < maxTours; t++) {
    parPoule.forEach((tours, p) => {
      (tours[t] || []).forEach(([a, b], i) => {
        liste.push({ id: `P${p}-${t}-${i}`, poule: p, tour: t, a, b });
      });
    });
  }
  return liste;
}

/**
 * Attribue à chaque match un créneau et une table.
 * Une équipe ne joue jamais deux matchs en même temps.
 * Retourne le nombre de créneaux utilisés.
 */
export function planifier(matchs, tables, debutCreneau = 0) {
  let restants = matchs.slice();
  let creneau = debutCreneau;
  const tablesN = Math.max(1, tables | 0);
  while (restants.length) {
    const pris = new Set();
    const choisis = [];
    for (const m of restants) {
      if (choisis.length >= tablesN) break;
      if (pris.has(m.a) || pris.has(m.b)) continue;
      pris.add(m.a);
      pris.add(m.b);
      choisis.push(m);
    }
    if (!choisis.length) break;
    choisis.forEach((m, i) => { m.creneau = creneau; m.table = i + 1; });
    restants = restants.filter((m) => !choisis.includes(m));
    creneau++;
  }
  return creneau - debutCreneau;
}

/* ---------- Classement ---------- */

export function scoreValide(s) {
  return Array.isArray(s) && s.length === 2 && Number.isInteger(s[0]) && Number.isInteger(s[1]) && s[0] >= 0 && s[1] >= 0;
}

// Points : victoire 3, nul 1, défaite 0. Départage : différence de buts, buts marqués, puis ordre du tirage.
export function classement(equipesDeLaPoule, matchs, scores) {
  const lignes = new Map(equipesDeLaPoule.map((e) => [e, { equipe: e, j: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, diff: 0, pts: 0 }]));
  let complet = true;
  for (const m of matchs) {
    const s = scores[m.id];
    if (!scoreValide(s)) { complet = false; continue; }
    const A = lignes.get(m.a), B = lignes.get(m.b);
    A.j++; B.j++;
    A.bp += s[0]; A.bc += s[1]; B.bp += s[1]; B.bc += s[0];
    if (s[0] > s[1]) { A.v++; A.pts += 3; B.d++; }
    else if (s[0] < s[1]) { B.v++; B.pts += 3; A.d++; }
    else { A.n++; B.n++; A.pts++; B.pts++; }
  }
  const rang = equipesDeLaPoule.slice();
  const tri = [...lignes.values()].map((l) => ({ ...l, diff: l.bp - l.bc }));
  tri.sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.bp - x.bp || rang.indexOf(x.equipe) - rang.indexOf(y.equipe));
  return { lignes: tri, complet };
}

/* ---------- Tableau final (élimination directe) ---------- */

export const puissance2 = (m) => { let s = 1; while (s < m) s *= 2; return s; };

// Ordre des têtes de série dans le tableau : 1 contre S, 2 contre S-1, etc., sans rencontre précoce des meilleures
export function ordreTableau(S) {
  let o = [1];
  while (o.length < S) {
    const n = o.length * 2;
    o = o.flatMap((x) => [x, n + 1 - x]);
  }
  return o;
}

/**
 * Construit le tableau à partir d'une liste de places ordonnées par tête de série (la meilleure en premier).
 * Chaque place est un objet quelconque. Les places manquantes (jusqu'à la puissance de 2) sont des « exemptés ».
 * Retourne des tours ; chaque match : { id, a, b } où a et b sont { place } | { bye } | { gagnant: idDuMatch }.
 */
export function construireTableau(places) {
  const m = places.length;
  if (m < 2) return [];
  const S = puissance2(m);
  const ordre = ordreTableau(S);
  const emplacements = ordre.map((seed) => (seed <= m ? { place: places[seed - 1] } : { bye: true }));
  const tours = [];
  let courant = [];
  for (let i = 0; i < S / 2; i++) {
    courant.push({ id: `K0-${i}`, a: emplacements[2 * i], b: emplacements[2 * i + 1] });
  }
  tours.push(courant);
  let r = 1;
  while (courant.length > 1) {
    const suivant = [];
    for (let i = 0; i < courant.length / 2; i++) {
      suivant.push({ id: `K${r}-${i}`, a: { gagnant: courant[2 * i].id }, b: { gagnant: courant[2 * i + 1].id } });
    }
    tours.push(suivant);
    courant = suivant;
    r++;
  }
  return tours;
}

/**
 * Têtes de série pour une phase finale issue de poules :
 * tous les premiers, puis les deuxièmes (décalés pour éviter qu'un duel de poule se rejoue au premier tour), etc.
 */
export function placesDepuisPoules(nbPoules, qualifies) {
  const places = [];
  for (let rang = 0; rang < qualifies; rang++) {
    const ordre = [];
    for (let p = 0; p < nbPoules; p++) ordre.push(p);
    let meilleur = ordre;
    if (rang > 0) {
      let meilleursClash = Infinity;
      for (let dec = 0; dec < nbPoules; dec++) {
        const essai = ordre.map((_, i) => ordre[(i + dec) % nbPoules]);
        const test = places.concat(essai.map((p) => ({ poule: p, rang })));
        const clash = compterClash(test);
        if (clash < meilleursClash) { meilleursClash = clash; meilleur = essai; }
      }
    }
    meilleur.forEach((p) => places.push({ poule: p, rang }));
  }
  return places;
}

function compterClash(places) {
  const tours = construireTableau(places);
  if (!tours.length) return 0;
  let c = 0;
  for (const m of tours[0]) {
    if (m.a.place && m.b.place && m.a.place.poule === m.b.place.poule) c++;
  }
  return c;
}

/* ---------- Estimation de la durée ---------- */

export function matchsPoule(taille) { return (taille * (taille - 1)) / 2; }

export function nomTour(restant) {
  if (restant === 1) return "Finale";
  if (restant === 2) return "Demi-finales";
  if (restant === 4) return "Quarts de finale";
  if (restant === 8) return "Huitièmes de finale";
  return `Tour de ${restant * 2} équipes`;
}

export function matchsTableau(m) {
  if (m < 2) return { total: 0, parTour: [] };
  const S = puissance2(m);
  const parTour = [];
  let n = S / 2;
  parTour.push(m - S / 2);
  while (n > 1) { n = n / 2; parTour.push(n); }
  return { total: parTour.reduce((a, b) => a + b, 0), parTour };
}

/** Compare les formats possibles pour n équipes. */
export function comparerFormats(n, tables, duree) {
  const res = [];
  const T = Math.max(1, tables | 0);
  if (n < 2) return res;
  const creneaux = (parTour) => parTour.reduce((s, k) => s + Math.ceil(k / T), 0);

  if (n <= 8) {
    const matchs = matchsDePoules([Array.from({ length: n }, (_, i) => i)]);
    const nb = planifier(matchs, T);
    res.push({ id: "championnat", nom: "Tous contre tous", matchs: matchs.length, minParEquipe: n - 1, minutes: nb * duree });
  }
  if (n >= 4) {
    const P = nbPoulesAuto(n);
    const tailles = repartirPoules(n, P).map((p) => p.length);
    const poules = repartirPoules(n, P);
    const ms = matchsDePoules(poules);
    const nbP = planifier(ms, T);
    const q = P === 1 ? 0 : (Math.min(...tailles) >= 3 ? 2 : 1);
    const qual = P * q;
    const t = matchsTableau(qual);
    res.push({
      id: "poules",
      nom: "Poules puis phase finale",
      matchs: ms.length + t.total,
      minParEquipe: Math.min(...tailles) - 1,
      minutes: (nbP + creneaux(t.parTour)) * duree,
    });
  }
  {
    const t = matchsTableau(n);
    res.push({ id: "elim", nom: "Élimination directe", matchs: t.total, minParEquipe: 1, minutes: creneaux(t.parTour) * duree });
  }
  return res;
}

/* ---------- Heures ---------- */

export function ajouterMinutes(hhmm, minutes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return "";
  const t = (((+m[1] * 60 + +m[2] + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function formatDuree(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
