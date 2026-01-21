// Hilltop Job Board - app.js
// Connects to your Apps Script calendar proxy and renders Today / Tomorrow / This Week / This Month

const CONFIG = {
  proxyUrl:
    "https://script.google.com/macros/s/AKfycbxspDG4qJhwKLXdxxvAMrkXaIJyj4Fpbhju8cCZtkn9pHnPp4DgP660LeIdpJARw2lU/exec",

  // How far ahead to include in the raw lists (we'll change this later for true week/month grids)
  weekDaysAhead: 7,
  monthDaysAhead: 31
};

function setLoading() {
  const todayEl = document.getElementById("today");
  const tomorrowEl = document.getElementById("tomorrow");
  const weekEl = document.getElementById("week");
  const monthEl = document.getElementById("month");

  if (todayEl) todayEl.innerHTML = "<h2>Today</h2><p>Loading…</p>";
  if (tomorrowEl) tomorrowEl.innerHTML = "<h2>Tomorrow</h2><p>Loading…</p>";
  if (weekEl) weekEl.innerHTML = "<h2>This Week</h2><p>Loading…</p>";
  if (monthEl) monthEl.innerHTML = "<h2>This Month</h2><p>Loading…</p>";
}

function setError(msg) {
  const ids = ["today", "tomorrow", "week", "month"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<h2>${titleFor(id)}</h2><p style="opacity:.9;">${escapeHtml(msg)}</p>`;
  });
}

function titleFor(id) {
  if (id === "today") return "Today";
  if (id === "tomorrow") return "Tomorrow";
  if (id === "week") return "This Week";
  if (id === "month") return "This Month";
  return id;
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

function renderSection(id, events) {
  const el = document.getElementById(id);
  if (!el) return;

  const heading = `<h2>${titleFor(id)}</h2>`;

  if (!events.length) {
    el.innerHTML = heading + `<p style="opacity:.85;">No events.</p>`;
    return;
  }

  el.innerHTML = heading + events.map(renderEvent).join("");
}

async function loadCalendar() {
  if (!CONFIG.proxyUrl || CONFIG.proxyUrl.includes("PASTE_YOUR_PROXY_EXEC_URL_HERE")) {
    setError("Calendar proxy URL is not set in app.js (CONFIG.proxyUrl).");
    return;
  }

  const url = CONFIG.proxyUrl.replace(/\/$/, "") + "?mode=events";

  let data;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    setError(`Could not load calendar (${err.message}).`);
    return;
  }

  if (!data || !Array.isArray(data.events)) {
    setError("Calendar proxy returned unexpected data.");
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

  // These are your original working sections
  const todayEvents = events.filter((ev) => sameDay(ev._start, today0));
  const tomorrowEvents = events.filter((ev) => sameDay(ev._start, tomorrow0));

  // Temporary lists (we’ll replace these with true grid rendering next)
  const weekEvents = events.filter((ev) => ev._start >= today0 && ev._start < weekEnd);
  const monthEvents = events.filter((ev) => ev._start >= today0 && ev._start < monthEnd);

  // “Separate fuses” — if week/month rendering ever breaks, today/tomorrow still show
  try { renderSection("today", todayEvents); } catch (e) {}
  try { renderSection("tomorrow", tomorrowEvents); } catch (e) {}
  try { renderSection("week", weekEvents); } catch (e) {}
  try { renderSection("month", monthEvents); } catch (e) {}
}

document.addEventListener("DOMContentLoaded", () => {
  setLoading();
  loadCalendar();
});

