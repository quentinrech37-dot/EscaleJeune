/* Calendrier liturgique calculé localement (rite romain, usage français).
   Fonctions pures : aucune dépendance au navigateur, testables seules.

   Les dates sont manipulées comme des minuits UTC (en millisecondes) pour éviter
   tout décalage lié à l'heure d'été.
*/

const DAY = 86400000;
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const dow = (t) => new Date(t).getUTCDay(); // 0 = dimanche
const ymd = (t) => { const x = new Date(t); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; };

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export const toTime = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? utc(+m[1], +m[2], +m[3]) : NaN;
};
export const toISO = (t) => { const { y, m, d } = ymd(t); return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
export const libelleDate = (t) => { const { y, m, d } = ymd(t); return `${JOURS[dow(t)]} ${d === 1 ? "1er" : d} ${MOIS[m - 1]} ${y}`; };

const ord = (n) => (n === 1 ? "1er" : `${n}e`);
const ordF = (n) => (n === 1 ? "1re" : `${n}e`);

/* ---------- Dates mobiles ---------- */

// Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien)
export function paques(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, mois, jour);
}

// 1er dimanche de l'Avent : quatre dimanches avant Noël
export function avent1(y) {
  const noel = utc(y, 12, 25);
  const w = dow(noel);
  return noel - (w === 0 ? 28 : w + 21) * DAY;
}

// Épiphanie (France) : dimanche entre le 2 et le 8 janvier
export function epiphanie(y) {
  const t = utc(y, 1, 2);
  return t + ((7 - dow(t)) % 7) * DAY;
}

// Baptême du Seigneur : dimanche suivant, ou lundi si l'Épiphanie tombe un 7 ou un 8 janvier
export function bapteme(y) {
  const e = epiphanie(y);
  const j = ymd(e).d;
  return j === 7 || j === 8 ? e + DAY : e + 7 * DAY;
}

/* ---------- Année liturgique ---------- */

// Lettre des dimanches : A, B ou C (l'année commence à l'Avent)
export function anneeDimanches(t) {
  const { y } = ymd(t);
  const ly = t >= avent1(y) ? y : y - 1;
  return ["A", "B", "C"][ly % 3];
}

// Cycle des lectures de semaine en temps ordinaire : I (année impaire) ou II (année paire)
export const cycleSemaine = (t) => (ymd(t).y % 2 === 0 ? "II" : "I");

/* ---------- Description d'un jour ---------- */

const FETES_FIXES = {
  "01-01": "Sainte Marie, Mère de Dieu",
  "02-02": "Présentation du Seigneur",
  "03-19": "Saint Joseph, époux de la Vierge Marie",
  "03-25": "Annonciation du Seigneur",
  "06-24": "Nativité de saint Jean-Baptiste",
  "06-29": "Saints Pierre et Paul, apôtres",
  "08-06": "Transfiguration du Seigneur",
  "08-15": "Assomption de la Vierge Marie",
  "09-08": "Nativité de la Vierge Marie",
  "09-14": "La Croix glorieuse",
  "11-01": "Tous les saints (Toussaint)",
  "11-02": "Commémoration de tous les fidèles défunts",
  "12-06": "Saint Nicolas",
  "12-08": "Immaculée Conception de la Vierge Marie",
  "12-25": "Nativité du Seigneur (Noël)",
};

const COULEURS = { violet: "Violet", blanc: "Blanc", vert: "Vert", rouge: "Rouge", rose: "Rose" };

export function infosJour(t) {
  const { y, m, d } = ymd(t);
  const w = dow(t);
  const dim = w === 0;
  const jour = JOURS[w];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const E = paques(y);
  const cendres = E - 46 * DAY;
  const A1 = avent1(y);
  const bapt = bapteme(y);
  const noelDow = dow(utc(y, 12, 25));

  let temps, couleur, titre;

  if (t >= A1 && t <= utc(y, 12, 24)) {
    temps = "Avent";
    couleur = dim && t === A1 + 14 * DAY ? "rose" : "violet";
    const n = Math.floor((t - A1) / (7 * DAY)) + 1;
    titre = dim ? `${ord(n)} dimanche de l'Avent` : (m === 12 && d >= 17 ? `${cap(jour)} ${d} décembre (jours de préparation immédiate à Noël)` : `${cap(jour)} de la ${ordF(n)} semaine de l'Avent`);
  } else if ((m === 12 && d >= 25) || (m === 1 && t <= bapt)) {
    temps = "Noël";
    couleur = "blanc";
    const epi = epiphanie(y);
    if (m === 12 && d === 25) titre = "Nativité du Seigneur (Noël)";
    else if (m === 1 && d === 1) titre = "Sainte Marie, Mère de Dieu";
    else if (m === 12 && dim && d >= 26 && d <= 31) titre = "Sainte Famille de Jésus, Marie et Joseph";
    else if (m === 12 && d === 30 && noelDow === 0) titre = "Sainte Famille de Jésus, Marie et Joseph";
    else if (t === epi) titre = "Épiphanie du Seigneur";
    else if (t === bapt) titre = "Baptême du Seigneur";
    else titre = `${cap(jour)} du temps de Noël`;
  } else if (t >= cendres && t <= E - 3 * DAY) { // jusqu'au jeudi saint inclus
    temps = "Carême";
    couleur = "violet";
    const dim1 = E - 42 * DAY;
    if (t === cendres) { titre = "Mercredi des Cendres"; }
    else if (t < dim1) { titre = `${cap(jour)} après les Cendres`; }
    else if (t === E - 7 * DAY) { titre = "Dimanche des Rameaux et de la Passion"; couleur = "rouge"; }
    else if (t === E - 3 * DAY) { titre = "Jeudi saint"; couleur = "blanc"; }
    else if (t > E - 7 * DAY) { titre = `${cap(jour)} saint`; }
    else {
      const n = Math.floor((t - dim1) / (7 * DAY)) + 1;
      titre = dim ? `${ord(n)} dimanche de Carême` : `${cap(jour)} de la ${ordF(n)} semaine de Carême`;
      if (dim && t === E - 21 * DAY) couleur = "rose"; // Laetare
    }
  } else if (t === E - 2 * DAY) {
    temps = "Triduum pascal"; couleur = "rouge"; titre = "Vendredi saint : Passion du Seigneur";
  } else if (t === E - DAY) {
    temps = "Triduum pascal"; couleur = "blanc"; titre = "Samedi saint : Vigile pascale (pas de messe dans la journée)";
  } else if (t >= E && t <= E + 49 * DAY) {
    temps = "Temps pascal";
    couleur = "blanc";
    const n = Math.floor((t - E) / (7 * DAY)) + 1;
    if (t === E) titre = "Dimanche de Pâques : Résurrection du Seigneur";
    else if (t < E + 7 * DAY) titre = `${cap(jour)} de l'octave de Pâques`;
    else if (t === E + 39 * DAY) titre = "Ascension du Seigneur";
    else if (t === E + 49 * DAY) { titre = "Dimanche de Pentecôte"; couleur = "rouge"; }
    else titre = dim ? `${ord(n)} dimanche de Pâques` : `${cap(jour)} de la ${ordF(n)} semaine de Pâques`;
  } else {
    temps = "Temps ordinaire";
    couleur = "vert";
    let semaine;
    if (t < cendres) {
      const dimBapt = bapt - dow(bapt) * DAY; // dimanche de référence
      semaine = 1 + Math.floor((t - dimBapt) / (7 * DAY));
    } else {
      const dimTemps = t - w * DAY; // dimanche de la semaine en cours
      semaine = 34 - Math.round((A1 - 7 * DAY - dimTemps) / (7 * DAY));
    }
    if (dim && t === E + 56 * DAY) titre = "Sainte Trinité";
    else if (dim && t === E + 63 * DAY) titre = "Saint-Sacrement du Corps et du Sang du Christ";
    else if (t === E + 68 * DAY) titre = "Sacré-Cœur de Jésus";
    else if (dim && t === A1 - 7 * DAY) { titre = "Christ, Roi de l'univers"; }
    else titre = dim ? `${ord(semaine)} dimanche du temps ordinaire` : `${cap(jour)} de la ${ordF(semaine)} semaine du temps ordinaire`;
  }

  const fete = FETES_FIXES[`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`];
  const fetes = [];
  if (fete && !titre.toLowerCase().includes(fete.split(" ")[0].toLowerCase())) fetes.push(fete);

  return {
    date: t,
    titre,
    temps,
    couleur,
    couleurLabel: COULEURS[couleur],
    anneeDimanches: anneeDimanches(t),
    cycleSemaine: temps === "Temps ordinaire" && !dim ? cycleSemaine(t) : null,
    fetes,
  };
}
