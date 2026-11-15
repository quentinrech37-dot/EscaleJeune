/* ==================== PLANIFICATEUR DE PÈLERINAGE ====================
   Étapes, repas, budget, tâches et matériel pour un groupe qui marche plusieurs jours.
   Tout se calcule dans le navigateur ; le lien partagé contient la configuration.
*/
import { formater } from "./cuisine-calc.js";
import {
  ALLURES_NOMS, etape, eauParJour, formatH, lirePrenoms, lireTentes, repartirTaches,
  besoinsNourriture, repartirMateriel, budget,
} from "./pelerinage-calc.js";
import { eventsToICS, downloadText } from "./agenda.js";

const KEY = "aumonerie_pelerinage_v1";
const KEY_COCHES = "aumonerie_pelerinage_coches_v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const eur = (x) => `${nf.format(Math.round(x * 100) / 100)} €`;

const DEFAUT = {
  prenoms: "", tentes: "", jours: 3, date: "", depart: "08:00", allure: "normal", pauses: 90, chaleur: "normal",
  etapes: [], rechaud: false, painFourni: false, soupeFournie: false, budget: 25, inscription: 40, essence: 0, seed: 0,
};

let DATA = null;
let S = JSON.parse(JSON.stringify(DEFAUT));
let coches = {};

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
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

function sauver() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignoré */ }
  try {
    const url = new URL(location.href);
    url.searchParams.set("p", encoder(S));
    history.replaceState(null, "", url);
  } catch { /* ignoré */ }
}

function charger() {
  let e = null;
  try {
    const p = new URLSearchParams(location.search).get("p");
    if (p) e = decoder(p);
  } catch { e = null; }
  if (!e) { try { e = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { e = null; } }
  if (e && typeof e === "object") S = { ...DEFAUT, ...e, etapes: Array.isArray(e.etapes) ? e.etapes : [] };
  try { coches = JSON.parse(localStorage.getItem(KEY_COCHES) || "{}") || {}; } catch { coches = {}; }
}

function sauverCoches() {
  try { localStorage.setItem(KEY_COCHES, JSON.stringify(coches)); } catch { /* ignoré */ }
}

function flash(msg) {
  const f = $("flash");
  f.textContent = msg;
  f.classList.remove("hidden");
  clearTimeout(flash._t);
  flash._t = setTimeout(() => f.classList.add("hidden"), 2600);
}

/* ---------- Lecture du formulaire ---------- */

const nombre = (v, min, max, def) => {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

function ajusterEtapes() {
  while (S.etapes.length < S.jours) S.etapes.push({ nom: "", km: 20, dplus: 0 });
  S.etapes.length = S.jours;
}

function lireFormulaire() {
  S.prenoms = $("pePrenoms").value;
  S.tentes = $("peTentes").value;
  S.jours = Math.round(nombre($("peJours").value, 1, 14, 3));
  S.date = /^\d{4}-\d{2}-\d{2}$/.test($("peDate").value) ? $("peDate").value : "";
  S.depart = /^\d{1,2}:\d{2}$/.test($("peDepart").value) ? $("peDepart").value : "08:00";
  S.allure = $("peAllure").value;
  S.pauses = Math.round(nombre($("pePauses").value, 0, 480, 90));
  S.chaleur = $("peChaleur").value === "chaud" ? "chaud" : "normal";
  S.rechaud = $("peRechaud").checked;
  S.painFourni = $("pePainFourni").checked;
  S.soupeFournie = $("peSoupeFournie").checked;
  S.budget = nombre($("peBudget").value, 0, 500, 25);
  S.inscription = nombre($("peInscription").value, 0, 1000, 40);
  S.essence = nombre($("peEssence").value, 0, 5000, 0);
  ajusterEtapes();
  document.querySelectorAll("[data-etape]").forEach((row) => {
    const i = Number(row.dataset.etape);
    if (!S.etapes[i]) return;
    S.etapes[i].nom = row.querySelector("[data-champ='nom']").value;
    S.etapes[i].km = nombre(row.querySelector("[data-champ='km']").value, 0, 80, 0);
    S.etapes[i].dplus = nombre(row.querySelector("[data-champ='dplus']").value, 0, 5000, 0);
  });
}

function remplirFormulaire() {
  $("pePrenoms").value = S.prenoms;
  $("peTentes").value = S.tentes;
  $("peJours").value = S.jours;
  $("peDate").value = S.date;
  $("peDepart").value = S.depart;
  $("peAllure").value = S.allure;
  $("pePauses").value = S.pauses;
  $("peChaleur").value = S.chaleur;
  $("peRechaud").checked = S.rechaud;
  $("pePainFourni").checked = S.painFourni;
  $("peSoupeFournie").checked = S.soupeFournie;
  $("peBudget").value = S.budget;
  $("peInscription").value = S.inscription;
  $("peEssence").value = S.essence || "";
  dessinerEtapes();
}

function dessinerEtapes() {
  ajusterEtapes();
  $("peEtapes").innerHTML = S.etapes.map((e, i) => `
    <div class="pe-etape" data-etape="${i}">
      <strong>Jour ${i + 1}</strong>
      <input class="input" data-champ="nom" type="text" placeholder="Étape (facultatif)" value="${esc(e.nom)}" aria-label="Nom de l'étape ${i + 1}">
      <label>km <input class="input input--n" data-champ="km" type="number" min="0" step="0.5" inputmode="decimal" value="${e.km}"></label>
      <label>D+ (m) <input class="input input--n" data-champ="dplus" type="number" min="0" step="50" inputmode="numeric" value="${e.dplus || ""}" placeholder="0"></label>
    </div>`).join("");
}

/* ---------- Calculs ---------- */

function modele() {
  const prenoms = lirePrenoms(S.prenoms);
  const nb = prenoms.length;
  const etapes = S.etapes.map((e, i) => ({ ...e, ...etape(e.km, e.dplus, S.allure, S.pauses, S.depart), jour: i + 1 }));
  const km = etapes.reduce((s, e) => s + e.km, 0);
  const aliments = DATA.aliments;
  const nourriture = besoinsNourriture(aliments, nb, S.jours, { rechaud: S.rechaud, painFourni: S.painFourni, soupeFournie: S.soupeFournie });
  const bud = budget(nourriture.total, nb, S.inscription, S.essence);
  const taches = repartirTaches(prenoms, S.jours, DATA.taches, S.seed);
  const materiel = repartirMateriel(prenoms, DATA.paquetage.collectif, S.seed);
  const tentes = lireTentes(S.tentes);
  const places = tentes.reduce((a, b) => a + b, 0);
  return { prenoms, nb, etapes, km, nourriture, bud, taches, materiel, tentes, places };
}

function ajouterJours(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/* ---------- Rendu ---------- */

function rendreResume(M) {
  const dureeMoy = M.etapes.length ? M.etapes.reduce((s, e) => s + e.marche, 0) / M.etapes.length : 0;
  return `<div class="stats">
    <div class="stat"><strong>${M.nb}</strong><span>marcheur${M.nb > 1 ? "s" : ""}</span></div>
    <div class="stat"><strong>${nf.format(M.km)} km</strong><span>sur ${S.jours} jour${S.jours > 1 ? "s" : ""}</span></div>
    <div class="stat"><strong>${esc(formatH(dureeMoy))}</strong><span>de marche par jour</span></div>
    <div class="stat"><strong>${eur(M.bud.total)}</strong><span>par personne, tout compris</span></div>
  </div>`;
}

function rendreEtapes(M) {
  const lignes = M.etapes.map((e) => {
    const eau = eauParJour(e.marche, S.chaleur);
    const date = S.date ? ajouterJours(S.date, e.jour - 1) : "";
    return `<tr><td>${e.jour}${date ? `<small class="muted"><br>${esc(date.split("-").reverse().join("/"))}</small>` : ""}</td>
      <td>${esc(e.nom || "")}</td><td>${nf.format(e.km)}</td><td>${e.dplus ? nf.format(e.dplus) : "0"}</td>
      <td>${esc(formatH(e.marche))}</td><td>${esc(S.depart)}</td><td><strong>${esc(e.arrivee)}</strong></td><td>${nf.format(Math.round(eau * 10) / 10)} L</td></tr>`;
  }).join("");
  return `<h2>Les étapes</h2>
    <div class="tr-table-wrap"><table class="tr-table"><thead><tr><th>Jour</th><th>Étape</th><th>km</th><th>D+</th><th>Marche</th><th>Départ</th><th>Arrivée</th><th>Eau à boire</th></tr></thead><tbody>${lignes}</tbody></table></div>
    <p class="muted">Allure : ${esc(ALLURES_NOMS[S.allure] || "")}, plus une heure par 600 m de montée, et ${S.pauses} min de pauses par jour. L'arrivée est une estimation : gardez une marge de 10 à 15 %. L'eau à boire est par personne et par jour ; on n'en porte qu'environ 1,5 à 2 L à la fois en repérant les points d'eau.</p>`;
}

function rendreHebergement(M) {
  if (!M.tentes.length) return "";
  const ok = M.places >= M.nb;
  return `<h2>Couchage</h2>
    <p class="${ok ? "" : "tr-alerte"}">${M.tentes.length} tente${M.tentes.length > 1 ? "s" : ""} (${M.tentes.join(" + ")} places) : ${M.places} place${M.places > 1 ? "s" : ""} pour ${M.nb} personne${M.nb > 1 ? "s" : ""}. ${ok ? (M.places > M.nb ? `Il reste ${M.places - M.nb} place${M.places - M.nb > 1 ? "s" : ""} de marge.` : "Compte exact.") : `Il manque ${M.nb - M.places} place${M.nb - M.places > 1 ? "s" : ""}.`}</p>`;
}

function rendreCourses(M) {
  const parRayon = {};
  M.nourriture.lignes.forEach((l) => { (parRayon[l.rayon] ||= []).push(l); });
  const blocs = Object.keys(parRayon).sort().map((r) => `
    <div class="rayon"><h3>${esc(r)}</h3><ul class="courses">${parRayon[r].map((l) => {
    const id = `c:${l.id}`;
    return `<li class="${coches[id] ? "is-done" : ""}"><label><input type="checkbox" data-coche="${esc(id)}" ${coches[id] ? "checked" : ""}> <span class="courses__nom">${esc(l.nom)}</span></label>
      <span class="courses__qte">${esc(formater(l.unite, l.qte))}</span><span class="courses__cout">${eur(l.cout)}</span></li>`;
  }).join("")}</ul></div>`).join("");
  const conseils = [];
  if (!S.rechaud) conseils.push("Sans réchaud, les repas sont froids : pain, pâté, fromage, saucisson et crudités.");
  if (S.painFourni) conseils.push("Le pain est fourni : il n'est pas compté.");
  return `<h2>Repas et courses</h2>
    <p class="muted">Quantités par personne et par jour pour toute la durée, ${M.nb} personnes. ${conseils.join(" ")}</p>
    ${blocs}<p><strong>Total : ${eur(M.nourriture.total)}</strong> (${eur(M.nourriture.total / Math.max(1, M.nb))} par personne).</p>`;
}

function rendreBudget(M) {
  const ecart = S.budget - M.bud.nourriture;
  return `<h2>Budget par personne</h2>
    <ul class="pe-budget">
      <li><span>Nourriture</span><strong>${eur(M.bud.nourriture)}</strong></li>
      <li><span>Inscription au pèlerinage</span><strong>${eur(M.bud.inscription)}</strong></li>
      <li><span>Part de l'essence</span><strong>${eur(M.bud.essence)}</strong></li>
      <li class="pe-budget__total"><span>Total</span><strong>${eur(M.bud.total)}</strong></li>
    </ul>
    <p class="${ecart < 0 ? "tr-alerte" : "muted"}">Budget de nourriture prévu : ${eur(S.budget)} par personne, soit ${ecart >= 0 ? `une marge de ${eur(ecart)}` : `un dépassement de ${eur(-ecart)}`}.</p>`;
}

function rendreTaches(M) {
  if (!M.nb) return "";
  const entete = DATA.taches.map((t) => `<th>${esc(t)}</th>`).join("");
  const lignes = M.taches.grille.map((ligne, j) => `<tr><td>Jour ${j + 1}</td>${ligne.map((p) => `<td>${esc(p)}</td>`).join("")}</tr>`).join("");
  const compte = Object.entries(M.taches.compte).map(([p, c]) => `${esc(p)} : ${c}`).join(", ");
  return `<h2>Qui fait quoi</h2>
    <div class="tr-table-wrap"><table class="tr-table pe-taches"><thead><tr><th></th>${entete}</tr></thead><tbody>${lignes}</tbody></table></div>
    <p class="muted">Répartition équitable (nombre de tâches par personne : ${compte}).</p>
    <p><button type="button" id="peMelanger" class="btn btn--ghost btn--small">Mélanger la répartition</button></p>`;
}

function rendreMateriel(M) {
  if (!M.nb) return "";
  return `<h2>Matériel collectif</h2>
    <ul class="pe-materiel">${M.materiel.map((m) => {
    const id = `m:${m.objet}`;
    return `<li class="${coches[id] ? "is-done" : ""}"><label><input type="checkbox" data-coche="${esc(id)}" ${coches[id] ? "checked" : ""}> ${esc(m.objet)}</label><span class="pe-qui">${esc(m.qui)}</span></li>`;
  }).join("")}</ul>`;
}

function rendrePaquetage() {
  return `<h2>Paquetage individuel</h2>
    <details class="outils-details" open><summary>Liste à cocher</summary>
    ${DATA.paquetage.individuel.map((g) => `<div class="rayon"><h3>${esc(g.cat)}</h3><ul class="courses pe-paquetage">${g.items.map((it) => {
    const id = `i:${it}`;
    return `<li class="${coches[id] ? "is-done" : ""}"><label><input type="checkbox" data-coche="${esc(id)}" ${coches[id] ? "checked" : ""}> <span class="courses__nom">${esc(it)}</span></label></li>`;
  }).join("")}</ul></div>`).join("")}</details>`;
}

function rendre() {
  const zone = $("peResultats");
  const M = modele();
  if (!M.nb) {
    zone.innerHTML = `<p class="notice">Ajoutez au moins un prénom pour voir le planning, les courses et la répartition des tâches.</p>`;
    $("peActions").classList.add("hidden");
    return;
  }
  $("peActions").classList.remove("hidden");
  zone.innerHTML = [
    rendreResume(M), rendreEtapes(M), rendreHebergement(M), rendreCourses(M), rendreBudget(M),
    rendreTaches(M), rendreMateriel(M), rendrePaquetage(),
    `<h2>Conseils</h2><ul>${DATA.astuces.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`,
  ].join("");
  // Pré-remplir l'ensemble des données de prix dans le lien
  sauver();
}

/* ---------- Résumé texte et agenda ---------- */

function texteResume() {
  const M = modele();
  let t = `Pèlerinage : ${M.nb} marcheurs, ${S.jours} jours, ${nf.format(M.km)} km\n\nÉtapes :\n`;
  M.etapes.forEach((e) => {
    t += `Jour ${e.jour}${e.nom ? ` (${e.nom})` : ""} : ${nf.format(e.km)} km, départ ${S.depart}, arrivée vers ${e.arrivee}\n`;
  });
  t += `\nQui fait quoi :\n`;
  M.taches.grille.forEach((ligne, j) => {
    t += `Jour ${j + 1} : ${DATA.taches.map((tache, k) => `${tache} (${ligne[k]})`).join(", ")}\n`;
  });
  t += `\nBudget : ${eur(M.bud.total)} par personne (nourriture ${eur(M.bud.nourriture)}, inscription ${eur(M.bud.inscription)}, essence ${eur(M.bud.essence)}).\n`;
  t += `\nCourses :\n${M.nourriture.lignes.map((l) => `- ${l.nom} : ${formater(l.unite, l.qte)}`).join("\n")}\n`;
  return t;
}

function exporterAgenda() {
  if (!S.date) { flash("Indiquez la date de départ pour exporter vers l'agenda."); return; }
  const M = modele();
  const evenements = M.etapes.map((e) => ({
    date: ajouterJours(S.date, e.jour - 1),
    heure: S.depart,
    duree: Math.round(e.totalMin),
    type: "sortie",
    titre: `Pèlerinage, jour ${e.jour}${e.nom ? ` : ${e.nom}` : ""} (${nf.format(e.km)} km)`,
    details: `Marche estimée : ${formatH(e.marche)}. Arrivée vers ${e.arrivee}.\nTâches : ${DATA.taches.map((t, k) => `${t} (${M.taches.grille[e.jour - 1][k]})`).join(", ")}`,
  }));
  downloadText("pelerinage.ics", eventsToICS(evenements));
}

async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; } catch { return false; }
}

/* ---------- Initialisation ---------- */

async function init() {
  if (!$("pePrenoms")) return;
  try {
    const r = await fetch("/data/pelerinage.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
  } catch (e) {
    console.error(e);
    $("peResultats").innerHTML = `<p class="muted">Données indisponibles.</p>`;
    return;
  }
  charger();
  $("peAllure").innerHTML = Object.entries(ALLURES_NOMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  remplirFormulaire();
  rendre();

  const racine = document.querySelector("main");
  racine.addEventListener("input", (e) => {
    if (e.target.closest("#peResultats")) return;
    if (e.target.id === "peJours") {
      lireFormulaire();
      dessinerEtapes();
    } else {
      lireFormulaire();
    }
    rendre();
  });
  racine.addEventListener("change", (e) => {
    const c = e.target.closest("[data-coche]");
    if (!c) return;
    const id = c.dataset.coche;
    if (c.checked) coches[id] = true; else delete coches[id];
    sauverCoches();
    c.closest("li").classList.toggle("is-done", c.checked);
  });
  racine.addEventListener("click", (e) => {
    if (e.target.id === "peMelanger") {
      S.seed = Math.floor(Math.random() * 1e9) + 1;
      rendre();
    }
  });

  $("peCopier").addEventListener("click", async () => flash((await copier(texteResume())) ? "Résumé copié." : "Copie impossible."));
  $("peLien").addEventListener("click", async () => { sauver(); flash((await copier(location.href)) ? "Lien copié." : "Copie impossible : copiez l'adresse du navigateur."); });
  $("peIcs").addEventListener("click", exporterAgenda);
  $("peImprimer").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", () => document.querySelectorAll("#peResultats details").forEach((d) => { d.open = true; }));
  $("peRaz").addEventListener("click", () => {
    if (!confirm("Tout effacer (groupe, étapes et cases cochées) ?")) return;
    S = JSON.parse(JSON.stringify(DEFAUT)); coches = {};
    try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_COCHES); } catch { /* ignoré */ }
    remplirFormulaire(); rendre();
    history.replaceState(null, "", location.pathname);
  });
}

init();
