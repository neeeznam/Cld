import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { PALETTE_BY_KEY, defaultSizing, makeNode, newId } from './core/catalog';
import { applyProposal } from './core/engine';
import type { SysKind } from './core/types';
import { removeNode } from './state';
import { emptyProject, isProject, sampleProject, StoreProvider, useStore, type ColorMode } from './store';
import { Canvas } from './ui/Canvas';
import { Inspector } from './ui/Inspector';
import { fmtN } from './ui/labels';
import { Palette } from './ui/Palette';
import { SystemPanel } from './ui/SystemPanel';
import { TablePanel } from './ui/TablePanel';
import { UiIcon } from './ui/UiIcons';

type Theme = 'auto' | 'light' | 'dark';

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

function useTheme(): [Theme, () => void] {
  const [th, setTh] = useState<Theme>(() => {
    try {
      const v = localStorage.getItem('kanalcalc.theme');
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    const el = document.documentElement;
    if (th === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', th);
    try {
      localStorage.setItem('kanalcalc.theme', th);
    } catch {
      /* nije dostupno */
    }
  }, [th]);
  return [th, () => setTh((x) => (x === 'auto' ? 'light' : x === 'light' ? 'dark' : 'auto'))];
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="logo-mark" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" className="lm-bg" />
      <path d="M6 10h20v5H6zM10 15h5v11h-5zM17 15h5v11h-5z" className="lm-duct" />
      <path d="M6 10h20M6 15h4M15 15h2M22 15h4M10 15v11M15 15v11M17 15v11M22 15v11" className="lm-line" />
    </svg>
  );
}

function TopBar({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  const st = useStore();
  const { t, P } = st;
  const fileRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [ren, setRen] = useState<number | null>(null);
  const [theme, cycleTheme] = useTheme();

  const addSystem = (kind: SysKind) => {
    setAddOpen(false);
    const n = P.systems.length;
    st.editProject((p) => {
      p.systems.push({ id: newId('s'), name: `${t(kind)} ${p.systems.filter((s) => s.kind === kind).length + 1}`, kind, root: '', nodes: {}, sizing: defaultSizing() });
    });
    st.setSi(n);
  };

  return (
    <header className="appbar">
      <div className="brand">
        <Logo />
        <div>
          <b>{t('app')}</b>
          <small>{P.name}</small>
        </div>
      </div>

      <nav className="systabs" aria-label={t('summary')}>
        {P.systems.map((s, i) => (
          <button
            key={s.id}
            className={'systab ' + s.kind + (i === st.si ? ' on' : '')}
            onClick={() => st.setSi(i)}
            onDoubleClick={() => setRen(i)}
            title={t(s.kind) + ' — ' + t('rename')}
          >
            <i className={'sdot ' + s.kind} />
            {ren === i ? (
              <input
                className="ren"
                autoFocus
                defaultValue={s.name}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setRen(null);
                }}
                onBlur={(e) => {
                  const nm = e.target.value.trim();
                  setRen(null);
                  if (nm && nm !== s.name) st.editProject((p) => (p.systems[i].name = nm));
                }}
              />
            ) : (
              <span>{s.name}</span>
            )}
          </button>
        ))}
        <div className="menu">
          <button className="tb-btn icon" onClick={() => setAddOpen((x) => !x)} title={t('newSystem')} aria-label={t('newSystem')}>
            <UiIcon k="plus" />
          </button>
          {addOpen && (
            <div className="menu-pop" onMouseLeave={() => setAddOpen(false)}>
              <div className="menu-h">{t('newSystem')}</div>
              <button onClick={() => addSystem('supply')}>
                <i className="sdot supply" /> {t('supply')}
              </button>
              <button onClick={() => addSystem('exhaust')}>
                <i className="sdot exhaust" /> {t('exhaust')}
              </button>
              {P.systems.length > 1 && (
                <>
                  <hr />
                  <button
                    className="danger"
                    onClick={async () => {
                      setAddOpen(false);
                      if (!(await st.ask(t('delSystem') + ': ' + P.systems[st.si].name + '?'))) return;
                      const i = st.si;
                      st.editProject((p) => p.systems.splice(i, 1));
                      st.setSi(Math.max(0, i - 1));
                    }}
                  >
                    <UiIcon k="trash" size={16} /> {t('delSystem')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </nav>

      <div className="tools">
        <div className="tgroup">
          <button className="tb-btn" onClick={async () => (await st.ask(t('confirmNew'))) && st.replace(emptyProject())} title={t('newProj')}>
            <UiIcon k="file" />
            <span>{t('newProj')}</span>
          </button>
          <button className="tb-btn" onClick={() => fileRef.current?.click()} title={t('openFile')}>
            <UiIcon k="open" />
            <span>{t('openFile')}</span>
          </button>
          <button
            className="tb-btn"
            title={t('save')}
            onClick={() => {
              download((P.name || 'projekat').replace(/[^\w\- ]+/g, '_') + '.kanal.json', JSON.stringify(P, null, 1));
              st.notify(t('saved'));
            }}
          >
            <UiIcon k="save" />
            <span>{t('save')}</span>
          </button>
          <button className="tb-btn" onClick={async () => (await st.ask(t('confirmNew'))) && st.replace(sampleProject())} title={t('example')}>
            <UiIcon k="sample" />
            <span>{t('example')}</span>
          </button>
        </div>
        <div className="tgroup">
          <button className="tb-btn icon" onClick={st.undo} disabled={!st.canUndo} title={t('undo') + ' (Ctrl+Z)'} aria-label={t('undo')}>
            <UiIcon k="undo" />
          </button>
          <button className="tb-btn icon" onClick={st.redo} disabled={!st.canRedo} title={t('redo') + ' (Ctrl+Y)'} aria-label={t('redo')}>
            <UiIcon k="redo" />
          </button>
        </div>
        <div className="tgroup">
          <button className={'tb-btn' + (table ? ' on' : '')} onClick={() => setTable(!table)} aria-pressed={table}>
            <UiIcon k="table" />
            <span>{t('table')}</span>
          </button>
          <button className="tb-btn icon" onClick={cycleTheme} title={t('theme') + ': ' + t(('theme_' + theme) as 'theme_auto')} aria-label={t('theme')}>
            <UiIcon k={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto'} />
          </button>
          <button className="tb-btn" onClick={() => st.setLang(st.lang === 'sr' ? 'en' : 'sr')} title="Jezik / Language">
            <UiIcon k="globe" />
            <span>{st.lang === 'sr' ? 'SR' : 'EN'}</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const p = JSON.parse(await f.text());
              if (!isProject(p)) throw new Error();
              st.replace(p);
              st.notify(t('loaded'));
            } catch {
              st.notify(t('badFile'));
            }
          }}
        />
      </div>
    </header>
  );
}

function StatusBar({ onShowSystem }: { onShowSystem: () => void }) {
  const st = useStore();
  const { t, sys, R, lang } = st;
  const warns = Object.values(R.nodes).reduce((a, r) => a + r.warn.length + (r.err ? 1 : 0), 0);
  const modes: ColorMode[] = ['system', 'velocity', 'friction'];
  return (
    <div className="statusbar">
      <span className={'kindtag ' + sys.kind}>
        <i className={'sdot ' + sys.kind} />
        {t(sys.kind)}
      </span>
      <span className="stat">
        <small>{t('statQ')}</small>
        <b>{fmtN(R.Qtot, 0, lang)}</b> m³/h
      </span>
      <span className="stat">
        <small>{t('statDp')}</small>
        <b>{fmtN(R.Smax, 0, lang)}</b> Pa
      </span>
      <button className={'stat link' + (warns ? ' warn' : ' ok')} onClick={onShowSystem}>
        <UiIcon k={warns ? 'alert' : 'check'} size={15} />
        {warns ? `${warns} ${t('warnShort')}` : t('noProblemsShort')}
      </button>
      {R.proposals.length > 0 && (
        <span className="propbar">
          <button className="stat link acc" onClick={onShowSystem}>
            {t('proposals')}: <b>{R.proposals.length}</b>
          </button>
          <button
            className="btn sm pri"
            onClick={() =>
              st.edit((s) => {
                for (const pr of R.proposals) applyProposal(s, pr, makeNode(PALETTE_BY_KEY.transition));
              })
            }
          >
            {t('acceptAll')}
          </button>
        </span>
      )}
      <span className="grow" />
      <span className="seg sm" role="group" aria-label={t('colorBy')}>
        <span className="seg-l">{t('colorBy')}</span>
        {modes.map((m) => (
          <button key={m} className={st.color === m ? 'on' : ''} onClick={() => st.setColor(m)}>
            {t(('color_' + m) as 'color_system')}
          </button>
        ))}
      </span>
    </div>
  );
}

function Shell() {
  const st = useStore();
  const { t, sys } = st;
  const [tab, setTab] = useState<'insp' | 'sys'>('sys');
  const [table, setTable] = useState(false);

  useEffect(() => {
    if (st.sel && !st.sel.startsWith('+')) setTab('insp');
  }, [st.sel]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (e.key === 'Delete' && st.sel && sys.nodes[st.sel]) {
        const n = sys.nodes[st.sel];
        if (n.out.length === 1 && n.type !== 'ahu') {
          st.edit((s) => removeNode(s, n.id, false));
          st.setSel(null);
        }
      } else if (e.key === 'Escape') st.setSel(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [st, sys]);

  return (
    <div className="app">
      <TopBar table={table} setTable={setTable} />
      <div className="main">
        <Palette />
        <div className="center">
          <ReactFlowProvider>
            <Canvas />
          </ReactFlowProvider>
          {table && <TablePanel />}
          <StatusBar onShowSystem={() => setTab('sys')} />
        </div>
        <aside className="side">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'insp'} onClick={() => setTab('insp')}>
              {t('inspector')}
            </button>
            <button role="tab" aria-selected={tab === 'sys'} onClick={() => setTab('sys')}>
              {t('summary')}
            </button>
          </div>
          <div className="side-b">{tab === 'insp' ? <Inspector /> : <SystemPanel />}</div>
        </aside>
      </div>
      {st.toast && <div className="toast">{st.toast}</div>}
      {st.dialog && (
        <div className="modal-bg" onClick={() => st.dialog?.done(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>{st.dialog.msg}</p>
            <div className="modal-f">
              <button className="btn" onClick={() => st.dialog?.done(false)}>
                {t('cancel')}
              </button>
              <button className="btn pri" autoFocus onClick={() => st.dialog?.done(true)}>
                {t('ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
