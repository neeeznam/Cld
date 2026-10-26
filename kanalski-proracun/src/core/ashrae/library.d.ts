import type { Dims, Sec } from '../types';

export interface FitParam {
  k: string;
  l: string;
  u?: string;
  t: 'num' | 'sel';
  d: number | string;
  o?: [string, string][];
}

export interface Junc {
  Qc: number; Qs: number; Qb: number;
  Ac: number; As: number; Ab: number;
  Vc: number; Vs: number; Vb: number;
  c: Sec; s: Sec; b: Sec;
  flow: 'div' | 'conv';
}

export interface Fitting {
  id: string;
  n: string;
  cat: 'ulaz' | 'izlaz' | 'koljeno' | 'prelaz' | 'racva' | 'klapna' | 'prepreka';
  cls: 'local' | 'trans' | 'junc';
  shape: 'rect' | 'round' | 'any';
  dnShape?: 'rect' | 'round' | 'any';
  bShape?: 'rect' | 'round';
  ref?: 'up' | 'dn';
  flow?: 'div' | 'conv' | 'both';
  sym?: boolean;
  lockAsAc?: boolean;
  poor?: boolean;
  damper?: boolean;
  note?: string;
  p: FitParam[];
  calc(p: Record<string, any>, g: any, w: string[]): any;
}

export const F: Fitting[];
export const FIT: Record<string, Fitting>;
export const CORR: string[];
export const OBJ: Record<string, { n: string; v: [number, number, number]; R: number }>;
export function interp1(xs: number[], ys: (number | null)[], x: number, w?: string[] | null, lbl?: string): number;
export function interp2(rk: number[], ck: number[], Z: (number | null)[][], r: number, c: number, w?: string[] | null, rl?: string, cl?: string): number;
export function fmt(x: number, d?: number): string;
export function dampAngle(fid: string, p: Record<string, any>, sec: Sec, Creq: number): number;
export function air(t: number, z: number): { rho: number; mu: number; nu: number; p: number };
export function section(Q: number, d: Dims, A_: { rho: number; nu: number }): Sec;
export function friction(s: Sec, epsmm: number, A_: { rho: number; nu: number }): { f: number; R: number };
export function planeDims(sec: Dims, p: Record<string, any>): { W: number; H: number };
