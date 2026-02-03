

/* =========================================================
   Hilltop Job Board - SIGNAGE SAFE + AUTO REFRESH
   - NO fetch()
   - NO async/await
   - JSONP for calendar + tickers (works around CORS + old browsers)
   - ES5-ish (no arrow funcs, no const/let, no template literals)
   - Auto-refresh:
       - Calendar refresh
       - Ticker refresh
       - Full page reload (anti-freeze / anti-cache)
========================================================= */

(function () {
  // ===== CONFIG =====
  var CONFIG = {
    proxyUrl: "https://script.google.com/macros/s/AKfycbxspDG4qJhwKLXdxxvAMrkXaIJyj4Fpbhju8cCZtkn9pHnPp4DgP660LeIdpJARw2lU/exec",

    // Week view style:
    // "mon-fri" = shows Monday–Friday of the current week
    // "next-5"  = shows next 5 days starting today
    weekMode: "mon-fri",

    // Refresh rates (ms)
    tickerRefreshMs: 2 * 60 * 1000,   // tickers update every 2 min
    truckRefreshMs: 30 * 1000,     // truck status update every 30 sec
    calendarRefreshMs: 2 * 60 * 1000, // calendar update every 2 min
    pageReloadMs: 10 * 60 * 1000,     // full page reload every 10 min

    // Weather tickers are optional until the backend endpoints are added.
    // Set to true AFTER we add Apps Script support for weather.
    weatherTickersEnabled: true
  };

  function $(id) { return document.getElementById(id); }

  function firstEl(ids) {
    // ids: array of element IDs
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (el) return el;
    }
    return null;
  }

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

    var s = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (!end) return s;
    var e = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return s + " - " + e;
  }

  // =========================================================
  // JSONP HELPER (old browser friendly)
  // =========================================================
  function jsonp(url, cbOk, cbErr) {
    var cbName = "__jsonp_cb_" + String(Date.now()) + "_" + String(Math.floor(Math.random() * 100000));
    var script = document.createElement("script");

    window[cbName] = function (data) {
      cleanup();
      if (cbOk) cbOk(data);
    };

    function cleanup() {
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    script.onerror = function () {
      cleanup();
      if (cbErr) cbErr(new Error("JSONP load failed"));
    };

    // Add callback param + cache buster
    var joiner = (url.indexOf("?") >= 0) ? "&" : "?";
    script.src = url + joiner + "callback=" + encodeURIComponent(cbName) + "&_ts=" + Date.now();
    document.head.appendChild(script);
  }

  
  // =========================================================
  // TRUCK STATUS (RADAR via Proxy)
  // =========================================================
  function renderTruckPanel(data){
    var body = document.getElementById("truckPanelBody");
    if (!body) return;

    if (!data || data.ok !== true || !data.trucks || !data.trucks.length){
      body.innerHTML = '<div class="truck-row"><div class="truck-left"><div class="truck-name">No active trucks</div><div class="truck-reason">—</div></div><div class="truck-badge">—</div></div>';
      return;
    }

    // sort by sortOrder then displayName
    data.trucks.sort(function(a,b){
      var ao = (a.sortOrder !== undefined && a.sortOrder !== null) ? Number(a.sortOrder) : 999999;
      var bo = (b.sortOrder !== undefined && b.sortOrder !== null) ? Number(b.sortOrder) : 999999;
      if (ao !== bo) return ao - bo;
      var an = (a.displayName || a.truckId || "");
      var bn = (b.displayName || b.truckId || "");
      return an.localeCompare(bn);
    });

    var html = "";
    for (var i=0; i<data.trucks.length; i++){
      var t = data.trucks[i] || {};
      var name = (t.displayName || t.truckId || "TRUCK");
      var state = String(t.state || "GREEN").toUpperCase();
      var cls = "truck-green";
      if (state === "RED") cls = "truck-red";
      else if (state === "YELLOW") cls = "truck-yellow";

      var reason = "";
      if (state !== "GREEN"){
        reason = t.primaryReason || (t.reasons && t.reasons.length ? t.reasons[0] : "");
        // if multiple reasons, show +N more
        var extra = (t.reasons && t.reasons.length) ? (t.reasons.length - (reason ? 1 : 0)) : 0;
        if (extra > 0) reason = reason + "  (+" + extra + " more)";
      }

      html += '<div class="truck-row">' +
                '<div class="truck-left">' +
                  '<div class="truck-name">' + escapeHtml_(name) + '</div>' +
                  '<div class="truck-reason">' + (reason ? escapeHtml_(reason) : "Ready") + '</div>' +
                '</div>' +
                '<div class="truck-badge ' + cls + '">' + escapeHtml_(state) + '</div>' +
              '</div>';
    }
    body.innerHTML = html;
  }

  function loadTruckStatus(){
    var url = CONFIG.proxyUrl + "?mode=truckStatus";
    jsonp(url, function(data){
      renderTruckPanel(data);
    }, function(){
      // keep last known state; if empty, show error
      var body = document.getElementById("truckPanelBody");
      if (body && !body.innerHTML){
        body.innerHTML = '<div class="truck-row"><div class="truck-left"><div class="truck-name">Truck status</div><div class="truck-reason">Proxy error</div></div><div class="truck-badge">—</div></div>';
      }
    });
  }

// =========================================================
  // AUTO-FIT (NO CUTOFFS)
  // =========================================================
  function _fitsBox(box) {
    // Cushion prevents “zoom rounding” clipping
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
  // =========================================================
  function getBox(which) {
    if (which === "week") return $("week") || $("week-grid");
    if (which === "month") return $("month") || $("month-grid");
    return $(which);
  }

  function renderPanelTitle_(title, badgeText, badgeUrgent) {
    var safeTitle = escapeHtml(title);
    var b = (badgeText !== undefined && badgeText !== null) ? String(badgeText) : "";
    b = b.replace(/^\s+|\s+$/g, "");

    if (!b) return safeTitle;

    var cls = "wx-badge" + (badgeUrgent ? " wx-urgent" : "");
    // badgeText is treated as text, not HTML (safer + Tizen-friendly)
    return safeTitle + ' <span class="' + cls + '">' + escapeHtml(b) + "</span>";
  }

  function renderTodayTomorrow(which, events, badgeText, badgeUrgent) {
    var el = getBox(which);
    if (!el) return;

    var title = (which === "today") ? "Today" : "Tomorrow";
    var fitClass = (which === "today") ? "fit-today" : "fit-tomorrow";
    var titleHtml = renderPanelTitle_(title, badgeText, badgeUrgent);

    if (!events || !events.length) {
      el.innerHTML =
        '<div class="panel-title">' + titleHtml + '</div>' +
        '<div class="panel-body ' + fitClass + '"><div class="fit-text">No events.</div></div>';
      return;
    }

    var out = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var t = formatTimeRange(ev);
      var name = ev.title ? escapeHtml(ev.title) : "(No title)";
      var loc = ev.location ? (" — " + escapeHtml(ev.location)) : "";
      out.push(name + (t ? (" (" + escapeHtml(t) + ")") : "") + loc);
    }

    el.innerHTML =
      '<div class="panel-title">' + titleHtml + '</div>' +
      '<div class="panel-body ' + fitClass + '"><div class="fit-text">' + out.join("<br>") + "</div></div>";
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
        '<div class="week-card fit-week">' +
          '<div class="week-card-title">' + label + ' <span class="muted">' + mmdd + "</span></div>" +
          '<div class="week-card-body fit-text">' + body.join("<br>") + "</div>" +
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
        cells.push('<div class="month-cell empty"></div>');
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
        '<div class="month-cell' + (isToday ? " today" : "") + ' fit-month">' +
          '<div class="month-day">' + dayNum + "</div>" +
          '<div class="month-body fit-text">' + (lines.join("<br>") || "") + "</div>" +
        "</div>"
      );
    }

    // DOW header row (keep your existing CSS grid)
    var dowRow =
      '<div class="month-dow">Sun</div>' +
      '<div class="month-dow">Mon</div>' +
      '<div class="month-dow">Tue</div>' +
      '<div class="month-dow">Wed</div>' +
      '<div class="month-dow">Thu</div>' +
      '<div class="month-dow">Fri</div>' +
      '<div class="month-dow">Sat</div>';

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
      if (!winW || !textW || !track.animate) return;

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

  // =========================================================
  // WEATHER TICKERS (optional, behind CONFIG.weatherTickersEnabled)
  // Back-end (Apps Script) will be added later:
  //   - ?mode=weather&kind=shop
  //   - ?mode=weather&kind=jobs
  // Expected response (either form is fine):
  //   { ok:true, text:"..." }
  //   { ok:true, kind:"shop", weather:{ temp_f:38, wind_mph:12, wind_dir:"NW", pop_pct:60 }, place:"Shop" }
  // =========================================================

  // ---------------------------------------------------------
  // COMBINED TOP WEATHER TICKER SUPPORT
  // HTML (index.html) has a single lane:
  //   lane: #ticker-weather-top
  //   text: #ticker-weather-top-text
  // This lane should display BOTH shop + jobs in one scroller.
  // ---------------------------------------------------------
  function getWeatherTopTargets() {
    var lane = $("ticker-weather-top");
    var textEl = $("ticker-weather-top-text");
    if (!lane || !textEl) return null;
    return { laneId: "ticker-weather-top", textEl: textEl };
  }

  var _wxTopCache = { shop: null, jobs: null };

  function formatWeatherTopCombined(shopData, jobsData) {
    // Keep it simple + signage-safe (plain text).
    var shopLine = formatWeatherLine("shop", shopData);
    var jobsLine = formatWeatherLine("jobs", jobsData);

    // If backend returns SHOP WX / JOB WX prefixes, keep them.
    // Otherwise, add clear labels.
    if (shopLine && shopLine.indexOf("SHOP") !== 0) shopLine = "SHOP: " + shopLine;
    if (jobsLine && jobsLine.indexOf("JOB") !== 0 && jobsLine.indexOf("JOBS") !== 0) jobsLine = "JOBS: " + jobsLine;

    return shopLine + "  ⎮⎮  " + jobsLine;
  }

  function loadWeatherTopCombined() {
    if (!CONFIG.weatherTickersEnabled) return;

    var t = getWeatherTopTargets();
    if (!t) return;

    var base = CONFIG.proxyUrl.replace(/\/$/, "");
    var urlShop = base + "?mode=weather&kind=shop";
    var urlJobs = base + "?mode=weather&kind=jobs";

    // We fetch both, then render once so it doesn't "blink".
    jsonp(
      urlShop,
      function (shopData) {
        // If the shop call fails logically, keep last known good.
        if (shopData && shopData.ok === true) _wxTopCache.shop = shopData;

        jsonp(
          urlJobs,
          function (jobsData) {
            if (jobsData && jobsData.ok === true) _wxTopCache.jobs = jobsData;

            // Build combined text from whatever we have (new or cached).
            var combined = formatWeatherTopCombined(_wxTopCache.shop, _wxTopCache.jobs);

            var oldText = String(t.textEl.getAttribute("data-last") || "");
            t.textEl.setAttribute("data-last", combined);

            if (combined !== oldText) {
              // IMPORTANT: make the ticker element plain text before animation duplicates it
              t.textEl.textContent = combined;
              startTicker(t.laneId, t.textEl);
            } else {
              if (!_tickerAnimations[t.laneId]) startTicker(t.laneId, t.textEl);
            }
          },
          function (err2) {
            // Jobs JSONP failed; still try to render cached.
            var combined2 = formatWeatherTopCombined(_wxTopCache.shop, _wxTopCache.jobs);
            t.textEl.textContent = combined2 || ("WEATHER: " + (err2 && err2.message ? err2.message : "failed"));
            startTicker(t.laneId, t.textEl);
          }
        );
      },
      function (err1) {
        // Shop JSONP failed; still try jobs (and/or cached).
        jsonp(
          urlJobs,
          function (jobsData2) {
            if (jobsData2 && jobsData2.ok === true) _wxTopCache.jobs = jobsData2;

            var combined3 = formatWeatherTopCombined(_wxTopCache.shop, _wxTopCache.jobs);
            t.textEl.textContent = combined3 || ("WEATHER: " + (err1 && err1.message ? err1.message : "failed"));
            startTicker(t.laneId, t.textEl);
          },
          function (err3) {
            var msg = "WEATHER: " + ((err1 && err1.message) ? err1.message : "failed");
            if (err3 && err3.message) msg += " / " + err3.message;
            t.textEl.textContent = msg;
            stopTicker(t.laneId);
          }
        );
      }
    );
  }

  function degToCardinal(deg) {
    if (deg === null || deg === undefined || isNaN(Number(deg))) return "";
    var dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    var idx = Math.round(((Number(deg) % 360) / 22.5)) % 16;
    return dirs[idx];
  }

  function formatWeatherLine(kind, data) {
    // kind: "shop" or "jobs"
    if (!data) return "";
    if (data.text) return String(data.text);

    var w = data.weather || {};
    var temp = (w.temp_f !== undefined && w.temp_f !== null) ? (String(w.temp_f) + "°F") : "";
    var windSpd = (w.wind_mph !== undefined && w.wind_mph !== null) ? (String(w.wind_mph) + " mph") : "";
    var windDir = w.wind_dir ? String(w.wind_dir) : (w.wind_dir_deg !== undefined ? degToCardinal(w.wind_dir_deg) : "");
    var pop = (w.pop_pct !== undefined && w.pop_pct !== null) ? (String(w.pop_pct) + "%") : "";

    var label = (kind === "shop") ? "SHOP WX" : "JOB WX";
    var parts = [];
    if (temp) parts.push(temp);
    if (pop) parts.push("POP " + pop);
    if (windSpd) parts.push("Wind " + windSpd + (windDir ? (" " + windDir) : ""));
    return label + ": " + (parts.join(" • ") || "Loading…");
  }

  function getWeatherTickerTargets(kind) {
    // We support multiple IDs so you can add HTML later without re-editing JS.
    // Preferred IDs:
    //   LANE: ticker-shopwx / ticker-jobwx
    //   TEXT: ticker-shopwx-text / ticker-jobwx-text
    var laneIds = (kind === "shop")
      ? ["ticker-shopwx", "ticker-shop-weather", "tickerShopWeather", "ticker-weather-shop"]
      : ["ticker-jobwx", "ticker-jobs-weather", "tickerJobsWeather", "ticker-weather-jobs"];
    var textIds = (kind === "shop")
      ? ["ticker-shopwx-text", "ticker-shop-weather-text", "tickerShopWeatherText", "ticker-weather-shop-text"]
      : ["ticker-jobwx-text", "ticker-jobs-weather-text", "tickerJobsWeatherText", "ticker-weather-jobs-text"];

    // pick first existing lane id
    var laneId = null;
    for (var i = 0; i < laneIds.length; i++) {
      if ($(laneIds[i])) { laneId = laneIds[i]; break; }
    }
    var textEl = firstEl(textIds);

    if (!laneId || !textEl) return null;
    return { laneId: laneId, textEl: textEl };
  }

  function loadWeatherTicker(kind) {
    if (!CONFIG.weatherTickersEnabled) return;

    var t = getWeatherTickerTargets(kind);
    if (!t) return; // HTML not present yet

    var base = CONFIG.proxyUrl.replace(/\/$/, "");
    var url = base + "?mode=weather&kind=" + encodeURIComponent(kind);

    jsonp(
      url,
      function (data) {
        if (!data || data.ok !== true) {
          t.textEl.textContent = ((kind === "shop") ? "SHOP WX" : "JOB WX") + ": unavailable";
          stopTicker(t.laneId);
          return;
        }

        var newText = formatWeatherLine(kind, data);
        var oldText = String(t.textEl.getAttribute("data-last") || "");
        t.textEl.setAttribute("data-last", newText);

        if (newText !== oldText) {
          t.textEl.textContent = newText;
          startTicker(t.laneId, t.textEl);
        } else {
          if (!_tickerAnimations[t.laneId]) startTicker(t.laneId, t.textEl);
        }
      },
      function (err) {
        t.textEl.textContent = ((kind === "shop") ? "SHOP WX" : "JOB WX") + ": " + (err && err.message ? err.message : "failed");
        stopTicker(t.laneId);
      }
    );
  }

  function loadTickers() {
    loadTicker("master");
    loadTicker("install");

    // If the new combined top weather lane exists, drive that.
    // Otherwise, fall back to the older per-lane weather tickers (if present).
    if (getWeatherTopTargets()) {
      loadWeatherTopCombined();
    } else {
      loadWeatherTicker("shop");
      loadWeatherTicker("jobs");
    }
  }

  function restartTickers() {
    var masterEl = $("ticker-master-text");
    var installEl = $("ticker-install-text");
    if (masterEl) { stopTicker("ticker-master"); startTicker("ticker-master", masterEl); }
    if (installEl) { stopTicker("ticker-install"); startTicker("ticker-install", installEl); }

    // Weather lanes (if present + enabled)
    if (CONFIG.weatherTickersEnabled) {
      var shopT = getWeatherTickerTargets("shop");
      var jobsT = getWeatherTickerTargets("jobs");
      if (shopT && shopT.textEl) { stopTicker(shopT.laneId); startTicker(shopT.laneId, shopT.textEl); }
      if (jobsT && jobsT.textEl) { stopTicker(jobsT.laneId); startTicker(jobsT.laneId, jobsT.textEl); }

    // Combined top weather lane (if present)
    var topT = getWeatherTopTargets();
    if (topT && topT.textEl) { stopTicker(topT.laneId); startTicker(topT.laneId, topT.textEl); }

  }
  }

  // =========================================================
  // CALENDAR (JSONP) + AUTO REFRESH
  // =========================================================
  function loadCalendar() {
    setStatus("Fetching calendar…");

    var base = CONFIG.proxyUrl.replace(/\/$/, "");
    var url = base + "?mode=events";

    jsonp(
      url,
      function (data) {
        try {
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

          // NEW: header badges from Apps Script (day-specific “check engine light”)
          var todayBadgeText = (data && data.todayWxBadge !== undefined && data.todayWxBadge !== null) ? String(data.todayWxBadge) : "";
          var tomorrowBadgeText = (data && data.tomorrowWxBadge !== undefined && data.tomorrowWxBadge !== null) ? String(data.tomorrowWxBadge) : "";
          var todayBadgeUrgent = !!(data && data.todayWxUrgent);
          var tomorrowBadgeUrgent = !!(data && data.tomorrowWxUrgent);

          renderTodayTomorrow("today", todayEvents, todayBadgeText, todayBadgeUrgent);
          renderTodayTomorrow("tomorrow", tomorrowEvents, tomorrowBadgeText, tomorrowBadgeUrgent);
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

  function schedulePageReload() {
    if (!CONFIG.pageReloadMs || CONFIG.pageReloadMs < 60000) return;
    setTimeout(function () {
      try {
        setStatus("Reloading page…");
        location.reload(true);
      } catch (e) {}
    }, CONFIG.pageReloadMs);
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
    loadTruckStatus();

    setInterval(loadCalendar, CONFIG.calendarRefreshMs);
    setInterval(loadTickers, CONFIG.tickerRefreshMs);
    setInterval(loadTruckStatus, CONFIG.truckRefreshMs);

    // One extra fit after fonts settle
    setTimeout(function () {
      queueFitAll();
      restartTickers();
    }, 800);

    schedulePageReload();
  });
})()
  function escapeHtml_(s){
    s = String(s === undefined || s === null ? "" : s);
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

;
