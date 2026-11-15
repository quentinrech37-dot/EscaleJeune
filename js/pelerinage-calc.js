/* Calculs purs pour le planificateur de pèlerinage (aucun accès au navigateur). */
import { arrondir, coutLigne } from "./cuisine-calc.js";
import { melanger } from "./tournoi-calc.js";

export const ALLURES = { tranquille: 3.5, normal: 4, soutenu: 4.5 };
export const ALLURES_NOMS = { tranquille: "Tranquille (3,5 km/h)", normal: "Normale (4 km/h)", soutenu: "Soutenue (4,5 km/h)" };

// Durée de marche en heures : distance à l'allure choisie, plus 1 h pour 600 m de montée (règle de Naismith)
export function dureeMarche(km, dplus, allure) {
  const v = ALLURES[allure] || ALLURES.normal;
  return Math.max(0, km) / v + Math.max(0, dplus || 0) / 600;
}

export function formatH(heures) {
  const m = Math.round(heures * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export function ajouterMinutes(hhmm, minutes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return "";
  const t = (+m[1] * 60 + +m[2] + Math.round(minutes));
  const j = Math.floor(t / 1440);
  const r = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}${j > 0 ? " (+1 j)" : ""}`;
}

/** Planning d'une étape : durée de marche, durée totale avec pauses, heure d'arrivée. */
export function etape(km, dplus, allure, pausesMin, depart) {
  const marche = dureeMarche(km, dplus, allure);
  const total = marche * 60 + Math.max(0, pausesMin || 0);
  return { marche, totalMin: total, arrivee: ajouterMinutes(depart, total) };
}

/** Eau à boire par personne et par jour (litres) : 0,5 L par heure de marche plus 1 L pour les repas et le reste. */
export function eauParJour(heuresMarche, chaleur) {
  const f = chaleur === "chaud" ? 1.5 : 1;
  return (0.5 * heuresMarche + 1) * f;
}

/**
 * Prénoms séparés par des retours à la ligne, des virgules ou des points-virgules.
 * Les doublons sont distingués : « Marie », « Marie (2) ».
 */
export function lirePrenoms(texte) {
  const brut = String(texte || "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const vus = new Map();
  return brut.map((n) => {
    const k = n.toLowerCase();
    const c = (vus.get(k) || 0) + 1;
    vus.set(k, c);
    return c === 1 ? n : `${n} (${c})`;
  });
}

/** « 1, 2, 3 » devient [1, 2, 3] : places de chaque tente. */
export function lireTentes(texte) {
  return String(texte || "").split(/[\s,;+]+/).map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n > 0 && n <= 20);
}

/**
 * Répartition des tâches. Chaque jour, les tâches passent à la personne suivante ;
 * le décalage supplémentaire évite qu'une même personne garde la même tâche tous les jours.
 * Retourne { grille: [jour][tâche] = prénom, compte: { prénom: nombre de tâches } }.
 */
export function repartirTaches(prenoms, jours, taches, graine = 0) {
  const n = prenoms.length;
  const ordre = graine ? melanger(prenoms, graine) : prenoms.slice();
  const grille = [];
  const compte = Object.fromEntries(prenoms.map((p) => [p, 0]));
  if (!n || !taches.length) return { grille: Array.from({ length: jours }, () => taches.map(() => "")), compte };
  for (let d = 0; d < jours; d++) {
    const depart = (d * taches.length + (taches.length % n === 0 ? d : 0)) % n;
    const ligne = taches.map((_, t) => ordre[(depart + t) % n]);
    ligne.forEach((p) => { compte[p]++; });
    grille.push(ligne);
  }
  return { grille, compte };
}

/** Besoins en nourriture pour le groupe. */
export function besoinsNourriture(aliments, nb, jours, options, prix = {}) {
  const lignes = [];
  for (const a of aliments) {
    if (a.cond === "rechaud" && !options.rechaud) continue;
    if (a.cond === "pain" && options.painFourni) continue;
    if (a.cond === "soupe" && options.soupeFournie) continue;
    const brut = a.pj * nb * jours;
    const qte = arrondir(a.unite, brut);
    const p = Number.isFinite(prix[a.id]) ? prix[a.id] : a.prix;
    lignes.push({ id: a.id, nom: a.nom, unite: a.unite, rayon: a.rayon, qte, cout: coutLigne(a.unite, qte, p) });
  }
  const total = lignes.reduce((s, l) => s + l.cout, 0);
  return { lignes, total };
}

/** Répartit des objets collectifs entre les personnes, à tour de rôle. */
export function repartirMateriel(prenoms, objets, graine = 0) {
  const ordre = graine ? melanger(prenoms, graine) : prenoms.slice();
  if (!ordre.length) return objets.map((o) => ({ objet: o, qui: "" }));
  return objets.map((o, i) => ({ objet: o, qui: ordre[i % ordre.length] }));
}

/** Budget par personne : nourriture + inscription + part de l'essence. */
export function budget(totalNourriture, nb, inscription, essenceTotale) {
  const n = Math.max(1, nb);
  const nourriture = totalNourriture / n;
  const essence = Math.max(0, essenceTotale || 0) / n;
  return { nourriture, inscription: Math.max(0, inscription || 0), essence, total: nourriture + Math.max(0, inscription || 0) + essence };
}
