/* ==================== TOURNOI ====================
   Équipes au hasard, poules, planning des matchs, classements et tableau final.
   Tout se passe dans le navigateur. Le lien partagé contient le tirage et les scores.
*/
import {
  lireNoms, formerEquipes, melanger, nbPoulesAuto, repartirPoules, matchsDePoules, planifier,
  classement, scoreValide, placesDepuisPoules, construireTableau, comparerFormats, nomTour,
  ajouterMinutes, formatDuree, 
} from "./tournoi-calc.js";

const KEY = "aumonerie_tournoi_v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LETTRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const DEFAUT = { texte: "", taille: 2, reste: "trio", format: "auto", tables: 2, duree: 10, debut: "14:00", nbPoules: 0, qualifies: 0 };

let config = { ...DEFAUT };
let tirage = null; // { ...config figée, noms, seed }
let scores = {};

/* ---------- Sauvegarde et lien ---------- */

function encoder(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decoder(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
const etat = () => ({ c: config, t: tirage, s: scores });

function sauver() {
  const e = etat();
  try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* stockage indisponible */ }
  try {
    const url = new URL(location.href);
    if (tirage) url.searchParams.set("t", encoder(e)); else url.searchParams.delete("t");
    history.replaceState(null, "", url);
  } catch { /* ignoré */ }
}

function charger() {
  let e = null;
  try {
    const p = new URLSearchParams(location.search).get("t");
    if (p) e = decoder(p);
  } catch { e = null; }
  if (!e) {
    try { e = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { e = null; }
  }
  if (e && typeof e === "object") {
    config = { ...DEFAUT, ...(e.c || {}) };
    tirage = e.t && Array.isArray(e.t.noms) ? e.t : null;
    scores = e.s && typeof e.s === "object" ? e.s : {};
  }
}

function flash(msg) {
  const f = $("flash");
  f.textContent = msg;
  f.classList.remove("hidden");
  clearTimeout(flash._t);
  flash._t = setTimeout(() => f.classList.add("hidden"), 2600);
}

/* ---------- Lecture du formulaire ---------- */

const entier = (v, min, max, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

function lireFormulaire() {
  config = {
    texte: $("trNoms").value,
    taille: entier($("trTaille").value, 1, 6, 2),
    reste: $("trReste").value === "remplacant" ? "remplacant" : "trio",
    format: ["auto", "poules", "elim", "championnat"].includes($("trFormat").value) ? $("trFormat").value : "auto",
    tables: entier($("trTables").value, 1, 20, 2),
    duree: entier($("trDuree").value, 1, 240, 10),
    debut: /^\d{1,2}:\d{2}$/.test($("trDebut").value) ? $("trDebut").value : "14:00",
    nbPoules: entier($("trPoules").value, 0, 30, 0),
    qualifies: entier($("trQualifies").value, 0, 8, 0),
  };
}

function remplirFormulaire() {
  $("trNoms").value = config.texte;
  $("trTaille").value = String(config.taille);
  $("trReste").value = config.reste;
  $("trFormat").value = config.format;
  $("trTables").value = config.tables;
  $("trDuree").value = config.duree;
  $("trDebut").value = config.debut;
  $("trPoules").value = config.nbPoules || "";
  $("trQualifies").value = config.qualifies || "";
}

/* ---------- Modèle d'un tirage ---------- */

function formatChoisi(t, n) {
  if (t.format !== "auto") return t.format;
  if (n <= 5) return "championnat";
  if (n <= 8) return "poules";
  return "poules";
}

function construire(t) {
  const { equipes, remplacants } = formerEquipes(t.noms, t.taille, t.reste, t.seed);
  const n = equipes.length;
  const ordre = melanger(equipes.map((_, i) => i), t.seed + 1);
  let format = formatChoisi(t, n);
  if (n < 4 && format === "poules") format = "championnat";
  let poules = [];
  let places = [];

  if (format === "championnat") {
    poules = [ordre];
  } else if (format === "poules") {
    const P = Math.max(1, Math.min(t.nbPoules || nbPoulesAuto(n), Math.floor(n / 2)));
    poules = repartirPoules(n, P).map((p) => p.map((i) => ordre[i]));
    const minT = Math.min(...poules.map((p) => p.length));
    const q = Math.min(t.qualifies || (P === 1 ? 0 : (minT >= 3 ? 2 : 1)), minT);
    if (P * q >= 2) places = placesDepuisPoules(P, q);
  } else {
    places = ordre.map((i) => ({ equipe: i }));
  }

  const matchs = matchsDePoules(poules);
  const creneauxPoules = planifier(matchs, t.tables);
  const tableau = places.length >= 2 ? construireTableau(places) : [];
  const classements = poules.map((p, k) => classement(p, matchs.filter((m) => m.poule === k), scores));
  return { equipes, remplacants, n, format, poules, matchs, creneauxPoules, tableau, classements };
}

/* ---------- Résolution du tableau ---------- */

function resoudreTableau(M) {
  const memo = new Map();
  const nomPoule = (p) => `Poule ${LETTRES[p] || p + 1}`;
  const rangTexte = (r) => (r === 0 ? "1er" : `${r + 1}e`);

  function place(p) {
    if (p.equipe !== undefined) return { equipe: p.equipe };
    const c = M.classements[p.poule];
    if (c && c.complet) return { equipe: c.lignes[p.rang].equipe };
    return { libelle: `${rangTexte(p.rang)} de la ${nomPoule(p.poule).toLowerCase()}` };
  }

  function slot(s) {
    if (s.bye) return { bye: true };
    if (s.place) return place(s.place);
    const g = gagnant(s.gagnant);
    if (g.equipe !== undefined) return { equipe: g.equipe };
    return { libelle: `Vainqueur du match ${idCourt(s.gagnant)}` };
  }

  function match(id) {
    for (const tour of M.tableau) for (const m of tour) if (m.id === id) return m;
    return null;
  }

  // Numéros de match de la phase finale (les exemptés ne comptent pas)
  const numeros = new Map();
  let compteur = 0;
  for (const tour of M.tableau) for (const m of tour) if (!(m.a.bye || m.b.bye)) numeros.set(m.id, ++compteur);
  function idCourt(id) {
    return `n°${numeros.get(id) ?? "?"}`;
  }

  function gagnant(id) {
    if (memo.has(id)) return memo.get(id);
    const m = match(id);
    let res = {};
    const A = slot(m.a), B = slot(m.b);
    if (A.bye && B.equipe !== undefined) res = { equipe: B.equipe };
    else if (B.bye && A.equipe !== undefined) res = { equipe: A.equipe };
    else if (A.equipe !== undefined && B.equipe !== undefined && scoreValide(scores[id]) && scores[id][0] !== scores[id][1]) {
      res = { equipe: scores[id][0] > scores[id][1] ? A.equipe : B.equipe };
    }
    memo.set(id, res);
    return res;
  }

  return { slot, gagnant, idCourt };
}

/* ---------- Rendu ---------- */

function libelleSlot(s, M) {
  if (s.bye) return `<span class="muted">Qualifié d'office</span>`;
  if (s.equipe !== undefined) return esc(M.equipes[s.equipe].nom);
  return `<span class="muted">${esc(s.libelle)}</span>`;
}

function champScore(id, k, valeur) {
  return `<input class="score" type="number" min="0" inputmode="numeric" data-id="${esc(id)}" data-k="${k}" value="${valeur ?? ""}" aria-label="Score">`;
}

function rendreEquipes(M) {
  let h = `<h2>Équipes</h2><ol class="tr-equipes">${M.equipes.map((e) => `<li>${esc(e.nom)}</li>`).join("")}</ol>`;
  if (M.remplacants.length) h += `<p class="muted">En réserve (remplaçants) : ${M.remplacants.map(esc).join(", ")}.</p>`;
  return h;
}

function rendrePlanning(M, t) {
  if (!M.matchs.length) return "";
  const lignes = M.matchs.slice().sort((a, b) => a.creneau - b.creneau || a.table - b.table).map((m) => {
    const s = scoreValide(scores[m.id]) ? scores[m.id] : [null, null];
    const poule = M.poules.length > 1 ? `<span class="tr-tag">${LETTRES[m.poule]}</span>` : "";
    return `<li class="match">
      <span class="match__heure">${esc(ajouterMinutes(t.debut, m.creneau * t.duree))}<small>table ${m.table}</small></span>
      <span class="match__equipes">${poule}<span class="match__a">${esc(M.equipes[m.a].nom)}</span>
        ${champScore(m.id, 0, s[0])}<span class="match__tiret">-</span>${champScore(m.id, 1, s[1])}
        <span class="match__b">${esc(M.equipes[m.b].nom)}</span></span>
    </li>`;
  }).join("");
  return `<h2>Planning des matchs${M.format === "championnat" ? "" : " de poule"}</h2>
    <p class="muted">Saisissez les scores au fur et à mesure : classements et tableau se mettent à jour.</p>
    <ul class="matchs">${lignes}</ul>`;
}

function rendreClassements(M) {
  if (!M.poules.length) return "";
  return `<h2>${M.format === "championnat" ? "Classement" : "Classements des poules"}</h2>
    <div class="tr-poules">${M.poules.map((p, k) => {
    const c = M.classements[k];
    const titre = M.poules.length > 1 ? `Poule ${LETTRES[k]}` : "Classement";
    return `<div class="tr-poule"><h3>${titre}${c.complet ? "" : ` <small class="muted">en cours</small>`}</h3>
      <table class="tr-table"><thead><tr><th>#</th><th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th><th>Diff.</th><th>Pts</th></tr></thead>
      <tbody>${c.lignes.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(M.equipes[l.equipe].nom)}</td><td>${l.j}</td><td>${l.v}</td><td>${l.n}</td><td>${l.d}</td><td>${l.diff > 0 ? "+" : ""}${l.diff}</td><td><strong>${l.pts}</strong></td></tr>`).join("")}</tbody></table></div>`;
  }).join("")}</div>
  <p class="muted">Victoire 3 points, match nul 1 point, défaite 0. À égalité : différence de buts, puis buts marqués.</p>`;
}

function rendreTableau(M, t) {
  if (!M.tableau.length) return "";
  const R = resoudreTableau(M);
  let creneau = M.creneauxPoules;
  const rounds = M.tableau.map((tour, r) => {
    const reels = tour.filter((m) => !(m.a.bye || m.b.bye));
    const debut = ajouterMinutes(t.debut, creneau * t.duree);
    creneau += Math.ceil(reels.length / t.tables);
    const items = tour.map((m) => {
      const A = R.slot(m.a), B = R.slot(m.b);
      if (A.bye || B.bye) {
        const autre = A.bye ? B : A;
        return `<li class="match match--bye"><span class="match__equipes"><span class="match__a">${libelleSlot(autre, M)}</span><span class="muted"> passe directement au tour suivant</span></span></li>`;
      }
      const s = scoreValide(scores[m.id]) ? scores[m.id] : [null, null];
      const egal = scoreValide(scores[m.id]) && scores[m.id][0] === scores[m.id][1];
      const g = R.gagnant(m.id);
      const gA = g.equipe !== undefined && A.equipe === g.equipe;
      const gB = g.equipe !== undefined && B.equipe === g.equipe;
      return `<li class="match">
        <span class="match__heure">${esc(R.idCourt(m.id))}</span>
        <span class="match__equipes"><span class="match__a ${gA ? "is-win" : ""}">${libelleSlot(A, M)}</span>
          ${champScore(m.id, 0, s[0])}<span class="match__tiret">-</span>${champScore(m.id, 1, s[1])}
          <span class="match__b ${gB ? "is-win" : ""}">${libelleSlot(B, M)}</span></span>
        ${egal ? `<span class="tr-alerte">Égalité : un match de phase finale doit avoir un vainqueur.</span>` : ""}
      </li>`;
    }).join("");
    return `<div class="tr-tour"><h3>${esc(nomTour(tour.length))} <small class="muted">vers ${esc(debut)}</small></h3><ul class="matchs">${items}</ul></div>`;
  }).join("");
  const titre = M.format === "elim" ? "Tableau" : "Phase finale";
  return `<h2>${titre}</h2>${rounds}`;
}

function vainqueur(M) {
  if (M.tableau.length) {
    const R = resoudreTableau(M);
    const finale = M.tableau[M.tableau.length - 1][0];
    const g = R.gagnant(finale.id);
    return g.equipe !== undefined ? M.equipes[g.equipe].nom : null;
  }
  const c = M.classements[0];
  return c && c.complet && M.poules.length === 1 ? M.equipes[c.lignes[0].equipe].nom : null;
}

function rendreResultats() {
  const zone = $("trResultats");
  if (!tirage) { zone.classList.add("hidden"); $("trRefaire").classList.add("hidden"); return; }
  const M = construire(tirage);
  zone.classList.remove("hidden");
  $("trRefaire").classList.remove("hidden");
  if (M.n < 2) {
    zone.innerHTML = `<p class="notice">Il faut au moins deux équipes pour lancer un tournoi.</p>`;
    return;
  }
  const v = vainqueur(M);
  const nomFormat = { championnat: "Tous contre tous", poules: "Poules puis phase finale", elim: "Élimination directe" }[M.format];
  zone.innerHTML = `
    <div class="panel__head"><h1>Votre tournoi</h1><span class="muted">${esc(nomFormat)}, ${M.n} équipes</span></div>
    ${v ? `<p class="tr-vainqueur">Vainqueur du tournoi : <strong>${esc(v)}</strong></p>` : ""}
    ${rendreEquipes(M)}
    ${rendrePlanning(M, tirage)}
    ${rendreClassements(M)}
    ${rendreTableau(M, tirage)}`;
}

function rendreComparaison() {
  const noms = lireNoms(config.texte);
  const n = config.taille <= 1 ? noms.length : Math.floor(noms.length / config.taille);
  const zone = $("trCompare");
  if (n < 2) { zone.innerHTML = `<p class="muted">Saisissez les participants pour voir les formats possibles.</p>`; return; }
  const lignes = comparerFormats(n, config.tables, config.duree);
  zone.innerHTML = `<p class="muted">${n} équipe${n > 1 ? "s" : ""} avec ${config.tables} table${config.tables > 1 ? "s" : ""} et des matchs de ${config.duree} min :</p>
    <div class="tr-table-wrap"><table class="tr-table"><thead><tr><th>Format</th><th>Matchs</th><th>Durée</th><th>Matchs garantis par équipe</th></tr></thead>
    <tbody>${lignes.map((l) => `<tr><td>${esc(l.nom)}</td><td>${l.matchs}</td><td>${esc(formatDuree(l.minutes))}</td><td>${l.minParEquipe}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ---------- Actions ---------- */

function nouvelleGraine() {
  return Math.floor(Math.random() * 1e9);
}

function lancer(graine) {
  lireFormulaire();
  const noms = lireNoms(config.texte);
  if (noms.length < 2) { flash("Saisissez au moins deux participants."); return; }
  tirage = { ...config, noms, seed: graine ?? nouvelleGraine() };
  scores = {};
  sauver();
  rendreResultats();
  $("trResultats").scrollIntoView({ behavior: "smooth", block: "start" });
}

function texteResume() {
  if (!tirage) return "";
  const M = construire(tirage);
  let t = `Tournoi : ${M.n} équipes\n\nÉquipes :\n${M.equipes.map((e, i) => `${i + 1}. ${e.nom}`).join("\n")}\n`;
  if (M.matchs.length) {
    t += `\nMatchs :\n`;
    M.matchs.slice().sort((a, b) => a.creneau - b.creneau || a.table - b.table).forEach((m) => {
      t += `${ajouterMinutes(tirage.debut, m.creneau * tirage.duree)} (table ${m.table}) : ${M.equipes[m.a].nom} contre ${M.equipes[m.b].nom}\n`;
    });
  }
  return t;
}

async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; } catch { return false; }
}

function init() {
  if (!$("trNoms")) return;
  charger();
  remplirFormulaire();
  rendreComparaison();
  rendreResultats();

  ["trNoms", "trTaille", "trReste", "trFormat", "trTables", "trDuree", "trDebut", "trPoules", "trQualifies"].forEach((id) =>
    $(id).addEventListener("input", () => { lireFormulaire(); rendreComparaison(); })
  );

  $("trLancer").addEventListener("click", () => lancer());
  $("trRefaire").addEventListener("click", () => {
    if (Object.keys(scores).length && !confirm("Refaire le tirage efface les scores saisis. Continuer ?")) return;
    lancer();
  });

  $("trResultats").addEventListener("change", (e) => {
    const inp = e.target.closest(".score");
    if (!inp) return;
    const id = inp.dataset.id;
    const li = inp.closest(".match");
    const [a, b] = [...li.querySelectorAll(".score")].map((x) => x.value.trim());
    if (a === "" && b === "") delete scores[id];
    else if (a !== "" && b !== "") scores[id] = [parseInt(a, 10), parseInt(b, 10)];
    else return; // un seul champ rempli : on attend l'autre
    sauver();
    rendreResultats();
  });

  $("trLien").addEventListener("click", async () => {
    if (!tirage) { flash("Lancez d'abord le tirage."); return; }
    sauver();
    flash((await copier(location.href)) ? "Lien copié." : "Copie impossible : copiez l'adresse du navigateur.");
  });
  $("trCopier").addEventListener("click", async () => {
    if (!tirage) { flash("Lancez d'abord le tirage."); return; }
    flash((await copier(texteResume())) ? "Planning copié." : "Copie impossible.");
  });
  $("trImprimer").addEventListener("click", () => window.print());
  $("trRaz").addEventListener("click", () => {
    if (!confirm("Tout effacer (participants, tirage et scores) ?")) return;
    config = { ...DEFAUT }; tirage = null; scores = {};
    try { localStorage.removeItem(KEY); } catch { /* ignoré */ }
    remplirFormulaire(); sauver(); rendreComparaison(); rendreResultats();
  });
}

init();
