import { describe, expect, it } from 'vitest';
import { FIT, air, friction, section } from './ashrae/library.js';
import { PALETTE_BY_KEY, makeNode } from './catalog';
import { applyProposal, compute, dimsEqual, pick } from './engine';
import { sampleProject } from './sample';
import type { Dims } from './types';

const A = air(20, 0);

describe('ASHRAE biblioteka — kontrolne tačke iz tabela', () => {
  it('3-1 koljeno okruglo r/D = 1,0, 90° → 0,22', () => {
    const s = section(1000, { shape: 'round', D: 250 }, A);
    expect(FIT['3-1'].calc({ rr: 1, th: 90 }, { up: s }, [])).toBeCloseTo(0.22, 3);
  });
  it('3-1 koljeno okruglo r/D = 1,5, 45° → 0,15 · 0,60', () => {
    const s = section(1000, { shape: 'round', D: 250 }, A);
    expect(FIT['3-1'].calc({ rr: 1.5, th: 45 }, { up: s }, [])).toBeCloseTo(0.15 * 0.6, 4);
  });
  it('5-27 T-račva 45°: Cb(Vb/Vc = 0,2; Qb/Qc = 0,1) = 0,91, Cs(Vs/Vc = 0,5) = 0,10', () => {
    const J = { Qc: 1000, Qb: 100, Qs: 900, Ac: 1, As: 1, Ab: 1, Vc: 10, Vb: 2, Vs: 5 };
    const o = FIT['5-27'].calc({}, J, []);
    expect(o.Cb).toBeCloseTo(0.91, 3);
    expect(o.Cs).toBeCloseTo(0.1, 3);
  });
  it('2-1 nagli izlaz → 1,0', () => {
    expect(FIT['2-1'].calc({}, {}, [])).toBe(1);
  });
});

describe('Trenje — Colebrook', () => {
  it('poklapa se sa Haaland aproksimacijom unutar 2 %', () => {
    for (const [Q, D] of [[500, 160], [2000, 315], [8000, 630]]) {
      const s = section(Q, { shape: 'round', D }, A);
      const fr = friction(s, 0.09, A);
      const e = 0.09 / D;
      const fh = Math.pow(-1.8 * Math.log10(Math.pow(e / 3.7, 1.11) + 6.9 / s.Re), -2);
      expect(Math.abs(fr.f / fh - 1)).toBeLessThan(0.02);
    }
  });
});

describe('Proračun sistema (primjer)', () => {
  const P = sampleProject();
  const sup = P.systems[0];
  const exh = P.systems[1];

  it('sabira protoke terminala do klima komore', () => {
    const R = compute(P, sup);
    expect(R.Qtot).toBe(400 + 400 + 300 + 300);
    expect(compute(P, exh).Qtot).toBe(200);
  });

  it('dimenzioniše dionice u granicama metode (R ≤ Rt, v ≤ vmax) i bira najmanji presjek', () => {
    const R = compute(P, sup);
    const vmax = sup.sizing.v;
    for (const run of Object.values(R.runs)) {
      if (run.kept || run.manual) continue;
      const s = section(run.Q, run.size, A);
      const fr = friction(s, P.eps, A);
      expect(fr.R).toBeLessThanOrEqual(sup.sizing.Rt * 1.0001);
      expect(s.v).toBeLessThanOrEqual(vmax[{ main: 0, branch: 1, conn: 2 }[run.cat]] + 1e-9);
    }
  });

  it('okrugli kanali dobijaju samo standardne prečnike', () => {
    const R = compute(P, exh);
    for (const run of Object.values(R.runs)) expect(exh.sizing.round).toContain(run.size.D);
  });

  it('predlaže suženje iza odvojka kada stari presjek izađe iz granica metode', () => {
    const R = compute(P, sup);
    expect(R.proposals.length).toBeGreaterThan(0);
    for (const pr of R.proposals) {
      expect(dimsEqual(pr.from, pr.to)).toBe(false);
      expect(sup.nodes[pr.junction].type).toBe('junction');
    }
  });

  it('zadržava presjek (bez suženja) dok je u granicama metode', () => {
    const P2 = sampleProject();
    const s2 = P2.systems[0];
    s2.sizing.Rmin = 0.05; // praktično uvijek zadrži
    const R = compute(P2, s2);
    expect(R.proposals.length).toBe(0);
    expect(Object.values(R.runs).some((r) => r.kept)).toBe(true);
  });

  it('prihvaćeni prijedlog ubacuje prelaz; prolaz račve ostaje As = Ac', () => {
    const P2 = sampleProject();
    const s2 = P2.systems[0];
    const R1 = compute(P2, s2);
    const pr = R1.proposals[0];
    const tr = makeNode(PALETTE_BY_KEY.transition);
    applyProposal(s2, pr, tr);
    const R2 = compute(P2, s2);
    expect(R2.proposals.find((x) => x.junction === pr.junction && x.port === pr.port)).toBeUndefined();
    const nr = R2.nodes[tr.id];
    expect(nr.err).toBeUndefined();
    expect(['4-2', '4-3', '4-4']).toContain(nr.fid);
    expect(dimsEqual(nr.sec as Dims, pr.from)).toBe(true);
    expect(dimsEqual(nr.dn as Dims, pr.to)).toBe(true);
    expect(nr.dp).toBeGreaterThanOrEqual(0);
  });

  it('kritična dionica = najveći zbir Δp od klima komore do terminala', () => {
    const R = compute(P, sup);
    let max = 0;
    for (const t of R.terms) {
      let s = 0;
      t.path.forEach((id, i) => {
        const r = R.nodes[id];
        const n = sup.nodes[id];
        if (n.type === 'junction') s += r.dpOut![n.out.indexOf(t.path[i + 1])];
        else s += r.dp;
      });
      expect(s).toBeCloseTo(t.S, 6);
      max = Math.max(max, s);
    }
    expect(R.Smax).toBeCloseTo(max, 6);
    expect(R.terms.find((t) => t.id === R.critTerm)!.E).toBe(0);
  });

  it('dovod koristi divergentne, odsis konvergentne račve', () => {
    const Rs = compute(P, sup);
    const Re = compute(P, exh);
    const jf = (sys: typeof sup, R: typeof Rs) =>
      Object.keys(sys.nodes).filter((id) => sys.nodes[id].type === 'junction').map((id) => FIT[R.nodes[id].fid!]);
    for (const f of jf(sup, Rs)) expect(['div', 'both']).toContain(f.flow);
    for (const f of jf(exh, Re)) expect(['conv', 'both']).toContain(f.flow);
    for (const r of Object.values(Re.nodes)) expect(r.err).toBeUndefined();
  });

  it('nema grešaka u primjeru dovoda', () => {
    const R = compute(P, sup);
    for (const r of Object.values(R.nodes)) expect(r.err).toBeUndefined();
  });

  it('u odsisu je prelaz proširenje u smjeru strujanja', () => {
    const P2 = sampleProject();
    const ex = P2.systems[1];
    ex.sizing.Rmin = 0.9;
    const R1 = compute(P2, ex);
    if (!R1.proposals.length) return; // primjer je mali; provjera ima smisla samo kad postoji prijedlog
    const tr = makeNode(PALETTE_BY_KEY.transition);
    applyProposal(ex, R1.proposals[0], tr);
    const R2 = compute(P2, ex);
    const r = R2.nodes[tr.id];
    // up (u smjeru strujanja) je strana terminala = manji presjek
    expect(r.fid).toBe('4-1');
    expect((r.dn as Dims).D!).toBeLessThan((r.sec as Dims).D!);
  });
});

describe('Izbor presjeka', () => {
  const ctx = { A, eps: 0.09, S: sampleProject().systems[0].sizing };
  it('fiksna visina daje samo širinu', () => {
    const S = { ...ctx.S, hFix: 300 };
    const p = pick({ ...ctx, S }, 2000, 'rect', 'main');
    expect(p.d.b).toBe(300);
    expect(p.ok).toBe(true);
  });
  it('sljedeći manji okrugli prečnik ne zadovoljava metodu', () => {
    const p = pick(ctx, 1500, 'round', 'main');
    const list = ctx.S.round.slice().sort((a, b) => a - b);
    const i = list.indexOf(p.d.D!);
    expect(i).toBeGreaterThan(0);
    const s = section(1500, { shape: 'round', D: list[i - 1] }, A);
    const fr = friction(s, 0.09, A);
    expect(fr.R > ctx.S.Rt || s.v > ctx.S.v[0]).toBe(true);
  });
});

describe('Tabela proračuna', () => {
  it('kumulativni Δp dionice koja završava terminalom = Δp putanje do tog terminala', async () => {
    const { runTable } = await import('./table');
    const P = sampleProject();
    for (const sys of P.systems) {
      const R = compute(P, sys);
      const rows = runTable(sys, R);
      for (const row of rows) {
        const last = sys.nodes[row.run.nodes[row.run.nodes.length - 1]];
        if (last.type !== 'terminal') continue;
        const term = R.terms.find((t) => t.id === last.id)!;
        expect(row.cum).toBeCloseTo(term.S, 6);
      }
    }
  });
});
