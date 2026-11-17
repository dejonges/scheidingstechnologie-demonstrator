"use strict";
// =====================================================================
// Extra diagrammen: T-x-y en platen/energie versus reflux
// =====================================================================
function asStap(span, n) { const raw = span / n, e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; }
function decVan(g) { return Math.max(0, -Math.floor(Math.log10(g) + 1e-9)); }

function assenKader(svg, W, H, Mg, xr, yr, xlab, ylab, opts = {}) {
  const pw = W - Mg.l - Mg.r, ph = H - Mg.t - Mg.b;
  const sx = (x) => Mg.l + (x - xr[0]) / (xr[1] - xr[0]) * pw;
  const sy = (y) => Mg.t + ph - (y - yr[0]) / (yr[1] - yr[0]) * ph;
  const gx = opts.gx || asStap(xr[1] - xr[0], 8), gy = opts.gy || asStap(yr[1] - yr[0], 7);
  for (let t = Math.ceil(xr[0] / gx - 1e-9) * gx; t <= xr[1] + 1e-9; t += gx) {
    el("line", { x1: sx(t), x2: sx(t), y1: Mg.t, y2: Mg.t + ph, class: "s-grid" }, svg);
    el("text", { x: sx(t), y: Mg.t + ph + 15, class: "s-tick", "text-anchor": "middle" }, svg, t.toFixed(decVan(gx)));
  }
  for (let t = Math.ceil(yr[0] / gy - 1e-9) * gy; t <= yr[1] + 1e-9; t += gy) {
    el("line", { x1: Mg.l, x2: Mg.l + pw, y1: sy(t), y2: sy(t), class: "s-grid" }, svg);
    el("text", { x: Mg.l - 6, y: sy(t) + 4, class: opts.ylCls || "s-tick", "text-anchor": "end" }, svg, t.toFixed(decVan(gy)));
  }
  el("path", { d: `M ${Mg.l} ${Mg.t} L ${Mg.l} ${Mg.t + ph} L ${Mg.l + pw} ${Mg.t + ph}`, class: "s-as" }, svg);
  txt(svg, Mg.l + pw / 2, H - 6, xlab, "s-astitel", "middle");
  const g = el("g", { transform: `translate(14 ${Mg.t + ph / 2}) rotate(-90)` }, svg);
  txt(g, 0, 0, ylab, opts.ytCls || "s-astitel", "middle");
  return { sx, sy, pw, ph };
}

// ---------------------------------------------------------------- T-x-y
function tekenTxy(r) {
  const svg = $("#txy"); svg.innerHTML = "";
  const W = 520, H = 400, Mg = { l: 56, r: 14, t: 14, b: 44 };
  const s = SYSTEMEN[S.sys];
  if (!ev.T) {
    txt(svg, W / 2, H / 2 - 8, "Geen temperaturen bij een systeem met constante α.", "s-lab", "middle");
    txt(svg, W / 2, H / 2 + 12, "Kies een systeem met Antoine-gegevens (bv. benzeen – tolueen).", "s-labz", "middle");
    $("#txyUitleg").innerHTML = "";
    return;
  }
  const evT = ev.tModel || ev;     // meetgegevens: temperaturen uit het model
  const n = 300, kook = [], dauw = [];
  for (let i = 0; i <= n; i++) { const x = i / n, T = evT.T(x); kook.push([x, T]); dauw.push([evT.y(x), T]); }
  let Tmin = Math.min(...kook.map((p) => p[1])), Tmax = Math.max(...kook.map((p) => p[1]));
  const pad = (Tmax - Tmin) * 0.08 + 0.5; Tmin -= pad; Tmax += pad;
  if (S.qMode === "T") { Tmin = Math.min(Tmin, S.TF - 2); Tmax = Math.max(Tmax, S.TF + 2); }
  const A = assenKader(svg, W, H, Mg, [0, 1], [Tmin, Tmax], `x, y  (molfractie ${s.c1})`, "T  (°C)", { gx: 0.1 });
  const P = (x, T) => [A.sx(x), A.sy(T)];
  polyline(svg, kook.map((p) => P(p[0], p[1])), "s-ev");
  polyline(svg, dauw.map((p) => P(p[0], p[1])), "s-wl");
  // labels van de lijnen
  const xl = 0.62;
  txt(svg, A.sx(xl) - 6, A.sy(evT.T(xl)) + 22, "kooklijn (vloeistof)", "s-lab", "end").setAttribute("style", "fill:var(--blauw)");
  const xl2 = 0.3, yl = evT.y(xl2);
  txt(svg, A.sx(yl) + 6, A.sy(evT.T(xl2)) - 8, "dauwlijn (damp)", "s-lab").setAttribute("style", "fill:var(--rood)");
  // plaattemperaturen
  const tr = r.trappen || [];
  if (tr.length && !r.fouten.length) {
    let vorig = null;
    for (const t of tr) {
      const T = evT.T(t.x), isFeed = t.n === r.voedingsplaat && !t.reb;
      el("circle", { cx: A.sx(t.x), cy: A.sy(T), r: isFeed ? 4.2 : 3, class: isFeed ? "m-paars" : "m-blauw" }, svg);
      const lab = t.reb ? "R" : String(t.n), lx = A.sx(t.x) + 5, ly = A.sy(T) + 12;
      if (!vorig || Math.hypot(lx - vorig[0], ly - vorig[1]) > 14 || t.reb || isFeed) {
        txt(svg, lx, ly, lab, isFeed ? "s-nrfeed" : "s-nr"); vorig = [lx, ly];
      }
    }
  }
  // voeding, producten, azeotroop
  const { xD, xB, zF } = r.inp;
  for (const [x, lab] of [[xD, "x_D"], [xB, "x_B"]]) {
    el("circle", { cx: A.sx(x), cy: A.sy(evT.T(x)), r: 4.5, class: "s-punt" }, svg);
    txt(svg, A.sx(x) + (x > 0.5 ? -8 : 8), A.sy(evT.T(x)) - 8, `${lab}: ${f(evT.T(x), 1)} °C`, "s-labr", x > 0.5 ? "end" : "start");
  }
  const Tb = evT.T(zF), Td = evT.Tdauw(zF);
  polyline(svg, [P(zF, Tmin), P(zF, Tmax)], "s-q");
  txt(svg, A.sx(zF) + 5, A.sy(Tmax) + 14, "z_F", "s-lab");
  if (S.qMode === "T") {
    el("circle", { cx: A.sx(zF), cy: A.sy(S.TF), r: 5, class: "m-paars" }, svg);
    txt(svg, A.sx(zF) + 8, A.sy(S.TF) + 4, `voeding T_F = ${f(S.TF, 1)} °C`, "s-lab");
  }
  if (ev.xaz !== null) {
    el("circle", { cx: A.sx(ev.xaz), cy: A.sy(evT.T(ev.xaz)), r: 4, class: "s-pinch" }, svg);
    txt(svg, A.sx(ev.xaz), A.sy(evT.T(ev.xaz)) + 18, "azeotroop", "s-labz", "middle");
  }
  $("#txyUitleg").innerHTML = `Bij ${f(S.sys.endsWith("data") ? 101.325 : S.P, 1)} kPa. Voeding: kookpunt ${f(Tb, 1)} °C, dauwpunt ${f(Td, 1)} °C.` +
    (tr.length && !r.fouten.length ? ` Blauwe punten: vloeistof op elke plaat (T op de kooklijn); de temperatuur stijgt van top (${f(r.Ttop, 1)} °C) naar bodem (${f(r.Tbodem, 1)} °C).` : "") +
    (ev.tModel ? " Temperaturen uit het UNIFAC-model, de xy-curve uit de meetgegevens." : "");
}

// ---------------------------------------------------------------- platen en energie versus reflux
let _refluxTimer = null;
function planRefluxGrafiek(r) {
  clearTimeout(_refluxTimer);
  _refluxTimer = setTimeout(() => tekenReflux(r), 120);
}
function tekenReflux(r) {
  const svg = $("#rfx"); svg.innerHTML = "";
  const W = 520, H = 400, Mg = { l: 56, r: 62, t: 14, b: 44 };
  if (r.Rmin === undefined || !isFinite(r.Rmin) || r.azeoBlok) {
    txt(svg, W / 2, H / 2, "Niet beschikbaar: de specificaties zijn niet haalbaar.", "s-lab", "middle");
    $("#rfxUitleg").innerHTML = ""; svg._rfx = null; return;
  }
  const Rm = Math.max(r.Rmin, 1e-3), Rcur = r.R;
  const fmax = Math.max(4, isFinite(Rcur) ? 1.25 * Rcur / Rm : 0);
  const pts = [];
  const nP = 46;
  for (let i = 0; i <= nP; i++) {
    const fac = 1.03 * Math.pow(fmax / 1.03, i / nP), R = Rm * fac;
    const o = bereken(ev, Object.assign({}, r.inp, { mode: "R", R, voeding: 0, RminBekend: { Rmin: r.Rmin, pinch: r.pinch } }));
    if (o.fouten.length || o.nPlaten === undefined) continue;
    pts.push({ R, N: o.nPlaten, QR: o.QR, QC: o.QC });
  }
  if (pts.length < 2) { txt(svg, W / 2, H / 2, "Geen haalbare punten.", "s-lab", "middle"); return; }
  const Nmax = Math.max(...pts.map((p) => p.N)), Nlo = Math.max(0, (r.Nmin || 1) - 1);
  const Nhi = Math.min(Nmax, Math.max(4 * (r.Nmin || 5), (r.nPlaten || 0) * 1.6, 15));
  const Qmax = Math.max(...pts.map((p) => p.QR)) * 1.05;
  const xr = [0, Rm * fmax], yr = [Nlo, Nhi];
  const A = assenKader(svg, W, H, Mg, xr, yr, "refluxverhouding R_D", "aantal platen (+ reboiler)", {});
  const sq = (Q) => Mg.t + A.ph - Q / Qmax * A.ph;
  // rechteras Q_R
  const gq = asStap(Qmax, 6);
  el("line", { x1: Mg.l + A.pw, x2: Mg.l + A.pw, y1: Mg.t, y2: Mg.t + A.ph, class: "s-as" }, svg);
  for (let t = 0; t <= Qmax + 1e-9; t += gq) el("text", { x: Mg.l + A.pw + 6, y: sq(t) + 4, class: "s-tick", style: "fill:var(--oranje)" }, svg, t.toFixed(decVan(gq)));
  const gr = el("g", { transform: `translate(${W - 10} ${Mg.t + A.ph / 2}) rotate(90)` }, svg);
  txt(gr, 0, 0, "Q̇_R reboiler (kW)", "s-astitel", "middle").setAttribute("style", "fill:var(--oranje)");
  const defs = el("defs", {}, svg), cp = el("clipPath", { id: "clipRfx" }, defs);
  el("rect", { x: Mg.l, y: Mg.t, width: A.pw, height: A.ph }, cp);
  const plot = el("g", { "clip-path": "url(#clipRfx)" }, svg);
  // R_min en N_min
  polyline(plot, [[A.sx(Rm), Mg.t], [A.sx(Rm), Mg.t + A.ph]], "s-wlmin");
  txt(plot, A.sx(Rm) + 4, Mg.t + 14, `R_{D,min} = ${f(Rm, 2)}`, "s-labz");
  if (r.Nmin) {
    polyline(plot, [[Mg.l, A.sy(r.Nmin - 1)], [Mg.l + A.pw, A.sy(r.Nmin - 1)]], "s-totaal");
    txt(plot, Mg.l + A.pw - 4, A.sy(r.Nmin - 1) - 8, `N_min: ${r.Nmin - 1} ideale platen + reboiler`, "s-labz", "end");
  }
  // trapjeslijn voor het aantal platen
  const stp = [];
  pts.forEach((p, i) => { if (i) stp.push([A.sx(p.R), A.sy(pts[i - 1].N)]); stp.push([A.sx(p.R), A.sy(p.N)]); });
  polyline(plot, stp, "s-trap");
  polyline(plot, pts.map((p) => [A.sx(p.R), sq(p.QR)]), "s-warm");
  // huidige toestand
  if (isFinite(Rcur) && !r.fouten.length) {
    polyline(plot, [[A.sx(Rcur), Mg.t], [A.sx(Rcur), Mg.t + A.ph]], "s-q");
    el("circle", { cx: A.sx(Rcur), cy: A.sy(r.nPlaten), r: 5, class: "s-punt" }, plot);
    el("circle", { cx: A.sx(Rcur), cy: sq(r.QR), r: 5, class: "m-oranje" }, plot);
    txt(plot, A.sx(Rcur) - 8, A.sy(r.nPlaten) + 16, `${r.nPlaten} platen`, "s-labr", "end");
    txt(plot, A.sx(Rcur) + 8, sq(r.QR) - 8, `${f(r.QR, 0)} kW`, "s-lab").setAttribute("style", "fill:var(--oranje)");
  }
  svg._rfx = { A, Mg, xr };
  const opt = r.Rmin ? `R<sub>D</sub>/R<sub>D,min</sub> = ${f(r.R / r.Rmin, 2)}` : "";
  $("#rfxUitleg").innerHTML = `Telkens met optimale voedingsplaat${S.eta < 1 ? ` en η<sub>M</sub> = ${f(S.eta, 2)}` : ""}. Nu: ${opt}. ` +
    "Dichtbij R<sub>D,min</sub> loopt het aantal platen naar oneindig, bij hoge reflux nadert het N<sub>min</sub> terwijl Q̇<sub>R</sub> lineair blijft stijgen: het economische optimum ligt meestal rond 1.2 à 1.5 R<sub>D,min</sub>. Klik in de grafiek om die R<sub>D</sub> te kiezen.";
}
function koppelReflux() {
  const svg = $("#rfx");
  svg.addEventListener("click", (e) => {
    const m = svg._rfx; if (!m) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const R = m.xr[0] + (p.x - m.Mg.l) / m.A.pw * (m.xr[1] - m.xr[0]);
    if (!(R > 0)) return;
    S.mode = "R"; S.R = +R.toPrecision(3); syncInvoer(); update();
  });
}
