(function () {
  "use strict";

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var text = function () { return document.body.innerText || ""; };
  var num = function (s) {
    if (s == null) return null;
    var m = String(s).replace(/[, ]/g, "").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  var lines = function (block) {
    return String(block || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
  };

  // Grab the innerText of the section whose heading starts with `label`.
  function sectionText(label) {
    var el = [].slice.call(document.querySelectorAll("h1,h2,h3,h4,h5"))
      .find(function (x) { return x.textContent.trim().toLowerCase().indexOf(label.toLowerCase()) === 0; });
    if (!el) return "";
    var sec = el.closest("section,article,div[class]") || el.parentElement;
    return (sec && sec.innerText) || "";
  }

  // ---------- images ----------
  function getImages() {
    var m = document.documentElement.innerHTML.match(
      /https:\/\/photos\.zillowstatic\.com\/fp\/[a-z0-9]+-cc_ft_1536\.jpg/gi
    ) || [];
    var seen = {};
    return m.filter(function (u) { return seen[u] ? false : (seen[u] = true); });
  }

  // ---------- schools ----------
  // "Elmer Wood Elementary School / Grades K-6 • 0.2 miles / 7 /10"
  function getSchools() {
    var out = [];
    try {
      var block = sectionText("Nearby schools");
      var ls = lines(block);
      for (var i = 0; i < ls.length; i++) {
        if (/\bSchool\b/i.test(ls[i]) && ls[i + 1] && /Grades?/i.test(ls[i + 1])) {
          var name = ls[i];
          var gm = ls[i + 1].match(/Grades?\s*([^•]+?)\s*•\s*([\d.]+)\s*mile/i);
          // rating: next standalone number (often on its own line before "/10")
          var rating = null;
          for (var j = i + 2; j < Math.min(i + 6, ls.length); j++) {
            if (/^\d{1,2}$/.test(ls[j])) { rating = Number(ls[j]); break; }
            var rm = ls[j].match(/^(\d{1,2})\s*\/\s*10/); if (rm) { rating = Number(rm[1]); break; }
          }
          var level = /elementary/i.test(name) ? "Elementary"
            : /middle|intermediate/i.test(name) ? "Middle"
            : /high/i.test(name) ? "High" : "";
          out.push({
            name: name,
            grades: gm ? gm[1].trim() : "",
            distance: gm ? gm[2] + " mi" : "",
            rating: rating != null ? rating : null,
            level: level,
            type: "Public",
          });
        }
      }
    } catch (e) {}
    return out;
  }

  // ---------- price history ----------
  // Scan the whole page for rows: date / event / $price [/ $x/sqft].
  // A row counts if it has a date + a thousands-price AND either a $/sqft or a
  // recognised price-history event — so "Sold $427,500" rows (no $/sqft) also
  // qualify, while random dated dollar amounts elsewhere are rejected.
  function getPriceHistory() {
    var out = [];
    var EVENT = /listed for sale|sold|price change|pending|contingent|listing removed|back on market|listed for rent|relisted/i;
    try {
      var ls = lines(text());
      var seen = {};
      for (var i = 0; i < ls.length; i++) {
        var dm = ls[i].match(/^(\d{1,2}\/\d{1,2}\/\d{4})$/);
        if (!dm) continue;
        var price = null, ppsf = null, event = "", hasPpsf = false, hasEvent = false;
        for (var j = i + 1; j < Math.min(i + 7, ls.length); j++) {
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(ls[j])) break;
          if (/^\$[\d,]+$/.test(ls[j]) && price == null) { var p = num(ls[j]); if (p >= 10000) price = p; }
          else if (/\$[\d,]+\s*\/\s*sqft/i.test(ls[j])) { ppsf = num(ls[j]); hasPpsf = true; }
          else if (!/^\$/.test(ls[j]) && /[A-Za-z]/.test(ls[j]) && ls[j].length < 40) {
            if (EVENT.test(ls[j])) { if (!event) event = ls[j]; hasEvent = true; }
            else if (!event && ls[j].length < 30) event = ls[j];
          }
        }
        var key = dm[1] + "|" + price;
        if (price != null && (hasPpsf || hasEvent) && !seen[key]) {
          seen[key] = true;
          out.push({ year: Number(dm[1].split("/")[2]), date: dm[1], event: event, price: price, pricePerSquareFoot: ppsf });
        }
      }
    } catch (e) {}
    return out;
  }

  // ---------- tax history ----------
  // Scan whole page for rows: year / $taxPaid (+x%) / $assessment (+x%).
  function getTaxHistory() {
    var out = [];
    try {
      var ls = lines(text());
      var seen = {};
      for (var i = 0; i < ls.length; i++) {
        if (!/^(19|20)\d{2}$/.test(ls[i])) continue;
        var year = Number(ls[i]);
        if (year < 1985 || year > 2030 || seen[year]) continue;
        var money = [];
        for (var j = i + 1; j < Math.min(i + 6, ls.length); j++) {
          if (/^(19|20)\d{2}$/.test(ls[j])) break;
          var mm = ls[j].match(/^\$([\d,]+)/); if (mm) money.push(num(mm[1]));
        }
        // A real tax row: tax paid >= $100 and assessed value >= $10,000.
        // Guards against fees/estimates elsewhere on the page (e.g. $200/$250).
        if (money.length >= 2 && money[0] >= 100 && money[1] >= 10000) {
          seen[year] = true;
          out.push({ year: year, taxPaid: money[0], value: money[1] });
        }
      }
    } catch (e) {}
    return out;
  }

  // ---------- facts (Facts & features / at a glance) ----------
  function getFacts() {
    var facts = {};
    try {
      var block = sectionText("Facts") || sectionText("Facts & features") || text();
      var wanted = ["Heating", "Cooling", "Parking", "Flooring", "Lot", "HOA", "Year built",
        "Stories", "Roof", "Foundation", "Zoning", "Appliances", "Fireplace",
        "Construction", "Style", "Water", "Sewer", "View", "Special conditions"];
      var ls = lines(block);
      // reject sub-heading junk that isn't a real value
      var isJunk = function (s) {
        return /^type\b/i.test(s) || /type\s*&\s*style/i.test(s) || /^details?$/i.test(s) ||
          /^features?$/i.test(s) || s.length < 2;
      };
      for (var i = 0; i < ls.length; i++) {
        for (var w = 0; w < wanted.length; w++) {
          var re = new RegExp("^" + wanted[w] + "\\s*:?\\s*(.+)$", "i");
          var m = ls[i].match(re);
          if (m && m[1] && m[1].length < 120 && !isJunk(m[1]) && !facts[wanted[w]]) facts[wanted[w]] = m[1].trim();
          // label on one line, value on the next
          else if (ls[i].toLowerCase() === wanted[w].toLowerCase() && ls[i + 1] && !facts[wanted[w]] && ls[i + 1].length < 120 && !isJunk(ls[i + 1])) {
            facts[wanted[w]] = ls[i + 1].trim();
          }
        }
      }
    } catch (e) {}
    return facts;
  }

  // ---------- value / rent / scores ----------
  function getValueBits() {
    var v = { zestimate: null, zestimateLow: null, zestimateHigh: null, rentZestimate: null, walkScore: null, bikeScore: null, transitScore: null };
    try {
      var body = text();
      // Zestimate: must be a thousands value (>= $10,000) and NOT a $/sqft figure.
      // Prefer the value that sits with the low–high range.
      var range = body.match(/\$([\d]{2,3}(?:,\d{3})+)\s*[-–]\s*\$([\d]{2,3}(?:,\d{3})+)/);
      if (range) { v.zestimateLow = num(range[1]); v.zestimateHigh = num(range[2]); }
      // Try "Zestimate ... $NNN,NNN" but skip anything followed by /sqft.
      var zm = body.match(/Zestimate[^$]{0,40}\$([\d]{2,3}(?:,\d{3})+)(?!\s*\/)/i);
      if (zm) v.zestimate = num(zm[1]);
      // Fallback: midpoint of the range if the direct grab missed.
      if (v.zestimate == null && v.zestimateLow != null && v.zestimateHigh != null) {
        v.zestimate = Math.round((v.zestimateLow + v.zestimateHigh) / 2);
      }
      // Sanity: a real Zestimate is >= 10000; reject $/sqft leakage.
      if (v.zestimate != null && v.zestimate < 10000) v.zestimate = null;

      var rent = body.match(/Rent Zestimate[^$]{0,40}\$([\d,]+)/i); if (rent) v.rentZestimate = num(rent[1]);
      var walk = body.match(/Walk Score[^\d]{0,20}(\d{1,3})/i); if (walk) v.walkScore = Number(walk[1]);
      var bike = body.match(/Bike Score[^\d]{0,20}(\d{1,3})/i); if (bike) v.bikeScore = Number(bike[1]);
      var tran = body.match(/Transit Score[^\d]{0,20}(\d{1,3})/i); if (tran) v.transitScore = Number(tran[1]);
    } catch (e) {}
    return v;
  }

  function getDescription() {
    try {
      var el = document.getElementById("__NEXT_DATA__");
      if (el) {
        var m = el.textContent.match(/"description":"((?:[^"\\]|\\.){40,})"/);
        if (m) { try { return JSON.parse('"' + m[1] + '"'); } catch (e) {} }
      }
    } catch (e) {}
    return null;
  }

  // ---------- run ----------
  (async function () {
    // Lazy sections (schools, price/tax, value) render when scrolled into view.
    // A slow double-pass scroll loads them reliably — more so than clicking
    // tabs, which can navigate away from already-loaded sections.
    async function fullScroll(step, pause) {
      var h = document.body.scrollHeight;
      for (var y = 0; y < h; y += step) { window.scrollTo(0, y); await sleep(pause); h = document.body.scrollHeight; }
      window.scrollTo(0, document.body.scrollHeight); await sleep(pause);
    }
    await fullScroll(500, 300);   // pass 1: trigger lazy loads
    await sleep(1500);            // let them finish fetching/rendering

    // Targeted reveal: scroll the specific section headings into view so their
    // lazy content actually fetches (blind scrolling can skate past them).
    async function reveal(words) {
      var el = [].slice.call(document.querySelectorAll("h1,h2,h3,h4,h5"))
        .find(function (x) {
          var t = x.textContent.trim().toLowerCase();
          return words.some(function (w) { return t.indexOf(w) === 0; });
        });
      if (el) { try { el.scrollIntoView({ block: "center" }); } catch (e) { el.scrollIntoView(); } await sleep(1100); }
    }
    await reveal(["price & tax", "price history", "public tax"]);
    await reveal(["market value", "zestimate"]);
    await reveal(["nearby schools", "schools"]);
    await reveal(["facts", "facts & features"]);

    await fullScroll(500, 250);   // pass 2: ensure everything is in the DOM
    window.scrollTo(0, 0);
    await sleep(1000);

    // Expand any "Show more / See complete" toggles that gate history tables.
    try {
      [].slice.call(document.querySelectorAll('button,a')).forEach(function (b) {
        var tx = (b.textContent || "").trim().toLowerCase();
        if (/show more|see complete|see all|view more|more facts/.test(tx)) { try { b.click(); } catch (e) {} }
      });
      await sleep(800);
    } catch (e) {}

    var payload = {
      images: getImages(),
      zillow: {
        schools: getSchools(),
        priceHistory: getPriceHistory(),
        taxHistory: getTaxHistory(),
        facts: getFacts(),
        value: getValueBits(),
        description: getDescription(),
      },
    };

    var z = payload.zillow;
    var summary = payload.images.length + " photos, " + z.schools.length + " schools, " +
      z.priceHistory.length + " price rows, " + z.taxHistory.length + " tax rows, " +
      Object.keys(z.facts).length + " facts, zestimate:" + (z.value.zestimate || "—") +
      ", walk:" + (z.value.walkScore || "—");
    console.log("Zillow scrape →", summary);

    var json = JSON.stringify(payload);
    var ta = document.createElement("textarea");
    ta.value = json;
    ta.style.cssText = "position:fixed;top:10px;left:10px;width:520px;height:360px;z-index:2147483647;font:12px monospace;border:2px solid #1652CE";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    console.log("Result is in the box top-left. Ctrl+C to copy, then paste into the importer. (Refresh to remove the box.)");
    try { document.execCommand("copy"); console.log("(also attempted auto-copy to clipboard)"); } catch (e) {}
  })();
})();
