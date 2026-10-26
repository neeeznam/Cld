// Geometrija crteža: svaka ćelija mreže je jedan element; kanali se nastavljaju preko granica ćelija.
import type { Dims } from '../core/types';

export const COL = 220;

/** Širina ćelije po vrsti elementa [px]: kanali širi, fitinzi uži. */
const W: Record<string, number> = {
  ahu: 200,
  'duct-rect': 180,
  'duct-round': 180,
  elbow: 112,
  transition: 140,
  damper: 112,
  obstruction: 112,
  zeta: 112,
  tee: 196,
  dovetail: 196,
  silencer: 150,
  firedamper: 150,
  filter: 150,
  coil: 150,
  vav: 150,
  equip: 150,
  diffuser: 160,
  grille: 160,
  valve: 160,
  open: 160,
};
export const PLUS_W = 130;

export function cellW(kind: string): number {
  return W[kind] ?? COL;
}

/** Mjesto odvajanja ogranka u ćeliji račve. */
export function bx(w: number): number {
  return w - 56;
}
export const ROW = 150;
/** Osa kanala u ćeliji (poravnanje po osi). */
export const CY = 66;
/** Gornja ivica kanala pri poravnanju po gornjoj ivici (jednostrana suženja). */
export const TOP = 44;

export type Align = 'center' | 'top';

/** Debljina kanala na crtežu [px] iz dimenzije u ravni crteža (širina a ili prečnik D). */
export function thick(d?: Dims | null): number {
  if (!d) return 16;
  const s = (d.shape === 'round' ? d.D : d.a) || 0;
  return Math.max(9, Math.min(44, 5 + s * 0.055));
}

export interface Band {
  y0: number;
  y1: number;
  yc: number;
  t: number;
}

export function band(t: number, align: Align): Band {
  if (align === 'top') return { y0: TOP, y1: TOP + t, yc: TOP + t / 2, t };
  return { y0: CY - t / 2, y1: CY + t / 2, yc: CY, t };
}
