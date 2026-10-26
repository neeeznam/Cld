// Raspored šeme: tok s lijeva na desno; prolaz račve ide pravo, ogranak ispod.
import type { System } from './core/types';

export const COL = 206;
export const ROW = 112;

export interface Slot {
  /** Element ili slobodan priključak ("+"). */
  kind: 'node' | 'plus';
  id: string;
  parent?: string;
  port?: number;
  x: number;
  y: number;
}

export function layout(sys: System): Slot[] {
  const out: Slot[] = [];
  if (!sys.root || !sys.nodes[sys.root]) return out;
  const visiting = new Set<string>();
  // vraća broj redova koje podstablo zauzima
  const place = (id: string, col: number, row: number): number => {
    const n = sys.nodes[id];
    if (!n || visiting.has(id)) return 1;
    visiting.add(id);
    out.push({ kind: 'node', id, x: col * COL, y: row * ROW });
    if (!n.out.length) return 1;
    let used = 0;
    n.out.forEach((ch, port) => {
      const r = row + used;
      if (ch && sys.nodes[ch]) used += place(ch, col + 1, r);
      else {
        out.push({ kind: 'plus', id: `+${id}:${port}`, parent: id, port, x: (col + 1) * COL, y: r * ROW });
        used += 1;
      }
    });
    return Math.max(1, used);
  };
  place(sys.root, 0, 0);
  return out;
}
