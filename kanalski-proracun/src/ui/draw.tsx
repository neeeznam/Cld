// Tehnički simboli elemenata na crtežu (dvostruke linije kanala, prirubnice, simboli opreme).
import { ROW, band, bx, cellW, type Align, type Band } from './geom';

export type Tone = 'sup' | 'exh' | 'v0' | 'v1' | 'v2' | 'v3' | 'none';

export interface ShapeProps {
  kind: string;
  /** Širina ćelije [px]. */
  w?: number;
  /** Debljina kanala lijevo (ulaz u ćeliju, strana klima komore). */
  tL: number;
  /** Debljina desno (prolaz / izlaz prelaza). */
  tR?: number;
  /** Debljina ogranka. */
  tB?: number;
  align: Align;
  tone: Tone;
  toneR?: Tone;
  toneB?: Tone;
  /** 1 = strujanje s lijeva na desno (dovod), -1 = obrnuto (odsis). */
  flow: 1 | -1;
  fid?: string;
  round?: boolean;
  /** Mala ikonica u paleti: bez strelica toka. */
  mini?: boolean;
}

/** Traka kanala bez krajnjih linija (ćelije se spajaju bez šava); gap = otvor u donjoj liniji za ogranak. */
function Duct({ x0, x1, b, tone, round, mini, flow, gap }: { x0: number; x1: number; b: Band; tone: Tone; round?: boolean; mini?: boolean; flow: 1 | -1; gap?: [number, number] }) {
  const chev: JSX.Element[] = [];
  if (!mini && x1 - x0 > 30 && b.t >= 12) {
    const s = Math.min(5, b.t * 0.22);
    for (let x = x0 + 20; x < x1 - 10; x += 36) {
      const d = flow === 1 ? `M${x - s},${b.yc - s} L${x + s * 0.4},${b.yc} L${x - s},${b.yc + s}` : `M${x + s},${b.yc - s} L${x - s * 0.4},${b.yc} L${x + s},${b.yc + s}`;
      chev.push(<path key={x} d={d} className="chev" />);
    }
  }
  return (
    <g>
      <rect x={x0} y={b.y0} width={x1 - x0} height={b.t} className={'df ' + tone} />
      {!mini && <line x1={x0} y1={b.yc} x2={x1} y2={b.yc} className="critline" />}
      <line x1={x0} y1={b.y0} x2={x1} y2={b.y0} className={'dl ' + tone} />
      {gap ? (
        <>
          <line x1={x0} y1={b.y1} x2={Math.max(x0, gap[0])} y2={b.y1} className={'dl ' + tone} />
          <line x1={Math.min(x1, gap[1])} y1={b.y1} x2={x1} y2={b.y1} className={'dl ' + tone} />
        </>
      ) : (
        <line x1={x0} y1={b.y1} x2={x1} y2={b.y1} className={'dl ' + tone} />
      )}
      {round && <line x1={x0} y1={b.yc} x2={x1} y2={b.yc} className="axis" />}
      {chev}
    </g>
  );
}

/** Prirubnica (spoj fitinga): kratka linija preko kanala. */
function Flange({ x, b, tone }: { x: number; b: Band; tone: Tone }) {
  return <line x1={x} y1={b.y0 - 3} x2={x} y2={b.y1 + 3} className={'dl fl ' + tone} />;
}

/** Ogranak koji se spušta iz glavnog kanala do dna ćelije; ulaz pod 45° proširen na uzvodnoj strani. */
function BranchStub({ b, x, tB, tone, ch }: { b: Band; x: number; tB: number; tone: Tone; ch: number }) {
  const x0 = x - tB / 2;
  const x1 = x + tB / 2;
  const top = b.y1;
  const d = `M${x0 - ch},${top - 1} L${x0},${top + ch} L${x0},${ROW} L${x1},${ROW} L${x1},${top - 1} Z`;
  return (
    <g>
      <path d={d} className={'df ' + tone} />
      <path d={`M${x0 - ch},${top} L${x0},${top + ch} L${x0},${ROW}`} className={'dl ' + tone} fill="none" />
      <path d={`M${x1},${top} L${x1},${ROW}`} className={'dl ' + tone} fill="none" />
    </g>
  );
}

export function Shape(p: ShapeProps) {
  const { kind, align, tone, flow, mini, round } = p;
  const w = p.w ?? cellW(kind);
  const tL = p.tL;
  const tR = p.tR ?? tL;
  const bL = band(tL, align);
  const bR = band(tR, align);
  const tr = p.toneR ?? tone;
  const tb = p.toneB ?? tone;
  const cx = w / 2;

  switch (kind) {
    case 'duct-rect':
    case 'duct-round':
      return <Duct x0={0} x1={w} b={bL} tone={tone} round={kind === 'duct-round' || round} mini={mini} flow={flow} />;

    case 'elbow': {
      const r = Math.max(9, Math.min(18, bL.t * 0.8));
      return (
        <g>
          <Duct x0={0} x1={w} b={bL} tone={tone} round={round} mini flow={flow} />
          <Flange x={cx - 26} b={bL} tone={tone} />
          <Flange x={cx + 26} b={bL} tone={tone} />
          {/* simbol koljena: unutrašnji i spoljni luk */}
          <path d={`M${cx - 20},${bL.y1 - 2} A${r},${r} 0 0 0 ${cx - 20 + r},${bL.y1 - 2 - r}`} className="glyph" />
          <path d={`M${cx - 8},${bL.y1 - 2} A${r + 8},${r + 8} 0 0 0 ${cx + r},${bL.y0 + 2}`} className="glyph thin" />
        </g>
      );
    }

    case 'transition': {
      const xa = 26;
      const xb = w - 26;
      const d = `M${xa},${bL.y0} L${xb},${bR.y0} L${xb},${bR.y1} L${xa},${bL.y1} Z`;
      return (
        <g>
          <Duct x0={0} x1={xa} b={bL} tone={tone} round={round} mini flow={flow} />
          <path d={d} className={'df ' + tone} />
          <line x1={xa} y1={bL.y0} x2={xb} y2={bR.y0} className={'dl ' + tone} />
          <line x1={xa} y1={bL.y1} x2={xb} y2={bR.y1} className={'dl ' + tone} />
          <Duct x0={xb} x1={w} b={bR} tone={tr} round={round} mini flow={flow} />
          <Flange x={xa} b={bL} tone={tone} />
          <Flange x={xb} b={bR} tone={tr} />
        </g>
      );
    }

    case 'tee': {
      const X = bx(w);
      const tB = p.tB ?? Math.max(9, tL * 0.7);
      const xs = X + tB / 2 + 4;
      const entry45 = !p.fid || /^5-(9|27|29)$/.test(p.fid);
      const ch = entry45 ? Math.min(tB * 0.9, 20) : 0;
      return (
        <g>
          <Duct x0={0} x1={xs} b={bL} tone={tone} round={round} mini={mini} flow={flow} gap={[X - tB / 2 - ch, X + tB / 2]} />
          <Duct x0={xs} x1={w} b={bR} tone={tr} round={round} mini flow={flow} />
          <BranchStub b={bL} x={X} tB={tB} tone={tb} ch={ch} />
          <Flange x={Math.max(6, X - tB / 2 - ch - 18)} b={bL} tone={tone} />
          <Flange x={Math.min(w - 4, xs + 10)} b={bR} tone={tr} />
        </g>
      );
    }

    case 'dovetail': {
      const X = bx(w);
      const tB = p.tB ?? Math.max(9, tL * 0.7);
      const xs = 46;
      // krak 2: luk iz glavnog kanala naniže do dna ćelije
      const leg2 = `M${xs},${bL.yc} C${xs + 56},${bL.yc} ${X},${bL.yc + 26} ${X},${ROW}`;
      return (
        <g>
          <path d={leg2} className={'dleg-o ' + tb} style={{ strokeWidth: tB + 2.4 }} />
          <path d={leg2} className={'dleg-i ' + tb} style={{ strokeWidth: tB - 0.4 }} />
          <Duct x0={0} x1={xs + 4} b={bL} tone={tone} round={round} mini flow={flow} />
          <Duct x0={xs} x1={w} b={bR} tone={tr} round={round} mini flow={flow} gap={[xs + 30, X + tB / 2 + 2]} />
          <Flange x={xs} b={bL} tone={tone} />
          <path d={`M${xs + 6},${bL.yc} L${xs + 30},${bR.y1 - 1}`} className="glyph thin" />
        </g>
      );
    }

    case 'damper':
    case 'obstruction':
    case 'zeta': {
      return (
        <g>
          <Duct x0={0} x1={w} b={bL} tone={tone} round={round} mini flow={flow} />
          <Flange x={cx - 22} b={bL} tone={tone} />
          <Flange x={cx + 22} b={bL} tone={tone} />
          {kind === 'damper' && (
            <>
              <line x1={cx - 11} y1={bL.y1 - 2} x2={cx + 11} y2={bL.y0 + 2} className="glyph" />
              <circle cx={cx} cy={bL.yc} r={2.6} className="glyph-fill" />
            </>
          )}
          {kind === 'obstruction' && <circle cx={cx} cy={bL.yc} r={Math.max(3, Math.min(9, bL.t * 0.32))} className="glyph" />}
          {kind === 'zeta' && (
            <text x={cx} y={bL.yc + 4.5} className="glyph-t" textAnchor="middle">
              ζ
            </text>
          )}
        </g>
      );
    }

    case 'silencer':
    case 'firedamper':
    case 'filter':
    case 'coil':
    case 'vav':
    case 'equip': {
      const xa = 26;
      const xb = w - 26;
      const h = Math.max(bL.t + 18, 30);
      const y0 = bL.yc - h / 2;
      const y1 = y0 + h;
      const hatch: JSX.Element[] = [];
      if (kind === 'silencer') for (let x = xa + 9; x < xb + 2; x += 8) hatch.push(<line key={x} x1={x} y1={y0 + 4} x2={x - 7} y2={y1 - 4} className="glyph thin" />);
      return (
        <g>
          <Duct x0={0} x1={xa} b={bL} tone={tone} round={round} mini flow={flow} />
          <Duct x0={xb} x1={w} b={bL} tone={tone} round={round} mini flow={flow} />
          <rect x={xa} y={y0} width={xb - xa} height={h} rx={3} className={'df eq ' + tone} />
          <rect x={xa} y={y0} width={xb - xa} height={h} rx={3} className={'dl box ' + tone} />
          {kind === 'silencer' && (
            <>
              <rect x={xa + 4} y={y0 + 4} width={xb - xa - 8} height={h - 8} className="glyph thin" fill="none" />
              {hatch}
            </>
          )}
          {kind === 'firedamper' && (
            <>
              <line x1={xa} y1={y0} x2={xb} y2={y1} className="glyph" />
              <line x1={xa} y1={y1} x2={xb} y2={y0} className="glyph" />
            </>
          )}
          {kind === 'filter' && (
            <path d={Array.from({ length: 9 }, (_, i) => `${i ? 'L' : 'M'}${xa + 8 + (i * (xb - xa - 16)) / 8},${i % 2 ? y1 - 4 : y0 + 4}`).join(' ')} className="glyph" />
          )}
          {kind === 'coil' && (
            <path d={`M${xa + 6},${bL.yc} ` + Array.from({ length: 6 }, (_, i) => `q${(xb - xa - 12) / 12},${i % 2 ? h * 0.32 : -h * 0.32} ${(xb - xa - 12) / 6},0`).join(' ')} className="glyph" />
          )}
          {kind === 'vav' && (
            <>
              <line x1={xa + 10} y1={y1 - 6} x2={xb - 12} y2={y0 + 6} className="glyph" />
              <path d={`M${xb - 22},${y0 + 5} L${xb - 11},${y0 + 6} L${xb - 14},${y0 + 16}`} className="glyph" />
            </>
          )}
          {kind === 'equip' && <line x1={xa + 12} y1={bL.yc} x2={xb - 12} y2={bL.yc} className="glyph thin" />}
        </g>
      );
    }

    case 'diffuser':
    case 'grille':
    case 'valve':
    case 'open': {
      const xa = 54;
      const s = 50;
      const y0 = bL.yc - s / 2;
      const arrow = (x: number) =>
        flow === 1 ? (
          <path d={`M${x},${bL.yc} l18,0 m-6,-5 l6,5 l-6,5`} className="glyph flow" />
        ) : (
          <path d={`M${x + 18},${bL.yc} l-18,0 m6,-5 l-6,5 l6,5`} className="glyph flow" />
        );
      if (kind === 'open')
        return (
          <g>
            <Duct x0={0} x1={96} b={bL} tone={tone} round={round} mini={mini} flow={flow} />
            <line x1={96} y1={bL.y0 - 4} x2={96} y2={bL.y1 + 4} className={'dl ' + tone} />
            {arrow(106)}
          </g>
        );
      return (
        <g>
          <Duct x0={0} x1={xa} b={bL} tone={tone} round={round} mini={mini} flow={flow} />
          {kind === 'valve' ? (
            <>
              <circle cx={xa + s / 2} cy={bL.yc} r={s / 2} className={'df eq ' + tone} />
              <circle cx={xa + s / 2} cy={bL.yc} r={s / 2} className={'dl box ' + tone} />
              <circle cx={xa + s / 2} cy={bL.yc} r={s / 5} className="glyph" />
            </>
          ) : (
            <>
              <rect x={xa} y={y0} width={s} height={s} className={'df eq ' + tone} />
              <rect x={xa} y={y0} width={s} height={s} className={'dl box ' + tone} />
              {kind === 'diffuser' ? (
                <>
                  <rect x={xa + 10} y={y0 + 10} width={s - 20} height={s - 20} className="glyph thin" fill="none" />
                  <line x1={xa} y1={y0} x2={xa + s} y2={y0 + s} className="glyph thin" />
                  <line x1={xa + s} y1={y0} x2={xa} y2={y0 + s} className="glyph thin" />
                </>
              ) : (
                [0.25, 0.42, 0.58, 0.75].map((f) => <line key={f} x1={xa + 5} y1={y0 + s * f} x2={xa + s - 5} y2={y0 + s * f} className="glyph thin" />)
              )}
            </>
          )}
          {arrow(xa + s + 8)}
        </g>
      );
    }

    case 'ahu': {
      const x0 = 8;
      const x1 = 150;
      const y0 = bL.yc - 42;
      const y1 = y0 + 84;
      const my = (y0 + y1) / 2;
      return (
        <g>
          <Duct x0={x1} x1={w} b={bL} tone={tone} round={round} mini={mini} flow={flow} />
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={6} className="ahu-box" />
          <line x1={x0 + 46} y1={y0} x2={x0 + 46} y2={y1} className="ahu-sep" />
          <line x1={x0 + 82} y1={y0} x2={x0 + 82} y2={y1} className="ahu-sep" />
          {/* filter, izmjenjivač, ventilator */}
          <path d={Array.from({ length: 7 }, (_, i) => `${i ? 'L' : 'M'}${x0 + 14 + (i % 2) * 18},${y0 + 10 + i * 10.5}`).join(' ')} className="glyph thin" />
          <path d={`M${x0 + 64},${y0 + 10} ` + Array.from({ length: 6 }, (_, i) => `q${i % 2 ? 8 : -8},5.5 0,11`).join(' ')} className="glyph thin" />
          <circle cx={x0 + 112} cy={my} r={20} className="glyph" />
          <path d={`M${x0 + 112},${my - 20} a20,20 0 0 1 20,20`} className="glyph" />
          <circle cx={x0 + 112} cy={my} r={3} className="glyph-fill" />
        </g>
      );
    }
    default:
      return <Duct x0={0} x1={w} b={bL} tone={tone} round={round} mini={mini} flow={flow} />;
  }
}

const MINI_VB: Record<string, string> = {
  ahu: '2 20 196 92',
  tee: '12 32 180 118',
  dovetail: '6 32 186 118',
  diffuser: '20 34 112 64',
  grille: '20 34 112 64',
  valve: '20 34 112 64',
  open: '6 34 130 64',
  elbow: '6 36 100 60',
  damper: '6 36 100 60',
  obstruction: '6 36 100 60',
  zeta: '6 36 100 60',
  transition: '6 36 128 60',
};

/** Mala ikonica elementa za paletu i meni (isti crtež, umanjen). */
export function MiniShape({ kind, tone = 'sup' }: { kind: string; tone?: Tone }) {
  const w = cellW(kind);
  const vb = MINI_VB[kind] || `6 36 ${w - 12} 60`;
  return (
    <svg className="mini-shape" viewBox={vb} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <Shape kind={kind} w={w} tL={28} tR={kind === 'transition' ? 16 : 28} tB={22} align="center" tone={tone} flow={1} mini round={kind === 'duct-round'} />
    </svg>
  );
}
