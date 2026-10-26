import { useState } from 'react';
import { PALETTE, type PaletteGroup } from '../core/catalog';
import type { Key } from '../i18n';
import { useStore } from '../store';
import { DND, addFromPalette } from './actions';
import { MiniShape } from './draw';
import { UiIcon } from './UiIcons';

const GROUPS: PaletteGroup[] = ['source', 'duct', 'fitting', 'junction', 'equipment', 'terminal'];

export function Palette() {
  const st = useStore();
  const { t, sys } = st;
  const [q, setQ] = useState('');
  const tone = sys.kind === 'supply' ? 'sup' : 'exh';
  const match = (k: string) => !q || t(k as Key).toLowerCase().includes(q.toLowerCase());
  return (
    <aside className="palette" aria-label={t('palette')}>
      <div className="pal-search">
        <UiIcon k="search" size={16} />
        <input id="pal-q" type="search" value={q} placeholder={t('search')} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pal-scroll">
        {GROUPS.map((g) => {
          const items = PALETTE.filter((x) => x.group === g && match(x.key));
          if (!items.length) return null;
          return (
            <section key={g}>
              <h3>{t(('g_' + g) as Key)}</h3>
              <div className="tiles">
                {items.map((x) => (
                  <button
                    key={x.key}
                    className="tile"
                    draggable
                    title={t(x.key as Key)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND, x.key);
                      e.dataTransfer.setData('text/plain', x.key);
                      e.dataTransfer.effectAllowed = 'copy';
                      document.body.classList.add('dnd');
                    }}
                    onDragEnd={() => document.body.classList.remove('dnd')}
                    onClick={() => addFromPalette(st, x.key)}
                  >
                    <MiniShape kind={x.icon} tone={tone} />
                    <span>{t(x.key as Key)}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="pal-hint">{t('hintDrop')}</p>
    </aside>
  );
}
