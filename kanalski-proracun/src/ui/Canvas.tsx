import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node as RFNode,
  type NodeProps,
} from '@xyflow/react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import { PALETTE, PALETTE_BY_KEY } from '../core/catalog';
import { dimsText } from '../core/engine';
import type { Key } from '../i18n';
import { layout } from '../layout';
import { canAttach, canInsert } from '../state';
import { useStore } from '../store';
import { DND, addFromPalette } from './actions';
import { Icon } from './Icons';
import { critEdges, fmtN, hasProblems, nodeKey, nodeTitle, portLabel, runNumbers } from './labels';

type ElData = { id: string; crit: boolean; runNo?: number };
type PlusData = { parent: string; port: number };
type EdgeData = { parent: string; port: number; insertable: boolean; crit: boolean };

function keyFromDrag(e: DragEvent): string | null {
  const k = e.dataTransfer.getData(DND) || e.dataTransfer.getData('text/plain');
  return PALETTE_BY_KEY[k] ? k : null;
}

function ElNode({ data }: NodeProps<RFNode<ElData>>) {
  const st = useStore();
  const { sys, R, t, lang, sel } = st;
  const n = sys.nodes[data.id];
  if (!n) return null;
  const r = R.nodes[data.id];
  const prob = hasProblems(sys, R, data.id);
  const sec = r?.sec;
  let sub = '';
  if (n.type === 'duct') sub = `${dimsText(sec)} · L ${fmtN(+n.p.L, 1, lang)} m`;
  else if (n.type === 'ahu') sub = `${fmtN(R.Qtot, 0, lang)} m³/h`;
  else if (n.type === 'terminal') sub = `${fmtN(+n.p.Q, 0, lang)} m³/h`;
  else if (n.type === 'transition') sub = r?.dn ? `${dimsText(sec)} → ${dimsText(r.dn)}` : dimsText(sec);
  else sub = [r?.fid, dimsText(sec)].filter(Boolean).join(' · ');
  let foot = '';
  if (n.type === 'ahu') foot = `Δp ${fmtN(R.Smax, 0, lang)} Pa`;
  else if (n.type === 'junction' && r?.dpOut) foot = `Δp ${fmtN(r.dpOut[0], 1, lang)} / ${fmtN(r.dpOut[1], 1, lang)} Pa`;
  else if (r) foot = `${n.type === 'terminal' ? '' : fmtN(r.Q, 0, lang) + ' m³/h · '}Δp ${fmtN(r.dp, 1, lang)} Pa`;
  const cls = ['el', n.type, sel === data.id ? 'sel' : '', data.crit ? 'crit' : '', prob || '', n.auto ? 'autoins' : ''].join(' ');
  return (
    <div className={cls}>
      {n.type !== 'ahu' && <Handle type="target" position={Position.Left} id="t" isConnectable={false} />}
      <div className="el-h">
        <Icon k={nodeKey(n)} />
        <div className="el-t">
          <b>{n.name || (n.type === 'duct' ? t('duct_s') : nodeTitle(n, t))}</b>
          <small>{sub}</small>
        </div>
        {data.runNo != null && n.type === 'duct' && <span className="runno">D{data.runNo}</span>}
      </div>
      <div className="el-f">
        {prob && <i className={'dot ' + prob} />}
        {foot}
      </div>
      {n.out.length >= 1 && <Handle type="source" position={Position.Right} id="p0" isConnectable={false} />}
      {n.out.length >= 2 && <Handle type="source" position={Position.Bottom} id="p1" isConnectable={false} />}
      {n.type === 'junction' && (
        <>
          <span className="plbl p0">{portLabel(n, 0, t)}</span>
          <span className="plbl p1">{portLabel(n, 1, t)}</span>
        </>
      )}
    </div>
  );
}

function PlusNode({ data, id }: NodeProps<RFNode<PlusData>>) {
  const st = useStore();
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState(false);
  const selected = st.sel === id;
  const items = PALETTE.filter(canAttach);
  return (
    <div
      className={'plus' + (over ? ' over' : '') + (selected ? ' sel' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const k = keyFromDrag(e);
        if (k) addFromPalette(st, k, { parent: data.parent, port: data.port });
      }}
    >
      <Handle type="target" position={Position.Left} id="t" isConnectable={false} />
      <button
        className="plus-b nodrag"
        title={st.t('pickFor')}
        onClick={(e) => {
          e.stopPropagation();
          st.setSel(id);
          setMenu((m) => !m);
        }}
      >
        +
      </button>
      {menu && (
        <div className="pop nodrag nowheel" onMouseLeave={() => setMenu(false)}>
          <div className="pop-h">{st.t('pickFor')}</div>
          <div className="pop-g">
            {items.map((x) => (
              <button
                key={x.key}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(false);
                  addFromPalette(st, x.key, { parent: data.parent, port: data.port });
                }}
              >
                <Icon k={x.icon} />
                <span>{st.t(x.key as Key)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InsEdge(props: EdgeProps<Edge<EdgeData>>) {
  const st = useStore();
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState(false);
  const items = PALETTE.filter(canInsert);
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} className={data?.crit ? 'e-crit' : data?.insertable ? '' : 'e-plus'} />
      {data?.insertable && (
        <EdgeLabelRenderer>
          <div
            className={'ins nodrag nopan' + (over ? ' over' : '')}
            style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}
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
            <button title={st.t('insertHere')} onClick={() => setMenu((m) => !m)}>
              +
            </button>
            {menu && (
              <div className="pop" onMouseLeave={() => setMenu(false)}>
                <div className="pop-h">{st.t('insertHere')}</div>
                <div className="pop-g">
                  {items.map((x) => (
                    <button
                      key={x.key}
                      onClick={() => {
                        setMenu(false);
                        addFromPalette(st, x.key, { parent: data.parent, port: data.port });
                      }}
                    >
                      <Icon k={x.icon} />
                      <span>{st.t(x.key as Key)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { el: ElNode, plus: PlusNode };
const edgeTypes = { ins: InsEdge };

const MIN_READABLE = 0.75;

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
      const w = Math.max(...xs) - Math.min(...xs) + 210;
      const hgt = Math.max(...ys) - Math.min(...ys) + 110;
      const z = Math.min(1, (el.clientWidth - 60) / w, (el.clientHeight - 60) / hgt);
      if (z >= MIN_READABLE) rf.fitView({ padding: 0.12, maxZoom: 1, duration: 250 });
      else rf.setViewport({ x: 30 - Math.min(...xs) * MIN_READABLE, y: 50 - Math.min(...ys) * MIN_READABLE, zoom: MIN_READABLE }, { duration: 250 });
    }, 40);
    return () => window.clearTimeout(h);
  }, [sig, rf, wrap]);
  return null;
}

export function Canvas() {
  const st = useStore();
  const { sys, R, t } = st;
  const [overEmpty, setOverEmpty] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const runNo = useMemo(() => runNumbers(R), [R]);
  const crit = useMemo(() => critEdges(R), [R]);
  const critSet = useMemo(() => new Set(R.crit), [R]);

  const { nodes, edges } = useMemo(() => {
    const slots = layout(sys);
    const nodes: RFNode[] = slots.map((s) =>
      s.kind === 'node'
        ? { id: s.id, type: 'el', position: { x: s.x, y: s.y }, data: { id: s.id, crit: critSet.has(s.id), runNo: runNo[R.runOf[s.id]] }, draggable: false }
        : { id: s.id, type: 'plus', position: { x: s.x + 60, y: s.y + 18 }, data: { parent: s.parent, port: s.port }, draggable: false, selectable: false },
    );
    const edges: Edge[] = [];
    for (const n of Object.values(sys.nodes)) {
      n.out.forEach((ch, port) => {
        const target = ch && sys.nodes[ch] ? ch : `+${n.id}:${port}`;
        if (!ch && !slots.find((s) => s.id === target)) return;
        edges.push({
          id: `${n.id}-${port}`,
          source: n.id,
          sourceHandle: 'p' + port,
          target,
          targetHandle: 't',
          type: 'ins',
          data: { parent: n.id, port, insertable: !!ch, crit: !!ch && crit.has(n.id + '>' + ch) },
        });
      });
    }
    return { nodes, edges };
  }, [sys, R, runNo, crit, critSet]);

  const sig = sys.id + ':' + (sys.root ? 1 : 0);

  if (!sys.root) {
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
        <Icon k="ahu" className="lg" />
        <p>{t('hintEmpty')}</p>
        <button className="btn pri" onClick={() => addFromPalette(st, 'ahu')}>
          + {t('ahu')}
        </button>
      </div>
    );
  }

  return (
    <div className="canvas" ref={wrap}>
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
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="mini" style={{ width: 150, height: 90 }} />
        <FitOnChange sig={sig} wrap={wrap} />
      </ReactFlow>
      <div className="hint">{t('hintDrop')}</div>
    </div>
  );
}
