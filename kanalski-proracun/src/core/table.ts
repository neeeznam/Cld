// Tabela proračuna po dionicama (klasičan format: Q, L, presjek, v, R, R·L, Σζ, Z, oprema, ΣΔp).
import { section } from './ashrae/library.js';
import type { Result, Run } from './engine';
import type { Dims, System } from './types';

export interface TableRow {
  run: Run;
  no: number;
  depth: number;
  Q: number;
  L: number;
  size: Dims;
  v: number;
  R: number;
  RL: number;
  /** Zbir lokalnih koeficijenata sveden na dinamički pritisak dionice: Σζ = Z / pd. */
  zeta: number;
  Z: number;
  equip: number;
  total: number;
  cum: number;
  crit: boolean;
}

export function runTable(sys: System, R: Result): TableRow[] {
  const rows: TableRow[] = [];
  const crit = new Set(R.crit);
  const cumOf: Record<string, number> = {};
  let no = 0;
  const walk = (parent: string | null, depth: number) => {
    for (const run of Object.values(R.runs)) {
      if (run.parent !== parent) continue;
      const s = section(run.Q, run.size, R.air);
      let L = 0;
      let RL = 0;
      let Z = 0;
      let equip = 0;
      let Rv = NaN;
      for (const id of run.nodes) {
        const n = sys.nodes[id];
        const r = R.nodes[id];
        if (!n || !r) continue;
        if (n.type === 'duct') {
          L += +n.p.L || 0;
          RL += r.dp;
          if (!isFinite(Rv) && r.R != null) Rv = r.R;
        } else if (n.type === 'equipment' || (n.type === 'terminal' && n.p.kind !== 'open')) equip += r.dp;
        else if (n.type !== 'junction') Z += r.dp;
      }
      if (run.from) {
        const j = sys.nodes[run.from.node];
        const jr = R.nodes[run.from.node];
        if (j?.type === 'junction' && jr?.dpOut) Z += jr.dpOut[run.from.port] || 0;
      }
      if (!isFinite(Rv)) Rv = NaN;
      const total = RL + Z + equip;
      const cum = (parent ? cumOf[parent] : 0) + total;
      cumOf[run.id] = cum;
      rows.push({
        run,
        no: ++no,
        depth,
        Q: run.Q,
        L,
        size: run.size,
        v: s.v,
        R: Rv,
        RL,
        zeta: s.pd > 0 ? Z / s.pd : 0,
        Z,
        equip,
        total,
        cum,
        crit: run.nodes.some((id) => crit.has(id)),
      });
      walk(run.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}
