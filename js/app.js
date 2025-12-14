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

function parseISODateToUTC(dateStr) {
  if (!dateStr) return NaN;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

function byDateAsc(a, b) {
  return parseISODateToUTC(a.date) - parseISODateToUTC(b.date);
}

async function loadJSON(pathOrUrl) {
  const r = await fetch(pathOrUrl, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${pathOrUrl}`);
  return await r.json();
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

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

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

/* ==================== HOME ==================== */

async function initHome() {
  const aC = document.getElementById("homeAnnonces");
  const eC = document.getElementById("homeNextEvent");
  if (!aC && !eC) return;

  try {
    const annonces = (await loadJSON("./data/annonces.json")).slice(0, 3);

    if (aC) {
      aC.innerHTML = "";
      annonces.forEach((a) => {
        const ic = iconForAnnonce(a.categorie || "info");
        renderItem(
          aC,
          `
          <details class="item">
            <summary class="item__summary">
              <div class="item__top">
                <div class="item__left">
                  <img class="item__icon" src="${ic.src}" alt="${escapeHtml(ic.alt)}">
                  ${badge(a.categorie || "info", a.categorie || "info")}
                </div>
                <span class="muted">${escapeHtml(a.date ?? "")}</span>
              </div>

              <h3>${escapeHtml(a.titre)}</h3>
              <p>${escapeHtml(a.resume || a.texte || "")}</p>
            </summary>

            <div class="item__details">
              ${a.texte ? `<p>${escapeHtml(a.texte)}</p>` : `<p class="muted">Aucun détail.</p>`}
              ${a.lien ? `<p style="margin-top:10px"><a href="${escapeHtml(a.lien)}" target="_blank" rel="noopener">Lien</a></p>` : ""}
              ${a.contact ? `<p class="muted" style="margin-top:10px">Contact : ${escapeHtml(a.contact)}</p>` : ""}
            </div>
          </details>
        `
        );
      });
    }

    const events = (await loadJSON("./data/calendrier.json")).sort(byDateAsc);
    const nowUtc = Date.now();
    const next = events.find((e) => parseISODateToUTC(e.date) >= nowUtc) || events[0];

    if (eC) {
      eC.innerHTML = "";
      if (next) {
        const ic = iconForEvent(next.type || "");
        renderItem(
          eC,
          `
          <details class="item">
            <summary class="item__summary">
              <div class="item__top">
                <div class="item__left">
                  <img class="item__icon" src="${ic.src}" alt="${escapeHtml(ic.alt)}">
                  ${badge(next.type || "info", next.type || "activité")}
                </div>
                <span class="muted">${escapeHtml(next.date)} ${escapeHtml(next.heure || "")}</span>
              </div>

              <h3>${escapeHtml(next.titre)}</h3>
              <p>${escapeHtml(next.lieu || "")}</p>
              ${next.resume ? `<p class="muted" style="margin-top:6px">${escapeHtml(next.resume)}</p>` : ""}
            </summary>

            <div class="item__details">
              ${next.details ? `<p>${escapeHtml(next.details)}</p>` : `<p class="muted">Aucun détail.</p>`}
              ${next.lien ? `<p style="margin-top:10px"><a href="${escapeHtml(next.lien)}" target="_blank" rel="noopener">Lien</a></p>` : ""}
              ${next.contact ? `<p class="muted" style="margin-top:10px">Contact : ${escapeHtml(next.contact)}</p>` : ""}
            </div>
          </details>
        `
        );
      } else {
        eC.innerHTML = `<div class="item"><p class="muted">Aucune activité.</p></div>`;
      }
    }
  } catch {
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

  let data = [];
  try {
    data = await loadJSON("./data/annonces.json");
  } catch {
    list.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
    return;
  }

  function draw() {
    const q = (search?.value || "").trim().toLowerCase();
    const cat = filter?.value || "Toutes";

    const items = data
      .filter((a) => {
        const okCat = cat === "Toutes" ? true : (a.categorie || "info") === cat;
        const text = `${a.titre || ""} ${a.resume || ""} ${a.texte || ""} ${a.details || ""}`.toLowerCase();
        const okQ = q ? text.includes(q) : true;
        return okCat && okQ;
      })
      .sort(byDateDesc);

    list.innerHTML = "";

    items.forEach((a) => {
      const ic = iconForAnnonce(a.categorie || "info");
      const thumb = a.image
        ? `
          <div class="item__thumb" aria-hidden="true">
            <img src="${escapeHtml(a.image)}" alt="">
          </div>
        `
        : "";

      const media = a.image
        ? `
          <div class="item__media">
            <img src="${escapeHtml(a.image)}" alt="${escapeHtml(a.titre || "Illustration")}">
          </div>
        `
        : "";

      renderItem(
        list,
        `
        <details class="item ${a.image ? "item--with-thumb" : ""}">
          <summary class="item__summary">
            <div class="item__top">
              <div class="item__left">
                <img class="item__icon" src="${ic.src}" alt="${escapeHtml(ic.alt)}">
                ${badge(a.categorie || "info", a.categorie || "info")}
              </div>
              <span class="muted">${escapeHtml(a.date ?? "")}</span>
            </div>

            <div class="item__body">
              <div class="item__main">
                <h3>${escapeHtml(a.titre)}</h3>
                <p>${escapeHtml(a.resume || a.texte || "")}</p>
              </div>
              ${thumb}
            </div>
          </summary>

          <div class="item__details">
            ${media}
            ${a.texte ? `<p>${escapeHtml(a.texte)}</p>` : `<p class="muted">Aucun détail.</p>`}
            ${a.lien ? `<p style="margin-top:10px"><a href="${escapeHtml(a.lien)}" target="_blank" rel="noopener">Lien</a></p>` : ""}
            ${a.contact ? `<p class="muted" style="margin-top:10px">Contact : ${escapeHtml(a.contact)}</p>` : ""}
          </div>
        </details>
        `
      );
    });

    if (!list.children.length) {
      list.innerHTML = `<div class="item"><p class="muted">Aucun résultat.</p></div>`;
    }
  }

  search?.addEventListener("input", draw);
  filter?.addEventListener("change", draw);
  draw();
}


/* ==================== CALENDRIER ==================== */

async function initCalendrier() {
  const list = document.getElementById("calendrierList");
  const filter = document.getElementById("calendrierFilter");
  if (!list) return;

  let data = [];
  try {
    data = await loadJSON("./data/calendrier.json");
  } catch {
    list.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
    return;
  }

  function draw() {
    const type = filter?.value || "Tout";
    const items = [...data]
      .filter((e) => (type === "Tout" ? true : (e.type || "info") === type))
      .sort(byDateAsc);

    list.innerHTML = "";

    items.forEach((e) => {
      const ic = iconForEvent(e.type || "");
      const thumb = e.image
        ? `
          <div class="item__thumb" aria-hidden="true">
            <img src="${escapeHtml(e.image)}" alt="">
          </div>
        `
        : "";

      const media = e.image
        ? `
          <div class="item__media">
            <img src="${escapeHtml(e.image)}" alt="${escapeHtml(e.titre || "Illustration")}">
          </div>
        `
        : "";

      renderItem(
        list,
        `
        <details class="item ${e.image ? "item--with-thumb" : ""}">
          <summary class="item__summary">
            <div class="item__top">
              <div class="item__left">
                <img class="item__icon" src="${ic.src}" alt="${escapeHtml(ic.alt)}">
                ${badge(e.type || "info", e.type || "activité")}
              </div>
              <span class="muted">${escapeHtml(e.date)} ${escapeHtml(e.heure || "")}</span>
            </div>

            <div class="item__body">
              <div class="item__main">
                <h3>${escapeHtml(e.titre)}</h3>
                <p>${escapeHtml(e.lieu || "")}</p>
                ${e.resume ? `<p class="muted" style="margin-top:8px">${escapeHtml(e.resume)}</p>` : ""}
              </div>
              ${thumb}
            </div>
          </summary>

          <div class="item__details">
            ${media}
            ${e.details ? `<p>${escapeHtml(e.details)}</p>` : `<p class="muted">Aucun détail.</p>`}
            ${e.lien ? `<p style="margin-top:10px"><a href="${escapeHtml(e.lien)}" target="_blank" rel="noopener">Lien</a></p>` : ""}
            ${e.contact ? `<p class="muted" style="margin-top:10px">Contact : ${escapeHtml(e.contact)}</p>` : ""}
          </div>
        </details>
        `
      );
    });

    if (!list.children.length) {
      list.innerHTML = `<div class="item"><p class="muted">Aucune activité.</p></div>`;
    }
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

registerSW();
setupInstallButton();
setupRepasFormLink();

initHome();
initAnnonces();
initCalendrier();
initRepas();
