document.getElementById("status").textContent =
  "Status: NEW WEEK/MONTH FORMAT SCRIPT LOADED ✅";

const CONFIG = {
  proxyUrl:
    "https://script.google.com/macros/s/AKfycbxspDG4qJhwKLXdxxvAMrkXaIJyj4Fpbhju8cCZtkn9pHnPp4DgP660LeIdpJARw2lU/exec",

  // Week view style:
  // "mon-fri" = shows Monday–Friday of the current week
  // "next-5"  = shows next 5 days starting today
  weekMode: "mon-fri",

  // Month view shows the current month grid
  monthMode: "current",
};

function $(id) {
  return document.getElementById(id);
}

/**
 * Your HTML currently uses:
 *   #week-grid  (and/or #month-grid)
 * and sometimes older versions used:
 *   #week / #month
 * This helper returns whichever exists.
 */
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
  if (!start) return "";
  if (ev.allDay) return "All day";
  const opts = { hour: "numeric", minute: "2-digit" };
  const s = start.toLocaleTimeString([], opts);
  if (!end) return s;
  const e = end.toLocaleTimeString([], opts);
  return `${s} – ${e}`;
}

/**
 * IMPORTANT LAYOUT FIX:
 * If a header <h2> is inside #week-grid or #month-grid,
 * it steals grid space (looks like a “giant left column”).
 * This function moves the header OUT to the parent <section>
 * so the grid can stretch full width.
 */
function hoistHeaderOutOfGrid(gridEl, fallbackText) {
  if (!gridEl) return;
  const parent = gridEl.closest("section");
  if (!parent) return;

  // If there is already a section-level h2, do nothing
  const sectionH2 = parent.querySelector(":scope > h2");
  if (sectionH2) return;

  // If there is an h2 INSIDE the grid, move it out
  const innerH2 = gridEl.querySelector("h2");
  if (innerH2) {
    innerH2.remove();
    parent.insertBefore(innerH2, gridEl);
    return;
  }

  // Otherwise create one
  const h2 = document.createElement("h2");
  h2.textContent = fallbackText || "";
  parent.insertBefore(h2, gridEl);
}

/* =========================================================
   TEXT AUTO-FIT (NO CUTOFFS)
   - Each section is fitted independently:
     .fit-today, .fit-tomorrow, .fit-week, .fit-month
   - We shrink text until it fits inside its box.
   ========================================================= */

function _fitsBox(box) {
  // small fudge factor helps prevent “barely fits” clipping
  const fudge = 1;
  return (
    box.scrollHeight <= box.clientHeight + fudge &&
    box.scrollWidth <= box.clientWidth + fudge
  );
}

function fitTextToBox(box, opts = {}) {
  const target = box.querySelector(".fit-text");
  if (!target) return;

  const min = typeof opts.min === "number" ? opts.min : 6;
  const max = typeof opts.max === "number" ? opts.max : 24;

  // Reset to max so we’re not stuck from previous run
  target.style.fontSize = max + "px";

  // If it already fits at max, we’re done
  if (_fitsBox(box)) return;

  // Binary-search the best size between min/max
  let lo = min;
  let hi = max;

  while (hi - lo > 0.25) {
    const mid = (lo + hi) / 2;
    target.style.fontSize = mid + "px";
    if (_fitsBox(box)) lo = mid;
    else hi = mid;
  }

  target.style.fontSize = lo + "px";
}

let _fitQueued = false;
function queueFitAll() {
  if (_fitQueued) return;
  _fitQueued = true;

  requestAnimationFrame(() => {
    _fitQueued = false;

    // TODAY / TOMORROW (big “10-foot view”)
    document.querySelectorAll(".fit-today").forEach((box) =>
      fitTextToBox(box, { min: 8, max: 22 })
    );
    document.querySelectorAll(".fit-tomorrow").forEach((box) =>
      fitTextToBox(box, { min: 8, max: 22 })
    );

    // WEEK (100-foot view)
    document.querySelectorAll(".fit-week").forEach((box) =>
      fitTextToBox(box, { min: 7, max: 13 })
    );

    // MONTH (1000-foot view)
    document.querySelectorAll(".fit-month").forEach((box) =>
      fitTextToBox(box, { min: 6, max: 11 })
    );
  });
}

// ---------- TODAY / TOMORROW ----------
function renderTodayTomorrow(which, events) {
  const el = getBox(which);
  if (!el) return;

  const title = which === "today" ? "Today" : "Tomorrow";
  const fitClass = which === "today" ? "fit-today" : "fit-tomorrow";

  if (!events.length) {
    el.innerHTML = `<h2>${title}</h2>
      <div class="fit-box ${fitClass}">
        <div class="fit-text" style="line-height:1.25; opacity:.85;">No events.</div>
      </div>`;
    return;
  }

  const lines = events.map((ev) => {
    const t = formatTimeRange(ev);
    const name = ev.title ? escapeHtml(ev.title) : "(No title)";
    const loc = ev.location ? `<br>${escapeHtml(ev.location)}` : "";
    return `${name}${t ? `<br>${escapeHtml(t)}` : ""}${loc}`;
  });

  el.innerHTML = `<h2>${title}</h2>
    <div class="fit-box ${fitClass}">
      <div class="fit-text" style="line-height:1.25;">${lines.join(
        "<br><br>"
      )}</div>
    </div>`;
}

// ---------- WEEK (5 day cards) ----------
function getWeekStart(now) {
  const d = startOfDay(now);
  if (CONFIG.weekMode === "next-5") return d;

  // mon-fri mode:
  // JS getDay(): Sun=0, Mon=1, ... Sat=6
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day; // Sunday -> go back 6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
}

function renderWeek(events, now) {
  const gridEl = getBox("week");
  if (!gridEl) return;

  // Make sure the Week header isn't trapped inside the grid
  hoistHeaderOutOfGrid(gridEl, "This Week");

  const weekStart = getWeekStart(now);
  const days = [];
  for (let i = 0; i < 5; i++) {
    days.push(
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + i
      )
    );
  }

  // Group events by day
  const byDay = {};
  days.forEach((d) => {
    byDay[d.toDateString()] = [];
  });

  events.forEach((ev) => {
    if (!ev._start) return;
    for (const d of days) {
      if (sameDay(ev._start, d)) {
        byDay[d.toDateString()].push(ev);
        break;
      }
    }
  });

  // Build cards (NO extra wrapper div.week-grid)
  const cards = days
    .map((d) => {
      const label = d.toLocaleDateString([], { weekday: "short" });
      const mmdd = d.toLocaleDateString([], { month: "numeric", day: "numeric" });
      const items = (byDay[d.toDateString()] || []).sort(
        (a, b) => a._start - b._start
      );

      const body = items.length
        ? items
            .map((ev) => {
              const t = formatTimeRange(ev);
              const name = ev.title ? escapeHtml(ev.title) : "(No title)";
              return `<div class="wk-item"><span class="wk-time">${escapeHtml(
                t
              )}</span>${name}</div>`;
            })
            .join("")
        : `<div class="wk-empty">No installs</div>`;

      return `
        <div class="wk-card">
          <div class="wk-head"><span>${label}</span><span>${mmdd}</span></div>
          <div class="wk-body fit-box fit-week"><div class="fit-text">${body}</div></div>
        </div>
      `;
    })
    .join("");

  // Put ONLY cards inside #week-grid (no header, no nested grid)
  gridEl.innerHTML = cards;
}

// ---------- MONTH (real calendar grid) ----------
function renderMonth(events, now) {
  const gridEl = getBox("month");
  if (!gridEl) return;

  // Make sure the Month header isn't trapped inside the grid
  hoistHeaderOutOfGrid(gridEl, "This Month");

  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = last.getDate();

  // Sunday-first grid
  const startDow = first.getDay(); // 0..6
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  // Group events by YYYY-MM-DD
  const byDate = {};
  function keyFor(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  events.forEach((ev) => {
    if (!ev._start) return;
    if (
      ev._start.getMonth() !== now.getMonth() ||
      ev._start.getFullYear() !== now.getFullYear()
    )
      return;
    const k = keyFor(ev._start);
    (byDate[k] ||= []).push(ev);
  });

  const dowRow = `
    <div class="m-cell" style="background:transparent; font-weight:700; text-align:center;">Sun</div>
    <div class="m-cell" style="background:transparent; font-weight:700; text-align:center;">Mon</div>
    <div class="m-cell" style="background:transparent; font-weight:700; text-align:center;">Tue</div>
    <div class="m-cell" style="background:transparent; font-weight:700; text-align:center;">Wed</div>
    <div class="m-cell" style="background:transparent; font-weight:700; text-align:center;">Thu</div>
    <div class="m-cell" style="background:transparent; font-weight:700; text-align:center;">Fri</div>
    <div class="m-cell" style="background:transparent; font-weight:700; text-align:center;">Sat</div>
  `;

  let cells = "";
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells += `<div class="m-cell m-empty"></div>`;
      continue;
    }

    const d = new Date(now.getFullYear(), now.getMonth(), dayNum);
    const k = keyFor(d);
    const items = (byDate[k] || []).sort((a, b) => a._start - b._start);

    const maxShow = 3;
    const shown = items
      .slice(0, maxShow)
      .map((ev) => {
        const t = formatTimeRange(ev);
        const name = ev.title ? escapeHtml(ev.title) : "(No title)";
        return `<div class="m-item">${escapeHtml(t)} ${name}</div>`;
      })
      .join("");

    const more =
      items.length > maxShow
        ? `<div class="m-more">+${items.length - maxShow} more</div>`
        : "";

    const isToday = sameDay(startOfDay(now), d);

    cells += `
      <div class="m-cell ${isToday ? "m-today" : ""}">
        <div class="m-day">${dayNum}</div>
        <div class="m-events fit-box fit-month"><div class="fit-text">${shown}${more}</div></div>
      </div>
    `;
  }

  // Put ONLY the grid cells inside #month-grid (no month-head wrapper)
  gridEl.innerHTML = `${dowRow}${cells}`;
}

// ---------- main ----------
async function loadCalendar() {
  try {
    setStatus("Fetching calendar…");
    const url = CONFIG.proxyUrl.replace(/\/$/, "") + "?mode=events";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Calendar fetch failed (HTTP ${res.status})`);

    const data = await res.json();
    if (!data || !Array.isArray(data.events))
      throw new Error("Calendar returned unexpected JSON");

    const events = data.events
      .map((ev) => ({
        ...ev,
        _start: parseDateSafe(ev.start),
        _end: parseDateSafe(ev.end),
      }))
      .filter((ev) => ev._start)
      .sort((a, b) => a._start - b._start);

    const now = new Date();
    const today0 = startOfDay(now);
    const tomorrow0 = new Date(today0.getTime() + 86400000);

    const todayEvents = events.filter((ev) => sameDay(ev._start, today0));
    const tomorrowEvents = events.filter((ev) => sameDay(ev._start, tomorrow0));

    renderTodayTomorrow("today", todayEvents);
    renderTodayTomorrow("tomorrow", tomorrowEvents);

    renderWeek(events, now);
    renderMonth(events, now);

    // After painting the UI, auto-fit text so nothing cuts off
    queueFitAll();

    setStatus(`Loaded. Events total: ${events.length}`);
  } catch (e) {
    setStatus(`JS error: ${e.message}`);
    ["today", "tomorrow", "week", "month"].forEach((w) => {
      const el = getBox(w);
      if (el)
        el.innerHTML = `<h2>${titleFor(w)}</h2><p style="opacity:.9;">${escapeHtml(
          e.message
        )}</p>`;
    });
    queueFitAll();
  }
}

function titleFor(which) {
  if (which === "today") return "Today";
  if (which === "tomorrow") return "Tomorrow";
  if (which === "week") return "This Week";
  if (which === "month") return "This Month";
  return which;
}

window.addEventListener("resize", () => queueFitAll());

document.addEventListener("DOMContentLoaded", () => {
  setStatus("DOMContentLoaded fired");
  loadCalendar();

  // Re-fit once fonts are definitely loaded (prevents surprise clipping)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => queueFitAll());
  }
});
