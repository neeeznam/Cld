import type { Result } from '../core/engine';
import type { Node, System } from '../core/types';
import type { Key, T } from '../i18n';

const EQUIP: Record<string, string> = { silencer: 'silencer', firedamper: 'firedamper', filter: 'filter', coil: 'coil', vav: 'vav', other: 'equip' };
const TERM: Record<string, string> = { diffuser: 'diffuser', grille: 'grille', valve: 'valve', open: 'open' };

/** Ključ palete (ikonica i naziv) za element. */
export function nodeKey(n: Node): string {
  switch (n.type) {
    case 'duct':
      return n.shape === 'round' ? 'duct-round' : 'duct-rect';
    case 'junction':
      return n.p.kind === 'sym' ? 'dovetail' : 'tee';
    case 'equipment':
      return EQUIP[String(n.p.kind)] || 'equip';
    case 'terminal':
      return TERM[String(n.p.kind)] || 'diffuser';
    default:
      return n.type;
  }
}

export function nodeTitle(n: Node, t: T): string {
  return n.name || t(nodeKey(n) as Key);
}

/** Redni brojevi dionica u redoslijedu stabla (za tabelu i oznake na šemi). */
export function runNumbers(R: Result): Record<string, number> {
  const out: Record<string, number> = {};
  let k = 0;
  const walk = (parent: string | null) => {
    for (const r of Object.values(R.runs)) if (r.parent === parent) {
      out[r.id] = ++k;
      walk(r.id);
    }
  };
  walk(null);
  return out;
}

export function portLabel(n: Node, port: number, t: T): string {
  if (n.type !== 'junction') return '';
  if (n.p.kind === 'sym') return port === 0 ? t('leg1') : t('leg2');
  return port === 0 ? t('straight') : t('branch');
}

export function fmtN(x: number | undefined | null, d = 1, lang: 'sr' | 'en' = 'sr'): string {
  if (x == null || !isFinite(x)) return '—';
  const s = x.toFixed(d);
  return lang === 'sr' ? s.replace('.', ',') : s;
}

export function critEdges(R: Result): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i + 1 < R.crit.length; i++) s.add(R.crit[i] + '>' + R.crit[i + 1]);
  return s;
}

export function hasProblems(sys: System, R: Result, id: string): 'err' | 'warn' | null {
  const r = R.nodes[id];
  if (!r) return R.orphans.includes(id) ? 'warn' : null;
  if (r.err) return 'err';
  if (r.warn.length) return 'warn';
  return null;
}
