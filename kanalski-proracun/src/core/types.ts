// Model podataka: sistem je stablo elemenata sa izlaznim priključcima ("+").
// Korijen je klima komora / ventilator; terminali (difuzori, rešetke) su listovi.

export type Shape = 'rect' | 'round';

/** Dimenzije presjeka u mm. Pravougaoni: a = širina, b = visina. */
export interface Dims {
  shape: Shape;
  a?: number;
  b?: number;
  D?: number;
}

export type SysKind = 'supply' | 'exhaust';

export type ElType =
  | 'ahu'
  | 'duct'
  | 'elbow'
  | 'transition'
  | 'junction'
  | 'damper'
  | 'obstruction'
  | 'equipment'
  | 'zeta'
  | 'terminal';

export type Cat = 'main' | 'branch' | 'conn';

export interface Node {
  id: string;
  type: ElType;
  name?: string;
  /** ASHRAE oznaka fitinga; prazno = program bira sam prema presjecima i vrsti sistema. */
  fid?: string;
  /** Parametri elementa (dužina, ugao, protok, kataloški Δp...). */
  p: Record<string, number | string>;
  /** Djeca po izlaznim priključcima; null = slobodan "+". */
  out: (string | null)[];
  /** Kanal: oblik presjeka. */
  shape?: Shape;
  /** Kanal: ručno zadate (zaključane) dimenzije; null/undefined = automatski po metodi. */
  dims?: Dims | null;
  /** Prelaz ubačen iz prijedloga suženja. */
  auto?: boolean;
}

export type Method = 'friction' | 'velocity';
export type ReducerStyle = 'oneSide' | 'symmetric' | 'pyramid';

export interface Sizing {
  method: Method;
  /** Jednako trenje: ciljani pad pritiska R [Pa/m]. */
  Rt: number;
  /** Jednako trenje: presjek se zadržava (bez suženja) dok je R >= Rmin [Pa/m]. */
  Rmin: number;
  /** Maks. (metoda trenja) odnosno ciljana (metoda brzina) brzina: glavni, ogranak, priključak [m/s]. */
  v: [number, number, number];
  /** Metoda brzina: presjek se zadržava dok je v >= vKeep · v_cilj. */
  vKeep: number;
  /** Fiksna visina pravougaonog kanala [mm]; 0 = slobodno. */
  hFix: number;
  /** Maksimalna visina pravougaonog kanala [mm]. */
  hMax: number;
  /** Maksimalni odnos stranica. */
  arMax: number;
  /** Standardni prečnici okruglih kanala [mm]. */
  round: number[];
  /** Korak dimenzija pravougaonih kanala [mm]. */
  rectStep: number;
  /** Podrazumijevani tip suženja pravougaonog kanala. */
  reducer: ReducerStyle;
}

export interface System {
  id: string;
  name: string;
  kind: SysKind;
  root: string;
  nodes: Record<string, Node>;
  sizing: Sizing;
}

export interface Project {
  version: 1;
  name: string;
  /** Temperatura vazduha [°C]. */
  t: number;
  /** Nadmorska visina [m]. */
  z: number;
  /** Apsolutna hrapavost zida kanala [mm]. */
  eps: number;
  systems: System[];
}

/** Presjek sa protokom i izvedenim veličinama (izlaz funkcije section). */
export interface Sec extends Dims {
  Q: number;
  A: number;
  Dh: number;
  v: number;
  pd: number;
  Re: number;
}
