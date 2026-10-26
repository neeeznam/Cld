// Izmjene stabla sistema (čiste funkcije nad kopijom projekta).
import { isInline, makeNode, type PaletteItem } from './core/catalog';
import type { Node, System } from './core/types';

export function parentOf(sys: System, id: string): { parent: Node; port: number } | null {
  for (const n of Object.values(sys.nodes)) {
    const port = n.out.indexOf(id);
    if (port >= 0) return { parent: n, port };
  }
  return null;
}

/** Može li element iz palete da se doda na slobodan priključak. */
export function canAttach(item: PaletteItem): boolean {
  return item.type !== 'ahu';
}

/** Može li element da se ubaci između dva postojeća elementa. */
export function canInsert(item: PaletteItem): boolean {
  return isInline(item.type);
}

/** Dodaje element na priključak; ako je priključak zauzet, ubacuje ga između (samo za elemente sa 1 ulazom i 1 izlazom). */
export function attach(sys: System, parentId: string, port: number, item: PaletteItem): string | null {
  const parent = sys.nodes[parentId];
  if (!parent || !canAttach(item)) return null;
  const existing = parent.out[port];
  if (existing && !canInsert(item)) return null;
  const n = makeNode(item);
  sys.nodes[n.id] = n;
  if (existing) n.out[0] = existing;
  parent.out[port] = n.id;
  return n.id;
}

export function setRoot(sys: System, item: PaletteItem): string | null {
  if (item.type !== 'ahu' || sys.root) return null;
  const n = makeNode(item);
  sys.nodes[n.id] = n;
  sys.root = n.id;
  return n.id;
}

function collect(sys: System, id: string, acc: string[] = []): string[] {
  const n = sys.nodes[id];
  if (!n) return acc;
  acc.push(id);
  n.out.forEach((c) => c && collect(sys, c, acc));
  return acc;
}

/** Briše element. Element sa jednim izlazom se "izvlači" (dijete se veže za roditelja), ostali se brišu sa podstablom. */
export function removeNode(sys: System, id: string, withSubtree = false): void {
  const n = sys.nodes[id];
  if (!n) return;
  if (id === sys.root) {
    sys.nodes = {};
    sys.root = '';
    return;
  }
  const par = parentOf(sys, id);
  const splice = !withSubtree && isInline(n.type);
  if (splice) {
    if (par) par.parent.out[par.port] = n.out[0] ?? null;
    delete sys.nodes[id];
    return;
  }
  for (const x of collect(sys, id)) delete sys.nodes[x];
  if (par) par.parent.out[par.port] = null;
}

export function subtreeSize(sys: System, id: string): number {
  return collect(sys, id).length;
}
