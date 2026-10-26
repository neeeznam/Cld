// @ts-nocheck
/* ASHRAE / SMACNA koeficijenti lokalnih otpora — preneseno iz artefakta "Kanalski pad pritiska" (tabele i ispravke nepromijenjene). */
// ===== Interpolacija i pomoćne funkcije =====
const N = null;
function fmt(x, d = 2) { return (x == null || !isFinite(x)) ? '—' : Number(x).toFixed(d); }

// 1D linearna interpolacija; null tačke se preskaču; van opsega -> granična vrijednost + upozorenje
function interp1(xs, ys, x, w, lbl) {
  const P = [];
  for (let i = 0; i < xs.length; i++) if (ys[i] != null && isFinite(ys[i])) P.push([xs[i], ys[i]]);
  if (!P.length) { w && w.push('Nema podataka u tabeli za ' + (lbl || 'parametar')); return NaN; }
  if (x <= P[0][0]) { if (x < P[0][0] - 1e-9 && w) w.push((lbl || 'x') + ' = ' + fmt(x, 3) + ' ispod opsega tabele (min ' + P[0][0] + ') — uzeta granična vrijednost'); return P[0][1]; }
  const L = P[P.length - 1];
  if (x >= L[0]) { if (x > L[0] + 1e-9 && w) w.push((lbl || 'x') + ' = ' + fmt(x, 3) + ' iznad opsega tabele (max ' + L[0] + ') — uzeta granična vrijednost'); return L[1]; }
  for (let i = 1; i < P.length; i++) if (x <= P[i][0]) {
    const [x0, y0] = P[i - 1], [x1, y1] = P[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return L[1];
}
// indeksi redova koji okružuju vrijednost r (samo oni se računaju, pa upozorenja važe za stvarno korišćene redove)
function bracket(keys, r, w, lbl) {
  if (r <= keys[0]) { if (r < keys[0] - 1e-9 && w) w.push((lbl || 'x') + ' = ' + fmt(r, 3) + ' ispod opsega tabele (min ' + keys[0] + ') — uzeta granična vrijednost'); return [0]; }
  const n = keys.length - 1;
  if (r >= keys[n]) { if (r > keys[n] + 1e-9 && w) w.push((lbl || 'x') + ' = ' + fmt(r, 3) + ' iznad opsega tabele (max ' + keys[n] + ') — uzeta granična vrijednost'); return [n]; }
  for (let i = 1; i <= n; i++) if (r <= keys[i]) return [i - 1, i];
  return [n];
}
function blend(keys, idx, vals, r) {
  if (idx.length === 1) return vals[0];
  const [a, b] = idx, [va, vb] = vals;
  if (va == null || !isFinite(va)) return vb; if (vb == null || !isFinite(vb)) return va;
  return va + (vb - va) * (r - keys[a]) / (keys[b] - keys[a]);
}
// 2D: interpolacija po kolonama u dva susjedna reda, pa između redova
function interp2(rk, ck, Z, r, c, w, rl, cl) {
  const idx = bracket(rk, r, w, rl);
  const vals = idx.map(i => Z[i].some(v => v != null) ? interp1(ck, Z[i], c, w, cl) : null);
  const v = blend(rk, idx, vals, r);
  if (v == null || !isFinite(v)) { w && w.push('Tabela nema podatak za ovu kombinaciju'); return NaN; }
  return v;
}
// tabela sa kombinacijama (Ab/As, Ab/Ac) -> najbliži red
function nearestCombo(combos, p1, p2, w, n1, n2) {
  let best = 0, bd = 1e9;
  combos.forEach((cb, i) => { const d = Math.abs(Math.log(cb[0] / p1)) + Math.abs(Math.log(cb[1] / p2)); if (d < bd) { bd = d; best = i; } });
  const cb = combos[best];
  if (bd > 0.08 && w) w.push('Tabela ima samo diskretne kombinacije ' + n1 + '/' + n2 + '. Stvarno ' + fmt(p1) + ' / ' + fmt(p2) + ' → korišćen najbliži red ' + cb[0] + ' / ' + cb[1]);
  return best;
}
const KTH = { x: [0, 20, 30, 45, 60, 75, 90, 110, 130, 150, 180], y: [0, 0.31, 0.45, 0.60, 0.78, 0.90, 1.00, 1.13, 1.20, 1.28, 1.40] };
function Kth(th, w) { return interp1(KTH.x, KTH.y, th, w, 'θ'); }
const KRE = { x: [1, 2, 3, 4, 6, 8, 10, 14], y: [1.40, 1.26, 1.19, 1.14, 1.09, 1.06, 1.04, 1.0] };
function KRe(Re) { return interp1(KRE.x, KRE.y, Re / 1e4, null); }
const FPM = 0.00508; // ft/min -> m/s
// dimenzija u ravni skretanja
function planeDims(sec, p) { // vraća {W (u ravni), H (upravno)}
  if (sec.shape === 'round') return { W: sec.D, H: sec.D };
  return p.ravan === 'b' ? { W: sec.b, H: sec.a } : { W: sec.a, H: sec.b };
}
const P_RAVAN = { k: 'ravan', l: 'Skretanje u ravni', t: 'sel', d: 'a', o: [['a', 'širine a (horiz.)'], ['b', 'visine b (vert.)']] };
const P_TH = (d = 90) => ({ k: 'th', l: 'Ugao θ', u: '°', t: 'num', d });
// ===== 1 ULAZI, 2 IZLAZI =====
const F = [];
const TH10 = [0, 10, 20, 30, 45, 60, 90, 120, 150, 180];
F.push(
{ id: '1-1', n: 'Ulaz — kanal ugrađen u zid (neprirubljen / prirubljen)', cat: 'ulaz', cls: 'local', shape: 'any',
  p: [{ k: 't', l: 'Debljina zida kanala t', u: 'mm', t: 'num', d: 1 }, { k: 'L', l: 'Isturenost kanala L', u: 'mm', t: 'num', d: 0 }],
  calc(p, g, w) { const D = g.up.Dh; return interp2([0, 0.02, 0.05], [0, 0.002, 0.01, 0.05, 0.2, 0.5, 1.0],
    [[0.50, 0.57, 0.68, 0.80, 0.92, 1.0, 1.0], [0.50, 0.51, 0.52, 0.55, 0.66, 0.72, 0.72], [0.50, 0.50, 0.50, 0.50, 0.50, 0.50, 0.50]],
    p.t / D, p.L / D, w, 't/D', 'L/D'); } },
{ id: '1-2', n: 'Ulaz — zaobljeni usis (bellmouth) bez zida', cat: 'ulaz', cls: 'local', shape: 'any',
  p: [{ k: 'r', l: 'Radijus zaobljenja r', u: 'mm', t: 'num', d: 20 }],
  calc(p, g, w) { return interp1([0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.16, 0.20], [1.0, 0.87, 0.74, 0.61, 0.51, 0.40, 0.32, 0.20, 0.15, 0.10, 0.06, 0.03], p.r / g.up.Dh, w, 'r/D'); } },
{ id: '1-3', n: 'Ulaz — zaobljeni usis (bellmouth) sa zidom', cat: 'ulaz', cls: 'local', shape: 'any',
  p: [{ k: 'r', l: 'Radijus zaobljenja r', u: 'mm', t: 'num', d: 20 }],
  calc(p, g, w) { return interp1([0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.16, 0.20], [0.50, 0.44, 0.37, 0.31, 0.26, 0.22, 0.20, 0.15, 0.12, 0.09, 0.06, 0.03], p.r / g.up.Dh, w, 'r/D'); } },
{ id: '1-4', n: 'Ulaz — konusni usis bez zida', cat: 'ulaz', cls: 'local', shape: 'any',
  p: [P_TH(60), { k: 'L', l: 'Dužina konusa L', u: 'mm', t: 'num', d: 50 }],
  calc(p, g, w) { return interp2([0.025, 0.05, 0.10, 0.25, 0.60, 1.0], TH10, [
    [1.0, 0.96, 0.93, 0.90, 0.85, 0.80, 0.72, 0.64, 0.57, 0.50], [1.0, 0.93, 0.86, 0.80, 0.73, 0.67, 0.60, 0.56, 0.52, 0.50],
    [1.0, 0.80, 0.67, 0.55, 0.46, 0.41, 0.41, 0.43, 0.46, 0.50], [1.0, 0.68, 0.45, 0.30, 0.21, 0.17, 0.21, 0.28, 0.38, 0.50],
    [1.0, 0.46, 0.27, 0.18, 0.14, 0.13, 0.19, 0.27, 0.37, 0.50], [1.0, 0.32, 0.20, 0.14, 0.11, 0.10, 0.16, 0.24, 0.35, 0.50]],
    p.L / g.up.Dh, p.th, w, 'L/D', 'θ'); } },
{ id: '1-5', n: 'Ulaz — konusni usis sa zidom', cat: 'ulaz', cls: 'local', shape: 'any',
  p: [P_TH(60), { k: 'L', l: 'Dužina konusa L', u: 'mm', t: 'num', d: 50 }],
  calc(p, g, w) { return interp2([0.025, 0.05, 0.075, 0.10, 0.15, 0.60], TH10, [
    [0.50, 0.47, 0.45, 0.43, 0.41, 0.40, 0.42, 0.44, 0.46, 0.50], [0.50, 0.45, 0.41, 0.36, 0.32, 0.30, 0.34, 0.39, 0.44, 0.50],
    [0.50, 0.42, 0.35, 0.30, 0.25, 0.23, 0.28, 0.35, 0.43, 0.50], [0.50, 0.39, 0.32, 0.25, 0.21, 0.18, 0.25, 0.33, 0.41, 0.50],
    [0.50, 0.37, 0.27, 0.20, 0.16, 0.15, 0.23, 0.31, 0.40, 0.50], [0.50, 0.27, 0.18, 0.13, 0.11, 0.12, 0.20, 0.30, 0.40, 0.50]],
    p.L / g.up.Dh, p.th, w, 'L/D', 'θ'); } },
{ id: '1-6', n: 'Usisna hauba (kapa) na krovu', cat: 'ulaz', cls: 'local', shape: 'round',
  p: [{ k: 'th', l: 'Ugao konusa θ', u: '°', t: 'sel', d: '15', o: [['0', '0°'], ['15', '15°']] }, { k: 'L', l: 'Razmak L (kapa–kanal)', u: 'mm', t: 'num', d: 100 }],
  calc(p, g, w) { return interp2([0, 15], [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 4.0],
    [[2.63, 1.83, 1.53, 1.39, 1.31, 1.19, 1.08, 1.06, 1.0], [1.32, 0.77, 0.60, 0.48, 0.41, 0.30, 0.28, 0.25, 0.25]], +p.th, p.L / g.up.Dh, w, 'θ', 'L/D'); } },
{ id: '1-7', n: 'Hauba konusna (napa), A1 ≥ 2Ao', cat: 'ulaz', cls: 'local', shape: 'any',
  p: [P_TH(60)],
  calc(p, g, w) { const x = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180];
    return g.up.shape === 'round' ? interp1(x, [1.0, 0.11, 0.06, 0.09, 0.14, 0.18, 0.27, 0.32, 0.43, 0.50], p.th, w, 'θ')
      : interp1(x, [1.0, 0.19, 0.13, 0.16, 0.21, 0.27, 0.33, 0.43, 0.53, 0.62], p.th, w, 'θ'); } },
{ id: '1-8', n: 'Ulaz sa oštroivičnim otvorom (blendom)', cat: 'ulaz', cls: 'local', shape: 'any',
  p: [{ k: 'r', l: 'Odnos Aor/Ao', t: 'num', d: 0.6 }],
  calc(p, g, w) { return interp2([4, 10, 20, 100], [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    [[45, 18, 7.9, 3.9, 2.3, 1.3, 0.83, 0.51], [49, 20, 9.2, 4.4, 2.7, 1.5, 0.96, 0.59], [50, 21, 9.3, 4.9, 2.9, 1.6, 1.1, 0.65], [55, 23, 11.0, 5.6, 3.3, 1.9, 1.2, 0.75]],
    g.up.Re / 1000, p.r, w, 'Re·10⁻³', 'Aor/Ao'); } },
// ---- IZLAZI ----
{ id: '2-1', n: 'Izlaz — nagli, u atmosferu/prostor (ravnomjeran profil)', cat: 'izlaz', cls: 'local', shape: 'any', p: [],
  note: 'Co = 1,0: cio dinamički pritisak se gubi. Ne dodavati ako kataloški Δp rešetke/difuzora već sadrži izlaz (Δp_t).',
  calc() { return 1.0; } },
{ id: '2-2', n: 'Izlaz — nagli, sa završnom pločom (zidom)', cat: 'izlaz', cls: 'local', shape: 'any', p: [], calc() { return 0.88; } },
{ id: '2-3', n: 'Izlaz u ravni zida, uz strujanje duž zida', cat: 'izlaz', cls: 'local', shape: 'any',
  p: [P_TH(90), { k: 'V', l: 'Brzina vazduha duž zida V', u: 'm/s', t: 'num', d: 0 }],
  calc(p, g, w) { const c = [0, 0.5, 1.0, 1.5, 2.0], x = p.V / g.up.v;
    const G2 = [[45, 60, 90, 120, 150], [[1.0, 1.0, 1.1, 1.3, 1.6], [1.0, 0.90, 1.1, 1.4, 1.6], [1.0, 0.80, 0.95, 1.4, 1.7], [1.0, 0.80, 0.95, 1.3, 1.7], [1.0, 0.82, 0.83, 1.0, 1.3]]];
    if (g.up.shape === 'round') return interp2(G2[0], c, G2[1], p.th, x, w, 'θ', 'V/Vo');
    const r = g.up.b / g.up.a;
    if (r <= 0.35) return interp2([90, 120, 150], c, [[1.0, 0.95, 1.2, 1.5, 1.8], [1.0, 1.1, 1.1, 1.4, 1.9], [1.0, 0.95, 0.95, 1.4, 1.8]], p.th, x, w, 'θ', 'V/Vo');
    if (r >= 3.5) return interp2([45, 60, 90, 120], c, [[1.0, 0.92, 0.93, 1.1, 1.3], [1.0, 0.87, 0.87, 1.0, 1.3], [1.0, 0.82, 0.80, 0.97, 1.2], [1.0, 0.80, 0.76, 0.90, 0.98]], p.th, x, w, 'θ', 'V/Vo');
    if (r < 0.5 || r > 2) w.push('H/W = ' + fmt(r) + ' između grupa tabele — korišćena grupa 0,5–2,0');
    return interp2(G2[0], c, G2[1], p.th, x, w, 'θ', 'V/Vo'); } },
{ id: '2-4', n: 'Izlaz — okrugli difuzorski (konusni)', cat: 'izlaz', cls: 'local', shape: 'round',
  p: [P_TH(14), { k: 'r', l: 'Odnos površina A1/Ao', t: 'num', d: 2 }],
  calc(p, g, w) { return interp2([2, 4, 6, 10, 16], [8, 10, 14, 20, 30, 45, 60], [
    [0.36, 0.33, 0.37, 0.51, 0.90, 1.0, 1.0], [0.24, 0.21, 0.28, 0.40, 0.70, 0.99, 1.0], [0.20, 0.19, 0.26, 0.37, 0.67, 0.99, 1.0],
    [0.18, 0.16, 0.24, 0.36, 0.68, 0.99, 1.0], [0.16, 0.16, 0.20, 0.36, 0.66, 0.99, 1.0]], p.r, p.th, w, 'A1/Ao', 'θ'); } },
{ id: '2-5', n: 'Izlaz — okrugli sa prelazom u zid (optimalni ugao)', cat: 'izlaz', cls: 'local', shape: 'round',
  p: [{ k: 'L', l: 'Dužina prelaza L', u: 'mm', t: 'num', d: 500 }],
  calc(p, g, w) { return interp1([0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14], [0.41, 0.32, 0.24, 0.20, 0.17, 0.15, 0.14, 0.12, 0.11, 0.11, 0.10], p.L / g.up.D, w, 'L/D'); } },
{ id: '2-6', n: 'Izlaz — pravougaoni difuzor, dvije strane paralelne', cat: 'izlaz', cls: 'local', shape: 'rect',
  p: [P_TH(14), { k: 'r', l: 'Odnos površina A1/Ao', t: 'num', d: 2 }],
  calc(p, g, w) { return interp2([2, 4, 6], [8, 10, 14, 20, 30, 45, 60], [[0.50, 0.51, 0.56, 0.63, 0.80, 0.96, 1.0], [0.34, 0.38, 0.48, 0.63, 0.76, 0.91, 1.0], [0.32, 0.34, 0.41, 0.56, 0.70, 0.84, 0.96]], p.r, p.th, w, 'A1/Ao', 'θ'); } },
{ id: '2-7', n: 'Izlaz — pravougaoni sa zidom, dvije strane paralelne (opt. ugao)', cat: 'izlaz', cls: 'local', shape: 'rect',
  p: [{ k: 'L', l: 'Dužina prelaza L', u: 'mm', t: 'num', d: 500 }],
  calc(p, g, w) { return interp1([0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14], [0.53, 0.44, 0.35, 0.31, 0.28, 0.25, 0.24, 0.22, 0.20, 0.19, 0.19], p.L / g.up.b, w, 'L/H'); } },
{ id: '2-8', n: 'Izlaz — pravougaoni piramidalni difuzor', cat: 'izlaz', cls: 'local', shape: 'rect',
  p: [{ k: 'th', l: 'Veći od uglova θ1, θ2', u: '°', t: 'num', d: 14 }, { k: 'r', l: 'Odnos površina A1/Ao', t: 'num', d: 2 }],
  calc(p, g, w) { return interp2([2, 4, 6, 10], [8, 10, 14, 20, 30, 45, 60], [[0.65, 0.68, 0.74, 0.82, 0.92, 1.1, 1.1], [0.53, 0.60, 0.69, 0.78, 0.90, 1.0, 1.1], [0.50, 0.57, 0.66, 0.77, 0.91, 1.0, 1.1], [0.45, 0.53, 0.64, 0.74, 0.85, 0.97, 1.1]], p.r, p.th, w, 'A1/Ao', 'θ'); } },
{ id: '2-9', n: 'Izlaz — pravougaoni piramidalni sa zidom (opt. ugao)', cat: 'izlaz', cls: 'local', shape: 'rect',
  p: [{ k: 'L', l: 'Dužina prelaza L', u: 'mm', t: 'num', d: 500 }],
  calc(p, g, w) { return interp1([0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14], [0.49, 0.40, 0.30, 0.26, 0.23, 0.21, 0.19, 0.17, 0.16, 0.15, 0.14], p.L / g.up.Dh, w, 'L/D'); } },
{ id: '2-10', n: 'Izlaz u atmosferu iz koljena 90° (koljeno uračunato)', cat: 'izlaz', cls: 'local', shape: 'any',
  p: [{ k: 'r', l: 'Radijus koljena r', u: 'mm', t: 'num', d: 0 }, { k: 'L', l: 'Dužina iza koljena L', u: 'mm', t: 'num', d: 0 }, P_RAVAN],
  calc(p, g, w) { if (g.up.shape === 'round') { if (Math.abs(p.r / g.up.D - 1) > 0.1) w.push('Tabela za okrugli kanal važi samo za r/D = 1,0'); return interp1([0.9, 1.3], [1.5, 1.4], p.L / g.up.D, w, 'L/D'); }
    const W = planeDims(g.up, p).W;
    return interp2([0, 0.75, 1.0, 1.5, 2.5], [0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0], [
      [3.0, 3.1, 3.2, 3.0, 2.7, 2.4, 2.2, 2.1, 2.1, 2.0], [2.2, 2.2, 2.1, 1.8, 1.7, 1.6, 1.6, 1.5, 1.5, 1.5], [1.8, 1.5, 1.4, 1.4, 1.3, 1.3, 1.2, 1.2, 1.2, 1.2],
      [1.5, 1.2, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1], [1.2, 1.1, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]], p.r / W, p.L / W, w, 'r/W', 'L/W'); } },
{ id: '2-11', n: 'Izduvna hauba (kapa) — loše rješenje', cat: 'izlaz', cls: 'local', shape: 'round', poor: true,
  p: [{ k: 'L', l: 'Razmak L', u: 'mm', t: 'num', d: 100 }],
  calc(p, g, w) { return interp1([0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5], [2.6, 1.2, 1.0, 0.80, 0.70, 0.65, 0.60], p.L / g.up.D, w, 'L/D'); } },
{ id: '2-12', n: 'Završetak dimnjaka (stackhead)', cat: 'izlaz', cls: 'local', shape: 'round',
  p: [{ k: 'd', l: 'Prečnik otvora d', u: 'mm', t: 'num', d: 200 }],
  calc(p, g, w) { return interp1([0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], [130, 41, 17, 8.1, 4.4, 2.6, 1.6, 1.0], p.d / g.up.D, w, 'd/D'); } }
);
// ===== 3 KOLJENA =====
const HW11 = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0];
function c31(rD, th, w) { return Kth(th, w) * interp1([0.5, 0.75, 1.0, 1.5, 2.0, 2.5], [0.71, 0.33, 0.22, 0.15, 0.13, 0.12], rD, w, 'r/D'); }
function c35(sec, p, w) {
  const { W, H } = planeDims(sec, p); const rW = p.rr;
  const Co = interp2([0.5, 0.75, 1.0, 1.5, 2.0], HW11, [
    [1.3, 1.3, 1.2, 1.2, 1.1, 1.0, 1.0, 1.1, 1.1, 1.2, 1.2], [0.57, 0.52, 0.48, 0.44, 0.40, 0.39, 0.39, 0.40, 0.42, 0.43, 0.44],
    [0.27, 0.25, 0.23, 0.21, 0.19, 0.18, 0.18, 0.19, 0.20, 0.21, 0.21], [0.22, 0.20, 0.19, 0.17, 0.15, 0.14, 0.14, 0.15, 0.16, 0.17, 0.17],
    [0.20, 0.18, 0.16, 0.15, 0.14, 0.13, 0.13, 0.14, 0.14, 0.15, 0.15]], rW, H / W, w, 'r/W', 'H/W');
  const reX = [1, 2, 3, 4, 6, 8, 10, 14, 20], R4 = sec.Re / 1e4;
  const k05 = interp1(reX, [1.40, 1.26, 1.19, 1.14, 1.09, 1.06, 1.04, 1.0, 1.0], R4), k75 = interp1(reX, [2.0, 1.77, 1.64, 1.56, 1.46, 1.38, 1.30, 1.15, 1.0], R4);
  const kre = rW <= 0.5 ? k05 : rW >= 0.75 ? k75 : k05 + (k75 - k05) * (rW - 0.5) / 0.25;
  return Kth(p.th, w) * kre * Co;
}
const LH20 = [0, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8, 3.2, 4.0, 5.0, 6.0, 7.0, 9.0, 10.0, 20.0];
const KWH = { x: [0.25, 0.50, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0], y: [1.10, 1.07, 1.04, 1.0, 0.95, 0.90, 0.83, 0.78, 0.72, 0.70] };
F.push(
{ id: '3-1', n: 'Koljeno okruglo, glatko (presovano)', cat: 'koljeno', cls: 'local', shape: 'round',
  p: [{ k: 'rr', l: 'Odnos r/D', t: 'num', d: 1.0 }, P_TH(90)], calc(p, g, w) { return c31(p.rr, p.th, w); } },
{ id: '3-2', n: 'Koljeno okruglo segmentno (3, 4 ili 5 segmenata)', cat: 'koljeno', cls: 'local', shape: 'round',
  p: [{ k: 'n', l: 'Broj segmenata', t: 'sel', d: '5', o: [['5', '5'], ['4', '4'], ['3', '3']] }, { k: 'rr', l: 'Odnos r/D', t: 'num', d: 1.0 }, P_TH(90)],
  calc(p, g, w) { const T = { 5: [0.46, 0.33, 0.24, 0.19], 4: [0.50, 0.37, 0.27, 0.24], 3: [0.54, 0.42, 0.34, 0.33] };
    return Kth(p.th, w) * interp1([0.75, 1.0, 1.5, 2.0], T[p.n], p.rr, w, 'r/D'); } },
{ id: '3-3', n: 'Koljeno okruglo, oštro (mitered, bez radijusa)', cat: 'koljeno', cls: 'local', shape: 'round',
  p: [P_TH(90)], calc(p, g, w) { return KRe(g.up.Re) * interp1([20, 30, 45, 60, 75, 90], [0.08, 0.16, 0.34, 0.55, 0.81, 1.2], p.th, w, 'θ'); } },
{ id: '3-4', n: 'Z-koljeno okruglo 30° (dva koljena)', cat: 'koljeno', cls: 'local', shape: 'round',
  p: [{ k: 'L', l: 'Razmak između koljena L', u: 'mm', t: 'num', d: 300 }],
  calc(p, g, w) { return KRe(g.up.Re) * interp1([0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0], [0, 0.15, 0.15, 0.16, 0.16, 0.16, 0.16], p.L / g.up.D, w, 'L/D'); } },
{ id: '3-5', n: 'Koljeno pravougaono sa radijusom, bez lopatica', cat: 'koljeno', cls: 'local', shape: 'rect',
  p: [{ k: 'rr', l: 'Odnos r/W (unutr. radijus)', t: 'num', d: 1.0 }, P_TH(90), P_RAVAN], calc(p, g, w) { return c35(g.up, p, w); } },
{ id: '3-6', n: 'Koljeno pravougaono oštro (mitered), bez lopatica', cat: 'koljeno', cls: 'local', shape: 'rect',
  p: [P_TH(90), P_RAVAN],
  calc(p, g, w) { const { W, H } = planeDims(g.up, p);
    return KRe(g.up.Re) * interp2([20, 30, 45, 60, 75, 90], HW11, [
      [0.08, 0.08, 0.08, 0.07, 0.07, 0.07, 0.06, 0.06, 0.05, 0.05, 0.05], [0.18, 0.17, 0.17, 0.16, 0.15, 0.15, 0.13, 0.13, 0.12, 0.12, 0.11],
      [0.38, 0.37, 0.36, 0.34, 0.33, 0.31, 0.28, 0.27, 0.26, 0.25, 0.24], [0.60, 0.59, 0.57, 0.55, 0.52, 0.49, 0.46, 0.43, 0.41, 0.39, 0.38],
      [0.89, 0.87, 0.84, 0.81, 0.77, 0.73, 0.67, 0.63, 0.61, 0.58, 0.57], [1.3, 1.3, 1.2, 1.2, 1.1, 1.1, 0.98, 0.92, 0.89, 0.85, 0.83]], p.th, H / W, w, 'θ', 'H/W'); } },
{ id: '3-7', n: 'Koljeno pravougaono sa radijusom i razdjelnim lopaticama (1–3)', cat: 'koljeno', cls: 'local', shape: 'rect',
  p: [{ k: 'nv', l: 'Broj lopatica', t: 'sel', d: '1', o: [['1', '1'], ['2', '2'], ['3', '3']] }, { k: 'rr', l: 'Odnos r/W (unutr. radijus)', t: 'num', d: 0.6 }, P_TH(90), P_RAVAN],
  calc(p, g, w) { const { W, H } = planeDims(g.up, p); const cols = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
    const T = {
      1: [[0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00], [
        [0.52, 0.40, 0.43, 0.49, 0.55, 0.66, 0.75, 0.84, 0.93, 1.0, 1.1], [0.36, 0.27, 0.25, 0.24, 0.30, 0.35, 0.39, 0.42, 0.46, 0.49, 0.52],
        [0.28, 0.21, 0.18, 0.19, 0.20, 0.22, 0.25, 0.26, 0.28, 0.30, 0.32], [0.22, 0.16, 0.14, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.20, 0.21],
        [0.18, 0.13, 0.11, 0.11, 0.11, 0.12, 0.13, 0.14, 0.14, 0.15, 0.15], [0.15, 0.11, 0.09, 0.09, 0.09, 0.09, 0.10, 0.10, 0.11, 0.11, 0.12],
        [0.13, 0.09, 0.08, 0.07, 0.07, 0.08, 0.08, 0.08, 0.08, 0.09, 0.09], [0.11, 0.08, 0.07, 0.06, 0.06, 0.06, 0.06, 0.07, 0.07, 0.07, 0.07],
        [0.10, 0.07, 0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 0.06, 0.06, 0.06], [0.09, 0.06, 0.05, 0.05, 0.04, 0.04, 0.04, 0.05, 0.05, 0.05, 0.05]]],
      2: [[0.55, 0.60, 0.65, 0.70, 0.75, 0.80], [
        [0.26, 0.20, 0.22, 0.25, 0.28, 0.33, 0.37, 0.41, 0.45, 0.48, 0.51], [0.17, 0.13, 0.11, 0.12, 0.13, 0.15, 0.16, 0.17, 0.19, 0.20, 0.21],
        [0.12, 0.09, 0.08, 0.08, 0.08, 0.09, 0.10, 0.10, 0.11, 0.11, 0.11], [0.09, 0.07, 0.06, 0.05, 0.06, 0.06, 0.06, 0.06, 0.07, 0.07, 0.07],
        [0.08, 0.05, 0.04, 0.04, 0.04, 0.04, 0.05, 0.05, 0.05, 0.05, 0.05], [0.06, 0.04, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.04, 0.04, 0.04]]],
      3: [[0.55, 0.60], [[0.11, 0.10, 0.12, 0.13, 0.14, 0.16, 0.18, 0.19, 0.21, 0.22, 0.23], [0.07, 0.05, 0.06, 0.06, 0.06, 0.07, 0.07, 0.08, 0.08, 0.08, 0.09]]] };
    const t = T[p.nv]; return Kth(p.th, w) * interp2(t[0], cols, t[1], p.rr, H / W, w, 'r/W', 'H/W'); } },
{ id: '3-8', n: 'Koljeno pravougaono oštro sa jednostrukim usmjerivačkim lopaticama', cat: 'koljeno', cls: 'local', shape: 'rect',
  p: [{ k: 'dz', l: 'Izvedba (ASHRAE design no.)', t: 'sel', d: '1', o: [['1', '1 (r=2", s=1.5")'], ['2', '2 (r=4.5", s=2.25")'], ['3', '3 (r=4.5", s=3.25")']] }],
  note: 'Samo za 90°.', calc(p) { return { 1: 0.12, 2: 0.15, 3: 0.18 }[p.dz]; } },
{ id: '3-9', n: 'Koljeno pravougaono oštro sa dvostrukim (profilisanim) lopaticama', cat: 'koljeno', cls: 'local', shape: 'rect',
  p: [{ k: 'dz', l: 'Izvedba (ASHRAE design no.)', t: 'sel', d: '1', o: [['1', '1 (r=2", s=1.5", embossed)'], ['2', '2 (r=2", s=1.5", push-on)'], ['3', '3 (r=2", s=2.13", embossed)'], ['4', '4 (r=4.5", s=3.25", embossed)']] }],
  note: 'Samo za 90°.', calc(p, g, w) { const T = { 1: [0.27, 0.22, 0.19, 0.17], 2: [0.33, 0.29, 0.26, 0.23], 3: [0.38, 0.31, 0.27, 0.24], 4: [0.26, 0.21, 0.18, 0.16] };
    return interp1([1000, 2000, 3000, 4000].map(x => x * FPM), T[p.dz], g.up.v, w, 'v [m/s]'); } },
{ id: '3-10', n: 'Koljeno pravougaono 90° sa promjenom presjeka (ulaz ≠ izlaz)', cat: 'koljeno', cls: 'trans', shape: 'rect', dnShape: 'rect', ref: 'up',
  p: [P_RAVAN],
  calc(p, g, w) { const u = planeDims(g.up, p), d = planeDims(g.dn, p);
    if (Math.abs(u.H - d.H) > 1) w.push('Tabela pretpostavlja istu dimenziju upravno na ravan skretanja (H); ovdje se mijenja i ona');
    const hw = u.H / u.W;
    return KRe(g.up.Re) * interp2([0.25, 1.0, 4.0, 100], [0.6, 0.8, 1.2, 1.4, 1.6, 2.0], [
      [1.8, 1.4, 1.1, 1.1, 1.1, 1.1], [1.7, 1.4, 1.0, 0.95, 0.90, 0.84], [1.5, 1.4, 0.81, 0.76, 0.72, 0.66], [1.5, 1.0, 0.69, 0.63, 0.60, 0.55]],
      hw, d.W / u.W, w, 'Ho/Wo', 'W1/Wo'); } },
{ id: '3-11', n: 'Z-koljeno pravougaono 90° (dva koljena u istoj ravni)', cat: 'koljeno', cls: 'local', shape: 'rect',
  p: [{ k: 'L', l: 'Razmak L', u: 'mm', t: 'num', d: 300 }, P_RAVAN],
  calc(p, g, w) { const { W, H } = planeDims(g.up, p); // H = dimenzija u ravni skretanja
    const Co = interp1(LH20, [0, 0.62, 0.90, 1.6, 2.6, 3.6, 4.0, 4.2, 4.2, 4.2, 3.7, 3.3, 3.2, 3.1, 2.9, 2.9, 2.8, 2.7, 2.5, 2.3], p.L / W, w, 'L/H');
    return interp1(KWH.x, KWH.y, H / W, w, 'W/H') * KRe(g.up.Re) * Co; } },
{ id: '3-12', n: 'Dva koljena 90° u različitim ravnima, pravougaona', cat: 'koljeno', cls: 'local', shape: 'rect',
  p: [{ k: 'L', l: 'Razmak L', u: 'mm', t: 'num', d: 300 }, P_RAVAN],
  calc(p, g, w) { const { W, H } = planeDims(g.up, p);
    const Co = interp1(LH20, [1.2, 2.4, 2.9, 3.3, 3.4, 3.4, 3.4, 3.3, 3.2, 3.1, 3.2, 3.2, 3.2, 3.0, 2.9, 2.8, 2.7, 2.5, 2.4, 2.3], p.L / W, w, 'L/W');
    return interp1(KWH.x, KWH.y, H / W, w, 'H/W') * KRe(g.up.Re) * Co; } },
{ id: '3-13', n: 'S-obilaznica (dva koljena θ u istoj ravni)', cat: 'koljeno', cls: 'local', shape: 'any',
  p: [P_TH(45), { k: 'rr', l: 'Odnos r/D (r/W) pojedinačnog koljena', t: 'num', d: 1.0 }, { k: 'L', l: 'Razmak L', u: 'mm', t: 'num', d: 500 }, P_RAVAN],
  note: 'Co = K · C(pojedinačno koljeno). Pojedinačno koljeno: 3-1 (okruglo) ili 3-5 (pravougaono).',
  calc(p, g, w) { const single = g.up.shape === 'round' ? c31(p.rr, p.th, w) : c35(g.up, p, w);
    const K = interp2([15, 30, 45, 60, 75, 90], [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 25, 40], [
      [0.20, 0.42, 0.60, 0.78, 0.94, 1.16, 1.20, 1.15, 1.08, 1.05, 1.02, 1.00, 1.10, 1.25, 2.0], [0.40, 0.65, 0.88, 1.16, 1.20, 1.18, 1.12, 1.06, 1.06, 1.15, 1.28, 1.40, 1.50, 1.70, 2.0],
      [0.60, 1.06, 1.20, 1.23, 1.20, 1.08, 1.03, 1.08, 1.17, 1.30, 1.42, 1.55, 1.65, 1.80, 2.0], [1.05, 1.38, 1.37, 1.28, 1.15, 1.06, 1.16, 1.30, 1.42, 1.54, 1.66, 1.76, 1.85, 1.95, 2.0],
      [1.50, 1.58, 1.46, 1.30, 1.27, 1.30, 1.37, 1.47, 1.57, 1.68, 1.75, 1.80, 1.88, 1.97, 2.0], [1.70, 1.67, 1.40, 1.37, 1.38, 1.47, 1.55, 1.63, 1.70, 1.76, 1.82, 1.88, 1.92, 1.98, 2.0]],
      p.th, p.L / g.up.Dh, w, 'θ', 'L/D');
    return K * single; } },
{ id: '3-14', n: 'S-obilaznica u dvije ravni (90° jedna prema drugoj)', cat: 'koljeno', cls: 'local', shape: 'any',
  p: [{ k: 'th', l: 'Ugao θ', u: '°', t: 'sel', d: '90', o: [['60', '60°'], ['90', '90°']] }, { k: 'rr', l: 'Odnos r/D (r/W) pojedinačnog koljena', t: 'num', d: 1.0 }, { k: 'L', l: 'Razmak L', u: 'mm', t: 'num', d: 500 }, P_RAVAN],
  calc(p, g, w) { const pp = Object.assign({}, p, { th: +p.th }); const single = g.up.shape === 'round' ? c31(p.rr, pp.th, w) : c35(g.up, pp, w);
    return single * interp2([60, 90], [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 20, 25, 40], [
      [2.0, 1.90, 1.50, 1.35, 1.30, 1.20, 1.25, 1.50, 1.63, 1.73, 1.85, 1.95, 2.0], [2.0, 1.80, 1.60, 1.55, 1.55, 1.65, 1.80, 1.90, 1.93, 1.98, 2.0, 2.0, 2.0]], pp.th, p.L / g.up.Dh, w, 'θ', 'L/D'); } },
{ id: '3-15', n: '4 koljena 45° oko prepreke, pravougaona (W/H=4, r/H=1,5)', cat: 'koljeno', cls: 'local', shape: 'rect',
  calc(p, g, w) { if (Math.abs(g.up.a / g.up.b - 4) > 0.5) w.push('Tabela važi za W/H = 4; stvarno ' + fmt(g.up.a / g.up.b));
    return interp1([800, 1200, 1600, 2000, 2400].map(x => x * FPM), [0.18, 0.22, 0.24, 0.25, 0.26], g.up.v, w, 'v [m/s]'); }, p: [] }
);
// ===== 4 PRELAZI (mijenjaju presjek) =====
const TR_R = [0.06, 0.1, 0.25, 0.5, 1, 2, 4, 6, 10];
const P_TL = [{ k: 'th', l: 'Ugao prelaza θ (ukupni)', u: '°', t: 'num', d: 30 }, { k: 'L', l: 'ili dužina prelaza L (0 = koristi θ)', u: 'mm', t: 'num', d: 0 }];
const deg = r => r * 180 / Math.PI;
function thFromL(p, dHalf, w, oneSide) { // dHalf = promjena dimenzije
  if (!(p.L > 0)) return p.th;
  const th = oneSide ? deg(Math.atan(Math.abs(dHalf) / p.L)) : 2 * deg(Math.atan(Math.abs(dHalf) / (2 * p.L)));
  w.push('θ izračunat iz dužine L: ' + fmt(th, 1) + '°'); return th;
}
function rectChange(g, w) { const da = g.dn.a - g.up.a, db = g.dn.b - g.up.b; return { da, db }; }
F.push(
{ id: '4-1', n: 'Prelaz okrugli (konusno suženje / proširenje)', cat: 'prelaz', cls: 'trans', shape: 'round', dnShape: 'round', ref: 'up', p: P_TL,
  note: 'θ = 180° je nagla promjena presjeka.',
  calc(p, g, w) { const th = thFromL(p, g.dn.D - g.up.D, w);
    return interp2(TR_R, TH10.slice(1), [
      [0.21, 0.29, 0.38, 0.60, 0.84, 0.88, 0.88, 0.88, 0.88, 0.88], [0.21, 0.28, 0.38, 0.59, 0.76, 0.80, 0.83, 0.84, 0.83, 0.83],
      [0.16, 0.22, 0.30, 0.46, 0.61, 0.68, 0.64, 0.63, 0.62, 0.62], [0.11, 0.13, 0.19, 0.32, 0.33, 0.33, 0.32, 0.31, 0.30, 0.30],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.20, 0.20, 0.20, 0.20, 0.22, 0.24, 0.48, 0.72, 0.96, 1.0],
      [0.80, 0.64, 0.64, 0.64, 0.88, 1.1, 2.7, 4.3, 5.6, 6.6], [1.8, 1.4, 1.4, 1.4, 2.0, 2.5, 6.5, 10, 13, 15], [5.0, 5.0, 5.0, 5.0, 6.5, 8.0, 19, 29, 37, 43]],
      g.up.A / g.dn.A, th, w, 'Ao/A1', 'θ'); } },
{ id: '4-2', n: 'Prelaz pravougaoni, dvije strane paralelne, simetričan', cat: 'prelaz', cls: 'trans', shape: 'rect', dnShape: 'rect', ref: 'up', p: P_TL,
  calc(p, g, w) { const { da, db } = rectChange(g); if (Math.abs(da) > 1 && Math.abs(db) > 1) w.push('Mijenjaju se obje dimenzije — primjereniji je 4-4 (piramidalni)');
    const th = thFromL(p, Math.abs(da) > Math.abs(db) ? da : db, w);
    return interp2(TR_R, TH10.slice(1), [
      [0.26, 0.27, 0.40, 0.56, 0.71, 0.86, 1.00, 0.99, 0.98, 0.98], [0.24, 0.26, 0.36, 0.53, 0.69, 0.82, 0.93, 0.93, 0.92, 0.91],
      [0.17, 0.19, 0.22, 0.42, 0.60, 0.68, 0.70, 0.69, 0.67, 0.66], [0.14, 0.13, 0.15, 0.24, 0.35, 0.37, 0.38, 0.37, 0.36, 0.35],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.23, 0.20, 0.20, 0.20, 0.24, 0.28, 0.54, 0.78, 1.0, 1.1],
      [0.81, 0.64, 0.64, 0.64, 0.88, 1.1, 2.8, 4.4, 5.7, 6.6], [1.8, 1.4, 1.4, 1.4, 2.0, 2.5, 6.6, 10, 13, 15], [5.0, 5.0, 5.0, 5.0, 6.5, 8.0, 19, 29, 37, 43]],
      g.up.A / g.dn.A, th, w, 'Ao/A1', 'θ'); } },
{ id: '4-3', n: 'Prelaz pravougaoni, tri strane ravne (jednostrani)', cat: 'prelaz', cls: 'trans', shape: 'rect', dnShape: 'rect', ref: 'up', p: P_TL,
  note: 'Podaci privremeni (ASHRAE: pretpostavljeno isto kao 4-2).',
  calc(p, g, w) { const { da, db } = rectChange(g); const th = thFromL(p, Math.abs(da) > Math.abs(db) ? da : db, w, true);
    return interp2(TR_R, [10, 15, 20, 30, 45, 60, 90], [
      [0.26, 0.27, 0.40, 0.56, 0.71, 0.86, 1.00], [0.24, 0.26, 0.36, 0.53, 0.69, 0.82, 0.93], [0.17, 0.19, 0.22, 0.42, 0.60, 0.68, 0.70],
      [0.14, 0.13, 0.15, 0.24, 0.35, 0.37, 0.38], [0, 0, 0, 0, 0, 0, 0], [0.23, 0.20, 0.20, 0.20, 0.24, 0.28, 0.54],
      [0.81, 0.64, 0.64, 0.64, 0.88, 1.1, 2.8], [1.8, 1.4, 1.4, 1.4, 2.0, 2.5, 6.6], [5.0, 5.0, 5.0, 5.0, 6.5, 8.0, 19]], g.up.A / g.dn.A, th, w, 'Ao/A1', 'θ'); } },
{ id: '4-4', n: 'Prelaz pravougaoni piramidalni (mijenjaju se obje dimenzije)', cat: 'prelaz', cls: 'trans', shape: 'rect', dnShape: 'rect', ref: 'up', p: P_TL,
  note: 'θ = veći od dva ugla.',
  calc(p, g, w) { const { da, db } = rectChange(g); const th = thFromL(p, Math.abs(da) > Math.abs(db) ? da : db, w);
    return interp2(TR_R, TH10.slice(1), [
      [0.26, 0.30, 0.44, 0.54, 0.53, 0.65, 0.77, 0.88, 0.95, 0.98], [0.24, 0.30, 0.43, 0.50, 0.53, 0.64, 0.75, 0.84, 0.89, 0.91],
      [0.20, 0.25, 0.34, 0.36, 0.45, 0.52, 0.58, 0.62, 0.64, 0.64], [0.14, 0.15, 0.20, 0.21, 0.25, 0.30, 0.33, 0.33, 0.33, 0.32],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.23, 0.22, 0.21, 0.20, 0.22, N, 0.49, 0.74, 0.99, 1.1],
      [0.84, 0.68, 0.68, 0.64, 0.88, 1.1, 2.7, 4.3, 5.6, 6.6], [1.8, 1.5, 1.5, 1.4, 2.0, 2.5, 6.5, 10, 13, 15], [5.0, 5.0, 5.1, 5.0, 6.5, 8.0, 19, 29, 37, 43]],
      g.up.A / g.dn.A, th, w, 'Ao/A1', 'θ'); } },
{ id: '4-5', n: 'Prelaz okrugli ↔ pravougaoni — proširenje', cat: 'prelaz', cls: 'trans', shape: 'any', dnShape: 'any', ref: 'up', p: P_TL,
  note: 'Samo za proširenje (A1 > Ao). Red A1/Ao = 1 → Co = 0 dodat kao fizička granica.',
  calc(p, g, w) { if (g.dn.A < g.up.A) w.push('4-5 važi samo za proširenje; za suženje okrugli→pravougaoni koristi 4-7 (obrnuto) ili 4-1/4-4');
    if (g.up.shape === g.dn.shape) w.push('4-5 je prelaz između okruglog i pravougaonog presjeka');
    const th = thFromL(p, g.dn.Dh - g.up.Dh, w);
    return interp2([1, 2, 4, 6, 10], [8, 10, 14, 20, 30, 45, 60, 90, 180], [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0.14, 0.15, 0.20, 0.25, 0.30, 0.33, 0.33, 0.33, 0.30], [0.20, 0.25, 0.34, 0.45, 0.52, 0.58, 0.62, 0.64, 0.64],
      [0.21, 0.30, 0.42, 0.53, 0.63, 0.72, 0.78, 0.79, 0.79], [0.24, 0.30, 0.43, 0.53, 0.64, 0.75, 0.84, 0.89, 0.88]], g.dn.A / g.up.A, th, w, 'A1/Ao', 'θ'); } },
{ id: '4-6', n: 'Prelaz pravougaoni → okrugli', cat: 'prelaz', cls: 'trans', shape: 'rect', dnShape: 'round', ref: 'dn',
  p: [{ k: 'L', l: 'Dužina prelaza L', u: 'mm', t: 'num', d: 300 }],
  note: 'Co se odnosi na brzinu u okruglom presjeku (Vo). Važi za H < D.',
  calc(p, g, w) { const Ao = g.dn.A, A1 = g.up.A, W = Math.max(g.up.a, g.up.b), H = Math.min(g.up.a, g.up.b);
    if (H >= g.dn.D) w.push('Tabela važi za H < D');
    const B = W / H * Math.pow(Ao / A1, 2), LD = p.L / g.dn.D, re = g.dn.Re / 1e4, RE = [1, 2, 5, 10, 20, 50];
    if (Ao > A1) {
      const LDk = [1, 1.5, 2, 3, 4, 5], Bk = [0.1, 0.5, 1, 2, 5, 10, 20, 50];
      const T = [
        [[0.46, 0.48, 0.50, 0.55, 0.70, 0.94, 1.4, 2.9], [0.46, 0.47, 0.49, 0.53, 0.64, 0.82, 1.2, 2.3], [0.46, 0.47, 0.48, 0.50, 0.58, 0.71, 0.98, 1.8], [0.45, 0.46, 0.46, 0.48, 0.51, 0.57, 0.69, 1.0], [0.45, 0.46, 0.46, 0.46, 0.48, 0.51, 0.56, 0.73], [0.45, 0.46, 0.46, 0.47, 0.49, 0.53, 0.61, 0.84]],
        [[0.41, 0.43, 0.46, 0.51, 0.66, 0.90, 1.4, 2.9], [0.41, 0.43, 0.45, 0.48, 0.59, 0.78, 1.1, 2.2], [0.41, 0.42, 0.44, 0.46, 0.54, 0.67, 0.93, 1.7], [0.41, 0.42, 0.42, 0.43, 0.47, 0.53, 0.64, 0.99], [0.41, 0.41, 0.41, 0.42, 0.44, 0.46, 0.52, 0.69], [0.41, 0.41, 0.42, 0.43, 0.45, 0.49, 0.57, 0.80]],
        [[0.31, 0.33, 0.35, 0.40, 0.55, 0.79, 1.3, 2.8], [0.31, 0.32, 0.34, 0.38, 0.49, 0.67, 1.0, 2.1], [0.31, 0.32, 0.33, 0.36, 0.43, 0.57, 0.83, 1.6], [0.30, 0.31, 0.31, 0.33, 0.36, 0.42, 0.54, 0.88], [0.30, 0.31, 0.31, 0.31, 0.33, 0.36, 0.41, 0.58], [0.30, 0.31, 0.31, 0.32, 0.34, 0.38, 0.46, 0.70]],
        [[0.19, 0.21, 0.23, 0.28, 0.43, 0.68, 1.2, 2.6], [0.19, 0.20, 0.22, 0.26, 0.37, 0.55, 0.92, 2.0], [0.19, 0.20, 0.21, 0.24, 0.31, 0.45, 0.71, 1.5], [0.19, 0.19, 0.20, 0.21, 0.24, 0.30, 0.42, 0.77], [0.18, 0.19, 0.19, 0.19, 0.21, 0.24, 0.29, 0.46], [0.18, 0.19, 0.19, 0.20, 0.22, 0.26, 0.34, 0.58]],
        [[0.07, 0.09, 0.12, 0.17, 0.31, 0.56, 1.1, 2.5], [0.07, 0.09, 0.10, 0.14, 0.25, 0.43, 0.80, N], [0.07, 0.08, 0.09, 0.12, 0.20, 0.33, 0.59, 1.4], [0.07, 0.07, 0.08, 0.09, 0.13, 0.18, 0.30, 0.65], [0.07, 0.07, 0.07, 0.08, 0.10, 0.12, 0.18, 0.34], [0.07, 0.07, 0.08, 0.08, 0.11, 0.15, 0.22, 0.46]],
        [[0.01, 0.03, 0.05, 0.10, 0.25, N, 0.99, 2.5], [0.01, 0.02, 0.04, 0.08, 0.19, 0.37, 0.74, 1.8], [0.01, 0.02, 0.03, 0.06, 0.13, 0.27, 0.53, 1.3], [0, 0.01, 0.02, 0.03, 0.06, 0.12, 0.24, 0.58], [0, 0.01, 0.01, 0.01, 0.03, 0.06, 0.11, 0.28], [0, 0.01, 0.01, 0.02, 0.04, 0.08, 0.16, 0.40]]];
      const ix = bracket(RE, re, w, 'Re·10⁻⁴'); return blend(RE, ix, ix.map(i => interp2(LDk, Bk, T[i], LD, B, w, 'L/D', 'B')), re);
    }
    const LDk = [1, 3, 4, 5], Bk = [0.1, 1, 5, 10, 20, 50];
    const T = [
      [[0.27, 0.27, 0.28, 0.29, 0.31, 0.37], [0.27, 0.27, 0.28, 0.29, 0.30, 0.33], [0.27, 0.27, 0.28, 0.28, 0.29, 0.32], [0.27, 0.27, 0.27, 0.27, 0.27, 0.27]],
      [[0.25, 0.25, 0.26, 0.27, 0.29, 0.35], [0.25, 0.25, 0.25, 0.26, 0.28, 0.33], [0.25, 0.25, 0.25, 0.26, 0.27, 0.30], [0.25, 0.25, 0.25, 0.25, 0.25, 0.25]],
      [[0.18, 0.18, 0.19, 0.20, 0.22, 0.28], [0.18, 0.18, 0.19, 0.20, 0.22, 0.27], [0.18, 0.18, 0.19, 0.19, 0.20, 0.23], [0.18, 0.18, 0.18, 0.18, 0.18, 0.18]],
      [[0.11, 0.11, 0.12, 0.13, 0.15, 0.21], [0.11, 0.11, 0.12, 0.13, 0.14, 0.19], [0.11, 0.11, 0.12, 0.12, 0.13, 0.16], [0.11, 0.11, 0.11, 0.11, 0.11, 0.11]],
      [[0.04, 0.04, 0.05, 0.06, 0.08, 0.14], [0.04, 0.04, 0.05, 0.06, 0.07, 0.12], [0.04, 0.04, 0.05, 0.05, 0.06, 0.09], [0.04, 0.04, 0.04, 0.04, 0.04, 0.04]],
      [[0, 0, 0.01, 0.02, 0.04, 0.10], [0, 0, 0.01, 0.02, 0.04, 0.09], [0, 0, 0.01, 0.01, 0.02, 0.05], [0, 0, 0, 0, 0, 0]]];
    const ix = bracket(RE, re, w, 'Re·10⁻⁴'); return blend(RE, ix, ix.map(i => interp2(LDk, Bk, T[i], LD, B, w, 'L/D', 'B')), re); } },
{ id: '4-7', n: 'Prelaz pravougaoni → okrugli, stepenasti konusni (suženje)', cat: 'prelaz', cls: 'trans', shape: 'rect', dnShape: 'round', ref: 'dn',
  p: [{ k: 'th', l: 'Ugao konusa θ', u: '°', t: 'num', d: 60 }, { k: 'L', l: 'Dužina konusa L', u: 'mm', t: 'num', d: 50 }],
  note: 'Co se odnosi na brzinu u okruglom (izlaznom) presjeku.',
  calc(p, g, w) { if (g.dn.A > g.up.A) w.push('4-7 važi za suženje (Ao < A1)');
    const LH = [0.025, 0.05, 0.075, 0.1, 0.15, 0.3, 0.6], H = Math.min(g.up.a, g.up.b);
    const T = {
      0.1: [[0.46, 0.43, 0.42, 0.40, 0.38, 0.37, 0.38, 0.40, 0.43, 0.46], [0.46, 0.42, 0.38, 0.33, 0.30, 0.28, 0.31, 0.36, 0.41, 0.46], [0.46, 0.39, 0.32, 0.28, 0.23, 0.21, 0.26, 0.32, 0.39, 0.46], [0.46, 0.36, 0.30, 0.23, 0.19, 0.17, 0.23, 0.30, 0.38, 0.46], [0.46, 0.34, 0.25, 0.18, 0.15, 0.14, 0.21, 0.29, 0.37, 0.46], [0.46, 0.31, 0.22, 0.16, 0.13, 0.13, 0.20, 0.28, 0.37, 0.46], [0.46, 0.25, 0.17, 0.12, 0.10, 0.11, 0.19, 0.27, 0.36, 0.46]],
      0.25: [[0.40, 0.38, 0.36, 0.35, 0.33, 0.32, 0.33, 0.35, 0.37, 0.40], [0.40, 0.36, 0.33, 0.29, 0.26, 0.24, 0.27, 0.31, 0.35, 0.40], [0.40, 0.34, 0.28, 0.24, 0.20, 0.19, 0.23, 0.28, 0.34, 0.40], [0.40, 0.31, 0.26, 0.20, 0.17, 0.14, 0.20, 0.26, 0.33, 0.40], [0.40, 0.30, 0.22, 0.16, 0.13, 0.12, 0.18, 0.25, 0.32, 0.40], [0.40, 0.27, 0.19, 0.14, 0.11, 0.11, 0.18, 0.25, 0.32, 0.40], [0.40, 0.22, 0.14, 0.10, 0.09, 0.10, 0.16, 0.24, 0.32, 0.40]],
      0.5: [[0.30, 0.28, 0.27, 0.25, 0.24, 0.24, 0.25, 0.26, 0.27, 0.30], [0.30, 0.27, 0.24, 0.21, 0.19, 0.18, 0.20, 0.23, 0.26, 0.30], [0.30, 0.25, 0.21, 0.18, 0.15, 0.14, 0.17, 0.21, 0.25, 0.30], [0.30, 0.23, 0.19, 0.15, 0.12, 0.11, 0.15, 0.19, 0.24, 0.30], [0.30, 0.22, 0.16, 0.12, 0.09, 0.09, 0.13, 0.18, 0.24, 0.30], [0.30, 0.20, 0.14, 0.10, 0.08, 0.08, 0.13, 0.18, 0.24, 0.30], [0.30, 0.16, 0.11, 0.08, 0.07, 0.07, 0.12, 0.17, 0.23, 0.30]],
      0.8: [[0.15, 0.14, 0.13, 0.13, 0.12, 0.12, 0.12, 0.13, 0.14, 0.15], [0.15, 0.13, 0.12, 0.11, 0.10, 0.09, 0.10, 0.12, 0.13, 0.15], [0.15, 0.13, 0.10, 0.09, 0.08, 0.07, 0.08, 0.10, 0.13, 0.15], [0.15, 0.12, 0.10, 0.07, 0.06, 0.05, 0.07, 0.10, 0.12, 0.15], [0.15, 0.11, 0.08, 0.06, 0.05, 0.04, 0.07, 0.09, 0.12, 0.15], [0.15, 0.10, 0.07, 0.05, 0.04, 0.04, 0.07, 0.09, 0.12, 0.15], [0.15, 0.08, 0.05, 0.04, 0.03, 0.04, 0.06, 0.09, 0.12, 0.15]] };
    const R = [0.1, 0.25, 0.5, 0.8], ar = g.dn.A / g.up.A, ix = bracket(R, ar, w, 'Ao/A1');
    return blend(R, ix, ix.map(i => interp2(LH, TH10, T[R[i]], p.L / H, p.th, w, 'L/H', 'θ')), ar); } },
{ id: 'PR', n: 'Promjena presjeka bez gubitka (npr. ista površina, nova oznaka)', cat: 'prelaz', cls: 'trans', shape: 'any', dnShape: 'any', ref: 'up', p: [],
  note: 'Samo za evidenciju nove dimenzije kad je gubitak zanemarljiv. Ako se površina mijenja, koristi ASHRAE prelaz 4-x.',
  calc(p, g, w) { if (Math.abs(g.dn.A / g.up.A - 1) > 0.1) w.push('Površina se mijenja za ' + fmt((g.dn.A / g.up.A - 1) * 100, 0) + ' % — koristi ASHRAE prelaz 4-x'); return 0; } }
);
// ===== 5 RAČVE — KONVERGENTNE (odsis) =====
// Svi koeficijenti Cc,b i Cc,s su svedeni na brzinu u ZAJEDNIČKOM presjeku (Vc).
const QQ11 = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const AB7 = [0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0];
function tri(rows) { return rows.map((r, i) => { const a = r.slice(); while (a.length < 9) a.push(N); return a; }); }
const V18 = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8], Q9 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
function asAcWarn(J, w) { if (Math.abs(J.As / J.Ac - 1) > 0.03) w.push('Tabela važi za As = Ac (prolaz iste površine). Stvarno As/Ac = ' + fmt(J.As / J.Ac) + ' — promjenu presjeka modeluj prelazom 4-x'); }
const C53s = (J, w) => interp1(QQ11, [0, 0.16, 0.27, 0.38, 0.46, 0.53, 0.57, 0.59, 0.60, 0.59, 0.55], J.Qb / J.Qc, w, 'Qb/Qc');
// 5-4 / 5-5 trodimenzionalne tabele: {As/Ac: [[Ab/Ac...], [redovi po Qb/Qs]]}
const QS10 = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
function tab3(T, asac, abac, x, w) {
  const keys = Object.keys(T).map(Number).sort((a, b) => a - b), idx = bracket(keys, asac, w, 'As/Ac');
  const v = idx.map(i => { const k = keys[i]; return interp2(T[k][0], QS10, T[k][1], abac, x, w, 'Ab/Ac', 'Qb/Qs'); });
  return blend(keys, idx, v, asac);
}
const T54b = {
  0.3: [[0.2, 0.3], [[-2.4, -0.11, 1.8, 3.4, 4.8, 6.0, 7.1, 8.0, 8.9, 9.7], [-2.8, -1.3, 0.14, 0.72, 1.4, 2.0, 2.4, 2.8, 3.2, 3.5]]],
  0.4: [[0.2, 0.3, 0.4], [[-1.4, 0.61, 2.3, 3.8, 5.2, 6.3, 7.3, 8.3, 9.1, 9.8], [-1.8, -0.54, 0.42, 1.2, 1.8, 2.3, 2.7, 3.1, 3.4, 3.7], [-1.9, -0.89, -0.17, 0.36, 0.76, 1.1, 1.3, 1.5, 1.7, 1.9]]],
  0.5: [[0.2, 0.3, 0.4, 0.5], [[-0.82, 0.97, 2.6, 4.0, 5.3, 6.4, 7.4, 8.3, 9.1, 9.9], [-1.2, -0.15, 0.71, 1.4, 2.0, 2.5, 2.9, 3.3, 3.6, 3.9], [-1.4, -0.54, 0.06, 0.50, 0.85, 1.1, 1.3, 1.5, 1.7, 1.8], [-1.4, -0.66, -0.15, 0.21, 0.48, 0.68, 0.84, 0.97, 1.1, 1.2]]],
  0.6: [[0.2, 0.3, 0.4, 0.5, 0.6], [[-0.52, 1.2, 2.7, 4.1, 5.3, 6.4, 7.4, 8.3, 9.1, 9.9], [-0.93, 0.06, 0.85, 1.5, 2.1, 2.6, 3.0, 3.4, 3.7, 4.0], [-1.1, -0.37, 0.16, 0.55, 0.86, 1.1, 1.3, 1.4, 1.6, 1.8], [-1.1, -0.49, -0.06, 0.25, 0.48, 0.66, 0.79, 0.90, 1.0, 1.1], [-1.2, -0.55, -0.15, 0.12, 0.31, 0.45, 0.56, 0.65, 0.71, 0.77]]],
  0.8: [[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], [[-0.27, 1.3, 2.7, 4.0, 5.2, 6.3, 7.3, 8.2, 9.0, 9.7], [-0.67, 0.18, 0.90, 1.5, 2.0, 2.5, 2.9, 3.3, 3.6, 4.0], [-0.85, -0.27, 0.16, 0.49, 0.75, 0.97, 1.2, 1.3, 1.4, 1.6], [-0.90, -0.40, -0.07, 0.18, 0.36, 0.50, 0.61, 0.70, 0.78, 0.84], [-0.92, -0.46, -0.16, 0.04, 0.18, 0.29, 0.37, 0.44, 0.49, 0.53], [-0.93, -0.49, -0.21, -0.03, 0.10, 0.19, 0.25, 0.30, 0.34, 0.37], [-0.93, -0.50, -0.24, -0.07, 0.05, 0.13, 0.19, 0.23, 0.27, 0.29]]],
  1.0: [[0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0], [[-0.26, 1.2, 2.6, 3.9, 5.1, 6.1, 7.1, 8.0, 8.8, 9.5], [-0.65, 0.12, 0.79, 1.4, 1.9, 2.4, 2.8, 3.1, 3.5, 3.8], [-0.83, -0.34, 0.04, 0.33, 0.58, 0.78, 0.95, 1.1, 1.2, 1.3], [-0.89, -0.48, -0.20, 0, 0.15, 0.27, 0.37, 0.45, 0.51, 0.57], [-0.91, -0.54, -0.31, -0.14, -0.03, 0.06, 0.12, 0.18, 0.22, 0.25], [-0.91, -0.59, -0.38, -0.25, -0.16, -0.10, -0.06, -0.03, -0.01, 0.01], [-0.93, -0.60, -0.40, -0.28, -0.20, -0.14, -0.11, -0.08, -0.07, -0.06]]] };
const T54s = {
  0.3: [[0.2, 0.3], [[4.5, 2.8, 1.5, 0.56, -0.17, -0.74, -1.2, -1.6, -1.9, -2.1], [4.6, 3.1, 2.0, 1.2, 0.57, 0.08, -0.30, -0.62, -0.89, -1.1]]],
  0.4: [[0.2, 0.3, 0.4], [[1.6, 0.85, 0.16, -0.43, -0.92, -1.3, -1.7, -1.9, -2.2, -2.4], [1.7, 1.1, 0.58, 0.13, -0.24, -0.56, -0.82, -1.1, -1.3, -1.4], [1.8, 1.3, 0.80, 0.42, 0.11, -0.15, -0.37, -0.55, -0.72, -0.86]]],
  0.5: [[0.2, 0.3, 0.4, 0.5], [[0.67, 0.18, -0.33, -0.79, -1.2, -1.5, -1.8, -2.1, -2.3, -2.5], [0.75, 0.42, 0.07, -0.25, -0.54, -0.80, -1.0, -1.2, -1.4, -1.5], [0.80, 0.55, 0.28, 0.03, -0.20, -0.40, -0.57, -0.73, -0.86, -0.98], [0.82, 0.62, 0.41, 0.20, 0.02, -0.15, -0.29, -0.42, -0.53, -0.63]]],
  0.6: [[0.2, 0.3, 0.4, 0.5, 0.6], [[0.26, -0.11, -0.54, -0.95, -1.3, -1.6, -1.9, -2.1, -2.4, -2.5], [0.34, 0.13, -0.14, -0.42, -0.67, -0.90, -1.1, -1.3, -1.4, -1.6], [0.39, 0.25, 0.06, -0.14, -0.33, -0.51, -0.66, -0.80, -0.93, -1.0], [0.41, 0.32, 0.18, 0.03, -0.12, -0.26, -0.38, -0.50, -0.60, -0.69], [0.43, 0.37, 0.26, 0.14, 0.02, -0.09, -0.19, -0.29, -0.37, -0.45]]],
  0.8: [[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], [[-0.01, -0.30, -0.67, -1.1, -1.4, -1.7, -2.0, -2.2, -2.4, -2.6], [0.07, -0.07, -0.29, -0.58, -0.76, -0.97, -1.2, -1.3, -1.5, -1.6], [0.11, 0.05, -0.09, -0.26, -0.42, -0.58, -0.72, -0.85, -0.97, -1.1], [0.14, 0.12, 0.03, -0.09, -0.21, -0.34, -0.45, -0.55, -0.64, -0.73], [0.15, 0.17, 0.11, 0.02, -0.07, -0.17, -0.26, -0.34, -0.42, -0.49], [0.17, 0.21, 0.17, 0.11, 0.03, -0.05, -0.12, -0.19, -0.26, -0.32], [0.17, 0.23, 0.22, 0.17, 0.11, 0.05, -0.02, -0.07, -0.13, -0.18]]],
  1.0: [[0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0], [[-0.05, -0.33, -0.70, -1.1, -1.4, -1.7, -2.0, -2.2, -2.4, -2.6], [0.03, -0.10, -0.31, -0.55, -0.78, -0.98, -1.2, -1.3, -1.5, -1.6], [0.07, 0.02, -0.12, -0.28, -0.44, -0.59, -0.73, -0.86, -0.98, -1.1], [0.09, 0.09, 0.01, -0.11, -0.23, -0.35, -0.46, -0.56, -0.65, -0.74], [0.11, 0.14, 0.09, 0, -0.09, -0.18, -0.27, -0.35, -0.43, -0.50], [0.13, 0.20, 0.19, 0.15, 0.09, 0.03, -0.03, -0.08, -0.14, -0.19], [0.14, 0.24, 0.25, 0.24, 0.20, 0.16, 0.12, 0.08, 0.04, 0]]] };
const T55b = {
  0.3: [[0.2, 0.3], [[-2.4, -0.01, 2.0, 3.8, 5.3, 6.6, 7.8, 8.9, 9.8, 11], [-2.8, -1.2, 0.12, 1.1, 1.9, 2.6, 3.2, 3.7, 4.2, 4.6]]],
  0.4: [[0.2, 0.3, 0.4], [[-1.2, 0.93, 2.8, 4.5, 5.9, 7.2, 8.4, 9.5, 10, 11], [-1.6, -0.27, 0.81, 1.7, 2.4, 3.0, 3.6, 4.1, 4.5, 4.9], [-1.8, -0.72, 0.07, 0.66, 1.1, 1.5, 1.8, 2.1, 2.3, 2.5]]],
  0.5: [[0.2, 0.3, 0.4, 0.5], [[-0.46, 1.5, 3.3, 4.9, 6.4, 7.7, 8.8, 9.9, 11, 12], [-0.94, 0.25, 1.2, 2.0, 2.7, 3.3, 3.8, 4.2, 4.7, 5.0], [-1.1, -0.24, 0.42, 0.92, 1.3, 1.6, 1.9, 2.1, 2.3, 2.5], [-1.2, -0.38, 0.18, 0.58, 0.88, 1.1, 1.3, 1.5, 1.6, 1.7]]],
  0.6: [[0.2, 0.3, 0.4, 0.5, 0.6], [[-0.55, 1.3, 3.1, 4.7, 6.1, 7.4, 8.6, 9.6, 11, 12], [-1.1, 0, 0.88, 1.6, 2.3, 2.8, 3.3, 3.7, 4.1, 4.5], [-1.2, -0.48, 0.10, 0.54, 0.89, 1.2, 1.4, 1.6, 1.8, 2.0], [-1.3, -0.62, -0.14, 0.21, 0.47, 0.68, 0.85, 0.99, 1.1, 1.2], [-1.3, -0.69, -0.26, 0.04, 0.26, 0.42, 0.57, 0.66, 0.75, 0.82]]],
  0.8: [[0.2, 0.3, 0.4, 0.6, 0.7, 0.8], [[0.06, 1.8, 3.5, 5.1, 6.5, 7.8, 8.9, 10, 11, 12], [-0.52, 0.35, 1.1, 1.7, 2.3, 2.8, 3.2, 3.6, 3.9, 4.2], [-0.67, -0.05, 0.43, 0.80, 1.1, 1.4, 1.6, 1.8, 1.9, 2.1], [-0.75, -0.27, 0.05, 0.28, 0.45, 0.58, 0.68, 0.76, 0.83, 0.88], [-0.77, -0.31, -0.02, 0.18, 0.32, 0.43, 0.50, 0.56, 0.61, 0.65], [-0.78, -0.34, -0.07, 0.12, 0.24, 0.33, 0.39, 0.44, 0.47, 0.50]]],
  1.0: [[0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0], [[0.40, 2.1, 3.7, 5.2, 6.6, 7.8, 9.0, 11, 11, 12], [-0.21, 0.54, 1.2, 1.8, 2.3, 2.7, 3.1, 3.7, 3.7, 4.0], [-0.33, 0.21, 0.62, 0.96, 1.2, 1.5, 1.7, 2.0, 2.0, 2.1], [-0.38, 0.05, 0.37, 0.60, 0.79, 0.93, 1.1, 1.2, 1.2, 1.3], [-0.41, -0.02, 0.23, 0.42, 0.55, 0.66, 0.73, 0.80, 0.85, 0.89], [-0.44, -0.10, 0.11, 0.24, 0.33, 0.39, 0.43, 0.46, 0.47, 0.48], [-0.46, -0.14, 0.05, 0.16, 0.23, 0.27, 0.29, 0.30, 0.30, 0.29]]] };
const T55s = {
  0.3: [[0.2, 0.3], [[5.3, N, 2.0, 1.1, 0.34, -0.20, -0.61, -0.93, -1.2, -1.4], [5.4, 3.7, 2.5, 1.6, 1.0, 0.53, 0.16, -0.14, -0.38, -0.58]]],
  0.4: [[0.2, 0.3, 0.4], [[1.9, 1.1, 0.46, -0.07, -0.49, -0.83, -1.1, -1.3, -1.5, -1.7], [2.0, 1.4, 0.81, 0.42, 0.08, -0.20, -0.43, -0.62, -0.78, -0.92], [2.0, 1.5, 1.0, 0.68, 0.39, 0.16, -0.04, -0.21, -0.35, -0.47]]],
  0.5: [[0.2, 0.3, 0.4, 0.5], [[0.77, 0.34, -0.09, -0.48, -0.81, -1.1, -1.3, -1.5, -1.7, -1.8], [0.85, 0.56, 0.25, -0.03, -0.27, -0.48, -0.67, -0.82, -0.96, -1.1], [0.88, 0.66, 0.43, 0.21, 0.02, -0.15, -0.30, -0.42, -0.54, -0.64], [0.91, 0.73, 0.54, 0.36, 0.21, 0.06, -0.06, -0.17, -0.26, -0.35]]],
  0.6: [[0.2, 0.3, 0.4, 0.5, 0.6], [[0.30, 0, -0.34, -0.67, -0.96, -1.2, -1.4, -1.6, -1.8, -1.9], [0.37, 0.21, -0.02, -0.24, -0.44, -0.63, -0.79, -0.93, -1.1, -1.2], [0.40, 0.31, 0.16, N, -0.16, -0.30, -0.43, -0.54, -0.64, -0.73], [0.43, 0.37, 0.26, 0.14, 0.02, -0.09, -0.20, -0.29, -0.37, -0.45], [0.44, 0.41, 0.33, 0.24, 0.14, 0.05, -0.03, -0.11, -0.18, -0.25]]],
  0.8: [[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], [[-0.06, -0.27, -0.57, -0.86, -1.1, -1.4, -1.6, -1.7, -1.9, -2.0], [0, -0.08, -0.25, -0.43, -0.62, -0.78, -0.93, -1.1, -1.2, -1.3], [0.04, 0.02, -0.08, -0.21, -0.34, -0.46, -0.57, -0.67, -0.77, -0.85], [0.06, 0.08, 0.02, -0.06, -0.16, -0.25, -0.34, -0.42, -0.50, -0.57], [0.07, 0.12, 0.09, 0.03, -0.04, -0.11, -0.18, -0.25, -0.31, -0.37], [0.08, 0.15, 0.14, 0.10, 0.05, -0.01, -0.07, -0.12, -0.17, -0.22], [0.09, 0.17, 0.18, 0.16, 0.11, 0.07, 0.02, -0.02, -0.07, -0.11]]],
  1.0: [[0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0], [[-0.19, -0.39, -0.67, -0.96, -1.2, -1.5, -1.6, -1.8, -2.0, -2.1], [-0.12, -0.19, -0.35, -0.54, -0.71, -0.87, -1.0, -1.2, -1.3, -1.4], [-0.09, -0.10, -0.19, -0.31, -0.43, -0.55, -0.66, -0.77, -0.86, -0.94], [-0.07, -0.04, -0.09, -0.17, -0.26, -0.35, -0.44, -0.52, -0.59, -0.66], [-0.06, 0, -0.02, -0.07, -0.14, -0.21, -0.28, -0.34, -0.40, -0.46], [-0.04, 0.06, 0.07, 0.05, 0.02, -0.03, -0.07, -0.12, -0.16, -0.20], [N, 0.09, 0.13, 0.13, 0.11, 0.08, 0.06, 0.03, -0.01, -0.03]]] };
const C56 = [[0.33, 0.25], [0.5, 0.5], [0.67, 0.5], [1.0, 0.5], [1.0, 1.0], [1.33, 1.0], [2.0, 1.0]];
function smacConv(rowsLo, rowsHi) { return function (p, J, w) {
  if (Math.abs(J.Ab / J.As - 0.5) > 0.1 || Math.abs(J.Ab / J.Ac - 0.5) > 0.1) w.push('SMACNA tabela važi za Ab/As = 0,5; As/Ac = 1,0; Ab/Ac = 0,5 (stvarno Ab/Ac = ' + fmt(J.Ab / J.Ac) + ')');
  const x = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  return { Cb: interp1(x, J.Vc < 1200 * FPM ? rowsLo : rowsHi, J.Qb / J.Qc, w, 'Qb/Qc'), Cs: C53s(J, w) }; }; }
F.push(
{ id: '5-1', n: 'Račva Y 30°, konvergentna', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'any', lockAsAc: true, p: [],
  calc(p, J, w) { asAcWarn(J, w); const q = J.Qb / J.Qc, a = J.Ab / J.Ac;
    return { Cb: interp2(QQ11, AB7, [[-1.0, -1.0, -1.0, -0.9, -0.9, -0.9, -0.9], [0.21, -0.46, -0.57, -0.51, -0.53, -0.54, -0.54], [3.1, 0.37, -0.06, -0.16, -0.23, -0.24, -0.28], [7.6, 1.5, 0.50, 0.15, 0.04, -0.06, -0.08], [14, 3.0, 1.2, 0.42, 0.19, 0.13, 0.12], [21, 4.6, 1.8, 0.53, 0.24, 0.19, 0.15], [30, 6.4, 2.6, 0.77, 0.35, 0.25, 0.17], [41, 8.5, 3.4, 0.99, 0.42, 0.28, 0.22], [54, 12, 4.2, 1.2, 0.47, 0.29, 0.25], [58, 14, 5.3, 1.4, 0.49, 0.29, 0.22], [84, 17, 6.3, 1.6, 0.49, 0.21, 0.15]], q, a, w, 'Qb/Qc', 'Ab/Ac'),
      Cs: interp2(QQ11, AB7, [[0, 0, 0, 0, 0, 0, 0], [0.02, 0.11, 0.13, 0.15, 0.16, 0.17, 0.17], [-0.33, 0.01, 0.13, 0.19, 0.24, 0.27, 0.29], [-1.1, -0.25, -0.01, 0.10, 0.22, 0.30, 0.35], [-2.2, -0.75, -0.30, -0.05, 0.17, 0.26, 0.36], [-3.6, -1.4, -0.70, -0.35, 0, 0.21, 0.32], [-5.4, -2.4, -1.3, -0.70, -0.20, 0.06, 0.25], [-7.6, -3.4, -2.0, -1.2, -0.50, -0.15, 0.10], [-10, -4.6, -2.7, -1.8, -0.90, -0.43, -0.15], [-13, -6.2, -3.7, -2.6, -1.4, -0.80, -0.45], [-16, -7.7, -4.8, -3.4, -1.9, -1.2, -0.75]], q, a, w, 'Qb/Qc', 'Ab/Ac') }; } },
{ id: '5-2', n: 'Račva Y 45°, konvergentna, okrugla', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'round', lockAsAc: true, p: [],
  calc(p, J, w) { asAcWarn(J, w); const q = J.Qb / J.Qc, a = J.Ab / J.Ac;
    return { Cb: interp2(QQ11, AB7, [[-1.0, -1.0, -1.0, -0.90, -0.90, -0.80, -0.90], [0.24, -0.45, -0.56, -0.50, -0.52, -0.53, -0.53], [3.2, 0.54, -0.02, -0.14, -0.21, -0.23, -0.23], [8.0, 1.6, 0.60, 0.23, 0.06, 0, -0.02], [14, 3.2, 1.3, 0.52, 0.25, 0.18, 0.15], [22, 5.0, 2.1, 0.65, 0.33, 0.25, 0.22], [32, 7.0, 3.0, 0.91, N, N, N], [43, 9.2, 3.9, 1.2, 0.56, 0.39, 0.33], [56, 12, 4.9, 1.5, 0.66, 0.39, 0.36], [71, 15, 6.2, 1.8, 0.72, 0.44, 0.35], [87, 19, 7.4, 2.0, 0.78, 0.44, 0.32]], q, a, w, 'Qb/Qc', 'Ab/Ac'),
      Cs: interp2(QQ11, AB7, [[0, 0, 0, 0, 0, 0, 0], [0.05, 0.12, 0.14, 0.16, 0.17, 0.17, 0.17], [-0.20, 0.17, 0.22, 0.27, 0.27, 0.29, 0.31], [-0.76, -0.13, 0.08, 0.20, 0.28, 0.32, 0.40], [-1.7, -0.50, -0.12, 0.08, 0.26, 0.36, 0.41], [-2.8, -1.0, -0.49, -0.13, 0.16, 0.30, 0.40], [-4.3, -1.7, -0.87, -0.45, -0.04, 0.20, 0.33], [-6.1, -2.6, -1.4, -0.85, -0.25, 0.08, 0.25], [-8.1, -3.6, -2.1, -1.3, -0.55, -0.17, 0.06], [-10, -4.8, -2.8, -1.9, -0.88, -0.40, -0.18], [-13, -6.1, -3.7, -2.6, -1.4, -0.77, -0.42]], q, a, w, 'Qb/Qc', 'Ab/Ac') }; } },
{ id: '5-3', n: 'T-račva 90°, konvergentna, okrugla', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'round', lockAsAc: true, p: [],
  calc(p, J, w) { asAcWarn(J, w);
    return { Cb: interp2(QQ11, AB7, [[-1.0, -1.0, -1.0, -0.90, -0.90, -0.90, -0.90], [0.40, -0.37, -0.51, -0.46, -0.50, -0.51, -0.52], [3.8, 0.72, 0.17, -0.02, -0.14, -0.18, -0.24], [9.2, 2.3, 1.0, 0.44, 0.21, 0.11, -0.08], [16, 4.3, 2.1, 0.94, 0.54, 0.40, 0.32], [26, 6.8, 3.2, 1.1, 0.66, 0.49, 0.42], [37, 9.7, 4.7, 1.6, 0.92, 0.69, 0.57], [43, 13, 6.3, 2.1, 1.2, 0.88, 0.72], [65, 17, 7.9, 2.7, 1.5, 1.1, 0.86], [82, 21, 9.7, 3.4, 1.8, 1.2, 0.99], [101, 26, 12, 4.0, 2.1, 1.4, 1.1]], J.Qb / J.Qc, J.Ab / J.Ac, w, 'Qb/Qc', 'Ab/Ac'),
      Cs: C53s(J, w) }; } },
{ id: '5-4', n: 'Račva Y 30°, konvergentna, okrugla, konusni glavni kanal', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'round', p: [],
  calc(p, J, w) { const x = J.Qb / J.Qs, a = J.As / J.Ac, b = J.Ab / J.Ac; return { Cb: tab3(T54b, a, b, x, w), Cs: tab3(T54s, a, b, x, w) }; } },
{ id: '5-5', n: 'Račva Y 45°, konvergentna, okrugla, konusni glavni kanal', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'round', p: [],
  calc(p, J, w) { const x = J.Qb / J.Qs, a = J.As / J.Ac, b = J.Ab / J.Ac; return { Cb: tab3(T55b, a, b, x, w), Cs: tab3(T55s, a, b, x, w) }; } },
{ id: '5-6', n: 'T-račva 90°, konvergentna, pravougaona (r/Wb = 1)', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'rect', p: [],
  calc(p, J, w) { const i = nearestCombo(C56, J.Ab / J.As, J.Ab / J.Ac, w, 'Ab/As', 'Ab/Ac'), q = J.Qb / J.Qc;
    const B = [[-1.2, -0.40, 0.40, 1.6, 3.0, 4.8, 6.8, 8.9, 11], [-0.50, -0.20, 0, 0.25, 0.45, 0.70, 1.0, 1.5, 2.0], [-1.0, -0.60, -0.20, 0.10, 0.30, 0.60, 1.0, 1.5, 2.0], [-2.2, -1.5, -0.95, -0.50, 0, 0.40, 0.80, 1.3, 1.9], [-0.60, -0.30, -0.10, -0.04, 0.13, 0.21, 0.29, 0.36, 0.42], [-1.2, -0.80, -0.40, -0.20, 0, 0.16, 0.24, 0.32, 0.38], [-2.1, -1.4, -0.90, -0.50, -0.20, 0, 0.20, 0.25, 0.30]];
    const S = [[0.30, 0.30, 0.20, -0.10, -0.45, -0.92, -1.5, -2.0, -2.6], [0.17, 0.16, 0.10, 0, -0.08, -0.18, -0.27, -0.37, -0.46], [0.27, 0.35, 0.32, 0.25, 0.12, -0.03, -0.23, -0.42, -0.58], [1.2, 1.1, 0.90, 0.65, 0.35, 0, -0.40, -0.80, -1.3], [0.18, 0.24, 0.27, 0.26, 0.23, 0.18, 0.10, 0, -0.12], [N, 0.36, 0.38, 0.35, 0.27, 0.18, 0.05, -0.08, -0.22], [0.80, 0.87, 0.80, 0.68, 0.55, 0.40, 0.25, 0.08, -0.10]];
    return { Cb: interp1(Q9, B[i], q, w, 'Qb/Qc'), Cs: interp1(Q9, S[i], q, w, 'Qb/Qc') }; } },
{ id: '5-7', n: 'T-račva konvergentna, okrugli ogranak na pravougaoni kanal (SMACNA)', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'rect', bShape: 'round', lockAsAc: true, p: [],
  calc: smacConv([-0.63, -0.55, 0.13, 0.23, 0.78, 1.30, 1.93, 3.10, 4.88, 5.60], [-0.49, -0.21, 0.23, 0.60, 1.27, 2.06, 2.75, 3.70, 4.93, 5.95]) },
{ id: '5-8', n: 'T-račva konvergentna, pravougaoni kanal i ogranak (SMACNA)', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'rect', lockAsAc: true, p: [],
  calc: smacConv([-0.75, -0.53, -0.03, 0.33, 1.03, 1.10, 2.15, 2.93, 4.18, 4.78], [-0.69, -0.21, 0.23, 0.67, 1.17, 1.66, 2.67, 3.36, 3.93, 5.13]) },
{ id: '5-9', n: 'Račva konvergentna, pravougaona, ulaz ogranka 45° (SMACNA)', cat: 'racva', cls: 'junc', flow: 'conv', shape: 'rect', lockAsAc: true, p: [],
  calc: smacConv([-0.83, -0.68, -0.30, 0.28, 0.55, 1.03, 1.50, 1.93, 2.50, 3.03], [-0.72, -0.52, -0.23, 0.34, 0.76, 1.14, 1.83, 2.01, 2.90, 3.63]) }
);
// ===== 5 RAČVE — DIVERGENTNE (ubacivanje) =====
const V11 = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
const C523s = (J, w) => interp1([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0], [0.40, 0.32, 0.26, 0.20, 0.14, 0.10, 0.06, 0.02, 0], J.Vs / J.Vc, w, 'Vs/Vc');
function roundDiv(id, n, ys, note) {
  return { id, n, cat: 'racva', cls: 'junc', flow: 'div', shape: 'round', lockAsAc: true, p: [], note: (note || '') + 'Glavni tok: Cc,s prema 5-23.',
    calc(p, J, w) { asAcWarn(J, w); return { Cb: interp1(V11, ys, J.Vb / J.Vc, w, 'Vb/Vc'), Cs: C523s(J, w) }; } };
}
const C522 = [[0.25, 0.25], [0.33, 0.25], [0.5, 0.5], [0.67, 0.5], [1.0, 0.5], [1.0, 1.0], [1.33, 1.0], [2.0, 1.0]];
const T523 = { // θ: [Ab/Ac redovi (0.1..0.8)], kolone Qb/Qc 0.1..0.9
  30: [[0.28, 1.5, 4.3, 8.3, 15.0, N, N, N, N], [0.40, 0.26, 0.58, 1.3, 2.5, 4.1, 6.1, 8.6, 11.0], [0.55, 0.28, 0.24, 0.38, 0.76, 1.3, 2.0, 3.0, 4.1], [0.59, 0.33, 0.21, 0.20, 0.27, 0.40, 0.62, 0.92, 1.3], [0.65, 0.41, 0.26, 0.19, 0.18, 0.22, 0.32, 0.47, 0.67], [0.69, 0.46, 0.31, 0.21, 0.17, 0.16, 0.20, 0.28, 0.39], [0.72, 0.51, 0.36, 0.25, 0.18, 0.15, 0.16, 0.20, 0.26], [0.75, 0.55, 0.40, 0.28, 0.21, 0.16, 0.15, 0.16, 0.19]],
  45: [[0.60, 2.1, 5.1, 9.3, 16.0, N, N, N, N], [0.56, 0.56, 1.0, 1.8, 3.2, 4.9, 7.1, 9.6, 13.0], [0.66, 0.48, 0.52, 0.73, 1.2, 1.8, 2.7, 3.7, 4.9], [0.66, 0.47, 0.40, 0.43, 0.54, 0.69, 0.95, 1.3, 1.7], [0.71, 0.52, 0.41, 0.38, 0.40, 0.45, 0.59, 0.78, 1.0], [0.74, 0.56, 0.44, 0.37, 0.35, 0.36, 0.43, 0.54, 0.68], [0.71, 0.59, 0.47, 0.38, 0.34, 0.32, 0.35, 0.41, 0.50], [0.78, 0.62, 0.49, 0.40, 0.34, 0.31, 0.32, 0.35, 0.40]],
  60: [[1.0, 2.9, 6.2, 10.0, N, N, N, N, N], [0.77, 0.96, 1.6, 2.5, 4.0, 6.0, 8.3, 11.0, N], [0.80, 0.75, 0.89, 1.2, 1.8, 2.6, 3.5, 4.6, 6.0], [0.76, 0.65, 0.65, 0.74, 0.89, 1.1, 1.4, 1.8, 2.3], [0.79, 0.66, 0.61, 0.62, 0.68, 0.76, 0.94, 1.2, 1.5], [0.81, 0.68, 0.60, 0.58, 0.58, 0.61, 0.72, 0.87, 1.1], [0.82, 0.69, 0.61, 0.56, 0.54, 0.54, 0.60, 0.70, 0.82], [0.83, 0.71, 0.62, 0.56, 0.52, 0.50, 0.53, 0.60, 0.68]],
  90: [[2.1, 4.8, 8.9, 14.0, N, N, N, N, N], [1.3, 1.9, 2.9, 4.1, 6.2, 8.5, 11.0, N, N], [1.1, 1.4, 1.8, 2.3, 3.2, 4.3, 5.5, 6.9, 8.5], [0.99, 1.1, 1.3, 1.5, 1.7, 2.0, 2.4, 3.0, 3.6], [0.97, 1.0, 1.1, 1.2, 1.4, 1.5, 1.8, 2.1, 2.5], [0.96, 0.97, 1.0, 1.1, 1.1, 1.2, 1.4, 1.7, 2.0], [0.95, 0.94, 0.95, 0.98, 1.0, 1.1, 1.2, 1.4, 1.6], [0.95, 0.92, 0.92, 0.93, 0.94, 0.95, 1.1, 1.2, 1.4]] };
const AB8 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const T524b = [[0.81, 0.65, 0.51, 0.38, 0.28, 0.20, 0.11, 0.06, 0.14, 0.30, 0.51, 0.76, 1.0], [0.84, 0.69, 0.56, 0.44, 0.34, 0.26, 0.19, 0.15, 0.15, 0.30, 0.51, 0.76, 1.0], [0.87, 0.74, 0.63, 0.54, 0.45, 0.38, 0.29, 0.24, 0.23, 0.30, 0.51, 0.76, 1.0], [0.90, 0.82, 0.79, 0.66, 0.59, 0.53, 0.43, 0.36, 0.33, 0.39, 0.51, 0.76, 1.0], [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]];
const V13 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
function smacDiv(rows, mainFn) { return function (p, J, w) { asAcWarn(J, w);
  return { Cb: interp2(V18, Q9, tri(rows), J.Vb / J.Vc, J.Qb / J.Qc, w, 'Vb/Vc', 'Qb/Qc'), Cs: mainFn(J, w) }; }; }
const C531s = (J, w) => { w.push('Glavni tok prema 5-31: u izvoru je argument označen Vb/Vc'); return interp1(V18, [0.03, 0.04, 0.07, 0.12, 0.13, 0.14, 0.27, 0.30, 0.25], J.Vb / J.Vc, w, 'Vb/Vc'); };
F.push(
roundDiv('5-10', 'T-račva 90°, divergentna, okrugla, konusni ogranak', [1.0, 0.85, 0.74, 0.62, 0.52, 0.42, 0.36, 0.32, 0.32, 0.37, 0.52]),
roundDiv('5-11', 'Račva Y 45°, divergentna, okrugla, konusni ogranak', [1.0, 0.84, 0.61, 0.41, 0.27, 0.17, 0.12, 0.12, 0.14, 0.18, 0.27]),
roundDiv('5-12', 'T-račva divergentna, okrugla, sa koljenom 90° (ogranak 90° na kanal)', [1.0, 1.03, 1.08, 1.18, 1.33, 1.56, 1.86, 2.2, 2.6, 3.0, 3.4]),
roundDiv('5-13', 'T-račva divergentna, okrugla, sa koljenom 45° (ogranak 90°)', [1.0, 1.32, 1.51, 1.60, 1.65, 1.74, 1.87, 2.0, 2.2, 2.5, 2.7]),
roundDiv('5-14', 'T-račva divergentna, okrugla (konusni ogranak), sa koljenom 45°', [1.0, 0.94, 0.88, 0.84, 0.80, 0.82, 0.84, 0.87, 0.90, 0.95, 1.02]),
roundDiv('5-15', 'Račva Y 45°, okrugla, sa koljenom 60° (ogranak 90°)', [1.0, 0.88, 0.77, 0.68, 0.65, 0.69, 0.73, 0.88, 1.14, 1.54, 2.2]),
roundDiv('5-16', 'Račva Y 45°, divergentna, okrugla (konusni ogranak), sa koljenom 60°', [1.0, 0.82, 0.63, 0.52, 0.45, 0.42, 0.41, 0.40, 0.41, 0.45, 0.56]),
{ id: '5-17', n: 'Račva Y 48°, divergentna, konusni kanal i ogranak, sa koljenom 45°', cat: 'racva', cls: 'junc', flow: 'div', shape: 'round', p: [],
  calc(p, J, w) { return { Cb: interp1([0.2, 0.4, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0], [0.76, 0.60, 0.52, 0.50, 0.51, 0.52, 0.56, 0.61, 0.68, 0.86, 1.1, 1.4, 1.8, 2.2, 2.6, 3.1, 3.7, 4.2], J.Vb / J.Vc, w, 'Vb/Vc'),
    Cs: interp1([0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0], [0.14, 0.06, 0.05, 0.09, 0.18, 0.30, 0.46, 0.64, 0.84, 1.0], J.Vs / J.Vc, w, 'Vs/Vc') }; } },
roundDiv('5-18', 'T-račva divergentna, okrugla, sa koljenom 60° (ogranak 45°)', [1.0, 1.06, 1.15, 1.29, 1.45, 1.65, 1.89, 2.2, 2.5, 2.9, 3.3]),
roundDiv('5-19', 'T-račva divergentna, okrugla (konusni ogranak), sa koljenom 60° (ogranak 45°)', [1.0, 0.95, 0.90, 0.86, 0.81, 0.79, 0.79, 0.81, 0.86, 0.96, 1.10]),
roundDiv('5-20', 'Račva Y 45°, divergentna, okrugla, sa koljenom 30° (ogranak 45°)', [1.0, 0.84, 0.72, 0.62, 0.54, 0.50, 0.56, 0.71, 0.92, 1.22, 1.66]),
roundDiv('5-21', 'Račva Y 45°, divergentna, okrugla (konusni ogranak), sa koljenom 30°', [1.0, 0.93, 0.71, 0.55, 0.44, 0.42, 0.42, 0.44, 0.47, 0.54, 0.62]),
{ id: '5-22', n: 'T-račva 90°, divergentna, pravougaona (r/Wb = 1)', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect', p: [],
  calc(p, J, w) { const i = nearestCombo(C522, J.Ab / J.As, J.Ab / J.Ac, w, 'Ab/As', 'Ab/Ac'), q = J.Qb / J.Qc;
    const B = [[0.55, 0.50, 0.60, 0.85, 1.2, 1.8, 3.1, 4.4, 6.0], [0.35, 0.35, 0.50, 0.80, 1.3, 2.0, 2.8, 3.8, 5.0], [0.62, 0.48, 0.40, 0.40, 0.48, 0.60, 0.78, 1.1, 1.5], [0.52, 0.40, 0.32, 0.30, 0.34, 0.44, 0.62, 0.92, 1.4], [0.44, 0.38, 0.38, 0.41, 0.52, 0.68, 0.92, 1.2, 1.6], [0.67, 0.55, 0.46, 0.37, 0.32, 0.29, 0.29, 0.30, 0.37], [0.70, 0.60, 0.51, 0.42, 0.34, 0.28, 0.26, 0.26, 0.29], [0.60, 0.52, 0.43, 0.33, 0.24, 0.17, 0.15, 0.17, 0.21]];
    const S = [[-0.01, -0.03, -0.01, 0.05, 0.13, 0.21, 0.29, 0.38, 0.46], [0.08, 0, -0.02, -0.01, 0.02, 0.08, 0.16, 0.24, 0.34], [-0.03, -0.06, -0.05, 0, 0.06, 0.12, 0.19, 0.27, 0.35], [0.04, -0.02, -0.04, -0.03, -0.01, 0.04, 0.12, 0.23, 0.37], [0.72, 0.48, 0.28, 0.13, 0.05, 0.04, 0.09, 0.18, 0.30], [-0.02, -0.04, -0.04, -0.01, 0.06, 0.13, 0.22, 0.30, 0.38], [0.10, 0, 0.01, -0.03, -0.01, 0.03, 0.10, 0.20, 0.30], [0.62, 0.38, 0.23, 0.23, 0.08, 0.05, 0.06, 0.10, 0.20]];
    return { Cb: interp1(Q9, B[i], q, w, 'Qb/Qc'), Cs: interp1(Q9, S[i], q, w, 'Qb/Qc') }; } },
{ id: '5-23', n: 'Račva Y (30/45/60/90°), divergentna, pravougaona i okrugla', cat: 'racva', cls: 'junc', flow: 'div', shape: 'any', lockAsAc: true,
  p: [{ k: 'th', l: 'Ugao ogranka θ', u: '°', t: 'num', d: 45 }], note: 'Pravougaona izvedba: Hb = Hc.',
  calc(p, J, w) { asAcWarn(J, w); const TH = [30, 45, 60, 90], ix = bracket(TH, p.th, w, 'θ');
    return { Cb: blend(TH, ix, ix.map(i => interp2(AB8, Q9, T523[TH[i]], J.Ab / J.Ac, J.Qb / J.Qc, w, 'Ab/Ac', 'Qb/Qc')), p.th), Cs: C523s(J, w) }; } },
{ id: '5-24', n: 'Račva Y divergentna, pravougaona (Ac = As + Ab), θ 15–90°', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect',
  p: [{ k: 'th', l: 'Ugao ogranka θ', u: '°', t: 'num', d: 45 }],
  calc(p, J, w) { if (Math.abs((J.As + J.Ab) / J.Ac - 1) > 0.05) w.push('Tabela važi za Ac = As + Ab; stvarno (As+Ab)/Ac = ' + fmt((J.As + J.Ab) / J.Ac));
    const Cb = interp2([15, 30, 45, 60, 90], V13, T524b, p.th, J.Vb / J.Vc, w, 'θ', 'Vb/Vc');
    const vs = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0], x = J.Vs / J.Vc;
    const m60 = interp1(vs, [1.0, 0.81, 0.64, 0.50, 0.36, 0.25, 0.16, 0.04, 0, 0.07, 0.39, 0.90, 1.8, 3.2], x, w, 'Vs/Vc');
    const m90 = interp2([0.4, 0.5, 0.6, 0.7, 0.8], vs, [[1.0, 0.81, 0.64, 0.50, 0.36, 0.25, 0.16, 0.04, 0, 0.07, 0.39, 0.90, 1.8, 3.2], [1.0, 0.81, 0.64, 0.52, 0.40, 0.30, 0.23, 0.17, 0.20, 0.36, 0.79, 1.4, 2.4, 4.0], [1.0, 0.81, 0.64, 0.52, 0.38, 0.28, 0.20, 0.10, 0.10, 0.21, 0.59, 1.2, N, N], [1.0, 0.81, 0.64, 0.50, 0.37, 0.27, 0.18, 0.07, 0.05, 0.14, 0.39, N, N, N], [1.0, 0.81, 0.64, 0.50, 0.36, 0.25, 0.16, 0.04, 0, 0.07, N, N, N, N]], J.As / J.Ac, x, w, 'As/Ac', 'Vs/Vc');
    return { Cb, Cs: p.th <= 60 ? m60 : m60 + (m90 - m60) * (p.th - 60) / 30 }; } },
{ id: '5-25', n: 'T-račva divergentna, pravougaoni kanal — okrugli ogranak (SMACNA)', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect', bShape: 'round', lockAsAc: true, p: [],
  calc: smacDiv([[1.00], [1.01, 1.07], [1.14, 1.10, 1.08], [1.18, 1.31, 1.12, 1.13], [1.30, 1.38, 1.20, 1.23, 1.26], [1.46, 1.58, 1.45, 1.31, 1.39, 1.48], [1.70, 1.82, 1.65, 1.51, 1.56, 1.64, 1.71], [1.93, 2.06, 2.00, 1.85, 1.70, 1.76, 1.80, 1.88], [2.06, 2.17, 2.10, 2.13, 2.06, 1.98, 1.99, 2.00, 2.07]], C523s) },
{ id: '5-26', n: 'T-račva divergentna, pravougaoni kanal — okrugli konusni ogranak', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect', bShape: 'round', lockAsAc: true, p: [],
  calc(p, J, w) { asAcWarn(J, w); return { Cb: interp1([0.40, 0.50, 0.75, 1.0, 1.3, 1.5], [0.80, 0.83, 0.90, 1.0, 1.1, 1.4], J.Vb / J.Vc, w, 'Vb/Vc'), Cs: C523s(J, w) }; } },
{ id: '5-27', n: 'T-račva divergentna, pravougaona, ulaz ogranka 45° (SMACNA) — preporučena', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect', lockAsAc: true, p: [],
  calc: smacDiv([[0.91], [0.81, 0.79], [0.77, 0.72, 0.70], [0.78, 0.73, 0.69, 0.66], [0.78, 0.98, 0.85, 0.79, 0.74], [0.90, 1.11, 1.16, 1.23, 1.03, 0.86], [1.19, 1.22, 1.26, 1.29, 1.54, N, 0.92], [1.35, 1.42, 1.55, 1.59, 1.63, 1.50, 1.31, 1.09], [1.44, 1.50, 1.75, 1.74, 1.72, 2.24, 1.63, 1.40, 1.17]], C523s) },
{ id: '5-28', n: 'T-račva divergentna, pravougaona, ravan ogranak (SMACNA)', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect', lockAsAc: true, p: [],
  calc: smacDiv([[1.03], [1.04, 1.01], [1.11, 1.03, 1.05], [1.16, 1.21, 1.17, 1.12], [1.38, 1.40, 1.30, 1.36, 1.27], [1.52, 1.61, 1.68, 1.91, 1.47, 1.66], [1.79, 2.01, 1.90, 2.31, 2.28, 2.20, 1.95], [2.07, 2.28, 2.13, 2.71, 2.99, 2.81, 2.09, 2.20], [2.32, 2.54, 2.64, 3.09, 3.72, 2.48, 2.21, 2.57, 2.32]], C523s) },
Object.assign({ id: '5-29', n: 'T-račva divergentna, pravougaona, ulaz 45° sa klapnom — loše rješenje', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect', lockAsAc: true, poor: true, p: [] },
  { calc: smacDiv([[0.61], [0.46, 0.61], [0.43, 0.50, 0.54], [0.39, 0.43, 0.62, 0.53], [0.34, 0.57, 0.77, 0.73, 0.68], [0.37, 0.64, 0.85, 0.98, 1.07, 0.83], [0.57, 0.71, 1.04, 1.16, 1.54, 1.36, 1.18], [0.89, 1.08, 1.28, 1.30, 1.69, 2.09, 1.81, 1.47], [1.33, 1.34, 2.04, 1.78, 1.90, 2.40, 2.77, 2.23, 1.92]], C531s) }),
Object.assign({ id: '5-30', n: 'T-račva divergentna, pravougaona, sa klapnom — loše rješenje', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect', lockAsAc: true, poor: true, p: [] },
  { calc: smacDiv([[0.58], [0.67, 0.64], [0.78, 0.76, 0.75], [0.88, 0.98, 0.81, 1.01], [1.12, 1.05, 1.08, 1.18, 1.29], [1.49, 1.48, 1.40, 1.51, 1.70, 1.91], [2.10, 2.21, 2.25, 2.29, 2.32, 2.48, 2.53], [2.72, 3.30, 2.84, 3.09, 3.30, 3.19, 3.29, 3.16], [3.42, 4.58, 3.65, 3.92, 4.20, 4.15, 4.14, 4.10, 4.05]], C531s) }),
Object.assign({ id: '5-31', n: 'T-račva divergentna, pravougaona, sa ekstraktorom — loše rješenje', cat: 'racva', cls: 'junc', flow: 'div', shape: 'rect', lockAsAc: true, poor: true, p: [] },
  { calc: smacDiv([[0.60], [0.62, 0.69], [0.74, 0.80, 0.82], [0.99, 1.10, 0.95, 0.90], [1.48, 1.12, 1.41, 1.24, 1.21], [1.91, 1.33, 1.43, 1.52, 1.55, 1.64], [2.47, 1.67, 1.70, 2.04, 1.86, 1.98, 2.47], [3.17, 2.40, 2.33, 2.53, 2.31, 2.51, 3.13, 3.25], [3.85, 3.37, 2.89, 3.23, 3.09, 3.03, 3.30, 3.74, 4.11]], C531s) }),
// ---- simetrične (dvije grane, bez prolaza): 's' = grana 2, 'b' = grana 1 ----
{ id: '5-32', n: 'Simetrična Y račva — „lastin rep" (dovetail), pravougaona, r/Wc = 1,5', cat: 'racva', cls: 'junc', flow: 'both', sym: true, shape: 'rect', p: [],
  note: 'Važi za podjelu protoka 50 % / 50 %.',
  calc(p, J, w) { if (Math.abs(J.Qb / J.Qc - 0.5) > 0.05) w.push('Tabela važi za Q1b/Qc = Q2b/Qc = 0,5; stvarno ' + fmt(J.Qb / J.Qc));
    const T = J.flow === 'div' ? [0.30, 0.25] : [0.23, 0.07];
    return { Cb: interp1([0.5, 1.0], T, J.Ab / J.Ac, w, 'A1b/Ac'), Cs: interp1([0.5, 1.0], T, J.As / J.Ac, w, 'A2b/Ac') }; } },
{ id: '5-33', n: 'Simetrična Y račva (±θ), pravougaona i okrugla', cat: 'racva', cls: 'junc', flow: 'both', sym: true, shape: 'any',
  p: [{ k: 'th', l: 'Ugao grane θ (od ose)', u: '°', t: 'num', d: 30 }], note: 'A1b = A2b, Ac = A1b + A2b.',
  calc(p, J, w) { if (Math.abs((J.As + J.Ab) / J.Ac - 1) > 0.05) w.push('Tabela važi za Ac = A1b + A2b; stvarno ' + fmt((J.As + J.Ab) / J.Ac));
    if (J.flow === 'div') { const f = x => interp2([15, 30, 45, 60, 90], V13, T524b, p.th, x, w, 'θ', 'Vb/Vc'); return { Cb: f(J.Vb / J.Vc), Cs: f(J.Vs / J.Vc) }; }
    const f = x => interp2([15, 30, 45], QQ11, [[-2.6, -1.9, -1.3, -0.77, -0.30, 0.10, 0.41, 0.67, 0.85, 0.97, 1.0], [-2.1, -1.5, -1.0, -0.53, -0.10, 0.28, 0.69, 0.91, 1.1, 1.4, 1.6], [-1.3, -0.93, -0.55, -0.16, 0.20, 0.56, 0.92, 1.3, 1.6, 2.0, 2.3]], p.th, x, w, 'θ', 'Qb/Qc');
    return { Cb: f(J.Qb / J.Qc), Cs: f(J.Qs / J.Qc) }; } }
);
// Ispravke izvornih štamparskih grešaka (prikazuju se u aplikaciji)
const CORR = [
  '2-8: „0 45" → 0,45', '3-7: „028", „013", „004" → 0,28 / 0,13 / 0,04', '3-10: „095" → 0,95; red bez oznake = Ho/Wo → ∞', '3-11: K za W/H=3,0 „9.83" → 0,83',
  '4-2: zaglavlje kolone „30" (drugo) → 20°', '4-4: A/A1=2, θ=60° vrijednost „0.2" isključena (odstupa od niza)', '4-6: dvije nekonzistentne ćelije isključene',
  '5-1: Cc,b za Qb/Qc=0,1 i 0,2, Ab/Ac=0,6: dodat izostavljeni predznak minus', '5-2: Cc,b red Qb/Qc=0,6 za Ab/Ac≥0,6 isključen (nemonotono); Cc,s „3.6", „4.8" → −3,6 / −4,8',
  '5-3: zaglavlja „Qs/Qc" → Qb/Qc (potvrđeno Idelchik formulom Cc,s = 1,55·x − x²)', '5-4: Cc,s ispravke decimalnih zareza i predznaka (As/Ac=0,6 redovi), oznaka reda 0,5 → 0,8', '5-4/5-5: argument je Qb/Qs (vrijednosti do 2,0)',
  '5-5: tri nekonzistentne ćelije Cc,s isključene', '5-6: zaglavlje „Qc/Qc" → Qb/Qc; Cc,s 1,33/1,0 pri 0,1 isključen', '5-27: vrijednost „0.25" (Vb/Vc=1,4; Qb/Qc=0,6) isključena',
  '5-10/5-14: argument u izvoru „Vb/Vs"; korišćeno Vb/Vc kao za cijelu familiju Jones & Sepsy', '6-1: „019" → 0,19', 'Isključene ćelije se preskaču — interpolacija ide između susjednih važećih vrijednosti'];
// ===== 6 PREPREKE I KLAPNE =====
const TH61 = [0, 10, 20, 30, 40, 50, 60, 70, 75, 80, 85];
const T61 = [[0.19, 0.27, 0.37, 0.49, 0.61, 0.74, 0.86, 0.96, 0.99, 1.0, 1.0], [0.19, 0.32, 0.48, 0.69, 0.94, 1.2, 1.5, 1.7, 1.8, 1.9, 1.9], [0.19, 0.37, 0.64, 1.0, 1.5, 2.1, 2.8, 3.5, 3.7, 3.9, 4.1], [0.19, 0.45, 0.87, 1.6, 2.6, 4.1, 6.1, 8.4, 9.4, 10, 10], [0.19, 0.54, 1.2, 2.5, 5.0, 9.6, 17, 30, 38, 45, 50], [0.19, 0.67, 1.8, 4.4, 11, 32, 113, N, N, N, N]];
const TH62 = [0, 10, 20, 30, 40, 50, 60, 65, 70];
const T62 = [[0.04, 0.30, 1.1, 3.0, 8.0, 23, 60, 100, 190], [0.08, 0.33, 1.2, 3.3, 9.0, 26, 70, 128, 210], [0.13, 0.35, 1.3, 3.6, 10, 29, 80, 155, 230]];
const LR = [0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.5], TH65 = [0, 10, 20, 30, 40, 50, 60, 70];
const T65 = [[0.52, 0.79, 1.4, 2.3, 5.0, 9, 14, 32], [0.52, 0.85, 1.5, 2.4, 5.0, 9, 16, 38], [0.52, 0.92, 1.5, 2.4, 5.0, 9, 18, 45], [0.52, 0.92, 1.5, 2.4, 5.4, 9, 21, 45], [0.52, 0.92, 1.5, 2.5, 5.4, 9, 22, 55], [0.52, 1.0, 1.6, 2.6, 5.4, 10, 24, 65], [0.52, 1.0, 1.6, 2.7, 5.4, 10, 28, 102]];
const T66 = [[0.52, 0.85, 2.1, 4.1, 9, 21, 73, 284], [0.52, 0.92, 2.2, 5.0, 11, 28, 100, 332], [0.52, 1.0, 2.3, 5.4, 13, 33, 122, 377], [0.52, 1.0, 2.3, 6.0, 14, 38, 148, 411], [0.52, 1.1, 2.4, 6.6, 18, 54, 188, 495], [0.52, 1.2, 2.7, 7.3, 21, 65, 245, 547], [0.52, 1.4, 3.2, 9.0, 28, 107, 361, 677]];
function row62(sec, p) { const r = sec.b / sec.a; return r < 0.25 ? 0 : r <= 1.0 ? 1 : 2; }
function lr65(sec, p) { const N_ = p.nb > 0 ? p.nb : Math.max(1, Math.ceil(sec.b / 150)); return N_ * sec.a / (2 * (sec.a + sec.b)); }
// Co klapne za zadati ugao — koristi se i za balansiranje (inverzija)
const DAMPERS = {
  '6-1': (p, sec, th, w) => interp2([0.5, 0.6, 0.7, 0.8, 0.9, 1.0], TH61, T61, p.dd || 1.0, th, w, 'D/Do', 'θ'),
  '6-2': (p, sec, th, w) => interp1(TH62, T62[row62(sec, p)], th, w, 'θ'),
  '6-5': (p, sec, th, w) => interp2(LR, TH65, T65, lr65(sec, p), th, w, 'L/R', 'θ'),
  '6-6': (p, sec, th, w) => interp2(LR, TH65, T66, lr65(sec, p), th, w, 'L/R', 'θ') };
const DMAX = { '6-1': 85, '6-2': 70, '6-5': 70, '6-6': 70 };
function dampAngle(fid, p, sec, Creq) { // najmanji θ za koji je Co(θ) >= Creq (Co monoton raste sa θ)
  const f = th => DAMPERS[fid](p, sec, th, null); const max = (fid === '6-1' && (p.dd || 1) >= 0.95) ? 60 : DMAX[fid];
  if (Creq <= f(0)) return 0; if (Creq > f(max)) return NaN;
  let lo = 0, hi = max; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (f(m) < Creq) lo = m; else hi = m; } return (lo + hi) / 2;
}
const P_DTH = { k: 'th', l: 'Ugao zatvaranja θ (0° = otvorena)', u: '°', t: 'num', d: 0 };
F.push(
{ id: '6-1', n: 'Regulaciona klapna leptirasta, okrugla', cat: 'klapna', cls: 'local', shape: 'round', damper: true,
  p: [P_DTH, { k: 'dd', l: 'Odnos D/Do (list / kanal)', t: 'num', d: 1.0 }], calc(p, g, w) { return DAMPERS['6-1'](p, g.up, p.th, w); } },
{ id: '6-2', n: 'Regulaciona klapna leptirasta, pravougaona (jedan list)', cat: 'klapna', cls: 'local', shape: 'rect', damper: true,
  p: [P_DTH], note: 'Red tabele po H/W = b/a: < 0,25 / 0,25–1,0 (tip 1) / > 1,0 (tip 2).', calc(p, g, w) { return DAMPERS['6-2'](p, g.up, p.th, w); } },
{ id: '6-3', n: 'Zasun (klizna ploča), okrugli', cat: 'klapna', cls: 'local', shape: 'round',
  p: [{ k: 'h', l: 'Otvor h (od dna)', u: 'mm', t: 'num', d: 100 }],
  calc(p, g, w) { return interp1([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], [35, 10, 4.6, 2.1, 0.98, 0.44, 0.17, 0.06], p.h / g.up.D, w, 'h/D'); } },
{ id: '6-4', n: 'Zasun (klizna ploča), pravougaoni', cat: 'klapna', cls: 'local', shape: 'rect',
  p: [{ k: 'h', l: 'Otvor h (po visini b)', u: 'mm', t: 'num', d: 100 }],
  calc(p, g, w) { return interp2([0.5, 1.0, 1.5, 2.0], [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], [[14, 6.9, 3.3, 1.7, 0.83, 0.32, 0.09], [19, 8.8, 4.5, 2.4, 1.2, 0.55, 0.17], [20, 9.1, 4.7, 2.7, 1.2, 0.47, 0.11], [18, 8.8, 4.5, 2.3, 1.1, 0.51, 0.13]], g.up.b / g.up.a, p.h / g.up.b, w, 'H/W', 'h/H'); } },
{ id: '6-5', n: 'Žaluzinska klapna, paralelne lamele', cat: 'klapna', cls: 'local', shape: 'rect', damper: true,
  p: [P_DTH, { k: 'nb', l: 'Broj lamela N (0 = auto, 1 lamela / 150 mm visine)', t: 'num', d: 0 }], note: 'L/R = N·W / (2(H+W)); W = a (paralelno osi lamela).',
  calc(p, g, w) { return DAMPERS['6-5'](p, g.up, p.th, w); } },
{ id: '6-6', n: 'Žaluzinska klapna, suprotne lamele (opposed blade)', cat: 'klapna', cls: 'local', shape: 'rect', damper: true,
  p: [P_DTH, { k: 'nb', l: 'Broj lamela N (0 = auto, 1 lamela / 150 mm visine)', t: 'num', d: 0 }], note: 'L/R = N·W / (2(H+W)); W = a (paralelno osi lamela).',
  calc(p, g, w) { return DAMPERS['6-6'](p, g.up, p.th, w); } },
{ id: '6-7', n: 'Mrežica (zaštitna rešetka od žice) u kanalu', cat: 'prepreka', cls: 'local', shape: 'any',
  p: [{ k: 'n', l: 'Slobodni presjek mrežice n', t: 'num', d: 0.7 }, { k: 'r', l: 'A1/Ao (presjek na mjestu mrežice / kanal)', t: 'num', d: 1.0 }],
  calc(p, g, w) { return interp2([0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 2.0, 2.5, 3.0, 4.0, 6.0], [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], [
    [155, 75, 42, 24, 15, 8.0, 3.5, 0], [69, 33, 19, 11, 6.4, 3.6, 1.6, 0], [39, 19, 10, 6.1, 3.6, 2.0, 0.88, 0], [17, 8.3, 4.7, 2.7, 1.6, 0.89, 0.39, 0], [9.7, 4.7, 2.7, 1.5, 0.91, 0.50, 0.22, 0],
    [6.2, 3.0, 1.7, 0.97, 0.58, 0.32, 0.14, 0], [4.3, 2.1, 1.2, 0.67, 0.40, 0.22, 0.10, 0], [3.2, 1.5, 0.87, 0.49, 0.30, 0.16, 0.07, 0], [2.4, 1.2, 0.66, 0.38, 0.23, 0.12, 0.05, 0],
    [1.6, 0.75, 0.43, 0.24, 0.15, 0.08, 0.04, 0], [0.99, 0.48, 0.27, 0.16, 0.09, 0.05, 0.02, 0], [0.69, 0.33, 0.19, 0.11, 0.06, 0.04, 0.02, 0], [0.39, 0.19, 0.11, 0.06, 0.04, 0.02, 0.01, 0], [0.17, 0.08, 0.05, 0.03, 0.02, 0.01, 0, 0]],
    p.r, p.n, w, 'A1/Ao', 'n'); } },
{ id: '6-8', n: 'Perforirani lim (debeli) u kanalu', cat: 'prepreka', cls: 'local', shape: 'any',
  p: [{ k: 'n', l: 'Slobodni presjek n = Aor/Ao', t: 'num', d: 0.5 }, { k: 'td', l: 't/d (debljina / prečnik rupe)', t: 'num', d: 0.2 }],
  calc(p, g, w) { return interp2([0.015, 0.2, 0.4, 0.6], [0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90], [[52, 30, 18, 8.3, 4.0, 2.0, 0.97, 0.42, 0.13], [48, 28, 17, 7.7, 3.8, 1.9, 0.91, 0.40, 0.13], [46, 27, 17, 7.4, 3.6, 1.8, 0.88, 0.39, 0.13], [42, 24, 15, 6.6, 3.2, 1.6, 0.80, 0.36, 0.13]], p.td, p.n, w, 't/d', 'n'); } },
{ id: '6-9', n: 'Cijev (valjak) koja prolazi kroz kanal', cat: 'prepreka', cls: 'local', shape: 'any',
  p: [{ k: 'd', l: 'Prečnik cijevi d', u: 'mm', t: 'num', d: 50 }, { k: 'y', l: 'Odmak od ose kanala y', u: 'mm', t: 'num', d: 0 }],
  calc(p, g, w) { const s = g.up, Lc = s.shape === 'round' ? s.D : s.a, Sm = p.d * Lc / 1e6, Re = g.up.v * p.d / 1000 / g.nu;
    if (Sm / s.A > 0.3) w.push('Tabela važi za Sm/Ao < 0,3');
    const Co = interp2([0.1, 0.5, 1, 5, 10, 50, 100, 500, 200000, 300000, 400000, 500000, 600000, 1000000], [0.05, 0.10, 0.15, 0.20], [
      [3.9, 8.4, 14, 19], [1.5, 3.2, 5.2, 7.1], [0.66, 1.4, 2.3, 3.2], [0.30, 0.64, 1.1, 1.4], [0.17, 0.38, 0.62, 0.84], [0.11, 0.24, 0.38, 0.52], [0.10, 0.21, 0.35, 0.47],
      [0.07, 0.15, 0.24, 0.33], [0.07, 0.15, 0.24, 0.33], [0.07, 0.16, 0.26, 0.35], [0.05, 0.11, 0.19, 0.25], [0.04, 0.09, 0.14, 0.19], [0.02, 0.05, 0.07, 0.10], [0.02, 0.05, 0.07, 0.10]], Re, Sm / s.A, w, 'Re', 'Sm/Ao');
    const yD = p.y / (s.shape === 'round' ? s.D : s.b);
    return Co * interp1([0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40], [1.0, 0.97, 0.93, 0.89, 0.84, 0.79, 0.74, 0.67, 0.58], yD, w, 'y/D'); } },
{ id: '6-10', n: 'Okrugli kanal spušten ispod prepreke (L/D = 0,33)', cat: 'prepreka', cls: 'local', shape: 'round', p: [], calc() { return 0.24; } },
{ id: '6-11', n: 'Pravougaoni kanal spušten ispod prepreke', cat: 'prepreka', cls: 'local', shape: 'rect',
  p: [{ k: 'L', l: 'Dubina spuštanja L', u: 'mm', t: 'num', d: 50 }],
  calc(p, g, w) { return interp2([1.0, 4.0], [0.125, 0.15, 0.25, 0.30], [[0.26, 0.30, 0.33, 0.35], [0.10, 0.14, 0.22, 0.30]], g.up.a / g.up.b, p.L / g.up.b, w, 'W/H', 'L/H'); } }
);
// ===== RAČUNSKO JEZGRO =====
const FIT = {}; F.forEach(f => FIT[f.id] = f);
const ROUND = [80, 100, 125, 160, 200, 250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1120, 1250];
const OBJ = {
  stan: { n: 'Stanovi, hotelske sobe (NR 25–30)', v: [4, 3, 2], R: 0.65 },
  sala: { n: 'Studiji, sale, teatri (NR 20–25)', v: [4, 3, 1.5], R: 0.55 },
  kanc: { n: 'Kancelarije, učionice (NR 30–35)', v: [6, 4.5, 3], R: 1.0 },
  rest: { n: 'Restorani, trgovine (NR 35–40)', v: [7, 5, 3], R: 1.25 },
  ind: { n: 'Industrija, garaže (NR 45+)', v: [12, 8, 5], R: 1.5 },
  cust: { n: 'Korisnički (ručno zadato)', v: [6, 4.5, 3], R: 1.0 } };
const CATS = [['glavni', 'Glavni kanal'], ['ogranak', 'Ogranak'], ['prikljucak', 'Priključak terminala']];
const CATI = { glavni: 0, ogranak: 1, prikljucak: 2 };

function air(t, z) {
  const T = t + 273.15, p = 101325 * Math.pow(1 - 2.25577e-5 * z, 5.25588);
  const rho = p / (287.05 * T), mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4);
  return { rho, mu, nu: mu / rho, p };
}
function section(Q, d, A_) { // Q m3/h, d {shape,a,b,D} mm
  const s = { shape: d.shape, a: +d.a || 0, b: +d.b || 0, D: +d.D || 0, Q: +Q };
  if (s.shape === 'round') { s.A = Math.PI * s.D * s.D / 4e6; s.Dh = s.D; }
  else { s.A = s.a * s.b / 1e6; s.Dh = 2 * s.a * s.b / (s.a + s.b); }
  s.v = s.A > 0 ? s.Q / 3600 / s.A : NaN; s.pd = A_.rho * s.v * s.v / 2;
  s.Re = s.v * s.Dh / 1000 / A_.nu; return s;
}
function friction(s, epsmm, A_) {
  const Re = s.Re, Dh = s.Dh / 1000, e = epsmm / 1000;
  if (!(Re > 0)) return { f: NaN, R: NaN };
  let f;
  if (Re < 2300) f = 64 / Re;
  else { f = 0.02; for (let i = 0; i < 60; i++) { const n = Math.pow(-2 * Math.log10(e / (3.7 * Dh) + 2.51 / (Re * Math.sqrt(f))), -2); if (Math.abs(n - f) < 1e-10) { f = n; break; } f = n; } }
  return { f, R: f / Dh * s.pd };
}

export { F, FIT, CORR, OBJ, interp1, interp2, bracket, blend, fmt, dampAngle, DAMPERS, air, section, friction, planeDims };
