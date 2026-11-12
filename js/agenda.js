/* ==================== AGENDA ====================
   Export des activités vers les agendas (Apple, Google, Outlook…)
   - fichier .ics (une activité ou toutes les activités à venir)
   - lien « Google Agenda »
   - données structurées (JSON-LD) pour les moteurs de recherche

   Toutes les heures du site sont des heures de Besançon (Europe/Paris).
*/

const TZ = "Europe/Paris";

// Durée par défaut (en minutes) quand une activité n'a pas de champ "duree"
const DUREE_PAR_TYPE = { messe: 60, repas: 120, soiree: 180, sortie: 240 };
const DUREE_DEFAUT = 120;

/* ---------- Utilitaires date ---------- */

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

// "2026-11-11" + "19:00" -> { y, m, d, hh, mm, allDay }
export function parseLocal(dateStr, timeStr) {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!md) return null;
  const y = +md[1], m = +md[2], d = +md[3];
  const mt = /^(\d{1,2})[:h](\d{2})$/.exec(String(timeStr || "").trim());
  if (!mt) return { y, m, d, hh: 0, mm: 0, allDay: true };
  return { y, m, d, hh: +mt[1], mm: +mt[2], allDay: false };
}

function addMinutes(t, minutes) {
  const ms = Date.UTC(t.y, t.m - 1, t.d, t.hh, t.mm) + minutes * 60000;
  const x = new Date(ms);
  return {
    y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(),
    hh: x.getUTCHours(), mm: x.getUTCMinutes(), allDay: t.allDay,
  };
}

function fmtDate(t) {
  return `${pad(t.y, 4)}${pad(t.m)}${pad(t.d)}`;
}

function fmtDateTime(t) {
  return `${fmtDate(t)}T${pad(t.hh)}${pad(t.mm)}00`;
}

function fmtUTCStamp(date) {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

// Décalage de Paris (en minutes) à une heure locale donnée (gère l'heure d'été)
function parisOffsetMinutes(t) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const offsetAt = (ts) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return Math.round((asUTC - ts) / 60000);
  };
  const guess = Date.UTC(t.y, t.m - 1, t.d, t.hh, t.mm);
  const off1 = offsetAt(guess);
  return offsetAt(guess - off1 * 60000);
}

function isoWithOffset(t) {
  const off = parisOffsetMinutes(t);
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${pad(t.y, 4)}-${pad(t.m)}-${pad(t.d)}T${pad(t.hh)}:${pad(t.mm)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/* ---------- Texte ICS ---------- */

function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Pliage des lignes à 75 octets maximum (RFC 5545), sans couper un caractère
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // la ligne de continuation commence par une espace
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function slug(s) {
  return String(s || "activite")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40) || "activite";
}

function dureeMinutes(e) {
  const n = Number(e.duree);
  if (Number.isFinite(n) && n > 0) return n;
  return DUREE_PAR_TYPE[e.type] || DUREE_DEFAUT;
}

function descriptionOf(e) {
  const parts = [];
  if (e.resume) parts.push(e.resume);
  if (e.details) parts.push(e.details);
  if (e.contact) parts.push(`Contact : ${e.contact}`);
  if (e.lien) parts.push(e.lien);
  return parts.join("\n\n");
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  `X-LIC-LOCATION:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function veventLines(e, stamp) {
  const t = parseLocal(e.date, e.heure);
  if (!t) return [];
  const lines = ["BEGIN:VEVENT"];
  lines.push(`UID:${e.date}-${slug(e.titre)}@aumonerie-besancon`);
  lines.push(`DTSTAMP:${stamp}`);
  if (t.allDay) {
    const next = addMinutes(t, 24 * 60);
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(t)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(next)}`);
  } else {
    const end = addMinutes(t, dureeMinutes(e));
    lines.push(`DTSTART;TZID=${TZ}:${fmtDateTime(t)}`);
    lines.push(`DTEND;TZID=${TZ}:${fmtDateTime(end)}`);
  }
  lines.push(`SUMMARY:${icsEscape(e.titre || "Activité")}`);
  if (e.lieu) lines.push(`LOCATION:${icsEscape(e.lieu)}`);
  const desc = descriptionOf(e);
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  if (e.lien && /^https?:\/\//i.test(e.lien)) lines.push(`URL:${e.lien}`);
  // Rappel facultatif : "rappel" = minutes avant le début (0 = au moment même)
  const r = Number(e.rappel);
  if (e.rappel !== undefined && e.rappel !== null && Number.isFinite(r) && r >= 0 && !t.allDay) {
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${icsEscape(e.titre || "Rappel")}`);
    lines.push(r === 0 ? "TRIGGER:PT0S" : `TRIGGER:-PT${Math.round(r)}M`);
    lines.push("END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines;
}

/* ---------- API publique ---------- */

export function eventsToICS(events, now = new Date()) {
  const stamp = fmtUTCStamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aumonerie Besancon//Activites//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Aumônerie - Activités",
    `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...VTIMEZONE,
  ];
  for (const e of events) lines.push(...veventLines(e, stamp));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function eventICSFileName(e) {
  return `${e.date || "activite"}-${slug(e.titre)}.ics`;
}

export function googleCalendarURL(e) {
  const t = parseLocal(e.date, e.heure);
  if (!t) return null;
  let dates;
  if (t.allDay) {
    dates = `${fmtDate(t)}/${fmtDate(addMinutes(t, 24 * 60))}`;
  } else {
    dates = `${fmtDateTime(t)}/${fmtDateTime(addMinutes(t, dureeMinutes(e)))}`;
  }
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.titre || "Activité",
    dates,
    ctz: TZ,
    details: descriptionOf(e),
    location: e.lieu || "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function downloadText(filename, text, mime = "text/calendar;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Lien d'abonnement (webcal://) vers le fichier calendrier.ics du même site
export function subscribeURL() {
  return `webcal://${location.host}/calendrier.ics`;
}

// Données structurées « Event » (aide les moteurs de recherche à afficher les activités)
export function injectEventJSONLD(events) {
  const now = Date.now();
  const items = [];
  for (const e of events) {
    const t = parseLocal(e.date, e.heure);
    if (!t) continue;
    const start = isoWithOffset(t);
    if (new Date(start).getTime() < now) continue;
    const item = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.titre || "Activité",
      startDate: t.allDay ? e.date : start,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      description: e.resume || e.details || undefined,
      location: e.lieu
        ? { "@type": "Place", name: e.lieu, address: { "@type": "PostalAddress", addressLocality: "Besançon", addressCountry: "FR" } }
        : undefined,
    };
    if (!t.allDay) item.endDate = isoWithOffset(addMinutes(t, dureeMinutes(e)));
    items.push(item);
  }
  if (!items.length) return;
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(items);
  document.head.appendChild(s);
}
