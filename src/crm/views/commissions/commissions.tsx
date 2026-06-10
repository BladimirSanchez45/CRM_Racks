// ============================================================
//  COMMISSIONS — finalized projects this month, seller, paid/pending
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, MESES_L } from '../../core/data'
import { Badge, Avatar, Empty, Seg } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Commission, Project } from '../../core/types'

// Quien cobra puede ser un vendedor del catálogo o un usuario (override / no-ventas).
type EarnerLike = { id: string; name: string; initials?: string }
type CommissionRow = Commission & { project?: Project; earner?: EarnerLike; isOverride: boolean }
type Group = { key: string; earner?: EarnerLike; items: CommissionRow[]; total: number; pending: number }

export function CommissionsPage() {
  const { state, dispatch } = useStore()
  const [view, setView] = React.useState('all') // all | pending | paid
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const toggleOpen = (k: string) => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const rows: CommissionRow[] = state.commissions.map(c => {
    const project = state.projects.find(x => x.id === c.projectId)
    // Resuelve el beneficiario en vendedores y, si no, en usuarios (override / no-ventas).
    const earner: EarnerLike | undefined = sel.seller(state, c.seller) || state.users.find(u => u.id === c.seller)
    // Es override cuando el beneficiario NO es el vendedor del proyecto (gana sobre la venta ajena).
    const isOverride = !!(project && c.seller !== project.seller)
    return { ...c, project, earner, isOverride }
  }).filter(r => r.project)

  const filtered = rows.filter(r => view === 'all' || r.status === view)
  const totalPending = rows.filter(r => r.status === 'pending').reduce((a, r) => a + r.amount, 0)
  const totalPaid = rows.filter(r => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
  const total = totalPending + totalPaid

  // Agrupa las comisiones por PERSONA (su comisión propia + sus overrides juntos).
  const groups: Group[] = Object.values(filtered.reduce((acc, r) => {
    const k = r.seller || 'x'
    if (!acc[k]) acc[k] = { key: k, earner: r.earner, items: [], total: 0, pending: 0 }
    acc[k].items.push(r); acc[k].total += r.amount
    if (r.status === 'pending') acc[k].pending += r.amount
    return acc
  }, {} as Record<string, Group>)).sort((a, b) => b.total - a.total)
  // Marca como pagadas todas las pendientes de una persona.
  const markGroupPaid = (g: Group) => g.items.filter(r => r.status === 'pending').forEach(r => dispatch({ type: 'TOGGLE_COMMISSION', id: r.id }))

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Comisiones</h2><span className="sub">{MESES_L[5]} 2026</span></div>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <div className="kpi kpi-accent"><div className="k-label">Total del mes</div><div className="k-val text-[26px]">{fmtMoney(total)}</div><div className="k-foot">{new Set(rows.map(r => r.projectId)).size} proyectos · {rows.length} comisiones</div></div>
        <div className="kpi"><div className="k-label">Pendiente de pago</div><div className="k-val text-[26px] text-warn">{fmtMoney(totalPending)}</div><div className="k-foot">{rows.filter(r=>r.status==='pending').length} comisiones</div></div>
        <div className="kpi"><div className="k-label">Pagado</div><div className="k-val text-[26px] text-ok">{fmtMoney(totalPaid)}</div><div className="k-foot">{rows.filter(r=>r.status==='paid').length} comisiones</div></div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-h">
          <Icon name="commissions" size={17} className="text-acc" />
          <span className="ttl">Comisiones por persona</span>
          <span className="flex-1"></span>
          <Seg value={view} onChange={setView} options={[{ value: 'all', label: 'Todas' }, { value: 'pending', label: 'Pendientes' }, { value: 'paid', label: 'Pagadas' }]} />
        </div>
        {groups.length === 0 ? <Empty icon="commissions">Sin comisiones en esta vista</Empty> : (
          <table className="tbl">
            <thead><tr><th>Persona / Proyecto</th><th className="num">Utilidad</th><th className="num">Comisión</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {groups.map(g => {
                const isOpen = open.has(g.key)
                return (
                  <React.Fragment key={g.key}>
                    {/* fila por persona (total) */}
                    <tr className="cursor-pointer" style={{ background: 'var(--bg-1)' }} onClick={() => toggleOpen(g.key)}>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <Icon name="chevron" size={14} className={'text-tx-3 transition-transform ' + (isOpen ? 'rotate-90' : '')} />
                          <Avatar name={g.earner ? g.earner.name : '?'} size={24} />
                          <span className="font-semibold text-[13px]">{g.earner ? g.earner.name : '—'}</span>
                          <span className="meta">· {g.items.length} comisi{g.items.length !== 1 ? 'ones' : 'ón'}</span>
                        </span>
                      </td>
                      <td className="num"></td>
                      <td className="num font-display font-bold text-[14px]">{fmtMoney(g.total)}</td>
                      <td>{g.pending > 0 ? <Badge color="var(--warn)">{fmtMoney(g.pending)} pend.</Badge> : <Badge color="var(--ok)">Pagado</Badge>}</td>
                      <td onClick={e => e.stopPropagation()}>
                        {g.pending > 0 && <button className="btn btn-sm btn-primary" onClick={() => markGroupPaid(g)}><Icon name="check" size={13} /> Pagar todo</button>}
                      </td>
                    </tr>
                    {/* desglose: comisiones propias + overrides */}
                    {isOpen && g.items.map(r => {
                      const base = sel.projectComisionBase(state, r.project!)   // utilidad sin IVA
                      const pct = base > 0 ? (r.amount / base) * 100 : 0
                      return (
                        <tr key={r.id} className="cursor-default">
                          <td className="pl-12">
                            <span className="inline-flex items-center gap-2">
                              <span className="mono text-acc font-semibold">{r.project!.code}</span>
                              {r.isOverride ? <Badge color="var(--st-5)">override</Badge> : <span className="meta">comisión</span>}
                            </span>
                            <div className="meta mt-0.5">{sel.clientName(state, r.project!.client)} · cerrado {r.project!.closedOn ? fmtDate(r.project!.closedOn) : '—'}</div>
                          </td>
                          <td className="num text-tx-2">{fmtMoney(base)}</td>
                          <td className="num font-semibold">{fmtMoney2(r.amount)}<div className="meta mt-0.5">{pct.toFixed(1)}%</div></td>
                          <td>{r.status === 'paid' ? <Badge color="var(--ok)">Pagada</Badge> : <Badge color="var(--warn)">Pendiente</Badge>}</td>
                          <td>
                            <button className={'btn btn-sm ' + (r.status === 'paid' ? 'btn-ghost' : 'btn-primary')} onClick={() => dispatch({ type: 'TOGGLE_COMMISSION', id: r.id })}>
                              {r.status === 'paid' ? 'Revertir' : <><Icon name="check" size={13} /> Marcar pagada</>}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
