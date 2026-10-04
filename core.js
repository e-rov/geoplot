/* E.ROV GeoPlot — survey math core.
 * Pure functions, no DOM. Works in the browser (window.Geo) and in Node (module.exports).
 * Conventions: azimuths are degrees clockwise from grid NORTH (0..360).
 * Points are {N, E} in metres (grid). Geographic is {lat, lon} in decimal degrees.
 */
(function (root) {
  'use strict';
  const G = {};
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  G.D2R = D2R; G.R2D = R2D;

  /* ---------- angles & bearings ---------- */
  const norm360 = a => ((a % 360) + 360) % 360;
  G.norm360 = norm360;

  // decimal degrees -> {d,m,s} with rounding of seconds to `sp` places
  G.toDMS = function (x, sp = 0) {
    const sign = x < 0 ? -1 : 1; x = Math.abs(x);
    let d = Math.floor(x), m = Math.floor((x - d) * 60);
    let s = +(((x - d) * 60 - m) * 60).toFixed(sp);
    if (s >= 60) { s = 0; m += 1; }
    if (m >= 60) { m = 0; d += 1; }
    return { sign, d, m, s };
  };
  const pad = (n, w) => String(n).padStart(w, '0');
  G.fmtDMS = function (x, sp = 0) {
    const r = G.toDMS(x, sp);
    const s = sp ? r.s.toFixed(sp).padStart(3 + sp, '0') : pad(r.s, 2);
    return (r.sign < 0 ? '-' : '') + r.d + '°' + pad(r.m, 2) + "'" + s + '"';
  };

  // Azimuth (from north) -> quadrant bearing parts
  G.azToQuad = function (az) {
    az = norm360(az);
    let ns, ew, ang;
    if (az <= 90) { ns = 'N'; ew = 'E'; ang = az; }
    else if (az <= 180) { ns = 'S'; ew = 'E'; ang = 180 - az; }
    else if (az <= 270) { ns = 'S'; ew = 'W'; ang = az - 180; }
    else { ns = 'N'; ew = 'W'; ang = 360 - az; }
    return { ns, ew, ang };
  };

  /* Format a bearing.
   * style: 'dms' -> N 45°30'15" E ; 'lmb' -> N. 45 deg. 30' E. ; 'plain' -> N 45 30 15 E
   * minutesOnly: round to whole minutes (typical of LMB technical descriptions)
   */
  G.fmtBearing = function (az, style = 'dms', minutesOnly = false) {
    const q = G.azToQuad(az);
    let { d, m, s } = G.toDMS(q.ang, 0);
    if (minutesOnly) {
      const tot = Math.round(q.ang * 60); d = Math.floor(tot / 60); m = tot % 60; s = 0;
    }
    if (d === 0 && m === 0 && s === 0) return 'Due ' + (q.ns === 'N' ? 'North' : 'South');
    if (d === 90 && m === 0 && s === 0) return 'Due ' + (q.ew === 'E' ? 'East' : 'West');
    if (style === 'lmb') {
      return q.ns + '. ' + d + ' deg. ' + pad(m, 2) + "'" + (s ? ' ' + pad(s, 2) + '"' : '') + ' ' + q.ew + '.';
    }
    if (style === 'plain') return q.ns + ' ' + d + ' ' + pad(m, 2) + (minutesOnly ? '' : ' ' + pad(s, 2)) + ' ' + q.ew;
    return q.ns + ' ' + d + '°' + pad(m, 2) + "'" + (minutesOnly ? '' : pad(s, 2) + '"') + ' ' + q.ew;
  };

  const BEARING_RE = /\b([NS])\s*\.?\s*((?:\d+(?:\.\d+)?)(?:\s*(?:°|º|˚|deg(?:rees?|s)?\.?|d\b|'|′|’|min(?:utes?|s)?\.?|"|″|”|''|sec(?:onds?|s)?\.?|-|:|\s)\s*(?:\d+(?:\.\d+)?)?){0,5})\s*(?:'|′|’|"|″|”|''|sec(?:onds?|s)?\.?|min(?:utes?|s)?\.?)?\s*\.?\s*([EW])\b\.?/gi;
  const DUE_RE = /\bdue\s+(north|south|east|west)\b/gi;

  function bearingFromParts(ns, nums, ew) {
    const [d = 0, m = 0, s = 0] = nums.map(Number);
    if (m >= 60 || s >= 60 || d > 90) return null;
    const ang = d + m / 60 + s / 3600;
    ns = ns.toUpperCase(); ew = ew.toUpperCase();
    if (ns === 'N' && ew === 'E') return ang;
    if (ns === 'S' && ew === 'E') return 180 - ang;
    if (ns === 'S' && ew === 'W') return 180 + ang;
    return norm360(360 - ang);
  }

  /* Parse a single bearing / azimuth string -> azimuth from north, or null.
   * Accepts: "N 45 30 15 E", "N45-30E", "N 45°30'15\" E", "N. 45 deg. 30' E.", "Due North",
   * "AZ 123.5" / "az 123 30 00" (azimuth from north), and "AZS 303.5" (azimuth from SOUTH, old PH practice). */
  G.parseBearing = function (str) {
    if (str == null) return null;
    str = String(str).trim();
    if (!str) return null;
    const due = /^due\s+(north|south|east|west)$/i.exec(str);
    if (due) return { north: 0, east: 90, south: 180, west: 270 }[due[1].toLowerCase()];
    const az = /^az(s)?\s*[:=]?\s*(\d+(?:\.\d+)?)(?:[\s°d-]+(\d+(?:\.\d+)?))?(?:[\s'm-]+(\d+(?:\.\d+)?))?/i.exec(str);
    if (az) {
      let v = +az[2] + (+az[3] || 0) / 60 + (+az[4] || 0) / 3600;
      if (az[1]) v += 180; // from-south azimuth
      return norm360(v);
    }
    BEARING_RE.lastIndex = 0;
    const m = BEARING_RE.exec(str);
    if (!m) return null;
    const nums = (m[2].match(/\d+(?:\.\d+)?/g) || []).slice(0, 3);
    if (!nums.length) return null;
    return bearingFromParts(m[1], nums, m[3]);
  };

  G.parseDistance = function (str) {
    if (str == null) return null;
    const m = /(\d[\d,]*(?:\.\d+)?)/.exec(String(str));
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, ''));
    return isFinite(v) ? v : null;
  };

  /* ---------- traverse ---------- */
  G.step = (p, az, d) => ({ N: p.N + d * Math.cos(az * D2R), E: p.E + d * Math.sin(az * D2R) });
  G.inverse = (a, b) => {
    const dN = b.N - a.N, dE = b.E - a.E;
    return { az: norm360(Math.atan2(dE, dN) * R2D), d: Math.hypot(dN, dE), dN, dE };
  };

  // Signed area (positive = counter-clockwise in E,N plane)
  G.signedArea = function (pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a.E * b.N - b.E * a.N;
    }
    return s / 2;
  };
  G.area = pts => Math.abs(G.signedArea(pts));
  G.perimeter = pts => pts.reduce((s, p, i) => s + G.inverse(p, pts[(i + 1) % pts.length]).d, 0);
  G.centroid = function (pts) {
    const A = G.signedArea(pts);
    if (Math.abs(A) < 1e-9) {
      const n = pts.length || 1;
      return { N: pts.reduce((s, p) => s + p.N, 0) / n, E: pts.reduce((s, p) => s + p.E, 0) / n };
    }
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], f = a.E * b.N - b.E * a.N;
      cx += (a.E + b.E) * f; cy += (a.N + b.N) * f;
    }
    return { E: cx / (6 * A), N: cy / (6 * A) };
  };

  /* Closure of a closed traverse given as [{az,d}] */
  G.closure = function (lines) {
    let lat = 0, dep = 0, per = 0;
    const rows = lines.map(l => {
      const la = l.d * Math.cos(l.az * D2R), de = l.d * Math.sin(l.az * D2R);
      lat += la; dep += de; per += l.d;
      return { az: l.az, d: l.d, lat: la, dep: de };
    });
    const mis = Math.hypot(lat, dep);
    return {
      rows, sumLat: lat, sumDep: dep, perimeter: per, misclosure: mis,
      misAz: mis > 0 ? norm360(Math.atan2(-dep, -lat) * R2D) : 0,
      precision: mis > 1e-9 ? per / mis : Infinity
    };
  };

  /* Adjust a closed traverse. method: 'compass' (Bowditch) or 'transit'.
   * Returns adjusted [{az,d,lat,dep,cLat,cDep}] */
  G.adjust = function (lines, method = 'compass') {
    const c = G.closure(lines);
    const sAbsLat = c.rows.reduce((s, r) => s + Math.abs(r.lat), 0) || 1;
    const sAbsDep = c.rows.reduce((s, r) => s + Math.abs(r.dep), 0) || 1;
    return c.rows.map(r => {
      let cLat, cDep;
      if (method === 'transit') {
        cLat = -c.sumLat * Math.abs(r.lat) / sAbsLat;
        cDep = -c.sumDep * Math.abs(r.dep) / sAbsDep;
      } else {
        cLat = -c.sumLat * r.d / c.perimeter;
        cDep = -c.sumDep * r.d / c.perimeter;
      }
      const lat = r.lat + cLat, dep = r.dep + cDep;
      return { az: norm360(Math.atan2(dep, lat) * R2D), d: Math.hypot(lat, dep), lat, dep, cLat, cDep };
    });
  };

  /* Rotate (degrees, clockwise positive like a bearing change) about pivot, then translate */
  G.transformPts = function (pts, pivot, rotDeg, dN = 0, dE = 0) {
    const t = rotDeg * D2R, c = Math.cos(t), s = Math.sin(t);
    return pts.map(p => {
      const y = p.N - pivot.N, x = p.E - pivot.E;
      // clockwise rotation in (E,N): E' = x cos + y sin ; N' = -x sin + y cos
      return { ...p, E: pivot.E + x * c + y * s + dE, N: pivot.N - x * s + y * c + dN };
    });
  };

  /* Compute a lot from its technical description.
   * lot = { tie:{N,E}, tieLine:{b,d}, lines:[{b,d}], adjust:'none'|'compass'|'transit',
   *         xf:{rot,dN,dE} , corners:[{N,E}] (when mode==='coords') , mode:'td'|'coords' }
   */
  G.computeLot = function (lot) {
    const out = { ok: false, errors: [] };
    const tie = { N: +lot.tie?.N || 0, E: +lot.tie?.E || 0 };
    out.tie = tie;
    let corners = [];
    if (lot.mode === 'coords') {
      corners = (lot.corners || []).map(p => ({ N: +p.N, E: +p.E })).filter(p => isFinite(p.N) && isFinite(p.E));
      if (corners.length < 3) { out.errors.push('Enter at least 3 corners.'); }
      out.closure = { sumLat: 0, sumDep: 0, misclosure: 0, precision: Infinity, perimeter: G.perimeter(corners) };
      out.lines = corners.map((p, i) => G.inverse(p, corners[(i + 1) % corners.length]));
      out.raw = corners;
    } else {
      const parsed = (lot.lines || []).map((l, i) => {
        const az = G.parseBearing(l.b), d = G.parseDistance(l.d);
        if (az == null) out.errors.push('Line ' + (i + 1) + ': bearing not understood ("' + (l.b || '') + '").');
        if (d == null || d <= 0) out.errors.push('Line ' + (i + 1) + ': distance missing.');
        return { az, d };
      }).filter(l => l.az != null && l.d > 0);
      if (parsed.length < 3) out.errors.push('A lot needs at least 3 lines.');
      let start = tie;
      let tieLine = null;
      if (lot.tieLine && (lot.tieLine.b || lot.tieLine.d)) {
        const az = G.parseBearing(lot.tieLine.b), d = G.parseDistance(lot.tieLine.d);
        if (az == null || d == null) out.errors.push('Tie line: bearing or distance not understood.');
        else { tieLine = { az, d }; start = G.step(tie, az, d); }
      }
      out.tieLine = tieLine;
      out.closure = G.closure(parsed);
      let use = parsed;
      if (lot.adjust && lot.adjust !== 'none' && parsed.length >= 3) use = G.adjust(parsed, lot.adjust);
      out.lines = use;
      const raw = [start];
      for (let i = 0; i < parsed.length - 1; i++) raw.push(G.step(raw[i], parsed[i].az, parsed[i].d));
      out.unadjusted = raw;
      corners = [start];
      for (let i = 0; i < use.length - 1; i++) corners.push(G.step(corners[i], use[i].az, use[i].d));
      out.raw = corners;
    }
    // transformation (rotate / move)
    const xf = lot.xf || {};
    if ((+xf.rot || +xf.dN || +xf.dE) && corners.length) {
      const pivot = xf.pivot === 'c1' ? corners[0] : xf.pivot === 'tie' ? tie : G.centroid(corners);
      corners = G.transformPts(corners, pivot, +xf.rot || 0, +xf.dN || 0, +xf.dE || 0);
      out.transformed = true;
    }
    out.corners = corners;
    if (corners.length >= 3) {
      out.area = G.area(corners);
      out.perimeter = G.perimeter(corners);
      out.centroid = G.centroid(corners);
      out.finalLines = corners.map((p, i) => G.inverse(p, corners[(i + 1) % corners.length]));
      out.finalTie = G.inverse(tie, corners[0]);
      out.ok = out.errors.length === 0;
    }
    return out;
  };

  /* Bake the computed (adjusted / transformed) corners back into bearings & distances */
  G.lotFromCorners = function (tie, corners, opts = {}) {
    const dp = opts.dp ?? 2;
    const ti = G.inverse(tie, corners[0]);
    const lines = corners.map((p, i) => {
      const v = G.inverse(p, corners[(i + 1) % corners.length]);
      return { b: G.fmtBearing(v.az, 'plain', !!opts.minutesOnly), d: v.d.toFixed(dp) };
    });
    return { tieLine: { b: G.fmtBearing(ti.az, 'plain', !!opts.minutesOnly), d: ti.d.toFixed(dp) }, lines };
  };

  /* ---------- number words (for TD areas) ---------- */
  const ONES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  function words999(n) {
    let s = [];
    if (n >= 100) { s.push(ONES[Math.floor(n / 100)] + ' HUNDRED'); n %= 100; }
    if (n >= 20) { s.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')); }
    else if (n > 0) s.push(ONES[n]);
    return s.join(' ');
  }
  G.numberWords = function (n) {
    n = Math.round(n);
    if (n === 0) return 'ZERO';
    const scales = ['', ' THOUSAND', ' MILLION', ' BILLION'];
    const parts = [];
    let i = 0;
    while (n > 0 && i < scales.length) {
      const c = n % 1000;
      if (c) parts.unshift(words999(c) + scales[i]);
      n = Math.floor(n / 1000); i++;
    }
    return parts.join(' ');
  };

  /* LMB-style narrative technical description */
  G.narrativeTD = function (lot, comp, opts = {}) {
    const mo = opts.minutesOnly !== false;
    const fmt = az => G.fmtBearing(az, 'lmb', mo);
    const dist = d => d.toFixed(2) + ' m.';
    const L = comp.finalLines, n = comp.corners.length;
    const tieName = (lot.tie && lot.tie.name) || 'the tie point';
    let s = (opts.lotTitle ? opts.lotTitle + '\n\n' : '') +
      'Beginning at a point marked "1" on plan, being ' + fmt(comp.finalTie.az) + ', ' + dist(comp.finalTie.d) + ' from ' + tieName + ';\n';
    for (let i = 0; i < n; i++) {
      const to = i === n - 1 ? 'the point of beginning' : 'point ' + (i + 2);
      s += 'thence ' + fmt(L[i].az) + ', ' + dist(L[i].d) + ' to ' + to + (i === n - 1 ? ';' : ';') + '\n';
    }
    const a = Math.round(comp.area);
    s += 'containing an area of ' + G.numberWords(a) + ' (' + a.toLocaleString('en-US') + ') SQUARE METERS, more or less.';
    if (opts.bounds) s += '\n' + opts.bounds;
    return s;
  };

  /* ---------- text parser for technical descriptions ---------- */
  /* Returns { tieName, tieLine:{b,d}|null, lines:[{b,d}], corners:[{name,N,E}], kind } */
  G.parseTDText = function (text, opts = {}) {
    text = String(text || '').replace(/\r/g, '');
    const t = text.replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ');
    const found = [];
    BEARING_RE.lastIndex = 0;
    let m;
    while ((m = BEARING_RE.exec(t))) {
      const nums = (m[2].match(/\d+(?:\.\d+)?/g) || []).slice(0, 3);
      if (!nums.length) continue;
      const az = bearingFromParts(m[1], nums, m[3]);
      if (az == null) continue;
      found.push({ idx: m.index, end: BEARING_RE.lastIndex, az });
    }
    DUE_RE.lastIndex = 0;
    while ((m = DUE_RE.exec(t))) {
      found.push({ idx: m.index, end: DUE_RE.lastIndex, az: { north: 0, east: 90, south: 180, west: 270 }[m[1].toLowerCase()] });
    }
    found.sort((a, b) => a.idx - b.idx);
    const pairs = [];
    for (const f of found) {
      const rest = t.slice(f.end, f.end + 40);
      const dm = /^[\s.,;:\-=_~'"*]*(?:distance\s*(?:of)?\s*)?(\d[\d,]*(?:\.\d+)?)\s*(m\b|m\.|meters?|mts?\.?|metres?)?/i.exec(rest);
      if (!dm) continue;
      const d = parseFloat(dm[1].replace(/,/g, ''));
      if (!(d > 0)) continue;
      const ls = t.lastIndexOf('\n', f.idx) + 1;
      const lm = /(\d{1,3})\s*[-–—=.:]+\s*(\d{1,3})\D{0,6}$/.exec(t.slice(ls, f.idx));
      pairs.push({ az: f.az, d, idx: f.idx, label: lm ? +lm[1] + '-' + +lm[2] : '', after: t.slice(f.end + dm[0].length, f.end + dm[0].length + 120) });
    }
    const res = { tieName: '', tieLine: null, lines: [], corners: [], kind: 'none', name: '' };
    const ln = /\bLOT\s+(?:NO\.?\s*)?(\d[\w]*(?:\s*[-–—]+\s*[\w]+)*)/i.exec(t);
    if (ln) res.name = 'Lot ' + ln[1].replace(/\s*[-–—]+\s*/g, '-');
    if (pairs.length) {
      res.kind = 'bearings';
      let tieIdx = -1;
      // Tabulated LMB forms put the tie line in its own box AFTER the lot lines:
      // "Tie lines from BLLM#1, CAD-459-D, Indang Cadastre, to Corner Marked "1": ... N 45 05 W 3333.42"
      const th = /tie\s*lines?\s*(?:from|fr\.?)\s+([\s\S]{3,140}?)[\s,]*to\s+corner/i.exec(t) || /tie\s*lines?\s*(?:from|fr\.?)\s+([^:\n]{3,80})/i.exec(t);
      if (th) {
        const k = pairs.findIndex(p => p.idx > th.index);
        if (k >= 0) { tieIdx = k; res.tieName = th[1].replace(/\s+/g, ' ').replace(/[\s,;:]+$/, '').trim(); }
      }
      // Narrative: first pair followed by "from <tie point>"
      const fm = tieIdx < 0 && pairs.length ? /^[\s,;.]*(?:from|fr\.)\s+([^;\n]+?)(?:;|\n|,\s*thence|$)/i.exec(pairs[0].after) : null;
      if (tieIdx >= 0) { /* found above */ }
      else if (fm) { tieIdx = 0; res.tieName = fm[1].trim().replace(/[.,]$/, ''); }
      else {
        // Tabulated: a row labelled tie / TP / BLLM before the first pair
        const before = t.slice(Math.max(0, pairs[0].idx - 40), pairs[0].idx);
        if (/\b(tie|tp|t\.p\.|bllm|bbm|mbm|plss|mon)\b[^\n]*$/i.test(before)) tieIdx = 0;
        else if (opts.firstIsTie) tieIdx = 0;
      }
      const fmt = az => G.fmtBearing(az, 'plain');
      pairs.forEach((p, i) => {
        const row = { b: fmt(p.az), d: p.d.toFixed(2) };
        if (p.label) row.label = p.label;
        if (i === tieIdx) res.tieLine = row; else res.lines.push(row);
      });
      const tn = /(BLLM|BBM|MBM|PLSS|MON\.?|TIE\s*POINT)\s*(?:No\.?|#)?\s*[\w-]+(?:\s*,\s*[^;\n]{0,40})?/i.exec(t);
      if (!res.tieName && tn) res.tieName = tn[0].trim();
      return res;
    }
    // Coordinates list: name N E per line
    for (const line of t.split('\n')) {
      const nums = line.match(/-?\d[\d,]*\.\d+|-?\d{5,}/g);
      if (!nums || nums.length < 2) continue;
      const vals = nums.map(v => parseFloat(v.replace(/,/g, '')));
      const big = vals.filter(v => Math.abs(v) > 1000);
      if (big.length < 2) continue;
      const name = (/^\s*([A-Za-z]*-?\d+[A-Za-z]?|[A-Za-z]+[\w-]*)\s/.exec(line) || [])[1] || '';
      let N = big[0], E = big[1];
      if (opts.swapNE) [N, E] = [E, N];
      res.corners.push({ name: name && !nums.includes(name) ? name : String(res.corners.length + 1), N, E });
    }
    if (res.corners.length >= 3) res.kind = 'coords';
    return res;
  };

  /* ---------- OCR clean-up for photographed technical descriptions ---------- */
  /* Fixes the misreads phone OCR typically makes on titles and plans. Conservative:
   * only touches characters inside or right next to numbers and bearing words. */
  G.cleanOCR = function (text) {
    let t = String(text || '').replace(/\r/g, '');
    t = t.replace(/[‘’`´′]/g, "'").replace(/[“”″]/g, '"').replace(/ /g, ' ');
    // currency / look-alike glyphs that OCR uses for E and W in bearing columns
    t = t.replace(/[€£]/g, 'E').replace(/\bVV\b/g, 'W');
    // letters read inside numbers: 1O5 -> 105, 2l.5 -> 21.5
    for (let k = 0; k < 2; k++) {
      t = t.replace(/(\d)[Oo](?=[\d.,])/g, '$10').replace(/([\d.])[Oo](?=\d)/g, '$10');
      t = t.replace(/(\d)[lI|](?=[\d.,])/g, '$11').replace(/([\d.])[lI|](?=\d)/g, '$11');
    }
    // at the edge of a number next to bearing marks: "2l deg." "O2'" "4O°"
    t = t.replace(/(\d)[lI|](?=\s*(?:deg|°|'|"|m\b|m\.))/gi, '$11').replace(/(\d)[Oo](?=\s*(?:deg|°|'|"))/g, '$10');
    t = t.replace(/(^|[\s.(])[Oo](\d)(?=\s*(?:['"°]|deg|\.\d))/gim, '$10$2').replace(/(^|[\s.(])[lI|](\d)(?=\s*(?:['"°]|deg|\.\d))/gim, '$11$2');
    // degree-word variants: dcg. deq. deg, des. -> deg.
    t = t.replace(/\b(d[ec][gq]|des|dee)(rees?)?\s*[.,]?(?=\s*\d)/gi, 'deg. ');
    // degree glyph read as o, *, º, ˚ between two numbers: 45o 30' -> 45° 30'
    t = t.replace(/(\b\d{1,2})\s*[o*º˚°]\s*(?=\d)/g, '$1° ');
    // "S" read as "5" at the start of a bearing: "5. 30 deg." / "thence 5 30° 15' E"
    t = t.replace(/(^|[\s,;(]|thence\s)5\s*[.,]?\s+(?=\d{1,2}\s*(?:deg|°))/gim, '$1S. ');
    t = t.replace(/(^|[\s,;(])\$\s*[.,]?\s+(?=\d{1,2}\s*(?:deg|°))/gm, '$1S. ');
    // "S." misread as "&." "8." "$." "§." right after thence/being or at a line start
    t = t.replace(/(^|thence\s+|being\s+)[&8$§]\s*\.?\s*(?=\d{1,2}\s*(?:deg|°))/gim, '$1S. ');
    // doubled or lower-case quadrant letters: "Ss." "sS." "s." "Nn." before a bearing angle
    t = t.replace(/(^|[^A-Za-z])(?:[Ss]{2}|s)\s*\.?(?=\s*\d{1,2}\s*(?:deg|°))/gm, '$1S.');
    t = t.replace(/(^|[^A-Za-z])(?:[Nn]{2}|n)\s*\.?(?=\s*\d{1,2}\s*(?:deg|°))/gm, '$1N.');
    // doubled / mixed-case quadrant letters: "Ww" "WW" "vv" -> W ; "Ee" -> E
    t = t.replace(/\b(?:W[wW]|[vV]{2}|w[wW])\b/g, 'W').replace(/\bE[eE]\b/g, 'E');
    // "OO" / "oo" read for 00 before a degree or minute mark: N OO' 10' E
    t = t.replace(/(^|[\s.NS])[Oo]{2}(?=\s*(?:[°'"*’]|\d{1,2}\s*[°'"*’]))/gm, '$100').replace(/(^|[\s.NS])[Oo](\d)(?=\s*[°'"*’])/gm, '$10$2');
    // "SO" / "So" read for 50 after the degrees: S 34 SO' E
    t = t.replace(/(\d\s*[°'"*’]?\s+)[Ss5][Oo](?=\s*[°'"*’])/g, '$150');
    // "S$" -> S ; stray letter glued before E/W after the minutes: "50' FE" -> "50' E"
    t = t.replace(/\bS\$/g, 'S').replace(/(\d\s*['’°"*])\s*[FPLIT1l]([EW])\b/g, '$1 $2');
    // E/W glued to the distance: "W13.00 m." -> "W 13.00 m."
    t = t.replace(/(\d\s*['’°"*]?\s*[EWew])(?=\d)/g, '$1 ');
    // minute mark read as ) ] } before the E/W letter: "05) w" -> "05' W"
    t = t.replace(/(\d{1,2})\s*[)\]}]\s*(?=[EWew]\b)/g, "$1' ");
    // table borders and stray brackets between columns: "1-2 | N 00° 10' E | 10.00 m."
    t = t.replace(/[|¦\[\]{}]/g, ' ').replace(/[“”«»‘]/g, ' ');
    // N./S./E./W. followed by comma
    t = t.replace(/\b([NSEW]),(?=\s)/g, '$1.');
    t = t.replace(/\bVV\b/g, 'W');
    // decimal comma right before metres: 25,00 m -> 25.00 m (keeps 1,234.56)
    t = t.replace(/(\d),(\d{2})(?!\d)(\s*(?:m\b|m\.|mts?\b|meters?|metres?))/gi, '$1.$2$3');
    // split decimal: 25. 00 m -> 25.00 m
    t = t.replace(/(\d)\s*\.\s+(\d{2})(\s*(?:m\b|m\.|meters?))/gi, '$1.$2$3');
    return t;
  };

  /* Combine several OCR passes of the same document. For tables with row labels (1-2, 2-3 …)
   * each row is decided by majority vote across passes; otherwise the best-closing pass wins.
   * Returns a parse result plus canonical text that parses back to the same thing. */
  G.mergeTD = function (texts) {
    const parses = texts.map(x => G.parseTDText(G.cleanOCR(x)));
    const tidy = x => String(x || '').replace(/[—–]+/g, '-').replace(/-{2,}/g, '-').replace(/\s+/g, ' ').trim();
    const vote = arr => { const m = new Map(); arr.filter(Boolean).map(tidy).forEach((v, i) => { const e = m.get(v) || { n: 0, i, v }; e.n++; m.set(v, e); }); const w = [...m.values()].sort((a, b) => b.n - a.n || a.i - b.i)[0]; return w ? w.v : ''; };
    const nameVote = vote(parses.map(p => p.name)), tieNameVote = vote(parses.map(p => p.tieName));
    const closeOf = p => {
      if (p.kind !== 'bearings' || p.lines.length < 3) return 0;
      const c = G.computeLot({ tie: { N: 0, E: 0 }, tieLine: p.tieLine, lines: p.lines });
      return c.closure && isFinite(c.closure.precision) ? c.closure.precision : 1e9;
    };
    const labelled = parses.filter(p => p.kind === 'bearings' && p.lines.filter(l => l.label).length >= 3);
    let merged = null;
    if (labelled.length) {
      const votes = new Map();
      labelled.forEach((p, pi) => p.lines.forEach(l => {
        if (!l.label) return;
        const [a, b] = l.label.split('-').map(Number);
        if (!(b === a + 1 || (b === 1 && a > 2))) return; // only real traverse legs
        const key = l.b + '|' + l.d;
        if (!votes.has(l.label)) votes.set(l.label, new Map());
        const m = votes.get(l.label); const v = m.get(key) || { n: 0, first: pi, row: l }; v.n++; m.set(key, v);
      }));
      const labels = [...votes.keys()].sort((x, y) => +x.split('-')[0] - +y.split('-')[0]);
      const lines = labels.map(lb => [...votes.get(lb).values()].sort((u, v) => v.n - u.n || u.first - v.first)[0].row);
      const tv = new Map();
      parses.forEach((p, pi) => { if (p.tieLine) { const k = p.tieLine.b + '|' + p.tieLine.d; const v = tv.get(k) || { n: 0, first: pi, row: p.tieLine, name: p.tieName }; v.n++; tv.set(k, v); } });
      const tie = [...tv.values()].sort((u, v) => v.n - u.n || u.first - v.first)[0];
      merged = { kind: 'bearings', lines, tieLine: tie ? tie.row : null, tieName: (tie && tie.name) || (parses.find(p => p.tieName) || {}).tieName || '', name: (parses.find(p => p.name) || {}).name || '', corners: [] };
    }
    // best single pass (by closure then line count) as fallback / comparison
    let best = null, bestScore = -1;
    parses.forEach(p => {
      const pr = closeOf(p), n = p.kind === 'bearings' ? p.lines.length : p.corners.length;
      const sc = (pr >= 2000 ? 1e6 : 0) + n * 100 + (p.tieLine ? 50 : 0) + Math.min(40, pr / 1000);
      if (sc > bestScore) { bestScore = sc; best = p; }
    });
    if (merged) {
      const pm = closeOf(merged), pb = closeOf(best);
      if (!(pm >= 2000) && pb >= 2000 && best.lines.length >= merged.lines.length) merged = null;
    }
    const out = merged || best || { kind: 'none', lines: [], corners: [], tieLine: null, tieName: '', name: '' };
    if (!out.tieLine) { const withTie = parses.find(p => p.tieLine); if (withTie) { out.tieLine = withTie.tieLine; out.tieName = out.tieName || withTie.tieName; } }
    out.name = nameVote || out.name || '';
    out.tieName = tieNameVote || tidy(out.tieName);
    out.precision = closeOf(out);
    out.statedArea = texts.map(G.statedArea).find(Boolean) || null;
    out.text = G.canonicalTD(out);
    return out;
  };
  // clean, editable text that G.parseTDText reads back to the same result
  G.canonicalTD = function (p) {
    if (p.kind === 'coords') return p.corners.map(c => `${c.name} ${c.N} ${c.E}`).join('\n');
    const n = p.lines.length, out = [];
    if (p.name) out.push(p.name.toUpperCase());
    if (p.tieLine) {
      out.push(`Tie line from ${p.tieName || 'tie point'} to corner 1:`);
      out.push(`TP-1  ${p.tieLine.b}  ${p.tieLine.d} m.`);
      out.push('Lines:');
    }
    p.lines.forEach((l, i) => out.push(`${i + 1}-${i === n - 1 ? 1 : i + 2}  ${l.b}  ${l.d} m.`));
    if (p.statedArea) out.push(`Area stated on the document: (${p.statedArea}) SQUARE METERS`);
    return out.join('\n');
  };

  // area stated in the document text, e.g. "FIVE HUNDRED (559) SQUARE METERS" or "559 sq.m."
  G.statedArea = function (text) {
    const t = String(text || '');
    let m = /\(\s*(\d[\d,]*(?:\.\d+)?)\s*\)\s*(?:SQ|SQUARE)/i.exec(t) || /(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*m|square\s+met)/i.exec(t);
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, ''));
    return v > 0 ? v : null;
  };

  /* Sanity checks after reading a TD: returns [{level:'warn'|'info', text}] */
  G.tdChecks = function (text, parsed, computed) {
    const out = [];
    const t = String(text || '');
    const thence = (t.match(/\bthence\b/gi) || []).length;
    if (parsed.kind === 'bearings' && thence && thence !== parsed.lines.length) {
      out.push({ level: 'warn', text: `The text has ${thence} "thence" lines but ${parsed.lines.length} were read. A bearing or distance may be misread or missing.` });
    }
    const bad = [];
    const re = /\b([NS])\s*\.?\s*(\d{1,3})\s*(?:°|deg\.?)\s*(\d{1,3})/gi;
    let m;
    while ((m = re.exec(t))) { if (+m[2] > 90 || +m[3] >= 60) bad.push(m[0].trim()); }
    if (bad.length) out.push({ level: 'warn', text: 'Impossible bearing values (degrees over 90 or minutes over 59): ' + bad.slice(0, 4).join('; ') + '. Fix them in the text and read again.' });
    const sa = G.statedArea(t);
    if (sa && computed && computed.area) {
      const diff = computed.area - sa, pct = Math.abs(diff) / sa * 100;
      out.push({ level: pct > 1 ? 'warn' : 'info', text: `Document area ${sa.toLocaleString('en-US')} sq.m; computed ${computed.area.toFixed(2)} sq.m (${diff >= 0 ? '+' : ''}${diff.toFixed(2)}, ${pct.toFixed(2)}%).` });
    }
    if (computed && computed.closure && parsed.kind === 'bearings' && computed.closure.misclosure > 0) {
      const p = computed.closure.precision;
      if (isFinite(p) && p < 1000) out.push({ level: 'warn', text: `Misclosure ${computed.closure.misclosure.toFixed(3)} m (1:${Math.round(p)}). A large gap usually means one misread digit.` });
    }
    return out;
  };

  /* ---------- polygon tools / subdivision ---------- */
  // Keep the part of polygon where f(p) >= 0, f linear: a*E + b*N + c
  G.clipHalf = function (poly, a, b, c) {
    const out = [], f = p => a * p.E + b * p.N + c;
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length], fp = f(P), fq = f(Q);
      if (fp >= 0) out.push(P);
      if ((fp >= 0) !== (fq >= 0)) {
        const t = fp / (fp - fq);
        out.push({ E: P.E + t * (Q.E - P.E), N: P.N + t * (Q.N - P.N) });
      }
    }
    return dedupe(out);
  };
  function dedupe(pts) {
    const r = [];
    for (const p of pts) {
      const q = r[r.length - 1];
      if (!q || Math.hypot(p.E - q.E, p.N - q.N) > 1e-6) r.push(p);
    }
    if (r.length > 1 && Math.hypot(r[0].E - r[r.length - 1].E, r[0].N - r[r.length - 1].N) < 1e-6) r.pop();
    return r;
  }

  // bisection helper: find t in [lo,hi] with g(t)=target, g monotone
  function solve(g, target, lo, hi) {
    let glo = g(lo), ghi = g(hi);
    const inc = ghi > glo;
    for (let k = 0; k < 100; k++) {
      const mid = (lo + hi) / 2, gm = g(mid);
      if ((gm < target) === inc) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* Cut `targetArea` off the lot with a line parallel to side `si` (side from corner si to si+1).
   * The cut area is taken from the side's own edge inward. Returns {part, rest, cut:[p1,p2]} */
  G.cutParallel = function (poly, si, targetArea) {
    const A = poly[si], B = poly[(si + 1) % poly.length];
    const ux = B.E - A.E, uy = B.N - A.N, L = Math.hypot(ux, uy);
    // inward normal: polygon interior side
    let nx = -uy / L, ny = ux / L;
    const C = G.centroid(poly);
    if ((C.E - A.E) * nx + (C.N - A.N) * ny < 0) { nx = -nx; ny = -ny; }
    const dist = p => (p.E - A.E) * nx + (p.N - A.N) * ny;
    const maxD = Math.max(...poly.map(dist));
    // part = { dist <= t } : -nx*E - ny*N + (nx*A.E+ny*A.N) + t >= 0
    const partAt = t => G.clipHalf(poly, -nx, -ny, nx * A.E + ny * A.N + t);
    const total = G.area(poly);
    if (!(targetArea > 0 && targetArea < total)) throw new Error('Area to cut must be between 0 and ' + total.toFixed(2) + ' sq.m.');
    const t = solve(tt => G.area(partAt(tt)), targetArea, 0, maxD);
    const part = partAt(t), rest = G.clipHalf(poly, nx, ny, -(nx * A.E + ny * A.N) - t);
    return { part, rest, offset: t };
  };

  /* Cut `targetArea` with a line through corner `ci`, sweeping across the lot. */
  G.cutPivot = function (poly, ci, targetArea) {
    const P = poly[ci];
    const total = G.area(poly);
    if (!(targetArea > 0 && targetArea < total)) throw new Error('Area to cut must be between 0 and ' + total.toFixed(2) + ' sq.m.');
    const nxt = poly[(ci + 1) % poly.length];
    const a0 = Math.atan2(nxt.N - P.N, nxt.E - P.E);
    // half-plane to the left of a ray from P at angle th
    const partAt = th => {
      const dx = Math.cos(th), dy = Math.sin(th);
      return G.clipHalf(poly, dy, -dx, -(dy * P.E - dx * P.N)); // right side of ray
    };
    // sweep th from a0 (area 0 side) rotating counter-clockwise
    const sgn = G.signedArea(poly) > 0 ? 1 : -1;
    const g = s => G.area(partAt(a0 + sgn * s));
    // find sweep range where area increases from 0 to total
    let hi = Math.PI;
    const s = solve(g, targetArea, 0, hi);
    let part = partAt(a0 + sgn * s);
    const dx = Math.cos(a0 + sgn * s), dy = Math.sin(a0 + sgn * s);
    let rest = G.clipHalf(poly, -dy, dx, (dy * P.E - dx * P.N));
    if (Math.abs(G.area(part) - targetArea) > Math.max(0.01, targetArea * 1e-4)) {
      [part, rest] = [rest, part];
    }
    return { part, rest };
  };

  /* Split into n equal parts with lines parallel to side si */
  G.equalParts = function (poly, si, n) {
    const total = G.area(poly), parts = [];
    let cur = poly.slice();
    for (let k = 1; k < n; k++) {
      // side index may shift after clipping, so cut from the ORIGINAL side line each time
      const r = G.cutParallel(poly, si, total * k / n);
      parts.push(r.part);
    }
    // convert cumulative parts into strips
    const strips = [];
    let prev = null;
    for (let k = 0; k < n - 1; k++) {
      strips.push(prev ? diffStrip(poly, si, total * k / n, total * (k + 1) / n) : parts[0]);
      prev = parts[k];
    }
    strips.push(G.cutParallel(poly, si, total * (n - 1) / n).rest);
    return strips;
  };
  function diffStrip(poly, si, a1, a2) {
    const r1 = G.cutParallel(poly, si, a1), r2 = G.cutParallel(poly, si, a2);
    // strip between offsets r1.offset and r2.offset
    const A = poly[si], B = poly[(si + 1) % poly.length];
    const ux = B.E - A.E, uy = B.N - A.N, L = Math.hypot(ux, uy);
    let nx = -uy / L, ny = ux / L;
    const C = G.centroid(poly);
    if ((C.E - A.E) * nx + (C.N - A.N) * ny < 0) { nx = -nx; ny = -ny; }
    const k = nx * A.E + ny * A.N;
    let s = G.clipHalf(poly, -nx, -ny, k + r2.offset);
    s = G.clipHalf(s, nx, ny, -k - r1.offset);
    return s;
  }

  /* Corner matching between lots: list pairs of corners within `tol` metres */
  G.commonCorners = function (lots, tol = 0.5) {
    const res = [];
    for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
      lots[i].corners.forEach((p, a) => lots[j].corners.forEach((q, b) => {
        const d = Math.hypot(p.E - q.E, p.N - q.N);
        if (d <= tol) res.push({ i, j, a, b, d });
      }));
    }
    return res;
  };

  /* Do two segments properly cross? */
  function segX(p, q, r, s) {
    const o = (a, b, c) => (b.E - a.E) * (c.N - a.N) - (b.N - a.N) * (c.E - a.E);
    const d1 = o(p, q, r), d2 = o(p, q, s), d3 = o(r, s, p), d4 = o(r, s, q);
    return ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6));
  }
  G.edgeCrossings = function (A, B) {
    let n = 0;
    for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++)
      if (segX(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) n++;
    return n;
  };
  G.pointInPoly = function (p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.N > p.N) !== (b.N > p.N) && p.E < (b.E - a.E) * (p.N - a.N) / (b.N - a.N) + a.E) c = !c;
    }
    return c;
  };

  /* ---------- geodesy ---------- */
  const ELL = {
    WGS84: { a: 6378137, f: 1 / 298.257223563 },
    CLARKE1866: { a: 6378206.4, f: 1 - 6356583.8 / 6378206.4 }
  };
  G.ELL = ELL;
  // datum definitions: ellipsoid + towgs84 (position-vector convention, arcsec, ppm)
  G.DATUMS = {
    WGS84: { ell: 'WGS84', tw: [0, 0, 0, 0, 0, 0, 0], label: 'WGS 84' },
    PRS92: { ell: 'CLARKE1866', tw: [-127.62195, -67.24478, -47.04305, -3.068, 4.903, 1.578, -1.06], label: 'PRS92' },
    LUZON1911: { ell: 'CLARKE1866', tw: [-133, -77, -51, 0, 0, 0, 0], label: 'Luzon 1911' }
  };
  /* Coordinate systems the app offers */
  G.SYSTEMS = {};
  ['I', 'II', 'III', 'IV', 'V'].forEach((r, i) => {
    G.SYSTEMS['PRS92_Z' + (i + 1)] = { kind: 'tm', datum: 'PRS92', lon0: 117 + 2 * i, k0: 0.99995, FE: 500000, FN: 0, label: 'PRS92 PTM Zone ' + r + ' (CM ' + (117 + 2 * i) + '°)', epsg: 3121 + i };
    G.SYSTEMS['LUZON_Z' + (i + 1)] = { kind: 'tm', datum: 'LUZON1911', lon0: 117 + 2 * i, k0: 0.99995, FE: 500000, FN: 0, label: 'Luzon 1911 PPCS-TM Zone ' + r + ' (old)', epsg: 25391 + i };
  });
  [50, 51, 52].forEach(z => {
    G.SYSTEMS['UTM' + z] = { kind: 'tm', datum: 'WGS84', lon0: z * 6 - 183, k0: 0.9996, FE: 500000, FN: 0, label: 'WGS 84 / UTM ' + z + 'N', epsg: 32600 + z };
  });
  G.SYSTEMS.WGS84_GEO = { kind: 'geo', datum: 'WGS84', label: 'WGS 84 Lat/Long', epsg: 4326 };
  G.SYSTEMS.PRS92_GEO = { kind: 'geo', datum: 'PRS92', label: 'PRS92 Lat/Long', epsg: 4683 };

  // suggest PTM zone from longitude
  G.ptmZoneFor = lon => Math.min(5, Math.max(1, Math.round((lon - 117) / 2) + 1));

  /* Transverse Mercator (Krüger series, n^3) — sub-millimetre within PTM/UTM zones */
  function tmConsts(ell) {
    const { a, f } = ell, n = f / (2 - f), n2 = n * n, n3 = n2 * n;
    return {
      n, A: a / (1 + n) * (1 + n2 / 4 + n2 * n2 / 64), e: 2 * Math.sqrt(n) / (1 + n),
      al: [n / 2 - 2 * n2 / 3 + 5 * n3 / 16, 13 * n2 / 48 - 3 * n3 / 5, 61 * n3 / 240],
      be: [n / 2 - 2 * n2 / 3 + 37 * n3 / 96, n2 / 48 + n3 / 15, 17 * n3 / 480],
      de: [2 * n - 2 * n2 / 3 - 2 * n3, 7 * n2 / 3 - 8 * n3 / 5, 56 * n3 / 15]
    };
  }
  const TMC = {};
  const tmc = name => TMC[name] || (TMC[name] = tmConsts(ELL[name]));

  G.tmForward = function (lat, lon, ellName, lon0, k0, FE, FN) {
    const c = tmc(ellName), phi = lat * D2R, dl = (lon - lon0) * D2R;
    const sp = Math.sin(phi);
    const t = Math.sinh(Math.atanh(sp) - c.e * Math.atanh(c.e * sp));
    const xi = Math.atan2(t, Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
    let x = eta, y = xi;
    for (let j = 1; j <= 3; j++) {
      x += c.al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
      y += c.al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    }
    return { E: FE + k0 * c.A * x, N: FN + k0 * c.A * y };
  };
  G.tmInverse = function (N, E, ellName, lon0, k0, FE, FN) {
    const c = tmc(ellName);
    const xi = (N - FN) / (k0 * c.A), eta = (E - FE) / (k0 * c.A);
    let xp = xi, ep = eta;
    for (let j = 1; j <= 3; j++) {
      xp -= c.be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      ep -= c.be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
    let phi = chi;
    for (let j = 1; j <= 3; j++) phi += c.de[j - 1] * Math.sin(2 * j * chi);
    const lon = lon0 + Math.atan2(Math.sinh(ep), Math.cos(xp)) * R2D;
    return { lat: phi * R2D, lon };
  };

  // grid scale factor & convergence (useful in reports)
  G.tmScaleConv = function (lat, lon, sys) {
    const s = G.SYSTEMS[sys];
    const d = 1e-6;
    const p0 = G.tmForward(lat, lon, G.DATUMS[s.datum].ell, s.lon0, s.k0, s.FE, s.FN);
    const pn = G.tmForward(lat + d, lon, G.DATUMS[s.datum].ell, s.lon0, s.k0, s.FE, s.FN);
    const conv = Math.atan2(pn.E - p0.E, pn.N - p0.N) * R2D; // grid azimuth of true north
    const ell = ELL[G.DATUMS[s.datum].ell], e2 = ell.f * (2 - ell.f), phi = lat * D2R;
    const M = ell.a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi) ** 2, 1.5);
    const k = Math.hypot(pn.E - p0.E, pn.N - p0.N) / (M * d * D2R);
    return { k, conv };
  };

  function geoToECEF(lat, lon, h, ell) {
    const e2 = ell.f * (2 - ell.f), p = lat * D2R, l = lon * D2R;
    const Nn = ell.a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
    return [(Nn + h) * Math.cos(p) * Math.cos(l), (Nn + h) * Math.cos(p) * Math.sin(l), (Nn * (1 - e2) + h) * Math.sin(p)];
  }
  function ecefToGeo(X, Y, Z, ell) {
    const e2 = ell.f * (2 - ell.f), a = ell.a, p = Math.hypot(X, Y);
    let lat = Math.atan2(Z, p * (1 - e2)), h = 0;
    for (let i = 0; i < 8; i++) {
      const Nn = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
      h = p / Math.cos(lat) - Nn;
      lat = Math.atan2(Z, p * (1 - e2 * Nn / (Nn + h)));
    }
    return { lat: lat * R2D, lon: Math.atan2(Y, X) * R2D, h };
  }
  function helmert(X, tw, inverse) {
    const AS = D2R / 3600;
    let [tx, ty, tz, rx, ry, rz, s] = tw;
    rx *= AS; ry *= AS; rz *= AS; s = 1 + s * 1e-6;
    if (!inverse) {
      return [tx + s * (X[0] - rz * X[1] + ry * X[2]), ty + s * (rz * X[0] + X[1] - rx * X[2]), tz + s * (-ry * X[0] + rx * X[1] + X[2])];
    }
    // inverse of small-angle position-vector transform (solve exactly with 3x3)
    const v = [(X[0] - tx) / s, (X[1] - ty) / s, (X[2] - tz) / s];
    const M = [[1, -rz, ry], [rz, 1, -rx], [-ry, rx, 1]];
    return solve3(M, v);
  }
  function solve3(M, v) {
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(M);
    return [0, 1, 2].map(k => det(M.map((r, i) => r.map((x, j) => j === k ? v[i] : x))) / D);
  }
  /* Datum shift between geographic coordinates (heights assumed 0 — fine for 2D cadastral work) */
  G.datumShift = function (lat, lon, from, to, h = 0) {
    if (from === to) return { lat, lon, h };
    const df = G.DATUMS[from], dt = G.DATUMS[to];
    let X = geoToECEF(lat, lon, h, ELL[df.ell]);
    X = helmert(X, df.tw, false);           // -> WGS84
    X = helmert(X, dt.tw, true);            // WGS84 -> target
    const g = ecefToGeo(X[0], X[1], X[2], ELL[dt.ell]);
    return { lat: g.lat, lon: g.lon, h: g.h };
  };

  /* Convert a point between any two systems in G.SYSTEMS.
   * Grid input: {N,E}; geographic input: {lat,lon}. Output same shape for the target. */
  G.convert = function (pt, fromSys, toSys) {
    const f = G.SYSTEMS[fromSys], t = G.SYSTEMS[toSys];
    let geo = f.kind === 'geo' ? { lat: +pt.lat, lon: +pt.lon }
      : G.tmInverse(+pt.N, +pt.E, G.DATUMS[f.datum].ell, f.lon0, f.k0, f.FE, f.FN);
    geo = G.datumShift(geo.lat, geo.lon, f.datum, t.datum, +pt.h || 0);
    if (t.kind === 'geo') return geo;
    return G.tmForward(geo.lat, geo.lon, G.DATUMS[t.datum].ell, t.lon0, t.k0, t.FE, t.FN);
  };
  G.toWGS = (pt, sys) => G.convert(pt, sys, 'WGS84_GEO');

  // parse "14 25 30.5" / "14°25'30.5\"N" / "14.425" / "121-02-03 E"
  G.parseAngle = function (s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    const neg = /^-|[SW]\s*$|^[SW]/i.test(s);
    const nums = s.match(/\d+(?:\.\d+)?/g);
    if (!nums) return null;
    const v = +nums[0] + (+nums[1] || 0) / 60 + (+nums[2] || 0) / 3600;
    return neg ? -v : v;
  };

  /* ---------- best fit (least squares) ---------- */
  /* pairs: [{x,y,X,Y}] source (x=E,y=N) -> target. model: 'similarity' | 'affine' | 'translation' */
  G.bestFit = function (pairs, model = 'similarity') {
    const n = pairs.length;
    if (n < (model === 'affine' ? 3 : model === 'similarity' ? 2 : 1)) throw new Error('Not enough control points for this model.');
    const mx = pairs.reduce((s, p) => s + p.x, 0) / n, my = pairs.reduce((s, p) => s + p.y, 0) / n;
    const mX = pairs.reduce((s, p) => s + p.X, 0) / n, mY = pairs.reduce((s, p) => s + p.Y, 0) / n;
    let fn, params;
    if (model === 'translation') {
      const tx = mX - mx, ty = mY - my;
      fn = (x, y) => ({ X: x + tx, Y: y + ty });
      params = { tx, ty, scale: 1, rot: 0 };
    } else if (model === 'similarity') {
      let sxx = 0, a1 = 0, b1 = 0;
      for (const p of pairs) {
        const x = p.x - mx, y = p.y - my, X = p.X - mX, Y = p.Y - mY;
        sxx += x * x + y * y; a1 += x * X + y * Y; b1 += x * Y - y * X;
      }
      const a = a1 / sxx, b = b1 / sxx;
      fn = (x, y) => ({ X: mX + a * (x - mx) - b * (y - my), Y: mY + b * (x - mx) + a * (y - my) });
      // rotation reported as a clockwise bearing change
      params = { a, b, scale: Math.hypot(a, b), rot: -Math.atan2(b, a) * R2D, tx: mX - (a * mx - b * my), ty: mY - (b * mx + a * my) };
    } else {
      // X = c0 + c1 x + c2 y ; Y = d0 + d1 x + d2 y  (centered)
      let Sxx = 0, Sxy = 0, Syy = 0, SxX = 0, SyX = 0, SxY = 0, SyY = 0;
      for (const p of pairs) {
        const x = p.x - mx, y = p.y - my, X = p.X - mX, Y = p.Y - mY;
        Sxx += x * x; Sxy += x * y; Syy += y * y; SxX += x * X; SyX += y * X; SxY += x * Y; SyY += y * Y;
      }
      const det = Sxx * Syy - Sxy * Sxy;
      if (Math.abs(det) < 1e-9) throw new Error('Control points are collinear.');
      const c1 = (SxX * Syy - SyX * Sxy) / det, c2 = (SyX * Sxx - SxX * Sxy) / det;
      const d1 = (SxY * Syy - SyY * Sxy) / det, d2 = (SyY * Sxx - SxY * Sxy) / det;
      fn = (x, y) => ({ X: mX + c1 * (x - mx) + c2 * (y - my), Y: mY + d1 * (x - mx) + d2 * (y - my) });
      params = { c1, c2, d1, d2, scale: Math.sqrt(Math.abs(c1 * d2 - c2 * d1)), rot: -Math.atan2(d1, c1) * R2D };
    }
    const res = pairs.map(p => { const q = fn(p.x, p.y); return { dX: p.X - q.X, dY: p.Y - q.Y, r: Math.hypot(p.X - q.X, p.Y - q.Y) }; });
    const dof = 2 * n - (model === 'affine' ? 6 : model === 'similarity' ? 4 : 2);
    const ss = res.reduce((s, r) => s + r.r * r.r, 0);
    return { fn, params, residuals: res, rms: Math.sqrt(ss / n), sigma0: dof > 0 ? Math.sqrt(ss / dof) : null, dof };
  };

  /* ---------- Delaunay (Bowyer–Watson) & contours ---------- */
  G.delaunay = function (pts) {
    const n = pts.length;
    if (n < 3) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.E); maxX = Math.max(maxX, p.E); minY = Math.min(minY, p.N); maxY = Math.max(maxY, p.N); }
    const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
    const P = pts.map(p => [p.E - ox, p.N - oy]);
    const dm = Math.max(maxX - minX, maxY - minY) * 20 || 1;
    P.push([-dm, -dm], [dm, -dm], [0, dm]);
    let tris = [[n, n + 1, n + 2]];
    const circ = t => {
      const [a, b, c] = t.map(i => P[i]);
      const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
      const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
      const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
      const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
      return [x, y, (a[0] - x) ** 2 + (a[1] - y) ** 2];
    };
    let cc = tris.map(circ);
    // insert points in a spatially coherent order for speed
    const order = [...Array(n).keys()].sort((i, j) => P[i][0] - P[j][0]);
    for (const i of order) {
      const [px, py] = P[i];
      const bad = [], keep = [], keepC = [];
      for (let k = 0; k < tris.length; k++) {
        const c = cc[k];
        if ((px - c[0]) ** 2 + (py - c[1]) ** 2 < c[2] * (1 + 1e-12)) bad.push(tris[k]);
        else { keep.push(tris[k]); keepC.push(c); }
      }
      const edges = new Map();
      for (const t of bad) for (let e = 0; e < 3; e++) {
        const u = t[e], v = t[(e + 1) % 3], key = u < v ? u + ',' + v : v + ',' + u;
        edges.set(key, edges.has(key) ? null : [u, v]);
      }
      for (const e of edges.values()) if (e) { const t = [e[0], e[1], i]; keep.push(t); keepC.push(circ(t)); }
      tris = keep; cc = keepC;
    }
    return tris.filter(t => t[0] < n && t[1] < n && t[2] < n);
  };

  /* Contours from points [{E,N,Z}] → [{z, lines:[[{E,N}...]], index:bool}] */
  G.contours = function (pts, interval, opts = {}) {
    const tris = G.delaunay(pts).filter(t => {
      if (!opts.maxEdge) return true;
      for (let e = 0; e < 3; e++) { const a = pts[t[e]], b = pts[t[(e + 1) % 3]]; if (Math.hypot(a.E - b.E, a.N - b.N) > opts.maxEdge) return false; }
      return true;
    });
    const zs = pts.map(p => p.Z);
    const zmin = Math.min(...zs), zmax = Math.max(...zs);
    const out = [];
    const idx = opts.indexEvery || 5;
    const start = Math.ceil(zmin / interval) * interval;
    for (let z = start; z <= zmax + 1e-9; z += interval) {
      const zz = +z.toFixed(6);
      const segs = [];
      for (const t of tris) {
        const P = t.map(i => pts[i]);
        const cr = [];
        for (let e = 0; e < 3; e++) {
          const a = P[e], b = P[(e + 1) % 3];
          let za = a.Z, zb = b.Z;
          if (za === zz) za += 1e-9; if (zb === zz) zb += 1e-9;
          if ((za - zz) * (zb - zz) < 0) {
            const k = (zz - za) / (zb - za);
            cr.push({ E: a.E + k * (b.E - a.E), N: a.N + k * (b.N - a.N) });
          }
        }
        if (cr.length === 2) segs.push(cr);
      }
      out.push({ z: zz, index: Math.abs(Math.round(zz / interval) % idx) === 0, lines: chain(segs) });
    }
    return { levels: out, tris, zmin, zmax };
  };
  function chain(segs) {
    const key = p => p.E.toFixed(4) + ',' + p.N.toFixed(4);
    const map = new Map();
    segs.forEach((s, i) => s.forEach((p, j) => {
      const k = key(p); if (!map.has(k)) map.set(k, []); map.get(k).push([i, j]);
    }));
    const used = new Array(segs.length).fill(false), lines = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const line = [segs[i][0], segs[i][1]];
      for (const dir of [1, 0]) {
        let grow = true;
        while (grow) {
          grow = false;
          const end = dir ? line[line.length - 1] : line[0];
          for (const [si, sj] of map.get(key(end)) || []) {
            if (used[si]) continue;
            used[si] = true;
            const nxt = segs[si][1 - sj];
            if (dir) line.push(nxt); else line.unshift(nxt);
            grow = true; break;
          }
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /* ---------- exports ---------- */
  G.toDXF = function (layers) {
    // layers: [{name, color, polylines:[{pts:[{E,N,Z?}], closed}], texts:[{E,N,h,text,rot}], points:[{E,N,Z}]}]
    const L = [];
    const w = (c, v) => L.push(String(c), String(v));
    w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, layers.length);
    for (const ly of layers) { w(0, 'LAYER'); w(2, ly.name); w(70, 0); w(62, ly.color || 7); w(6, 'CONTINUOUS'); }
    w(0, 'ENDTAB'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'ENTITIES');
    for (const ly of layers) {
      for (const pl of ly.polylines || []) {
        const has3d = pl.pts.some(p => p.Z != null);
        w(0, 'POLYLINE'); w(8, ly.name); w(66, 1); w(10, 0); w(20, 0); w(30, has3d ? (pl.pts[0].Z || 0) : 0); w(70, pl.closed ? 1 : 0);
        for (const p of pl.pts) { w(0, 'VERTEX'); w(8, ly.name); w(10, p.E.toFixed(4)); w(20, p.N.toFixed(4)); w(30, (p.Z || 0).toFixed(4)); }
        w(0, 'SEQEND'); w(8, ly.name);
      }
      for (const t of ly.texts || []) {
        w(0, 'TEXT'); w(8, ly.name); w(10, t.E.toFixed(4)); w(20, t.N.toFixed(4)); w(30, 0); w(40, t.h || 1); w(1, t.text); if (t.rot) w(50, t.rot.toFixed(4));
      }
      for (const p of ly.points || []) { w(0, 'POINT'); w(8, ly.name); w(10, p.E.toFixed(4)); w(20, p.N.toFixed(4)); w(30, (p.Z || 0).toFixed(4)); }
    }
    w(0, 'ENDSEC'); w(0, 'EOF');
    return L.join('\n');
  };

  G.toKML = function (name, polys) {
    // polys: [{name, ll:[{lat,lon}], color:'ff0000ff'}]
    const esc = s => String(s).replace(/[<&>]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    let s = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + esc(name) + '</name>\n';
    for (const p of polys) {
      const coords = p.ll.concat([p.ll[0]]).map(q => q.lon.toFixed(8) + ',' + q.lat.toFixed(8) + ',0').join(' ');
      s += '<Placemark><name>' + esc(p.name) + '</name><Style><LineStyle><color>' + (p.color || 'ff00a5ff') + '</color><width>2</width></LineStyle><PolyStyle><color>33' + (p.color || 'ff00a5ff').slice(2) + '</color></PolyStyle></Style>' +
        '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + coords + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>\n';
    }
    return s + '</Document></kml>';
  };

  /* Web Mercator helpers for the map */
  G.lonLatToPx = (lon, lat, z) => {
    const s = 256 * Math.pow(2, z), sinl = Math.sin(lat * D2R);
    return { x: (lon + 180) / 360 * s, y: (0.5 - Math.log((1 + sinl) / (1 - sinl)) / (4 * Math.PI)) * s };
  };
  G.pxToLonLat = (x, y, z) => {
    const s = 256 * Math.pow(2, z), lon = x / s * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / s;
    return { lon, lat: R2D * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.Geo = G;
})(typeof window !== 'undefined' ? window : globalThis);
