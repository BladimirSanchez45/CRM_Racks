// ============================================================
//  PAGOS INTERNOS — logística cotiza y solicita; el admin aprueba
//  o rechaza; tras la aprobación se agenda y se marca pagado.
//  Flujo: Pendiente → (admin) Aprobado | Rechazado
//         → (logística) Programado → Pagado
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDateShort, fmtDate, TODAY_ISO, isAdminRole } from '../../core/data'
import { Modal, Field, Input, TextArea, Select, MoneyInput, Badge, Empty, KPI, Confirm, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { InternalPayment, InternalPaymentInput, InternalPaymentCategory, InternalPaymentStatus } from '../../core/types'

const CATEGORIES: InternalPaymentCategory[] = ['Flete', 'Instalación', 'Viáticos', 'Maniobras', 'Material', 'Otro']
const STATUS_COLOR: Record<InternalPaymentStatus, string> = {
  Pendiente: 'var(--warn)', Aprobado: 'var(--st-5)', Rechazado: 'var(--danger)',
  Programado: 'var(--st-6)', Pagado: 'var(--ok)', Cancelado: 'var(--tx-3)',
}
const statusBadge = (s: InternalPaymentStatus) => <Badge color={STATUS_COLOR[s]}>{s}</Badge>

/* ---- Formulario de solicitud (crear / editar mientras está Pendiente) ---- */
type FormState = {
  id?: string
  concept: string
  category: InternalPaymentCategory
  projectId: string
  supplierId: string
  amount: number | string
  scheduledDate: string
  notes: string
  file: string
  filePath?: string
}
function InternalPaymentForm({ payment, onClose }: { payment?: InternalPayment; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [p, setP] = React.useState<FormState>(() => payment ? {
    ...payment, projectId: payment.projectId ?? '', supplierId: payment.supplierId ?? '', scheduledDate: payment.scheduledDate ?? '',
  } : {
    concept: '', category: 'Flete', projectId: '', supplierId: '', amount: '', scheduledDate: '', notes: '', file: '',
  })
  const set = (k: keyof FormState, v: unknown) => setP(s => ({ ...s, [k]: v }))
  const valid = p.concept && p.amount
  const { requestClose, guard } = useUnsavedGuard(p, onClose)

  const save = () => {
    const payload: InternalPaymentInput = {
      ...payment,                         // conserva status/approvedBy/etc. al editar
      concept: p.concept,
      category: p.category,
      projectId: p.projectId || undefined,
      supplierId: p.supplierId || undefined,
      amount: +p.amount || 0,
      scheduledDate: p.scheduledDate || undefined,
      notes: p.notes,
      file: p.file,
      filePath: p.filePath,
      // Un pago nuevo entra como Pendiente (requiere aprobación del admin).
      status: payment ? payment.status : 'Pendiente',
    }
    dispatch({ type: 'SAVE_INTERNAL_PAYMENT', payment: payload })
    onClose()
  }

  return (
    <Modal width={560} icon={payment ? 'edit' : 'plus'} title={payment ? 'Editar solicitud' : 'Nueva solicitud de pago'} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}>
          <Icon name="check" size={15} /> {payment ? 'Guardar' : 'Enviar a aprobación'}
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Concepto" span={2}><Input value={p.concept} onChange={e => set('concept', e.target.value)} placeholder="Ej. Flete Monterrey, viáticos cuadrilla…" /></Field>
        <Field label="Categoría">
          <Select value={p.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</Select>
        </Field>
        <Field label="Monto (MXN)"><MoneyInput value={p.amount} onChange={v => set('amount', v)} placeholder="0" /></Field>
        <Field label="Proyecto (opcional)">
          <Select value={p.projectId} onChange={e => set('projectId', e.target.value)}>
            <option value="">Sin proyecto…</option>
            {state.projects.map(pr => <option key={pr.id} value={pr.id}>{pr.code} · {sel.clientName(state, pr.client)}</option>)}
          </Select>
        </Field>
        <Field label="Proveedor a pagar (opcional)">
          <Select value={p.supplierId} onChange={e => set('supplierId', e.target.value)}>
            <option value="">Sin proveedor…</option>
            {state.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Fecha sugerida de pago" span={2}><Input type="date" value={p.scheduledDate} onChange={e => set('scheduledDate', e.target.value)} /></Field>
        <Field label="Notas / justificación" span={2}><TextArea value={p.notes} onChange={e => set('notes', e.target.value)} placeholder="Detalle del gasto, cotización, etc." /></Field>
      </div>
      {guard}
    </Modal>
  )
}

/* ---- Detalle + acciones según estatus y rol ---- */
function InternalPaymentDetail({ payment, onEdit, onClose }: { payment: InternalPayment; onEdit: () => void; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const isAdmin = isAdminRole(state.currentUser?.role)
  const [reject, setReject] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [confirmDel, setConfirmDel] = React.useState(false)

  const proj = payment.projectId ? state.projects.find(x => x.id === payment.projectId) : undefined
  const supplier = payment.supplierId ? sel.supplier(state, payment.supplierId) : undefined
  const requester = sel.userName(state, payment.requestedBy)
  const approver = payment.approvedBy ? sel.userName(state, payment.approvedBy) : undefined

  // Cambia estatus conservando el resto (agendar, pagar, cancelar).
  const setStatus = (status: InternalPaymentStatus, extra: Partial<InternalPayment> = {}) => {
    dispatch({ type: 'SAVE_INTERNAL_PAYMENT', payment: { ...payment, status, ...extra } })
  }

  const editable = payment.status === 'Pendiente'

  return (
    <Modal width={540} icon="money" title={payment.concept} sub={`${payment.category} · solicitó ${requester}`} onClose={onClose}
      footer={<>
        {editable && <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={14} /> Editar</button>}
        {editable && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar</button>}
        <div className="flex-1"></div>
        {/* Acciones del ADMIN: aprobar / rechazar mientras está pendiente */}
        {isAdmin && payment.status === 'Pendiente' && (<>
          <button className="btn btn-ghost" onClick={() => setReject(true)}><Icon name="close" size={14} /> Rechazar</button>
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'DECIDE_INTERNAL_PAYMENT', id: payment.id, approve: true })}><Icon name="check" size={15} /> Aprobar</button>
        </>)}
        {/* Acciones de LOGÍSTICA tras la aprobación */}
        {payment.status === 'Aprobado' && (
          <button className="btn btn-primary" onClick={() => setStatus('Programado', { scheduledDate: payment.scheduledDate || TODAY_ISO })}><Icon name="calendar" size={15} /> Programar pago</button>
        )}
        {(payment.status === 'Aprobado' || payment.status === 'Programado') && (
          <button className="btn btn-primary" onClick={() => setStatus('Pagado')}><Icon name="check" size={15} /> Marcar pagado</button>
        )}
        {(payment.status === 'Aprobado' || payment.status === 'Programado') && (
          <button className="btn btn-ghost" onClick={() => setStatus('Cancelado')}>Cancelar pago</button>
        )}
      </>}>
      <div className="bg-bg-1 border border-line rounded-[8px] p-3.5 mb-3.5 flex items-center justify-between">
        <div>
          <div className="label-k">Monto</div>
          <div className="font-display font-extrabold text-[24px] mt-0.5">{fmtMoney2(payment.amount)}</div>
        </div>
        <div className="text-right">{statusBadge(payment.status)}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-0 text-[13px]">
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Categoría</span><span>{payment.category}</span></div>
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Solicitó</span><span>{requester}</span></div>
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Proyecto</span><span className="mono">{proj ? proj.code : '—'}</span></div>
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Proveedor</span><span className="truncate">{supplier ? supplier.name : '—'}</span></div>
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Fecha sugerida</span><span>{payment.scheduledDate ? fmtDate(payment.scheduledDate) : '—'}</span></div>
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Aprobó</span><span>{approver || '—'}</span></div>
      </div>

      {payment.status === 'Rechazado' && payment.rejectReason && (
        <div className="mt-3.5 bg-bg-1 py-2.5 px-3.5 text-[12.5px] text-tx-1 leading-normal" style={{ borderLeft: '3px solid var(--danger)' }}>
          <b>Motivo del rechazo:</b> {payment.rejectReason}
        </div>
      )}
      {payment.notes && (
        <div className="mt-3.5">
          <div className="label-k mb-1.5">Notas</div>
          <div className="bg-bg-1 py-2.5 px-3.5 text-[12.5px] text-tx-1 leading-normal" style={{ borderLeft: '3px solid var(--acc)' }}>{payment.notes}</div>
        </div>
      )}

      {/* Modal de rechazo con motivo */}
      {reject && (
        <Modal width={420} icon="alert" title="Rechazar pago interno" onClose={() => setReject(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setReject(false)}>Cancelar</button>
            <div className="flex-1"></div>
            <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DECIDE_INTERNAL_PAYMENT', id: payment.id, approve: false, reason }); setReject(false); onClose() }}>
              <Icon name="close" size={14} /> Rechazar
            </button>
          </>}>
          <Field label="Motivo del rechazo"><TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explica por qué se rechaza…" /></Field>
        </Modal>
      )}
      {confirmDel && <Confirm title="Eliminar solicitud" message={`¿Eliminar el pago "${payment.concept}"?`} onConfirm={() => { dispatch({ type: 'DELETE_INTERNAL_PAYMENT', id: payment.id }); onClose() }} onClose={() => setConfirmDel(false)} />}
    </Modal>
  )
}

export function InternalPaymentsPage() {
  const { state } = useStore()
  const [detail, setDetail] = React.useState<InternalPayment | null>(null)
  const [form, setForm] = React.useState<InternalPayment | {} | null>(null)
  const [fStatus, setFStatus] = React.useState('')

  const rows = state.internalPayments
    .filter(p => !fStatus || p.status === fStatus)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  const pendientes = state.internalPayments.filter(p => p.status === 'Pendiente')
  const aprobadoPorPagar = state.internalPayments.filter(p => p.status === 'Aprobado' || p.status === 'Programado').reduce((a, p) => a + p.amount, 0)
  const pagado = state.internalPayments.filter(p => p.status === 'Pagado').reduce((a, p) => a + p.amount, 0)

  const editFromDetail = () => { if (detail) { setForm(detail); setDetail(null) } }

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Pagos internos</h2><span className="sub">Solicitudes con aprobación del administrador</span></div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Solicitar pago</button>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <KPI label="Por aprobar" value={pendientes.length} icon="alert" foot={pendientes.length > 0 ? fmtMoney(pendientes.reduce((a, p) => a + p.amount, 0)) : undefined} />
        <KPI label="Aprobado por pagar" value={aprobadoPorPagar} format={fmtMoney} icon="calendar" accent />
        <KPI label="Pagado" value={pagado} format={fmtMoney} icon="check" />
      </div>

      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        <span className="label-k">Filtrar:</span>
        <div className="seg">
          <button className={!fStatus ? 'on' : ''} onClick={() => setFStatus('')}>Todos</button>
          {(Object.keys(STATUS_COLOR) as InternalPaymentStatus[]).map(s => <button key={s} className={fStatus === s ? 'on' : ''} onClick={() => setFStatus(s)}>{s}</button>)}
        </div>
        <span className="meta">{rows.length} de {state.internalPayments.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Concepto</th><th>Categoría</th><th>Proyecto</th><th>Solicitó</th><th className="num">Monto</th><th>Fecha pago</th><th>Estatus</th></tr></thead>
            <tbody>
              {rows.map(p => {
                const proj = p.projectId ? state.projects.find(x => x.id === p.projectId) : undefined
                return (
                <tr key={p.id} onClick={() => setDetail(p)}>
                  <td className="text-[12.5px] font-semibold text-tx-1">{p.concept}</td>
                  <td className="text-[12px]">{p.category}</td>
                  <td className="text-[12px]">{proj ? <span className="mono text-acc">{proj.code}</span> : <span className="text-tx-3">—</span>}</td>
                  <td className="text-[12px]">{sel.userName(state, p.requestedBy)}</td>
                  <td className="num font-semibold">{fmtMoney(p.amount)}</td>
                  <td className="num text-[12px]">{p.scheduledDate ? fmtDateShort(p.scheduledDate) : '—'}</td>
                  <td>{statusBadge(p.status)}</td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="money">Sin pagos internos registrados</Empty>}
      </div>

      {detail && <InternalPaymentDetail payment={state.internalPayments.find(x => x.id === detail.id)!} onEdit={editFromDetail} onClose={() => setDetail(null)} />}
      {form && <InternalPaymentForm payment={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
    </div>
  )
}
