// =====================================================================
// Rekenkern destillatie-demonstrator (McCabe-Thiele, binair, constante molaire overloop)
// Conventies cursus Scheidingstechnologie (KU Leuven): platen van boven naar beneden,
// totale condensor, reboiler = ideale trap, Murphree-dampefficientie op de platen.
// =====================================================================
"use strict";

// ---------------------------------------------------------------- hulpfuncties
function bisect(f, a, b, n = 80) {
  let fa = f(a);
  for (let i = 0; i < n; i++) {
    const c = 0.5 * (a + b), fc = f(c);
    if ((fa <= 0 && fc <= 0) || (fa > 0 && fc > 0)) { a = c; fa = fc; } else b = c;
  }
  return 0.5 * (a + b);
}

// PCHIP zoals scipy.interpolate.PchipInterpolator
function pchip(xs, ys) {
  const n = xs.length, h = [], m = [], d = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) { h.push(xs[k + 1] - xs[k]); m.push((ys[k + 1] - ys[k]) / h[k]); }
  for (let k = 1; k < n - 1; k++) {
    if (m[k - 1] * m[k] <= 0) d[k] = 0;
    else {
      const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
      d[k] = (w1 + w2) / (w1 / m[k - 1] + w2 / m[k]);
    }
  }
  const edge = (h0, h1, m0, m1) => {
    let dd = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (Math.sign(dd) !== Math.sign(m0)) dd = 0;
    else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(dd) > 3 * Math.abs(m0)) dd = 3 * m0;
    return dd;
  };
  if (n > 2) {
    d[0] = edge(h[0], h[1], m[0], m[1]);
    d[n - 1] = edge(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
  } else { d[0] = d[1] = m[0]; }
  return function (x) {
    if (x <= xs[0]) return ys[0] + d[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + d[n - 1] * (x - xs[n - 1]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const hh = h[lo], t = (x - xs[lo]) / hh, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * hh * d[lo] +
      (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * hh * d[lo + 1];
  };
}

// ---------------------------------------------------------------- Antoine
// log10(p/mmHg) = A - B/(T/°C + C)
const ANTOINE = {
  aceton:   { A: 7.11714, B: 1210.595, C: 229.664 },
  methanol: { A: 8.08097, B: 1582.271, C: 239.726 },
  ethanol:  { A: 8.20417, B: 1642.89,  C: 230.300 },
  water:    { A: 8.07131, B: 1730.63,  C: 233.426 },
  benzeen:  { A: 6.90565, B: 1211.033, C: 220.790 },
  ethanol51:{ A: 8.04494, B: 1554.3,   C: 222.65 },   // zoals oefening 5.1
};
const mmHg = (c) => (T) => Math.pow(10, c.A - c.B / (T + c.C)) * 101.325 / 760; // kPa
// benzeen-tolueen zoals oefening 5.2-5.4: ln(p/kPa)
const pBenzeen = (t) => Math.exp(13.7819 - 2726.81 / (t + 217.572));
const pTolueen = (t) => Math.exp(13.9320 - 3056.96 / (t + 217.625));

// ---------------------------------------------------------------- UNIFAC (origineel, VLE)
const UG = {  // R, Q, hoofdgroep
  CH3: [0.9011, 0.848, 1], CH2: [0.6744, 0.540, 1], ACH: [0.5313, 0.400, 3],
  OH: [1.0000, 1.200, 5], CH3OH: [1.4311, 1.432, 6], H2O: [0.9200, 1.400, 7], CH3CO: [1.6724, 1.488, 9],
};
const UA = {
  "1,3": 61.13, "3,1": -11.12, "1,5": 986.5, "5,1": 156.4, "1,6": 697.2, "6,1": 16.51,
  "1,7": 1318, "7,1": 300.0, "1,9": 476.4, "9,1": 26.76, "3,5": 636.1, "5,3": 89.60,
  "5,7": 353.5, "7,5": -229.1, "6,7": -181.0, "7,6": 289.6, "6,9": 23.39, "9,6": 108.7,
};
function unifacModel(mols) {
  const G = [...new Set(mols.flatMap((m) => Object.keys(m)))];
  const r = mols.map((m) => Object.entries(m).reduce((s, [g, n]) => s + n * UG[g][0], 0));
  const q = mols.map((m) => Object.entries(m).reduce((s, [g, n]) => s + n * UG[g][1], 0));
  const psi = (gm, gn, T) => {
    const a = UG[gm][2], b = UG[gn][2];
    return a === b ? 1 : Math.exp(-UA[a + "," + b] / T);
  };
  function lnGamR(X, T) {
    let th = G.map((g, i) => UG[g][1] * X[i]); const s = th.reduce((a, b) => a + b, 0); th = th.map((v) => v / s);
    const P = G.map((gm) => G.map((gn) => psi(gm, gn, T)));
    const den = G.map((_, mI) => G.reduce((acc, _2, nI) => acc + th[nI] * P[nI][mI], 0));
    return G.map((gk, k) => {
      const s1 = den[k];
      let s2 = 0; for (let mI = 0; mI < G.length; mI++) s2 += th[mI] * P[k][mI] / den[mI];
      return UG[gk][1] * (1 - Math.log(s1) - s2);
    });
  }
  const pure = mols.map((m) => {
    const X = G.map((g) => m[g] || 0); const s = X.reduce((a, b) => a + b, 0);
    return X.map((v) => v / s);
  });
  return function gamma(x1, Tc) {
    const T = Tc + 273.15, x = [Math.max(x1, 1e-12), Math.max(1 - x1, 1e-12)];
    const sr = x[0] * r[0] + x[1] * r[1], sq = x[0] * q[0] + x[1] * q[1];
    const l = [0, 1].map((i) => 5 * (r[i] - q[i]) - (r[i] - 1));
    const sxl = x[0] * l[0] + x[1] * l[1];
    const lnC = [0, 1].map((i) => {
      const phi = r[i] / sr, th = q[i] / sq; // phi_i/x_i , theta_i/x_i
      return Math.log(phi) + 5 * q[i] * Math.log(th / phi) + l[i] - phi * sxl;
    });
    const Xg = G.map((g) => mols.reduce((s, m, j) => s + (m[g] || 0) * x[j], 0));
    const sX = Xg.reduce((a, b) => a + b, 0);
    const lr = lnGamR(Xg.map((v) => v / sX), T);
    return [0, 1].map((i) => {
      const lp = lnGamR(pure[i], T);
      let res = 0; G.forEach((g, k) => { res += (mols[i][g] || 0) * (lr[k] - lp[k]); });
      return Math.exp(lnC[i] + res);
    });
  };
}

function vanLaar(A12, A21) {
  return function (x1) {
    if (A12 === 0 && A21 === 0) return [1, 1];
    const x2 = 1 - x1, d = A12 * x1 + A21 * x2;
    if (Math.abs(d) < 1e-14) return [1, 1];
    return [Math.exp(A12 * Math.pow(A21 * x2 / d, 2)), Math.exp(A21 * Math.pow(A12 * x1 / d, 2))];
  };
}

// ---------------------------------------------------------------- systemen
// Elk systeem: component 1 = lichtste component (x, y verwijzen ernaar).
const SYSTEMEN = {
  ideaal: {
    naam: "Ideaal systeem (constante α)", c1: "A (licht)", c2: "B (zwaar)", soort: "alpha",
    uitleg: "y = αx / (1 + (α − 1)x). Geen temperaturen: kies q rechtstreeks of via de dampfractie.",
    lambda: [30, 30],
  },
  vanlaar: {
    naam: "Eigen niet-ideaal systeem (α₀ + Van Laar)", c1: "A (licht)", c2: "B (zwaar)", soort: "vanlaar",
    uitleg: "α = α₀·γ₁/γ₂ met Van Laar-activiteitscoëfficiënten. Met A₁₂, A₂₁ > 0 (positieve afwijking) ontstaat bij voldoende grote waarden een minimumazeotroop.",
    lambda: [30, 30],
  },
  bt: {
    naam: "Benzeen – tolueen (Raoult + Antoine)", c1: "benzeen", c2: "tolueen", soort: "model",
    p: [pBenzeen, pTolueen], gam: () => [1, 1], Tbrak: [60, 130], lambda: [30.72, 33.18],
    uitleg: "Ideaal mengsel: wet van Raoult met Antoine-constanten zoals in oefening 5.2–5.4.",
  },
  ew: {
    naam: "Ethanol – water (UNIFAC + Antoine)", c1: "ethanol", c2: "water", soort: "model",
    p: [mmHg(ANTOINE.ethanol), mmHg(ANTOINE.water)],
    gam: unifacModel([{ CH3: 1, CH2: 1, OH: 1 }, { H2O: 1 }]), Tbrak: [50, 120], lambda: [38.56, 40.65],
    uitleg: "Niet-ideaal: activiteitscoëfficiënten uit UNIFAC (origineel). Minimumazeotroop bij hoge ethanolfractie.",
  },
  ewdata: {
    naam: "Ethanol – water (meetgegevens Perry, oef. 5.5)", c1: "ethanol", c2: "water", soort: "data",
    xd: [0, 0.019, 0.072, 0.124, 0.166, 0.234, 0.327, 0.397, 0.508, 0.573, 0.676, 0.747, 0.894, 1],
    yd: [0, 0.170, 0.389, 0.470, 0.509, 0.545, 0.583, 0.612, 0.656, 0.684, 0.739, 0.782, 0.894, 1],
    tModel: "ew", lambda: [38.56, 40.65], xaz: 0.894,
    uitleg: "Evenwichtslijn door de meetpunten uit oefening 5.5 (PCHIP-interpolatie); azeotroop bij x = 0.894. Temperaturen uit het UNIFAC-model.",
  },
  mw: {
    naam: "Methanol – water (UNIFAC + Antoine)", c1: "methanol", c2: "water", soort: "model",
    p: [mmHg(ANTOINE.methanol), mmHg(ANTOINE.water)],
    gam: unifacModel([{ CH3OH: 1 }, { H2O: 1 }]), Tbrak: [40, 120], lambda: [35.21, 40.65],
    uitleg: "Niet-ideaal (UNIFAC), maar zonder azeotroop.",
  },
  mwdata: {
    naam: "Methanol – water (meetgegevens, oef. 5.6)", c1: "methanol", c2: "water", soort: "data",
    xd: [0.02, 0.04, 0.06, 0.08, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95],
    yd: [0.134, 0.230, 0.304, 0.365, 0.417, 0.579, 0.669, 0.729, 0.780, 0.825, 0.871, 0.915, 0.959, 0.979],
    aL: 7.58, aH: 2.45, tModel: "mw", lambda: [35.21, 40.65],
    uitleg: "Tabel uit oefening 5.6 (PCHIP); voor x < 0.02 constante α = 7.58, voor x > 0.95 α = 2.45, zoals in de uitwerking.",
  },
  am: {
    naam: "Aceton – methanol (UNIFAC + Antoine, azeotroop)", c1: "aceton", c2: "methanol", soort: "model",
    p: [mmHg(ANTOINE.aceton), mmHg(ANTOINE.methanol)],
    gam: unifacModel([{ CH3: 1, CH3CO: 1 }, { CH3OH: 1 }]), Tbrak: [30, 100], lambda: [29.10, 35.21],
    uitleg: "Niet-ideaal (UNIFAC) met minimumazeotroop (x ≈ 0.78 bij 1 atm), zoals oefening 5.7 en 5.12.",
  },
  be: {
    naam: "Benzeen – ethanol (Van Laar, azeotroop; oef. 5.1)", c1: "benzeen", c2: "ethanol", soort: "model",
    p: [mmHg(ANTOINE.benzeen), mmHg(ANTOINE.ethanol51)], Tbrak: [30, 110], lambda: [30.72, 38.56],
    uitleg: "Van Laar-constanten gefit op het azeotroop (67.9 °C, x = 0.552), zoals oefening 5.1.",
  },
};
// Van Laar-constanten benzeen-ethanol uit het azeotroop bij 1 atm (zoals Oef5.1_Txy_figuren.py)
(function () {
  const s = SYSTEMEN.be, P = 101.325, xa = 0.552, Ta = 67.9;
  const l1 = Math.log(P / s.p[0](Ta)), l2 = Math.log(P / s.p[1](Ta));
  const A12 = l1 * Math.pow(1 + (1 - xa) * l2 / (xa * l1), 2);
  const A21 = l2 * Math.pow(1 + xa * l1 / ((1 - xa) * l2), 2);
  const vl = vanLaar(A12, A21); s.gam = (x) => vl(x); s.A = [A12, A21];
})();

// raster voor tabellering: fijn bij de uiteinden (strenge zuiverheden)
function raster() {
  const xs = [0];
  for (let e = -8; e < -2; e += 0.25) xs.push(Math.pow(10, e));
  for (let v = 0.01; v < 0.99 - 1e-9; v += 0.005) xs.push(+v.toFixed(4));
  for (let e = -2; e >= -8; e -= 0.25) xs.push(1 - Math.pow(10, e));
  xs.push(1);
  return xs;
}

// Bouw een evenwichtsobject {y(x), xVan(y), T(x) of null, Tdauw(y), xaz, ...}
const _cache = {};
function maakEvenwicht(key, par) {
  const s = SYSTEMEN[key];
  const P = par.P || 101.325;
  if (s.soort === "alpha") {
    const a = par.alpha;
    return { key, s, ideaalAlpha: a, y: (x) => a * x / (1 + (a - 1) * x), xVan: (y) => y / (a - (a - 1) * y), T: null, Tdauw: null, xaz: null };
  }
  if (s.soort === "vanlaar") {
    const a0 = par.alpha, gl = vanLaar(par.A12, par.A21);
    const yf = (x) => { const g = gl(x); const a = a0 * g[0] / g[1]; return a * x / (1 + (a - 1) * x); };
    return tabelleer(key, s, raster().map((x) => [x, x <= 0 ? 0 : x >= 1 ? 1 : yf(x), null]), false);
  }
  if (s.soort === "data") {
    let xd = s.xd.slice(), yd = s.yd.slice();
    const f = pchip(xd, yd);
    let yfun;
    if (s.aL) {
      const aL = s.aL, aH = s.aH, x0 = xd[0], x1 = xd[xd.length - 1];
      yfun = (x) => x < x0 ? aL * x / (1 + (aL - 1) * x) : x > x1 ? aH * x / (1 + (aH - 1) * x) : f(x);
    } else yfun = (x) => f(Math.min(1, Math.max(0, x)));
    const tm = maakEvenwicht(s.tModel, par);
    const ev = { key, s, y: yfun, T: tm.T, Tdauw: tm.Tdauw, tModel: tm };
    ev.xVan = (y) => bisect((x) => ev.y(x) - y, 0, 1, 70);
    ev.xaz = s.xaz !== undefined ? s.xaz : zoekAzeotroop(ev.y);
    return ev;
  }
  // model: bubble-point per x
  const ck = key + "@" + P.toFixed(3);
  if (_cache[ck]) return _cache[ck];
  const rows = raster().map((x) => {
    const f = (T) => { const g = s.gam(x, T); return x * g[0] * s.p[0](T) + (1 - x) * g[1] * s.p[1](T) - P; };
    let [a, b] = s.Tbrak; a -= 60; b += 80;
    const T = bisect(f, a, b, 60);
    const g = s.gam(x, T);
    const y = x * g[0] * s.p[0](T) / P;
    return [x, Math.min(1, Math.max(0, y)), T];
  });
  rows[0][1] = 0; rows[rows.length - 1][1] = 1;
  const ev = tabelleer(key, s, rows, true);
  _cache[ck] = ev;
  return ev;
}

function tabelleer(key, s, rows, metT) {
  const xs = rows.map((r) => r[0]), ys = rows.map((r) => r[1]);
  const yf = pchip(xs, ys);
  const ev = { key, s, y: (x) => yf(Math.min(1, Math.max(0, x))) };
  ev.xVan = (y) => bisect((x) => ev.y(x) - y, 0, 1, 70);
  if (metT) {
    const Ts = rows.map((r) => r[2]);
    const tf = pchip(xs, Ts);
    ev.T = (x) => tf(Math.min(1, Math.max(0, x)));
    ev.Tdauw = (y) => ev.T(ev.xVan(y));       // dauwpunt van damp y = kookpunt van de vloeistof in evenwicht
  } else { ev.T = null; ev.Tdauw = null; }
  ev.xaz = zoekAzeotroop(ev.y);
  return ev;
}

function zoekAzeotroop(y) {
  let prev = null;
  for (let i = 1; i < 1000; i++) {
    const x = i / 1000, d = y(x) - x;
    if (prev !== null && Math.sign(d) !== Math.sign(prev.d) && Math.abs(d) > 0 && Math.abs(prev.d) > 0) {
      return bisect((t) => y(t) - t, prev.x, x, 50);
    }
    prev = { x, d };
  }
  return null;
}

// ---------------------------------------------------------------- q-factor uit de thermische toestand
// Geeft {q, uitleg, Tkook, Tdauw}
function qUitTemperatuur(ev, zF, TF, cpL, cpV, lam) {
  if (!ev.T) return null;
  const Tb = ev.T(zF), Td = ev.Tdauw(zF);
  let q;
  if (TF <= Tb) q = 1 + cpL * (Tb - TF) / (lam * 1000);
  else if (TF >= Td) q = -cpV * (TF - Td) / (lam * 1000);
  else {
    // tweefasig: flash bij T_F, vloeistoffractie = (y − z)/(y − x)
    const x = bisect((t) => ev.T(t) - TF, 0, 1, 60); // kookpunt daalt met x (licht)
    const y = ev.y(x);
    q = (y - zF) / (y - x);
  }
  return { q, Tb, Td };
}

// ---------------------------------------------------------------- hoofdberekening
// inp: F, zF, xD, xB, q, mode ('R' | 'Rfac' | 'VB'), R, Rfac, VB, eta, voeding (0 = optimaal)
function bereken(ev, inp) {
  const out = { fouten: [], waarsch: [], info: [] };
  const { F, zF, xD, xB, q } = inp;
  const eta = Math.min(1, Math.max(0.05, inp.eta || 1));
  out.eta = eta; out.q = q;
  if (!(xB < zF && zF < xD)) { out.fouten.push("De specificaties moeten voldoen aan x<sub>B</sub> &lt; z<sub>F</sub> &lt; x<sub>D</sub>."); return out; }
  if (!(xD < 1 && xB > 0)) { out.fouten.push("Kies 0 &lt; x<sub>B</sub> en x<sub>D</sub> &lt; 1 (een volledig zuiver product vraagt oneindig veel platen)."); return out; }

  // massabalansen
  const D = F * (zF - xB) / (xD - xB), B = F - D;
  Object.assign(out, { D, B });

  // azeotroop / evenwicht onder diagonaal tussen x_B en x_D
  if (ev.xaz !== null && ev.xaz > xB && ev.xaz < xD) {
    out.fouten.push(`Er ligt een azeotroop bij x = ${ev.xaz.toFixed(3)} tussen x<sub>B</sub> en x<sub>D</sub>. ` +
      `Met gewone destillatie kan het topproduct de azeotrope samenstelling niet overschrijden: kies x<sub>D</sub> &lt; ${ev.xaz.toFixed(3)}.`);
    out.azeoBlok = true;
  }
  if (ev.xaz !== null) out.info.push(`Azeotroop bij x = ${ev.xaz.toFixed(3)}${ev.T ? `, T = ${ev.T(ev.xaz).toFixed(1)} °C` : ""}.`);

  // snijpunt q-lijn met evenwichtslijn (pinch bij minimale reflux)
  const qlijn = (x) => q / (q - 1) * x - zF / (q - 1);
  let xp;
  if (Math.abs(q - 1) < 1e-9) xp = zF;
  else if (Math.abs(q) < 1e-9) xp = ev.xVan(zF);
  else if (q > 1) xp = bisect((x) => ev.y(x) - qlijn(x), zF, 1, 70);
  else xp = bisect((x) => ev.y(x) - qlijn(x), 0, zF, 70);
  const yp = ev.y(xp);
  out.pinchQ = { x: xp, y: yp };

  if (!out.azeoBlok) {
    // minimale reflux: rectificatie (incl. raakpunt) en stripping (incl. raakpunt)
    let LVr = (xD - yp) / (xD - xp), tang = null;
    const n = 1500;
    for (let i = 0; i < n; i++) {
      const x = xp + (xD - xp) * i / n; if (xD - x < 1e-9) break;
      const v = (xD - ev.y(x)) / (xD - x);
      if (v > LVr + 1e-9) { LVr = v; tang = { x, y: ev.y(x), sectie: "rectificatie" }; }
    }
    let sS = (yp - xB) / (xp - xB), tangS = null;
    for (let i = 1; i <= n; i++) {
      const x = xB + (xp - xB) * i / n;
      const v = (ev.y(x) - xB) / (x - xB);
      if (v < sS - 1e-9) { sS = v; tangS = { x, y: ev.y(x), sectie: "stripping" }; }
    }
    const Rr = LVr / (1 - LVr);
    const VbS = sS > 1 ? B / (sS - 1) : Infinity;
    const RsVia = (VbS + (1 - q) * F) / D - 1;
    let Rmin = Rr, pinch = tang || { x: xp, y: yp, sectie: "q-lijn" };
    if (tangS && RsVia > Rr + 1e-9) { Rmin = RsVia; pinch = tangS; }
    out.Rmin = Math.max(0, Rmin); out.pinch = pinch;
    out.LVmin = out.Rmin / (out.Rmin + 1);
    out.VBmin = ((out.Rmin + 1) * D - (1 - q) * F) / B;
  }

  if (out.azeoBlok) return out;
  // reflux bepalen volgens gekozen specificatie
  let R;
  if (inp.mode === "VB") {
    const Vb = inp.VB * B, V = Vb + (1 - q) * F; R = V / D - 1;
  } else if (inp.mode === "Rfac") {
    R = (out.Rmin !== undefined ? out.Rmin : NaN) * inp.Rfac;
  } else R = inp.R;
  const L = R * D, V = L + D, Lb = L + q * F, Vb = V - (1 - q) * F;
  Object.assign(out, { R, L, V, Lb, Vb, VB: Vb / B, LV: L / V, LbVb: Lb / Vb });
  if (!(R > 0) || V <= 0) { out.fouten.push("De refluxverhouding is negatief of nul: verhoog R<sub>D</sub> of V<sub>B</sub>."); return out; }
  if (Vb <= 0) { out.fouten.push("V̄ ≤ 0: met deze voeding (q) en reflux komt er geen damp uit de reboiler. Verhoog de reflux of de reboilerverhouding."); return out; }

  // werklijnen
  const rect = (x) => R / (R + 1) * x + xD / (R + 1);
  const strip = (x) => Lb / Vb * x - B * xB / Vb;
  out.rect = rect; out.strip = strip;
  const xi = Math.abs(Lb / Vb - R / (R + 1)) < 1e-12 ? zF : (xD / (R + 1) + B * xB / Vb) / (Lb / Vb - R / (R + 1));
  out.xi = xi; out.yi = rect(xi);

  // minimum aantal trappen (totale reflux)
  if (!out.azeoBlok) {
    const tr = []; let y = xD;
    for (let k = 0; k < 400; k++) {
      const x = ev.xVan(y); tr.push({ x, y });
      if (x <= xB) break; y = x;
    }
    out.totaal = tr;
    if (tr.length < 400) {
      const n = tr.length, xprev = n > 1 ? tr[n - 2].x : xD;
      out.Nmin = n; out.NminFrac = n - 1 + (xprev - xB) / (xprev - tr[n - 1].x);
    }
    if (ev.ideaalAlpha) out.Fenske = Math.log((xD / (1 - xD)) * ((1 - xB) / xB)) / Math.log(ev.ideaalAlpha);
  }

  if (out.azeoBlok) return out;
  if (out.Rmin !== undefined && R <= out.Rmin * (1 + 1e-6)) {
    out.fouten.push(`R<sub>D</sub> = ${R.toFixed(3)} ≤ R<sub>D,min</sub> = ${out.Rmin.toFixed(3)}: de werklijnen raken of snijden de evenwichtslijn. ` +
      "Er zijn oneindig veel platen nodig; de specificaties zijn niet haalbaar.");
    out.pinchFout = true;
    return out;
  }

  // trappen: Murphree-dampefficientie op de platen, reboiler ideaal
  const pseudo = (op, x) => op(x) + eta * (ev.y(x) - op(x));
  const losOp = (op, y) => {
    if (pseudo(op, 0) > y) return null;
    if (pseudo(op, 1) < y) return null;
    return bisect((x) => pseudo(op, x) - y, 0, 1, 70);
  };
  const vast = inp.voeding > 0 ? Math.round(inp.voeding) : 0;
  const st = []; let y = xD, boven = true, feed = null, nmax = 300;
  // geval: reboiler alleen volstaat al
  let xr0 = ev.xVan(xD);
  if (xr0 <= xB) { st.push({ n: 1, x: xr0, y: xD, yv: null, reb: true }); }
  else {
    for (let n = 1; n <= nmax; n++) {
      let op = boven ? rect : strip;
      let xn = losOp(op, y);
      if (boven && (vast ? n === vast : (xn !== null && xn < xi))) {
        boven = false; feed = n; op = strip; xn = losOp(op, y);
      }
      if (xn === null || (st.length && xn >= st[st.length - 1].x - 1e-12)) {
        out.fouten.push(boven
          ? "De trappen lopen vast in de rectificatiesectie (pinch boven de voeding). Kies een hogere voedingsplaat of meer reflux."
          : "De trappen lopen vast: de strippinglijn ligt hier boven de evenwichtslijn. Kies een lagere voedingsplaat of een andere specificatie.");
        out.vast = true; break;
      }
      const yv = op(xn);
      st.push({ n, x: xn, y, yv, reb: false, sectie: boven ? "r" : "s" });
      const xr = ev.xVan(yv);
      if (xr <= xB * (1 + 1e-9)) {
        st.push({ n: n + 1, x: xr, y: yv, yv: null, reb: true }); break;
      }
      if (n === nmax) { out.fouten.push(`Meer dan ${nmax} platen nodig: de reflux ligt te dicht bij R<sub>D,min</sub>.`); out.vast = true; }
      y = yv;
    }
  }
  out.trappen = st;
  const reb = st.length && st[st.length - 1].reb;
  out.nPlaten = reb ? st.length - 1 : st.length;
  out.nTrappen = st.length;
  if (reb) {
    out.xBwerkelijk = st[st.length - 1].x;
    const last = st[st.length - 1], prevx = st.length > 1 ? st[st.length - 2].x : xD;
    out.fractieLaatste = (prevx - xB) / (prevx - last.x);
  }
  if (feed === null && reb && !out.vast) feed = st.length; // voeding in de reboiler
  out.voedingsplaat = feed;
  out.voedingInReboiler = reb && feed === st.length;
  if (vast && reb && vast > out.nPlaten) out.waarsch.push(`Voedingsplaat ${vast} ligt onder de laatste plaat: de voeding komt in de reboiler.`);
  if (vast && feed && !out.vast) {
    // vergelijk met optimale voedingsplaat
    const opt = bereken(ev, Object.assign({}, inp, { voeding: 0, mode: "R", R }));
    if (opt.nPlaten !== undefined && opt.nPlaten < out.nPlaten)
      out.waarsch.push(`Niet-optimale voedingsplaat: met voeding op plaat ${opt.voedingsplaat} volstaan ${opt.nPlaten} platen + reboiler (nu ${out.nPlaten}).`);
    out.optimaal = opt;
  }
  if (out.Rmin !== undefined) {
    const r = R / out.Rmin;
    if (!isFinite(r) || out.Rmin <= 0) { /* geen verhouding */ }
    else if (r < 1.1) out.waarsch.push(`R<sub>D</sub>/R<sub>D,min</sub> = ${r.toFixed(2)}: zeer dicht bij minimale reflux, dus erg veel platen.`);
    else if (r > 3) out.waarsch.push(`R<sub>D</sub>/R<sub>D,min</sub> = ${r.toFixed(2)}: weinig platen, maar een hoog energieverbruik (gebruikelijk is 1.2 à 1.5).`);
  }
  if (out.pinch && out.pinch.sectie !== "q-lijn") out.info.push(`Minimale reflux bepaald door een raakpunt aan de evenwichtslijn in de ${out.pinch.sectie}sectie (x = ${out.pinch.x.toFixed(3)}), niet door het snijpunt met de q-lijn.`);

  // warmtestromen: λ van de stroom die van fase verandert
  const lam = inp.lambda || ev.s.lambda;
  const lamMix = (z) => z * lam[0] + (1 - z) * lam[1];
  const dLam = Math.abs(lam[0] - lam[1]) / (0.5 * (lam[0] + lam[1]));
  out.dLambda = dLam;
  if (dLam > 0.10) out.info.push(`De verdampingswarmtes verschillen ${(100 * dLam).toFixed(0)}% (λ<sub>A</sub> = ${lam[0]}, λ<sub>B</sub> = ${lam[1]} kJ/mol). ` +
    "Constante molaire overloop, waarop de rechte werklijnen steunen, is dan slechts een benadering; Q̇<sub>C</sub> en Q̇<sub>R</sub> gebruiken wel λ van het mengsel.");
  const yb = ev.y(xB);
  out.yb = yb;
  out.QC = V * lamMix(xD) * 1000 / 3600;       // kW (V in kmol/h, λ in kJ/mol = MJ/kmol)
  out.QR = Vb * lamMix(yb) * 1000 / 3600;
  if (ev.T) { out.Ttop = ev.T(xD); out.Tbodem = ev.T(xB); out.Tvoeding = ev.T(zF); }
  return out;
}

if (typeof module !== "undefined") module.exports = { SYSTEMEN, maakEvenwicht, bereken, qUitTemperatuur, pchip, bisect };
