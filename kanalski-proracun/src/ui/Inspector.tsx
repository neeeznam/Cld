import { FIT, variants } from '../core/catalog';
import { dimsText } from '../core/engine';
import type { Node, Shape } from '../core/types';
import { fitName, paramLabel, warnText, type Key } from '../i18n';
import { removeNode } from '../state';
import { useStore } from '../store';
import { Icon } from './Icons';
import { fmtN, nodeKey, nodeTitle, portLabel } from './labels';

function NumField({ label, unit, value, onChange, step, min }: { label: string; unit?: string; value: number | string | undefined; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="f">
      <span>
        {label}
        {unit ? ` [${unit}]` : ''}
      </span>
      <input
        type="number"
        step={step ?? 'any'}
        min={min}
        value={value ?? ''}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

function FittingFields({ n, shape }: { n: Node; shape: Shape }) {
  const st = useStore();
  const { t, lang, sys, R } = st;
  const r = R.nodes[n.id];
  const sym = n.p.kind === 'sym';
  const list = variants(n.type, shape, sys.kind, sym);
  const fid = n.fid || r?.fid;
  const f = fid ? FIT[fid] : null;
  if (!list.length && !f) return null;
  return (
    <>
      <label className="f wide">
        <span>{t('variant')}</span>
        <select
          value={n.fid || ''}
          onChange={(e) => st.editNode(n.id, (x) => (e.target.value ? (x.fid = e.target.value) : delete x.fid))}
        >
          <option value="">
            {t('autoVariant')}
            {r?.fid ? ` (${r.fid})` : ''}
          </option>
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id} — {fitName(lang, x.id)}
            </option>
          ))}
        </select>
      </label>
      {f && (
        <div className="fields">
          {f.p.map((z) =>
            z.t === 'sel' ? (
              <label className="f" key={z.k}>
                <span>{paramLabel(lang, f.id, z.k)}</span>
                <select value={String(n.p[z.k] ?? z.d)} onChange={(e) => st.editNode(n.id, (x) => (x.p[z.k] = e.target.value))}>
                  {z.o!.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <NumField key={z.k} label={paramLabel(lang, f.id, z.k)} unit={z.u} value={n.p[z.k] ?? z.d} onChange={(v) => st.editNode(n.id, (x) => (x.p[z.k] = v), z.k)} />
            ),
          )}
        </div>
      )}
      {f?.note && <p className="note">{f.note}</p>}
    </>
  );
}

export function Inspector() {
  const st = useStore();
  const { sys, R, t, lang, sel } = st;
  const n = sel ? sys.nodes[sel] : null;
  if (!n) return <div className="insp-empty">{t('noSel')}</div>;
  const r = R.nodes[n.id];
  const run = r?.run ? R.runs[r.run] : null;
  const shape: Shape = r?.sec?.shape || (n.shape as Shape) || 'rect';
  const set = (k: string, v: number | string) => st.editNode(n.id, (x) => (x.p[k] = v), k);
  const del = (sub: boolean) => {
    if (sub && !confirm(t('confirmDel'))) return;
    st.edit((s) => removeNode(s, n.id, sub));
    st.setSel(null);
  };
  const inline = n.out.length === 1 && n.type !== 'ahu';

  return (
    <div className="insp">
      <div className="insp-h">
        <Icon k={nodeKey(n)} />
        <div>
          <b>{nodeTitle(n, t)}</b>
          <small>{t(nodeKey(n) as Key)}</small>
        </div>
      </div>
      <div className="insp-b">
        <label className="f wide">
          <span>{t('name')}</span>
          <input type="text" value={n.name || ''} placeholder={t(nodeKey(n) as Key)} onChange={(e) => st.editNode(n.id, (x) => (x.name = e.target.value), 'name')} />
        </label>

        {n.type === 'duct' && (
          <>
            <div className="fields">
              <NumField label={t('length')} unit="m" value={n.p.L} min={0} onChange={(v) => set('L', v)} />
              <label className="f">
                <span>{t('cat')}</span>
                <select value={String(n.p.cat || '')} onChange={(e) => st.editNode(n.id, (x) => (e.target.value ? (x.p.cat = e.target.value) : delete x.p.cat))}>
                  <option value="">{t('cat_auto')}{run ? ` (${t(('cat_' + run.cat) as Key)})` : ''}</option>
                  <option value="main">{t('cat_main')}</option>
                  <option value="branch">{t('cat_branch')}</option>
                  <option value="conn">{t('cat_conn')}</option>
                </select>
              </label>
            </div>
            <div className="seg" role="group">
              <button className={n.shape !== 'round' ? 'on' : ''} onClick={() => st.editNode(n.id, (x) => ((x.shape = 'rect'), (x.dims = null)))}>
                {t('duct-rect')}
              </button>
              <button className={n.shape === 'round' ? 'on' : ''} onClick={() => st.editNode(n.id, (x) => ((x.shape = 'round'), (x.dims = null)))}>
                {t('duct-round')}
              </button>
            </div>
            <div className="seg" role="group" aria-label={t('dims')}>
              <button className={!n.dims ? 'on' : ''} onClick={() => st.editNode(n.id, (x) => (x.dims = null))}>
                {t('auto')}
              </button>
              <button
                className={n.dims ? 'on' : ''}
                onClick={() => st.editNode(n.id, (x) => (x.dims = run ? { ...run.size } : shape === 'round' ? { shape, D: 200 } : { shape, a: 400, b: 200 }))}
              >
                {t('manual')}
              </button>
            </div>
            {n.dims && (
              <div className="fields">
                {shape === 'round' ? (
                  <NumField label={t('diam')} unit="mm" value={n.dims.D} min={50} onChange={(v) => st.editNode(n.id, (x) => (x.dims = { shape: 'round', D: v }), 'D')} />
                ) : (
                  <>
                    <NumField label={t('width')} unit="mm" value={n.dims.a} min={50} onChange={(v) => st.editNode(n.id, (x) => (x.dims = { ...(x.dims as any), shape: 'rect', a: v }), 'a')} />
                    <NumField label={t('height')} unit="mm" value={n.dims.b} min={50} onChange={(v) => st.editNode(n.id, (x) => (x.dims = { ...(x.dims as any), shape: 'rect', b: v }), 'b')} />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {(n.type === 'elbow' || n.type === 'damper' || n.type === 'obstruction' || n.type === 'transition' || n.type === 'junction' || (n.type === 'terminal' && n.p.kind === 'open')) && (
          <FittingFields n={n} shape={shape} />
        )}

        {n.type === 'zeta' && <NumField label={t('zetaVal')} value={n.p.z} onChange={(v) => set('z', v)} />}

        {n.type === 'terminal' && (
          <div className="fields">
            <NumField label={t('flow')} unit="m³/h" value={n.p.Q} min={0} onChange={(v) => set('Q', v)} />
            {n.p.kind !== 'open' && (
              <>
                <NumField label={t('catalogDp')} unit="Pa" value={n.p.dp} min={0} onChange={(v) => set('dp', v)} />
                <NumField label={t('atFlow')} unit="m³/h" value={n.p.Qref} min={0} onChange={(v) => set('Qref', v)} />
              </>
            )}
          </div>
        )}
        {n.type === 'equipment' && (
          <div className="fields">
            <NumField label={t('catalogDp')} unit="Pa" value={n.p.dp} min={0} onChange={(v) => set('dp', v)} />
            <NumField label={t('atFlow')} unit="m³/h" value={n.p.Qref} min={0} onChange={(v) => set('Qref', v)} />
          </div>
        )}
        {(n.type === 'equipment' || (n.type === 'terminal' && n.p.kind !== 'open')) && <p className="note">{t('catalogNote')}</p>}

        {r && (
          <div className="res">
            <div className="sub-h">{t('results')}</div>
            <div className="resl">
              <div>
                <span>{t('flow')}</span>
                <b>{fmtN(r.Q, 0, lang)} m³/h</b>
              </div>
              {r.sec && (
                <div>
                  <span>{t('section')}</span>
                  <b>
                    {dimsText(r.sec)}
                    {r.dn ? ' → ' + dimsText(r.dn) : ''}
                  </b>
                </div>
              )}
              {r.sec && (
                <div>
                  <span>{t('velocity')}</span>
                  <b>{fmtN(r.sec.v, 2, lang)} m/s</b>
                </div>
              )}
              {r.sec && (
                <div>
                  <span>{t('pdyn')}</span>
                  <b>{fmtN(r.sec.pd, 2, lang)} Pa</b>
                </div>
              )}
              {r.R != null && (
                <div>
                  <span>{t('Rlbl')}</span>
                  <b>{fmtN(r.R, 2, lang)} Pa/m</b>
                </div>
              )}
              {r.C != null && (
                <div>
                  <span>{t('zetaLbl')}</span>
                  <b>{fmtN(r.C, 3, lang)}</b>
                </div>
              )}
              {r.dpOut ? (
                r.dpOut.map((d, i) => (
                  <div key={i}>
                    <span>
                      {t('dpLbl')} {portLabel(n, i, t)} (ζ {fmtN(r.Cout?.[i], 3, lang)})
                    </span>
                    <b className="hi">{fmtN(d, 2, lang)} Pa</b>
                  </div>
                ))
              ) : (
                <div>
                  <span>{t('dpLbl')}</span>
                  <b className="hi">{fmtN(n.type === 'ahu' ? R.Smax : r.dp, 2, lang)} Pa</b>
                </div>
              )}
            </div>
            {r.ref && <p className="note">ζ {t(('ref_' + r.ref) as Key)}</p>}
            {r.fid && (
              <p className="note">
                {t('source')}: ASHRAE Fundamentals — Duct Fitting Database, {r.fid}
                {FIT[r.fid]?.id?.match(/^5-(7|8|9|25|27|28)$/) ? ' (SMACNA)' : ''} — {fitName(lang, r.fid)}
              </p>
            )}
            {n.type === 'ahu' && <p className="note">{t('extNote')}</p>}
            {r.err && <div className="msg e">{warnText(lang, r.err)}</div>}
            {r.warn.map((w, i) => (
              <div key={i} className="msg w">
                {warnText(lang, w)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="insp-f">
        {inline && (
          <button className="btn danger" onClick={() => del(false)}>
            {t('del')}
          </button>
        )}
        <button className="btn danger ghost" onClick={() => del(true)}>
          {t('delBranch')}
        </button>
      </div>
    </div>
  );
}
