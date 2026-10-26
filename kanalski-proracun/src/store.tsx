// Stanje aplikacije: projekat, izabrani sistem, selekcija, undo/redo, jezik.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { compute, type Result } from './core/engine';
import { emptyProject, sampleProject } from './core/sample';
import type { Node, Project, System } from './core/types';
import { makeT, type Lang, type T } from './i18n';

const LS_PROJ = 'kanalcalc.project.v1';
const LS_LANG = 'kanalcalc.lang';
const LS_COLOR = 'kanalcalc.color';

export type ColorMode = 'system' | 'velocity' | 'friction';

function loadLS<X>(key: string): X | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as X) : null;
  } catch {
    return null;
  }
}
function saveLS(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* memorija pregledača nije dostupna */
  }
}

export function isProject(x: any): x is Project {
  return !!x && x.version === 1 && Array.isArray(x.systems) && x.systems.every((s: any) => s && typeof s.nodes === 'object' && s.sizing);
}

export interface Store {
  P: Project;
  si: number;
  sys: System;
  R: Result;
  sel: string | null;
  lang: Lang;
  t: T;
  toast: string | null;
  canUndo: boolean;
  canRedo: boolean;
  setSi(i: number): void;
  setSel(id: string | null): void;
  setLang(l: Lang): void;
  color: ColorMode;
  setColor(c: ColorMode): void;
  /** Izmjena izabranog sistema (kopija + undo); key spaja uzastopne izmjene istog polja. */
  edit(fn: (sys: System, P: Project) => void, key?: string): void;
  /** Izmjena cijelog projekta (kopija + undo). */
  editProject(fn: (P: Project) => void, key?: string): void;
  /** Izmjena jednog elementa. */
  editNode(id: string, fn: (n: Node) => void, key?: string): void;
  replace(P: Project): void;
  undo(): void;
  redo(): void;
  notify(msg: string): void;
  /** Potvrda unutar aplikacije (umjesto window.confirm). */
  ask(msg: string): Promise<boolean>;
  dialog: { msg: string; done: (ok: boolean) => void } | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [P, setP] = useState<Project>(() => {
    const p = loadLS<Project>(LS_PROJ);
    return isProject(p) ? p : sampleProject();
  });
  const [si, setSiRaw] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [lang, setLangRaw] = useState<Lang>(() => (loadLS<Lang>(LS_LANG) === 'en' ? 'en' : 'sr'));
  const [toast, setToast] = useState<string | null>(null);
  const [color, setColor] = useState<ColorMode>(() => {
    const c = loadLS<ColorMode>(LS_COLOR);
    return c === 'velocity' || c === 'friction' ? c : 'system';
  });
  const [dialog, setDialog] = useState<Store['dialog']>(null);
  const undoS = useRef<string[]>([]);
  const redoS = useRef<string[]>([]);
  const [, bump] = useState(0);

  useEffect(() => saveLS(LS_PROJ, P), [P]);
  useEffect(() => saveLS(LS_LANG, lang), [lang]);
  useEffect(() => saveLS(LS_COLOR, color), [color]);

  const idx = Math.min(si, P.systems.length - 1);
  const sys = P.systems[idx];
  const R = useMemo(() => compute(P, sys), [P, sys]);
  const t = useMemo(() => makeT(lang), [lang]);

  // uvijek najnovija verzija projekta (izmjene se nadovezuju i kad ih ima više u istom događaju)
  const pRef = useRef(P);
  pRef.current = P;

  // uzastopne izmjene istog polja (kucanje) spajaju se u jedan korak poništavanja
  const lastEdit = useRef<{ key: string; at: number } | null>(null);

  const commit = useCallback((next: Project, key?: string) => {
    const now = Date.now();
    const merge = !!key && lastEdit.current?.key === key && now - lastEdit.current.at < 1500;
    if (!merge) {
      undoS.current.push(JSON.stringify(pRef.current));
      if (undoS.current.length > 100) undoS.current.shift();
    }
    lastEdit.current = key ? { key, at: now } : null;
    redoS.current = [];
    pRef.current = next;
    setP(next);
    bump((x) => x + 1);
  }, []);

  const editProject = useCallback(
    (fn: (P: Project) => void, key?: string) => {
      const next = structuredClone(pRef.current);
      fn(next);
      commit(next, key);
    },
    [commit],
  );

  const edit = useCallback(
    (fn: (sys: System, P: Project) => void, key?: string) => editProject((p) => fn(p.systems[Math.min(si, p.systems.length - 1)], p), key),
    [editProject, si],
  );

  const editNode = useCallback(
    (id: string, fn: (n: Node) => void, key?: string) =>
      edit((s) => {
        const n = s.nodes[id];
        if (n) fn(n);
      }, key && id + ':' + key),
    [edit],
  );

  const notify = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((x) => (x === m ? null : x)), 2400);
  }, []);

  const store: Store = {
    P,
    si: idx,
    sys,
    R,
    sel,
    lang,
    t,
    toast,
    canUndo: undoS.current.length > 0,
    canRedo: redoS.current.length > 0,
    setSi: (i) => {
      setSiRaw(i);
      setSel(null);
    },
    setSel,
    setLang: setLangRaw,
    color,
    setColor,
    edit,
    editProject,
    editNode,
    replace: (next) => {
      commit(next);
      setSiRaw(0);
      setSel(null);
    },
    undo: () => {
      const s = undoS.current.pop();
      if (!s) return;
      redoS.current.push(JSON.stringify(pRef.current));
      pRef.current = JSON.parse(s);
      setP(pRef.current);
      bump((x) => x + 1);
    },
    redo: () => {
      const s = redoS.current.pop();
      if (!s) return;
      undoS.current.push(JSON.stringify(pRef.current));
      pRef.current = JSON.parse(s);
      setP(pRef.current);
      bump((x) => x + 1);
    },
    notify,
    dialog,
    ask: (msg) =>
      new Promise<boolean>((resolve) =>
        setDialog({
          msg,
          done: (ok) => {
            setDialog(null);
            resolve(ok);
          },
        }),
      ),
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export { emptyProject, sampleProject };
