// ============================================================
//  COMMISSIONS — finalized projects this month, seller, paid/pending
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, MESES_L } from '../../core/data'
import { Badge, Avatar, Empty, Seg } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Commission, Project, Seller } from '../../core/types'

type CommissionRow = Omit<Commission, 'seller'> & { project?: Project; seller?: Seller }
interface SellerAgg { seller?: Seller; total: number; pending: number; count: number }

export function CommissionsPage() {
  const { state, dispatch } = useStore()
  const [view, setView] = React.useState('all') // all | pending | paid

  const rows: CommissionRow[] = state.commissions.map(c => {
    const project = state.projects.find(x => x.id === c.projectId)
    const seller = sel.seller(state, c.seller)
    return { ...c, project, seller }
  }).filter(r => r.project)

  const filtered = rows.filter(r => view === 'all' || r.status === view)
  const totalPending = rows.filter(r => r.status === 'pending').reduce((a, r) => a + r.amount, 0)
  const totalPaid = rows.filter(r => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
  const total = totalPending + totalPaid

  // group by seller
  const bySeller: Record<string, SellerAgg> = {}
  rows.forEach(r => {
    const k = r.seller ? r.seller.id : 'x'
    if (!bySeller[k]) bySeller[k] = { seller: r.seller, total: 0, pending: 0, count: 0 }
    bySeller[k].total += r.amount; bySeller[k].count++
    if (r.status === 'pending') bySeller[k].pending += r.amount
  })

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Comisiones</h2><span className="sub">{MESES_L[5]} 2026</span></div>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <div className="kpi kpi-accent"><div className="k-label">Total del mes</div><div className="k-val text-[26px]">{fmtMoney(total)}</div><div className="k-foot">{rows.length} proyectos finalizados</div></div>
        <div className="kpi"><div className="k-label">Pendiente de pago</div><div className="k-val text-[26px] text-warn">{fmtMoney(totalPending)}</div><div className="k-foot">{rows.filter(r=>r.status==='pending').length} comisiones</div></div>
        <div className="kpi"><div className="k-label">Pagado</div><div className="k-val text-[26px] text-ok">{fmtMoney(totalPaid)}</div><div className="k-foot">{rows.filter(r=>r.status==='paid').length} comisiones</div></div>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-4 items-start">
        <div className="card overflow-hidden">
          <div className="card-h">
            <Icon name="commissions" size={17} className="text-acc" />
            <span className="ttl">Detalle de comisiones</span>
            <span className="flex-1"></span>
            <Seg value={view} onChange={setView} options={[{ value: 'all', label: 'Todas' }, { value: 'pending', label: 'Pendientes' }, { value: 'paid', label: 'Pagadas' }]} />
          </div>
          {filtered.length === 0 ? <Empty icon="commissions">Sin comisiones en esta vista</Empty> : (
            <table className="tbl">
              <thead><tr><th>Proyecto</th><th>Cliente</th><th>Vendedor</th><th className="num">Base</th><th className="num">Comisión</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filtered.map(r => {
                  const base = sel.budget(r.project!)
                  return (
                    <tr key={r.id} className="cursor-default">
                      <td><span className="mono text-acc font-semibold">{r.project!.code}</span><div className="meta mt-0.5">Cerrado {r.project!.closedOn ? fmtDate(r.project!.closedOn) : '—'}</div></td>
                      <td>{sel.clientName(state, r.project!.client)}</td>
                      <td><span className="inline-flex items-center gap-[7px]"><Avatar name={r.seller ? r.seller.name : ''} size={22} /> {r.seller ? r.seller.name : '—'}</span></td>
                      <td className="num text-tx-2">{fmtMoney(base)}</td>
                      <td className="num font-semibold">{fmtMoney2(r.amount)}<div className="meta mt-0.5">{r.seller ? (r.seller.rate * 100).toFixed(1) : 0}%</div></td>
                      <td>{r.status === 'paid' ? <Badge color="var(--ok)">Pagada</Badge> : <Badge color="var(--warn)">Pendiente</Badge>}</td>
                      <td>
                        <button className={'btn btn-sm ' + (r.status === 'paid' ? 'btn-ghost' : 'btn-primary')} onClick={() => dispatch({ type: 'TOGGLE_COMMISSION', id: r.id })}>
                          {r.status === 'paid' ? 'Revertir' : <><Icon name="check" size={13} /> Marcar pagada</>}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* by seller */}
        <div className="card">
          <div className="card-h"><Icon name="clients" size={16} className="text-st-5" /><span className="ttl">Por vendedor</span></div>
          <div className="card-b flex flex-col gap-3">
            {Object.values(bySeller).map((b, i) => (
              <div key={i}>
                <div className="flex items-center gap-[9px] mb-[7px]">
                  <Avatar name={b.seller ? b.seller.name : '?'} size={28} />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold">{b.seller ? b.seller.name : '—'}</div>
                    <div className="meta">{b.count} proyecto{b.count !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-[14px]">{fmtMoney(b.total)}</div>
                    {b.pending > 0 && <div className="meta text-warn">{fmtMoney(b.pending)} pend.</div>}
                  </div>
                </div>
                <div className="bar"><i className="bg-ok" style={{ width: `${b.total ? ((b.total - b.pending) / b.total) * 100 : 0}%` }}></i></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
