import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { defaultSizing, newId } from './core/catalog';
import type { SysKind } from './core/types';
import { removeNode } from './state';
import { emptyProject, isProject, sampleProject, StoreProvider, useStore } from './store';
import { Canvas } from './ui/Canvas';
import { Icon } from './ui/Icons';
import { Inspector } from './ui/Inspector';
import { fmtN } from './ui/labels';
import { Palette } from './ui/Palette';
import { SystemPanel } from './ui/SystemPanel';
import { TablePanel } from './ui/TablePanel';

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

function TopBar({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  const st = useStore();
  const { t, P } = st;
  const fileRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [ren, setRen] = useState<number | null>(null);
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
      <div className="logo">
        <Icon k="duct-rect" />
        <div>
          <b>{t('app')}</b>
          <small>{t('appSub')}</small>
        </div>
      </div>
      <nav className="systabs" aria-label="Sistemi">
        {P.systems.map((s, i) => (
          <button
            key={s.id}
            className={'systab ' + s.kind + (i === st.si ? ' on' : '')}
            onClick={() => st.setSi(i)}
            onDoubleClick={() => setRen(i)}
            title={t(s.kind) + ' — ' + t('rename')}
          >
            <i className={'kind ' + s.kind}>{s.kind === 'supply' ? '→' : '←'}</i>
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
              s.name
            )}
          </button>
        ))}
        <div className="menu">
          <button className="ib" onClick={() => setAddOpen((x) => !x)} title={t('newSystem')}>
            +
          </button>
          {addOpen && (
            <div className="menu-pop" onMouseLeave={() => setAddOpen(false)}>
              <button onClick={() => addSystem('supply')}>→ {t('supply')}</button>
              <button onClick={() => addSystem('exhaust')}>← {t('exhaust')}</button>
              {P.systems.length > 1 && (
                <>
                  <hr />
                  <button
                    onClick={async () => {
                      setAddOpen(false);
                      if (!(await st.ask(t('delSystem') + ': ' + P.systems[st.si].name + '?'))) return;
                      const i = st.si;
                      st.editProject((p) => p.systems.splice(i, 1));
                      st.setSi(Math.max(0, i - 1));
                    }}
                  >
                    {t('delSystem')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </nav>
      <div className="tools">
        <button className="ib" onClick={st.undo} disabled={!st.canUndo} title={t('undo') + ' (Ctrl+Z)'}>
          ↶
        </button>
        <button className="ib" onClick={st.redo} disabled={!st.canRedo} title={t('redo') + ' (Ctrl+Y)'}>
          ↷
        </button>
        <button className={'ib txt' + (table ? ' on' : '')} onClick={() => setTable(!table)}>
          {t('table')}
        </button>
        <button className="ib txt" onClick={async () => (await st.ask(t('confirmNew'))) && st.replace(emptyProject())}>
          {t('newProj')}
        </button>
        <button className="ib txt" onClick={async () => (await st.ask(t('confirmNew'))) && st.replace(sampleProject())}>
          {t('example')}
        </button>
        <button className="ib txt" onClick={() => fileRef.current?.click()}>
          {t('openFile')}
        </button>
        <button
          className="ib txt"
          onClick={() => {
            download((P.name || 'projekat').replace(/[^\w\- ]+/g, '_') + '.kanal.json', JSON.stringify(P, null, 1));
            st.notify(t('saved'));
          }}
        >
          {t('save')}
        </button>
        <button className="ib txt" onClick={() => st.setLang(st.lang === 'sr' ? 'en' : 'sr')} title="Jezik / Language">
          {t('lang')}
        </button>
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

function Shell() {
  const st = useStore();
  const { t, sys, R, lang } = st;
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
      <div className="statusline">
        <span className={'kindtag ' + sys.kind}>{t(sys.kind)}</span>
        <span>
          {t('Qtot')}: <b className="mono">{fmtN(R.Qtot, 0, lang)} m³/h</b>
        </span>
        <span>
          {t('Smax')}: <b className="mono">{fmtN(R.Smax, 0, lang)} Pa</b>
        </span>
        {R.proposals.length > 0 && (
          <button className="pill acc lnkpill" onClick={() => setTab('sys')}>
            {t('proposals')}: {R.proposals.length}
          </button>
        )}
      </div>
      <div className="main">
        <Palette />
        <div className="center">
          <ReactFlowProvider>
            <Canvas />
          </ReactFlowProvider>
          {table && <TablePanel />}
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
