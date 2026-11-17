"use strict";
// =====================================================================
// Tabblad absorptie en strippen: evenwichtsplaten (H4) en gepakte kolom (H3)
// Notatie cursus: a = top, b = bodem; gas V in onderaan (y_b), vloeistof L in bovenaan (x_a).
// Evenwicht y* = m·x (molfracties). Verdund: L en V constant, werklijn recht in x–y.
// Geconcentreerd: inertstromen L' en V' constant, werklijn recht in X–Y (molverhoudingen).
// Platen genummerd van boven naar beneden; Murphree-gasefficiëntie via pseudo-evenwichtslijn.
// =====================================================================
const ASTD = {
  proces: "abs", conc: "verdund", type: "platen", m: 2, ev: "lin", k: 2.5,
  G: 100, xa: 0, yb: 0.02, eta: 0.95,
  spec: "fac", fac: 1.5, D: 300, AS: 1.4, etaM: 1,
  hmode: "H", HOy: 0.6, Kya: 150, Sd: 1.0,
};
const APRESETS = [
  { naam: "Verdunde absorptie: 95% geabsorbeerd, L = 1.5 L_min", s: {} },
  { naam: "Absorptie met A = 0.9 < 1: hoogstens 90% geabsorbeerd", s: { spec: "AS", AS: 0.9, eta: 0.85 } },
  { naam: "Controle Kremser: A = 0.9, geabsorbeerd 78.66% → 5 ideale platen (Oef. 4.2)", s: { spec: "AS", AS: 0.9, eta: 0.78658 } },
  { naam: "Stripper met zuivere lucht: 98% verwijderd, S = 1.5", s: { proces: "strip", m: 3, xa: 0.01, yb: 0, eta: 0.98, spec: "AS", AS: 1.5 } },
  { naam: "Geconcentreerd gas (10 mol%): X–Y-diagram", s: { conc: "conc", m: 1.92, yb: 0.10, eta: 0.95, fac: 1.5 } },
  { naam: "Murphree-efficiëntie 60%: werkelijke platen", s: { etaM: 0.6 } },
  { naam: "Gepakte kolom, verdund: N_Oy = (y_b − y_a)/Δy_LM", s: { type: "gepakt" } },
  { naam: "Gepakte kolom, geconcentreerd gas: gekromde werklijn", s: { type: "gepakt", conc: "conc", m: 1.2, yb: 0.30, eta: 0.9, fac: 1.4 } },
  { naam: "Gekromd evenwicht y* = 0.3x + 2.5x² (zoals de samenvattingsfiguur N_Oy)", s: { type: "gepakt", conc: "conc", ev: "krom", m: 0.3, k: 2.5, yb: 0.5, xa: 0, eta: 0.958333, spec: "D", D: 90 } },
  { naam: "Gekromd evenwicht (holle lijn): pinch midden in de kolom", s: { ev: "krom", m: 2, k: -3, yb: 0.2, eta: 0.95, fac: 1.3 } },
  { naam: "Strippen in een gepakte kolom", s: { type: "gepakt", proces: "strip", m: 3, xa: 0.01, yb: 0, eta: 0.95, spec: "AS", AS: 1.6 } },
];
let AS_ = Object.assign({}, ASTD), AREF = null, aLaatste = null, aTab = "mt";
const AVELDEN = {};

// ---------------------------------------------------------------- rekenkern
function aModel(p) {
  const conc = p.conc === "conc", m = p.m, k = p.ev === "krom" ? p.k : 0;
  const yeq = (x) => m * x + k * x * x;                                  // evenwicht in molfracties
  const xeq = (y) => { if (k === 0) return y / m; const D = m * m + 4 * k * y; return D < 0 ? Infinity : 2 * y / (m + Math.sqrt(D)); };
  const lin = !conc && k === 0;
  const U = conc ? (x) => x / (1 - x) : (x) => x;        // vloeistof: x of X
  const W = conc ? (y) => y / (1 - y) : (y) => y;        // gas: y of Y
  const ux = conc ? (u) => u / (1 + u) : (u) => u;
  const wy = conc ? (w) => w / (1 + w) : (w) => w;
  const eqW = (u) => { const y = yeq(ux(u)); return y >= 1 ? Infinity : W(y); };
  const eqU = (w) => { const x = xeq(wy(w)); return x >= 1 ? Infinity : U(x); };
  return { conc, m, k, lin, yeq, xeq, U, W, ux, wy, eqW, eqU };
}

function aTrappen(M, r, etaM) {
  const s = r.s, op = (u) => r.wa + s * (u - r.ua);
  const ps = (u) => { const o = op(u), e = M.eqW(u); return e === Infinity ? Infinity : o + etaM * (e - o); };
  const abs = r.proces === "abs", st = [];
  let w = r.wa, up = r.ua;
  for (let n = 1; n <= 200; n++) {
    let lo, hi;
    if (abs) { lo = up; hi = Math.max(r.ub, up) * 1.5 + 1e-6; let k = 0; while (ps(hi) < w && k++ < 60) hi *= 2; }
    else { lo = 0; hi = up; }
    const un = bisect((u) => ps(u) - w, lo, hi, 80);
    if (un === null || !isFinite(un)) return { st, N: Infinity, pinch: true };
    const klaar = abs ? un >= r.ub - 1e-14 : un <= r.ub + 1e-14;
    st.push({ n, uin: up, w, u: un, wv: op(un) });
    if (klaar) {
      const fr = Math.abs(un - up) > 1e-15 ? (r.ub - up) / (un - up) : 1;
      return { st, N: n - 1 + Math.min(1, Math.max(0, fr)), nHeel: n, fr, pinch: false };
    }
    if (Math.abs(un - up) < 1e-12 * Math.max(1, Math.abs(up))) return { st, N: Infinity, pinch: true };
    up = un; w = op(un);
  }
  return { st, N: Infinity, pinch: true };
}

function aOverdracht(M, r) {
  // gepakte kolom: integralen in molfracties
  const n = 400, pts = [];
  const abs = r.proces === "abs";
  for (let i = 0; i <= n; i++) {
    const w = r.wa + (r.wb - r.wa) * i / n;           // van top naar bodem
    const u = r.ua + (w - r.wa) / r.s;
    const x = M.ux(u), y = M.wy(w), ys = M.yeq(x), xs = M.xeq(y);
    pts.push({ x, y, ys, xs, dy: abs ? y - ys : ys - y, dx: abs ? xs - x : x - xs });
  }
  if (pts.some((p) => !(p.dy > 0) || !(p.dx > 0))) return null;
  const simpson = (g, v) => { let s = 0; for (let i = 0; i < n; i += 2) s += (v[i + 2] - v[i]) / 6 * (g[i] + 4 * g[i + 1] + g[i + 2]); return Math.abs(s); };
  const NOy = simpson(pts.map((p) => 1 / p.dy), pts.map((p) => p.y));
  const NOx = simpson(pts.map((p) => 1 / p.dx), pts.map((p) => p.x));
  let NOyLM = null, dyLM = null;
  if (M.lin) {
    const da = pts[0].dy, db = pts[n].dy;
    dyLM = Math.abs(db - da) < 1e-12 * da ? da : (db - da) / Math.log(db / da);
    NOyLM = Math.abs(r.yb - r.ya) / dyLM;
  }
  return { pts, NOy, NOx, NOyLM, dyLM };
}

function berekenAbs(p) {
  const M = aModel(p);
  const abs = p.proces === "abs";
  const out = { p, proces: p.proces, conc: M.conc, lin: M.lin, fouten: [], waarsch: [], info: [] };
  const fout = (t) => { out.fouten.push(t); return out; };
  if (!(p.m > 0)) return fout("m moet positief zijn.");
  if (!(p.eta > 0 && p.eta < 1)) return fout("Het rendement moet tussen 0 en 1 liggen.");
  out.ua = M.U(p.xa); out.wb = M.W(p.yb);
  out.xa = p.xa; out.yb = p.yb;
  // vaste specificatie van de "andere" kolomzijde
  if (abs) {
    out.wa = (1 - p.eta) * out.wb;
    out.ya = M.wy(out.wa);
    if (!(out.wa > M.eqW(out.ua))) return fout(`y<sub>a</sub> = ${f(out.ya, 5)} ligt onder het evenwicht met de inkomende vloeistof (y* = ${f(M.yeq(p.xa), 5)}): dit rendement is met deze vloeistof niet te halen.`);
    const haalbaar = (s) => { for (let i = 1; i <= 300; i++) { const w = out.wa + (out.wb - out.wa) * i / 300; if (!(out.ua + (w - out.wa) / s < M.eqU(w))) return false; } return true; };
    let hi = 1; while (!haalbaar(hi)) hi *= 2;
    out.smin = bisect((s) => haalbaar(s) ? 1 : -1, 1e-9, hi, 70);
  } else {
    out.ub = (1 - p.eta) * out.ua;
    out.xb = M.ux(out.ub);
    if (!(out.wb < M.eqW(out.ub))) return fout(`Het stripgas (y<sub>b</sub> = ${f(p.yb, 5)}) is niet armer dan het evenwicht met x<sub>b</sub> (y* = ${f(M.yeq(out.xb), 5)}): dit rendement is met dit gas niet te halen.`);
    const haalbaar = (s) => { for (let i = 0; i <= 300; i++) { const u = out.ub + (out.ua - out.ub) * i / 300; if (!(out.wb + s * (u - out.ub) < M.eqW(u))) return false; } return true; };
    const shi = Math.min(1e9, (M.eqW(out.ua) - out.wb) / (out.ua - out.ub));
    out.smax = bisect((s) => haalbaar(s) ? 1 : -1, 1e-12, shi, 70);
  }
  // stromen: G = gegeven stroom (V voor absorptie, L voor strippen)
  const inertG = M.conc ? p.G * (1 - (abs ? p.yb : p.xa)) : p.G;      // V' of L'
  let s;
  if (abs) {
    out.V = p.G; out.Vi = inertG;
    out.Lmin_i = out.smin * inertG; out.Lmin = M.conc ? out.Lmin_i / (1 - p.xa) : out.Lmin_i;
    if (p.spec === "fac") s = p.fac * out.smin;
    else if (p.spec === "D") s = (M.conc ? p.D * (1 - p.xa) : p.D) / inertG;
    else s = p.AS * p.m;
    out.Li = s * inertG; out.L = M.conc ? out.Li / (1 - p.xa) : out.Li;
    out.fac = s / out.smin;
    out.ub = out.ua + (out.wb - out.wa) / s; out.xb = M.ux(out.ub);
  } else {
    out.L = p.G; out.Li = inertG;
    out.Vmin_i = inertG / out.smax; out.Vmin = M.conc ? out.Vmin_i / (1 - p.yb) : out.Vmin_i;
    if (p.spec === "fac") s = out.smax / p.fac;
    else if (p.spec === "D") s = inertG / (M.conc ? p.D * (1 - p.yb) : p.D);
    else s = p.m / p.AS;
    out.Vi = inertG / s; out.V = M.conc ? out.Vi / (1 - p.yb) : out.Vi;
    out.fac = out.smax / s;
    out.wa = out.wb + s * (out.ua - out.ub); out.ya = M.wy(out.wa);
  }
  out.s = s;
  out.A = !M.lin ? null : s / p.m;              // A = L/(mV)
  out.Sf = !M.lin ? null : p.m / s;            // S = mV/L
  if (M.lin) { if (abs) out.Amin = out.smin / p.m; else out.Smin = p.m / out.smax; }   // A = (L/L_min)·A_min, S = (V/V_min)·S_min
  // pinchlocatie bij minimum
  out.pinch = (() => {
    const sm = abs ? out.smin : out.smax; let best = null, bd = Infinity;
    for (let i = 0; i <= 300; i++) {
      if (abs) { const w = out.wa + (out.wb - out.wa) * i / 300, u = out.ua + (w - out.wa) / sm, d = M.eqU(w) - u; if (d < bd) { bd = d; best = [u, w]; } }
      else { const u = out.ub + (out.ua - out.ub) * i / 300, w = out.wb + sm * (u - out.ub), d = M.eqW(u) - w; if (d < bd) { bd = d; best = [u, w]; } }
    }
    return best;
  })();
  if (!(out.fac > 1 + 1e-9)) {
    const nm = abs ? "L" : "V";
    return fout(`${nm} = ${f(abs ? out.L : out.V, 2)} kmol/h ligt onder ${nm}<sub>min</sub> = ${f(abs ? out.Lmin : out.Vmin, 2)} kmol/h: de werklijn raakt of snijdt de evenwichtslijn (pinch). Er zijn oneindig veel ${p.type === "platen" ? "platen" : "transfereenheden"} nodig.`);
  }
  // platen
  out.ideaal = aTrappen(M, out, 1);
  out.werkelijk = p.etaM < 1 ? aTrappen(M, out, p.etaM) : out.ideaal;
  if (M.lin) {
    if (abs) {
      const A = out.A, yas = p.m * p.xa, ybs = p.m * out.xb;
      out.kremser = Math.abs(A - 1) < 1e-9 ? (p.yb - out.ya) / (out.ya - yas) : Math.log((p.yb - ybs) / (out.ya - yas)) / Math.log(A);
    } else {
      const S = out.Sf, xas = out.ya / p.m, xbs = p.yb / p.m;
      out.kremser = Math.abs(S - 1) < 1e-9 ? (p.xa - out.xb) / (out.xb - xbs) : Math.log((p.xa - xas) / (out.xb - xbs)) / Math.log(S);
    }
  }
  // gepakt
  out.ov = aOverdracht(M, out);
  if (out.ov) {
    const Vgem = M.conc ? 0.5 * (out.V + out.Vi / (1 - out.ya)) : out.V;
    const Lgem = M.conc ? 0.5 * (out.L + out.Li / (1 - out.xb)) : out.L;
    out.Vgem = Vgem; out.Lgem = Lgem;
    out.HOy = p.hmode === "H" ? p.HOy : Vgem / (p.Kya * p.Sd);
    out.Z = out.HOy * out.ov.NOy;
    out.HOx = !M.lin ? out.Z / out.ov.NOx : out.A * out.HOy;    // H_Ox = A·H_Oy (verdund)
  }
  // meldingen
  if (abs && M.lin && out.A < 1) out.info.push(`A = ${f(out.A, 3)} < 1: zelfs met oneindig veel platen kan hoogstens een fractie A·(1 − m·x<sub>a</sub>/y<sub>b</sub>) = ${f(out.A * (1 - p.m * p.xa / p.yb), 3)} geabsorbeerd worden. De pinch ligt dan onderaan de kolom.`);
  if (!abs && M.lin && out.Sf < 1) out.info.push(`S = ${f(out.Sf, 3)} < 1: de pinch ligt bovenaan; zelfs met oneindig veel platen is het gestripte rendement begrensd.`);
  if (M.k !== 0) out.info.push(`Gekromd evenwicht y* = ${f(p.m, 3)}·x ${p.k < 0 ? "−" : "+"} ${f(Math.abs(p.k), 3)}·x²: A, S, Kremser en Δy<sub>LM</sub> veronderstellen een rechte evenwichtslijn en gelden hier niet. Het aantal platen volgt grafisch, N<sub>Oy</sub> uit de integraal.` +
    (out.pinch && Math.abs(out.pinch[0] - (abs ? out.ua + (out.wb - out.wa) / out.smin : out.ua)) > 1e-6 * Math.max(1, out.ua) && Math.abs(out.pinch[0] - (abs ? out.ua : out.ub)) > 1e-6 ? " De pinch ligt hier niet aan het uiteinde maar midden in de kolom (raaklijn)." : ""));
  if (M.conc) out.info.push("Geconcentreerd: de werklijn is recht in molverhoudingen X = x/(1 − x) en Y = y/(1 − y) met de inertstromen L′ en V′. Kremser geldt hier niet; het aantal platen volgt enkel grafisch.");
  if (p.etaM < 1 && p.type === "platen") out.info.push(`Murphree-efficiëntie η<sub>M</sub> = ${f(p.etaM, 2)}: de trappen stappen naar de gestreepte pseudo-evenwichtslijn.`);
  if (M.lin && out.kremser !== undefined && p.etaM === 1 && isFinite(out.ideaal.N) && Math.ceil(out.kremser - 1e-6) !== Math.ceil(out.ideaal.N - 1e-6)) out.waarsch.push(`Kremser (${f(out.kremser, 2)}) en de grafische methode (${f(out.ideaal.N, 2)}) geven een ander aantal platen.`);
  if (p.type === "platen" && M.lin && out.kremser !== undefined && isFinite(out.ideaal.N)) out.info.push(`Kremser geeft N = ${f(out.kremser, 2)}, de trappen grafisch ${f(out.ideaal.N, 2)} ideale platen. Het verschil zit enkel in de fractie van de laatste trap (grafisch lineair geïnterpoleerd). Afgerond geven beide ${Math.ceil(out.ideaal.N - 1e-6)} platen.`);
  return out;
}

// ---------------------------------------------------------------- invoerpaneel
function bouwAbsInvoer() {
  const p = $("#ainvoer"); p.innerHTML = "<h2>Invoer absorptie en strippen</h2>";
  const opt = { st: () => AS_, upd: (snel) => aUpdate(snel), reg: AVELDEN, pref: "a" };
  const veld = (fs, id, lab, def) => maakVeld(fs, id, lab, Object.assign({}, opt, def));
  const keuze = (fs, naam, key, opties) => {
    const k = document.createElement("div"); k.className = "keuze";
    k.innerHTML = opties.map(([v, t]) => `<label><input type="radio" name="${naam}" value="${v}"> <span>${t}</span></label>`).join("");
    k.querySelectorAll("input").forEach((r) => r.addEventListener("change", () => { AS_[key] = r.value; aUpdate(); }));
    fs.appendChild(k);
  };
  let fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Proces en kolom</legend>";
  keuze(fs, "aproc", "proces", [["abs", "absorptie"], ["strip", "strippen"]]);
  keuze(fs, "atype", "type", [["platen", "evenwichtsplaten"], ["gepakt", "gepakte kolom"]]);
  keuze(fs, "aconc", "conc", [["verdund", "verdund (x, y)"], ["conc", "geconcentreerd (X, Y)"]]);
  keuze(fs, "aev", "ev", [["lin", "recht: y* = m·x"], ["krom", "gekromd: y* = m·x + k·x²"]]);
  veld(fs, "m", "m (y* = m·x)", { min: 0.05, max: 100, log: true, rond: (v) => +v.toPrecision(3) });
  veld(fs, "k", "k (·x²)", { min: -10, max: 20, dstep: 0.1, rond: (v) => +v.toFixed(2) });
  p.appendChild(fs);

  fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Inkomende stromen en rendement</legend>";
  veld(fs, "G", "V (kmol/h)", { min: 1, max: 5000, log: true, rond: (v) => +v.toPrecision(3) });
  veld(fs, "yb", "y<sub>b</sub> (gas in)", { min: 0, max: 0.6, dstep: 0.005, rond: (v) => +v.toFixed(4) });
  veld(fs, "xa", "x<sub>a</sub> (vloeistof in)", { min: 0, max: 0.3, dstep: 0.001, rond: (v) => +v.toFixed(4) });
  veld(fs, "eta", "geabsorbeerd", { min: 0.05, max: 0.9999, dstep: 0.01, rond: (v) => +v.toFixed(4) });
  const ru = document.createElement("div"); ru.className = "uitleg"; ru.id = "aStroomUitleg"; fs.appendChild(ru);
  p.appendChild(fs);

  fs = document.createElement("fieldset"); fs.innerHTML = "<legend id=\"aOntwerpLeg\">Vloeistofdebiet (kies er één)</legend>";
  veld(fs, "fac", "L/L<sub>min</sub>", { min: 1.0, max: 5, dstep: 0.05, rond: (v) => +v.toFixed(2), radio: "aspec", radioVal: "fac", radioKey: "spec" });
  veld(fs, "D", "L (kmol/h)", { min: 1, max: 20000, log: true, rond: (v) => +v.toPrecision(3), radio: "aspec", radioVal: "D", radioKey: "spec" });
  const ou = document.createElement("div"); ou.className = "uitleg"; ou.id = "aOntwerpUitleg";
  veld(fs, "AS", "A = L/(mV)", { min: 0.3, max: 5, dstep: 0.05, rond: (v) => +v.toFixed(3), radio: "aspec", radioVal: "AS", radioKey: "spec" });
  fs.appendChild(ou);
  p.appendChild(fs);

  fs = document.createElement("fieldset"); fs.id = "aPlatenFs"; fs.innerHTML = "<legend>Platen</legend>";
  veld(fs, "etaM", "η<sub>M</sub> (Murphree)", { dstep: 0.05, min: 0.2, max: 1, rond: (v) => +v.toFixed(2) });
  p.appendChild(fs);

  fs = document.createElement("fieldset"); fs.id = "aPakFs"; fs.innerHTML = "<legend>Pakking (kies er één)</legend>";
  veld(fs, "HOy", "H<sub>Oy</sub> (m)", { min: 0.1, max: 5, log: true, rond: (v) => +v.toPrecision(3), radio: "ahm", radioVal: "H", radioKey: "hmode" });
  veld(fs, "Kya", "K<sub>y</sub>a", { min: 5, max: 2000, log: true, rond: (v) => +v.toPrecision(3), radio: "ahm", radioVal: "K", radioKey: "hmode" });
  veld(fs, "Sd", "S (m²)", { min: 0.05, max: 20, log: true, rond: (v) => +v.toPrecision(3) });
  const pu = document.createElement("div"); pu.className = "uitleg"; pu.innerHTML = "H<sub>Oy</sub> = V/(K<sub>y</sub>a·S), met K<sub>y</sub>a in kmol/(m³·h) en S de oppervlakte van de dwarsdoorsnede.";
  fs.appendChild(pu);
  p.appendChild(fs);
  aSync();
}
function aZetLabel(id, html) { const lab = AVELDEN[id].rij.querySelector("label"); const sp = lab.querySelector("span"); (sp || lab).innerHTML = html; }
function aSync() {
  for (const [id, v] of Object.entries(AVELDEN)) v.set(AS_[id]);
  const zet = (naam, val) => document.querySelectorAll(`input[name=${naam}]`).forEach((r) => { r.checked = r.value === val; });
  zet("aproc", AS_.proces); zet("atype", AS_.type); zet("aconc", AS_.conc); zet("aev", AS_.ev); zet("aspec", AS_.spec); zet("ahm", AS_.hmode);
}

// ---------------------------------------------------------------- update
function aUpdate(snel) {
  const abs = AS_.proces === "abs", conc = AS_.conc === "conc";
  const lin = !conc && AS_.ev !== "krom";
  if (!lin && AS_.spec === "AS") AS_.spec = "fac";
  aZetLabel("m", AS_.ev === "krom" ? "m" : "m (y* = m·x)");
  AVELDEN.k.rij.style.display = AS_.ev === "krom" ? "" : "none";
  aZetLabel("G", abs ? "V (kmol/h)" : "L (kmol/h)");
  aZetLabel("eta", abs ? "geabsorbeerd" : "gestript");
  aZetLabel("fac", abs ? "L/L<sub>min</sub>" : "V/V<sub>min</sub>");
  aZetLabel("D", abs ? "L (kmol/h)" : "V (kmol/h)");
  aZetLabel("AS", abs ? "A = L/(mV)" : "S = mV/L");
  $("#aOntwerpLeg").innerHTML = abs ? "Vloeistofdebiet (kies er één)" : "Stripgasdebiet (kies er één)";
  $("#aStroomUitleg").innerHTML = abs
    ? `Gas V (inclusief opgeloste component) komt onderaan binnen met y<sub>b</sub>; de vloeistof komt bovenaan binnen met x<sub>a</sub>. Geabsorbeerd: fractie van de component in het gas${conc ? " (op basis van Y)" : ""}.`
    : `Vloeistof L komt bovenaan binnen met x<sub>a</sub>; het stripgas komt onderaan binnen met y<sub>b</sub>. Gestript: fractie van de component in de vloeistof${conc ? " (op basis van X)" : ""}.`;
  AVELDEN.AS.rij.style.display = lin ? "" : "none";
  $("#aPlatenFs").hidden = AS_.type !== "platen";
  $("#aPakFs").hidden = AS_.type !== "gepakt";
  aSync();
  document.querySelector('[data-atab=int]').hidden = AS_.type !== "gepakt";
  if (AS_.type !== "gepakt" && aTab === "int") aKiesTab("mt");
  const r = berekenAbs(Object.assign({}, AS_));
  aLaatste = r;
  aTekenKern(r); aTekenMeldingen(r); aTekenKolom(r);
  if (aTab === "mt") aTekenMT(r);
  if (aTab === "fac") aTekenFac(r);
  if (aTab === "int") aTekenInt(r);
  aTekenTabel(r);
  aTekenOntwerpUitleg(r);
  if (!snel) schrijfHash();
}

function aTekenOntwerpUitleg(r) {
  const abs = AS_.proces === "abs", u = $("#aOntwerpUitleg");
  if (!r.lin && !r.conc) { u.innerHTML = `Gekromd evenwicht: ${abs ? "L" : "V"}<sub>min</sub> volgt uit de werklijn die de evenwichtslijn raakt; dat kan aan een uiteinde of midden in de kolom zijn. A en S zijn hier niet constant langs de kolom.`; return; }
  if (r.conc) { u.innerHTML = abs ? "Geconcentreerd: (L′/V′)<sub>min</sub> volgt uit de werklijn die de evenwichtslijn raakt in het X–Y-diagram; L = L′/(1 − x<sub>a</sub>)." : "Geconcentreerd: (V′/L′)<sub>min</sub> volgt uit de werklijn die de evenwichtslijn raakt in het X–Y-diagram."; return; }
  const fm = (v) => f(v, 3);
  if (abs) {
    u.innerHTML = `Verband met A: bij L<sub>min</sub> raakt de werklijn het evenwicht onderaan (x<sub>b</sub>* = y<sub>b</sub>/m), dus (L/V)<sub>min</sub> = (y<sub>b</sub> − y<sub>a</sub>)/(y<sub>b</sub>/m − x<sub>a</sub>) en ` +
      `A<sub>min</sub> = (y<sub>b</sub> − y<sub>a</sub>)/(y<sub>b</sub> − m·x<sub>a</sub>)` + (r.Amin !== undefined ? ` = ${fm(r.Amin)}` : "") +
      `. Met zuiver oplosmiddel (x<sub>a</sub> = 0) is A<sub>min</sub> gelijk aan de geabsorbeerde fractie. Daaruit: <b>A = (L/L<sub>min</sub>)·A<sub>min</sub></b>` +
      (r.Amin !== undefined && isFinite(r.fac) ? ` = ${f(r.fac, 2)} × ${fm(r.Amin)} = ${fm(r.fac * r.Amin)}.` : ".");
  } else {
    u.innerHTML = `Verband met S: bij V<sub>min</sub> raakt de werklijn het evenwicht bovenaan (y<sub>a</sub>* = m·x<sub>a</sub>), dus (L/V)<sub>max</sub> = (m·x<sub>a</sub> − y<sub>b</sub>)/(x<sub>a</sub> − x<sub>b</sub>) en ` +
      `S<sub>min</sub> = (x<sub>a</sub> − x<sub>b</sub>)/(x<sub>a</sub> − y<sub>b</sub>/m)` + (r.Smin !== undefined ? ` = ${fm(r.Smin)}` : "") +
      `. Met zuiver stripgas (y<sub>b</sub> = 0) is S<sub>min</sub> gelijk aan de gestripte fractie. Daaruit: <b>S = (V/V<sub>min</sub>)·S<sub>min</sub></b>` +
      (r.Smin !== undefined && isFinite(r.fac) ? ` = ${f(r.fac, 2)} × ${fm(r.Smin)} = ${fm(r.fac * r.Smin)}.` : ".");
  }
}

// ---------------------------------------------------------------- kerncijfers en meldingen
const aNaam = (r) => ({ u: r.conc ? "X" : "x", w: r.conc ? "Y" : "y", L: r.conc ? "L′" : "L", V: r.conc ? "V′" : "V" });
function aOk(r) { return r && !r.fouten.length && r.ideaal; }
function aTekenKern(r) {
  const ok = aOk(r), ref = AREF, rok = aOk(ref), abs = AS_.proces === "abs";
  const chip = (l, fn, d, cls) => {
    const v = ok ? fn(r) : NaN, rv = rok ? fn(ref) : NaN;
    const fm = (x) => typeof x === "string" ? x : f(x, d);
    return `<div class="chip${cls ? " " + cls : ""}"><span class="l">${l}</span><span class="v">${fm(v)}</span>${AREF ? `<span class="ref">ref. ${fm(rv)}</span>` : ""}</div>`;
  };
  const n = aNaam(r);
  const N = (x) => isFinite(x) ? f(x, 2) : "∞";
  let h = `<div class="status ${ok ? "ok" : "nok"}">${ok ? "Haalbaar" : "Niet haalbaar"}</div>`;
  if (AS_.type === "platen") {
    h += chip("ideale platen", (x) => N(x.ideaal.N));
    if (r.lin) h += chip("Kremser", (x) => x.kremser !== undefined ? N(x.kremser) : "–");
    if (AS_.etaM < 1) h += chip("werkelijke platen", (x) => isFinite(x.werkelijk.N) ? String(Math.ceil(x.werkelijk.N - 1e-9)) : "∞");
  } else {
    h += chip("N<sub>Oy</sub>", (x) => x.ov ? x.ov.NOy : NaN, 2) + chip("H<sub>Oy</sub> <small>m</small>", (x) => x.HOy, 2) +
      chip("Z <small>m</small>", (x) => x.Z, 2, "warm") + chip("N<sub>Ox</sub>", (x) => x.ov ? x.ov.NOx : NaN, 2);
  }
  h += chip(`${n.L}/${n.V}`, (x) => x.s, 3) +
    chip(abs ? `L/L<sub>min</sub>` : `V/V<sub>min</sub>`, (x) => x.fac, 2);
  if (r.lin) h += chip(abs ? "A = L/(mV)" : "S = mV/L", (x) => abs ? x.A : x.Sf, 3);
  h += chip(abs ? "L <small>kmol/h</small>" : "V <small>kmol/h</small>", (x) => abs ? x.L : x.V, 1) +
    chip(abs ? "x<sub>b</sub> (uit)" : "y<sub>a</sub> (uit)", (x) => abs ? x.xb : x.ya, 5) +
    chip(abs ? "y<sub>a</sub> (uit)" : "x<sub>b</sub> (uit)", (x) => abs ? x.ya : x.xb, 5);
  $("#akern").innerHTML = h;
  zetKernHoogte();
}
function aTekenMeldingen(r) {
  const m = [];
  for (const t of r.fouten) m.push(`<div class="m-fout"><b>Niet haalbaar.</b> ${t}</div>`);
  for (const t of r.waarsch) m.push(`<div class="m-waarsch">${t}</div>`);
  for (const t of r.info) m.push(`<div class="m-info">${t}</div>`);
  $("#ameldingen").innerHTML = m.join("");
}

// ---------------------------------------------------------------- werklijn en evenwichtslijn
function aTekenMT(r) {
  const svg = $("#amt"); svg.innerHTML = "";
  const W = 640, H = 600, Mg = { l: 70, r: 16, t: 14, b: 50 };
  const abs = r.proces === "abs", pak = AS_.type === "gepakt";
  if (r.ub === undefined || r.wa === undefined) {
    txt(svg, W / 2, H / 2, "Geen diagram: de specificaties zijn niet haalbaar.", "s-lab", "middle"); $("#alegenda").innerHTML = ""; return;
  }
  const M = aModel(r.p);
  // gepakte kolom: altijd in molfracties (zoals H3); platen: x–y of X–Y
  const frac = pak || !r.conc;
  const cu = frac ? M.ux : (u) => u, cw = frac ? M.wy : (w) => w;     // naar plotcoördinaten
  const eqP = frac ? M.yeq : M.eqW;
  const opPts = (s, n = 120) => {   // werklijn in plotcoördinaten tussen top en bodem
    const pts = [];
    // absorptie: door de top (x_a, y_a); strippen: door de bodem (x_b, y_b)
    const u0 = abs ? r.ua : r.ub, w0 = abs ? r.wa : r.wb, u1 = abs ? r.ua + (r.wb - r.wa) / s : r.ua;
    for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; pts.push([cu(u), cw(w0 + s * (u - u0))]); }
    return pts;
  };
  const n = frac ? { u: "x", w: "y", L: r.conc ? "L′" : "L", V: r.conc ? "V′" : "V" } : aNaam(r);
  const pu = [cu(r.ua), cu(r.ub)], pw = [cw(r.wa), cw(r.wb)];
  let umax = Math.max(...pu), wmax = Math.max(...pw);
  if (r.pinch) { umax = Math.max(umax, Math.min(cu(r.pinch[0]), 2.5 * umax)); wmax = Math.max(wmax, Math.min(cw(r.pinch[1]), 1.6 * wmax)); }
  umax *= 1.1; wmax *= 1.1;
  if (!(umax > 0)) umax = 1; if (!(wmax > 0)) wmax = 1;
  const xl = frac ? "x  (molfractie in de vloeistof)" : "X = x/(1 − x)  (mol component per mol oplosmiddel)";
  const yl = frac ? "y  (molfractie in het gas)" : "Y = y/(1 − y)  (mol component per mol inert gas)";
  const A = assenKader(svg, W, H, Mg, [0, umax], [0, wmax], xl, yl);
  const P = (x, y) => [A.sx(x), A.sy(y)];
  const defs = el("defs", {}, svg); const cp = el("clipPath", { id: "aclip" }, defs); el("rect", { x: Mg.l, y: Mg.t, width: A.pw, height: A.ph }, cp);
  const g = el("g", { "clip-path": "url(#aclip)" }, svg);
  const ep = []; for (let i = 0; i <= 300; i++) { const x = umax * i / 300, y = eqP(x); if (isFinite(y)) ep.push(P(x, Math.min(y, wmax * 3))); }
  polyline(g, ep, "s-ev");
  const op = (u) => r.wa + r.s * (u - r.ua);
  if (!pak && AS_.etaM < 1 && !r.fouten.length) {
    const pp = []; for (let i = 0; i <= 300; i++) { const u = umax * i / 300, e = M.eqW(u); if (isFinite(e)) pp.push(P(cu(u), cw(op(u) + AS_.etaM * (e - op(u))))); }
    polyline(g, pp, "s-ps");
  }
  if (AREF && aOk(AREF) && AREF.conc === r.conc && AREF.proces === r.proces) {
    const Mr = aModel(AREF.p), cur = frac ? Mr.ux : (u) => u, cwr = frac ? Mr.wy : (w) => w, pts = [];
    for (let i = 0; i <= 120; i++) { const u = AREF.ua + (AREF.ub - AREF.ua) * i / 120; pts.push(P(cur(u), cwr(AREF.wa + AREF.s * (u - AREF.ua)))); }
    polyline(g, pts, "s-ref");
  }
  polyline(g, opPts(abs ? r.smin : r.smax).map((q) => P(q[0], q[1])), "s-wlmin");
  if (r.pinch) el("circle", { cx: A.sx(cu(r.pinch[0])), cy: A.sy(cw(r.pinch[1])), r: 6, class: "s-pinch" }, svg);
  if (r.fouten.length) { $("#alegenda").innerHTML = `<span class="l-ev">evenwichtslijn</span><span class="l-q" style="color:var(--zacht)">werklijn bij ${abs ? "L" : "V"}<sub>min</sub> (○ = pinch)</span>`; return; }
  polyline(g, opPts(r.s).map((q) => P(q[0], q[1])), "s-wl");
  if (!pak) {
    const T = AS_.etaM < 1 ? r.werkelijk : r.ideaal;
    let vorig = null;
    T.st.forEach((t, k) => {
      const laatste = k === T.st.length - 1;
      const wv = laatste ? r.wb : t.wv;
      polyline(g, [P(cu(t.uin), cw(t.w)), P(cu(t.u), cw(t.w)), P(cu(t.u), cw(wv))], "s-trap");
      const lx = A.sx(cu(t.u)) + (abs ? 4 : -4), ly = A.sy(cw(t.w)) - 5;
      if (!vorig || Math.hypot(lx - vorig[0], ly - vorig[1]) > 15) { txt(svg, lx, ly, String(t.n), "s-nr", abs ? "start" : "end"); vorig = [lx, ly]; }
    });
  } else if (r.ov) {
    const pts = r.ov.pts;
    for (let k = 1; k <= 9; k++) { const p = pts[Math.round(k * (pts.length - 1) / 10)]; polyline(g, [P(p.x, p.y), P(p.x, p.ys)], "a-dk"); }
  }
  el("circle", { cx: A.sx(pu[0]), cy: A.sy(pw[0]), r: 4.5, class: "s-punt" }, svg);
  el("circle", { cx: A.sx(pu[1]), cy: A.sy(pw[1]), r: 4.5, class: "s-punt" }, svg);
  txt(svg, A.sx(pu[0]) + 8, A.sy(pw[0]) + (abs ? 4 : -8), "top", "s-labr", "start");
  txt(svg, A.sx(pu[1]) + (abs ? -8 : 8), A.sy(pw[1]) - 8, "bodem", "s-labr", abs ? "end" : "start");
  const fu = (v) => v < 0.001 && v > 0 ? v.toExponential(2) : f(v, 4);
  const regels = [`top: (${n.u}_a; ${n.w}_a) = (${fu(pu[0])}; ${fu(pw[0])})`, `bodem: (${n.u}_b; ${n.w}_b) = (${fu(pu[1])}; ${fu(pw[1])})`];
  if (!pak) {
    regels.push(`${f(r.ideaal.N, 2)} ideale platen` + (r.kremser !== undefined ? ` (Kremser: ${f(r.kremser, 2)})` : ""));
    if (AS_.etaM < 1) regels.push(`${f(r.werkelijk.N, 2)} → ${Math.ceil(r.werkelijk.N - 1e-9)} werkelijke platen (η_M = ${f(AS_.etaM, 2)})`);
  } else if (r.ov) regels.push(`N_{Oy} = ${f(r.ov.NOy, 3)},  Z = ${f(r.Z, 2)} m`);
  regels.push(`${r.conc ? "L′/V′" : "L/V"} = ${f(r.s, 4)} = ${f(r.fac, 2)} × ${abs ? "minimum" : "maximum"}`);
  if (pak && r.conc) regels.push("werklijn gekromd in x–y (recht in X–Y)");
  regels.forEach((t, k) => txt(svg, Mg.l + 10, Mg.t + 18 + k * 16, t, "s-lab", "start"));
  $("#alegenda").innerHTML = `<span class="l-ev">evenwichtslijn</span><span class="l-wl">werklijn</span>` +
    `<span class="l-q" style="color:var(--zacht)">werklijn bij ${abs ? "L" : "V"}<sub>min</sub> (○ = pinch)</span>` +
    (!pak ? (AS_.etaM < 1 ? `<span class="l-ps" style="color:var(--blauw)">pseudo-evenwichtslijn</span>` : "") + `<span style="color:var(--tekst)">trappen (platen 1, 2, … van boven)</span>`
      : `<span style="color:var(--paars)">drijvende kracht ${abs ? "y − y*" : "y* − y"}</span>`) +
    (AREF ? `<span class="l-ref">referentie</span>` : "");
}

// ---------------------------------------------------------------- N versus L/Lmin
function aTekenFac(r) {
  const svg = $("#afac"); svg.innerHTML = "";
  const W = 640, H = 460, Mg = { l: 56, r: 16, t: 14, b: 44 };
  const abs = AS_.proces === "abs", pak = AS_.type === "gepakt";
  const facs = []; for (let i = 0; i <= 70; i++) facs.push(1.03 * Math.pow(5 / 1.03, i / 70));
  const reeks = (etaM) => facs.map((fc) => {
    const q = berekenAbs(Object.assign({}, AS_, { spec: "fac", fac: fc, etaM }));
    if (!aOk(q)) return [fc, NaN];
    return [fc, pak ? (q.ov ? q.ov.NOy : NaN) : q.ideaal.N];
  });
  const id = reeks(1), wk = !pak && AS_.etaM < 1 ? facs.map((fc) => { const q = berekenAbs(Object.assign({}, AS_, { spec: "fac", fac: fc })); return [fc, aOk(q) ? q.werkelijk.N : NaN]; }) : null;
  const alle = id.concat(wk || []).map((p) => p[1]).filter(isFinite);
  if (!alle.length) { txt(svg, W / 2, H / 2, "Geen resultaten.", "s-lab", "middle"); return; }
  const ymax = Math.min(Math.max(...alle), Math.max(4 * Math.min(...alle), 10)) * 1.08;
  const A = assenKader(svg, W, H, Mg, [1, 5], [0, ymax], abs ? "L/L_{min}" : "V/V_{min}", pak ? "N_{Oy}" : "aantal platen N");
  const pts = (s) => s.filter((p) => isFinite(p[1]) && p[1] <= ymax * 1.05).map((p) => [A.sx(p[0]), A.sy(p[1])]);
  if (wk) polyline(svg, pts(wk), "s-ps");
  polyline(svg, pts(id), "s-ev");
  if (aOk(r) && r.fac <= 5) {
    const v = pak ? (r.ov ? r.ov.NOy : NaN) : (AS_.etaM < 1 ? r.werkelijk.N : r.ideaal.N);
    if (isFinite(v) && v <= ymax) { el("circle", { cx: A.sx(r.fac), cy: A.sy(v), r: 5, class: "s-punt" }, svg); txt(svg, A.sx(r.fac) + 8, A.sy(v) - 8, `nu: ${f(v, 2)}`, "s-labr"); }
  }
  const nAS = r.lin && aOk(r) ? (abs ? `A = ${f(r.A / r.fac, 3)} × (L/L_{min})` : `S = ${f(r.Sf * r.fac, 3)} × (V/V_{min})`) : "";
  if (nAS) txt(svg, Mg.l + A.pw - 8, Mg.t + 18, nAS, "s-labz", "end");
  $("#afacUitleg").innerHTML = (pak ? "Aantal transfereenheden N<sub>Oy</sub>" : "Aantal ideale platen (blauw)" + (wk ? " en werkelijke platen (gestreept)" : "")) +
    ` bij hetzelfde rendement, als functie van ${abs ? "L/L<sub>min</sub>" : "V/V<sub>min</sub>"}. Dicht bij het minimum stijgt het aantal sterk; ver erboven wint je weinig extra en kost het meer ${abs ? "oplosmiddel" : "stripgas"}.`;
}

// ---------------------------------------------------------------- integraal N_Oy
function aTekenInt(r) {
  const svg = $("#aint"); svg.innerHTML = "";
  const W = 640, H = 460, Mg = { l: 66, r: 16, t: 14, b: 44 };
  const abs = AS_.proces === "abs";
  if (!aOk(r) || !r.ov) { txt(svg, W / 2, H / 2, "Geen integraal: de specificaties zijn niet haalbaar.", "s-lab", "middle"); $("#aintUitleg").innerHTML = ""; return; }
  const pts = r.ov.pts, g = pts.map((p) => 1 / p.dy), ys = pts.map((p) => p.y);
  const y0 = Math.min(...ys), y1 = Math.max(...ys), gmax = Math.max(...g) * 1.15;
  const A = assenKader(svg, W, H, Mg, [y0 - 0.02 * (y1 - y0), y1 + 0.02 * (y1 - y0)], [0, gmax], "y  (molfractie in het gas)", abs ? "1/(y − y*)" : "1/(y* − y)");
  const vlak = pts.map((p, i) => [A.sx(p.y), A.sy(g[i])]);
  el("path", { d: `M ${A.sx(pts[0].y)} ${A.sy(0)} L ` + vlak.map((q) => q.join(" ")).join(" L ") + ` L ${A.sx(pts[pts.length - 1].y)} ${A.sy(0)} Z`, class: "a-vlak" }, svg);
  polyline(svg, vlak, "a-dk2");
  txt(svg, A.sx((y0 + y1) / 2), A.sy(gmax * 0.45), `oppervlakte = N_{Oy} = ${f(r.ov.NOy, 3)}`, "s-lab", "middle");
  txt(svg, A.sx(r.ya), A.sy(0) - 6, "y_a (top)", "s-labz", abs ? "start" : "end");
  txt(svg, A.sx(r.yb), A.sy(0) - 6, "y_b (bodem)", "s-labz", abs ? "end" : "start");
  $("#aintUitleg").innerHTML = `N<sub>Oy</sub> = ∫ dy/(${abs ? "y − y*" : "y* − y"}) van y<sub>a</sub> tot y<sub>b</sub> (numeriek, Simpson)` +
    (r.ov.NOyLM !== null ? `; met rechte lijnen ook N<sub>Oy</sub> = (y<sub>b</sub> − y<sub>a</sub>)/Δy<sub>LM</sub> = ${f(Math.abs(r.yb - r.ya), 5)}/${f(r.ov.dyLM, 6)} = ${f(r.ov.NOyLM, 3)}.` : ". Geconcentreerd: de werklijn is gekromd in x–y, dus geen logaritmisch gemiddelde.");
}

// ---------------------------------------------------------------- kolomschema
function aTekenKolom(r) {
  const svg = $("#akolom"); svg.innerHTML = "";
  const ok = aOk(r), abs = AS_.proces === "abs", pak = AS_.type === "gepakt";
  const cx = 175, w = 80, x0 = cx - w / 2, x1 = cx + w / 2, top = 110, bot = 470;
  el("rect", { x: x0, y: top, width: w, height: bot - top, rx: 14, class: "s-kolom" }, svg);
  if (pak) {
    for (let y = top + 30; y < bot - 30; y += 14) for (let x = x0 + 8; x < x1 - 8; x += 14)
      el("circle", { cx: x + ((y / 14) % 2 ? 7 : 0), cy: y, r: 3.2, class: "s-plaat", fill: "none" }, svg);
    el("line", { x1: x0, x2: x1, y1: top + 22, y2: top + 22, class: "s-plaat" }, svg);
    el("line", { x1: x0, x2: x1, y1: bot - 22, y2: bot - 22, class: "s-plaat" }, svg);
  } else {
    const N = ok && isFinite(r.werkelijk.N) ? Math.ceil(r.werkelijk.N - 1e-9) : 6, np = Math.min(N, 16);
    for (let i = 1; i <= np; i++) {
      const y = top + 24 + (bot - top - 48) * (np === 1 ? 0.5 : (i - 1) / (np - 1));
      el("line", { x1: x0 + (i % 2 ? 0 : 14), x2: x1 - (i % 2 ? 14 : 0), y1: y, y2: y, class: "s-plaat" }, svg);
    }
    txt(svg, x0 - 6, top + 28, "1", "t-zacht", "end");
    if (ok && isFinite(r.werkelijk.N)) txt(svg, x0 - 6, bot - 20, String(N), "t-zacht", "end");
  }
  const fu = (v) => !isFinite(v) ? "?" : v < 0.001 && v > 0 ? v.toExponential(2) : f(v, 4);
  // vloeistof in (links boven) en uit (links onder)
  pijl(svg, 10, top + 30, x0 - 2, top + 30, "s-vl", "m-blauw");
  txt(svg, 10, top + 18, `L = ${f(r.L, 1)}`, "t-vl"); txt(svg, 10, top + 50, `x_a = ${fu(r.xa)}`, "t-vl");
  pijl(svg, x0, bot - 30, 10, bot - 30, "s-vl", "m-blauw");
  txt(svg, 10, bot - 42, `x_b = ${fu(r.xb)}`, "t-vl");
  // gas in (rechts onder) en uit (rechts boven)
  pijl(svg, 340, bot - 30, x1 + 2, bot - 30, "s-damp", "m-rood");
  txt(svg, 340, bot - 42, `V = ${f(r.V, 1)}`, "t-damp", "end"); txt(svg, 340, bot - 10, `y_b = ${fu(r.yb)}`, "t-damp", "end");
  pijl(svg, x1, top + 30, 340, top + 30, "s-damp", "m-rood");
  txt(svg, 340, top + 18, `y_a = ${fu(r.ya)}`, "t-damp", "end");
  txt(svg, cx, top - 12, "top (a)", "t-zacht", "middle"); txt(svg, cx, bot + 22, "bodem (b)", "t-zacht", "middle");
  txt(svg, 6, 14, (abs ? "absorptie" : "strippen") + " · " + (pak ? "gepakte kolom" : "evenwichtsplaten") + " · debieten in kmol/h", "t-zacht");
  if (ok) {
    const regel = pak ? (r.Z !== undefined ? `Z = ${f(r.Z, 2)} m  (N_{Oy} = ${f(r.ov.NOy, 2)}, H_{Oy} = ${f(r.HOy, 2)} m)` : "")
      : `${f(r.ideaal.N, 2)} ideale platen` + (AS_.etaM < 1 ? `, ${Math.ceil(r.werkelijk.N - 1e-9)} werkelijke` : "");
    txt(svg, cx, bot + 50, regel, "t-gew", "middle");
    if (r.lin) txt(svg, cx, bot + 72, abs ? `A = L/(mV) = ${f(r.A, 3)}` : `S = mV/L = ${f(r.Sf, 3)}`, "t-gew", "middle");
  }
}

// ---------------------------------------------------------------- tabel
function aTekenTabel(r) {
  const ref = AREF;
  const kol = (lab, fn, d, eenh) => {
    const fm = (x) => typeof x === "string" ? x : (x !== 0 && Math.abs(x) < 0.001 && isFinite(x) ? x.toExponential(3) : f(x, d));
    const v = aOk(r) ? fn(r) : NaN, rv = aOk(ref) ? fn(ref) : undefined;
    return `<tr><td>${lab}</td><td class="w">${fm(v)}${eenh ? " " + eenh : ""}</td>${AREF ? `<td class="r">${rv === undefined ? "–" : fm(rv)}</td>` : ""}</tr>`;
  };
  const kop = (t) => `<table><thead><tr><th>${t}</th><th style="text-align:right">nu</th>${AREF ? '<th style="text-align:right">ref.</th>' : ""}</tr></thead><tbody>`;
  const abs = AS_.proces === "abs";
  const t1 = kop("Stromen (kmol/h)") + kol("V (gas in)", (x) => x.V, 2) + kol("L (vloeistof in)", (x) => x.L, 2) +
    (r.conc ? kol("V′ (inert gas)", (x) => x.Vi, 2) + kol("L′ (oplosmiddel)", (x) => x.Li, 2) : "") +
    kol(abs ? "L<sub>min</sub>" : "V<sub>min</sub>", (x) => abs ? x.Lmin : x.Vmin, 2) + kol(abs ? "L/L<sub>min</sub>" : "V/V<sub>min</sub>", (x) => x.fac, 3) + "</tbody></table>";
  const t2 = kop("Samenstellingen") + kol("y<sub>b</sub> (gas in)", (x) => x.yb, 5) + kol("y<sub>a</sub> (gas uit)", (x) => x.ya, 5) +
    kol("x<sub>a</sub> (vloeistof in)", (x) => x.xa, 5) + kol("x<sub>b</sub> (vloeistof uit)", (x) => x.xb, 5) +
    kol(abs ? "geabsorbeerd" : "gestript", (x) => 100 * x.p.eta, 2, "%") + "</tbody></table>";
  let t3 = kop("Verhoudingen") + kol(r.conc ? "L′/V′" : "L/V", (x) => x.s, 4) + kol((r.conc ? "(L′/V′)" : "(L/V)") + (abs ? "<sub>min</sub>" : "<sub>max</sub> (bij V<sub>min</sub>)"), (x) => abs ? x.smin : x.smax, 4);
  if (r.lin && abs) t3 += kol("absorptiefactor A = L/(mV)", (x) => x.A, 4) + kol("A<sub>min</sub> = (L/V)<sub>min</sub>/m", (x) => x.Amin, 4) + kol("A/A<sub>min</sub> = L/L<sub>min</sub>", (x) => x.A / x.Amin, 3);
  if (r.lin && !abs) t3 += kol("stripfactor S = mV/L", (x) => x.Sf, 4) + kol("S<sub>min</sub> = m·(V/L)<sub>min</sub>", (x) => x.Smin, 4) + kol("S/S<sub>min</sub> = V/V<sub>min</sub>", (x) => x.Sf / x.Smin, 3);
  t3 += "</tbody></table>";
  let t4;
  if (AS_.type === "platen") {
    t4 = kop("Platen") + kol("ideaal (grafisch)", (x) => x.ideaal.N, 2) + (!r.lin ? "" : kol("ideaal (Kremser)", (x) => x.kremser, 2)) +
      (AS_.etaM < 1 ? kol("werkelijk (grafisch)", (x) => x.werkelijk.N, 2) + kol("werkelijke platen", (x) => isFinite(x.werkelijk.N) ? String(Math.ceil(x.werkelijk.N - 1e-9)) : "∞", 0) : "") + "</tbody></table>";
  } else {
    t4 = kop("Gepakte kolom") + kol("N<sub>Oy</sub> (integraal)", (x) => x.ov ? x.ov.NOy : NaN, 3) +
      (!r.lin ? "" : kol("N<sub>Oy</sub> = Δy/Δy<sub>LM</sub>", (x) => x.ov ? x.ov.NOyLM : NaN, 3)) +
      kol("H<sub>Oy</sub> (m)", (x) => x.HOy, 3) + kol("Z = H<sub>Oy</sub>·N<sub>Oy</sub> (m)", (x) => x.Z, 3) +
      kol("N<sub>Ox</sub> (integraal)", (x) => x.ov ? x.ov.NOx : NaN, 3) +
      kol(!r.lin ? "H<sub>Ox</sub> = Z/N<sub>Ox</sub> (m)" : "H<sub>Ox</sub> = A·H<sub>Oy</sub> (m)", (x) => x.HOx, 3) +
      kol("controle H<sub>Ox</sub>·N<sub>Ox</sub> (m)", (x) => x.ov ? x.HOx * x.ov.NOx : NaN, 3) + "</tbody></table>";
  }
  $("#atabellen").innerHTML = t1 + t2 + t3 + t4;
  $("#atabellen").classList.toggle("metref", !!AREF);
  // detailtabel
  const n = aNaam(r);
  if (!aOk(r)) { $("#adetail").innerHTML = '<p class="klein">Geen resultaten (niet haalbaar).</p>'; $("#adetailSum").textContent = "Detail"; return; }
  if (AS_.type === "platen") {
    $("#adetailSum").textContent = "Plaat per plaat (samenstellingen)";
    const T = AS_.etaM < 1 ? r.werkelijk : r.ideaal, M = aModel(r.p);
    let h = `<table><thead><tr><th>plaat</th><th>${n.u}<sub>n</sub> (vloeistof uit)</th><th>${n.w}<sub>n</sub> (gas uit)</th><th>${n.w}<sub>n+1</sub> (gas in)</th>${r.conc ? "<th>x<sub>n</sub></th><th>y<sub>n</sub></th>" : ""}</tr></thead><tbody>`;
    const fm = (v) => v !== 0 && Math.abs(v) < 0.001 ? v.toExponential(3) : f(v, 5);
    for (const t of T.st) h += `<tr><td>${t.n}${t.n === T.nHeel && T.fr < 0.999 ? ` (fractie ${f(T.fr, 2)})` : ""}</td><td>${fm(t.u)}</td><td>${fm(t.w)}</td><td>${fm(t.wv)}</td>${r.conc ? `<td>${fm(M.ux(t.u))}</td><td>${fm(M.wy(t.w))}</td>` : ""}</tr>`;
    $("#adetail").innerHTML = h + "</tbody></table>";
  } else {
    $("#adetailSum").textContent = "Verloop in de kolom (drijvende kracht)";
    const fm = (v) => v !== 0 && Math.abs(v) < 0.001 ? v.toExponential(3) : f(v, 5);
    let h = `<table><thead><tr><th>positie</th><th>x</th><th>y</th><th>y*</th><th>${abs ? "y − y*" : "y* − y"}</th><th>1/(${abs ? "y − y*" : "y* − y"})</th></tr></thead><tbody>`;
    r.ov.pts.forEach((p, i) => { if (i % 50 === 0) h += `<tr><td>${i === 0 ? "top" : i === 400 ? "bodem" : f(i / 400, 2)}</td><td>${fm(p.x)}</td><td>${fm(p.y)}</td><td>${fm(p.ys)}</td><td>${fm(p.dy)}</td><td>${f(1 / p.dy, 2)}</td></tr>`; });
    $("#adetail").innerHTML = h + "</tbody></table>";
  }
}

// ---------------------------------------------------------------- tabbladen, referentie
function aKiesTab(t) {
  aTab = t;
  document.querySelectorAll("#atabs [data-atab]").forEach((x) => { x.classList.toggle("aan", x.dataset.atab === t); x.setAttribute("aria-selected", x.dataset.atab === t); });
  for (const k of ["mt", "fac", "int"]) $("#atab-" + k).hidden = k !== t;
}
function koppelAbs() {
  document.querySelectorAll("#atabs [data-atab]").forEach((b) => b.addEventListener("click", () => { aKiesTab(b.dataset.atab); aUpdate(true); }));
}
function aZetReferentie() {
  AREF = AREF ? null : aLaatste;
  zetRefKnop(!!AREF);
  aUpdate();
}
