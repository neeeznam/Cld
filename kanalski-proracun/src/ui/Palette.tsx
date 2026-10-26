import { PALETTE, type PaletteGroup } from '../core/catalog';
import type { Key } from '../i18n';
import { useStore } from '../store';
import { DND, addFromPalette } from './actions';
import { Icon } from './Icons';

const GROUPS: PaletteGroup[] = ['source', 'duct', 'fitting', 'junction', 'equipment', 'terminal'];

export function Palette() {
  const st = useStore();
  const { t } = st;
  return (
    <aside className="palette" aria-label={t('palette')}>
      {GROUPS.map((g) => (
        <section key={g}>
          <h3>{t(('g_' + g) as Key)}</h3>
          <div className="tiles">
            {PALETTE.filter((x) => x.group === g).map((x) => (
              <button
                key={x.key}
                className="tile"
                draggable
                title={t(x.key as Key)}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND, x.key);
                  e.dataTransfer.setData('text/plain', x.key);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => addFromPalette(st, x.key)}
              >
                <Icon k={x.icon} />
                <span>{t(x.key as Key)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}
