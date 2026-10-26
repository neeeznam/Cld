import { useMemo } from 'react';
import { dimsText } from '../core/engine';
import { runTable } from '../core/table';
import type { Key } from '../i18n';
import { useStore } from '../store';
import { fmtN, nodeTitle } from './labels';

export function TablePanel() {
  const st = useStore();
  const { sys, R, t, lang } = st;
  const rows = useMemo(() => runTable(sys, R), [sys, R]);
  const terms = useMemo(() => R.terms.slice().sort((a, b) => b.S - a.S), [R]);
  return (
    <div className="tablepanel">
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th className="l">#</th>
              <th className="l">{t('cat')}</th>
              <th>{t('col_Q')}</th>
              <th>{t('col_L')}</th>
              <th>{t('col_dim')}</th>
              <th>{t('col_v')}</th>
              <th>{t('col_R')}</th>
              <th>{t('col_RL')}</th>
              <th>{t('col_z')}</th>
              <th>{t('col_Z')}</th>
              <th>{t('g_equipment')}</th>
              <th>{t('col_dp')}</th>
              <th>{t('col_sum')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.run.id} className={r.crit ? 'crit' : ''} onClick={() => st.setSel(r.run.nodes[0])}>
                <td className="l">
                  <span style={{ paddingLeft: r.depth * 10 }}>D{r.no}</span>
                </td>
                <td className="l">{t(('cat_' + r.run.cat) as Key)}</td>
                <td>{fmtN(r.Q, 0, lang)}</td>
                <td>{fmtN(r.L, 1, lang)}</td>
                <td>{dimsText(r.size)}</td>
                <td>{fmtN(r.v, 2, lang)}</td>
                <td>{fmtN(r.R, 2, lang)}</td>
                <td>{fmtN(r.RL, 1, lang)}</td>
                <td>{fmtN(r.zeta, 2, lang)}</td>
                <td>{fmtN(r.Z, 1, lang)}</td>
                <td>{fmtN(r.equip, 1, lang)}</td>
                <td>{fmtN(r.total, 1, lang)}</td>
                <td>
                  <b>{fmtN(r.cum, 1, lang)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tw">
        <table className="t narrow">
          <thead>
            <tr>
              <th className="l">{t('term')}</th>
              <th>{t('col_Q')}</th>
              <th>{t('col_sum')}</th>
              <th>{t('excess')}</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((x) => (
              <tr key={x.id} className={x.id === R.critTerm ? 'crit' : ''} onClick={() => st.setSel(x.id)}>
                <td className="l">{nodeTitle(sys.nodes[x.id], t)}</td>
                <td>{fmtN(x.Q, 0, lang)}</td>
                <td>{fmtN(x.S, 1, lang)}</td>
                <td>{fmtN(x.E, 1, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
