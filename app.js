// Hilltop Job Board - app.js (diagnostic + robust)

const CONFIG = {
  proxyUrl:
    "https://script.google.com/macros/s/AKfycbxspDG4qJhwKLXdxxvAMrkXaIJyj4Fpbhju8cCZtkn9pHnPp4DgP660LeIdpJARw2lU/exec",
  weekDaysAhead: 7,
  monthDaysAhead: 31
};

function $(id) { return document.getElementById(id); }

function getBox(which) {
  if (which === "week") return $("week") || $("week-grid");
  if (which === "month") return $("month") || $("month-grid");
  return $(which);
}

function setStatus(text) {
  const s = $("status");
  if (s) s.textContent = `Status: ${text}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function titleFor(which) {
  if (which === "today") return "Today";
  if (which === "tomorrow") return "Tomorrow";
  if (which === "week") return "This Week";
  if (which === "month") return "This Month";
  return which;
}

function setBox(which, html) {
  const el = getBox(which);
  if (!el) return;
  el.innerHTML = html;
}

function setLoading() {
  ["today", "tomorrow", "week", "month"].forEach((which) => {
    setBox(which, `<h2>${titleFor(which)}</h2><p>Loading…</p>`);
  });
}

function setError(which, msg) {
  setBox(which, `<h2>${titleFor(which)}</h2><p style="opacity:.9;">${escapeHtml(msg)}</p>`);
}

function parseDateSafe(val) {
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTimeRange(ev) {
  const start = parseDateSafe(ev.start);
  const end = parseDateSafe(ev.end);
  if (!start) return "";
  if (ev.allDay) return "All day";
  const opts = { hour: "numeric", minute: "2-digit" };
  const s = start.toLocaleTimeString([], opts);
  if (!end) return s;
  const e = end.toLocaleTimeString([], opts);
  return `${s} – ${e}`;
}

function renderEvent(ev) {
  const time = formatTimeRange(ev);
  const title = ev.title ? escapeHtml(ev.title) : "(No title)";
  return `
    <div class="event">
      <div class="event-title">${title}</div>
      ${time ? `<div class="event-time">${time}</div>` : ""}
    </div>
  `;
}

function renderList(which, events) {
  if (!events || !events.length) {
    setBox(which, `<h2>${titleFor(which)}</h2><p style="opacity:.85;">No events.</p>`);
    return;
  }
  setBox(which, `<h2>${titleFor(which)}</h2>` + events.map(renderEvent).join(""));
}

async function loadCalendar() {
  try {
    setStatus("JS running, fetching calendar…");

    const url = CONFIG.proxyUrl.replace(/\/$/, "") + "?mode=events";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Calendar fetch failed (HTTP ${res.status})`);

    const data = await res.json();
    if (!data || !Array.isArray(data.events)) throw new Error("Calendar returned unexpected JSON");

    const events = data.events
      .map((ev) => ({ ...ev, _start: parseDateSafe(ev.start) }))
      .filter((ev) => ev._start)
      .sort((a, b) => a._start - b._start);

    const now = new Date();
    const today0 = startOfDay(now);
    const tomorrow0 = new Date(today0.getTime() + 86400000);
    const weekEnd = new Date(today0.getTime() + CONFIG.weekDaysAhead * 86400000);
    const monthEnd = new Date(today0.getTime() + CONFIG.monthDaysAhead * 86400000);

    const todayEvents = events.filter((ev) => sameDay(ev._start, today0));
    const tomorrowEvents = events.filter((ev) => sameDay(ev._start, tomorrow0));
    const weekEvents = events.filter((ev) => ev._start >= today0 && ev._start < weekEnd);
    const monthEvents = events.filter((ev) => ev._start >= today0 && ev._start < monthEnd);

    renderList("today", todayEvents);
    renderList("tomorrow", tomorrowEvents);
    renderList("week", weekEvents);
    renderList("month", monthEvents);

    setStatus(`Loaded. Events total: ${events.length} | Week: ${weekEvents.length} | Month: ${monthEvents.length}`);
  } catch (e) {
    setStatus(`JS error: ${e.message}`);
    ["today", "tomorrow", "week", "month"].forEach((w) => setError(w, e.message));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setStatus("DOMContentLoaded fired");
  setLoading();
  loadCalendar();
});
