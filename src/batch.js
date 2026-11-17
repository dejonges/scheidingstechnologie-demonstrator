"use strict";
// =====================================================================
// Tabblad batchdestillatie: eenvoudig (Rayleigh), constante reflux, constante topsamenstelling
// Ketel = ideale trap; N = aantal theoretische trappen inclusief de ketel; totale condensor;
// verwaarloosde hold-up in kolom en condensor. Notatie cursus: ketelsamenstelling x_B, lading W.
// =====================================================================
const BSTD = {
  sys: "ideaal", alpha: 2.5, A12: 1.0, A21: 1.0, P: 101.325, lamA: 30, lamB: 30,
  W0: 100, x0: 0.5, xBe: 0.1, bmode: "R", N: 5, R: 3, xDdoel: 0.95, Vdeb: 20, moment: 0,
};
const BPRESETS = [
  { naam: "Eenvoudige batchdestillatie (Rayleigh, 1 trap)", s: { bmode: "eenvoudig", N: 1, xBe: 0.2 } },
  { naam: "Constante reflux: 5 trappen, R_D = 3", s: { bmode: "R", N: 5, R: 3, xBe: 0.1 } },
  { naam: "Constante topsamenstelling: x_D = 0.95, 5 trappen (Fig. batch)", s: { bmode: "xD", N: 5, xDdoel: 0.95, xBe: 0.2 } },
  { naam: "Benzeen – tolueen, constante reflux", s: { sys: "bt", bmode: "R", N: 6, R: 4, x0: 0.4, xBe: 0.05 } },
  { naam: "Ethanol – water (Perry): azeotroop begrenst x_D", s: { sys: "ewdata", bmode: "R", N: 8, R: 5, x0: 0.3, xBe: 0.02 } },
];
let BS = Object.assign({}, BSTD), BREF = null, bLaatste = null, bev = null, bevKey = "", bTab = "mt";
const BVELDEN = {};

// ---------------------------------------------------------------- rekenkern batch
function bStap(ev, xD, R, N) {
  const lv = R / (R + 1), pts = [];
  let y = xD, x = xD;
  for (let n = 1; n <= N; n++) {
    x = ev.xVan(y);
    const yv = n < N ? lv * x + (1 - lv) * xD : null;
    pts.push({ n, x, y, yv });
    if (n < N) y = yv;
  }
  return { xN: x, pts };
}
function bXDvan(ev, xB, R, N) {
  let hi = 1 - 1e-12;
  if (ev.xaz !== null && ev.xaz > xB) hi = ev.xaz - 1e-9;
  if (bStap(ev, hi, R, N).xN < xB) return null;
  return bisect((xD) => bStap(ev, xD, R, N).xN - xB, xB, hi, 60);
}
function bRvan(ev, xB, xD, N) {
  if (bStap(ev, xD, 1e4, N).xN > xB) return null;              // zelfs bij (bijna) totale reflux niet haalbaar
  if (bStap(ev, xD, 0, N).xN <= xB) return 0;
  // in log(R) bisecteren
  const g = (lr) => bStap(ev, xD, Math.exp(lr), N).xN - xB;
  return Math.exp(bisect(g, Math.log(1e-4), Math.log(1e4), 60));
}

function berekenBatch(ev, p) {
  const out = { fouten: [], waarsch: [], info: [], p };
  const N = p.bmode === "eenvoudig" ? 1 : Math.max(1, Math.round(p.N));
  out.N = N;
  if (!(p.xBe > 0 && p.xBe < p.x0 && p.x0 < 1)) { out.fouten.push("Kies 0 &lt; x<sub>B,eind</sub> &lt; x<sub>B,0</sub> &lt; 1."); return out; }
  if (ev.xaz !== null) {
    out.info.push(`Azeotroop bij x = ${ev.xaz.toFixed(3)}: het topproduct kan die samenstelling niet overschrijden.`);
    if (p.x0 > ev.xaz) { out.fouten.push("De lading ligt boven de azeotrope samenstelling; dit tabblad veronderstelt een lading onder het azeotroop."); return out; }
  }
  if (p.bmode === "xD" && ev.xaz !== null && p.xDdoel >= ev.xaz) { out.fouten.push(`x<sub>D</sub> moet onder de azeotrope samenstelling (${ev.xaz.toFixed(3)}) liggen.`); return out; }
  if (p.bmode === "xD" && p.xDdoel <= p.x0) { out.fouten.push("Kies x<sub>D</sub> groter dan de beginsamenstelling x<sub>B,0</sub>."); return out; }

  const n = 160, prof = [];
  for (let i = 0; i <= n; i++) {
    const xB = p.x0 - (p.x0 - p.xBe) * i / n;
    let xD, R;
    if (p.bmode === "xD") {
      R = bRvan(ev, xB, p.xDdoel, N); xD = p.xDdoel;
      if (R === null) {
        if (i === 0) { out.fouten.push(`Met ${N} trappen is x<sub>D</sub> = ${p.xDdoel} zelfs bij totale reflux niet haalbaar vanuit x<sub>B,0</sub> = ${p.x0}. Verhoog N of verlaag x<sub>D</sub>.`); return out; }
        out.waarsch.push(`Vanaf x<sub>B</sub> ≈ ${prof[prof.length - 1].xB.toFixed(3)} kan x<sub>D</sub> = ${p.xDdoel} met ${N} trappen niet meer behouden worden (R<sub>D</sub> → ∞). De destillatie stopt daar in plaats van bij x<sub>B,eind</sub> = ${p.xBe}.`);
        out.afgebroken = true; break;
      }
    } else {
      R = p.bmode === "eenvoudig" ? 0 : p.R;
      xD = bXDvan(ev, xB, R, N);
      if (xD === null) { out.fouten.push("Geen oplossing voor x<sub>D</sub> gevonden."); return out; }
    }
    prof.push({ xB, xD, R });
  }
  // Rayleigh: ln(W0/W) = ∫ dx_B/(x_D − x_B), en energie
  let lnW = 0, Vtot = 0, Qk = 0, Qc = 0;
  const lam = (z) => z * p.lamA + (1 - z) * p.lamB;
  prof[0].W = p.W0; prof[0].D = 0; prof[0].V = 0; prof[0].Q = 0; prof[0].xDgem = prof[0].xD;
  for (let i = 1; i < prof.length; i++) {
    const a = prof[i - 1], b = prof[i];
    lnW += 0.5 * (1 / (a.xD - a.xB) + 1 / (b.xD - b.xB)) * (a.xB - b.xB);
    b.W = p.W0 * Math.exp(-lnW);
    if (p.bmode === "xD") b.W = p.W0 * (p.xDdoel - p.x0) / (p.xDdoel - b.xB);   // exacte massabalans
    b.D = p.W0 - b.W;
    b.xDgem = (p.W0 * p.x0 - b.W * b.xB) / b.D;
    const dD = b.D - a.D, dV = 0.5 * ((a.R + 1) + (b.R + 1)) * dD;
    Vtot += dV;
    Qk += dV * 0.5 * (lam(ev.y(a.xB)) + lam(ev.y(b.xB))) * 1000;    // kJ
    Qc += dV * 0.5 * (lam(a.xD) + lam(b.xD)) * 1000;
    b.V = Vtot; b.Q = Qk;
  }
  out.prof = prof;
  const e = prof[prof.length - 1];
  Object.assign(out, {
    W: e.W, D: e.D, xDgem: e.xDgem, xBeind: e.xB, Vtot, Qketel: Qk / 3600, Qcond: Qc / 3600,   // kWh
    tijd: Vtot / p.Vdeb, rendA: e.D * e.xDgem / (p.W0 * p.x0),
    xD0: prof[0].xD, xD1: e.xD, R0: prof[0].R, R1: e.R,
  });
  if (p.bmode === "R" && N > 1) {
    // minimale reflux bij de start (pinch), ter informatie
    out.info.push(`Bij constante reflux daalt x<sub>D</sub> van ${out.xD0.toFixed(3)} naar ${out.xD1.toFixed(3)}; gemiddeld ${out.xDgem.toFixed(3)} in het destillaat.`);
  }
  if (p.bmode === "xD") out.info.push(`Bij constante topsamenstelling stijgt R<sub>D</sub> van ${out.R0.toFixed(2)} naar ${out.R1.toFixed(2)}: het energieverbruik per kmol destillaat neemt sterk toe naar het einde.`);
  return out;
}

// ---------------------------------------------------------------- invoerpaneel batch
function bouwBatchInvoer() {
  const p = $("#binvoer"); p.innerHTML = "<h2>Invoer batch</h2>";
  const opt = { st: () => BS, upd: (snel) => bUpdate(snel), reg: BVELDEN, pref: "b" };
  const veld = (fs, id, lab, def) => maakVeld(fs, id, lab, Object.assign({}, opt, def));
  let fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Systeem en evenwicht</legend>";
  const sel = document.createElement("select"); sel.id = "bsys"; sel.style.width = "100%";
  for (const [k, s] of Object.entries(SYSTEMEN)) { const o = document.createElement("option"); o.value = k; o.textContent = s.naam; sel.appendChild(o); }
  sel.addEventListener("change", () => { BS.sys = sel.value; const l = SYSTEMEN[BS.sys].lambda; BS.lamA = l[0]; BS.lamB = l[1]; bSync(); bUpdate(); });
  fs.appendChild(sel);
  const ul = document.createElement("div"); ul.className = "uitleg"; ul.id = "bsysUitleg"; fs.appendChild(ul);
  veld(fs, "alpha", "α (rel. vluchtigh.)", { dstep: 0.1, min: 1.05, max: 10, log: true, rond: (v) => +v.toFixed(2) });
  veld(fs, "A12", "A<sub>12</sub> (Van Laar)", { dstep: 0.05, min: -1.5, max: 3, rond: (v) => +v.toFixed(2) });
  veld(fs, "A21", "A<sub>21</sub> (Van Laar)", { dstep: 0.05, min: -1.5, max: 3, rond: (v) => +v.toFixed(2) });
  veld(fs, "P", "druk P (kPa)", { min: 20, max: 500, log: true, rond: (v) => +v.toFixed(1) });
  veld(fs, "lamA", "λ<sub>A</sub> (kJ/mol)", { dstep: 0.5, min: 10, max: 60, rond: (v) => +v.toFixed(1) });
  veld(fs, "lamB", "λ<sub>B</sub> (kJ/mol)", { dstep: 0.5, min: 10, max: 60, rond: (v) => +v.toFixed(1) });
  p.appendChild(fs);

  fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Lading</legend>";
  veld(fs, "W0", "W<sub>0</sub> (kmol)", { min: 1, max: 1000, log: true, rond: (v) => +v.toPrecision(3) });
  veld(fs, "x0", "x<sub>B,0</sub> (begin)", { dstep: 0.01, min: 0.02, max: 0.98, rond: (v) => +v.toFixed(3) });
  veld(fs, "xBe", "x<sub>B,eind</sub> (ketel)", { min: 0.001, max: 0.9, log: true, rond: (v) => +v.toPrecision(3) });
  p.appendChild(fs);

  fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Werkwijze</legend>";
  const k = document.createElement("div"); k.className = "keuze";
  k.innerHTML = '<label><input type="radio" name="bm" value="eenvoudig"> eenvoudig (1 trap)</label>' +
    '<label><input type="radio" name="bm" value="R"> constante reflux</label>' +
    '<label><input type="radio" name="bm" value="xD"> <span>constante x<sub>D</sub></span></label>';
  k.querySelectorAll("input").forEach((r) => r.addEventListener("change", () => { BS.bmode = r.value; bUpdate(); }));
  fs.appendChild(k);
  veld(fs, "N", "N (trappen)", { dstep: 1, min: 1, max: 40, rond: (v) => Math.round(v), dec: 0 });
  veld(fs, "R", "R<sub>D</sub> = L/D", { min: 0.1, max: 50, log: true, rond: (v) => +v.toPrecision(3) });
  veld(fs, "xDdoel", "x<sub>D</sub> (constant)", { dstep: 0.005, min: 0.5, max: 0.9999, rond: (v) => +v.toFixed(4) });
  const wu = document.createElement("div"); wu.className = "uitleg"; wu.id = "bmodeUitleg"; fs.appendChild(wu);
  p.appendChild(fs);

  fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Ketel</legend>";
  veld(fs, "Vdeb", "V (kmol/h)", { min: 1, max: 500, log: true, rond: (v) => +v.toPrecision(3) });
  const ku = document.createElement("div"); ku.className = "uitleg"; ku.textContent = "Constant verdampingsdebiet uit de ketel; bepaalt de duur van de destillatie."; fs.appendChild(ku);
  p.appendChild(fs);
  bSync();
}
function bSync() {
  $("#bsys").value = BS.sys;
  for (const [id, v] of Object.entries(BVELDEN)) v.set(BS[id]);
  document.querySelectorAll('input[name=bm]').forEach((r) => { r.checked = r.value === BS.bmode; });
}

// ---------------------------------------------------------------- update
function bUpdate(snel) {
  const s = SYSTEMEN[BS.sys];
  const key = BS.sys + "|" + BS.alpha + "|" + BS.A12 + "|" + BS.A21 + "|" + (s.soort === "model" ? BS.P : "");
  if (key !== bevKey) { bev = maakEvenwicht(BS.sys, { alpha: BS.alpha, A12: BS.A12, A21: BS.A21, P: BS.P }); bevKey = key; }
  const zb = (id, aan) => { BVELDEN[id].rij.style.display = aan ? "" : "none"; };
  zb("alpha", s.soort === "alpha" || s.soort === "vanlaar"); zb("A12", s.soort === "vanlaar"); zb("A21", s.soort === "vanlaar");
  zb("P", s.soort === "model");
  zb("N", BS.bmode !== "eenvoudig"); zb("R", BS.bmode === "R"); zb("xDdoel", BS.bmode === "xD");
  $("#bsysUitleg").innerHTML = `x: molfractie <b>${s.c1}</b> (lichtste component).` + (s.soort === "alpha" || s.soort === "vanlaar" ? "" : ` A = ${s.c1}, B = ${s.c2}.`);
  $("#bmodeUitleg").innerHTML = BS.bmode === "eenvoudig" ? "Damp uit de ketel wordt meteen gecondenseerd (één evenwichtstrap, geen reflux): vergelijking van Rayleigh." :
    BS.bmode === "R" ? "N telt de ketel mee als trap. Vaste refluxverhouding: de topsamenstelling x<sub>D</sub> daalt naarmate de ketel armer wordt." :
      "N telt de ketel mee als trap. De reflux wordt continu verhoogd zodat x<sub>D</sub> constant blijft.";
  const r = berekenBatch(bev, Object.assign({}, BS));
  bLaatste = r;
  bTekenKern(r); bTekenMeldingen(r); bTekenKolom(r);
  if (bTab === "mt") bTekenMT(r);
  if (bTab === "verloop") bTekenVerloop(r);
  if (bTab === "ray") bTekenRayleigh(r);
  bTekenTabel(r);
  if (!snel) schrijfHash();
}

// ---------------------------------------------------------------- kerncijfers en meldingen
function bTekenKern(r) {
  const ok = !r.fouten.length && r.prof;
  const ref = BREF, rok = ref && !ref.fouten.length && ref.prof;
  const chip = (l, v, rv, cls) => `<div class="chip${cls ? " " + cls : ""}"><span class="l">${l}</span><span class="v">${v}</span>${BREF ? `<span class="ref">ref. ${rv}</span>` : ""}</div>`;
  const g = (x, k, d) => x && x.prof ? f(x[k], d) : "–";
  const pijl = (x, a, b, d) => x && x.prof ? `${f(x[a], d)} <small>→</small> ${f(x[b], d)}` : "–";
  $("#bkern").innerHTML = `<div class="status ${ok ? "ok" : "nok"}">${ok ? (r.afgebroken ? "Gedeeltelijk" : "Haalbaar") : "Niet haalbaar"}</div>` +
    chip("D <small>kmol</small>", g(r, "D", 1), rok ? g(ref, "D", 1) : "–") +
    chip("x<sub>D,gem</sub>", g(r, "xDgem", 3), rok ? g(ref, "xDgem", 3) : "–") +
    chip("x<sub>D</sub> begin → eind", pijl(r, "xD0", "xD1", 3), rok ? pijl(ref, "xD0", "xD1", 3) : "–") +
    chip("R<sub>D</sub> begin → eind", r.p.bmode === "eenvoudig" ? "–" : pijl(r, "R0", "R1", 2), rok && ref.p.bmode !== "eenvoudig" ? pijl(ref, "R0", "R1", 2) : "–") +
    chip("W eind <small>kmol</small>", g(r, "W", 1), rok ? g(ref, "W", 1) : "–") +
    chip("rendement A", ok ? f(100 * r.rendA, 1) + " %" : "–", rok ? f(100 * ref.rendA, 1) + " %" : "–") +
    chip("V totaal <small>kmol</small>", g(r, "Vtot", 0), rok ? g(ref, "Vtot", 0) : "–") +
    chip("Q ketel <small>kWh</small>", g(r, "Qketel", 0), rok ? g(ref, "Qketel", 0) : "–", "warm") +
    chip("duur <small>h</small>", g(r, "tijd", 1), rok ? g(ref, "tijd", 1) : "–");
  zetKernHoogte();
}
function bTekenMeldingen(r) {
  const m = [];
  for (const t of r.fouten) m.push(`<div class="m-fout"><b>Niet haalbaar.</b> ${t}</div>`);
  for (const t of r.waarsch) m.push(`<div class="m-waarsch">${t}</div>`);
  for (const t of r.info) m.push(`<div class="m-info">${t}</div>`);
  $("#bmeldingen").innerHTML = m.join("");
}

// ---------------------------------------------------------------- McCabe-Thiele op een ogenblik
function bMomentIndex(r) {
  if (!r.prof) return 0;
  const doel = BS.moment * r.D;
  let i = 0; while (i < r.prof.length - 1 && r.prof[i].D < doel) i++;
  return i;
}
function bTekenMT(r) {
  const svg = $("#bmt"); svg.innerHTML = "";
  const W = 640, H = 600, Mg = { l: 62, r: 16, t: 14, b: 50 };
  const s = SYSTEMEN[BS.sys];
  const A = assenKader(svg, W, H, Mg, [0, 1], [0, 1], `x  (molfractie ${s.c1} in vloeistof)`, `y  (molfractie ${s.c1} in damp)`, { gx: 0.1, gy: 0.1 });
  const P = (x, y) => [A.sx(x), A.sy(y)];
  polyline(svg, [P(0, 0), P(1, 1)], "s-diag");
  const ev = bev, ep = [];
  for (let i = 0; i <= 400; i++) { const x = i / 400; ep.push(P(x, ev.y(x))); }
  polyline(svg, ep, "s-ev");
  $("#bmomentWaarde").textContent = "";
  if (!r.prof) return;
  const N = r.N;
  // begin- en eindtoestand licht
  for (const k of [0, r.prof.length - 1]) {
    const pr = r.prof[k], lv = pr.R / (pr.R + 1);
    if (N > 1) polyline(svg, [P(pr.xB, lv * pr.xB + (1 - lv) * pr.xD), P(pr.xD, pr.xD)], "s-wlmin");
  }
  const i = bMomentIndex(r), pr = r.prof[i], lv = pr.R / (pr.R + 1);
  if (N > 1) polyline(svg, [P(Math.max(0, pr.xB - 0.05), lv * Math.max(0, pr.xB - 0.05) + (1 - lv) * pr.xD), P(pr.xD, pr.xD)], "s-wl");
  const st = bStap(ev, pr.xD, pr.R, N).pts;
  let xp = pr.xD; let vorig = null;
  for (const t of st) {
    const eind = t.yv !== null ? t.yv : t.x;   // laatste trap (ketel): naar de diagonaal
    polyline(svg, [P(xp, t.y), P(t.x, t.y), P(t.x, eind)], "s-trap");
    const lab = t.n === N ? "K" : String(t.n), lx = A.sx(t.x) - 3, ly = A.sy(t.y) - 4;
    if (!vorig || Math.hypot(lx - vorig[0], ly - vorig[1]) > 15 || t.n === N) { txt(svg, lx, ly, lab, "s-nr", "end"); vorig = [lx, ly]; }
    xp = t.x;
  }
  for (const [x, lab] of [[pr.xD, "x_D"], [pr.xB, "x_B"], [r.p.x0, "x_{B,0}"]]) {
    el("circle", { cx: A.sx(x), cy: A.sy(x), r: 4, class: lab === "x_{B,0}" ? "s-pinch" : "s-punt" }, svg);
    const links = lab === "x_D";
    txt(svg, A.sx(x) + (links ? -8 : 6), A.sy(x) + (links ? -10 : 16), `${lab} = ${f(x, 3)}`, "s-labr", links ? "end" : "start");
  }
  const regels = [`ogenblik: ${f(100 * BS.moment, 0)}% van het destillaat opgevangen`, `x_B = ${f(pr.xB, 3)},  x_D = ${f(pr.xD, 3)}`];
  if (N > 1) regels.push(`R_D = ${f(pr.R, 2)},  ${N - 1} platen + ketel`);
  regels.forEach((t, k) => txt(svg, Mg.l + 10, Mg.t + 18 + k * 16, t, "s-lab"));
  $("#bmomentWaarde").innerHTML = `D = ${f(pr.D, 1)} kmol, W = ${f(pr.W, 1)} kmol`;
  $("#blegenda").innerHTML = `<span class="l-ev">evenwichtslijn</span>` + (N > 1 ? `<span class="l-wl">werklijn op dit ogenblik</span><span class="l-q" style="color:var(--zacht)">werklijn begin en einde</span>` : "") +
    `<span style="color:var(--tekst)">trappen (K = ketel)</span>`;
}

// ---------------------------------------------------------------- verloop
function bTekenVerloop(r) {
  const svg = $("#bverloop"); svg.innerHTML = "";
  const W = 640, H = 460, Mg = { l: 56, r: 60, t: 14, b: 44 };
  if (!r.prof) { txt(svg, W / 2, H / 2, "Geen verloop: de specificaties zijn niet haalbaar.", "s-lab", "middle"); return; }
  const Dmax = Math.max(r.D, BREF && BREF.prof ? BREF.D : 0) || 1;
  const xr = [0, Dmax / BS.W0];
  const A = assenKader(svg, W, H, Mg, xr, [0, 1], "gedestilleerde fractie D/W₀", "molfractie", { gy: 0.1 });
  const Rs = r.prof.map((p) => p.R).concat(BREF && BREF.prof ? BREF.prof.map((p) => p.R) : []);
  const Rmax = Math.max(1, ...Rs.filter(isFinite)) * 1.1;
  const sr = (R) => Mg.t + A.ph - R / Rmax * A.ph;
  if (BS.bmode !== "eenvoudig" || (BREF && BREF.p.bmode !== "eenvoudig")) {
    el("line", { x1: Mg.l + A.pw, x2: Mg.l + A.pw, y1: Mg.t, y2: Mg.t + A.ph, class: "s-as" }, svg);
    const g = asStap(Rmax, 6);
    for (let t = 0; t <= Rmax + 1e-9; t += g) el("text", { x: Mg.l + A.pw + 6, y: sr(t) + 4, class: "s-tick" }, svg, t.toFixed(decVan(g)));
    const gr = el("g", { transform: `translate(${W - 10} ${Mg.t + A.ph / 2}) rotate(90)` }, svg);
    txt(gr, 0, 0, "refluxverhouding R_D", "s-astitel", "middle");
  }
  const lijnen = (res, ref) => {
    const X = (p) => A.sx(p.D / BS.W0);
    polyline(svg, res.prof.map((p) => [X(p), A.sy(p.xD)]), ref ? "s-ref" : "b-xd");
    polyline(svg, res.prof.slice(1).map((p) => [X(p), A.sy(p.xDgem)]), ref ? "s-ref" : "b-xdgem");
    polyline(svg, res.prof.map((p) => [X(p), A.sy(p.xB)]), ref ? "s-ref" : "b-xb");
    if (res.p.bmode !== "eenvoudig") polyline(svg, res.prof.map((p) => [X(p), sr(p.R)]), ref ? "s-ref" : "b-r");
  };
  if (BREF && BREF.prof) lijnen(BREF, true);
  lijnen(r, false);
  const n = r.prof.length, e = r.prof[Math.max(1, Math.round(0.78 * (n - 1)))];
  const ex = A.sx(e.D / BS.W0);
  if (Math.abs(e.xD - e.xDgem) < 0.02) txt(svg, ex, A.sy(Math.max(e.xD, e.xDgem)) - 8, "x_D = x_{D,gem}", "s-lab", "middle");
  else {
    txt(svg, ex, A.sy(Math.max(e.xD, e.xDgem)) - 8, e.xDgem >= e.xD ? "x_{D,gem}" : "x_D", "s-lab", "middle");
    txt(svg, ex, A.sy(Math.min(e.xD, e.xDgem)) + 18, e.xDgem >= e.xD ? "x_D" : "x_{D,gem}", "s-lab", "middle");
  }
  txt(svg, ex, A.sy(e.xB) - 8, "x_B (ketel)", "s-lab", "middle");
  if (BS.bmode !== "eenvoudig") {
    const er = r.prof[Math.max(1, Math.round(0.5 * (n - 1)))], yr = sr(er.R);
    txt(svg, A.sx(er.D / BS.W0), yr + (yr < Mg.t + 24 ? 16 : -8), "R_D", "s-labz", "middle");
  }
  // ogenblik
  const pr = r.prof[bMomentIndex(r)];
  polyline(svg, [[A.sx(pr.D / BS.W0), Mg.t], [A.sx(pr.D / BS.W0), Mg.t + A.ph]], "s-q");
  $("#bverloopUitleg").innerHTML = "Blauw: ogenblikkelijke topsamenstelling x<sub>D</sub>; paars: gemiddelde samenstelling van het opgevangen destillaat; donker: ketel x<sub>B</sub>; grijs gestippeld: R<sub>D</sub> (rechteras)." +
    (BREF ? " Gestreepte grijze lijnen: referentie." : "") + " De verticale lijn is het gekozen ogenblik.";
}

// ---------------------------------------------------------------- Rayleigh-integraal
function bTekenRayleigh(r) {
  const svg = $("#bray"); svg.innerHTML = "";
  const W = 640, H = 460, Mg = { l: 62, r: 16, t: 14, b: 44 };
  if (!r.prof) { txt(svg, W / 2, H / 2, "Niet beschikbaar.", "s-lab", "middle"); return; }
  const pts = r.prof.map((p) => [p.xB, 1 / (p.xD - p.xB)]);
  const ymax = Math.max(...pts.map((p) => p[1])) * 1.1;
  const x0 = Math.max(0, r.xBeind - 0.05 * (r.p.x0 - r.xBeind)), x1 = Math.min(1, r.p.x0 + 0.05 * (r.p.x0 - r.xBeind));
  const A = assenKader(svg, W, H, Mg, [x0, x1], [0, ymax], "x_B  (ketel)", "1 / (x_D − x_B)");
  const vlak = [[A.sx(pts[0][0]), A.sy(0)], ...pts.map((p) => [A.sx(p[0]), A.sy(p[1])]), [A.sx(pts[pts.length - 1][0]), A.sy(0)]];
  el("polygon", { points: vlak.map((p) => p.join(",")).join(" "), class: "b-vlak" }, svg);
  polyline(svg, pts.map((p) => [A.sx(p[0]), A.sy(p[1])]), "s-ev");
  const lnW = Math.log(r.p.W0 / r.W);
  txt(svg, A.sx(0.5 * (r.p.x0 + r.xBeind)), A.sy(ymax * 0.5), `oppervlakte = ln(W_0/W) = ${f(lnW, 3)}`, "s-lab", "middle");
  $("#brayUitleg").innerHTML = `Vergelijking van Rayleigh: ln(W<sub>0</sub>/W) = ∫ dx<sub>B</sub>/(x<sub>D</sub> − x<sub>B</sub>) van x<sub>B</sub> tot x<sub>B,0</sub>. ` +
    `Hier ln(W<sub>0</sub>/W) = ${f(lnW, 3)}, dus W = ${f(r.W, 2)} kmol en D = ${f(r.D, 2)} kmol.` +
    (r.p.bmode === "xD" ? " Bij constante x<sub>D</sub> volgt hetzelfde rechtstreeks uit de massabalans: D = W<sub>0</sub>(x<sub>B,0</sub> − x<sub>B</sub>)/(x<sub>D</sub> − x<sub>B</sub>)." : "");
}

// ---------------------------------------------------------------- schema batchkolom
function bTekenKolom(r) {
  const svg = $("#bkolom"); svg.innerHTML = "";
  const ok = !r.fouten.length && r.prof;
  const pr = ok ? r.prof[bMomentIndex(r)] : null;
  const N = r.N || (BS.bmode === "eenvoudig" ? 1 : BS.N);
  const cx = 140, w = 64, x0 = cx - w / 2, x1 = cx + w / 2;
  const top = 120, bot = N > 1 ? 400 : 240;
  // condensor
  const cxC = 262, cyC = 52;
  el("path", { d: `M ${cx} ${N > 1 ? top : 430} L ${cx} ${cyC} L ${cxC - 16} ${cyC}`, class: "s-damp" }, svg);
  el("circle", { cx: cxC, cy: cyC, r: 16, class: "s-app" }, svg);
  el("path", { d: `M ${cxC - 9} ${cyC + 7} l 4 -14 l 5 14 l 5 -14 l 4 14`, class: "s-warm", "stroke-width": 1.6 }, svg);
  pijl(svg, cxC, cyC - 16, cxC, 6, "s-warm", "m-oranje");
  txt(svg, cxC + 8, 18, "condensor", "t-zacht");
  txt(svg, cx - 7, 84, "V = " + f(BS.Vdeb, 0) + " kmol/h", "t-damp", "end");
  const yj = 94;
  el("path", { d: `M ${cxC} ${cyC + 16} L ${cxC} ${yj}`, class: "s-vl" }, svg);
  if (N > 1) {
    el("path", { d: `M ${cxC} ${yj} L ${x1 + 16} ${yj} L ${x1 + 16} ${top + 14}`, class: "s-vl" }, svg);
    pijl(svg, x1 + 16, top + 14, x1 + 2, top + 14, "s-vl", "m-blauw");
    txt(svg, (x1 + 16 + cxC) / 2, yj - 6, "R_D = " + (pr ? f(pr.R, 2) : "?"), "t-gew", "middle");
    el("rect", { x: x0, y: top, width: w, height: bot - top, rx: 12, class: "s-kolom" }, svg);
    const np = Math.min(N - 1, 20);
    for (let i = 1; i <= np; i++) {
      const y = top + 14 + (bot - top - 28) * (np === 1 ? 0.5 : (i - 1) / (np - 1));
      el("line", { x1: x0 + (i % 2 ? 0 : 12), x2: x1 - (i % 2 ? 12 : 0), y1: y, y2: y, class: "s-plaat" }, svg);
    }
    txt(svg, x0 - 4, top + 18, "1", "t-zacht", "end"); txt(svg, x0 - 4, bot - 10, String(N - 1), "t-zacht", "end");
    el("path", { d: `M ${cx} ${bot} L ${cx} 430`, class: "s-vl" }, svg);
  }
  // opvangvat destillaat
  pijl(svg, cxC, yj, cxC, 168, "s-vl", "m-blauw");
  txt(svg, cxC + 6, 136, "x_D = " + (pr ? f(pr.xD, 3) : "?"), "t-vl");
  el("rect", { x: cxC - 46, y: 170, width: 92, height: 54, rx: 8, class: "s-app" }, svg);
  txt(svg, cxC, 190, "destillaat", "t-zacht", "middle");
  txt(svg, cxC, 208, "D = " + (pr ? f(pr.D, 1) : "?") + " kmol", "t-vl", "middle");
  txt(svg, cxC, 244, "x_{D,gem} = " + (pr && pr.D > 0 ? f(pr.xDgem, 3) : "–"), "t-vl", "middle");
  // ketel
  const ky = 470;
  el("path", { d: `M ${cx - 70} ${ky - 40} Q ${cx - 70} ${ky + 60} ${cx} ${ky + 60} Q ${cx + 70} ${ky + 60} ${cx + 70} ${ky - 40} Z`, class: "s-app" }, svg);
  el("line", { x1: cx - 70, x2: cx + 70, y1: ky - 40, y2: ky - 40, class: "s-plaat" }, svg);
  const fr = pr ? pr.W / BS.W0 : 1;
  const yv = ky + 58 - 90 * fr;
  el("path", { d: `M ${cx - 66} ${Math.max(yv, ky - 36)} L ${cx + 66} ${Math.max(yv, ky - 36)}`, class: "s-vl" }, svg);
  txt(svg, cx, ky + 10, "ketel", "t-zacht", "middle");
  txt(svg, cx, ky + 28, "W = " + (pr ? f(pr.W, 1) : f(BS.W0, 1)) + " kmol", "t-vl", "middle");
  txt(svg, cx, ky + 44, "x_B = " + (pr ? f(pr.xB, 3) : BS.x0), "t-vl", "middle");
  pijl(svg, 330, ky + 20, cx + 66, ky + 20, "s-warm", "m-oranje");
  txt(svg, 330, ky + 12, "Q̇ ketel", "t-warm", "end");
  txt(svg, 6, 590, `W₀ = ${f(BS.W0, 0)} kmol, x_{B,0} = ${BS.x0}`, "t-zacht");
  txt(svg, 6, 14, N > 1 ? `${N} trappen (${N - 1} platen + ketel)` : "eenvoudige destillatie (1 trap)", "t-zacht");
}

// ---------------------------------------------------------------- tabel
function bTekenTabel(r) {
  const ref = BREF;
  const kol = (lab, fn, d, eenh) => {
    const v = r.prof ? fn(r) : NaN, rv = ref && ref.prof ? fn(ref) : undefined;
    const fm = (x) => typeof x === "string" ? x : f(x, d);
    return `<tr><td>${lab}</td><td class="w">${fm(v)}${eenh ? " " + eenh : ""}</td>${BREF ? `<td class="r">${rv === undefined ? "–" : fm(rv)}</td>` : ""}</tr>`;
  };
  const kop = (t) => `<table><thead><tr><th>${t}</th><th style="text-align:right">nu</th>${BREF ? '<th style="text-align:right">ref.</th>' : ""}</tr></thead><tbody>`;
  const t1 = kop("Lading en producten") + kol("W<sub>0</sub> (kmol)", (x) => x.p.W0, 1) + kol("x<sub>B,0</sub>", (x) => x.p.x0, 3) +
    kol("W eind (kmol)", (x) => x.W, 2) + kol("x<sub>B</sub> eind", (x) => x.xBeind, 4) + kol("D (kmol)", (x) => x.D, 2) +
    kol("x<sub>D,gem</sub>", (x) => x.xDgem, 4) + kol("rendement component A", (x) => 100 * x.rendA, 1, "%") + "</tbody></table>";
  const t2 = kop("Kolom en reflux") + kol("werkwijze", (x) => ({ eenvoudig: "eenvoudig", R: "constante R<sub>D</sub>", xD: "constante x<sub>D</sub>" })[x.p.bmode], 0) +
    kol("trappen (incl. ketel)", (x) => String(x.N), 0) + kol("x<sub>D</sub> begin", (x) => x.xD0, 4) + kol("x<sub>D</sub> eind", (x) => x.xD1, 4) +
    kol("R<sub>D</sub> begin", (x) => x.R0, 2) + kol("R<sub>D</sub> eind", (x) => x.R1, 2) + "</tbody></table>";
  const t3 = kop("Energie en tijd") + kol("V totaal (kmol)", (x) => x.Vtot, 1) + kol("Q ketel (kWh)", (x) => x.Qketel, 0) +
    kol("Q condensor (kWh)", (x) => x.Qcond, 0) + kol("Q ketel per kmol D (kWh)", (x) => x.Qketel / x.D, 2) + kol("duur (h)", (x) => x.tijd, 2) + "</tbody></table>";
  $("#btabellen").innerHTML = t1 + t2 + t3;
  $("#btabellen").classList.toggle("metref", !!BREF);
  if (!r.prof) { $("#bstappen").innerHTML = '<p class="klein">Geen verloop.</p>'; return; }
  let h = `<table><thead><tr><th>x<sub>B</sub> ketel</th><th>x<sub>D</sub></th><th>R<sub>D</sub></th><th>W (kmol)</th><th>D (kmol)</th><th>x<sub>D,gem</sub></th><th>V (kmol)</th></tr></thead><tbody>`;
  r.prof.forEach((p, i) => { if (i % 8 === 0 || i === r.prof.length - 1) h += `<tr><td>${fx(p.xB)}</td><td>${fx(p.xD)}</td><td>${f(p.R, 2)}</td><td>${f(p.W, 2)}</td><td>${f(p.D, 2)}</td><td>${i ? fx(p.xDgem) : "–"}</td><td>${f(p.V, 1)}</td></tr>`; });
  $("#bstappen").innerHTML = h + "</tbody></table>";
}

// ---------------------------------------------------------------- tabbladen, referentie, modus
function koppelBatch() {
  document.querySelectorAll("#btabs [data-btab]").forEach((b) => b.addEventListener("click", () => {
    bTab = b.dataset.btab;
    document.querySelectorAll("#btabs [data-btab]").forEach((x) => { x.classList.toggle("aan", x === b); x.setAttribute("aria-selected", x === b); });
    for (const t of ["mt", "verloop", "ray"]) $("#btab-" + t).hidden = t !== bTab;
    bUpdate(true);
  }));
  const m = $("#bmoment");
  m.addEventListener("input", () => { BS.moment = +m.value / 100; bUpdate(true); });
}
function bZetReferentie() {
  if (BREF) { BREF = null; } else BREF = bLaatste;
  zetRefKnop(!!BREF);
  bUpdate();
}
