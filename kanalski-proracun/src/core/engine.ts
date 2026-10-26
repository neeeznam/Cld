// Računsko jezgro: protoci, dionice, dimenzionisanje, prijedlozi suženja, Δp, kritična dionica, balansiranje.
import { FIT, air, dampAngle, friction, section } from './ashrae/library.js';
import {
  defaultDamper,
  defaultElbow,
  defaultJunction,
  defaultObstruction,
  defaultOpenEnd,
  defaultTransition,
  fitParams,
} from './catalog';
import type { Cat, Dims, Node, Project, Sec, Shape, Sizing, System } from './types';

export type Warn = { code: string; args?: Record<string, string | number> };

/** Dionica: niz elemenata sa istim protokom i istim presjekom. */
export interface Run {
  id: string;
  nodes: string[];
  parent: string | null;
  /** Kako dionica počinje: od klima komore, kao prolaz kroz račvu, kao ogranak, kao krak lastinog repa, iza prelaza. */
  start: 'root' | 'straight' | 'branch' | 'sym' | 'afterTransition';
  /** Račva (ili prelaz) iz koje dionica izlazi i broj priključka. */
  from: { node: string; port: number } | null;
  Q: number;
  cat: Cat;
  shape: Shape;
  size: Dims;
  /** Dimenzija koju bi metoda izabrala bez zadržavanja presjeka. */
  method: Dims | null;
  manual: boolean;
  kept: boolean;
  terminals: number;
  isMain: boolean;
}

export interface NodeRes {
  Q: number;
  run: string | null;
  sec: Sec | null;
  dn?: Sec | null;
  fid?: string;
  R?: number;
  f?: number;
  C?: number;
  /** Δp elementa za putanju kroz njega; kod račve po priključcima u dpOut. */
  dp: number;
  dpOut?: number[];
  Cout?: number[];
  ref?: 'up' | 'dn' | 'c';
  warn: Warn[];
  err?: Warn;
}

export interface Proposal {
  junction: string;
  port: number;
  from: Dims;
  to: Dims;
}

export interface TermRes {
  id: string;
  Q: number;
  S: number;
  E: number;
  path: string[];
}

export interface BranchBal {
  run: string;
  junction: string;
  port: number;
  /** Višak pritiska koji treba prigušiti na početku ogranka [Pa]. */
  D: number;
  damper?: { node: string; fid: string; Creq: number; th: number };
}

export interface Result {
  air: { rho: number; nu: number };
  nodes: Record<string, NodeRes>;
  runs: Record<string, Run>;
  runOf: Record<string, string>;
  proposals: Proposal[];
  terms: TermRes[];
  Smax: number;
  crit: string[];
  critTerm: string | null;
  Qtot: number;
  bal: BranchBal[];
  orphans: string[];
}

const CAT_I: Record<Cat, number> = { main: 0, branch: 1, conn: 2 };

export function dimsEqual(x: Dims | null | undefined, y: Dims | null | undefined): boolean {
  if (!x || !y || x.shape !== y.shape) return false;
  if (x.shape === 'round') return Math.abs((x.D || 0) - (y.D || 0)) < 0.5;
  return Math.abs((x.a || 0) - (y.a || 0)) < 0.5 && Math.abs((x.b || 0) - (y.b || 0)) < 0.5;
}

export function dimsText(d: Dims | null | undefined): string {
  if (!d) return '—';
  return d.shape === 'round' ? 'Ø' + d.D : d.a + '×' + d.b;
}

function num(v: unknown, d = 0): number {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isFinite(x) ? x : d;
}

// ---------- Dimenzionisanje ----------

interface Ctx {
  A: { rho: number; nu: number };
  eps: number;
  S: Sizing;
}

function rate(c: Ctx, Q: number, d: Dims) {
  const s = section(Q, d, c.A);
  const fr = friction(s, c.eps, c.A);
  return { s, v: s.v, R: fr.R };
}

function vLim(S: Sizing, cat: Cat): number {
  return S.v[CAT_I[cat]];
}

/** Da li presjek zadovoljava metodu (za izbor najmanjeg presjeka). */
function fits(c: Ctx, Q: number, d: Dims, cat: Cat): boolean {
  const r = rate(c, Q, d);
  if (c.S.method === 'friction') return r.R <= c.S.Rt * 1.0001 && r.v <= vLim(c.S, cat) + 1e-9;
  return r.v <= vLim(c.S, cat) + 1e-9;
}

/** Da li se postojeći (veći) presjek može zadržati za manji protok, a da ostane u granicama metode. */
export function inBand(c: Ctx, Q: number, d: Dims, cat: Cat): boolean {
  const r = rate(c, Q, d);
  if (r.v > vLim(c.S, cat) + 1e-9) return false;
  if (c.S.method === 'friction') return r.R <= c.S.Rt * 1.0001 && r.R >= c.S.Rmin - 1e-9;
  return r.v >= c.S.vKeep * vLim(c.S, cat) - 1e-9;
}

/** Najmanji standardni presjek koji zadovoljava metodu. */
export function pick(c: Ctx, Q: number, shape: Shape, cat: Cat): { d: Dims; ok: boolean } {
  const S = c.S;
  const q = Q > 0 ? Q : 1;
  if (shape === 'round') {
    const list = S.round.slice().sort((x, y) => x - y);
    for (const D of list) if (fits(c, q, { shape, D }, cat)) return { d: { shape, D }, ok: true };
    return { d: { shape, D: list[list.length - 1] }, ok: false };
  }
  const step = Math.max(10, S.rectStep || 50);
  const min = 100;
  const H: number[] = [];
  if (S.hFix > 0) H.push(S.hFix);
  else for (let b = min; b <= Math.max(min, S.hMax); b += step) H.push(b);
  let best: { d: Dims; per: number; A: number } | null = null;
  for (const b of H) {
    const a0 = S.hFix > 0 ? min : b; // bez fiksne visine: širina >= visina
    for (let a = a0; a <= 3000; a += step) {
      const ar = Math.max(a, b) / Math.min(a, b);
      if (ar > S.arMax + 1e-9) {
        if (a > b) break;
        continue;
      }
      const d: Dims = { shape, a, b };
      if (fits(c, q, d, cat)) {
        const per = a + b;
        const A = a * b;
        if (!best || per < best.per || (per === best.per && A < best.A) || (per === best.per && A === best.A && b < (best.d.b || 0)))
          best = { d, per, A };
        break;
      }
    }
  }
  if (best) return { d: best.d, ok: true };
  const b = S.hFix > 0 ? S.hFix : S.hMax;
  return { d: { shape, a: Math.round((b * S.arMax) / step) * step, b }, ok: false };
}

// ---------- Glavni proračun ----------

export function compute(P: Project, sys: System): Result {
  const A = air(P.t, P.z);
  const c: Ctx = { A, eps: P.eps, S: sys.sizing };
  const N = sys.nodes;
  const supply = sys.kind === 'supply';
  const R: Result = {
    air: A,
    nodes: {},
    runs: {},
    runOf: {},
    proposals: [],
    terms: [],
    Smax: 0,
    crit: [],
    critTerm: null,
    Qtot: 0,
    bal: [],
    orphans: [],
  };
  const root = N[sys.root];
  if (!root) return R;

  // 1. protoci: zbir terminala u podstablu
  const Q: Record<string, number> = {};
  const nTerm: Record<string, number> = {};
  const seen = new Set<string>();
  const flow = (id: string): number => {
    if (Q[id] != null) return Q[id];
    if (seen.has(id)) return 0; // zaštita od ciklusa
    seen.add(id);
    const n = N[id];
    if (!n) return 0;
    let q = 0;
    let t = 0;
    if (n.type === 'terminal') {
      q = Math.max(0, num(n.p.Q));
      t = 1;
    }
    for (const ch of n.out) if (ch && N[ch]) {
      q += flow(ch);
      t += nTerm[ch] || 0;
    }
    nTerm[id] = t;
    return (Q[id] = q);
  };
  flow(root.id);
  R.Qtot = Q[root.id] || 0;

  // 2. dionice
  const runs = R.runs;
  let rc = 0;
  const mkRun = (first: string, parent: string | null, start: Run['start'], from: Run['from']) => {
    const id = 'r' + ++rc;
    const run: Run = {
      id,
      nodes: [],
      parent,
      start,
      from,
      Q: Q[first] || 0,
      cat: 'main',
      shape: 'rect',
      size: { shape: 'rect' },
      method: null,
      manual: false,
      kept: false,
      terminals: nTerm[first] || 0,
      isMain: false,
    };
    runs[id] = run;
    let cur: string | null = first;
    while (cur && N[cur]) {
      const n: Node = N[cur];
      run.nodes.push(cur);
      R.runOf[cur] = id;
      if (n.type === 'junction') {
        n.out.forEach((ch, port) => {
          if (ch && N[ch]) mkRun(ch, id, n.p.kind === 'sym' ? 'sym' : port === 0 ? 'straight' : 'branch', { node: n.id, port });
        });
        break;
      }
      if (n.type === 'transition') {
        const ch = n.out[0];
        if (ch && N[ch]) mkRun(ch, id, 'afterTransition', { node: n.id, port: 0 });
        break;
      }
      if (n.type === 'terminal') break;
      cur = n.out[0] || null;
    }
  };
  if (root.out[0] && N[root.out[0]]) mkRun(root.out[0], null, 'root', { node: root.id, port: 0 });

  // čvorovi koji nisu povezani sa korijenom
  const reach = new Set<string>([root.id, ...Object.keys(R.runOf)]);
  R.orphans = Object.keys(N).filter((id) => !reach.has(id));

  // 3. kategorija, oblik i dimenzije po dionicama (od korijena ka listovima)
  const order: Run[] = [];
  const walk = (parent: string | null) => {
    for (const r of Object.values(runs)) if (r.parent === parent) {
      order.push(r);
      walk(r.id);
    }
  };
  walk(null);

  for (const run of order) {
    const par = run.parent ? runs[run.parent] : null;
    run.isMain = run.start === 'root' || (!!par && par.isMain && (run.start === 'straight' || run.start === 'afterTransition'));
    const ducts = run.nodes.map((id) => N[id]).filter((n) => n.type === 'duct');
    const catOver = ducts.map((n) => n.p.cat).find((x) => x === 'main' || x === 'branch' || x === 'conn') as Cat | undefined;
    run.cat = catOver || (run.terminals <= 1 ? 'conn' : run.isMain ? 'main' : 'branch');
    run.shape = (ducts.find((n) => n.shape)?.shape as Shape) || (par ? par.shape : 'rect');
    const locked = ducts.find((n) => n.dims && (n.dims.D || (n.dims.a && n.dims.b)));
    const pk = pick(c, run.Q, run.shape, run.cat);
    run.method = pk.d;
    if (locked && locked.dims) {
      run.size = { ...locked.dims, shape: run.shape };
      run.manual = true;
      continue;
    }
    // dionica koja počinje prelazom (npr. odmah iza račve) zadržava presjek prethodne; prelaz mijenja presjek
    const firstIsTrans = N[run.nodes[0]]?.type === 'transition';
    if (par && firstIsTrans && par.shape === run.shape) {
      run.size = { ...par.size };
      run.kept = true;
      continue;
    }
    if (par && run.start === 'straight' && par.shape === run.shape && run.Q > 0) {
      if (dimsEqual(pk.d, par.size) || inBand(c, run.Q, par.size, run.cat)) {
        run.size = { ...par.size };
        run.kept = true;
        continue;
      }
      run.size = pk.d;
      if (run.from) R.proposals.push({ junction: run.from.node, port: run.from.port, from: par.size, to: pk.d });
      continue;
    }
    run.size = pk.d;
  }

  // 4. Δp po elementima
  const secOf = (runId: string | undefined, q: number): Sec | null => {
    const r = runId ? runs[runId] : null;
    return r ? section(q, r.size, A) : null;
  };
  const childRunOf = (n: Node, port: number): string | undefined => {
    const ch = n.out[port];
    return ch ? R.runOf[ch] : undefined;
  };
  const S = sys.sizing;

  for (const id of Object.keys(R.runOf)) {
    const n = N[id];
    const run = runs[R.runOf[id]];
    const q = Q[id] || 0;
    const res: NodeRes = { Q: q, run: run.id, sec: null, dp: 0, warn: [] };
    R.nodes[id] = res;
    try {
      const sec = section(q, run.size, A);
      res.sec = sec;
      if (!(sec.A > 0)) throw { code: 'noSection' };
      if (!(q > 0) && n.type !== 'terminal') res.warn.push({ code: supply ? 'noFlowSupply' : 'noFlowExhaust' });
      switch (n.type) {
        case 'duct': {
          const fr = friction(sec, P.eps, A);
          const L = num(n.p.L);
          res.R = fr.R;
          res.f = fr.f;
          res.dp = fr.R * L;
          const vm = vLim(S, run.cat);
          if (sec.v > vm + 1e-9) res.warn.push({ code: 'vHigh', args: { v: sec.v.toFixed(2), vm } });
          if (S.method === 'friction' && fr.R > S.Rt * 1.25) res.warn.push({ code: 'RHigh', args: { R: fr.R.toFixed(2), Rt: S.Rt } });
          if (q > 0 && sec.v < vm * 0.3) res.warn.push({ code: 'vLow', args: { v: sec.v.toFixed(2) } });
          if (sec.shape === 'rect') {
            const ar = Math.max(sec.a || 0, sec.b || 0) / Math.min(sec.a || 1, sec.b || 1);
            if (ar > S.arMax + 0.01) res.warn.push({ code: 'aspect', args: { ar: ar.toFixed(1) } });
          }
          if (!(L > 0)) res.warn.push({ code: 'noLength' });
          if (run.manual && n.dims && !dimsEqual({ ...n.dims, shape: run.shape }, run.size))
            res.warn.push({ code: 'lockConflict' });
          break;
        }
        case 'elbow':
        case 'damper':
        case 'obstruction': {
          const fid = n.fid || (n.type === 'elbow' ? defaultElbow(sec.shape) : n.type === 'damper' ? defaultDamper(sec.shape) : defaultObstruction());
          const f = FIT[fid];
          if (!f) throw { code: 'unknownFitting', args: { fid } };
          if (f.shape !== 'any' && f.shape !== sec.shape) throw { code: 'shapeMismatch', args: { fid } };
          const w: string[] = [];
          res.fid = fid;
          res.C = f.calc(fitParams(fid, n.p), { up: sec, nu: A.nu, rho: A.rho }, w);
          res.dp = (res.C || 0) * sec.pd;
          res.ref = 'up';
          w.forEach((m) => res.warn.push({ code: 'table', args: { m } }));
          if (f.poor) res.warn.push({ code: 'poor' });
          break;
        }
        case 'transition': {
          const nextRun = childRunOf(n, 0);
          const other = secOf(nextRun, q);
          if (!other) {
            res.warn.push({ code: 'transitionOpen' });
            break;
          }
          // smjer strujanja: dovod od korijena ka listovima, odsis obrnuto
          const up = supply ? sec : other;
          const dn = supply ? other : sec;
          res.dn = other;
          if (dimsEqual(up, dn)) {
            res.warn.push({ code: 'transitionNoEffect' });
            res.C = 0;
            break;
          }
          const auto = defaultTransition(up, dn, S.reducer);
          const fid = n.fid || auto.fid;
          const f = FIT[fid];
          if (!f) throw { code: 'unknownFitting', args: { fid } };
          if (!n.fid && auto.note === 'both' && S.reducer === 'oneSide') res.warn.push({ code: 'oneSideBoth' });
          const w: string[] = [];
          res.fid = fid;
          res.C = f.calc(fitParams(fid, n.p), { up, dn, nu: A.nu, rho: A.rho }, w);
          const refSec = f.ref === 'dn' ? dn : up;
          res.ref = f.ref === 'dn' ? 'dn' : 'up';
          res.dp = (res.C || 0) * refSec.pd;
          w.forEach((m) => res.warn.push({ code: 'table', args: { m } }));
          break;
        }
        case 'junction': {
          const sym = n.p.kind === 'sym';
          const r0 = childRunOf(n, 0);
          const r1 = childRunOf(n, 1);
          const q0 = n.out[0] ? Q[n.out[0]] || 0 : 0;
          const q1 = n.out[1] ? Q[n.out[1]] || 0 : 0;
          res.dpOut = [0, 0];
          res.Cout = [0, 0];
          if (!r0 || !r1) {
            res.warn.push({ code: 'junctionOpen' });
            break;
          }
          const s0 = secOf(r0, q0)!;
          const s1 = secOf(r1, q1)!;
          // c = zajednički presjek (strana klima komore); s = prolaz; b = ogranak
          const cSec = sec;
          const sSec = sym ? s1 : s0;
          const bSec = sym ? s0 : s1;
          const fid = n.fid || defaultJunction(sys.kind, cSec.shape, bSec.shape, sym);
          const f = FIT[fid];
          if (!f) throw { code: 'unknownFitting', args: { fid } };
          const fl = f.flow === 'both' ? (supply ? 'div' : 'conv') : f.flow;
          if ((fl === 'div') !== supply) throw { code: 'flowMismatch', args: { fid } };
          if (f.shape !== 'any' && f.shape !== cSec.shape) throw { code: 'shapeMismatch', args: { fid } };
          if (f.bShape && bSec.shape !== f.bShape) res.warn.push({ code: 'branchShape', args: { fid } });
          if (!(q0 > 0) || !(q1 > 0)) res.warn.push({ code: 'junctionNoFlow' });
          const J = {
            Qc: cSec.Q, Qs: sSec.Q, Qb: bSec.Q,
            Ac: cSec.A, As: sSec.A, Ab: bSec.A,
            Vc: cSec.v, Vs: sSec.v, Vb: bSec.v,
            c: cSec, s: sSec, b: bSec, flow: fl,
          };
          const w: string[] = [];
          const o = f.calc(fitParams(fid, n.p), J, w) as { Cb: number; Cs: number };
          res.fid = fid;
          const C0 = sym ? o.Cb : o.Cs;
          const C1 = sym ? o.Cs : o.Cb;
          res.Cout = [C0, C1];
          res.dpOut = [C0 * cSec.pd, C1 * cSec.pd];
          res.ref = 'c';
          w.forEach((m) => res.warn.push({ code: 'table', args: { m } }));
          if (f.poor) res.warn.push({ code: 'poor' });
          for (const v of res.dpOut) if (!isFinite(v)) throw { code: 'undefinedResult' };
          break;
        }
        case 'equipment': {
          const Qref = num(n.p.Qref);
          res.dp = num(n.p.dp) * (Qref > 0 && q > 0 ? (q / Qref) ** 2 : 1);
          if (!(num(n.p.dp) > 0)) res.warn.push({ code: 'noCatalogDp' });
          break;
        }
        case 'zeta': {
          res.C = num(n.p.z);
          res.dp = res.C * sec.pd;
          res.ref = 'up';
          break;
        }
        case 'terminal': {
          if (!(num(n.p.Q) > 0)) res.warn.push({ code: 'noFlowTerminal' });
          if (n.p.kind === 'open') {
            const fid = n.fid || defaultOpenEnd(sys.kind);
            const f = FIT[fid];
            if (!f) throw { code: 'unknownFitting', args: { fid } };
            const w: string[] = [];
            res.fid = fid;
            res.C = f.calc(fitParams(fid, n.p), { up: sec, nu: A.nu, rho: A.rho }, w);
            res.dp = (res.C || 0) * sec.pd;
            res.ref = 'up';
            w.forEach((m) => res.warn.push({ code: 'table', args: { m } }));
          } else {
            const Qref = num(n.p.Qref);
            res.dp = num(n.p.dp) * (Qref > 0 && q > 0 ? (q / Qref) ** 2 : 1);
            if (!(num(n.p.dp) > 0)) res.warn.push({ code: 'noCatalogDp' });
          }
          break;
        }
        default:
          break;
      }
      if (!isFinite(res.dp)) throw { code: 'undefinedResult' };
    } catch (ex) {
      const e = ex as Warn;
      res.err = e && e.code ? e : { code: 'undefinedResult' };
      res.dp = 0;
      if (res.dpOut) res.dpOut = [0, 0];
    }
    // ukloni duplikate upozorenja
    const keys = new Set<string>();
    res.warn = res.warn.filter((w) => {
      const k = w.code + JSON.stringify(w.args || {});
      if (keys.has(k)) return false;
      keys.add(k);
      return true;
    });
  }
  // klima komora
  R.nodes[root.id] = { Q: R.Qtot, run: null, sec: null, dp: 0, warn: R.Qtot > 0 ? [] : [{ code: 'noTerminals' }] };

  // 5. sume po putanjama, kritična dionica
  const acc = (id: string, s: number, path: string[]) => {
    const n = N[id];
    if (!n) return;
    const r = R.nodes[id];
    const p2 = [...path, id];
    if (n.type === 'terminal') {
      R.terms.push({ id, Q: num(n.p.Q), S: s + (r ? r.dp : 0), E: 0, path: p2 });
      return;
    }
    if (n.type === 'junction') {
      n.out.forEach((ch, port) => {
        if (ch) acc(ch, s + (r && r.dpOut ? r.dpOut[port] : 0), p2);
      });
      return;
    }
    const ch = n.out[0];
    if (ch) acc(ch, s + (r ? r.dp : 0), p2);
  };
  acc(root.id, 0, []);
  if (R.terms.length) {
    const crit = R.terms.reduce((a, t) => (t.S > a.S ? t : a));
    R.Smax = crit.S;
    R.crit = crit.path;
    R.critTerm = crit.id;
    R.terms.forEach((t) => (t.E = R.Smax - t.S));
  }

  // 6. balansiranje po ograncima: višak pritiska prigušuje se na početku ogranka
  const termsUnder = (runId: string): TermRes[] => {
    const ids = new Set<string>();
    const coll = (rid: string) => {
      runs[rid].nodes.forEach((x) => ids.add(x));
      Object.values(runs).forEach((r) => r.parent === rid && coll(r.id));
    };
    coll(runId);
    return R.terms.filter((t) => ids.has(t.id));
  };
  const balWalk = (runId: string, already: number) => {
    const run = runs[runId];
    let here = 0;
    if (run.from && (run.start === 'branch' || run.start === 'sym' || run.start === 'straight') && N[run.from.node]?.type === 'junction') {
      const ts = termsUnder(runId);
      const m = ts.length ? Math.min(...ts.map((t) => t.E)) : 0;
      here = Math.max(0, m - already);
      if (here > 0.5) {
        const b: BranchBal = { run: runId, junction: run.from.node, port: run.from.port, D: here };
        const dn = run.nodes.find((id) => N[id].type === 'damper' && R.nodes[id] && !R.nodes[id].err && R.nodes[id].fid && FIT[R.nodes[id].fid!]?.damper);
        if (dn) {
          const r = R.nodes[dn];
          const fid = r.fid!;
          const Creq = (r.C || 0) + here / (r.sec!.pd || 1);
          b.damper = { node: dn, fid, Creq, th: dampAngle(fid, fitParams(fid, N[dn].p), r.sec!, Creq) };
        }
        R.bal.push(b);
      } else here = 0;
    }
    Object.values(runs).forEach((r) => r.parent === runId && balWalk(r.id, already + here));
  };
  Object.values(runs).filter((r) => !r.parent).forEach((r) => balWalk(r.id, 0));

  return R;
}

/** Ubacuje prelaz na mjestu prijedloga (između račve i prvog elementa prolaza). */
export function applyProposal(sys: System, pr: Proposal, newNode: Node): void {
  const j = sys.nodes[pr.junction];
  if (!j) return;
  const ch = j.out[pr.port];
  newNode.out = [ch];
  newNode.auto = true;
  sys.nodes[newNode.id] = newNode;
  j.out[pr.port] = newNode.id;
}
