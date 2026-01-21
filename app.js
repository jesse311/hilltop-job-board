// Hilltop Job Board - app.js
// Connects to your Apps Script calendar proxy and renders Today / Tomorrow / This Week / This Month

const CONFIG = {
  proxyUrl:
    "https://script.google.com/macros/s/AKfycbxspDG4qJhwKLXdxxvAMrkXaIJyj4Fpbhju8cCZtkn9pHnPp4DgP660LeIdpJARw2lU/exec",

  weekDaysAhead: 7,
  monthDaysAhead: 31
};

// --- Helpers to find the right box even if IDs change ---
function getBox(which) {
  // support both old IDs and new IDs
  if (which === "week") return document.getElementById("week") || document.getElementById("week-grid");
  if (which === "month") return document.getElementById("month") || document.getElementById("month-grid");
  return document.getElementById(which);
}

function titleFor(which) {
  if (which === "today") return "Today";
  if (which === "tomorrow") return "Tomorrow";
  if (which === "week") return "This Week";
  if (which === "month") return "This Month";
  return which;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseDateSafe(val) {
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTimeRange(ev) {
  const start = parseDateSafe(ev.start);
  const end = parseDateSafe(ev.end);
  const allDay = !!ev.allDay;

  if (!start) return "";
  if (allDay) return "All day";

  const opts = { hour: "numeric", minute: "2-digit" };
  const s = start.toLocaleTimeString([], opts);
  if (!end) return s;
  const e = end.toLocaleTimeString([], opts);
  return `${s} – ${e}`;
}

function renderEvent(ev) {
  const time = formatTimeRange(ev);
  const title = ev.title ? escapeHtml(ev.title) : "(No title)";
  const loc = ev.location ? escapeHtml(ev.location) : "";
  const desc = ev.description ? escapeHtml(ev.description) : "";

  return `
    <div class="event">
      <div class="event-title">${title}</div>
      ${time ? `<div class="event-time">${time}</div>` : ""}
      ${loc ? `<div class="event-loc">${loc}</div>` : ""}
      ${desc ? `<div class="event-desc">${desc}</div>` : ""}
    </div>
  `;
}

function setLoading() {
  ["today", "tomorrow", "week", "month"].forEach((which) => {
    const el = getBox(which);
    if (!el) return;
    el.innerHTML = `<h2>${titleFor(which)}</h2><p>Loading…</p>`;
  });
}

function setError(which, msg) {
  const el = getBox(which);
  if (!el) return;
  el.innerHTML = `<h2>${titleFor(which)}</h2><p style="opacity:.9;">${escapeHtml(msg)}</p>`;
}

function renderSection(which, events) {
  const el = getBox(which);
  if (!el) {
    console.error(`[JobBoard] Missing HTML element for "${which}". Expected id="${which}" or id="${which}-grid".`);
    return;
  }

  const heading = `<h2>${titleFor(which)}</h2>`;

  if (!events || !events.length) {
    el.innerHTML = heading + `<p style="opacity:.85;">No events.</p>`;
    return;
  }

  el.innerHTML = heading + events.map(renderEvent).join("");
}

async function loadCalendar() {
  if (!CONFIG.proxyUrl) {
    ["today", "tomorrow", "week", "month"].forEach((w) => setError(w, "Calendar proxy URL is not set."));
    return;
  }

  const url = CONFIG.proxyUrl.replace(/\/$/, "") + "?mode=events";

  let data;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    ["today", "tomorrow", "week", "month"].forEach((w) => setError(w, `Could not load calendar (${err.message}).`));
    return;
  }

  if (!data || !Array.isArray(data.events)) {
    ["today", "tomorrow", "week", "month"].forEach((w) => setError(w, "Calendar proxy returned unexpected data."));
    return;
  }

  const events = data.events
    .map((ev) => ({
      ...ev,
      _start: parseDateSafe(ev.start),
      _end: parseDateSafe(ev.end)
    }))
    .filter((ev) => ev._start)
    .sort((a, b) => a._start - b._start);

  const now = new Date();
  const today0 = startOfDay(now);
  const tomorrow0 = new Date(today0.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(today0.getTime() + CONFIG.weekDaysAhead * 24 * 60 * 60 * 1000);
  const monthEnd = new Date(today0.getTime() + CONFIG.monthDaysAhead * 24 * 60 * 60 * 1000);

  const todayEvents = events.filter((ev) => sameDay(ev._start, today0));
  const tomorrowEvents = events.filter((ev) => sameDay(ev._start,_
