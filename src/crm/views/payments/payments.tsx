// ============================================================
//  PAGOS — réplica de la hoja "Pagos" del Excel (abonos por OC)
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDateShort } from '../../core/data'
import { Modal, Field, Input, Select, PaymentBadge, Empty, KPI } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Payment, PaymentInput, PaymentStatus } from '../../core/types'

const PAY_STATES: PaymentStatus[] = ['Pagado', 'Programado', 'Cancelado']

/* ---- Formulario de abono (con selector de OC) ---- */
type PaymentFormState = {
  id?: string
  orderId: string
  n: number | string
  date: string
  amount: number | string
  method: string
  status: PaymentStatus
  comments: string
}
function PaymentForm({ payment, onClose }: { payment?: Payment; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [p, setP] = React.useState<PaymentFormState>(() => payment ? { ...payment } : {
    orderId: '', n: 1, date: '2026-06-02', amount: '', method: '', status: 'Programado', comments: '',
  })
  const set = (k: keyof PaymentFormState, v: unknown) => setP(s => ({ ...s, [k]: v }))
  // sugiere el siguiente No. de abono al elegir OC
  const onPickOrder = (oid: string) => {
    const nextN = Math.max(0, ...sel.paymentsForOrder(state, oid).map(x => x.n)) + 1
    setP(s => ({ ...s, orderId: oid, n: payment ? s.n : nextN }))
  }
  const valid = p.orderId && p.date && p.amount
  const save = () => {
    const pay: PaymentInput = { ...p, n: +p.n || 1, amount: +p.amount || 0 }
    dispatch({ type: 'SAVE_PAYMENT', payment: pay })
    onClose()
  }
  return (
    <Modal width={520} icon={payment ? 'edit' : 'plus'} title={payment ? 'Editar abono' : 'Nuevo abono'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-danger" style={{ visibility: payment ? 'visible' : 'hidden' }} onClick={() => { if (payment) dispatch({ type: 'DELETE_PAYMENT', id: payment.id }); onClose() }}><Icon name="trash" size={14} /> Eliminar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Orden de compra (OC)" span={2}>
          <Select value={p.orderId} onChange={e => onPickOrder(e.target.value)}>
            <option value="">Selecciona…</option>
            {state.orders.map(o => { const s = sel.supplier(state, o.supplierId); return <option key={o.id} value={o.id}>{o.number} · {s ? s.name : ''}</option> })}
          </Select>
        </Field>
        <Field label="No. Abono"><Input type="number" value={p.n} onChange={e => set('n', e.target.value)} /></Field>
        <Field label="Fecha de pago"><Input type="date" value={p.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Importe (MXN)"><Input type="number" value={p.amount} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Estado">
          <Select value={p.status} onChange={e => set('status', e.target.value)}>
            {PAY_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Método / Ref." span={2}><Input value={p.method} onChange={e => set('method', e.target.value)} placeholder="Transferencia, cheque, folio…" /></Field>
        <Field label="Comentarios" span={2}><Input value={p.comments} onChange={e => set('comments', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

export function PaymentsPage() {
  const { state } = useStore()
  const [form, setForm] = React.useState<Payment | {} | null>(null)
  const [fStatus, setFStatus] = React.useState('')

  const rows = state.payments
    .map(p => {
      const order = sel.order(state, p.orderId)
      const supplier = order ? sel.supplier(state, order.supplierId) : undefined
      const project = order && order.projectId ? state.projects.find(x => x.id === order.projectId) : undefined
      return { p, order, supplier, project }
    })
    .filter(r => r.order)
    .filter(r => !fStatus || r.p.status === fStatus)
    .sort((a, b) => (a.p.date < b.p.date ? 1 : -1))

  const totalProg = state.payments.filter(p => p.status === 'Programado').reduce((a, p) => a + p.amount, 0)
  const totalPaid = state.payments.filter(p => p.status === 'Pagado').reduce((a, p) => a + p.amount, 0)

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Pagos</h2><span className="sub">Abonos a órdenes de compra</span></div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nuevo abono</button>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <KPI label="Total pagado" value={totalPaid} format={fmtMoney} icon="money" accent />
        <KPI label="Programado por pagar" value={totalProg} format={fmtMoney} icon="calendar" foot="Pendiente de salir" footTrend="dn" />
        <KPI label="Abonos registrados" value={state.payments.length} icon="orders" />
      </div>

      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        <span className="label-k">Filtrar:</span>
        <div className="seg">
          <button className={!fStatus ? 'on' : ''} onClick={() => setFStatus('')}>Todos</button>
          {PAY_STATES.map(s => <button key={s} className={fStatus === s ? 'on' : ''} onClick={() => setFStatus(s)}>{s}</button>)}
        </div>
        <span className="meta">{rows.length} de {state.payments.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>OC</th><th>Proyecto</th><th className="num">No.</th><th>Fecha</th><th className="num">Importe</th><th>Método / Ref.</th><th>Estado</th><th>Proveedor</th><th>Comentarios</th></tr></thead>
            <tbody>
              {rows.map(({ p, order, supplier, project }) => (
                <tr key={p.id} onClick={() => setForm(p)}>
                  <td><span className="mono text-acc font-semibold">{order!.number}</span></td>
                  <td className="text-[12px]">{project ? <><span className="mono text-tx-1">{project.code}</span><div className="meta">{sel.clientName(state, project.client)}</div></> : <span className="text-tx-3">—</span>}</td>
                  <td className="num mono">{p.n}</td>
                  <td className="num text-tx-1 text-[12px]">{fmtDateShort(p.date)}</td>
                  <td className="num font-semibold">{fmtMoney2(p.amount)}</td>
                  <td className="text-tx-1 text-[12px]">{p.method || '—'}</td>
                  <td><PaymentBadge status={p.status} /></td>
                  <td className="text-[12.5px]">{supplier ? supplier.name : '—'}</td>
                  <td className="text-tx-2 text-[12px]">{p.comments || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="money">Sin abonos registrados</Empty>}
      </div>

      {form && <PaymentForm payment={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
    </div>
  )
}
