import {
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node as RFNode,
  type NodeProps,
} from '@xyflow/react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import { friction, section } from '../core/ashrae/library.js';
import { PALETTE, PALETTE_BY_KEY } from '../core/catalog';
import { dimsText, type Result } from '../core/engine';
import type { Node, System } from '../core/types';
import type { T } from '../i18n';
import { layout } from '../layout';
import { canAttach, canInsert } from '../state';
import { useStore, type ColorMode } from '../store';
import { DND, addFromPalette } from './actions';
import { Shape, type Tone } from './draw';
import { PLUS_W, ROW, band, bx, cellW, thick, type Align } from './geom';
import { critEdges, fmtN, hasProblems, nodeKey, nodeTitle, runNumbers } from './labels';
import { Picker } from './Picker';

// ---------- boje po režimu ----------

function ratioTone(x: number): Tone {
  if (!isFinite(x)) return 'none';
  if (x < 0.5) return 'v0';
  if (x < 0.8) return 'v1';
  if (x <= 1.0001) return 'v2';
  return 'v3';
}

interface RunLook {
  t: number;
  tone: Tone;
  round: boolean;
}

function runLooks(sys: System, R: Result, mode: ColorMode, epsmm: number): Record<string, RunLook> {
  const out: Record<string, RunLook> = {};
  const S = sys.sizing;
  for (const run of Object.values(R.runs)) {
    let tone: Tone = sys.kind === 'supply' ? 'sup' : 'exh';
    if (mode !== 'system') {
      const s = section(run.Q, run.size, R.air);
      const vmax = S.v[{ main: 0, branch: 1, conn: 2 }[run.cat]];
      tone = mode === 'velocity' ? ratioTone(s.v / vmax) : ratioTone(friction(s, epsmm, R.air).R / S.Rt);
    }
    out[run.id] = { t: thick(run.size), tone, round: run.shape === 'round' };
  }
  return out;
}

// ---------- podaci čvorova ----------

type ElData = {
  id: string;
  kind: string;
  w: number;
  align: Align;
  tL: number;
  tR: number;
  tB?: number;
  tone: Tone;
  toneR: Tone;
  toneB?: Tone;
  round: boolean;
  crit: boolean;
  runNo?: number;
};
type PlusData = { parent: string; port: number; t: number; align: Align; tone: Tone; round: boolean };
type EdgeData = { parent: string; port: number; insertable: boolean; branch: boolean; t: number; tone: Tone; crit: boolean };

function keyFromDrag(e: DragEvent): string | null {
  const k = e.dataTransfer.getData(DND) || e.dataTransfer.getData('text/plain');
  return PALETTE_BY_KEY[k] ? k : null;
}

function short(n: Node, t: T): string {
  if (n.name) return n.name;
  if (n.type === 'duct') return t('duct_s');
  const k = ('s_' + nodeKey(n)) as Parameters<T>[0];
  const v = t(k);
  return v === k ? nodeTitle(n, t) : v;
}

/** Skraćuje natpis da stane u širinu ćelije (procjena za uski font). */
function fit(s: string, px: number, size = 6.6): string {
  const max = Math.max(4, Math.floor(px / size));
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function ElNode({ data }: NodeProps<RFNode<ElData>>) {
  const st = useStore();
  const { sys, R, t, lang, sel } = st;
  const n = sys.nodes[data.id];
  const [over, setOver] = useState(false);
  if (!n) return null;
  const r = R.nodes[data.id];
  const prob = hasProblems(sys, R, data.id);
  const flow = sys.kind === 'supply' ? 1 : -1;
  const bL = band(data.tL, data.align);
  const bR = band(data.tR, data.align);
  const isSel = sel === data.id;
  const W = data.w;
  const f = (x: number | undefined, d = 1) => fmtN(x, d, lang);

  // natpisi
  const top: string[] = [];
  const bot: string[] = [];
  const name = short(n, t);
  if (n.type === 'duct') {
    top.push(dimsText(r?.sec));
    bot.push(`${f(r?.Q, 0)} m³/h · ${f(r?.sec?.v, 2)} m/s`);
    bot.push(`L ${f(+n.p.L, 1)} m · R ${f(r?.R, 2)} · ${f(r?.dp, 1)} Pa`);
  } else if (n.type === 'ahu') {
    bot.push(name);
    bot.push(`${f(R.Qtot, 0)} m³/h`);
    bot.push(`${t('dpLbl')} ${f(R.Smax, 0)} Pa`);
  } else if (n.type === 'terminal') {
    top.push(name);
    bot.push(`${f(+n.p.Q, 0)} m³/h · ${f(r?.dp, 1)} Pa`);
  } else if (n.type === 'junction') {
    top.push(`${name}${r?.fid ? ' ' + r.fid : ''}`);
    if (r?.dpOut) {
      bot.push(`${t(n.p.kind === 'sym' ? 'leg1' : 'straight')} ${f(r.dpOut[0], 1)} Pa`);
      bot.push(`${t(n.p.kind === 'sym' ? 'leg2' : 'branch')} ${f(r.dpOut[1], 1)} Pa`);
    }
  } else if (n.type === 'transition') {
    top.push(`${name}${r?.fid ? ' ' + r.fid : ''}`);
    bot.push(`${dimsText(r?.sec)} → ${dimsText(r?.dn)}`);
    bot.push(`ζ ${f(r?.C, 2)} · ${f(r?.dp, 1)} Pa`);
  } else {
    top.push(`${name}${r?.fid ? ' ' + r.fid : ''}`);
    bot.push(r?.C != null ? `ζ ${f(r.C, 2)} · ${f(r.dp, 1)} Pa` : `${f(r?.dp, 1)} Pa`);
  }
  const ahu = n.type === 'ahu';
  const term = n.type === 'terminal';
  const yTop = ahu ? 14 : term && n.p.kind !== 'open' ? Math.min(bL.y0, bL.yc - 25) - 8 : n.type === 'equipment' ? Math.min(bL.y0, bL.yc - Math.max(bL.t + 18, 30) / 2) - 8 : bL.y0 - 9;
  const yBot = ahu ? bL.yc + 60 : Math.max(bL.y1, bR.y1, term ? bL.yc + 25 : 0, n.type === 'equipment' ? bL.yc + Math.max(bL.t + 18, 30) / 2 : 0) + 15;
  const junc = n.type === 'junction';
  const hitY0 = ahu ? 6 : bL.y0 - 26;
  const hitY1 = ahu ? 140 : yBot + 18;

  return (
    <div
      className={'cell' + (over ? ' over' : '')}
      onDragOver={(e) => {
        if (n.out.length === 1 && !ahu) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const k = keyFromDrag(e);
        if (!k) return;
        e.preventDefault();
        // pušteno na element: dodaj iza njega (ubaci između ako je izlaz zauzet)
        addFromPalette(st, k, { parent: n.id, port: 0 });
      }}
    >
      {!ahu && <Handle type="target" position={Position.Left} id="t" isConnectable={false} style={{ top: bL.yc }} />}
      <svg width={W} height={ROW} className={['elsvg', isSel ? 'sel' : '', data.crit ? 'crit' : '', prob || ''].join(' ')}>
        <rect x={2} y={hitY0} width={W - 4} height={hitY1 - hitY0} rx={8} className="hit" />
        {junc && <rect x={bx(W) - 24} y={bL.y1} width={48} height={ROW - bL.y1} className="hit" />}
        <Shape
          kind={data.kind}
          w={W}
          tL={data.tL}
          tR={data.tR}
          tB={data.tB}
          align={data.align}
          tone={data.tone}
          toneR={data.toneR}
          toneB={data.toneB}
          flow={flow}
          fid={r?.fid}
          round={data.round}
        />
        {top.map((s, i) => (
          <text
            key={'t' + i}
            x={n.type === 'duct' ? W / 2 : 8 + (prob ? 19 : 0)}
            y={yTop}
            className={n.type === 'duct' ? 'lb-dim' : 'lb-name'}
            textAnchor={n.type === 'duct' ? 'middle' : 'start'}
          >
            {n.type === 'duct' ? s : fit(s, W - 14 - (prob ? 19 : 0), 7.4)}
          </text>
        ))}
        {bot.map((s, i) => (
          <text key={'b' + i} x={ahu ? 79 : 8} y={yBot + i * 15} className={ahu && i === 0 ? 'lb-dim' : i ? 'lb mut' : 'lb'} textAnchor={ahu ? 'middle' : 'start'}>
            {ahu ? s : fit(s, W - 10)}
          </text>
        ))}
        {data.runNo != null && n.type === 'duct' && (
          <g className="runchip">
            <rect x={8} y={yTop - 11} width={28} height={15} rx={7.5} />
            <text x={22} y={yTop} textAnchor="middle">
              D{data.runNo}
            </text>
          </g>
        )}
        {prob && (
          <g className={'badge ' + prob} transform={`translate(${n.type === 'duct' ? (data.runNo != null ? 40 : 8) : 8},${yTop - 12})`}>
            <path d="M7.5,0 L15,14 L0,14 Z" />
            <text x={7.5} y={12} textAnchor="middle">
              !
            </text>
          </g>
        )}
      </svg>
      {n.out.length >= 1 && <Handle type="source" position={Position.Right} id="p0" isConnectable={false} style={{ top: bR.yc }} />}
      {n.out.length >= 2 && <Handle type="source" position={Position.Bottom} id="p1" isConnectable={false} style={{ left: bx(W) }} />}
    </div>
  );
}

function PlusNode({ data, id }: NodeProps<RFNode<PlusData>>) {
  const st = useStore();
  const [over, setOver] = useState(false);
  const [at, setAt] = useState<DOMRect | null>(null);
  const b = band(data.t, data.align);
  const items = useMemo(() => PALETTE.filter(canAttach), []);
  const drop = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const k = keyFromDrag(e);
      if (k) addFromPalette(st, k, { parent: data.parent, port: data.port });
    },
  };
  return (
    <div className={'pluscell' + (over ? ' over' : '') + (st.sel === id ? ' sel' : '')}>
      <Handle type="target" position={Position.Left} id="t" isConnectable={false} style={{ top: b.yc }} />
      <svg width={PLUS_W} height={ROW} className="plussvg">
        <rect x={0} y={b.y0} width={58} height={b.t} className={'stub ' + data.tone} />
        <line x1={0} y1={b.y0} x2={58} y2={b.y0} className={'stubl ' + data.tone} />
        <line x1={0} y1={b.y1} x2={58} y2={b.y1} className={'stubl ' + data.tone} />
      </svg>
      <div className="dropzone nodrag" style={{ top: b.yc - 40, left: 0, width: 150, height: 80 }} {...drop} />
      <button
        className="grip nodrag"
        style={{ top: b.yc - 17, left: 66 }}
        title={st.t('pickFor')}
        {...drop}
        onClick={(e) => {
          e.stopPropagation();
          st.setSel(id);
          setAt((e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {at && (
        <Picker
          at={at}
          title={st.t('pickFor')}
          items={items}
          onClose={() => setAt(null)}
          onPick={(k) => {
            setAt(null);
            addFromPalette(st, k, { parent: data.parent, port: data.port });
          }}
        />
      )}
    </div>
  );
}

function DuctEdge(props: EdgeProps<Edge<EdgeData>>) {
  const st = useStore();
  const { sourceX, sourceY, targetX, targetY, data } = props;
  const [over, setOver] = useState(false);
  const [at, setAt] = useState<DOMRect | null>(null);
  const items = useMemo(() => PALETTE.filter(canInsert), []);
  if (!data) return null;
  let path = '';
  if (data.branch) {
    const rr = Math.min(26, Math.max(4, (targetX - sourceX) / 2), Math.max(4, targetY - sourceY));
    path = `M${sourceX},${sourceY - 1} L${sourceX},${targetY - rr} Q${sourceX},${targetY} ${sourceX + rr},${targetY} L${targetX + 1},${targetY}`;
  }
  return (
    <>
      {data.branch && (
        <g className={data.crit ? 'crit' : ''}>
          <path d={path} className={'dleg-o ' + data.tone} style={{ strokeWidth: data.t + 2.4 }} />
          <path d={path} className={'dleg-i ' + data.tone} style={{ strokeWidth: data.t - 0.4 }} />
          {data.crit && <path d={path} className="critpath" />}
        </g>
      )}
      {data.insertable && !data.branch && (
        <EdgeLabelRenderer>
          <div
            className={'ins nodrag nopan' + (over ? ' over' : '') + (at ? ' open' : '')}
            style={{ transform: `translate(-50%,-50%) translate(${sourceX}px,${sourceY}px)` }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const k = keyFromDrag(e);
              if (k && canInsert(PALETTE_BY_KEY[k])) addFromPalette(st, k, { parent: data.parent, port: data.port });
            }}
          >
            <button title={st.t('insertHere')} onClick={(e) => setAt((e.currentTarget as HTMLElement).getBoundingClientRect())}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 6v12M6 12h12" />
              </svg>
            </button>
          </div>
          {at && (
            <Picker
              at={at}
              title={st.t('insertHere')}
              items={items}
              onClose={() => setAt(null)}
              onPick={(k) => {
                setAt(null);
                addFromPalette(st, k, { parent: data.parent, port: data.port });
              }}
            />
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { el: ElNode, plus: PlusNode };
const edgeTypes = { duct: DuctEdge };

const MIN_READABLE = 0.95;

/** Cijela šema ako je čitljiva; inače čitljiv zum sa početkom sistema (klima komora) uz lijevu ivicu. */
function FitOnChange({ sig, wrap }: { sig: string; wrap: RefObject<HTMLDivElement> }) {
  const rf = useReactFlow();
  useEffect(() => {
    const h = window.setTimeout(() => {
      const el = wrap.current;
      const ns = rf.getNodes();
      if (!el || !ns.length) return;
      const xs = ns.map((n) => n.position.x);
      const ys = ns.map((n) => n.position.y);
      const w = Math.max(...ns.map((n) => n.position.x + (Number(n.style?.width) || 200))) - Math.min(...xs);
      const hgt = Math.max(...ys) - Math.min(...ys) + ROW;
      const z = Math.min(1.15, (el.clientWidth - 40) / w, (el.clientHeight - 80) / hgt);
      if (z >= MIN_READABLE) rf.fitView({ padding: 0.06, maxZoom: 1.15, duration: 250 });
      else {
        // čitljiv zum; po visini centrirano ako stane, inače od vrha
        const zz = MIN_READABLE;
        const y = hgt * zz < el.clientHeight - 80 ? (el.clientHeight - 60 - hgt * zz) / 2 : 24;
        rf.setViewport({ x: 24 - Math.min(...xs) * zz, y: y - Math.min(...ys) * zz, zoom: zz }, { duration: 250 });
      }
    }, 40);
    return () => window.clearTimeout(h);
  }, [sig, rf, wrap]);
  return null;
}

function ZoomBadge() {
  const { zoom } = useViewport();
  return <span className="zoombadge">{Math.round(zoom * 100)} %</span>;
}

function Legend({ mode }: { mode: ColorMode }) {
  const { t, sys } = useStore();
  if (mode === 'system')
    return (
      <div className="legend">
        <span className={'sw ' + (sys.kind === 'supply' ? 'sup' : 'exh')} />
        {t(sys.kind)}
        <span className="sw crit" />
        {t('critPath')}
      </div>
    );
  return (
    <div className="legend">
      <b>{mode === 'velocity' ? 'v / v max' : 'R / R cilj'}</b>
      <span className="sw v0" />
      &lt; 0,5
      <span className="sw v1" />
      0,5–0,8
      <span className="sw v2" />
      0,8–1,0
      <span className="sw v3" />
      &gt; 1,0
    </div>
  );
}

export function Canvas() {
  const st = useStore();
  const { sys, R, t, P, color } = st;
  const [overEmpty, setOverEmpty] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const runNo = useMemo(() => runNumbers(R), [R]);
  const crit = useMemo(() => critEdges(R), [R]);
  const critSet = useMemo(() => new Set(R.crit), [R]);
  const looks = useMemo(() => runLooks(sys, R, color, P.eps), [sys, R, color, P.eps]);

  const { nodes, edges } = useMemo(() => {
    const slots = layout(sys, (n) => cellW(nodeKey(n)), PLUS_W);
    const align: Align = sys.sizing.reducer === 'oneSide' ? 'top' : 'center';
    const baseTone: Tone = sys.kind === 'supply' ? 'sup' : 'exh';
    const lookOf = (id: string | null | undefined): RunLook | null => (id && R.runOf[id] ? looks[R.runOf[id]] : null);
    const rootLook = lookOf(sys.nodes[sys.root]?.out[0]);
    const fallback: RunLook = { t: 18, tone: baseTone, round: false };

    const nodes: RFNode[] = slots.map((s) => {
      if (s.kind === 'plus') {
        const par = sys.nodes[s.parent!];
        const lk = (par?.type === 'ahu' ? rootLook : lookOf(par?.id)) || fallback;
        return {
          id: s.id,
          type: 'plus',
          position: { x: s.x, y: s.y },
          data: { parent: s.parent, port: s.port, t: Math.max(10, lk.t * 0.85), align: lk.round ? 'center' : align, tone: lk.tone, round: lk.round },
          draggable: false,
          selectable: false,
          style: { width: PLUS_W, height: ROW },
        };
      }
      const n = sys.nodes[s.id];
      const own = n.type === 'ahu' ? rootLook || fallback : lookOf(n.id) || fallback;
      const c0 = lookOf(n.out[0]);
      const c1 = lookOf(n.out[1]);
      const right = n.type === 'transition' || n.type === 'junction' ? c0 || own : own;
      const data: ElData = {
        id: n.id,
        kind: nodeKey(n),
        w: s.w,
        align: own.round ? 'center' : align,
        tL: own.t,
        tR: right.t,
        tB: n.type === 'junction' ? (c1 || own).t : undefined,
        tone: own.tone,
        toneR: right.tone,
        toneB: n.type === 'junction' ? (c1 || own).tone : undefined,
        round: own.round,
        crit: critSet.has(n.id),
        runNo: runNo[R.runOf[n.id]],
      };
      return { id: n.id, type: 'el', position: { x: s.x, y: s.y }, data, draggable: false, style: { width: s.w, height: ROW } };
    });

    const edges: Edge[] = [];
    const slotIds = new Set(slots.map((s) => s.id));
    for (const n of Object.values(sys.nodes)) {
      n.out.forEach((ch, port) => {
        const target = ch && sys.nodes[ch] ? ch : `+${n.id}:${port}`;
        if (!slotIds.has(target)) return;
        const lk = (ch ? lookOf(ch) : null) || lookOf(n.id) || fallback;
        edges.push({
          id: `${n.id}-${port}`,
          source: n.id,
          sourceHandle: 'p' + port,
          target,
          targetHandle: 't',
          type: 'duct',
          data: {
            parent: n.id,
            port,
            insertable: !!ch,
            branch: port === 1,
            t: ch ? lk.t : Math.max(10, lk.t * 0.85),
            tone: lk.tone,
            crit: !!ch && crit.has(n.id + '>' + ch),
          },
        });
      });
    }
    return { nodes, edges };
  }, [sys, R, runNo, crit, critSet, looks]);

  const sig = sys.id + ':' + (sys.root ? 1 : 0);

  if (!sys.root) {
    const tone: Tone = sys.kind === 'supply' ? 'sup' : 'exh';
    return (
      <div
        className={'empty' + (overEmpty ? ' over' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setOverEmpty(true);
        }}
        onDragLeave={() => setOverEmpty(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOverEmpty(false);
          const k = keyFromDrag(e);
          if (k) addFromPalette(st, k);
        }}
      >
        <svg viewBox="0 0 330 150" className="empty-art" aria-hidden="true">
          <Shape kind="ahu" tL={22} align="center" tone={tone} flow={1} mini />
          <rect x={220} y={55} width={48} height={22} className={'stub ' + tone} />
          <circle cx={292} cy={66} r={17} className="empty-grip" />
          <path d="M292 57v18M283 66h18" className="empty-plus" />
        </svg>
        <h2>{t('emptyTitle')}</h2>
        <p>{t('hintEmpty')}</p>
        <button className="btn pri" onClick={() => addFromPalette(st, 'ahu')}>
          {t('ahu')}
        </button>
      </div>
    );
  }

  return (
    <div className={'canvas mode-' + color} ref={wrap}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable
        onNodeClick={(_, n) => n.type === 'el' && st.setSel(n.id)}
        onPaneClick={() => st.setSel(null)}
        minZoom={0.2}
        maxZoom={2.2}
        nodesFocusable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background id="minor" variant={BackgroundVariant.Lines} gap={22} lineWidth={0.5} className="bg-minor" />
        <Background id="major" variant={BackgroundVariant.Lines} gap={110} lineWidth={0.9} className="bg-major" />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap
          pannable
          zoomable
          className="mini"
          position="bottom-right"
          style={{ width: 150, height: 86 }}
          nodeColor={(n) => (n.type === 'plus' ? 'transparent' : 'var(--mm-node)')}
        />
        <FitOnChange sig={sig} wrap={wrap} />
      </ReactFlow>
      <div className="canvas-foot">
        <Legend mode={color} />
        <ZoomBadge />
      </div>
    </div>
  );
}
