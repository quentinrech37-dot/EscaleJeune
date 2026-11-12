/* ==================== CUISINER POUR LA TABLÉE ====================
   Met à l'échelle des recettes (50, 60, 70 personnes ou un autre nombre),
   regroupe la liste de courses par rayon et estime le budget.
   Données : /data/recettes.json (quantités pour 10 convives).
*/

const KEY_PRIX = "aumonerie_cuisine_prix_v1";
const KEY_COCHES = "aumonerie_cuisine_coches_v1";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const state = {
  n: 70,
  appetit: 1,
  recettes: new Set(),
  prix: {},
  coches: {},
  filtre: "tous",
};
let DATA = null;

import { arrondir, formater, coutLigne, agregerCourses } from "./cuisine-calc.js";

/* ---------- Stockage local (facultatif) ---------- */

function lire(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
}
function ecrire(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch { /* navigation privée : on ignore */ }
}

/* ---------- Utilitaires ---------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const facteur = () => (state.n / 10) * state.appetit;

const prixDe = (key) => {
  const v = state.prix[key];
  return Number.isFinite(v) ? v : DATA.ingredients[key].prix;
};

/* ---------- Calculs ---------- */

function recettesChoisies() {
  return DATA.recettes.filter((r) => state.recettes.has(r.id));
}

function courses() {
  const brut = agregerCourses(recettesChoisies(), facteur(), DATA.ingredients);
  const lignes = Object.entries(brut).map(([k, q]) => {
    const ing = DATA.ingredients[k];
    const qte = arrondir(ing.unite, q);
    return { key: k, nom: ing.nom, unite: ing.unite, rayon: ing.rayon, qte, cout: coutLigne(ing.unite, qte, prixDe(k)) };
  });
  const total = lignes.reduce((s, l) => s + l.cout, 0);
  return { lignes, total };
}

/* ---------- Rendu ---------- */

const NIVEAUX = { 1: "Facile", 2: "Moyen", 3: "Difficile" };
const FILTRES = [
  ["tous", "Tout"],
  ["terroir", "Terroir"],
  ["facile", "Facile"],
  ["eco", "Peu cher"],
];

// Coût par personne aux prix actuels (non arrondis, indicatif)
function coutParPersonne(r) {
  const total = r.lignes.reduce((s, [k, q]) => {
    const ing = DATA.ingredients[k];
    return s + (ing.unite === "pc" ? q * prixDe(k) : (q / 1000) * prixDe(k));
  }, 0);
  return total / r.pour;
}

function correspond(r) {
  const f = state.filtre;
  if (f === "terroir") return (r.tags || []).includes("terroir");
  if (f === "facile") return r.difficulte === 1;
  if (f === "eco") return (r.tags || []).includes("economique");
  return true;
}

function renderChoixMenu() {
  const box = document.getElementById("menuChoix");
  const barre = `
    <div class="seg menu-filtres" role="group" aria-label="Filtrer les recettes">
      ${FILTRES.map(([id, nom]) => `<button type="button" class="btn btn--small ${state.filtre === id ? "is-active" : ""}" data-filtre="${id}">${nom}</button>`).join("")}
    </div>`;
  const groupes = DATA.categories.map((c) => {
    // une recette déjà choisie reste visible même si le filtre l'écarte
    const items = DATA.recettes.filter((r) => r.categorie === c.id && (correspond(r) || state.recettes.has(r.id)));
    if (!items.length) return "";
    return `
      <fieldset class="menu-groupe">
        <legend>${esc(c.nom)}</legend>
        <div class="menu-groupe__items">
          ${items.map((r) => `
            <label class="menu-choix">
              <input type="checkbox" data-recette="${esc(r.id)}" ${state.recettes.has(r.id) ? "checked" : ""}>
              <span>${esc(r.nom)}
                <small class="menu-choix__meta">${NIVEAUX[r.difficulte] || ""} · env. ${nf.format(coutParPersonne(r))} € par pers.</small>
              </span>
            </label>`).join("")}
        </div>
      </fieldset>`;
  }).join("");
  box.innerHTML = barre + (groupes || `<p class="muted">Aucune recette ne correspond à ce filtre.</p>`);
}

function renderBoutonsN() {
  document.querySelectorAll("[data-n]").forEach((b) => {
    b.classList.toggle("is-active", Number(b.dataset.n) === state.n);
  });
  const input = document.getElementById("nAutre");
  if (input && ![50, 60, 70].includes(state.n)) input.value = state.n;
  else if (input) input.value = "";
}

function renderResultats() {
  const zone = document.getElementById("resultats");
  const choisies = recettesChoisies();
  if (!choisies.length) {
    zone.classList.add("hidden");
    return;
  }
  zone.classList.remove("hidden");

  const { lignes, total } = courses();

  // Résumé
  document.getElementById("resume").innerHTML = `
    <div class="stat"><span class="stat__v">${state.n}</span><span class="stat__l">convives</span></div>
    <div class="stat"><span class="stat__v">${choisies.length}</span><span class="stat__l">recette${choisies.length > 1 ? "s" : ""}</span></div>
    <div class="stat"><span class="stat__v">${eur.format(total)}</span><span class="stat__l">budget estimé</span></div>
    <div class="stat"><span class="stat__v">${eur.format(total / state.n)}</span><span class="stat__l">par personne</span></div>`;

  // Liste de courses par rayon
  const parRayon = {};
  for (const l of lignes) (parRayon[l.rayon] ||= []).push(l);
  const html = DATA.rayons.filter((r) => parRayon[r]).map((rayon) => `
    <section class="rayon">
      <h3>${esc(rayon)}</h3>
      <ul class="courses">
        ${parRayon[rayon].sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((l) => `
          <li class="${state.coches[l.key] ? "is-done" : ""}">
            <label>
              <input type="checkbox" data-coche="${esc(l.key)}" ${state.coches[l.key] ? "checked" : ""}>
              <span class="courses__nom">${esc(l.nom)}</span>
            </label>
            <span class="courses__qte">${esc(formater(l.unite, l.qte))}</span>
            <span class="courses__cout muted">${eur.format(l.cout)}</span>
          </li>`).join("")}
      </ul>
    </section>`).join("");
  document.getElementById("listeCourses").innerHTML = html;

  // Détail par recette
  const f = facteur();
  document.getElementById("detailRecettes").innerHTML = choisies.map((r) => {
    const ligs = r.lignes.map(([k, q]) => {
      const ing = DATA.ingredients[k];
      return `<li><span>${esc(ing.nom)}</span><span>${esc(formater(ing.unite, arrondir(ing.unite, q * f)))}</span></li>`;
    }).join("");
    const mats = (r.materiel || []).map((m) => {
      if (m.litres_par_10) return `<li>Environ ${nf.format(Math.ceil((m.litres_par_10 * state.n) / 10))} ${esc(m.label)}</li>`;
      if (m.par > 0) return `<li>${Math.ceil(state.n / m.par)} ${esc(m.label)}</li>`;
      return "";
    }).join("");
    const plan = (r.planning || []).map((p) => `<li>${esc(p)}</li>`).join("");
    const astuces = (r.astuces || []).map((p) => `<li>${esc(p)}</li>`).join("");
    return `
      <details class="item recette">
        <summary class="item__summary"><h3>${esc(r.nom)}</h3><span class="muted">pour ${state.n} personnes</span></summary>
        <div class="item__details">
          <h4>Ingrédients</h4><ul class="ing">${ligs}</ul>
          ${mats ? `<h4>Matériel</h4><ul>${mats}</ul>` : ""}
          ${plan ? `<h4>Organisation</h4><ul>${plan}</ul>` : ""}
          ${astuces ? `<h4>Astuces</h4><ul>${astuces}</ul>` : ""}
        </div>
      </details>`;
  }).join("");

  // Réglage des prix
  document.getElementById("prixTable").innerHTML = lignes
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((l) => {
      const u = l.unite === "pc" ? "€ / pièce" : l.unite === "g" ? "€ / kg" : "€ / L";
      return `<label class="prix-ligne"><span>${esc(l.nom)}</span>
        <span><input type="number" min="0" step="0.05" value="${prixDe(l.key)}" data-prix="${esc(l.key)}"> ${u}</span></label>`;
    }).join("");
}

/* ---------- Texte partageable ---------- */

function texteCourses() {
  const { lignes, total } = courses();
  const noms = recettesChoisies().map((r) => r.nom).join(", ");
  const parRayon = {};
  for (const l of lignes) (parRayon[l.rayon] ||= []).push(l);
  let t = `Courses pour ${state.n} personnes\nMenu : ${noms}\n`;
  for (const rayon of DATA.rayons) {
    if (!parRayon[rayon]) continue;
    t += `\n${rayon}\n`;
    for (const l of parRayon[rayon].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))) {
      t += `- ${l.nom} : ${formater(l.unite, l.qte)}\n`;
    }
  }
  t += `\nBudget estimé : ${eur.format(total)} (${eur.format(total / state.n)} par personne)\n`;
  return t;
}

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = texte;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* rien */ }
    ta.remove();
    return ok;
  }
}

function flash(msg) {
  const el = document.getElementById("flash");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(flash._t);
  flash._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

/* ---------- URL partageable ---------- */

function majURL() {
  const p = new URLSearchParams();
  p.set("n", state.n);
  if (state.recettes.size) p.set("r", [...state.recettes].join(","));
  if (state.appetit !== 1) p.set("a", state.appetit);
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

function lireURL() {
  const p = new URLSearchParams(location.search);
  const n = Number(p.get("n"));
  if (Number.isFinite(n) && n >= 4 && n <= 300) state.n = Math.round(n);
  const a = Number(p.get("a"));
  if ([0.85, 1, 1.15].includes(a)) state.appetit = a;
  const ids = new Set(DATA.recettes.map((r) => r.id));
  (p.get("r") || "").split(",").filter((x) => ids.has(x)).forEach((x) => state.recettes.add(x));
}

function tout() {
  renderChoixMenu();
  renderBoutonsN();
  renderResultats();
  majURL();
}

/* ---------- Initialisation ---------- */

async function init() {
  const root = document.getElementById("menuChoix");
  if (!root) return;
  try {
    const r = await fetch("/data/recettes.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
  } catch (e) {
    console.error(e);
    root.innerHTML = `<p class="muted">Données indisponibles.</p>`;
    return;
  }

  state.prix = lire(KEY_PRIX);
  state.coches = lire(KEY_COCHES);
  lireURL();

  document.getElementById("appetit").value = String(state.appetit);
  renderChoixMenu();
  tout();

  // Nombre de convives
  document.querySelectorAll("[data-n]").forEach((b) =>
    b.addEventListener("click", () => { state.n = Number(b.dataset.n); tout(); })
  );
  document.getElementById("nAutre").addEventListener("input", (e) => {
    const n = Math.round(Number(e.target.value));
    if (Number.isFinite(n) && n >= 4 && n <= 300) { state.n = n; renderResultats(); majURL(); document.querySelectorAll("[data-n]").forEach((b) => b.classList.remove("is-active")); }
  });
  document.getElementById("appetit").addEventListener("change", (e) => {
    state.appetit = Number(e.target.value);
    tout();
  });

  // Choix des recettes
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtre]");
    if (!b) return;
    state.filtre = b.dataset.filtre;
    renderChoixMenu();
  });
  root.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-recette]");
    if (!cb) return;
    cb.checked ? state.recettes.add(cb.dataset.recette) : state.recettes.delete(cb.dataset.recette);
    tout();
  });

  // Cases à cocher « acheté » et réglage des prix (délégation)
  document.getElementById("resultats").addEventListener("change", (e) => {
    const c = e.target.closest("[data-coche]");
    if (c) {
      state.coches[c.dataset.coche] = c.checked;
      ecrire(KEY_COCHES, state.coches);
      c.closest("li").classList.toggle("is-done", c.checked);
      return;
    }
    const p = e.target.closest("[data-prix]");
    if (p) {
      const v = Number(p.value);
      if (Number.isFinite(v) && v >= 0) {
        state.prix[p.dataset.prix] = v;
        ecrire(KEY_PRIX, state.prix);
        const y = window.scrollY;
        const focusKey = p.dataset.prix;
        // on ne redessine que les chiffres pour ne pas perdre le focus
        const { total, lignes } = courses();
        document.querySelectorAll(".courses li").forEach((li) => {
          const k = li.querySelector("[data-coche]")?.dataset.coche;
          const l = lignes.find((x) => x.key === k);
          if (l) li.querySelector(".courses__cout").textContent = eur.format(l.cout);
        });
        const vals = document.querySelectorAll("#resume .stat__v");
        if (vals[2]) vals[2].textContent = eur.format(total);
        if (vals[3]) vals[3].textContent = eur.format(total / state.n);
        window.scrollTo(0, y);
        void focusKey;
      }
    }
  });

  // Actions
  document.getElementById("btnCopier").addEventListener("click", async () => {
    flash((await copier(texteCourses())) ? "Liste copiée." : "Copie impossible.");
  });
  document.getElementById("btnLien").addEventListener("click", async () => {
    flash((await copier(location.href)) ? "Lien copié : il rouvre ce même menu." : "Copie impossible.");
  });
  document.getElementById("btnPartager").addEventListener("click", async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `Courses pour ${state.n} personnes`, text: texteCourses() }); } catch { /* annulé */ }
    } else {
      flash((await copier(texteCourses())) ? "Liste copiée." : "Partage indisponible.");
    }
  });
  document.getElementById("btnImprimer").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", () => document.querySelectorAll("#resultats details").forEach((d) => { d.open = true; }));
  document.getElementById("btnRaz").addEventListener("click", () => {
    state.coches = {};
    ecrire(KEY_COCHES, state.coches);
    renderResultats();
  });
  document.getElementById("btnPrixRaz").addEventListener("click", () => {
    state.prix = {};
    ecrire(KEY_PRIX, state.prix);
    renderResultats();
  });
}

init();
