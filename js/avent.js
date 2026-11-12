/* ==================== CALENDRIER DE L'AVENT ====================
   Une petite case par jour, du 1er dimanche de l'Avent à la veille de Noël.
   Une case ne s'ouvre pas avant son jour (sauf ?test=1, pour prévisualiser).
   Contenu : /data/avent.json, indexé par « nombre de jours avant Noël ».
*/
import { avent1, toISO, libelleDate } from "./liturgie-calc.js";
import { eventsToICS, downloadText } from "./agenda.js";

const DAY = 86400000;
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function lire(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]") || []; } catch { return []; }
}
function ecrire(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignoré */ }
}

const ord = (n) => (n === 1 ? "1er" : `${n}e`);

function bougies(nb) {
  const une = (i) => {
    const allumee = i < nb;
    const rose = i === 2;
    const cire = rose ? "#e9a3bd" : "#6b4fa0";
    return `
      <g transform="translate(${20 + i * 44}, 0)">
        ${allumee ? `<ellipse cx="8" cy="12" rx="6" ry="10" fill="#fbbf24"/><ellipse cx="8" cy="14" rx="3" ry="6" fill="#fff7d6"/>` : ""}
        <rect x="0" y="24" width="16" height="56" rx="3" fill="${cire}"/>
        <rect x="7" y="20" width="2" height="6" fill="#333"/>
      </g>`;
  };
  return `<svg viewBox="0 0 200 90" width="200" height="90" role="img" aria-label="${nb} bougie${nb > 1 ? "s" : ""} allumée${nb > 1 ? "s" : ""} sur 4">
    <rect x="6" y="78" width="188" height="8" rx="4" fill="#8b6b3d"/>
    ${[0, 1, 2, 3].map(une).join("")}
  </svg>`;
}

async function init() {
  const grille = $("aventGrille");
  if (!grille) return;

  let DATA;
  try {
    const r = await fetch("/data/avent.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
  } catch (e) {
    console.error(e);
    grille.innerHTML = `<p class="muted">Données indisponibles.</p>`;
    return;
  }

  const params = new URLSearchParams(location.search);
  const test = params.get("test") === "1";
  const maintenant = new Date();
  const aujourdhui = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const annee = Number(params.get("annee")) || maintenant.getFullYear();
  const A1 = avent1(annee);
  const noel = Date.UTC(annee, 11, 25);
  const nbJours = Math.round((noel - A1) / DAY); // de A1 à la veille de Noël inclus

  const KEY = `aumonerie_avent_ouverts_${annee}`;
  let ouverts = new Set(lire(KEY));

  // Les jours
  const jours = [];
  for (let k = 0; k < nbJours; k++) {
    const t = A1 + k * DAY;
    const n = Math.round((noel - t) / DAY); // jours avant Noël
    const contenu = DATA.jours[String(n)] || { geste: "", intention: "" };
    const dim = new Date(t).getUTCDay() === 0;
    const noDim = dim ? Math.round((t - A1) / (7 * DAY)) : -1;
    jours.push({ t, iso: toISO(t), n, k, dim, noDim, ...contenu });
  }

  const dispo = (j) => test || j.t <= aujourdhui;

  // En-tête : compte à rebours, bougies
  const apres = aujourdhui >= noel;
  const avant = aujourdhui < A1;
  const dimanchesPasses = jours.filter((j) => j.dim && j.t <= aujourdhui).length;
  $("aventBougies").innerHTML = bougies(test ? 4 : Math.min(4, dimanchesPasses));
  if (apres) {
    $("aventCompte").textContent = "Joyeux Noël ! L'Avent est terminé : vous pouvez relire les gestes de cette année.";
  } else if (avant) {
    const d = Math.round((A1 - aujourdhui) / DAY);
    $("aventCompte").textContent = `L'Avent ${annee} commence dans ${d} jour${d > 1 ? "s" : ""}, le ${libelleDate(A1)}.`;
  } else {
    const d = Math.round((noel - aujourdhui) / DAY);
    $("aventCompte").textContent = `Plus que ${d} jour${d > 1 ? "s" : ""} avant Noël.`;
  }

  // Carte « aujourd'hui »
  const auj = jours.find((j) => j.t === aujourdhui);
  const boite = $("aventAujourdhui");
  if (auj) {
    boite.classList.remove("hidden");
    boite.innerHTML = `
      <h2>Aujourd'hui</h2>
      <p class="avent-geste">${esc(auj.geste)}</p>
      <p class="muted"><strong>Intention :</strong> ${esc(auj.intention)}</p>
      <p><a class="link" href="./liturgie.html?date=${auj.iso}">Lectures du jour →</a></p>`;
  }

  // Grille
  function dessiner() {
    grille.innerHTML = jours.map((j) => {
      const ok = dispo(j);
      const ouvert = ok && ouverts.has(j.iso);
      const dateCourte = libelleDate(j.t).split(" ").slice(0, 3).join(" ");
      const theme = j.dim ? DATA.dimanches[j.noDim] : null;
      return `
        <div class="avent-case ${ok ? "" : "is-locked"} ${ouvert ? "is-open" : ""} ${j.t === aujourdhui ? "is-today" : ""} ${j.dim ? "is-sunday" : ""}">
          <button type="button" class="avent-case__tete" data-iso="${j.iso}" ${ok ? "" : "disabled"} aria-expanded="${ouvert}">
            <span class="avent-case__date">${esc(dateCourte)}</span>
            ${theme ? `<span class="avent-case__theme">${esc(theme.nom)}<br><em>${esc(theme.theme)}</em></span>` : `<span class="avent-case__num">${j.k + 1}</span>`}
            ${ok ? "" : `<span class="avent-case__cadenas" aria-label="pas encore ouvert">🔒</span>`}
          </button>
          ${ouvert ? `
            <div class="avent-case__corps">
              <p class="avent-geste">${esc(j.geste)}</p>
              <p class="muted"><strong>Intention :</strong> ${esc(j.intention)}</p>
              <p><a class="link" href="./liturgie.html?date=${j.iso}">Lectures du jour →</a></p>
            </div>` : ""}
        </div>`;
    }).join("");
  }

  grille.addEventListener("click", (e) => {
    const b = e.target.closest("[data-iso]");
    if (!b || b.disabled) return;
    const iso = b.dataset.iso;
    ouverts.has(iso) ? ouverts.delete(iso) : ouverts.add(iso);
    ecrire(KEY, [...ouverts]);
    dessiner();
  });
  dessiner();

  // Rappel chaque matin dans l'agenda
  $("aventRappels").addEventListener("click", () => {
    const evenements = jours.map((j) => ({
      date: j.iso,
      heure: "07:30",
      duree: 15,
      rappel: 0,
      type: "info",
      titre: `Avent : ${j.geste}`,
      details: `${j.geste}\n\nIntention : ${j.intention}`,
      lien: `${location.origin}/avent.html`,
    }));
    downloadText(`avent-${annee}.ics`, eventsToICS(evenements));
  });

  $("aventPartager").addEventListener("click", async () => {
    const url = `${location.origin}/avent.html`;
    if (navigator.share) {
      try { await navigator.share({ title: "Calendrier de l'Avent", url }); } catch { /* annulé */ }
    } else {
      try { await navigator.clipboard.writeText(url); $("aventCompte").textContent = "Lien copié."; } catch { /* ignoré */ }
    }
  });
}

init();
