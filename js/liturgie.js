/* ==================== LITURGIE DU JOUR ====================
   - Temps liturgique, couleur et année : calculés ici, sans aucun service externe.
   - Lectures de la messe : récupérées chez AELF (api.aelf.org), avec repli sur un lien
     vers aelf.org si le service est indisponible.
*/
import { infosJour, toTime, toISO, libelleDate } from "./liturgie-calc.js";

const AELF_API = (iso) => `https://api.aelf.org/v1/messes/${iso}/france`;
const AELF_PAGE = (iso) => `https://www.aelf.org/${iso}/romain/messe`;

const TITRES_PAR_TYPE = {
  lecture_1: "Première lecture",
  lecture_2: "Deuxième lecture",
  lecture_3: "Troisième lecture",
  psaume: "Psaume",
  cantique: "Cantique",
  evangile: "Évangile",
  sequence: "Séquence",
  acclamation: "Acclamation",
};

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// On ne garde que quelques balises de mise en forme : jamais de script ni d'attribut
const BALISES_OK = new Set(["P", "BR", "EM", "I", "STRONG", "B", "SPAN", "SUP", "SUB", "UL", "OL", "LI"]);
const BALISES_IGNOREES = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE"]);

export function nettoyer(html) {
  const source = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html").body;
  const sortie = document.createElement("div");
  const copier = (de, vers) => {
    for (const n of de.childNodes) {
      if (n.nodeType === 3) {
        vers.appendChild(document.createTextNode(n.nodeValue));
      } else if (n.nodeType === 1) {
        if (BALISES_IGNOREES.has(n.tagName)) continue;
        if (BALISES_OK.has(n.tagName)) {
          const el = document.createElement(n.tagName.toLowerCase());
          copier(n, el);
          vers.appendChild(el);
        } else {
          copier(n, vers); // balise inconnue : on garde le texte, on perd la balise
        }
      }
    }
  };
  copier(source, sortie);
  return sortie.innerHTML;
}

async function chargerLectures(iso) {
  const cle = `aumonerie_aelf_${iso}`;
  try {
    const c = sessionStorage.getItem(cle);
    if (c) return JSON.parse(c);
  } catch { /* stockage indisponible */ }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(AELF_API(iso), { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    try { sessionStorage.setItem(cle, JSON.stringify(data)); } catch { /* ignoré */ }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function rendreLecture(l) {
  const titre = l.titre || TITRES_PAR_TYPE[l.type] || "Lecture";
  const ref = l.ref ? `<span class="lit-ref">${esc(l.ref)}</span>` : "";
  const refrain = l.refrain_psalmique ? `<p class="lit-refrain">${nettoyer(l.refrain_psalmique)}</p>` : "";
  const intro = l.intro_lue ? `<p class="lit-intro muted">${esc(l.intro_lue)}</p>` : "";
  return `
    <article class="lit-lecture">
      <h3>${esc(titre)} ${ref}</h3>
      ${intro}
      ${refrain}
      <div class="lit-texte">${nettoyer(l.contenu)}</div>
    </article>`;
}

function rendreMesse(messe) {
  const lectures = Array.isArray(messe?.lectures) ? messe.lectures : [];
  if (!lectures.length) return `<p class="muted">Aucune lecture disponible pour cette célébration.</p>`;
  return lectures.map(rendreLecture).join("");
}

function afficherInfos(t, aelf) {
  const i = infosJour(t);
  const nomAelf = aelf?.informations?.jour_liturgique_nom;
  const titre = nomAelf || i.titre;
  $("litTitre").textContent = titre;
  $("litDate").textContent = libelleDate(t);
  const chip = $("litCouleur");
  chip.className = `lit-chip lit-chip--${i.couleur}`;
  chip.textContent = `Couleur liturgique : ${i.couleurLabel.toLowerCase()}`;
  const meta = [i.temps, `Année ${i.anneeDimanches} (dimanches)`];
  if (i.cycleSemaine) meta.push(`Semaine : année ${i.cycleSemaine}`);
  $("litMeta").textContent = meta.join(" · ");
  $("litFetes").innerHTML = i.fetes.length ? i.fetes.map((f) => `<li>${esc(f)}</li>`).join("") : "";
  $("litFetes").classList.toggle("hidden", !i.fetes.length);
  document.title = `Liturgie du jour : ${titre}`;
}

let courant = null; // minuit UTC en ms

async function afficher(t) {
  courant = t;
  const iso = toISO(t);
  $("litPick").value = iso;
  history.replaceState(null, "", `${location.pathname}?date=${iso}`);
  afficherInfos(t, null);

  const zone = $("litLectures");
  const onglets = $("litMesses");
  onglets.innerHTML = "";
  zone.innerHTML = `<p class="muted">Chargement des lectures…</p>`;
  $("litAelf").href = AELF_PAGE(iso);

  try {
    const data = await chargerLectures(iso);
    if (courant !== t) return; // l'utilisateur a changé de jour entre-temps
    afficherInfos(t, data);
    const messes = Array.isArray(data?.messes) ? data.messes : [];
    if (!messes.length) throw new Error("aucune messe dans la réponse");
    const montrer = (k) => {
      zone.innerHTML = rendreMesse(messes[k]);
      onglets.querySelectorAll("button").forEach((b, j) => b.classList.toggle("is-active", j === k));
    };
    if (messes.length > 1) {
      onglets.innerHTML = messes.map((m, k) => `<button type="button" class="btn btn--small btn--ghost" data-messe="${k}">${esc(m.nom || `Messe ${k + 1}`)}</button>`).join("");
      onglets.onclick = (e) => { const b = e.target.closest("[data-messe]"); if (b) montrer(Number(b.dataset.messe)); };
    }
    montrer(0);
  } catch (e) {
    console.warn("Lectures indisponibles :", e);
    if (courant !== t) return;
    zone.innerHTML = `<div class="notice">Les lectures n'ont pas pu être chargées pour le moment.
      <a class="link" href="${esc(AELF_PAGE(iso))}" target="_blank" rel="noopener">Les consulter directement sur aelf.org</a>.</div>`;
  }
}

function decaler(jours) {
  afficher(courant + jours * 86400000);
}

function init() {
  if (!$("litLectures")) return;
  const p = new URLSearchParams(location.search).get("date");
  const maintenant = new Date();
  const aujourdhui = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const t0 = Number.isNaN(toTime(p || "")) ? aujourdhui : toTime(p);
  $("litPrev").addEventListener("click", () => decaler(-1));
  $("litNext").addEventListener("click", () => decaler(1));
  $("litToday").addEventListener("click", () => afficher(aujourdhui));
  $("litPick").addEventListener("change", (e) => {
    const t = toTime(e.target.value);
    if (!Number.isNaN(t)) afficher(t);
  });
  afficher(t0);
}

init();
