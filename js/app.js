/* ==================== CONFIG ==================== */

// 1) URL de l'Apps Script Web App (endpoint JSON pour les repas)
const REPAS_STATUS_URL =
  "https://script.google.com/macros/s/AKfycbz3QLIT13b9jzU47MVLT7SJj_umAwZBIUgzKT2Adi2rSJ3K4Du0bKdF8ukJyIsQNeRAlA/exec";

// 2) URL "Répondre au formulaire" (Google Form / viewform)
const FORM_JE_CUISINE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeHjuGyrIIbL-_Whse2Na3LI5J2pQQvIOeiRgIqgz2nT42ggg/viewform?usp=header";

// 3) Nombre max de repas à afficher sur la page Repas
const REPAS_MAX_AFFICHAGE = 5;

// 4) Afficher uniquement les repas à venir (true recommandé)
const REPAS_ONLY_UPCOMING = true;

// ==================== COVOITURAGE (méthode 1 : Sheets publiées en CSV) ====================

// URL CSV publiée de la feuille "covoit_offres"
const COVOIT_OFFRES_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT5k6A0eD7z06GZfjgfXo6pyiy1xMhd7ovAWZnAEz1y3yV5tkx9vUgWSXAHD87Tn3Z2Ddu5a24lnTUU/pub?gid=1733946668&single=true&output=csv";

// URL CSV publiée de la feuille "covoit_demandes"
const COVOIT_DEMANDES_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT5k6A0eD7z06GZfjgfXo6pyiy1xMhd7ovAWZnAEz1y3yV5tkx9vUgWSXAHD87Tn3Z2Ddu5a24lnTUU/pub?gid=653192246&single=true&output=csv";

// Lien "Répondre au formulaire" (viewform)
const FORM_COVOIT_OFFRE_URL = "https://docs.google.com/forms/d/e/1FAIpQLScUGXAPHHtW9O9OGKBbpX_3SxUDYdI8f1yHFROtA7ZJMOREnQ/viewform?usp=publish-editor";
const FORM_COVOIT_DEMANDE_URL = "https://docs.google.com/forms/d/e/1FAIpQLSd10Rj6EPvYkPdPcFebk1BKLZwzqXSeELE-tBk-71Ylz17eCg/viewform?usp=publish-editor";

// Paramètres d’affichage
const COVOIT_ONLY_UPCOMING = true; // masque automatiquement les entrées passées
const COVOIT_MAX_AFFICHAGE = 20;   // limite par section

// ==================== MESSE (Apps Script Web App) ====================

const MESSE_API_URL = "https://script.google.com/macros/s/AKfycbzvv0koVbnyfwCPIqFUv1GZB47lmQQldAYYKbXdsC9CmSxc2uKAUBj9HFivmSW5mXSA/exec";





let deferredPrompt = null;

/* ==================== UTILS ==================== */

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateFR(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function nextSundayISO() {
  const d = new Date();
  // 0=dimanche ... 6=samedi
  const day = d.getDay();
  const delta = (7 - day) % 7; // jours jusqu'à dimanche
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const dd = String(sunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}


function parseISODateToUTC(dateStr) {
  if (!dateStr) return NaN;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d, 0, 0, 0).getTime(); // heure locale
}

function parseISODateTimeToUTC(dateStr, timeStr) {
  if (!dateStr) return NaN;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return NaN;

  let hh = 0, mm = 0;
  if (timeStr) {
    const parts = String(timeStr).split(":").map(Number);
    hh = Number.isFinite(parts[0]) ? parts[0] : 0;
    mm = Number.isFinite(parts[1]) ? parts[1] : 0;
  }

  return new Date(y, m - 1, d, hh, mm, 0).getTime(); // heure locale
}


function formatDateHeureFR(isoDate, hhmm) {
  // isoDate: "2026-02-11", hhmm: "19:00"
  if (!isoDate) return "";

  // On construit une date UTC à partir des champs (cohérent avec votre parseur)
  const t = parseISODateTimeToUTC(isoDate, hhmm || "00:00");
  if (!Number.isFinite(t)) return `${isoDate}${hhmm ? " " + hhmm : ""}`;

  const d = new Date(t);

  // Nom du jour + date + mois
  const dateStr = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });

  const dateStrCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // Heure au format "19h00"
  let timeStr = "";
  if (hhmm) {
    const [H, M] = hhmm.split(":");
    if (H && M) timeStr = `${H}h${M}`;
  }

  // Ex: "mercredi 11 février à 19h00"
  return timeStr ? `${dateStr} à ${timeStr}` : dateStr;
}


function byDateAsc(a, b) {
  const da = parseISODateTimeToUTC(a.date, a.heure);
  const db = parseISODateTimeToUTC(b.date, b.heure);
  if (Number.isNaN(da) && Number.isNaN(db)) return 0;
  if (Number.isNaN(da)) return 1;
  if (Number.isNaN(db)) return -1;
  return da - db; // ancien -> récent
}

function byDateDesc(a, b) {
  const da = parseISODateTimeToUTC(a.date, a.heure);
  const db = parseISODateTimeToUTC(b.date, b.heure);
  if (Number.isNaN(da) && Number.isNaN(db)) return 0;
  if (Number.isNaN(da)) return 1;
  if (Number.isNaN(db)) return -1;
  return db - da; // récent -> ancien
}



async function loadJSON(pathOrUrl) {
  const r = await fetch(pathOrUrl, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${pathOrUrl}`);
  return await r.json();
}

async function loadText(url) {
  const sep = url.includes("?") ? "&" : "?";
  const busted = `${url}${sep}_ts=${Date.now()}`;
  const r = await fetch(busted, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  const txt = await r.text();

  // 🔒 Si Google renvoie une page HTML (permissions / login), ce n'est pas un CSV
  const t = txt.trim().toLowerCase();
  if (t.startsWith("<!doctype") || t.startsWith("<html")) {
    throw new Error("La feuille Google n'est pas publiée en CSV (HTML reçu).");
  }

  return txt;
}

async function postJSON(url, payload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // ✅ évite le preflight
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} on POST ${url}`);
  return await r.json();
}



// Parse CSV simple (gère guillemets, virgules)
function parseCSV(csvText) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = csvText[i + 1];

    if (c === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(cur);
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += c;
  }

  row.push(cur);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
    return obj;
  });
}

async function loadCSVObjects(url) {
  const txt = await loadText(url);
  return parseCSV(txt);
}

function renderItem(container, html) {
  if (!container) return;
  container.insertAdjacentHTML("beforeend", html);
}

function badge(type, text) {
  const cls =
    type === "urgent"
      ? "badge badge--urgent"
      : type === "need"
      ? "badge badge--need"
      : type === "ok"
      ? "badge badge--ok"
      : "badge";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function normalizeFiles(item) {
  // Accepte:
  // - item.fichier: "path.pdf"
  // - item.fichiers: ["path.pdf", ...]
  // - item.fichiers: [{label,url}, ...]
  // Retourne toujours: [{label, url}, ...]
  const out = [];

  if (!item) return out;

  // ancien champ
  if (typeof item.fichier === "string" && item.fichier.trim()) {
    out.push({ label: "Document", url: item.fichier.trim() });
  }

  const f = item.fichiers;

  if (Array.isArray(f)) {
    for (const x of f) {
      if (typeof x === "string" && x.trim()) {
        out.push({ label: "Document", url: x.trim() });
      } else if (x && typeof x === "object") {
        const url = String(x.url ?? "").trim();
        const label = String(x.label ?? x.titre ?? "Document").trim();
        if (url) out.push({ label, url });
      }
    }
  }

  // Évite les doublons exacts
  const seen = new Set();
  return out.filter(({ label, url }) => {
    const k = `${label}||${url}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function renderFilesBlock(item) {
  const files = normalizeFiles(item);
  if (!files.length) return "";

  const links = files
    .map(f => {
      const url = escapeHtml(f.url);
      const label = escapeHtml(f.label);
      return `<li class="files__item">
        <a class="files__link" href="${url}" target="_blank" rel="noopener">
          📄 ${label}
        </a>
      </li>`;
    })
    .join("");

  return `
    <div class="files" style="margin-top:12px">
      <div class="muted" style="margin-bottom:6px">Documents :</div>
      <ul class="files__list">
        ${links}
      </ul>
    </div>
  `;
}

/* ==================== ICONS ==================== */

function iconForAnnonce(cat) {
  if (cat === "info") return { src: "./assets/img/info.png", alt: "Info" };
  if (cat === "service") return { src: "./assets/img/service.png", alt: "Service" };
  if (cat === "urgent") return { src: "./assets/img/annonce.png", alt: "Annonce" };
  return { src: "./assets/img/annonce.png", alt: "Annonce" };
}

function iconForEvent(type) {
  if (type === "messe") return { src: "./assets/img/messe.png", alt: "Messe" };
  if (type === "repas") return { src: "./assets/img/repas.png", alt: "Repas" };
  if (type === "soiree") return { src: "./assets/img/soiree.png", alt: "Soirée / discussion" };
  if (type === "sortie") return { src: "./assets/img/sortie.png", alt: "Sortie" };
  return { src: "./assets/img/prochainesactivites.png", alt: "Activité" };
}

/* ==================== PWA ==================== */




function setupInstallButton() {
  const btn = document.getElementById("installBtn");
  if (!btn) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.classList.remove("hidden");
  });

  btn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.classList.add("hidden");
  });
}

/* ==================== REPAS: FORM LINK ==================== */

function setupRepasFormLink() {
  const a = document.getElementById("btnJeCuisine");
  if (!a) return;

  const ok = typeof FORM_JE_CUISINE_URL === "string" && FORM_JE_CUISINE_URL.startsWith("http");

  if (ok) {
    a.href = FORM_JE_CUISINE_URL;
    a.target = "_blank";
    a.rel = "noopener";
    a.removeAttribute("aria-disabled");
    a.textContent = "Formulaire “Je cuisine”";
  } else {
    a.href = "#";
    a.setAttribute("aria-disabled", "true");
    a.addEventListener("click", (e) => e.preventDefault());
    a.textContent = "Formulaire “Je cuisine” (à venir)";
  }
}

function setupCovoitFormLinks() {
  const aOffre = document.getElementById("btnCovoitOffre");
  const aDemande = document.getElementById("btnCovoitDemande");
  if (!aOffre && !aDemande) return;

  const ok1 = typeof FORM_COVOIT_OFFRE_URL === "string" && FORM_COVOIT_OFFRE_URL.startsWith("http");
  if (aOffre) {
    if (ok1) {
      aOffre.href = FORM_COVOIT_OFFRE_URL;
      aOffre.target = "_blank";
      aOffre.rel = "noopener";
      aOffre.removeAttribute("aria-disabled");
      aOffre.textContent = "Formulaire “Je conduis”";
    } else {
      aOffre.href = "#";
      aOffre.setAttribute("aria-disabled", "true");
      aOffre.addEventListener("click", (e) => e.preventDefault());
      aOffre.textContent = "Formulaire “Je conduis” (à brancher)";
    }
  }

  const ok2 = typeof FORM_COVOIT_DEMANDE_URL === "string" && FORM_COVOIT_DEMANDE_URL.startsWith("http");
  if (aDemande) {
    if (ok2) {
      aDemande.href = FORM_COVOIT_DEMANDE_URL;
      aDemande.target = "_blank";
      aDemande.rel = "noopener";
      aDemande.removeAttribute("aria-disabled");
      aDemande.textContent = "Formulaire “Je cherche”";
    } else {
      aDemande.href = "#";
      aDemande.setAttribute("aria-disabled", "true");
      aDemande.addEventListener("click", (e) => e.preventDefault());
      aDemande.textContent = "Formulaire “Je cherche” (à brancher)";
    }
  }
}

function pick(o, keys) {
  for (const k of keys) {
    if (o[k] != null && String(o[k]).trim() !== "") return String(o[k]).trim();
  }
  return "";
}

function normalizeCovoitRow(raw) {
  // 1) identité
  const prenom =
    pick(raw, ["Prénom", "Prenom", "prenom"]) ||
    pickByKeywords(raw, ["prénom"]) ||
    pickByKeywords(raw, ["prenom"]);

  const init =
    pick(raw, ["Initiale", "Initiale du nom", "Nom (initiale)", "Initiale nom"]) ||
    pickByKeywords(raw, ["initiale"]);

  // 2) date / heure (fallback keyword + normalisation)
  const dateRaw =
    pick(raw, ["Date", "date"]) ||
    pickByKeywords(raw, ["date"]); // match "date du covoiturage", etc.

  const date = normalizeDateToISO(dateRaw);

  const heureRaw =
    pick(raw, ["Heure", "heure"]) ||
    pickByKeywords(raw, ["heure"]); // match "heure de départ", etc.

  const heure = normalizeHourToHHMM(heureRaw);

  // 3) trajet
  const depart =
    pick(raw, ["Lieu de départ", "Lieu depart", "Départ", "Depart"]) ||
    pickByKeywordsButNot(raw, ["départ"], ["date", "jour", "heure"]) ||
    pickByKeywordsButNot(raw, ["depart"], ["date", "jour", "heure"]);


  const dest =
    pick(raw, ["Destination", "destination", "Arrivée", "Arrivee"]) ||
    pickByKeywords(raw, ["destination"]) ||
    pickByKeywords(raw, ["arrivée"]) ||
    pickByKeywords(raw, ["arrivee"]);

  // 4) places / contact
  const places =
    pick(raw, ["Places disponibles", "Places", "Nb places", "Places nécessaires", "Places necessaires"]) ||
    pickByKeywords(raw, ["places"]);

  const contact =
    pick(raw, ["Contact", "WhatsApp", "Pseudo WhatsApp", "Nom WhatsApp"]) ||
    pickByKeywords(raw, ["contact"]) ||
    pickByKeywords(raw, ["whatsapp"]);

  // Affichage
  const who = prenom ? `${prenom}${init ? " " + init.replace(".", "") + "." : ""}` : "—";

  // Timestamp (nécessite date ISO)
  const tUtc = parseISODateTimeToUTC(date, heure || "00:00");

  return { who, date, heure, depart, dest, places, contact, tUtc };
}

const MESSE_DEFAULT_CHURCHES = [
  "Cathédrale St Jean",
  "Église St Pierre",
  "Église St Maurice",
  "Église Ste Madeleine",
  "Chapelle ND des Buis",
  "Église St Louis",
  "Église du Sacré Cœur",
  "Église St Joseph",
  "Église St Hyppolyte",
  "Église St Martin des Chaprais",
  "Église St Pie X",
];

function normalizeChurchLabel(s) {
  return String(s || "").trim();
}

function normalizeName(s) {
  return String(s || "").trim();
}

async function initMesse() {
  const grid = document.getElementById("messeGrid");
  if (!grid) return; // pas sur cette page

  const daySel = document.getElementById("messeDay");
  const momentSel = document.getElementById("messeMoment");
  const btnRefresh = document.getElementById("messeRefresh");
  const label = document.getElementById("messeWeekendLabel");

  const weekend = nextSundayISO();
  if (label) label.textContent = `Week-end du ${formatDateFR(weekend)}`;

  async function loadAndRender() {
    const day = (daySel?.value || "dimanche");
    const moment = (momentSel?.value || "auto");

    grid.innerHTML = `<div class="item"><p class="muted">Chargement…</p></div>`;

    const url = `${MESSE_API_URL}?mode=list&weekend=${encodeURIComponent(weekend)}`;

    let data;
    try {
      data = await loadJSON(url);
    } catch (e) {
      console.error("Messe: API erreur", e);
      grid.innerHTML = `
        <div class="item">
          <p class="muted">
            Impossible de charger les présences (API). Ouvrez la console (F12 → Console) pour voir l’erreur.
          </p>
          <p class="muted" style="margin-top:6px">
            Test direct : <a href="${escapeHtml(url)}" target="_blank" rel="noopener">ouvrir l’API</a>
          </p>
        </div>`;
      return;
    }


    const items = Array.isArray(data.items) ? data.items : [];

    const getStr = (obj, keys) => {
      for (const k of keys) {
        const v = obj?.[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
      }
      return "";
    };

    const normLower = (s) => String(s || "").trim().toLowerCase();

    // tolère day/jour + casse + espaces
    const dayItems = items.filter(x => normLower(getStr(x, ["day", "jour"])) === normLower(day));


    // Églises présentes = base + celles ajoutées par des gens
    const churches = new Set(MESSE_DEFAULT_CHURCHES);
    for (const it of dayItems) {
      const c = normalizeChurchLabel(getStr(it, ["church", "eglise", "église", "churhc", "parish"]));
      if (c) churches.add(c);
    }
    const churchesList = [...churches].filter(Boolean).sort((a,b)=>a.localeCompare(b,"fr"));

    // Index par église
    const byChurch = new Map();
    for (const c of churchesList) byChurch.set(c, []);
    for (const it of dayItems) {
      const c = normalizeChurchLabel(getStr(it, ["church", "eglise", "église", "churhc", "parish"]));
      const n = normalizeName(getStr(it, ["name", "prenom", "prénom", "who"]));
      const mo = getStr(it, ["moment", "time", "horaire"]);

      if (!c || !n) continue;
      if (!byChurch.has(c)) byChurch.set(c, []);
      byChurch.get(c).push({ name: n, moment: mo });
    }

    // rendu
    grid.innerHTML = "";
    for (const church of churchesList) {
      const people = byChurch.get(church) || [];
      const listHtml = people.length
        ? `<ul style="margin:8px 0 0 18px; color:var(--muted)">
             ${people.map(p => `<li>${escapeHtml(p.name)}${(p.moment && p.moment !== "auto") ? ` <span class="muted">(${escapeHtml(p.moment)})</span>` : ""}</li>`).join("")}
           </ul>`
        : `<p class="muted" style="margin-top:8px">Personne pour l’instant.</p>`;

      const cardId = `messe_${church.replaceAll(" ","_").replaceAll("'","")}`;

      grid.insertAdjacentHTML("beforeend", `
        <div class="card" id="${escapeHtml(cardId)}">
          <div class="card__head">
            <h3 style="margin:4px 0 8px">${escapeHtml(church)}</h3>
            <span class="badge">${day}</span>
          </div>

          ${listHtml}

          <div style="margin-top:12px">
            <button class="btn btn--ghost" data-action="add" data-church="${escapeHtml(church)}">+ Ajouter mon nom</button>
          </div>
        </div>
      `);
    }

    // bouton "ajouter"
    grid.querySelectorAll('button[data-action="add"]').forEach(btn => {
      btn.addEventListener("click", async () => {
        const church = btn.getAttribute("data-church") || "";
        const name = prompt("Votre prénom (ou prénom + initiale) :");
        if (!name) return;

        const payload = {
          mode: "add",
          weekend,
          day,
          moment,
          church,
          name: name.trim()
        };

        try {
          btn.disabled = true;
          await postJSON(MESSE_API_URL, payload);
          await loadAndRender();
        } catch (e) {
          console.error(e);
          alert("Impossible d’ajouter (réseau / droits).");
        } finally {
          btn.disabled = false;
        }
      });
    });

    // ajout "autre église" (petit bouton en bas)
    grid.insertAdjacentHTML("beforeend", `
      <div class="card">
        <div class="card__head">
          <h3 style="margin:4px 0 8px">Autre église…</h3>
          <span class="badge">+</span>
        </div>
        <p class="muted">Si elle n’est pas dans la liste, vous pouvez l’ajouter en premier.</p>
        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn" id="messeAddOther">+ Ajouter</button>
        </div>
      </div>
    `);

    const addOther = document.getElementById("messeAddOther");
    addOther?.addEventListener("click", async () => {
      const church = prompt("Nom de l’église :");
      if (!church) return;
      const name = prompt("Votre prénom (ou prénom + initiale) :");
      if (!name) return;

      try {
        addOther.disabled = true;
        await postJSON(MESSE_API_URL, {
          mode: "add",
          weekend,
          day,
          moment,
          church: church.trim(),
          name: name.trim()
        });
        await loadAndRender();
      } catch (e) {
        console.error(e);
        alert("Impossible d’ajouter (réseau / droits).");
      } finally {
        addOther.disabled = false;
      }
    });
  }

  btnRefresh?.addEventListener("click", loadAndRender);
  daySel?.addEventListener("change", loadAndRender);
  momentSel?.addEventListener("change", loadAndRender);

  await loadAndRender();
}



function normalizeHourToHHMM(v) {
  if (!v) return "";
  const s = String(v).trim().toLowerCase().replace("h", ":");

  // Accepte HH:MM ou HH:MM:SS
  const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return String(v).trim();

  const hh = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  return `${hh}:${mm}`;
}


function normalizeDateToISO(v) {
  if (!v) return "";
  const s = String(v).trim();

  // ISO simple ou ISO avec heure (on garde juste la date)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // FR: DD/MM/YYYY (optionnellement suivi de l'heure)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yy = m[3];
    return `${yy}-${mm}-${dd}`;
  }

  return s;
}


function pickByKeywords(row, keywords) {
  const keys = Object.keys(row || {});
  for (const k of keys) {
    const lk = k.toLowerCase();

    // ⛔ on ignore l'horodatage Google Forms
    if (lk.includes("horodateur") || lk.includes("timestamp")) continue;

    if (keywords.every(w => lk.includes(w))) return row[k];
  }
  return "";
}

function pickByKeywordsButNot(row, includeWords, excludeWords) {
  const keys = Object.keys(row || {});
  for (const k of keys) {
    const lk = k.toLowerCase();
    if (excludeWords.some(w => lk.includes(w))) continue;
    if (includeWords.every(w => lk.includes(w))) return row[k];
  }
  return "";
}


function covoitCard(item, mode) {
  // mode = "offre" ou "demande" (pour le libellé places)
  const when = formatDateHeureFR(item.date, item.heure); // déjà dans votre app.js :contentReference[oaicite:5]{index=5}
  const traj = `${item.depart || "—"} → ${item.dest || "—"}`;

  const placesLabel =
    mode === "offre"
      ? (item.places ? `Places dispo : ${escapeHtml(item.places)}` : "")
      : (item.places ? `Places demandées : ${escapeHtml(item.places)}` : "");

  const contactLine = item.contact
    ? `<p class="muted" style="margin-top:8px">Contact : ${escapeHtml(item.contact)}</p>`
    : `<p class="muted" style="margin-top:8px">Contact : via WhatsApp (groupe)</p>`;

  return `
    <div class="item">
      <div class="item__top">
        <div class="item__left">
          <span class="badge">${mode === "offre" ? "🚗 Offre" : "🙋 Demande"}</span>
        </div>
        <span class="muted">${escapeHtml(when)}</span>
      </div>
      <h3>${escapeHtml(item.who)}</h3>
      <p>${escapeHtml(traj)}</p>
      ${placesLabel ? `<p class="muted" style="margin-top:6px">${placesLabel}</p>` : ""}
      ${contactLine}
    </div>
  `;
}

async function initCovoiturage() {
  const offresC = document.getElementById("covoitOffresList");
  const demandesC = document.getElementById("covoitDemandesList");
  if (!offresC && !demandesC) return; // pas sur cette page

  const now = Date.now();


  try {
    // OFFRES
    if (offresC) {
      const raws = await loadCSVObjects(COVOIT_OFFRES_CSV_URL);
      let items = raws.map(normalizeCovoitRow).filter(x => Number.isFinite(x.tUtc));

      if (COVOIT_ONLY_UPCOMING) {
        const MARGE = 6 * 60 * 60 * 1000; // 6 heures
        items = items.filter(x => x.tUtc >= now - MARGE);
      }


      items.sort((a, b) => a.tUtc - b.tUtc);
      items = items.slice(0, COVOIT_MAX_AFFICHAGE);

      offresC.innerHTML = items.length
        ? items.map(i => covoitCard(i, "offre")).join("")
        : `<div class="item"><p class="muted">Aucune offre pour le moment.</p></div>`;
    }

    // DEMANDES
    if (demandesC) {
      const raws = await loadCSVObjects(COVOIT_DEMANDES_CSV_URL);
      let items = raws.map(normalizeCovoitRow).filter(x => Number.isFinite(x.tUtc));

      if (COVOIT_ONLY_UPCOMING) {
        const MARGE = 6 * 60 * 60 * 1000; // 6 heures
        items = items.filter(x => x.tUtc >= now - MARGE);
      }

      items.sort((a, b) => a.tUtc - b.tUtc);
      items = items.slice(0, COVOIT_MAX_AFFICHAGE);

      demandesC.innerHTML = items.length
        ? items.map(i => covoitCard(i, "demande")).join("")
        : `<div class="item"><p class="muted">Aucune demande pour le moment.</p></div>`;
    }
  } catch (e) {
    console.error(e);
    if (offresC) offresC.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
    if (demandesC) demandesC.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
  }
}


/* ==================== HOME ==================== */

async function initHome() {
  const aC = document.getElementById("homeAnnonces");
  const eC = document.getElementById("homeNextEvent");
  if (!aC && !eC) return;

  try {
    // --- Annonces (3 dernières) ---
    if (aC) {
      const annonces = await loadJSON("./data/annonces.json");
      const last3 = [...annonces].sort(byDateDesc).slice(0, 3);

      aC.innerHTML = "";
      if (!last3.length) {
        aC.innerHTML = `<div class="item"><p class="muted">Aucune annonce.</p></div>`;
      } else {
        last3.forEach((a) => {
          const ic = iconForAnnonce(a.categorie);
          const thumb = a.image
            ? `<img class="item__thumb" src="${escapeHtml(a.image)}" alt="" loading="lazy">`
            : "";

          renderItem(aC, `
            <details class="item item--expandable">
              <summary class="item__summary">
                <div class="item__top">
                  <div class="item__left">
                    <img class="item__icon" src="${ic.src}" alt="${escapeHtml(ic.alt)}">
                    ${badge(a.categorie || "info", a.categorie || "info")}
                  </div>
                  <span class="muted">${escapeHtml(a.date || "")}</span>
                </div>

                <div class="item__grid">
                  <div class="item__main">
                    <h3>${escapeHtml(a.titre || "")}</h3>
                    <p>${escapeHtml(a.texte || "")}</p>
                  </div>
                  ${thumb ? `<div class="item__media">${thumb}</div>` : ""}
                </div>
              </summary>

              <div class="item__details">
                ${a.details ? `<p>${escapeHtml(a.details)}</p>` : `<p class="muted">Aucun détail supplémentaire.</p>`}
                ${a.lien ? `<p style="margin-top:10px"><a href="${escapeHtml(a.lien)}" target="_blank" rel="noopener">Lien</a></p>` : ""}
              </div>
            </details>
          `);
        });
      }
    }

    // --- Prochaine activité ---
    if (eC) {
      const events = (await loadJSON("./data/calendrier.json")).sort(byDateAsc);
      const nowUtc = Date.now();
      const next = events.find((e) => parseISODateToUTC(e.date) >= nowUtc) || events[0];

      eC.innerHTML = "";
      if (!next) {
        eC.innerHTML = `<div class="item"><p class="muted">Aucune activité.</p></div>`;
      } else {
        const ic = iconForEvent(next.type);
        const thumb = next.image
          ? `<img class="item__thumb" src="${escapeHtml(next.image)}" alt="" loading="lazy">`
          : "";

        renderItem(eC, `
          <details class="item item--expandable">
            <summary class="item__summary">
              <div class="item__top">
                <div class="item__left">
                  <img class="item__icon" src="${ic.src}" alt="${escapeHtml(ic.alt)}">
                  ${badge(next.type || "info", next.type || "activité")}
                </div>
                <span class="muted">${escapeHtml(next.date || "")} ${escapeHtml(next.heure || "")}</span>
              </div>

              <div class="item__grid">
                <div class="item__main">
                  <h3>${escapeHtml(next.titre || "")}</h3>
                  <p>${escapeHtml(next.lieu || "")}</p>
                  ${next.resume ? `<p class="muted" style="margin-top:8px">${escapeHtml(next.resume)}</p>` : ""}
                </div>
                ${thumb ? `<div class="item__media">${thumb}</div>` : ""}
              </div>
            </summary>

            <div class="item__details">
              ${next.details ? `<p>${escapeHtml(next.details)}</p>` : `<p class="muted">Aucun détail.</p>`}
              ${next.lien ? `<p style="margin-top:10px"><a href="${escapeHtml(next.lien)}" target="_blank" rel="noopener">Lien</a></p>` : ""}
              ${next.contact ? `<p class="muted" style="margin-top:10px">Contact : ${escapeHtml(next.contact)}</p>` : ""}
            </div>
          </details>
        `);
      }
    }
  } catch (err) {
    console.error(err);
    if (aC) aC.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
    if (eC) eC.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
  }
}



/* ==================== ANNONCES ==================== */

async function initAnnonces() {
  const list = document.getElementById("annoncesList");
  const search = document.getElementById("annoncesSearch");
  const filter = document.getElementById("annoncesFilter");
  if (!list) return;

  let annonces = [];
  try {
    annonces = (await loadJSON("./data/annonces.json")).sort(byDateDesc);
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
    return;
  }

  function nl2br(s) {
    return escapeHtml(s || "").replace(/\n/g, "<br>");
  }

  function draw() {
    const q = (search?.value || "").trim().toLowerCase();
    const cat = filter?.value || "all";

    list.innerHTML = "";

    const shown = annonces.filter((a) => {
      const okCat = (cat === "all") || ((a.categorie || "info") === cat);
      const blob = `${a.titre || ""} ${a.texte || ""} ${a.details || ""}`.toLowerCase();
      const okQ = !q || blob.includes(q);
      return okCat && okQ;
    });

    if (!shown.length) {
      list.innerHTML = `<div class="item"><p class="muted">Aucun résultat.</p></div>`;
      return;
    }

    shown.forEach((a) => {
      const ic = iconForAnnonce(a.categorie);
      const thumb = a.image
        ? `<img class="item__thumb" src="${escapeHtml(a.image)}" alt="" loading="lazy">`
        : "";

      renderItem(list, `
        <details class="item item--expandable">
          <summary class="item__summary">
            <div class="item__top">
              <div class="item__left">
                <img class="item__icon" src="${ic.src}" alt="${escapeHtml(ic.alt)}">
                ${badge(a.categorie || "info", a.categorie || "info")}
              </div>
              <span class="muted">${escapeHtml(a.date || "")}</span>
            </div>

            <div class="item__grid">
              <div class="item__main">
                <h3>${escapeHtml(a.titre || "")}</h3>
		<p>${escapeHtml(a.resume || "")}</p>
              </div>
              ${thumb ? `<div class="item__media">${thumb}</div>` : ""}
            </div>
          </summary>

          <div class="item__details">
            ${a.texte
	      ? `<p>${nl2br(a.texte)}</p>`
	      : `<p class="muted">Aucun détail supplémentaire.</p>`
	    }
	    ${a.details ? `<p style="margin-top:10px">${nl2br(a.details)}</p>` : ""}
            ${a.lien ? `<p style="margin-top:10px"><a href="${escapeHtml(a.lien)}" target="_blank" rel="noopener">Lien</a></p>` : ""}
	    ${renderFilesBlock(a)}
          </div>
        </details>
      `);
    });
  }

  search?.addEventListener("input", draw);
  filter?.addEventListener("change", draw);
  draw();
}


/* ==================== CALENDRIER ==================== */

async function initCalendrier() {
  const list = document.getElementById("eventsList");
  const filter = document.getElementById("eventsFilter");
  if (!list) return;

  let events = [];
  try {
    events = await loadJSON("./data/calendrier.json");

    const now = Date.now();

    const upcoming = events
      .filter(e => !Number.isNaN(parseISODateTimeToUTC(e.date, e.heure)) && parseISODateTimeToUTC(e.date, e.heure) >= now)
      .sort(byDateAsc);

    const past = events
      .filter(e => !Number.isNaN(parseISODateTimeToUTC(e.date, e.heure)) && parseISODateTimeToUTC(e.date, e.heure) < now)
      .sort(byDateDesc);

    // si jamais certaines activités n'ont pas de date valide, on les met en bas
    const invalid = events
      .filter(e => Number.isNaN(parseISODateTimeToUTC(e.date, e.heure)));

    events = [...upcoming, ...past, ...invalid];


  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
    return;
  }

  function draw() {
    const t = filter?.value || "all";
    list.innerHTML = "";

    const shown = events.filter((e) => (t === "all") || ((e.type || "") === t));

    if (!shown.length) {
      list.innerHTML = `<div class="item"><p class="muted">Aucune activité.</p></div>`;
      return;
    }

    const now = Date.now();
    let pastHeaderInserted = false;

    shown.forEach((e) => {
      const isPast = !Number.isNaN(parseISODateTimeToUTC(e.date, e.heure))
        ? (parseISODateTimeToUTC(e.date, e.heure) < now)
        : false;

      // Intertitre automatique au moment où on bascule dans le passé
      if (isPast && !pastHeaderInserted) {
        renderItem(list, `
          <div class="list__separator">
            <span>Activités passées</span>
          </div>
        `);
        pastHeaderInserted = true;
      }

      const ic = iconForEvent(e.type);

      const thumb = e.image
        ? `<a class="thumblink" href="${escapeHtml(e.image)}" target="_blank" rel="noopener">
             <img class="item__thumb" src="${escapeHtml(e.image)}" alt="Image de l’activité" loading="lazy">
           </a>`
        : "";

      // Badge "Terminée" si passé
      const pastBadge = isPast ? `<span class="badge badge--past">Terminée</span>` : "";

      renderItem(list, `
        <details class="item item--expandable ${isPast ? "item--past" : ""}">
          <summary class="item__summary">
            <div class="item__top">
              <div class="item__left">
                <img class="item__icon" src="${ic.src}" alt="${escapeHtml(ic.alt)}">
                ${badge(e.type || "info", e.type || "activité")}
                ${pastBadge}
              </div>
              <span class="muted">${escapeHtml(formatDateHeureFR(e.date, e.heure))}</span>
            </div>

            <div class="item__grid">
              <div class="item__main">
                <h3>${escapeHtml(e.titre || "")}</h3>
                <p>${escapeHtml(e.lieu || "")}</p>
                ${e.resume ? `<p class="muted" style="margin-top:8px">${escapeHtml(e.resume)}</p>` : ""}
              </div>
              ${thumb ? `<div class="item__media">${thumb}</div>` : ""}
            </div>
          </summary>

          <div class="item__details">
            ${e.details ? `<p>${escapeHtml(e.details)}</p>` : `<p class="muted">Aucun détail.</p>`}
            ${e.lien ? `<p style="margin-top:10px"><a href="${escapeHtml(e.lien)}" target="_blank" rel="noopener">Lien</a></p>` : ""}
            ${e.contact ? `<p class="muted" style="margin-top:10px">Contact : ${escapeHtml(e.contact)}</p>` : ""}
            ${renderFilesBlock(e)}
          </div>
        </details>
      `);
    });

  }

  filter?.addEventListener("change", draw);
  draw();
}


/* ==================== REPAS ==================== */

async function initRepas() {
  const list = document.getElementById("repasList");
  if (!list) return;

  let data = [];
  try {
    data = await loadJSON(REPAS_STATUS_URL);
    if (!Array.isArray(data)) throw new Error("Repas: JSON inattendu");
  } catch {
    list.innerHTML = `<div class="item"><p class="muted">Impossible de charger les repas.</p></div>`;
    return;
  }

  data.sort(byDateAsc);

  let toShow = data;

  if (REPAS_ONLY_UPCOMING) {
    const todayISO = new Date().toISOString().slice(0, 10);
    toShow = toShow.filter((r) => String(r.date) >= todayISO);
  }

  toShow = toShow.slice(0, REPAS_MAX_AFFICHAGE);

  list.innerHTML = "";

  if (!toShow.length) {
    list.innerHTML = `<div class="item"><p class="muted">Aucun repas à venir.</p></div>`;
    return;
  }

  toShow.forEach((r) => {
    const besoin = Number(r.besoin_cuisiniers ?? 0);
    const cuisiniers = Number(r.cuisiniers ?? 0);
    const manque = Math.max(0, besoin - cuisiniers);

    const statusBadge =
      manque > 0
        ? badge("need", `Il manque ${manque} volontaire${manque > 1 ? "s" : ""}`)
        : badge("ok", "Équipe complète");

    const label = formatDateFR(r.date);
    const titre = `Repas du ${label}`;

    const platHtml = r.plat
      ? `<p class="muted" style="margin-top:6px">Plat : ${escapeHtml(r.plat)}</p>`
      : "";

    renderItem(
      list,
      `
      <div class="item">
        <div class="item__top">
          <div class="item__left">
            <img class="item__icon" src="./assets/img/repas.png" alt="Repas">
            ${statusBadge}
          </div>
          <span class="muted">${escapeHtml(label)}</span>
        </div>

        <h3>${escapeHtml(titre)}</h3>
        ${platHtml}
      </div>
    `
    );
  });
}

/* ==================== BOOT ==================== */
function initNotificationsUI() {
  const onBtn = document.getElementById("btnNotif");
  const offBtn = document.getElementById("btnNotifOff");
  const etat = document.getElementById("notifEtat");
  if (!onBtn || !offBtn || !etat) return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal) {
    // Affiche l'état actuel (abonné / non abonné)
    const refresh = async () => {
      const optedIn = OneSignal.User?.PushSubscription?.optedIn;
      if (optedIn) {
        onBtn.style.display = "none";
        offBtn.style.display = "";
        etat.textContent = "Notifications activées";
      } else {
        onBtn.style.display = "";
        offBtn.style.display = "none";
        etat.textContent = "Notifications désactivées.";
      }
    };

    onBtn.addEventListener("click", async () => {
      try {
        etat.textContent = "Activation des notifications…";
        console.log("Tentative optIn OneSignal");

        await OneSignal.User.PushSubscription.optIn();

        console.log("optIn OK");
        await refresh();
      } catch (e) {
        console.error("❌ optIn OneSignal échoué", e);
        etat.textContent =
          "Impossible d’activer les notifications (permission refusée ou non supportée).";
      }
    });

    offBtn.addEventListener("click", async () => {
      try {
        etat.textContent = "Désactivation des notifications…";
        console.log("Tentative optOut OneSignal");

        await OneSignal.User.PushSubscription.optOut();

        console.log("optOut OK");
        await refresh();
      } catch (e) {
        console.error("❌ optOut OneSignal échoué", e);
        etat.textContent =
          "Impossible de désactiver les notifications (voir console).";
      }
    });


    await refresh();
  });
}
setupInstallButton();
setupRepasFormLink();
initNotificationsUI();
setupCovoitFormLinks();
initCovoiturage();
initMesse();
initHome();
initAnnonces();
initCalendrier();
initRepas();
