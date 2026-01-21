document.getElementById("status").textContent =
  "Status: JOB BOARD + AUTO-FIT + TICKERS LOADED ✅";

const CONFIG = {
  proxyUrl:
    "https://script.google.com/macros/s/AKfycbxspDG4qJhwKLXdxxvAMrkXaIJyj4Fpbhju8cCZtkn9pHnPp4DgP660LeIdpJARw2lU/exec",

  // Week view style:
  // "mon-fri" = shows Monday–Friday of the current week
  // "next-5"  = shows next 5 days starting today
  weekMode: "mon-fri",

  // Month view shows the current month grid
  monthMode: "current",

  // How often to refresh tickers (ms)
  tickerRefreshMs: 2 * 60 * 1000
};

function $(id) {
  return document.getElementById(id);
}

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

function hoistHeaderOutOfGrid(gridEl, fallbackText) {
  if (!gridEl) return;
  const parent = gridEl.closest("section");
  if (!parent) return;

  const sectionH2 = parent.querySelector(":scope > h2");
  if (sectionH2) return;

  const innerH2 = gridEl.querySelector("h2");
  if (innerH2) {
    innerH2.remove();
    parent.insertBefore(innerH2, gridEl);
    return;
  }

  const h2 = document.createElement("h2");
  h2.textContent = fallbackText || "";
  parent.insertBefore(h2, gridEl);
}

/* =========================================================
   TEXT AUTO-FIT (NO CUTOFFS)
   - Each section fitted independently:
     .fit-today, .fit-tomorrow, .fit-week, .fit-month
   ========================================================= */

function _fitsBox(box) {
  // 1–3px cushion helps prevent “zoom rounding” clipping
  const fudge = 2;
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

  target.style.fontSize = max + "px";

  if (_fitsBox(box)) return;

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

    document.querySelectorAll(".fit-today").forEach((box) =>
      fitTextToBox(box, { min: 8, max: 22 })
    );
    document.querySelectorAll(".fit-tomorrow").forEach((box) =>
      fitTextToBox(box, { min: 8, max: 22 })
    );

    document.querySelectorAll(".fit-week").forEach((box) =>
      fitTextToBox(box, { min: 7, max: 13 })
    );

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

// ---------- WEEK ----------
function getWeekStart(now) {
  const d = startOfDay(now);
  if (CONFIG.weekMode === "next-5") return d;

  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
}

function renderWeek(events, now) {
  const gridEl = getBox("week");
  if (!gridEl) return;

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

  gridEl.innerHTML = cards;
}

// ---------- MONTH ----------
function renderMonth(events, now) {
  const gridEl = getBox("month");
  if (!gridEl) return;

  hoistHeaderOutOfGrid(gridEl, "This Month");

  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = last.getDate();

  const startDow = first.getDay();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

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

  gridEl.innerHTML = `${dowRow}${cells}`;
}

/* =========================================================
   TICKERS
   - Pull text from proxy:
       ?mode=ticker&doc=master
       ?mode=ticker&doc=install
   - Smooth scrolling using Web Animations API
   ========================================================= */

const _tickerAnimations = new Map();

function _stopTicker(laneId) {
  const a = _tickerAnimations.get(laneId);
  if (a) {
    try { a.cancel(); } catch (e) {}
  }
  _tickerAnimations.delete(laneId);
}

function _startTicker(laneId, textEl) {
  const lane = document.getElementById(laneId);
  if (!lane || !textEl) return;

  const windowEl = lane.querySelector(".ticker-window");
  const track = lane.querySelector(".ticker-track");
  if (!windowEl || !track) return;

  // Stop any previous animation for this lane
  _stopTicker(laneId);

  // If empty, don't animate
  const raw = (textEl.textContent || "").trim();
  if (!raw) return;

  // Make sure there's enough length so it "feels" like a ticker even if short
  // Repeat with separator until it's long enough
  let s = raw;
  const sep = "   •   ";
  while (s.length < 80) s = s + sep + raw;

  // Put text inside track
  // We duplicate the string to make a seamless loop
  textEl.textContent = s + sep + s;

  // Measure widths (after paint)
  requestAnimationFrame(() => {
    const winW = windowEl.clientWidth;
    const textW = track.scrollWidth;

    if (!winW || !textW) return;

    // Speed: pixels per second.
    // Bigger = faster. We keep it readable.
    const pxPerSec = 90; // signage-friendly default
    const distance = textW + winW;
    const durationMs = (distance / pxPerSec) * 1000;

    // Animate from right edge to left beyond text
    const anim = track.animate(
      [
        { transform: `translateX(${winW}px)` },
        { transform: `translateX(-${textW}px)` }
      ],
      {
        duration: Math.max(8000, Math.round(durationMs)),
        iterations: Infinity,
        easing: "linear"
      }
    );

    _tickerAnimations.set(laneId, anim);
  });
}

async function loadTicker(docType) {
  const elId = docType === "master" ? "ticker-master-text" : "ticker-install-text";
  const laneId = docType === "master" ? "ticker-master" : "ticker-install";
  const textEl = document.getElementById(elId);
  if (!textEl) return;

  try {
    const base = CONFIG.proxyUrl.replace(/\/$/, "");
    const url = `${base}?mode=ticker&doc=${encodeURIComponent(docType)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Ticker fetch failed (HTTP ${res.status})`);

    const data = await res.json();
    if (!data || data.ok !== true) {
      throw new Error(data && data.error ? data.error : "Ticker returned bad JSON");
    }

    // If unchanged, don't restart animation (keeps motion smooth)
    const newText = String(data.text || "").trim();
    const oldText = (textEl.getAttribute("data-last") || "").trim();

    textEl.setAttribute("data-last", newText);

    if (newText !== oldText) {
      textEl.textContent = newText || "";
      _startTicker(laneId, textEl);
    } else {
      // Still ensure animation exists (first-load or after resize)
      if (!_tickerAnimations.get(laneId)) _startTicker(laneId, textEl);
    }

  } catch (err) {
    textEl.textContent = `Ticker error: ${String(err.message || err)}`;
    _stopTicker(laneId);
  }
}

function loadTickers() {
  loadTicker("master");
  loadTicker("install");
}

function restartTickers() {
  const masterEl = document.getElementById("ticker-master-text");
  const installEl = document.getElementById("ticker-install-text");
  if (masterEl)_toggleRestart("ticker-master", masterEl);
  if (installEl) _toggleRestart("ticker-install", installEl);
}

function _toggleRestart(laneId, textEl) {
  // Force restart even if text unchanged (useful on resize)
  _stopTicker(laneId);
  _startTicker(laneId, textEl);
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

window.addEventListener("resize", () => {
  queueFitAll();
  // Resize changes ticker geometry: restart belts
  restartTickers();
});

document.addEventListener("DOMContentLoaded", () => {
  setStatus("DOMContentLoaded fired");

  loadCalendar();

  // Load tickers immediately, then refresh on a timer
  loadTickers();
  setInterval(loadTickers, CONFIG.tickerRefreshMs);

  // Re-fit once fonts are definitely loaded (prevents surprise clipping)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      queueFitAll();
      restartTickers();
    });
  }
});
