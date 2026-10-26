// Paleta elemenata, podrazumijevane vrijednosti i automatski izbor ASHRAE fitinga.
import { F, FIT, type Fitting } from './ashrae/library.js';
import type { Dims, ElType, Node, ReducerStyle, Shape, Sizing, SysKind } from './types';

export type PaletteGroup = 'source' | 'duct' | 'fitting' | 'junction' | 'equipment' | 'terminal';

export interface PaletteItem {
  key: string;
  group: PaletteGroup;
  type: ElType;
  icon: string;
  shape?: Shape;
  p?: Record<string, number | string>;
}

export const PALETTE: PaletteItem[] = [
  { key: 'ahu', group: 'source', type: 'ahu', icon: 'ahu' },
  { key: 'duct-rect', group: 'duct', type: 'duct', icon: 'duct-rect', shape: 'rect', p: { L: 5 } },
  { key: 'duct-round', group: 'duct', type: 'duct', icon: 'duct-round', shape: 'round', p: { L: 5 } },
  { key: 'elbow', group: 'fitting', type: 'elbow', icon: 'elbow' },
  { key: 'transition', group: 'fitting', type: 'transition', icon: 'transition' },
  { key: 'damper', group: 'fitting', type: 'damper', icon: 'damper' },
  { key: 'obstruction', group: 'fitting', type: 'obstruction', icon: 'obstruction' },
  { key: 'zeta', group: 'fitting', type: 'zeta', icon: 'zeta', p: { z: 0.5 } },
  { key: 'tee', group: 'junction', type: 'junction', icon: 'tee', p: { kind: 'tee' } },
  { key: 'dovetail', group: 'junction', type: 'junction', icon: 'dovetail', p: { kind: 'sym' } },
  { key: 'silencer', group: 'equipment', type: 'equipment', icon: 'silencer', p: { kind: 'silencer', dp: 0, Qref: 0 } },
  { key: 'firedamper', group: 'equipment', type: 'equipment', icon: 'firedamper', p: { kind: 'firedamper', dp: 0, Qref: 0 } },
  { key: 'filter', group: 'equipment', type: 'equipment', icon: 'filter', p: { kind: 'filter', dp: 0, Qref: 0 } },
  { key: 'coil', group: 'equipment', type: 'equipment', icon: 'coil', p: { kind: 'coil', dp: 0, Qref: 0 } },
  { key: 'vav', group: 'equipment', type: 'equipment', icon: 'vav', p: { kind: 'vav', dp: 0, Qref: 0 } },
  { key: 'equip', group: 'equipment', type: 'equipment', icon: 'equip', p: { kind: 'other', dp: 0, Qref: 0 } },
  { key: 'diffuser', group: 'terminal', type: 'terminal', icon: 'diffuser', p: { kind: 'diffuser', Q: 300, dp: 0, Qref: 0 } },
  { key: 'grille', group: 'terminal', type: 'terminal', icon: 'grille', p: { kind: 'grille', Q: 300, dp: 0, Qref: 0 } },
  { key: 'valve', group: 'terminal', type: 'terminal', icon: 'valve', p: { kind: 'valve', Q: 100, dp: 0, Qref: 0 } },
  { key: 'open', group: 'terminal', type: 'terminal', icon: 'open', p: { kind: 'open', Q: 500 } },
];

export const PALETTE_BY_KEY: Record<string, PaletteItem> = Object.fromEntries(PALETTE.map((x) => [x.key, x]));

/** Broj izlaznih priključaka po tipu elementa. */
export function portCount(type: ElType): number {
  if (type === 'junction') return 2;
  if (type === 'terminal') return 0;
  return 1;
}

/** Elementi koji imaju jedan ulaz i jedan izlaz (mogu se ubaciti između dva elementa). */
export function isInline(type: ElType): boolean {
  return portCount(type) === 1 && type !== 'ahu';
}

let uid = 0;
export function newId(prefix = 'n'): string {
  uid += 1;
  return prefix + Date.now().toString(36) + uid.toString(36);
}

export function makeNode(item: PaletteItem): Node {
  return {
    id: newId(),
    type: item.type,
    p: { ...(item.p || {}) },
    out: new Array(portCount(item.type)).fill(null),
    ...(item.shape ? { shape: item.shape } : {}),
  };
}

// ---------- Podrazumijevana podešavanja ----------

/** Standardni prečnici: 14 preporučenih po EN 1506 (63…1250) + 150 i 300 koji su u upotrebi na tržištu. */
export const ROUND_DEFAULT = [100, 125, 150, 160, 200, 250, 300, 315, 400, 500, 630, 800, 1000, 1250];

export function defaultSizing(): Sizing {
  return {
    method: 'friction',
    Rt: 1.0,
    Rmin: 0.6,
    v: [6, 4.5, 3],
    vKeep: 0.7,
    hFix: 0,
    hMax: 500,
    arMax: 4,
    round: ROUND_DEFAULT.slice(),
    rectStep: 50,
    reducer: 'oneSide',
  };
}

// ---------- Izbor ASHRAE fitinga ----------

const FAMILY: Partial<Record<ElType, Fitting['cat'][]>> = {
  elbow: ['koljeno'],
  transition: ['prelaz'],
  damper: ['klapna'],
  obstruction: ['prepreka'],
};

/** Varijante fitinga koje odgovaraju tipu elementa, obliku presjeka i vrsti sistema. */
export function variants(type: ElType, shape: Shape, kind: SysKind, sym?: boolean): Fitting[] {
  if (type === 'junction') {
    const flow = kind === 'supply' ? 'div' : 'conv';
    return F.filter(
      (f) =>
        f.cls === 'junc' &&
        (f.flow === flow || f.flow === 'both') &&
        !!f.sym === !!sym &&
        (f.shape === 'any' || f.shape === shape),
    );
  }
  if (type === 'terminal') {
    const cat = kind === 'supply' ? 'izlaz' : 'ulaz';
    return F.filter((f) => f.cat === cat && (f.shape === 'any' || f.shape === shape));
  }
  const cats = FAMILY[type];
  if (!cats) return [];
  return F.filter(
    (f) => cats.includes(f.cat) && (f.shape === 'any' || f.shape === shape) && (type !== 'elbow' || f.cls === 'local'),
  );
}

export function defaultElbow(shape: Shape): string {
  return shape === 'round' ? '3-1' : '3-5';
}

export function defaultDamper(shape: Shape): string {
  return shape === 'round' ? '6-1' : '6-6';
}

export function defaultObstruction(): string {
  return '6-9';
}

/** Račva: c = zajednički (uzvodni) kanal, b = ogranak. */
export function defaultJunction(kind: SysKind, c: Shape, b: Shape, sym: boolean): string {
  if (sym) return c === 'rect' ? '5-32' : '5-33';
  if (kind === 'supply') {
    if (c === 'round') return '5-23';
    return b === 'round' ? '5-25' : '5-27';
  }
  if (c === 'round') return '5-3';
  return b === 'round' ? '5-7' : '5-9';
}

export function defaultOpenEnd(kind: SysKind): string {
  return kind === 'supply' ? '2-1' : '1-1';
}

/**
 * Prelaz između dva presjeka (u smjeru strujanja: up -> dn).
 * Jednostrani: 4-3; simetrični (dvije strane paralelne): 4-2; piramidalni: 4-4; okrugli: 4-1.
 */
export function defaultTransition(up: Dims, dn: Dims, style: ReducerStyle): { fid: string; note?: string } {
  if (up.shape === 'round' && dn.shape === 'round') return { fid: '4-1' };
  if (up.shape === 'rect' && dn.shape === 'round') return { fid: '4-6' };
  if (up.shape === 'round' && dn.shape === 'rect') return { fid: '4-5' };
  const da = Math.abs((up.a || 0) - (dn.a || 0)) > 0.5;
  const db = Math.abs((up.b || 0) - (dn.b || 0)) > 0.5;
  if (da && db) return { fid: '4-4', note: style === 'pyramid' ? undefined : 'both' };
  if (style === 'oneSide') return { fid: '4-3' };
  if (style === 'symmetric') return { fid: '4-2' };
  return { fid: '4-4' };
}

/** Parametri fitinga: podrazumijevane vrijednosti iz tabele prepisane vrijednostima sa elementa. */
export function fitParams(fid: string, p: Record<string, number | string>): Record<string, number | string> {
  const f = FIT[fid];
  const out: Record<string, number | string> = {};
  if (!f) return out;
  for (const z of f.p) {
    const v = p[z.k] != null ? p[z.k] : z.d;
    out[z.k] = z.t === 'num' ? +v : v;
  }
  return out;
}

export { F, FIT };
