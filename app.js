import { loadJSON, byDateAsc, escapeHtml } from "./data.js";

let deferredPrompt = null;

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
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

function renderItem(container, html) {
  if (!container) return;
  container.insertAdjacentHTML("beforeend", html);
}

function badge(type, text) {
  const cls =
    type === "urgent" ? "badge badge--urgent" :
    type === "need"   ? "badge badge--need" :
    type === "ok"     ? "badge badge--ok" :
                        "badge";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

// ---------- HOME ----------
async function initHome() {
  const aC = document.getElementById("homeAnnonces");
  const eC = document.getElementById("homeNextEvent");
  if (!aC && !eC) return;

  try {
    const annonces = (await loadJSON("./data/annonces.json")).slice(0, 3);
    if (aC) {
      aC.innerHTML = "";
      annonces.forEach(a => {
        renderItem(aC, `
          <div class="item">
            <div class="item__top">
              ${badge(a.categorie || "info", a.categorie || "info")}
              <span class="muted">${escapeHtml(a.date)}</span>
            </div>
            <h3>${escapeHtml(a.titre)}</h3>
            <p>${escapeHtml(a.texte)}</p>
          </div>
        `);
      });
    }

    const events = (await loadJSON("./data/calendrier.json")).sort(byDateAsc);
    const next = events.find(e => new Date(e.date).getTime() >= Date.now()) || events[0];
    if (eC) {
      eC.innerHTML = "";
      if (next) {
        renderItem(eC, `
          <div class="item">
            <div class="item__top">
              ${badge(next.type || "info", next.type || "activité")}
              <span class="muted">${escapeHtml(next.date)} ${escapeHtml(next.heure || "")}</span>
            </div>
            <h3>${escapeHtml(next.titre)}</h3>
            <p>${escapeHtml(next.lieu || "")}</p>
            ${next.details ? `<p class="muted" style="margin-top:8px">${escapeHtml(next.details)}</p>` : ""}
          </div>
        `);
      } else {
        eC.innerHTML = `<div class="item"><p class="muted">Aucune activité.</p></div>`;
      }
    }
  } catch (e) {
    if (aC) aC.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
    if (eC) eC.innerHTML = `<div class="item"><p class="muted">Données indisponibles.</p></div>`;
  }
}

// ---------- ANNONCES ----------
async function initAnnonces() {
  const list = document.getElementById("annoncesList");
  if (!list) return;

  const search = document.getElementById("annoncesSearch");
  const filter = document.getElementById("annoncesFilter");

  let data = [];
  try {
    data = await loadJSON("./data/annonces.json");
  } catch {
    list.innerHTML = `<div class="item"><p class="muted">Impossible de charger les annonces.</p></div>`;
    return;
  }

  function draw() {
    const q = (search?.value || "").trim().toLowerCase();
    const f = filter?.value || "all";
    list.innerHTML = "";

    data
      .filter(a => (f === "all" ? true : (a.categorie === f)))
      .filter(a => {
        if (!q) return true;
        return (
          (a.titre || "").toLowerCase().includes(q) ||
          (a.texte || "").toLowerCase().includes(q)
        );
      })
      .forEach(a => {
        renderItem(list, `
          <div class="item">
            <div class="item__top">
              ${badge(a.categorie || "info", a.categorie || "info")}
              <span class="muted">${escapeHtml(a.date)}</span>
            </div>
            <h3>${escapeHtml(a.titre)}</h3>
            <p>${escapeHtml(a.texte)}</p>
          </div>
        `);
      });

    if (!list.children.length) {
      list.innerHTML = `<div class="item"><p class="muted">Aucun résultat.</p></div>`;
    }
  }

  search?.addEventListener("input", draw);
  filter?.addEventListener("change", draw);
  draw();
}

// ---------- CALENDRIER ----------
async function initCalendrier() {
  const list = document.getElementById("eventsList");
  if (!list) return;

  const filter = document.getElementById("eventsFilter");
  let data = [];
  try {
    data = (await loadJSON("./data/calendrier.json")).sort(byDateAsc);
  } catch {
    list.innerHTML = `<div class="item"><p class="muted">Impossible de charger le calendrier.</p></div>`;
    return;
  }

  function draw() {
    const f = filter?.value || "all";
    list.innerHTML = "";
    data
      .filter(e => (f === "all" ? true : (e.type === f)))
      .forEach(e => {
        renderItem(list, `
          <div class="item">
            <div class="item__top">
              ${badge(e.type || "info", e.type || "activité")}
              <span class="muted">${escapeHtml(e.date)} ${escapeHtml(e.heure || "")}</span>
            </div>
            <h3>${escapeHtml(e.titre)}</h3>
            <p>${escapeHtml(e.lieu || "")}</p>
            ${e.details ? `<p class="muted" style="margin-top:8px">${escapeHtml(e.details)}</p>` : ""}
          </div>
        `);
      });

    if (!list.children.length) {
      list.innerHTML = `<div class="item"><p class="muted">Aucune activité.</p></div>`;
    }
  }

  filter?.addEventListener("change", draw);
  draw();
}

// ---------- REPAS ----------
async function initRepas() {
  const list = document.getElementById("repasList");
  if (!list) return;

  let data = [];
  try {
    data = (await loadJSON("./data/repas.json")).sort(byDateAsc);
  } catch {
    list.innerHTML = `<div class="item"><p class="muted">Impossible de charger les repas.</p></div>`;
    return;
  }

  list.innerHTML = "";
  data.forEach(r => {
    const manque = Math.max(0, (r.besoin_cuisiniers || 0) - (r.cuisiniers || 0));
    const statusBadge =
      manque > 0 ? badge("need", `Il manque ${manque} volontaire${manque>1?"s":""}`) :
                  badge("ok", "Équipe complète");

    renderItem(list, `
      <div class="item">
        <div class="item__top">
          ${statusBadge}
          <span class="muted">${escapeHtml(r.date)} ${escapeHtml(r.heure || "")}</span>
        </div>
        <h3>${escapeHtml(r.titre || "Repas communautaire")}</h3>
        <p>${escapeHtml(r.lieu || "")}</p>
        ${r.note ? `<p class="muted" style="margin-top:8px">${escapeHtml(r.note)}</p>` : ""}
      </div>
    `);
  });
}

// ---------- BOOT ----------
registerSW();
setupInstallButton();
initHome();
initAnnonces();
initCalendrier();
initRepas();
