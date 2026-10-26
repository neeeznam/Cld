import { useState } from 'react';
import { PALETTE_BY_KEY, ROUND_DEFAULT, makeNode } from '../core/catalog';
import { applyProposal, dimsText } from '../core/engine';
import type { Sizing } from '../core/types';
import { warnText } from '../i18n';
import { useStore } from '../store';
import { fmtN, nodeTitle } from './labels';

function Num({ label, unit, value, onChange, step }: { label: string; unit?: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="f">
      <span>
        {label}
        {unit ? ` [${unit}]` : ''}
      </span>
      <input type="number" step={step ?? 'any'} value={value} onChange={(e) => isFinite(parseFloat(e.target.value)) && onChange(parseFloat(e.target.value))} />
    </label>
  );
}

function RoundList({ label, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  const [txt, setTxt] = useState(value.join(', '));
  return (
    <label className="f wide">
      <span>
        {label}{' '}
        <button type="button" className="lnk" title="EN 1506 + 150, 300" onClick={() => (setTxt(ROUND_DEFAULT.join(', ')), onChange(ROUND_DEFAULT.slice()))}>
          ↺
        </button>
      </span>
      <input
        type="text"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => {
          const l = Array.from(new Set(txt.split(/[\s,;]+/).map(Number).filter((x) => x > 0))).sort((a, b) => a - b);
          if (l.length) onChange(l);
          setTxt((l.length ? l : value).join(', '));
        }}
      />
    </label>
  );
}

export function SystemPanel() {
  const st = useStore();
  const { sys, R, t, lang, P } = st;
  const S = sys.sizing;
  const setS = (patch: Partial<Sizing>) => st.edit((s) => Object.assign(s.sizing, patch), 'sizing:' + Object.keys(patch).join());
  const crit = R.critTerm ? sys.nodes[R.critTerm] : null;

  const accept = (all: boolean) =>
    st.edit((s) => {
      const list = all ? R.proposals : R.proposals.slice(0, 1);
      for (const pr of list) applyProposal(s, pr, makeNode(PALETTE_BY_KEY.transition));
    });

  const problems: { id: string; text: string; err: boolean }[] = [];
  for (const [id, r] of Object.entries(R.nodes)) {
    const n = sys.nodes[id];
    if (!n) continue;
    if (r.err) problems.push({ id, text: nodeTitle(n, t) + ': ' + warnText(lang, r.err), err: true });
    for (const w of r.warn) problems.push({ id, text: nodeTitle(n, t) + ': ' + warnText(lang, w), err: false });
  }

  return (
    <div className="syspanel">
      <section className="card">
        <div className="sub-h">{t('summary')}</div>
        <div className="kpis">
          <div className="kpi">
            <b>{fmtN(R.Qtot, 0, lang)}</b>
            <small>{t('Qtot')} [m³/h]</small>
          </div>
          <div className="kpi">
            <b>{fmtN(R.Smax, 0, lang)}</b>
            <small>{t('Smax')} [Pa]</small>
          </div>
        </div>
        {crit && (
          <p className="note">
            {t('critTerm')}:{' '}
            <button className="lnk" onClick={() => st.setSel(crit.id)}>
              {nodeTitle(crit, t)}
            </button>
          </p>
        )}
        <p className="note">{t('extNote')}</p>
        {R.orphans.length > 0 && (
          <div className="msg w">
            {R.orphans.length} {t('orphans')}
          </div>
        )}
      </section>

      <section className="card">
        <div className="sub-h">
          {t('proposals')} {R.proposals.length > 0 && <span className="pill acc">{R.proposals.length}</span>}
        </div>
        {R.proposals.length === 0 ? (
          <p className="note">{t('noProposals')}</p>
        ) : (
          <>
            <ul className="props">
              {R.proposals.map((pr, i) => (
                <li key={i}>
                  <button className="lnk" onClick={() => st.setSel(pr.junction)}>
                    {t('propTxt', { from: dimsText(pr.from), to: dimsText(pr.to) })}
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => st.edit((s) => applyProposal(s, pr, makeNode(PALETTE_BY_KEY.transition)))}
                  >
                    {t('accept')}
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn pri" onClick={() => accept(true)}>
              {t('acceptAll')}
            </button>
          </>
        )}
      </section>

      <section className="card">
        <div className="sub-h">{t('settings')}</div>
        <div className="seg" role="group" aria-label={t('method')}>
          <button className={S.method === 'friction' ? 'on' : ''} onClick={() => setS({ method: 'friction' })}>
            {t('m_friction')}
          </button>
          <button className={S.method === 'velocity' ? 'on' : ''} onClick={() => setS({ method: 'velocity' })}>
            {t('m_velocity')}
          </button>
        </div>
        <div className="fields">
          {S.method === 'friction' ? (
            <>
              <Num label={t('Rt')} unit="Pa/m" value={S.Rt} onChange={(v) => setS({ Rt: v })} />
              <Num label={t('Rmin')} unit="Pa/m" value={S.Rmin} onChange={(v) => setS({ Rmin: v })} />
            </>
          ) : (
            <Num label={t('vKeep')} value={S.vKeep} step={0.05} onChange={(v) => setS({ vKeep: v })} />
          )}
          <Num label={t('vMain')} unit="m/s" value={S.v[0]} onChange={(v) => setS({ v: [v, S.v[1], S.v[2]] })} />
          <Num label={t('vBranch')} unit="m/s" value={S.v[1]} onChange={(v) => setS({ v: [S.v[0], v, S.v[2]] })} />
          <Num label={t('vConn')} unit="m/s" value={S.v[2]} onChange={(v) => setS({ v: [S.v[0], S.v[1], v] })} />
        </div>
        {S.method === 'friction' && <p className="note">{t('vMaxNote')}</p>}
        <div className="fields">
          <Num label={t('hFix')} unit="mm" value={S.hFix} step={S.rectStep} onChange={(v) => setS({ hFix: Math.max(0, v) })} />
          <Num label={t('hMax')} unit="mm" value={S.hMax} step={S.rectStep} onChange={(v) => setS({ hMax: v })} />
          <Num label={t('arMax')} value={S.arMax} step={0.5} onChange={(v) => setS({ arMax: v })} />
          <Num label={t('rectStep')} unit="mm" value={S.rectStep} step={10} onChange={(v) => setS({ rectStep: Math.max(10, v) })} />
        </div>
        <label className="f wide">
          <span>{t('reducer')}</span>
          <select value={S.reducer} onChange={(e) => setS({ reducer: e.target.value as Sizing['reducer'] })}>
            <option value="oneSide">{t('r_oneSide')}</option>
            <option value="symmetric">{t('r_symmetric')}</option>
            <option value="pyramid">{t('r_pyramid')}</option>
          </select>
        </label>
        <RoundList key={sys.id} label={t('roundList')} value={S.round} onChange={(v) => setS({ round: v })} />
      </section>

      <section className="card">
        <div className="sub-h">{t('air')}</div>
        <div className="fields">
          <Num label={t('temp')} unit="°C" value={P.t} onChange={(v) => st.editProject((p) => (p.t = v), 'air:t')} />
          <Num label={t('alt')} unit="m" value={P.z} onChange={(v) => st.editProject((p) => (p.z = v), 'air:z')} />
          <Num label={t('eps')} unit="mm" value={P.eps} step={0.01} onChange={(v) => st.editProject((p) => (p.eps = v), 'air:eps')} />
        </div>
        <p className="note">ρ = {fmtN(R.air.rho, 3, lang)} kg/m³</p>
      </section>

      <section className="card">
        <div className="sub-h">{t('balance')}</div>
        {R.bal.length === 0 ? (
          <p className="note">{t('noBal')}</p>
        ) : (
          <ul className="props">
            {R.bal.map((b) => (
              <li key={b.run}>
                <button className="lnk" onClick={() => st.setSel(b.junction)}>
                  {nodeTitle(sys.nodes[b.junction], t)} — {t(sys.nodes[b.junction].p.kind === 'sym' ? (b.port ? 'leg2' : 'leg1') : b.port ? 'branch' : 'straight')}
                </button>
                <span className="mono">
                  {fmtN(b.D, 1, lang)} Pa
                  {b.damper && isFinite(b.damper.th) ? ` · ${t('damperAngle')} ${fmtN(b.damper.th, 0, lang)}°` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="note">{t('throttle')}</p>
      </section>

      <section className="card">
        <div className="sub-h">
          {t('problems')} {problems.length > 0 && <span className="pill warn">{problems.length}</span>}
        </div>
        {problems.length === 0 ? (
          <p className="note">{t('noProblems')}</p>
        ) : (
          <ul className="probs">
            {problems.map((p, i) => (
              <li key={i} className={p.err ? 'e' : 'w'}>
                <button className="lnk" onClick={() => st.setSel(p.id)}>
                  {p.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
