// ============================================================
//  ÓRDENES DE COMPRA — réplica de la hoja "Control OC" del Excel
//  (OC → proveedor, con abonos y estatus/saldo calculados)
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, fmtDateShort, daysBetween, MESES } from '../../core/data'
import { Modal, Field, Input, Select, FileField, OCStatus, PaymentBadge, Empty, KPI } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { AppState, Condicion, Order, OrderInput, Payment, PaymentInput, PaymentStatus } from '../../core/types'

const CONDICIONES: Condicion[] = ['Contado', 'Crédito', 'Anticipo', 'Contra entrega', 'Parcialidades']
const PAY_STATES: PaymentStatus[] = ['Pagado', 'Programado', 'Cancelado']
const OC_STATES = ['Pendiente', 'Parcial', 'Liquidada', 'Vencida', 'Cancelada'] as const
const STATUS_COLOR: Record<string, string> = {
  Pendiente: 'var(--tx-2)', Parcial: 'var(--st-5)', Liquidada: 'var(--ok)', Vencida: 'var(--danger)', Cancelada: 'var(--tx-3)',
}

/* ============================================================
   Formulario de abono
   ============================================================ */
type AbonoFormState = {
  id?: string
  orderId: string
  n: number | string
  date: string
  amount: number | string
  method: string
  status: PaymentStatus
  comments: string
}
function AbonoForm({ order, payment, onClose }: { order: Order; payment?: Payment; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const nextN = Math.max(0, ...sel.paymentsForOrder(state, order.id).map(p => p.n)) + 1
  const [a, setA] = React.useState<AbonoFormState>(() => payment ? { ...payment } : {
    orderId: order.id, n: nextN, date: '2026-06-02', amount: '', method: '', status: 'Programado', comments: '',
  })
  const set = (k: keyof AbonoFormState, v: unknown) => setA(s => ({ ...s, [k]: v }))
  const valid = a.date && a.amount
  const save = () => {
    const pay: PaymentInput = { ...a, n: +a.n || 1, amount: +a.amount || 0 }
    dispatch({ type: 'SAVE_PAYMENT', payment: pay })
    onClose()
  }
  return (
    <Modal width={480} icon={payment ? 'edit' : 'plus'} title={payment ? 'Editar abono' : 'Nuevo abono'} sub={order.number} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar abono</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="No. Abono"><Input type="number" value={a.n} onChange={e => set('n', e.target.value)} /></Field>
        <Field label="Fecha de pago"><Input type="date" value={a.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Importe (MXN)"><Input type="number" value={a.amount} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Estado">
          <Select value={a.status} onChange={e => set('status', e.target.value)}>
            {PAY_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Método / Ref." span={2}><Input value={a.method} onChange={e => set('method', e.target.value)} placeholder="Transferencia, cheque, folio…" /></Field>
        <Field label="Comentarios" span={2}><Input value={a.comments} onChange={e => set('comments', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

/* ============================================================
   Detalle de OC (datos calculados + abonos)
   ============================================================ */
function OrderDetail({ order, onClose, onEdit }: { order: Order; onClose: () => void; onEdit: () => void }) {
  const { state, dispatch } = useStore()
  const o = state.orders.find(x => x.id === order.id) || order
  const supplier = sel.supplier(state, o.supplierId)
  const abonos = sel.paymentsForOrder(state, o.id)
  const paid = sel.ocPaid(state, o.id)
  const balance = sel.ocBalance(state, o)
  const pct = sel.ocPct(state, o)
  const next = sel.ocNextPayment(state, o.id)
  const days = next ? daysBetween(next) : null
  const status = sel.ocStatus(state, o)
  const [abono, setAbono] = React.useState<Payment | {} | null>(null)

  return (
    <Modal width={760} onClose={onClose}
      title={<span className="flex items-center gap-3">{o.number} <OCStatus status={status} /></span>}
      sub={`${supplier ? supplier.name : '—'} · ${o.description || ''}`}
      footer={<>
        <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Editar OC</button>
        <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DELETE_ORDER', id: o.id }); onClose() }}><Icon name="trash" size={14} /> Eliminar</button>
        <div className="flex-1"></div>
        <button className="btn btn-primary" onClick={() => setAbono({})}><Icon name="plus" size={15} /> Agregar abono</button>
      </>}>

      {/* resumen monto / pagado / saldo */}
      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <div className="bg-bg-1 border border-line rounded-[8px] p-3.5"><div className="label-k">Monto total</div><div className="font-display font-extrabold text-[22px] mt-1">{fmtMoney(o.amount)}</div></div>
        <div className="bg-bg-1 border border-line rounded-[8px] p-3.5"><div className="label-k">Pagado</div><div className="font-display font-extrabold text-[22px] mt-1 text-ok">{fmtMoney(paid)}</div></div>
        <div className="bg-bg-1 border border-line rounded-[8px] p-3.5"><div className="label-k">Saldo</div><div className="font-display font-extrabold text-[22px] mt-1" style={{ color: balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(balance)}</div></div>
      </div>

      {/* barra de avance */}
      <div className="mb-5">
        <div className="flex justify-between mb-1.5"><span className="label-k">Avance de pago</span><span className="mono text-[12px] text-tx-2">{(pct * 100).toFixed(0)}%</span></div>
        <div className="bar"><i style={{ width: `${Math.min(100, pct * 100)}%`, background: balance <= 0 ? 'var(--ok)' : 'var(--acc)' }}></i></div>
      </div>

      {/* datos generales */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-5 text-[13px]">
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Fecha OC</span><span>{fmtDate(o.date)}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Condiciones</span><span>{o.conditions}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Próximo pago</span><span>{next ? <>{fmtDate(next)} {days != null && <span className="mono text-[11px]" style={{ color: days < 0 ? 'var(--danger)' : days < 7 ? 'var(--warn)' : 'var(--tx-2)' }}>({days < 0 ? `${-days}d vencido` : days + 'd'})</span>}</> : '—'}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Responsable</span><span>{o.responsible || '—'}</span></div>
      </div>

      {/* abonos */}
      <div className="label-k mb-2">Abonos ({abonos.length})</div>
      {abonos.length === 0 ? <Empty icon="money">Sin abonos registrados</Empty> : (
        <div className="border border-line rounded-[8px] overflow-hidden">
          <table className="tbl">
            <thead><tr><th>#</th><th>Fecha</th><th className="num">Importe</th><th>Método / Ref.</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {abonos.map(p => (
                <tr key={p.id} style={{ cursor: 'default' }}>
                  <td className="mono">{p.n}</td>
                  <td className="num text-tx-1 text-[12px]">{fmtDateShort(p.date)}</td>
                  <td className="num">{fmtMoney2(p.amount)}</td>
                  <td className="text-tx-1 text-[12px]">{p.method || '—'}{p.comments ? <div className="meta mt-px">{p.comments}</div> : null}</td>
                  <td><PaymentBadge status={p.status} /></td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setAbono(p)}><Icon name="edit" size={13} /></button>
                      <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => dispatch({ type: 'DELETE_PAYMENT', id: p.id })}><Icon name="trash" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abono && <AbonoForm order={o} payment={'id' in abono ? abono : undefined} onClose={() => setAbono(null)} />}
    </Modal>
  )
}

/* ============================================================
   Formulario de OC
   ============================================================ */
type OcFormState = {
  id?: string
  number: string
  date: string
  supplierId: string
  projectId?: string
  description: string
  conditions: Condicion
  amount: number | string
  responsible: string
  file: string
  cancelled?: boolean
}
function OrderForm({ order, onClose }: { order?: Order; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [o, setO] = React.useState<OcFormState>(() => order ? { ...order } : {
    number: 'OC-' + String(Math.floor(Math.random() * 9000) + 1000), date: '2026-06-02', supplierId: '',
    description: '', conditions: 'Parcialidades', amount: '', responsible: 'Administración', file: '', cancelled: false,
  })
  const set = (k: keyof OcFormState, v: unknown) => setO(s => ({ ...s, [k]: v }))
  const valid = o.number && o.supplierId && o.amount
  const save = () => {
    const ord: OrderInput = { ...o, amount: +o.amount || 0 }
    dispatch({ type: 'SAVE_ORDER', order: ord })
    onClose()
  }
  return (
    <Modal width={640} icon={order ? 'edit' : 'plus'} title={order ? 'Editar orden de compra' : 'Nueva orden de compra'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar OC</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="No. de OC"><Input className="input mono" value={o.number} onChange={e => set('number', e.target.value)} /></Field>
        <Field label="Fecha OC"><Input type="date" value={o.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Proveedor" span={2}>
          <Select value={o.supplierId} onChange={e => set('supplierId', e.target.value)}>
            <option value="">Selecciona…</option>
            {state.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Descripción" span={2}><Input value={o.description} onChange={e => set('description', e.target.value)} placeholder="Concepto de la compra" /></Field>
        <Field label="Condiciones">
          <Select value={o.conditions} onChange={e => set('conditions', e.target.value)}>
            {CONDICIONES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Monto total (MXN)"><Input type="number" value={o.amount} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Responsable"><Input value={o.responsible} onChange={e => set('responsible', e.target.value)} /></Field>
        <Field label="Estado">
          <button type="button" className="btn h-[38px] justify-center w-full" onClick={() => set('cancelled', !o.cancelled)}
            style={{ color: o.cancelled ? 'var(--danger)' : 'var(--tx-2)' }}>
            {o.cancelled ? 'Cancelada' : 'Activa'}
          </button>
        </Field>
        <Field label="Archivo adjunto (OC firmada)" span={2}><FileField label="" value={o.file} onChange={n => set('file', n)} accept=".pdf,.jpg,.png" /></Field>
      </div>
    </Modal>
  )
}

/* ============================================================
   Mini-gráfica: pagos por mes (Programado vs Realizado)
   ============================================================ */
function MonthlyChart({ state }: { state: AppState }) {
  const map = new Map<string, { prog: number; paid: number }>()
  for (const p of state.payments) {
    const k = p.date.slice(0, 7) // YYYY-MM
    if (!map.has(k)) map.set(k, { prog: 0, paid: 0 })
    const m = map.get(k)!
    if (p.status === 'Programado') m.prog += p.amount
    else if (p.status === 'Pagado') m.paid += p.amount
  }
  const rows = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const max = Math.max(1, ...rows.map(([, v]) => Math.max(v.prog, v.paid)))
  if (rows.length === 0) return <Empty icon="money">Sin pagos</Empty>
  return (
    <div>
      <div className="flex items-end gap-2 h-[160px] px-1">
        {rows.map(([k, v]) => {
          const [y, m] = k.split('-')
          return (
            <div key={k} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
              <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 130 }}>
                <div title={`Programado ${fmtMoney(v.prog)}`} className="w-[8px] rounded-t-[2px]" style={{ height: `${(v.prog / max) * 100}%`, background: 'var(--st-2)', minHeight: v.prog ? 2 : 0 }}></div>
                <div title={`Realizado ${fmtMoney(v.paid)}`} className="w-[8px] rounded-t-[2px]" style={{ height: `${(v.paid / max) * 100}%`, background: 'var(--danger)', minHeight: v.paid ? 2 : 0 }}></div>
              </div>
              <div className="mono text-[9px] text-tx-3 whitespace-nowrap">{MESES[+m - 1]}-{y.slice(2)}</div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 justify-center mt-3 text-[11px] text-tx-2">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'var(--st-2)' }}></span> Programado</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'var(--danger)' }}></span> Realizado</span>
      </div>
    </div>
  )
}

/* ============================================================
   Página de Órdenes de Compra
   ============================================================ */
export function OrdersPage() {
  const { state } = useStore()
  const [detail, setDetail] = React.useState<Order | null>(null)
  const [form, setForm] = React.useState<Order | {} | null>(null)
  const [fStatus, setFStatus] = React.useState('')
  const [fSupplier, setFSupplier] = React.useState('')

  const ocStatusOf = (o: Order) => sel.ocStatus(state, o)
  const list = state.orders.filter(o => (!fStatus || ocStatusOf(o) === fStatus) && (!fSupplier || o.supplierId === fSupplier))
  // proveedores que tienen al menos una OC (para el dropdown)
  const supplierOpts = state.suppliers.filter(s => state.orders.some(o => o.supplierId === s.id))

  // KPIs
  const totalOC = state.orders.reduce((a, o) => a + o.amount, 0)
  const totalPaid = state.orders.reduce((a, o) => a + sel.ocPaid(state, o.id), 0)
  const saldo = totalOC - totalPaid
  const vencidas = state.orders.filter(o => ocStatusOf(o) === 'Vencida').length
  const prox7 = state.orders.filter(o => {
    const n = sel.ocNextPayment(state, o.id); if (!n) return false
    const d = daysBetween(n); return d != null && d >= 0 && d <= 7 && sel.ocBalance(state, o) > 0
  }).length
  const statusCounts = OC_STATES.map(s => ({ s, n: state.orders.filter(o => ocStatusOf(o) === s).length }))
  const maxCount = Math.max(1, ...statusCounts.map(c => c.n))

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Órdenes de compra</h2><span className="sub">Control de OC y pagos a proveedores</span></div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nueva OC</button>
      </div>

      {/* KPIs estilo Dashboard del Excel */}
      <div className="grid grid-cols-5 gap-3.5 mb-4">
        <KPI label="Total OC" value={totalOC} format={fmtMoney} icon="orders" accent />
        <KPI label="Total pagado" value={totalPaid} format={fmtMoney} icon="money" />
        <KPI label="Saldo pendiente" value={saldo} format={fmtMoney} icon="alert" footTrend="dn" foot={saldo > 0 ? 'Por pagar' : 'Al corriente'} />
        <KPI label="OC vencidas" value={vencidas} icon="alert" foot={vencidas ? 'Requieren atención' : 'Ninguna'} />
        <KPI label="Pagos próx. 7 días" value={prox7} icon="calendar" foot="OC con vencimiento" />
      </div>

      {/* estatus + pagos por mes */}
      <div className="grid grid-cols-[1fr_1.5fr] gap-4 mb-4">
        <div className="card">
          <div className="card-h"><Icon name="commissions" size={17} className="text-acc" /><span className="ttl">OC por estatus</span></div>
          <div className="card-b flex flex-col gap-2.5">
            {statusCounts.map(({ s, n }) => (
              <div key={s} className="flex items-center gap-3 cursor-pointer" onClick={() => setFStatus(fStatus === s ? '' : s)}>
                <span className="text-[12px] w-[78px] flex-none" style={{ color: STATUS_COLOR[s] }}>{s}</span>
                <div className="flex-1 h-[18px] bg-bg-1 border border-line rounded-[4px] overflow-hidden">
                  <div className="h-full" style={{ width: `${(n / maxCount) * 100}%`, background: STATUS_COLOR[s], opacity: 0.85, minWidth: n ? 3 : 0 }}></div>
                </div>
                <span className="mono text-[13px] font-semibold w-5 text-right" style={{ color: n ? 'var(--tx-0)' : 'var(--tx-3)' }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><Icon name="trendUp" size={17} className="text-st-5" /><span className="ttl">Pagos por mes</span></div>
          <div className="card-b"><MonthlyChart state={state} /></div>
        </div>
      </div>

      {/* filtro */}
      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        <span className="label-k">Filtrar:</span>
        <div className="seg">
          <button className={!fStatus ? 'on' : ''} onClick={() => setFStatus('')}>Todas</button>
          {OC_STATES.map(s => <button key={s} className={fStatus === s ? 'on' : ''} onClick={() => setFStatus(s)}>{s}</button>)}
        </div>
        <Select value={fSupplier} onChange={e => setFSupplier(e.target.value)} className="w-auto min-w-[180px]">
          <option value="">Todos los proveedores</option>
          {supplierOpts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {(fStatus || fSupplier) && <button className="btn btn-ghost btn-sm" onClick={() => { setFStatus(''); setFSupplier('') }}><Icon name="close" size={13} /> Limpiar</button>}
        <span className="meta">{list.length} de {state.orders.length}</span>
      </div>

      {/* tabla Control OC */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr>
              <th>OC</th><th>Fecha</th><th>Proveedor</th><th>Descripción</th><th>Cond.</th>
              <th className="num">Monto</th><th className="num">Pagado</th><th className="num">Saldo</th><th className="num">%</th>
              <th>Próx. pago</th><th className="num">Días</th><th>Estatus</th><th>Resp.</th>
            </tr></thead>
            <tbody>
              {list.map(o => {
                const supplier = sel.supplier(state, o.supplierId)
                const paid = sel.ocPaid(state, o.id)
                const balance = sel.ocBalance(state, o)
                const pct = sel.ocPct(state, o)
                const next = sel.ocNextPayment(state, o.id)
                const days = next ? daysBetween(next) : null
                return (
                  <tr key={o.id} onClick={() => setDetail(o)}>
                    <td><span className="mono text-acc font-semibold">{o.number}</span></td>
                    <td className="num text-tx-2 text-[12px]">{fmtDateShort(o.date)}</td>
                    <td className="text-[12.5px]">{supplier ? supplier.name : '—'}</td>
                    <td className="text-tx-1 text-[12px] max-w-[200px] truncate">{o.description}</td>
                    <td className="text-tx-2 text-[11.5px]">{o.conditions}</td>
                    <td className="num">{fmtMoney(o.amount)}</td>
                    <td className="num text-ok">{fmtMoney(paid)}</td>
                    <td className="num" style={{ color: balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(balance)}</td>
                    <td className="num text-tx-2 text-[12px]">{(pct * 100).toFixed(0)}%</td>
                    <td className="num text-tx-1 text-[12px]">{next ? fmtDateShort(next) : '—'}</td>
                    <td className="num text-[12px]" style={{ color: days == null ? 'var(--tx-3)' : days < 0 ? 'var(--danger)' : days < 7 ? 'var(--warn)' : 'var(--tx-2)' }}>{days == null ? '—' : days < 0 ? `${-days}d` : days + 'd'}</td>
                    <td><OCStatus status={sel.ocStatus(state, o)} /></td>
                    <td className="text-tx-2 text-[12px]">{o.responsible}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <Empty icon="orders">Sin órdenes de compra</Empty>}
      </div>

      {detail && <OrderDetail order={detail} onClose={() => setDetail(null)} onEdit={() => { setForm(state.orders.find(x => x.id === detail.id) || detail); setDetail(null) }} />}
      {form && <OrderForm order={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
    </div>
  )
}
