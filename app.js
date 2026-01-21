// Hilltop Job Board - app.js
// Connects to your Apps Script calendar proxy and renders Today / Tomorrow / This Week / This Month

const CONFIG = {
  // IMPORTANT: paste your Apps Script Web App URL ending in /exec
  // Example: "https://script.google.com/macros/s/AKfycbxxxxxxx/exec"
  proxyUrl: "https://script.google.com/macros/s/AKfycbxspDG4qJhwKLXdxxvAMrkXaIJyj4Fpbhju8cCZtkn9pHnPp4DgP660LeIdpJARw2lU/exec",

  // How far ahead to consider for "This Week" and "This Month"
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
  ids.forEach(id => {
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
  // val is expected to be ISO string like "2026-01-20T08:00:00.000Z"
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
function weekdayShort(d) {
  return d.toLocaleDateString([], { weekday: "short" }); // Mon, Tue...
}

function dayNum(d) {
  return d.getDate();
}

// 5 boxes: Mon–Fri of the current week (based on today)
function renderWeekGrid(weekEvents) {
  const grid = document.getElementById("weekGrid");
  if (!grid) return;

  const now = new Date();
  const today = startOfDay(now);

  // Build Monday start (Mon=1...Sun=0 in JS)
  const jsDay = today.getDay(); // Sun=0, Mon=1...
  const monday = new Date(today);
  const offsetToMon = (jsDay === 0) ? -6 : (1 - jsDay);
  monday.setDate(today.getDate() + offsetToMon);

  // Create 5 days (Mon-Fri)
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  // Group events into those 5 days
  const byDay = new Map(days.map(d => [d.toDateString(), []]));
  weekEvents.forEach(ev => {
    const d = startOfDay(ev._start);
    const key = d.toDateString();
    if (byDay.has(key)) byDay.get(key).push(ev);
  });

  // Render boxes
  grid.innerHTML = days.map(d => {
    const key = d.toDateString();
    const items = byDay.get(key) || [];
    const eventsHtml = items.length
      ? items.map(e => {
          const t = formatTimeRange(e);
          const title = e.title ? escapeHtml(e.title) : "(No title)";
          return `<div class="wk-item">${t ? `<span class="wk-time">${escapeHtml(t)}</span>` : ""}<span class="wk-title">${title}</span></div>`;
        }).join("")
      : `<div class="wk-empty">—</div>`;

    return `
      <div class="wk-card">
        <div class="wk-head">${weekdayShort(d)} <span class="wk-date">${dayNum(d)}</span></div>
        <div class="wk-body">${eventsHtml}</div>
      </div>
    `;
  }).join("");
}

// Calendar grid for the CURRENT month
function renderMonthGrid(allEvents) {
  const grid = document.getElementById("monthGrid");
  const label = document.getElementById("monthLabel");
  if (!grid) return;

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  if (label) {
    label.textContent = now.toLocaleDateString([], { month: "long", year: "numeric" });
  }

  // Map events by day in this month
  const map = new Map();
  allEvents.forEach(ev => {
    const d = startOfDay(ev._start);
    if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return;
    const key = d.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  });

  // Calendar starts on Sunday
  const startDow = first.getDay(); // 0=Sun
  const totalDays = last.getDate();

  // Build cells: leading blanks + days
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= totalDays; day++) {
    cells.push(new Date(now.getFullYear(), now.getMonth(), day));
  }

  // Pad to full weeks (multiple of 7)
  while (cells.length % 7 !== 0) cells.push(null);

  grid.innerHTML = cells.map(d => {
    if (!d) return `<div class="m-cell m-empty"></div>`;

    const key = d.toDateString();
    const items = map.get(key) || [];

    // show up to 2 items, then +N
    const shown = items.slice(0, 2).map(ev => {
      const title = ev.title ? escapeHtml(ev.title) : "(No title)";
      return `<div class="m-item">${title}</div>`;
    }).join("");

    const more = items.length > 2 ? `<div class="m-more">+${items.length - 2}</div>` : "";

    const isToday = sameDay(d, startOfDay(new Date()));

    return `
      <div class="m-cell ${isToday ? "m-today" : ""}">
        <div class="m-day">${d.getDate()}</div>
        <div class="m-events">${shown}${more}</div>
      </div>
    `;
  }).join("");
}

  const html = events.map(renderEvent).join("");
  el.innerHTML = heading + html;
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

  // Normalize and sort by start time
  const events = data.events
    .map(ev => ({
      ...ev,
      _start: parseDateSafe(ev.start),
      _end: parseDateSafe(ev.end)
    }))
    .filter(ev => ev._start)
    .sort((a, b) => a._start - b._start);

  const now = new Date();
  const today0 = startOfDay(now);
  const tomorrow0 = new Date(today0.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(today0.getTime() + CONFIG.weekDaysAhead * 24 * 60 * 60 * 1000);
  const monthEnd = new Date(today0.getTime() + CONFIG.monthDaysAhead * 24 * 60 * 60 * 1000);

  const todayEvents = events.filter(ev => sameDay(ev._start, today0));
  const tomorrowEvents = events.filter(ev => sameDay(ev._start, tomorrow0));
  const weekEvents = events.filter(ev => ev._start >= today0 && ev._start < weekEnd);
  const monthEvents = events.filter(ev => ev._start >= today0 && ev._start < monthEnd);

   renderSection("today", todayEvents);
  renderSection("tomorrow", tomorrowEvents);

  renderWeekGrid(weekEvents);
  renderMonthGrid(events); // pass all events so month can show everything in current month
}


document.addEventListener("DOMContentLoaded", () => {
  setLoading();
  loadCalendar();
});

