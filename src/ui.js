"use strict";
// =====================================================================
// Interface destillatie-demonstrator
// =====================================================================
const $ = (s) => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const f = (v, d = 3) => (v === undefined || v === null || !isFinite(v)) ? "–" : Number(v).toFixed(d);
const fx = (v) => { // samenstelling: genoeg cijfers ook bij strenge zuiverheden
  if (v === undefined || v === null || !isFinite(v)) return "–";
  if (v !== 0 && Math.abs(v) < 0.001) return v.toExponential(2).replace("e", "·10^").replace(/\^([-+]?)(\d+)/, (m, s, d) => "<sup>" + (s === "-" ? "−" : "") + d + "</sup>");
  if (v > 0.999 && v < 1) return v.toFixed(5);
  return v.toFixed(4);
};

const STANDAARD = {
  sys: "ideaal", alpha: 2.5, A12: 1.0, A21: 1.0, P: 101.325,
  F: 100, zF: 0.50, xD: 0.95, xB: 0.05,
  qMode: "q", q: 1, fV: 0, TF: 25, cpL: 160, cpV: 100,
  mode: "Rfac", R: 2, Rfac: 1.5, VB: 2,
  eta: 1, vast: false, voeding: 5, lamA: 30, lamB: 30,
};

const PRESETS = [
  { naam: "Standaard (ideaal, α = 2.5)", s: {} },
  { naam: "Vb 5.2 (1): verzadigde vloeistof", s: { sys: "ideaal", alpha: 2.5, F: 30, zF: 0.40, xD: 0.97, xB: 0.02, qMode: "q", q: 1, mode: "R", R: 3.5 } },
  { naam: "Vb 5.2 (2): onderkoelde vloeistof (q = 1.37)", s: { sys: "ideaal", alpha: 2.5, F: 30, zF: 0.40, xD: 0.97, xB: 0.02, qMode: "q", q: 1 + 160 * 75 / 32296, mode: "R", R: 3.5 } },
  { naam: "Vb 5.2 (3): 2/3 damp (q = 1/3)", s: { sys: "ideaal", alpha: 2.5, F: 30, zF: 0.40, xD: 0.97, xB: 0.02, qMode: "f", fV: 2 / 3, mode: "R", R: 3.5 } },
  { naam: "Oef 5.3: benzeen – tolueen, R_D = 3.5", s: { sys: "bt", F: 100, zF: 0.44, xD: 0.974, xB: 0.0235, qMode: "q", q: 1, mode: "R", R: 3.5 } },
  { naam: "Oef 5.5: ethanol – water (Perry), L/V = 0.80", s: { sys: "ewdata", F: 100, zF: 0.20, xD: 0.85, xB: 0.0078, qMode: "q", q: 1, mode: "R", R: 4 } },
  { naam: "Oef 5.6: methanol – water, η = 70%", s: { sys: "mwdata", F: 100, zF: 0.75, xD: 0.99, xB: 0.0002, qMode: "q", q: 1.15, mode: "R", R: 1.4, eta: 0.7 } },
  { naam: "Oef 5.7: aceton – methanol (UNIFAC), R = 2 R_min", s: { sys: "am", F: 100, zF: 0.25, xD: 0.77, xB: 0.01, qMode: "f", fV: 0.7, mode: "Rfac", Rfac: 2, eta: 0.7 } },
  { naam: "Inzicht: tangent pinch ethanol – water", s: { sys: "ew", F: 100, zF: 0.10, xD: 0.85, xB: 0.005, qMode: "q", q: 1, mode: "Rfac", Rfac: 1.3 } },
  { naam: "Inzicht: eigen azeotroop (Van Laar)", s: { sys: "vanlaar", alpha: 1.8, A12: 1.1, A21: 0.9, F: 100, zF: 0.4, xD: 0.75, xB: 0.05, qMode: "q", q: 1, mode: "Rfac", Rfac: 1.5 } },
];

let S = Object.assign({}, STANDAARD);
let REF = null, VIEW = null, laatste = null;

// ---------------------------------------------------------------- invoerpaneel
const VELDEN = {}; // id -> {rng, num, def}
function maakVeld(parent, id, label, def) {
  const st = () => def.st ? def.st() : S, upd = def.upd || update, reg = def.reg || VELDEN;
  const rij = document.createElement("div"); rij.className = "rij" + (def.radio ? " radio" : ""); rij.id = "rij-" + (def.pref || "") + id;
  const lab = document.createElement("label");
  if (def.radio) {
    const r = document.createElement("input"); r.type = "radio"; r.name = def.radio; r.value = def.radioVal;
    r.addEventListener("change", () => { st()[def.radioKey] = def.radioVal; upd(); });
    lab.appendChild(r); def.radioEl = r;
    const sp = document.createElement("span"); sp.innerHTML = label; lab.appendChild(sp);
  } else lab.innerHTML = label;
  lab.htmlFor = def.radio ? "" : "n-" + (def.pref || "") + id;
  const rng = document.createElement("input"); rng.type = "range"; rng.min = 0; rng.max = 1000; rng.step = 1;
  rng.setAttribute("aria-label", label.replace(/<[^>]+>/g, ""));
  const num = document.createElement("input"); num.type = "text"; num.inputMode = "decimal"; num.id = "n-" + (def.pref || "") + id; num.autocomplete = "off";
  if (def.min !== undefined) num.min = def.min; if (def.max !== undefined) num.max = def.max;
  const wrap = document.createElement("span"); wrap.className = "numwrap";
  const pijlen = document.createElement("span"); pijlen.className = "pijlen";
  const bOp = document.createElement("button"); bOp.type = "button"; bOp.textContent = "▲"; bOp.tabIndex = -1; bOp.setAttribute("aria-label", "verhoog");
  const bNeer = document.createElement("button"); bNeer.type = "button"; bNeer.textContent = "▼"; bNeer.tabIndex = -1; bNeer.setAttribute("aria-label", "verlaag");
  pijlen.append(bOp, bNeer); wrap.append(num, pijlen);
  rij.append(lab, rng, wrap); parent.appendChild(rij);
  const toS = (v) => def.log ? 1000 * Math.log(v / def.min) / Math.log(def.max / def.min) : 1000 * (v - def.min) / (def.max - def.min);
  const vanS = (s) => def.log ? def.min * Math.pow(def.max / def.min, s / 1000) : def.min + (def.max - def.min) * s / 1000;
  const rond = (v) => def.rond ? def.rond(v) : v;
  rng.addEventListener("input", () => {
    if (def.radio && st()[def.radioKey] !== def.radioVal) { st()[def.radioKey] = def.radioVal; }
    st()[id] = rond(vanS(+rng.value)); num.value = fmtIn(st()[id], def); upd(true);
  });
  num.addEventListener("change", () => {
    const v = parseFloat(String(num.value).replace(",", "."));
    if (!isFinite(v)) { num.value = fmtIn(st()[id], def); return; }
    if (def.radio && st()[def.radioKey] !== def.radioVal) { st()[def.radioKey] = def.radioVal; }
    st()[id] = v; rng.value = Math.max(0, Math.min(1000, toS(v))); upd();
  });
  // eigen stappen (pijltjes en pijltoetsen), werkt in elke browser
  const stapGrootte = (v, richting) => {
    if (def.dstep) return def.dstep;
    const a = Math.abs(v) || def.min || 1;
    let e = Math.pow(10, Math.floor(Math.log10(a) + 1e-9) - 1);
    if (richting < 0 && Math.abs(a - Math.pow(10, Math.round(Math.log10(a)))) < 1e-12 * a) e /= 10; // 1.0 -> 0.99
    return e;
  };
  const stap = (richting) => {
    let v = st()[id]; if (!isFinite(v)) v = def.min;
    const d = stapGrootte(v, richting);
    let nv = Math.round((v + richting * d) / d) * d;
    nv = Math.min(def.max, Math.max(def.min, +nv.toPrecision(10)));
    if (def.radio && st()[def.radioKey] !== def.radioVal) st()[def.radioKey] = def.radioVal;
    st()[id] = nv; num.value = fmtIn(nv, def); rng.value = Math.max(0, Math.min(1000, toS(nv)));
    if (def.radio) def.radioEl.checked = true;
    upd();
  };
  bOp.addEventListener("click", () => stap(+1));
  bNeer.addEventListener("click", () => stap(-1));
  num.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); stap(e.key === "ArrowUp" ? 1 : -1); }
  });
  num.addEventListener("wheel", (e) => { if (document.activeElement === num) e.preventDefault(); }, { passive: false });
  reg[id] = { rij, rng, num, def, toS, set(v) { num.value = fmtIn(v, def); rng.value = Math.max(0, Math.min(1000, toS(v))); } };
}
function fmtIn(v, def) {
  if (!isFinite(v)) return "";
  if (def.dec !== undefined) return (+v).toFixed(def.dec);
  if (Math.abs(v) < 0.01 && v !== 0) return String(+(+v).toPrecision(3));
  return String(+(+v).toPrecision(5));
}

function bouwInvoer() {
  const p = $("#invoer");
  p.innerHTML = '<h2>Invoer</h2>';
  // systeem
  let fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Systeem en evenwicht</legend>";
  const sel = document.createElement("select"); sel.id = "sys"; sel.style.width = "100%";
  for (const [k, s] of Object.entries(SYSTEMEN)) { const o = document.createElement("option"); o.value = k; o.textContent = s.naam; sel.appendChild(o); }
  sel.addEventListener("change", () => { S.sys = sel.value; zetLambdaStd(); VELDEN.lamA.set(S.lamA); VELDEN.lamB.set(S.lamB); VIEW = null; update(); });
  fs.appendChild(sel);
  const ul = document.createElement("div"); ul.className = "uitleg"; ul.id = "sysUitleg"; fs.appendChild(ul);
  maakVeld(fs, "alpha", "α (rel. vluchtigh.)", { dstep: 0.1,  min: 1.05, max: 10, log: true, rond: (v) => +v.toFixed(2) });
  maakVeld(fs, "A12", "A<sub>12</sub> (Van Laar)", { dstep: 0.05,  min: -1.5, max: 3, rond: (v) => +v.toFixed(2) });
  maakVeld(fs, "A21", "A<sub>21</sub> (Van Laar)", { dstep: 0.05,  min: -1.5, max: 3, rond: (v) => +v.toFixed(2) });
  maakVeld(fs, "P", "druk P (kPa)", { min: 20, max: 500, log: true, rond: (v) => +v.toFixed(1) });
  maakVeld(fs, "lamA", "λ<sub>A</sub> (kJ/mol)", { dstep: 0.5, min: 10, max: 60, rond: (v) => +v.toFixed(1) });
  maakVeld(fs, "lamB", "λ<sub>B</sub> (kJ/mol)", { dstep: 0.5, min: 10, max: 60, rond: (v) => +v.toFixed(1) });
  p.appendChild(fs);

  // voeding
  fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Voeding en producten</legend>";
  maakVeld(fs, "F", "F (kmol/h)", { min: 1, max: 1000, log: true, rond: (v) => +v.toPrecision(3) });
  maakVeld(fs, "zF", "z<sub>F</sub>", { dstep: 0.01,  min: 0.01, max: 0.99, rond: (v) => +v.toFixed(3) });
  maakVeld(fs, "xD", "x<sub>D</sub> (top)", { dstep: 0.005,  min: 0.5, max: 0.9999, rond: (v) => +v.toFixed(4) });
  maakVeld(fs, "xB", "x<sub>B</sub> (bodem)", { min: 0.0001, max: 0.4, log: true, rond: (v) => +v.toPrecision(3) });
  p.appendChild(fs);
  fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Toestand van de voeding</legend>";
  const k = document.createElement("div"); k.className = "keuze"; k.id = "qKeuze";
  k.innerHTML = '<span class="klein">toestand via:</span>' +
    '<label><input type="radio" name="qm" value="q"> q</label>' +
    '<label><input type="radio" name="qm" value="f"> dampfractie</label>' +
    '<label id="lab-qT"><input type="radio" name="qm" value="T"> temperatuur</label>';
  k.querySelectorAll("input").forEach((r) => r.addEventListener("change", () => { S.qMode = r.value; update(); }));
  fs.appendChild(k);
  maakVeld(fs, "q", "q", { dstep: 0.05,  min: -1, max: 2, rond: (v) => +v.toFixed(3) });
  maakVeld(fs, "fV", "dampfractie f", { dstep: 0.05,  min: 0, max: 1, rond: (v) => +v.toFixed(3) });
  maakVeld(fs, "TF", "T<sub>F</sub> (°C)", { dstep: 1,  min: 0, max: 200, rond: (v) => +v.toFixed(1) });
  maakVeld(fs, "cpL", "c<sub>p,L</sub> (kJ/kmol·K)", { dstep: 5,  min: 50, max: 300, rond: (v) => Math.round(v) });
  maakVeld(fs, "cpV", "c<sub>p,V</sub> (kJ/kmol·K)", { dstep: 5,  min: 20, max: 200, rond: (v) => Math.round(v) });
  const qi = document.createElement("div"); qi.className = "uitleg"; qi.id = "qUitleg"; fs.appendChild(qi);
  p.appendChild(fs);


  // reflux
  fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Reflux of boilup (kies er één)</legend>";
  maakVeld(fs, "R", "R<sub>D</sub> = L/D", { min: 0.05, max: 30, log: true, rond: (v) => +v.toPrecision(3), radio: "rm", radioVal: "R", radioKey: "mode" });
  maakVeld(fs, "Rfac", "R<sub>D</sub>/R<sub>D,min</sub>", { dstep: 0.05,  min: 1.0, max: 5, rond: (v) => +v.toFixed(2), radio: "rm", radioVal: "Rfac", radioKey: "mode" });
  maakVeld(fs, "VB", "V<sub>B</sub> = V̄/B", { min: 0.05, max: 40, log: true, rond: (v) => +v.toPrecision(3), radio: "rm", radioVal: "VB", radioKey: "mode" });
  const ru = document.createElement("div"); ru.className = "uitleg";
  ru.innerHTML = "Met F, z<sub>F</sub>, q, x<sub>D</sub> en x<sub>B</sub> vast, bepaalt één van deze drie de andere twee.";
  fs.appendChild(ru);
  p.appendChild(fs);

  // kolom
  fs = document.createElement("fieldset"); fs.innerHTML = "<legend>Kolom</legend>";
  maakVeld(fs, "eta", "η<sub>M</sub> (Murphree)", { dstep: 0.05,  min: 0.2, max: 1, rond: (v) => +v.toFixed(2) });
  const kv = document.createElement("div"); kv.className = "keuze";
  kv.innerHTML = '<label><input type="checkbox" id="vastChk"> vaste voedingsplaat (i.p.v. optimaal)</label>';
  fs.appendChild(kv);
  $("#invoer").appendChild(fs);
  $("#vastChk").addEventListener("change", (e) => { S.vast = e.target.checked; update(); });
  maakVeld(fs, "voeding", "voedingsplaat", { dstep: 1,  min: 1, max: 60, step: 1, rond: (v) => Math.round(v), dec: 0 });
  p.appendChild(fs);
  syncInvoer();
}

function syncInvoer() {
  $("#sys").value = S.sys;
  for (const [id, v] of Object.entries(VELDEN)) v.set(S[id]);
  document.querySelectorAll('input[name=qm]').forEach((r) => { r.checked = r.value === S.qMode; });
  VELDEN.R.def.radioEl.checked = S.mode === "R";
  VELDEN.Rfac.def.radioEl.checked = S.mode === "Rfac";
  VELDEN.VB.def.radioEl.checked = S.mode === "VB";
  $("#vastChk").checked = S.vast;
}

function zichtbaar(id, aan) { VELDEN[id].rij.style.display = aan ? "" : "none"; }

// ---------------------------------------------------------------- berekening
let ev = null, evKey = "";
function update(snel) {
  const s = SYSTEMEN[S.sys];
  const key = S.sys + "|" + S.alpha + "|" + S.A12 + "|" + S.A21 + "|" + (s.soort === "model" ? S.P : "");
  if (key !== evKey) { ev = maakEvenwicht(S.sys, { alpha: S.alpha, A12: S.A12, A21: S.A21, P: S.P }); evKey = key; }

  // zichtbaarheid invoer
  zichtbaar("alpha", s.soort === "alpha" || s.soort === "vanlaar");
  VELDEN.alpha.rij.querySelector("label").innerHTML = s.soort === "vanlaar" ? "α<sub>0</sub> (ideaal deel)" : "α (rel. vluchtigh.)";
  zichtbaar("A12", s.soort === "vanlaar"); zichtbaar("A21", s.soort === "vanlaar");
  zichtbaar("P", s.soort === "model");
  const heeftT = !!ev.T;
  $("#lab-qT").style.display = heeftT ? "" : "none";
  if (!heeftT && S.qMode === "T") { S.qMode = "q"; document.querySelectorAll('input[name=qm]').forEach((r) => { r.checked = r.value === "q"; }); }
  zichtbaar("q", S.qMode === "q"); zichtbaar("fV", S.qMode === "f");
  ["TF", "cpL", "cpV"].forEach((i) => zichtbaar(i, S.qMode === "T"));
  zichtbaar("voeding", S.vast);
  let su = s.uitleg;
  if (s.soort === "model" && S.sys === "be" && s.A) su += ` (A<sub>12</sub> = ${s.A[0].toFixed(3)}, A<sub>21</sub> = ${s.A[1].toFixed(3)})`;
  if (s.soort === "data") su += " Druk: 1 atm.";
  $("#sysUitleg").innerHTML = su + ` <br>x en y: molfractie <b>${s.c1}</b>.` + (s.soort === "alpha" || s.soort === "vanlaar" ? "" : ` A = ${s.c1}, B = ${s.c2}; λ = verdampingswarmte bij het kookpunt.`);

  // q
  let q = S.q, qtxt = "";
  const lam = [S.lamA, S.lamB];
  if (S.qMode === "f") { q = 1 - S.fV; qtxt = `q = 1 − f = ${f(q, 3)}`; }
  else if (S.qMode === "T" && heeftT) {
    const lamF = S.zF * lam[0] + (1 - S.zF) * lam[1];
    const r = qUitTemperatuur(ev, S.zF, S.TF, S.cpL, S.cpV, lamF);
    q = r.q;
    const toestand = S.TF < r.Tb ? "onderkoelde vloeistof" : S.TF > r.Td ? "oververhitte damp" : "damp-vloeistofmengsel";
    qtxt = `Kookpunt voeding ${f(r.Tb, 1)} °C, dauwpunt ${f(r.Td, 1)} °C → ${toestand}, q = ${f(q, 3)} (λ<sub>F</sub> = ${f(lamF, 1)} kJ/mol).`;
  }
  if (S.qMode === "q") {
    qtxt = q > 1 ? "q > 1: onderkoelde vloeistof" : Math.abs(q - 1) < 1e-9 ? "q = 1: verzadigde vloeistof (kookpunt)" :
      q > 0 ? "0 < q < 1: damp-vloeistofmengsel" : Math.abs(q) < 1e-9 ? "q = 0: verzadigde damp (dauwpunt)" : "q < 0: oververhitte damp";
  }
  $("#qUitleg").innerHTML = qtxt;

  const inp = { F: S.F, zF: S.zF, xD: S.xD, xB: S.xB, q, mode: S.mode, R: S.R, Rfac: S.Rfac, VB: S.VB, eta: S.eta, voeding: S.vast ? S.voeding : 0, lambda: lam };
  const r = bereken(ev, inp);
  r.inp = inp; laatste = r;

  // berekende waarden in de niet-actieve refluxvelden
  for (const [id, val] of [["R", r.R], ["Rfac", r.Rmin ? r.R / r.Rmin : NaN], ["VB", r.VB]]) {
    const v = VELDEN[id], actief = S.mode === id;
    v.rij.classList.toggle("uit", !actief);
    if (!actief && isFinite(val)) { v.num.value = fmtIn(val, v.def); v.rng.value = Math.max(0, Math.min(1000, v.toS(val))); }
  }
  tekenKolom(r);
  tekenMT(r);
  tekenTabel(r);
  tekenKern(r);
  if (actieveTab === "txy") tekenTxy(r);
  if (actieveTab === "rfx") planRefluxGrafiek(r);
  if (!snel) schrijfHash();
}

// ---------------------------------------------------------------- SVG-hulp
function el(tag, attrs, parent, tekst) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (tekst !== undefined) e.textContent = tekst;
  if (parent) parent.appendChild(e);
  return e;
}
// tekst met eenvoudige subscripts: "x_D = 0.95" -> x<tspan>D</tspan>
function txt(parent, x, y, s, cls, anchor) {
  const t = el("text", { x, y, class: cls, "text-anchor": anchor || "start" }, parent);
  const delen = s.split(/(_\{[^}]*\}|_[A-Za-z0-9,]|\^\{[^}]*\})/);
  for (const d of delen) {
    if (!d) continue;
    if (d.startsWith("_")) {
      const inh = d.startsWith("_{") ? d.slice(2, -1) : d.slice(1);
      el("tspan", { "baseline-shift": "sub", "font-size": "75%" }, t, inh);
    } else if (d.startsWith("^")) {
      el("tspan", { "baseline-shift": "super", "font-size": "75%" }, t, d.slice(2, -1));
    } else el("tspan", {}, t, d);
  }
  return t;
}
function pijl(parent, x1, y1, x2, y2, cls, kleurCls) {
  el("line", { x1, y1, x2, y2, class: cls }, parent);
  const a = Math.atan2(y2 - y1, x2 - x1), L = 8, w = 4.2;
  const p = [[x2, y2], [x2 - L * Math.cos(a) + w * Math.sin(a), y2 - L * Math.sin(a) - w * Math.cos(a)],
    [x2 - L * Math.cos(a) - w * Math.sin(a), y2 - L * Math.sin(a) + w * Math.cos(a)]];
  el("polygon", { points: p.map((q) => q.join(",")).join(" "), class: kleurCls }, parent);
}
function polyline(parent, pts, cls) {
  if (pts.length < 2) return;
  el("polyline", { points: pts.map((p) => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" "), class: cls }, parent);
}

// ---------------------------------------------------------------- kolomschema
function tekenKolom(r) {
  const svg = $("#kolom"); svg.innerHTML = "";
  const cx = 155, w = 70, x0 = cx - w / 2, x1 = cx + w / 2, top = 122, bot = 470;
  const N = r.nPlaten, ok = !r.fouten.length && N !== undefined;
  const MAXT = 30, nTeken = ok ? Math.min(N, MAXT) : 10;
  const yPl = (i) => top + 16 + (bot - top - 32) * (nTeken === 1 ? 0.5 : (i - 1) / (nTeken - 1));
  let feedI = null;
  if (ok && r.voedingsplaat && !r.voedingInReboiler) feedI = N <= MAXT ? r.voedingsplaat : Math.max(1, Math.round(1 + (r.voedingsplaat - 1) * (nTeken - 1) / Math.max(1, N - 1)));
  const yF = feedI ? yPl(feedI) : (top + bot) / 2;
  // stromen boven: damp naar condensor
  const cxC = 240, cyC = 52;
  el("path", { d: `M ${cx} ${top} L ${cx} ${cyC} L ${cxC - 16} ${cyC}`, class: "s-damp" }, svg);
  txt(svg, cx - 7, 84, "V = " + (r.V > 0 ? f(r.V, 1) : "?"), "t-damp", "end");
  el("circle", { cx: cxC, cy: cyC, r: 16, class: "s-app" }, svg);
  el("path", { d: `M ${cxC - 9} ${cyC + 7} l 4 -14 l 5 14 l 5 -14 l 4 14`, class: "s-warm", "stroke-width": 1.6 }, svg);
  pijl(svg, cxC, cyC - 16, cxC, 6, "s-warm", "m-oranje");
  txt(svg, cxC + 8, 18, "Q̇_C = " + (ok ? f(r.QC, 0) + " kW" : "?"), "t-warm");
  txt(svg, cxC + 22, cyC + 4, "condensor", "t-zacht");
  // reflux en destillaat
  const yj = 94;
  el("path", { d: `M ${cxC} ${cyC + 16} L ${cxC} ${yj}`, class: "s-vl" }, svg);
  el("path", { d: `M ${cxC} ${yj} L ${x1 + 16} ${yj} L ${x1 + 16} ${top + 14}`, class: "s-vl" }, svg);
  pijl(svg, x1 + 16, top + 14, x1 + 2, top + 14, "s-vl", "m-blauw");
  pijl(svg, cxC, yj, 334, yj, "s-vl", "m-blauw");
  txt(svg, 334, yj - 6, "D = " + f(r.D, 2), "t-vl", "end");
  txt(svg, 334, yj + 18, "x_D = " + S.xD, "t-vl", "end");
  txt(svg, 334, yj + 34, "R_D = " + (r.R > 0 ? f(r.R, 2) : "?"), "t-gew", "end");
  if (r.Ttop !== undefined) txt(svg, 334, yj + 50, "T = " + f(r.Ttop, 1) + " °C", "t-zacht", "end");
  // kolomlichaam en platen
  el("rect", { x: x0, y: top, width: w, height: bot - top, rx: 14, class: "s-kolom" }, svg);
  for (let i = 1; i <= nTeken; i++) {
    const y = yPl(i);
    el("line", { x1: x0 + (i % 2 ? 0 : 14), x2: x1 - (i % 2 ? 14 : 0), y1: y, y2: y, class: i === feedI ? "s-plaatfeed" : "s-plaat" }, svg);
  }
  if (ok) {
    txt(svg, x0 - 4, yPl(1) + 4, "1", "t-zacht", "end");
    if (N > 1) txt(svg, x0 - 4, yPl(nTeken) + 4, String(N), "t-zacht", "end");
    if (N > MAXT) txt(svg, cx, bot + 14, `(${MAXT} van ${N} platen getekend)`, "t-zacht", "middle");
  } else txt(svg, cx, (top + bot) / 2 + 4, "N = ?", "t-gew", "middle");
  // secties
  for (const [y0, y1, t] of [[top, yF, "RECTIFICATIE"], [yF, bot, "STRIPPING"]]) {
    const ym = (y0 + y1) / 2;
    if (y1 - y0 > 70) el("text", { x: 16, y: ym, class: "t-sectie", "text-anchor": "middle", transform: `rotate(-90 16 ${ym})` }, svg, t);
  }
  if (r.L > 0) {
    const yr = Math.max(top + 44, Math.min((top + yF) / 2, yF - 30));
    const ys = Math.max(yF + 22, Math.min((yF + bot) / 2, bot - 44));
    txt(svg, x1 + 8, yr, "L = " + f(r.L, 1), "t-vl"); txt(svg, x1 + 8, yr + 16, "V = " + f(r.V, 1), "t-damp");
    txt(svg, x1 + 8, ys, "L̄ = " + f(r.Lb, 1), "t-vl"); txt(svg, x1 + 8, ys + 16, "V̄ = " + f(r.Vb, 1), "t-damp");
  }
  // voeding
  const qk = r.q >= 1 ? "s-vl" : r.q <= 0 ? "s-damp" : "s-voed", qm = r.q >= 1 ? "m-blauw" : r.q <= 0 ? "m-rood" : "m-paars";
  const qt = r.q >= 1 ? "t-vl" : r.q <= 0 ? "t-damp" : "t-voed";
  if (r.voedingInReboiler) {
    txt(svg, 30, 520, "voeding in de reboiler", qt);
  } else {
    pijl(svg, 30, yF, x0 - 2, yF, qk, qm);
    txt(svg, 30, yF - 38, "F = " + f(S.F, 1), qt);
    txt(svg, 30, yF - 23, "z_F = " + S.zF, qt);
    txt(svg, 30, yF - 8, "q = " + f(r.q, 2), qt);
    if (ok) txt(svg, 30, yF + 17, "plaat " + r.voedingsplaat, "t-voed");
  }
  // reboiler
  const ry = 532, rx = 240;
  el("path", { d: `M ${cx} ${bot} L ${cx} ${ry} L ${rx - 24} ${ry}`, class: "s-vl" }, svg);
  txt(svg, cx - 6, 512, "L_N", "t-vl", "end");
  el("rect", { x: rx - 24, y: ry - 16, width: 48, height: 32, rx: 8, class: "s-app" }, svg);
  el("path", { d: `M ${rx - 15} ${ry + 6} l 5 -12 l 5 12 l 5 -12 l 5 12 l 5 -12`, class: "s-warm", "stroke-width": 1.6 }, svg);
  el("path", { d: `M ${rx} ${ry - 16} L ${rx} ${bot - 22}`, class: "s-damp" }, svg);
  pijl(svg, rx, bot - 22, x1 + 2, bot - 22, "s-damp", "m-rood");
  txt(svg, rx - 6, 500, "V̄, y_b", "t-damp", "end");
  pijl(svg, 344, ry, rx + 24, ry, "s-warm", "m-oranje");
  txt(svg, rx + 30, ry + 20, "Q̇_R = " + (ok ? f(r.QR, 0) + " kW" : "?"), "t-warm");
  txt(svg, rx + 30, ry - 8, "reboiler", "t-zacht");
  pijl(svg, rx, ry + 16, rx, 600, "s-vl", "m-blauw");
  txt(svg, rx - 8, 580, "B = " + f(r.B, 2), "t-vl", "end");
  txt(svg, rx - 8, 596, "x_B = " + S.xB, "t-vl", "end");
  txt(svg, rx + 8, 580, "V_B = " + (r.VB > 0 ? f(r.VB, 2) : "?"), "t-gew");
  if (r.Tbodem !== undefined) txt(svg, rx + 8, 596, "T = " + f(r.Tbodem, 1) + " °C", "t-zacht");
  if (S.eta < 1 && ok) txt(svg, 4, 596, "η_M = " + f(S.eta, 2), "t-zacht");
  txt(svg, 4, 14, "debieten in kmol/h", "t-zacht");
}

// ---------------------------------------------------------------- McCabe-Thiele
const M = { l: 62, r: 16, t: 14, b: 50, W: 640, H: 600 };
function volView() { return { x0: 0, x1: 1, y0: 0, y1: 1 }; }
function tekenMT(r) {
  const svg = $("#mt"); svg.innerHTML = "";
  const v = VIEW || volView();
  const pw = M.W - M.l - M.r, ph = M.H - M.t - M.b;
  const sx = (x) => M.l + (x - v.x0) / (v.x1 - v.x0) * pw;
  const sy = (y) => M.t + ph - (y - v.y0) / (v.y1 - v.y0) * ph;
  const P = (x, y) => [sx(x), sy(y)];
  svg._map = { sx, sy, v, pw, ph };
  const defs = el("defs", {}, svg);
  const cp = el("clipPath", { id: "clipMT" }, defs);
  el("rect", { x: M.l, y: M.t, width: pw, height: ph }, cp);

  // raster en assen
  const stap = (span) => { const raw = span / 10, e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; };
  const gx = stap(v.x1 - v.x0), gy = stap(v.y1 - v.y0);
  const dec = (g) => Math.max(0, -Math.floor(Math.log10(g) + 1e-9));
  const g = el("g", {}, svg);
  for (let t = Math.ceil(v.x0 / gx - 1e-9) * gx; t <= v.x1 + 1e-9; t += gx) {
    el("line", { x1: sx(t), x2: sx(t), y1: M.t, y2: M.t + ph, class: "s-grid" }, g);
    el("text", { x: sx(t), y: M.t + ph + 16, class: "s-tick", "text-anchor": "middle" }, g, t.toFixed(dec(gx)));
  }
  for (let t = Math.ceil(v.y0 / gy - 1e-9) * gy; t <= v.y1 + 1e-9; t += gy) {
    el("line", { x1: M.l, x2: M.l + pw, y1: sy(t), y2: sy(t), class: "s-grid" }, g);
    el("text", { x: M.l - 6, y: sy(t) + 4, class: "s-tick", "text-anchor": "end" }, g, t.toFixed(dec(gy)));
  }
  el("path", { d: `M ${M.l} ${M.t} L ${M.l} ${M.t + ph} L ${M.l + pw} ${M.t + ph}`, class: "s-as" }, svg);
  const s = SYSTEMEN[S.sys];
  txt(svg, M.l + pw / 2, M.H - 10, `x  (molfractie ${s.c1} in vloeistof)`, "s-astitel", "middle");
  const yt = el("g", { transform: `translate(16 ${M.t + ph / 2}) rotate(-90)` }, svg);
  txt(yt, 0, 0, `y  (molfractie ${s.c1} in damp)`, "s-astitel", "middle");

  const plot = el("g", { "clip-path": "url(#clipMT)" }, svg);
  const lo = Math.max(0, v.x0), hi = Math.min(1, v.x1);
  // diagonaal
  polyline(plot, [P(lo, lo), P(hi, hi)], "s-diag");

  // referentie
  if (REF) {
    if (REF.evKey !== evKey) polyline(plot, REF.ev.filter((p) => p[0] >= lo - 0.02 && p[0] <= hi + 0.02).map((p) => P(p[0], p[1])), "s-ref");
    if (REF.wl) for (const seg of REF.wl) polyline(plot, seg.map((p) => P(p[0], p[1])), "s-ref");
    if (REF.trap) polyline(plot, REF.trap.map((p) => P(p[0], p[1])), "s-reftrap");
  }

  // evenwichtslijn (fijn bemonsterd in het zichtvenster)
  const n = 500, evPts = [];
  for (let i = 0; i <= n; i++) { const x = lo + (hi - lo) * i / n; evPts.push([x, ev.y(x)]); }
  polyline(plot, evPts.map((p) => P(p[0], p[1])), "s-ev");
  // pseudo-evenwichtslijn
  if (r.eta < 1 && r.rect && !r.pinchFout) {
    const ps = [];
    for (let i = 0; i <= n; i++) {
      const x = r.inp.xB + (r.inp.xD - r.inp.xB) * i / n; if (x < lo || x > hi) continue;
      const op = x >= r.xi ? r.rect : r.strip; ps.push(P(x, op(x) + r.eta * (ev.y(x) - op(x))));
    }
    polyline(plot, ps, "s-ps");
  }
  const { xD, xB, zF } = r.inp;
  r.xB = xB;

  // q-lijn
  if ($("#tQ").checked && r.pinchQ) {
    const xe = r.rect ? (Math.abs(r.q - 1) < 1e-9 ? zF : r.xi) : r.pinchQ.x;
    const x2 = (r.pinchQ && Math.abs(r.pinchQ.x - zF) > Math.abs(xe - zF)) ? r.pinchQ.x : xe;
    const qy = (x) => Math.abs(r.q - 1) < 1e-9 ? null : r.q / (r.q - 1) * x - zF / (r.q - 1);
    if (Math.abs(r.q - 1) < 1e-9) polyline(plot, [P(zF, zF), P(zF, Math.max(r.pinchQ.y, r.yi || 0))], "s-q");
    else polyline(plot, [P(zF, zF), P(x2, qy(x2))], "s-q");
  }
  // minimale reflux
  if ($("#tRmin").checked && r.Rmin !== undefined && isFinite(r.Rmin)) {
    const Rm = r.Rmin, b = xD / (Rm + 1);
    const pin = r.pinch;
    polyline(plot, [P(0, b), P(xD, xD)], "s-wlmin");
    if (pin.sectie !== "V0") el("circle", { cx: sx(pin.x), cy: sy(pin.y), r: 4.5, class: "s-pinch" }, plot);
    if (v.x0 <= 0.001) {
      el("circle", { cx: sx(0), cy: sy(b), r: 3.5, class: "s-pinch" }, plot);
      txt(plot, sx(0) + 8, sy(b) - 8, `x_D/(R_{D,min}+1) = ${f(b, 3)}`, "s-labz");
    }
  }
  // totale reflux
  if ($("#tTot").checked && r.totaal) {
    const pts = [P(xD, xD)]; let yp = xD;
    for (const t of r.totaal) { pts.push(P(t.x, yp)); pts.push(P(t.x, t.x)); yp = t.x; }
    polyline(plot, pts, "s-totaal");
  }
  // werklijnen
  if (r.rect) {
    polyline(plot, [P(r.xi, r.yi), P(xD, xD)], "s-wl");
    polyline(plot, [P(xB, xB), P(r.xi, r.yi)], "s-wl");
  }
  // trappen
  const tr = r.trappen || [];
  if (tr.length) {
    let yv = xD, xprev = xD;
    const nrs = $("#tNr").checked; let vorigLab = null;
    for (const t of tr) {
      const isFeed = t.n === r.voedingsplaat && !t.reb;
      const gT = el("g", {}, plot);
      el("title", {}, gT, t.reb ? `reboiler: x_B = ${fxPlain(t.x)}, y_b = ${fxPlain(t.yv === null ? ev.y(t.x) : t.yv)}` :
        `plaat ${t.n}${isFeed ? " (voedingsplaat)" : ""}: x = ${fxPlain(t.x)}, y = ${fxPlain(t.y)}`);
      const end = t.yv !== null ? t.yv : (r.strip ? r.strip(t.x) : t.x);
      polyline(gT, [P(xprev, t.y), P(t.x, t.y), P(t.x, end)], isFeed ? "s-trapfeed" : "s-trap");
      if (nrs) {
        const lab = t.reb ? "R" : String(t.n), lx = sx(t.x) - 3, ly = sy(t.y) - 4;
        const ver = !vorigLab || Math.hypot(lx - vorigLab[0], ly - vorigLab[1]) > 15;
        if (ver || t.reb || isFeed) { txt(plot, lx, ly, lab, isFeed ? "s-nrfeed" : "s-nr", "end"); vorigLab = [lx, ly]; }
      }
      xprev = t.x; yv = t.yv;
    }
    void yv;
  }
  // punten x_B, z_F, x_D
  for (const [x, lab] of [[xD, "x_D"], [zF, "z_F"], [xB, "x_B"]]) {
    if (x < v.x0 || x > v.x1 || x < v.y0 || x > v.y1) continue;
    el("circle", { cx: sx(x), cy: sy(x), r: 4, class: "s-punt" }, plot);
    const links = lab === "x_D";
    txt(plot, sx(x) + (links ? -8 : 6), sy(x) + (links ? (sy(x) < M.t + 24 ? 18 : -10) : 16), `${lab} = ${+x.toPrecision(4)}`, "s-labr", links ? "end" : "start");
  }
  if (ev.xaz !== null && ev.xaz >= v.x0 && ev.xaz <= v.x1) {
    el("circle", { cx: sx(ev.xaz), cy: sy(ev.xaz), r: 4, class: "s-pinch" }, plot);
    txt(plot, sx(ev.xaz) + 8, sy(ev.xaz) + 14, "azeotroop", "s-labz");
  }
  // info linksboven
  const info = el("g", {}, svg);
  let regels = [];
  if (r.nPlaten !== undefined && !r.fouten.length) {
    regels.push(`${r.nPlaten} ${S.eta < 1 ? "werkelijke" : "ideale"} platen + reboiler`);
    regels.push(r.voedingInReboiler ? "voeding in de reboiler" : `voeding op plaat ${r.voedingsplaat}`);
  } else if (r.fouten.length) regels.push("specificaties niet haalbaar");
  if (r.R > 0) regels.push(`R_D = ${f(r.R, 3)},  q = ${f(r.q, 3)}`);
  regels.forEach((t, i) => txt(info, M.l + 10, M.t + 18 + i * 16, t, "s-lab"));

  // legenda
  const lg = [`<span class="l-ev">evenwichtslijn</span>`, `<span class="l-wl">werklijnen</span>`, `<span class="l-q">q-lijn</span>`];
  if (r.eta < 1) lg.push(`<span class="l-ev l-ps">pseudo-evenwichtslijn (η<sub>M</sub>)</span>`);
  if ($("#tRmin").checked) lg.push(`<span class="l-q" style="color:var(--zacht)">werklijn bij R<sub>D,min</sub> (○ = pinch)</span>`);
  if ($("#tTot").checked) lg.push(`<span style="color:var(--groen)">totale reflux</span>`);
  if (REF) lg.push(`<span class="l-ref" style="color:var(--ref)">referentie: ${REF.label}</span>`);
  $("#legenda").innerHTML = lg.join("");
}
function fxPlain(v) { if (!isFinite(v)) return "–"; return Math.abs(v) < 0.001 ? v.toExponential(3) : v.toFixed(4); }

// zoom
function zoomNaar(soort) {
  document.querySelectorAll("[data-zoom]").forEach((b) => b.classList.toggle("aan", b.dataset.zoom === soort));
  const r = laatste;
  if (soort === "vol" || !r || !r.trappen || !r.trappen.length) { VIEW = null; tekenMT(r); return; }
  const tr = r.trappen, xD = r.inp.xD, xB = r.inp.xB;
  let pts;
  if (soort === "top") {
    const k = Math.min(tr.length, 4);
    pts = [[xD, xD]]; for (let i = 0; i < k; i++) pts.push([tr[i].x, tr[i].y]);
  } else {
    const k = Math.max(0, tr.length - 4);
    pts = [[xB, xB]]; for (let i = k; i < tr.length; i++) { pts.push([tr[i].x, tr[i].y]); if (tr[i].yv !== null) pts.push([tr[i].x, tr[i].yv]); }
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let x0 = Math.min(...xs, ...ys), x1 = Math.max(...xs, ...ys);
  const pad = (x1 - x0) * 0.12 || 0.01;
  x0 = Math.max(0, x0 - pad); x1 = Math.min(1, x1 + pad);
  VIEW = { x0, x1, y0: x0, y1: x1 };
  tekenMT(r);
}

function koppelZoom() {
  const svg = $("#mt");
  document.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => zoomNaar(b.dataset.zoom)));
  let start = null, rect = null;
  const naarData = (e) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const m = svg._map; if (!m) return null;
    const x = m.v.x0 + (p.x - M.l) / m.pw * (m.v.x1 - m.v.x0);
    const y = m.v.y0 + (M.t + m.ph - p.y) / m.ph * (m.v.y1 - m.v.y0);
    return { px: p.x, py: p.y, x, y };
  };
  svg.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; const d = naarData(e); if (!d) return; start = d; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", (e) => {
    const d = naarData(e); if (!d) return;
    if (d.x >= svg._map.v.x0 && d.x <= svg._map.v.x1 && d.y >= svg._map.v.y0 && d.y <= svg._map.v.y1)
      $("#leesuit").textContent = `x = ${fxPlain(d.x)},  y = ${fxPlain(d.y)}   ·   evenwicht bij deze x: y* = ${fxPlain(ev.y(Math.min(1, Math.max(0, d.x))))}`;
    if (start) {
      if (!rect) rect = el("rect", { class: "s-zoom" }, svg);
      rect.setAttribute("x", Math.min(start.px, d.px)); rect.setAttribute("y", Math.min(start.py, d.py));
      rect.setAttribute("width", Math.abs(d.px - start.px)); rect.setAttribute("height", Math.abs(d.py - start.py));
    }
  });
  svg.addEventListener("pointerup", (e) => {
    const d = naarData(e);
    if (start && d && Math.abs(d.px - start.px) > 8 && Math.abs(d.py - start.py) > 8) {
      VIEW = { x0: Math.max(0, Math.min(start.x, d.x)), x1: Math.min(1, Math.max(start.x, d.x)), y0: Math.max(0, Math.min(start.y, d.y)), y1: Math.min(1, Math.max(start.y, d.y)) };
      document.querySelectorAll("[data-zoom]").forEach((b) => b.classList.remove("aan"));
    }
    start = null; if (rect) { rect.remove(); rect = null; }
    tekenMT(laatste);
  });
  svg.addEventListener("dblclick", () => zoomNaar("vol"));
  ["tQ", "tRmin", "tTot", "tNr"].forEach((id) => $("#" + id).addEventListener("change", () => tekenMT(laatste)));
}

// ---------------------------------------------------------------- tabel
function tekenTabel(r) {
  const m = [];
  for (const t of r.fouten) m.push(`<div class="m-fout"><b>Niet haalbaar.</b> ${t}</div>`);
  for (const t of r.waarsch) m.push(`<div class="m-waarsch">${t}</div>`);
  for (const t of r.info) m.push(`<div class="m-info">${t}</div>`);
  if (false) m.push(`<div class="m-ok">Haalbaar: <b>${r.nPlaten} ${S.eta < 1 ? "werkelijke" : "ideale"} platen + reboiler</b>, voeding op ${r.voedingInReboiler ? "de reboiler" : "plaat " + r.voedingsplaat}.</div>`);
  $("#meldingen").innerHTML = m.join("");

  const ref = REF ? REF.r : null;
  const kol = (lab, key, d, eenh, nadruk) => {
    const val = typeof key === "function" ? key(r) : r[key];
    const rv = ref ? (typeof key === "function" ? key(ref) : ref[key]) : undefined;
    const fmt = (x) => typeof x === "string" ? x : f(x, d);
    return `<tr${nadruk ? ' class="nadruk"' : ""}><td>${lab}</td><td class="w">${fmt(val)}${eenh ? " " + eenh : ""}</td>${REF ? `<td class="r">${rv === undefined ? "–" : fmt(rv)}</td>` : ""}</tr>`;
  };
  const kop = (t) => `<table><thead><tr><th>${t}</th><th style="text-align:right">nu</th>${REF ? '<th style="text-align:right">ref.</th>' : ""}</tr></thead><tbody>`;
  const ok = (x) => !x.fouten.length;
  const t1 = kop("Debieten (kmol/h)") +
    kol("voeding F", (x) => x.inp.F, 2) + kol("topproduct D", "D", 2, "", true) + kol("bodemproduct B", "B", 2, "", true) +
    kol("L (rectificatie)", "L", 2) + kol("V (rectificatie)", "V", 2) +
    kol('<span class="ov">L</span> (stripping)', "Lb", 2) + kol('<span class="ov">V</span> (stripping)', "Vb", 2) + "</tbody></table>";
  const t2 = kop("Verhoudingen") +
    kol("R<sub>D</sub> = L/D", "R", 3, "", true) + kol("R<sub>D,min</sub>", "Rmin", 3, "", true) +
    kol("R<sub>D</sub>/R<sub>D,min</sub>", (x) => x.Rmin ? x.R / x.Rmin : NaN, 2) +
    kol("L/V", "LV", 3) + kol('<span class="ov">L</span>/<span class="ov">V</span>', "LbVb", 3) +
    kol("V<sub>B</sub> = <span class='ov'>V</span>/B", "VB", 3) + kol("V<sub>B,min</sub>", "VBmin", 3) +
    kol("q", "q", 3) + "</tbody></table>";
  const t3 = kop("Trappen") +
    kol("N<sub>min</sub> (totale reflux)", (x) => x.Nmin !== undefined ? `${x.Nmin} (${x.Nmin - 1} + reb.)` : "–", 0, "", true) +
    kol("N<sub>min</sub> fractioneel", "NminFrac", 2) +
    (ev.ideaalAlpha ? kol("N<sub>min</sub> Fenske", "Fenske", 2) : "") +
    kol(S.eta < 1 ? "werkelijke platen" : "ideale platen", (x) => ok(x) && x.nPlaten !== undefined ? String(x.nPlaten) + " + reboiler" : "–", 0, "", true) +
    kol("voedingsplaat", (x) => ok(x) && x.voedingsplaat ? (x.voedingInReboiler ? "reboiler" : String(x.voedingsplaat)) : "–", 0, "", true) +
    kol("fractie laatste trap", (x) => ok(x) ? x.fractieLaatste : NaN, 2) +
    kol("η<sub>M</sub>", "eta", 2) + "</tbody></table>";
  const t4 = kop("Energie en temperatuur") +
    kol("Q̇<sub>C</sub> condensor", (x) => ok(x) ? x.QC : NaN, 0, "kW") + kol("Q̇<sub>R</sub> reboiler", (x) => ok(x) ? x.QR : NaN, 0, "kW", true) +
    kol("Q̇<sub>R</sub>/D", (x) => ok(x) ? x.QR / x.D : NaN, 2, "kW·h/kmol") +
    (ev.T ? kol("T top (kookpunt x<sub>D</sub>)", "Ttop", 1, "°C") + kol("T bodem (kookpunt x<sub>B</sub>)", "Tbodem", 1, "°C") + kol("kookpunt voeding", "Tvoeding", 1, "°C") : "") +
    kol("y<sub>b</sub> (damp uit reboiler)", "yb", 4) +
    kol("λ condensor (x<sub>D</sub>)", (x) => x.inp ? x.inp.xD * x.inp.lambda[0] + (1 - x.inp.xD) * x.inp.lambda[1] : NaN, 2, "kJ/mol") +
    kol("λ reboiler (y<sub>b</sub>)", (x) => x.inp && isFinite(x.yb) ? x.yb * x.inp.lambda[0] + (1 - x.yb) * x.inp.lambda[1] : NaN, 2, "kJ/mol") + "</tbody></table>";
  $("#tabellen").innerHTML = t1 + t2 + t3 + t4;
  $("#tabellen").classList.toggle("metref", !!REF);

  // plaat per plaat
  const tr = r.trappen || [];
  let h = `<table><thead><tr><th style="text-align:left">trap</th><th>x<sub>n</sub></th><th>y<sub>n</sub></th><th>y<sub>n+1</sub> (werklijn)</th><th>y*<sub>n</sub> (evenwicht)</th></tr></thead><tbody>`;
  for (const t of tr) {
    h += `<tr${t.n === r.voedingsplaat && !t.reb ? ' class="nadruk"' : ""}><td style="text-align:left">${t.reb ? "reboiler" : t.n}${t.n === r.voedingsplaat && !t.reb ? " (voeding)" : ""}</td><td>${fx(t.x)}</td><td>${fx(t.reb ? ev.y(t.x) : t.y)}</td><td>${t.yv === null ? "–" : fx(t.yv)}</td><td>${fx(ev.y(t.x))}</td></tr>`;
  }
  h += "</tbody></table>";
  $("#platen").innerHTML = tr.length ? h : '<p class="klein">Geen trappen (specificaties niet haalbaar).</p>';
}

// ---------------------------------------------------------------- referentie, link, presets
function zetRefKnop(aan) {
  $("#refKnop").textContent = aan ? "Referentie wissen" : "Referentie vastzetten";
  $("#refKnop").classList.toggle("aan", aan);
}
function zetReferentie() {
  const r = laatste;
  if (REF) { REF = null; $("#refKnop").textContent = "Referentie vastzetten"; $("#refKnop").classList.remove("aan"); update(); return; }
  const evPts = []; for (let i = 0; i <= 600; i++) { const x = i / 600; evPts.push([x, ev.y(x)]); }
  const wl = r.rect ? [[[r.xi, r.yi], [r.inp.xD, r.inp.xD]], [[r.inp.xB, r.inp.xB], [r.xi, r.yi]]] : null;
  let trap = null;
  if (r.trappen && r.trappen.length) {
    trap = []; let xp = r.inp.xD;
    for (const t of r.trappen) { trap.push([xp, t.y], [t.x, t.y]); trap.push([t.x, t.yv !== null ? t.yv : (r.strip ? r.strip(t.x) : t.x)]); xp = t.x; }
  }
  const lab = r.nPlaten !== undefined && !r.fouten.length ? `${r.nPlaten} platen, R_D = ${f(r.R, 2)}` : "niet haalbaar";
  REF = { r, ev: evPts, evKey, wl, trap, label: lab.replace("R_D", "R<sub>D</sub>") };
  $("#refKnop").textContent = "Referentie wissen"; $("#refKnop").classList.add("aan");
  update();
}

const HASHVELDEN = ["sys", "alpha", "A12", "A21", "P", "F", "zF", "xD", "xB", "qMode", "q", "fV", "TF", "cpL", "cpV", "mode", "R", "Rfac", "VB", "eta", "vast", "voeding", "lamA", "lamB"];
const BHASH = ["sys", "alpha", "A12", "A21", "P", "lamA", "lamB", "W0", "x0", "xBe", "bmode", "N", "R", "xDdoel", "Vdeb"];
function schrijfHash() {
  if (MODUS === "batch") {
    const p = new URLSearchParams(); p.set("modus", "batch");
    const std = SYSTEMEN[BS.sys].lambda;
    for (const k of BHASH) if (BS[k] !== BSTD[k] && !(k === "lamA" && BS[k] === std[0]) && !(k === "lamB" && BS[k] === std[1])) p.set(k, typeof BS[k] === "number" ? +BS[k].toPrecision(6) : BS[k]);
    try { history.replaceState(null, "", "#" + p.toString()); } catch (e) { /* bv. sandbox */ }
    return;
  }
  const p = new URLSearchParams();
  const std = SYSTEMEN[S.sys].lambda;
  for (const k of HASHVELDEN) if (S[k] !== STANDAARD[k] && !(k === "lamA" && S[k] === std[0]) && !(k === "lamB" && S[k] === std[1])) p.set(k, typeof S[k] === "number" ? +S[k].toPrecision(6) : S[k]);
  const h = p.toString();
  try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch (e) { /* bv. sandbox */ }
}
function leesHash() {
  const h = location.hash.slice(1); if (!h) return;
  const p = new URLSearchParams(h);
  if (p.get("modus") === "batch") {
    MODUS = "batch";
    for (const k of BHASH) if (p.has(k)) { const v = p.get(k); BS[k] = typeof BSTD[k] === "number" ? parseFloat(v) : v; }
    if (!SYSTEMEN[BS.sys]) BS.sys = BSTD.sys;
    const sb = SYSTEMEN[BS.sys].lambda;
    if (!p.has("lamA")) BS.lamA = sb[0];
    if (!p.has("lamB")) BS.lamB = sb[1];
    return;
  }
  for (const k of HASHVELDEN) if (p.has(k)) {
    const v = p.get(k);
    S[k] = typeof STANDAARD[k] === "number" ? parseFloat(v) : typeof STANDAARD[k] === "boolean" ? v === "true" : v;
  }
  if (!SYSTEMEN[S.sys]) S.sys = STANDAARD.sys;
  const std = SYSTEMEN[S.sys].lambda;
  if (!p.has("lamA")) S.lamA = p.has("lam") ? parseFloat(p.get("lam")) : std[0];
  if (!p.has("lamB")) S.lamB = p.has("lam") ? parseFloat(p.get("lam")) : std[1];
}

// ---------------------------------------------------------------- kerncijfers en tabbladen
let actieveTab = "mt";
function tekenKern(r) {
  const ok = !r.fouten.length && r.nPlaten !== undefined;
  const ref = REF ? REF.r : null;
  const refOk = ref && !ref.fouten.length && ref.nPlaten !== undefined;
  const chip = (l, v, rv, cls) => `<div class="chip${cls ? " " + cls : ""}"><span class="l">${l}</span><span class="v">${v}</span>${REF ? `<span class="ref">ref. ${rv}</span>` : ""}</div>`;
  const pl = (x, o) => o ? `${x.nPlaten} <small>+ reb.</small>` : "–";
  const vp = (x, o) => o ? (x.voedingInReboiler ? "reboiler" : x.voedingsplaat) : "–";
  const fac = (x) => x.Rmin > 0 && isFinite(x.R / x.Rmin) ? f(x.R / x.Rmin, 2) : "–";
  const nm = (x) => x.Nmin !== undefined ? `${x.Nmin - 1} <small>+ reb.</small>` : "–";
  const pls = ok ? (S.eta < 1 ? "werkelijke platen" : "ideale platen") : "platen";
  $("#kern").innerHTML =
    `<div class="status ${ok ? "ok" : "nok"}">${ok ? "Haalbaar" : "Niet haalbaar"}</div>` +
    chip(pls, pl(r, ok), refOk ? ref.nPlaten : "–") +
    chip("voedingsplaat", vp(r, ok), refOk ? vp(ref, true) : "–") +
    chip("R<sub>D</sub>", f(r.R, 2), ref ? f(ref.R, 2) : "") +
    chip("R<sub>D,min</sub>", f(r.Rmin, 2), ref ? f(ref.Rmin, 2) : "") +
    chip("R<sub>D</sub>/R<sub>D,min</sub>", fac(r), ref ? fac(ref) : "") +
    chip("N<sub>min</sub>", nm(r), ref ? (ref.Nmin !== undefined ? ref.Nmin - 1 : "–") : "") +
    chip("D <small>kmol/h</small>", f(r.D, 1), ref ? f(ref.D, 1) : "") +
    chip("B <small>kmol/h</small>", f(r.B, 1), ref ? f(ref.B, 1) : "") +
    chip("Q̇<sub>R</sub> <small>kW</small>", ok ? f(r.QR, 0) : "–", refOk ? f(ref.QR, 0) : "–", "warm");
  zetKernHoogte();
}
function zetKernHoogte() {
  const h = $(MODUS === "batch" ? "#bkern" : "#kern").getBoundingClientRect().height;
  document.documentElement.style.setProperty("--kernH", h + "px");
}
function koppelTabs() {
  document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
    actieveTab = b.dataset.tab;
    document.querySelectorAll(".tabs [data-tab]").forEach((x) => { x.classList.toggle("aan", x === b); x.setAttribute("aria-selected", x === b); });
    for (const t of ["mt", "txy", "rfx"]) $("#tab-" + t).hidden = t !== actieveTab;
    if (actieveTab === "txy") tekenTxy(laatste);
    if (actieveTab === "rfx") tekenReflux(laatste);
    if (actieveTab === "mt") tekenMT(laatste);
  }));
  window.addEventListener("resize", zetKernHoogte);
}

function zetLambdaStd() { const l = SYSTEMEN[S.sys].lambda; S.lamA = l[0]; S.lamB = l[1]; }

let MODUS = "continu";
function vulPresets() {
  const lijst = MODUS === "batch" ? BPRESETS : PRESETS;
  $("#preset").innerHTML = '<option value="">— voorbeeld of oefening —</option>' + lijst.map((p, i) => `<option value="${i}">${p.naam}</option>`).join("");
}
function zetModus(m) {
  MODUS = m;
  document.querySelectorAll("#modusTabs [data-modus]").forEach((b) => { b.classList.toggle("aan", b.dataset.modus === m); b.setAttribute("aria-pressed", b.dataset.modus === m); });
  $("#main-continu").hidden = m !== "continu"; $("#kern").hidden = m !== "continu";
  $("#main-batch").hidden = m !== "batch"; $("#bkern").hidden = m !== "batch";
  $(".sub").textContent = m === "batch" ? "Batchdestillatie: Rayleigh, constante reflux of constante topsamenstelling" : "Binaire destillatie volgens McCabe-Thiele";
  vulPresets();
  zetRefKnop(m === "batch" ? !!BREF : !!REF);
  if (m === "batch") bUpdate(); else update();
}
function init() {
  const ps = $("#preset");
  ps.addEventListener("change", () => {
    if (ps.value === "") return;
    if (MODUS === "batch") {
      BS = Object.assign({}, BSTD, BPRESETS[+ps.value].s);
      if (!("lamA" in BPRESETS[+ps.value].s)) { const l = SYSTEMEN[BS.sys].lambda; BS.lamA = l[0]; BS.lamB = l[1]; }
      bSync(); bUpdate(); ps.value = ""; return;
    }
    S = Object.assign({}, STANDAARD, PRESETS[+ps.value].s); zetLambdaStd(); VIEW = null;
    document.querySelectorAll("[data-zoom]").forEach((b) => b.classList.toggle("aan", b.dataset.zoom === "vol"));
    syncInvoer(); update(); ps.value = "";
  });
  document.querySelectorAll("#modusTabs [data-modus]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.modus !== MODUS) zetModus(b.dataset.modus); }));
  $("#refKnop").addEventListener("click", () => (MODUS === "batch" ? bZetReferentie() : zetReferentie()));
  $("#linkKnop").addEventListener("click", async () => {
    schrijfHash();
    const url = location.href;
    try { await navigator.clipboard.writeText(url); $("#linkKnop").textContent = "Link gekopieerd ✓"; }
    catch (e) { prompt("Kopieer deze link:", url); }
    setTimeout(() => { $("#linkKnop").textContent = "Link kopiëren"; }, 1800);
  });
  leesHash();
  bouwInvoer();
  koppelZoom();
  koppelTabs();
  koppelReflux();
  bouwBatchInvoer();
  koppelBatch();
  const m = MODUS; MODUS = "continu"; update();
  zetModus(m);
}
init();
