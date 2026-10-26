// Raspored šeme: tok s lijeva na desno; prolaz račve ide pravo, ogranak ispod.
import type { Node, System } from './core/types';

export const ROW = 150;

export interface Slot {
  /** Element ili slobodan priključak ("+"). */
  kind: 'node' | 'plus';
  id: string;
  parent?: string;
  port?: number;
  x: number;
  y: number;
  w: number;
}

export function layout(sys: System, widthOf: (n: Node) => number, plusW: number): Slot[] {
  const out: Slot[] = [];
  if (!sys.root || !sys.nodes[sys.root]) return out;
  const visiting = new Set<string>();
  // vraća broj redova koje podstablo zauzima
  const place = (id: string, x: number, row: number): number => {
    const n = sys.nodes[id];
    if (!n || visiting.has(id)) return 1;
    visiting.add(id);
    out.push({ kind: 'node', id, x, y: row * ROW, w: widthOf(n) });
    if (!n.out.length) return 1;
    const nx = x + widthOf(n);
    let used = 0;
    n.out.forEach((ch, port) => {
      const r = row + used;
      if (ch && sys.nodes[ch]) used += place(ch, nx, r);
      else {
        out.push({ kind: 'plus', id: `+${id}:${port}`, parent: id, port, x: nx, y: r * ROW, w: plusW });
        used += 1;
      }
    });
    return Math.max(1, used);
  };
  place(sys.root, 0, 0);
  return out;
}
