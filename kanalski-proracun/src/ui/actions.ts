import { PALETTE_BY_KEY } from '../core/catalog';
import { attach, canInsert, setRoot } from '../state';
import type { Store } from '../store';

export const DND = 'application/x-kanalcalc';

/** Dodaje element iz palete: na izabrani "+", na slobodan izlaz izabranog elementa ili iza njega. */
export function addFromPalette(st: Store, key: string, target?: { parent: string; port: number } | null): void {
  const item = PALETTE_BY_KEY[key];
  if (!item) return;
  const sys = st.sys;
  if (!sys.root) {
    if (item.type !== 'ahu') {
      st.notify(st.t('hintEmpty'));
      return;
    }
    let id: string | null = null;
    st.edit((s) => (id = setRoot(s, item)));
    if (id) st.setSel(id);
    return;
  }
  let tg = target || null;
  if (!tg && st.sel) {
    if (st.sel.startsWith('+')) {
      const [parent, port] = st.sel.slice(1).split(':');
      tg = { parent, port: +port };
    } else {
      const n = sys.nodes[st.sel];
      if (n) {
        const free = n.out.indexOf(null);
        if (free >= 0) tg = { parent: n.id, port: free };
        else if (n.out.length === 1 && canInsert(item)) tg = { parent: n.id, port: 0 };
      }
    }
  }
  if (!tg) {
    st.notify(st.t('hintDrop'));
    return;
  }
  let id: string | null = null;
  const { parent, port } = tg;
  st.edit((s) => (id = attach(s, parent, port, item)));
  if (id) st.setSel(id);
  else st.notify(st.t('hintDrop'));
}
