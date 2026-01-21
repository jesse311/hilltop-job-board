/* =========================================================
   Hilltop Job Board - Tizen/Signage Safe Build
   - NO fetch()
   - NO async/await
   - JSONP for calendar + tickers (works around CORS + old browsers)
   - ES5-ish (no arrow funcs, no const/let, no template literals)
========================================================= */

(function () {
  // ===== CONFIG =====
  var CONFIG = {
    proxyUrl: "https://script.google.com/macros/s/AKfycbxspDG4qJhwKLXdxxvAMrkXaIJyj4Fpbhju8cCZtkn9pHnPp4DgP660LeIdpJARw2lU/exec",
    weekMode: "mon-fri",
    monthMode: "current",
    tickerRefreshMs: 2 * 60 * 1000
  };

  function $(id) { return document.getElementById(id); }

  function setStatus(text) {
    var s = $("status");
    if (s) s.textContent = "Status: " + text;
  }

  function escapeHtml(str) {
    str = String(str);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseDateSafe(val) {
    var d = new Date(val);
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
    var start = parseDateSafe(ev.start);
    var end = parseDateSafe(ev.end);
    if (!start) return "";
    if (ev.allDay) return "All day";

    // Keep this simple for older browsers
    var s = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (!end) return s;
    var e = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return s + " - " + e;
  }

  // =========================================================
  // JSONP HELPER
  // =========================================================
  function jsonp(url, cbOk, cbErr) {
    var cbName = "__jsonp_cb_" + String(Date.now()) + "_" + String(Math.floor(Math.random() * 100000));
    var script = document.createElement("script");

    window[cbName] = function (data) {
      cleanup();
      cbOk && cbOk(data);
    };

    function cleanup() {
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    script.onerror = function () {
      cleanup();
      cbErr && cbErr(new Error("JSONP load failed"));
    };

    // Add callback param
    var joiner = (url.indexOf("?") >= 0) ? "&" : "?";
    script.src = url + joiner + "callback=" + encodeURIComponent(cbName) + "&_ts=" + Date.now();
    document.head.appendChild(script);
  }

  // =========================================================
  // AUTO-FIT (your “no cutoff” rule)
  // =========================================================
  function _fitsBox(box) {
    var fudge = 2;
    return (
      box.scrollHeight <= box.clientHeight + fudge &&
      box.scrollWidth <= box.clientWidth + fudge
    );
  }

  function fitTextToBox(box, min, max) {
    var target = box.querySelector(".fit-text");
    if (!target) return;

    target.style.fontSize = max + "px";
    if (_fitsBox(box)) return;

    var lo = min;
    var hi = max;
    while (hi - lo > 0.25) {
      var mid = (lo + hi) / 2;
      target.style.fontSize = mid + "px";
      if (_fitsBox(box)) lo = mid;
      else hi = mid;
    }
    target.style.fontSize = lo + "px";
  }

  var _fitQueued = false;
  function queueFitAll() {
    if (_fitQueued) return;
    _fitQueued = true;
    requestAnimationFrame(function () {
      _fitQueued = false;

      var i, boxes;

      boxes = document.querySelectorAll(".fit-today");
      for (i = 0; i < boxes.length; i++) fitTextToBox(boxes[i], 8, 22);

      boxes = document.querySelectorAll(".fit-tomorrow");
      for (i = 0; i < boxes.length; i++) fitTextToBox(boxes[i], 8, 22);

      boxes = document.querySelectorAll(".fit-week");
      for (i = 0; i < boxes.length; i++) fitTextToBox(boxes[i], 7, 13);

      boxes = document.querySelectorAll(".fit-month");
      for (i = 0; i < boxes.length; i++) fitTextToBox(boxes[i], 6, 11);
    });
  }

  // =========================================================
  // RENDER: TODAY / TOMORROW
  // (Assumes your HTML uses the same containers as before)
  // =========================================================
  function getBox(which) {
    if (which === "week") return $("week") || $("week-grid");
    if (which === "month") return $("month") || $("month-grid");
    return $(which);
  }

  function renderTodayTomorrow(which, events) {
    var el = getBox(which);
    if (!el) return;

    var title = (which === "today") ? "Today" : "Tomorrow";
    var fitClass = (which === "today") ? "fit-today" : "fit-tomorrow";

    if (!events || !events.length) {
      el.innerHTML =
        '<h2>' + title + '</h2>' +
        '<div class="fit-box ' + fitClass + '"><div class="fit-text">No events.</div></div>';
      return;
    }

    var out = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var t = formatTimeRange(ev);
      var name = ev.title ? escapeHtml(ev.title) : "(No title)";
      var loc = ev.location ? ("<br>" + escapeHtml(ev.location)) : "";
      out.push(name + (t ? ("<br>" + escapeHtml(t)) : "") + loc);
    }

    el.innerHTML =
      '<h2>' + title + '</h2>' +
      '<div class="fit-box ' + fitClass + '"><div class="fit-text">' + out.join("<br><br>") + "</div></div>";
  }

  // =========================================================
  // WEEK
  // =========================================================
  function getWeekStart(now) {
    var d = startOfDay(now);
    if (CONFIG.weekMode === "next-5") return d;
    var day = d.getDay(); // 0 Sun .. 6 Sat
    var diffToMon = (day === 0) ? -6 : (1 - day);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
  }

  function renderWeek(events, now) {
    var gridEl = getBox("week");
    if (!gridEl) return;

    var weekStart = getWeekStart(now);
    var days = [];
    for (var i = 0; i < 5; i++) {
      days.push(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
    }

    // bucket by day string
    var byDay = {};
    for (i = 0; i < days.length; i++) byDay[days[i].toDateString()] = [];

    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev._start) continue;
      for (var j = 0; j < days.length; j++) {
        if (sameDay(ev._start, days[j])) {
          byDay[days[j].toDateString()].push(ev);
          break;
        }
      }
    }

    var cards = [];
    for (i = 0; i < days.length; i++) {
      var d = days[i];
      var label = d.toLocaleDateString([], { weekday: "short" });
      var mmdd = d.toLocaleDateString([], { month: "numeric", day: "numeric" });

      var items = byDay[d.toDateString()] || [];
      items.sort(function (a, b) { return a._start - b._start; });

      var body = [];
      if (items.length) {
        for (j = 0; j < items.length; j++) {
          var ev2 = items[j];
          var t2 = formatTimeRange(ev2);
          var n2 = ev2.title ? escapeHtml(ev2.title) : "(No title)";
          body.push((t2 ? (escapeHtml(t2) + " ") : "") + n2);
        }
      } else {
        body.push("No installs");
      }

      cards.push(
        '<div class="wk-card fit-box fit-week">' +
          '<div class="wk-head"><span>' + label + '</span><span>' + mmdd + '</span></div>' +
          '<div class="wk-body"><div class="fit-text">' + body.join("<br>") + '</div></div>' +
        "</div>"
      );
    }

    gridEl.innerHTML = cards.join("");
  }

  // =========================================================
  // MONTH (simple)
  // =========================================================
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function renderMonth(events, now) {
    var gridEl = getBox("month");
    if (!gridEl) return;

    var first = new Date(now.getFullYear(), now.getMonth(), 1);
    var last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    var daysInMonth = last.getDate();
    var startDow = first.getDay();
    var totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

    var byDate = {};
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev._start) continue;
      if (ev._start.getMonth() !== now.getMonth() || ev._start.getFullYear() !== now.getFullYear()) continue;

      var k = ev._start.getFullYear() + "-" + pad2(ev._start.getMonth() + 1) + "-" + pad2(ev._start.getDate());
      if (!byDate[k]) byDate[k] = [];
      byDate[k].push(ev);
    }

    var cells = [];
    for (i = 0; i < totalCells; i++) {
      var dayNum = i - startDow + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        cells.push('<div class="m-cell m-empty"></div>');
        continue;
      }

      var d = new Date(now.getFullYear(), now.getMonth(), dayNum);
      var key = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      var items = byDate[key] || [];
      items.sort(function (a, b) { return a._start - b._start; });

      var maxShow = 3;
      var lines = [];
      for (var j = 0; j < Math.min(items.length, maxShow); j++) {
        var ev3 = items[j];
        var t3 = formatTimeRange(ev3);
        var n3 = ev3.title ? escapeHtml(ev3.title) : "(No title)";
        lines.push((t3 ? (escapeHtml(t3) + " ") : "") + n3);
      }
      if (items.length > maxShow) lines.push("+" + (items.length - maxShow) + " more");

      var isToday = sameDay(startOfDay(now), d);
      cells.push(
        '<div class="m-cell fit-box fit-month' + (isToday ? " m-today" : "") + '">' +
          '<div class="m-day">' + dayNum + '</div>' +
          '<div class="m-events"><div class="fit-text">' + (lines.join("<br>") || "") + "</div></div>" +
        "</div>"
      );
    }

    // DOW header row (keep your existing CSS grid)
    var dowRow =
      '<div class="m-dow">Sun</div><div class="m-dow">Mon</div><div class="m-dow">Tue</div><div class="m-dow">Wed</div>' +
      '<div class="m-dow">Thu</div><div class="m-dow">Fri</div><div class="m-dow">Sat</div>';

    gridEl.innerHTML = dowRow + cells.join("");
  }

  // =========================================================
  // TICKERS (JSONP)
  // =========================================================
  var _tickerAnimations = {};
  function stopTicker(laneId) {
    var a = _tickerAnimations[laneId];
    if (a && a.cancel) { try { a.cancel(); } catch (e) {} }
    _tickerAnimations[laneId] = null;
  }

  function startTicker(laneId, textEl) {
    var lane = $(laneId);
    if (!lane || !textEl) return;

    var windowEl = lane.querySelector(".ticker-window");
    var track = lane.querySelector(".ticker-track");
    if (!windowEl || !track) return;

    stopTicker(laneId);

    var raw = (textEl.textContent || "").replace(/^\s+|\s+$/g, "");
    if (!raw) return;

    var s = raw;
    var sep = " • ";
    while (s.length < 80) s = s + sep + raw;

    textEl.textContent = s + sep + s;

    requestAnimationFrame(function () {
      var winW = windowEl.clientWidth;
      var textW = track.scrollWidth;
      if (!winW || !textW || !track.animate) return; // animate might not exist on some builds

      var pxPerSec = 90;
      var distance = textW + winW;
      var durationMs = (distance / pxPerSec) * 1000;

      var anim = track.animate(
        [
          { transform: "translateX(" + winW + "px)" },
          { transform: "translateX(" + (-textW) + "px)" }
        ],
        {
          duration: Math.max(8000, Math.round(durationMs)),
          iterations: Infinity,
          easing: "linear"
        }
      );

      _tickerAnimations[laneId] = anim;
    });
  }

  function loadTicker(docType) {
    var elId = (docType === "master") ? "ticker-master-text" : "ticker-install-text";
    var laneId = (docType === "master") ? "ticker-master" : "ticker-install";
    var textEl = $(elId);
    if (!textEl) return;

    var base = CONFIG.proxyUrl.replace(/\/$/, "");
    var url = base + "?mode=ticker&doc=" + encodeURIComponent(docType);

    jsonp(
      url,
      function (data) {
        if (!data || data.ok !== true) {
          textEl.textContent = "Ticker error: bad response";
          stopTicker(laneId);
          return;
        }

        var newText = String(data.text || "");
        var oldText = String(textEl.getAttribute("data-last") || "");
        textEl.setAttribute("data-last", newText);

        if (newText !== oldText) {
          textEl.textContent = newText;
          startTicker(laneId, textEl);
        } else {
          if (!_tickerAnimations[laneId]) startTicker(laneId, textEl);
        }
      },
      function (err) {
        textEl.textContent = "Ticker error: " + (err && err.message ? err.message : "failed");
        stopTicker(laneId);
      }
    );
  }

  function loadTickers() {
    loadTicker("master");
    loadTicker("install");
  }

  function restartTickers() {
    var masterEl = $("ticker-master-text");
    var installEl = $("ticker-install-text");
    if (masterEl) { stopTicker("ticker-master"); startTicker("ticker-master", masterEl); }
    if (installEl) { stopTicker("ticker-install"); startTicker("ticker-install", installEl); }
  }

  // =========================================================
  // CALENDAR (JSONP)
  // =========================================================
  function loadCalendar() {
    setStatus("Fetching calendar…");

    var base = CONFIG.proxyUrl.replace(/\/$/, "");
    var url = base + "?mode=events";

    jsonp(
      url,
      function (data) {
        try {
          if (!data || !data.events || !data.events.length) {
            setStatus("Loaded. Events total: 0");
          }

          var events = [];
          for (var i = 0; i < (data.events || []).length; i++) {
            var ev = data.events[i];
            var s = parseDateSafe(ev.start);
            if (!s) continue;
            ev._start = s;
            ev._end = parseDateSafe(ev.end);
            events.push(ev);
          }

          events.sort(function (a, b) { return a._start - b._start; });

          var now = new Date();
          var today0 = startOfDay(now);
          var tomorrow0 = new Date(today0.getTime() + 86400000);

          var todayEvents = [];
          var tomorrowEvents = [];

          for (i = 0; i < events.length; i++) {
            var e = events[i];
            if (sameDay(e._start, today0)) todayEvents.push(e);
            if (sameDay(e._start, tomorrow0)) tomorrowEvents.push(e);
          }

          renderTodayTomorrow("today", todayEvents);
          renderTodayTomorrow("tomorrow", tomorrowEvents);
          renderWeek(events, now);
          renderMonth(events, now);

          queueFitAll();
          setStatus("Loaded. Events total: " + events.length);
        } catch (ex) {
          setStatus("JS error: " + (ex && ex.message ? ex.message : ex));
        }
      },
      function (err) {
        setStatus("Calendar error: " + (err && err.message ? err.message : "failed"));
      }
    );
  }

  // =========================================================
  // BOOT
  // =========================================================
  window.addEventListener("resize", function () {
    queueFitAll();
    restartTickers();
  });

  document.addEventListener("DOMContentLoaded", function () {
    setStatus("Booting…");
    loadCalendar();
    loadTickers();
    setInterval(loadTickers, CONFIG.tickerRefreshMs);

    // One extra fit after fonts settle
    setTimeout(function () {
      queueFitAll();
      restartTickers();
    }, 800);
  });

})();
