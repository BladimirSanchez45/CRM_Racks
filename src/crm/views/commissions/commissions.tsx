// ============================================================
//  COMMISSIONS — finalized projects this month, seller, paid/pending
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, splitTotal, MESES_L, TODAY_ISO, isDireccion, canEditCommissionAmount } from '../../core/data'
import { Badge, Avatar, Empty, Seg, Select, Modal, Field, Input } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Commission, Project } from '../../core/types'

// Quien cobra puede ser un vendedor del catálogo o un usuario (override / no-ventas).
type EarnerLike = { id: string; name: string; initials?: string }
type CommissionRow = Commission & { project?: Project; earner?: EarnerLike; isOverride: boolean }
type Group = { key: string; earner?: EarnerLike; items: CommissionRow[]; total: number; pending: number }

export function CommissionsPage() {
  const { state, dispatch } = useStore()
  const readOnly = isDireccion(state.currentUser?.role)   // dirección: ver sin marcar pagos
  // Dirección y Admin SÍ pueden ajustar el importe de las comisiones pendientes.
  const canEdit = canEditCommissionAmount(state.currentUser?.role)
  const [view, setView] = React.useState('all') // all | pending | paid
  const [editing, setEditing] = React.useState<string | null>(null)   // key (persona) en edición
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const [month, setMonth] = React.useState(TODAY_ISO.slice(0, 7)) // 'YYYY-MM' o 'all'
  const toggleOpen = (k: string) => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const rows: CommissionRow[] = state.commissions.map(c => {
    const project = state.projects.find(x => x.id === c.projectId)
    // Resuelve el beneficiario en vendedores y, si no, en usuarios (override / no-ventas).
    const earner: EarnerLike | undefined = sel.seller(state, c.seller) || state.users.find(u => u.id === c.seller)
    // Es override cuando el beneficiario NO es el vendedor del proyecto (gana sobre la venta ajena).
    const isOverride = !!(project && c.seller !== project.seller)
    return { ...c, project, earner, isOverride }
  }).filter(r => r.project)

  // Mes = mes en que CERRÓ el proyecto (closedOn); si falta, el mes de la comisión.
  const monthOf = (r: CommissionRow) => (r.project?.closedOn || '').slice(0, 7) || r.month || ''
  const monthLabel = (ym: string) => `${MESES_L[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(0, 4)}`
  // Meses con comisiones + el mes actual (aunque esté vacío), más recientes primero.
  const monthOptions = Array.from(new Set([TODAY_ISO.slice(0, 7), ...rows.map(monthOf).filter(Boolean)])).sort().reverse()

  // Filtra por MES seleccionado y luego por estado.
  const monthRows = month === 'all' ? rows : rows.filter(r => monthOf(r) === month)
  const filtered = monthRows.filter(r => view === 'all' || r.status === view)
  const totalPending = monthRows.filter(r => r.status === 'pending').reduce((a, r) => a + r.amount, 0)
  const totalPaid = monthRows.filter(r => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
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
        <div className="sec-title m-0"><h2>Comisiones</h2><span className="sub">{month === 'all' ? 'Todos los meses' : monthLabel(month)}</span></div>
        <Select value={month} onChange={e => setMonth(e.target.value)} className="w-auto min-w-[170px]">
          {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          <option value="all">Todos los meses</option>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <div className="kpi kpi-accent"><div className="k-label">{month === 'all' ? 'Total' : 'Total del mes'}</div><div className="k-val text-[26px]">{fmtMoney(total)}</div><div className="k-foot">{new Set(monthRows.map(r => r.projectId)).size} proyectos · {monthRows.length} comisiones</div></div>
        <div className="kpi"><div className="k-label">Pendiente de pago</div><div className="k-val text-[26px] text-warn">{fmtMoney(totalPending)}</div><div className="k-foot">{monthRows.filter(r=>r.status==='pending').length} comisiones</div></div>
        <div className="kpi"><div className="k-label">Pagado</div><div className="k-val text-[26px] text-ok">{fmtMoney(totalPaid)}</div><div className="k-foot">{monthRows.filter(r=>r.status==='paid').length} comisiones</div></div>
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
                        <span className="inline-flex items-center gap-1.5">
                          {/* Ajustar el total a pagar: solo Dirección/Admin y solo si hay pendientes. */}
                          {canEdit && g.pending > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(g.key)}><Icon name="edit" size={13} /> Editar total</button>}
                          {!readOnly && g.pending > 0 && <button className="btn btn-sm btn-primary" onClick={() => markGroupPaid(g)}><Icon name="check" size={13} /> Pagar todo</button>}
                        </span>
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
                              {r.manual && <Badge color="var(--warn)">ajustada</Badge>}
                            </span>
                            <div className="meta mt-0.5">{sel.clientName(state, r.project!.client)} · cerrado {r.project!.closedOn ? fmtDate(r.project!.closedOn) : '—'}</div>
                          </td>
                          <td className="num text-tx-2">{fmtMoney(base)}</td>
                          <td className="num font-semibold">{fmtMoney2(r.amount)}<div className="meta mt-0.5">{pct.toFixed(1)}%</div></td>
                          <td>{r.status === 'paid' ? <Badge color="var(--ok)">Pagada</Badge> : <Badge color="var(--warn)">Pendiente</Badge>}</td>
                          <td>
                            {!readOnly && <button className={'btn btn-sm ' + (r.status === 'paid' ? 'btn-ghost' : 'btn-primary')} onClick={() => dispatch({ type: 'TOGGLE_COMMISSION', id: r.id })}>
                              {r.status === 'paid' ? 'Revertir' : <><Icon name="check" size={13} /> Marcar pagada</>}
                            </button>}
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

      {/* Ajuste manual del total (Dirección / Admin). Se calcula sobre TODAS las
          comisiones del mes de esa persona, sin importar el filtro Todas/Pendientes/Pagadas. */}
      {editing && <EditTotalModal
        earner={monthRows.find(r => (r.seller || 'x') === editing)?.earner}
        rows={monthRows.filter(r => (r.seller || 'x') === editing)}
        onClose={() => setEditing(null)}
      />}
    </div>
  )
}

/** Fija el TOTAL a pagar de una persona: se prorratea entre sus comisiones PENDIENTES
 *  (las ya pagadas no se tocan) y quedan marcadas como "ajustadas" para que el
 *  recálculo automático no las sobrescriba. */
function EditTotalModal({ earner, rows, onClose }: { earner?: EarnerLike; rows: CommissionRow[]; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const pendientes = rows.filter(r => r.status === 'pending')
  const pagado = rows.filter(r => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
  const actual = pendientes.reduce((a, r) => a + r.amount, 0)
  const [val, setVal] = React.useState(String(Math.round(actual)))
  const num = Number(val)
  const valid = val.trim() !== '' && !isNaN(num) && num >= 0
  const nuevo = valid ? Math.round(num) : 0
  const reparto = valid ? splitTotal(pendientes, nuevo) : []
  const ajustadas = pendientes.filter(r => r.manual)

  const save = () => {
    if (!valid || !pendientes.length) return
    dispatch({ type: 'SET_COMMISSIONS_TOTAL', ids: pendientes.map(r => r.id), total: nuevo })
    onClose()
  }
  const restore = () => {
    dispatch({ type: 'CLEAR_COMMISSIONS_MANUAL', ids: ajustadas.map(r => r.id) })
    onClose()
  }

  return (
    <Modal
      icon="commissions"
      title={`Ajustar comisión — ${earner?.name || '—'}`}
      sub={`${pendientes.length} comisión${pendientes.length !== 1 ? 'es' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}${pagado > 0 ? ` · ${fmtMoney(pagado)} ya pagados (no se modifican)` : ''}`}
      onClose={onClose}
      width={560}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        {ajustadas.length > 0 && <button className="btn btn-ghost" onClick={restore}>Volver al cálculo automático</button>}
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <Field label="Total a pagar (comisiones pendientes)">
        <Input value={val} onChange={e => setVal(e.target.value)} inputMode="decimal" autoFocus />
      </Field>
      <div className="meta mt-1">Calculado por fórmula: {fmtMoney(actual)}. El monto que captures se reparte proporcionalmente entre las comisiones pendientes y ya no se recalcula solo.</div>

      <table className="tbl mt-4">
        <thead><tr><th>Proyecto</th><th className="num">Actual</th><th className="num">Nuevo</th></tr></thead>
        <tbody>
          {pendientes.map((r, i) => (
            <tr key={r.id}>
              <td>
                <span className="mono text-acc font-semibold">{r.project!.code}</span>
                <span className="meta"> · {r.seller !== r.project!.seller ? 'override' : 'comisión'}</span>
                <div className="meta mt-0.5">{sel.clientName(state, r.project!.client)}</div>
              </td>
              <td className="num text-tx-2">{fmtMoney2(r.amount)}</td>
              <td className="num font-semibold">{valid ? fmtMoney2(reparto[i]) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}
