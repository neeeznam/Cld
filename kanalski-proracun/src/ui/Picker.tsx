// Iskačući izbor elementa (na "+" ili na spoju dva elementa); renderuje se iznad crteža.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PaletteItem } from '../core/catalog';
import type { Key } from '../i18n';
import { useStore } from '../store';
import { MiniShape } from './draw';

export function Picker({ at, title, items, onPick, onClose }: { at: DOMRect; title: string; items: PaletteItem[]; onPick: (key: string) => void; onClose: () => void }) {
  const st = useStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const W = 344;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, at.left + at.width / 2 - W / 2));
  const below = at.bottom + 8;
  const top = below + 330 > window.innerHeight ? Math.max(8, at.top - 338) : below;
  const tone = st.sys.kind === 'supply' ? 'sup' : 'exh';
  return createPortal(
    <div className="picker" ref={ref} style={{ left, top, width: W }} role="menu">
      <div className="picker-h">{title}</div>
      <div className="picker-g">
        {items.map((x) => (
          <button key={x.key} role="menuitem" onClick={() => onPick(x.key)}>
            <MiniShape kind={x.icon} tone={tone} />
            <span>{st.t(x.key as Key)}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
