// ============================================================
//  PAGOS INTERNOS — logística cotiza y solicita; el admin aprueba
//  o rechaza; tras la aprobación se agenda y se marca pagado.
//  Flujo: Pendiente → (admin) Aprobado | Rechazado
//         → (logística) Programado → Pagado
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDateShort, fmtDate, TODAY_ISO, payCutoff, isAdminRole, isDireccion } from '../../core/data'
import { signedDocUrl } from '../../core/api'
import { Modal, Field, Input, TextArea, Select, Seg, MoneyInput, Badge, Empty, KPI, Confirm, FileField, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { InternalPayment, InternalPaymentInput, InternalPaymentCategory, InternalPaymentStatus } from '../../core/types'

const CATEGORIES: InternalPaymentCategory[] = ['Flete', 'Instalación', 'Viáticos', 'Maniobras', 'Material', 'Otro']
const STATUS_COLOR: Record<InternalPaymentStatus, string> = {
  Pendiente: 'var(--warn)', Aprobado: 'var(--st-5)', Rechazado: 'var(--danger)',
  Programado: 'var(--st-6)', Pagado: 'var(--ok)', Cancelado: 'var(--tx-3)',
  'En movimientos': 'var(--st-2)',
}
const statusBadge = (s: InternalPaymentStatus) => <Badge color={STATUS_COLOR[s]}>{s}</Badge>
const facturaBadge = (sinFactura?: boolean) => sinFactura
  ? <Badge color="var(--st-2)">Sin factura</Badge>
  : <Badge color="var(--tx-2)">Con factura</Badge>

/** Texto amigable del tiempo que falta para el corte. */
const leftText = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600000))
  const d = Math.floor(h / 24)
  return d > 0 ? `${d} día${d === 1 ? '' : 's'} y ${h % 24} h` : `${h} h`
}

/* ---- Formulario de solicitud (crear / editar mientras está Pendiente) ---- */
type FormState = {
  id?: string
  concept: string
  category: InternalPaymentCategory
  projectId: string
  supplierId: string
  amount: number | string        // total a pagar (lo captura solo el SIN factura)
  subtotal: number | string      // sin IVA (lo captura solo el CON factura)
  origen: string
  destino: string
  scheduledDate: string
  notes: string
  file: string
  filePath?: string
  sinFactura: boolean
}
/** IVA que se aplica a los pagos internos CON factura. */
const IVA_PI = 0.16
const round2 = (n: number) => Math.round(n * 100) / 100
function InternalPaymentForm({ payment, onClose }: { payment?: InternalPayment; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [p, setP] = React.useState<FormState>(() => payment ? {
    ...payment, projectId: payment.projectId ?? '', supplierId: payment.supplierId ?? '', scheduledDate: payment.scheduledDate ?? '',
    origen: payment.origen ?? '', destino: payment.destino ?? '', sinFactura: !!payment.sinFactura,
    // Pago viejo CON factura sin subtotal capturado: se deriva del total.
    subtotal: payment.subtotal ?? (payment.sinFactura ? '' : round2((payment.amount || 0) / (1 + IVA_PI))),
  } : {
    concept: '', category: 'Flete', projectId: '', supplierId: '', amount: '', subtotal: '', origen: '', destino: '', scheduledDate: '', notes: '', file: '', sinFactura: false,
  })
  const cutoff = payCutoff()
  // CON factura: se captura el subtotal y de ahí salen el IVA y el total a pagar.
  // SIN factura: se captura directo el total (no hay IVA).
  const subNum = +p.subtotal || 0
  const ivaMonto = p.sinFactura ? 0 : round2(subNum * IVA_PI)
  const totalPagar = p.sinFactura ? (+p.amount || 0) : round2(subNum * (1 + IVA_PI))
  const set = (k: keyof FormState, v: unknown) => setP(s => ({ ...s, [k]: v }))
  // Las ubicaciones de origen/destino solo aplican a servicios de Flete e Instalación.
  const usaUbicacion = p.category === 'Flete' || p.category === 'Instalación'
  // Resumen del servicio (Flete/Instalación) del proyecto: monto ASIGNADO en la vista de
  // Asignación, lo ya PAGADO (pagos internos liquidados de ese servicio) y el SALDO.
  const proj = p.projectId ? state.projects.find(x => x.id === p.projectId) : undefined
  const asignado = !proj ? 0 : (p.category === 'Flete' ? (proj.freightCost || 0) : (proj.installCost || 0))
  const pagadoServicio = state.internalPayments
    .filter(ip => ip.id !== p.id && ip.projectId === p.projectId && ip.category === p.category && ip.status === 'Pagado')
    .reduce((a, ip) => a + ip.amount, 0)
  const saldoServicio = asignado - pagadoServicio
  const valid = !!p.concept && totalPagar > 0
  const { requestClose, guard } = useUnsavedGuard(p, onClose)

  const save = () => {
    const payload: InternalPaymentInput = {
      ...payment,                         // conserva status/approvedBy/etc. al editar
      concept: p.concept,
      category: p.category,
      projectId: p.projectId || undefined,
      supplierId: p.supplierId || undefined,
      // `amount` SIEMPRE es el total a pagar. Con factura sale de subtotal × 1.16;
      // sin factura es el total que se capturó directo.
      amount: totalPagar,
      subtotal: p.sinFactura ? undefined : subNum,
      // Origen/destino solo se guardan para Flete e Instalación.
      origen: usaUbicacion ? (p.origen || undefined) : undefined,
      destino: usaUbicacion ? (p.destino || undefined) : undefined,
      scheduledDate: p.scheduledDate || undefined,
      notes: p.notes,
      file: p.file,
      filePath: p.filePath,
      sinFactura: p.sinFactura,
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
      {usaUbicacion && proj && (
        <div className="bg-bg-1 border border-line rounded-[8px] p-3 mb-3.5 grid grid-cols-3 gap-2 text-center">
          <div><div className="label-k">Monto asignado</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtMoney(asignado)}</div></div>
          <div><div className="label-k">Pagado</div><div className="font-display font-bold text-[15px] mt-0.5 text-ok">{fmtMoney(pagadoServicio)}</div></div>
          <div><div className="label-k">Saldo</div><div className="font-display font-bold text-[15px] mt-0.5" style={{ color: saldoServicio > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(saldoServicio)}</div></div>
        </div>
      )}
      {usaUbicacion && proj && asignado === 0 && (
        <div className="text-[11.5px] mb-3 -mt-1" style={{ color: 'var(--warn)' }}>Este proyecto aún no tiene costo de {p.category.toLowerCase()} asignado en "Asignación de servicios".</div>
      )}
      {usaUbicacion && proj && asignado > 0 && +p.amount > 0 && (
        <div className="text-[11.5px] text-tx-2 mb-3 -mt-1">
          Este pago aún no cuenta como "Pagado" (entra como Pendiente). Al liquidarlo, el saldo quedaría en <b>{fmtMoney(saldoServicio - (+p.amount || 0))}</b>.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Con factura = flujo normal (programar y pagar aquí).
            Sin factura = al aprobarse entra a la lista de movimientos del jueves. */}
        <Field label="¿El pago lleva factura?" span={2}>
          <Seg value={p.sinFactura ? 'sin' : 'con'} onChange={(v) => set('sinFactura', v === 'sin')}
            options={[{ value: 'con', label: 'Con factura' }, { value: 'sin', label: 'Sin factura' }]} />
        </Field>
        {p.sinFactura && (
          <div className="col-span-2 flex items-start gap-3 p-3 rounded-[8px] border -mt-1"
            style={{ borderColor: 'var(--st-2)', background: 'color-mix(in srgb, var(--st-2) 10%, transparent)' }}>
            <Icon name="box" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--st-2)' }} />
            <div className="text-[12.5px] text-tx-2 leading-snug">
              Al aprobarse, este pago <strong>no se programa aquí</strong>: entra como movimiento a la{' '}
              <strong>lista del jueves {fmtDate(cutoff.thursday)}</strong>, que autoriza Dirección.
              <div className="text-tx-3 mt-0.5">Corte: jueves {fmtDate(cutoff.thursday)} a las 2:00 pm · faltan {leftText(cutoff.msLeft)}</div>
            </div>
          </div>
        )}
        <Field label="Concepto" span={2}><Input value={p.concept} onChange={e => set('concept', e.target.value)} placeholder="Ej. Flete Monterrey, viáticos cuadrilla…" /></Field>
        <Field label="Categoría">
          <Select value={p.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</Select>
        </Field>
        {/* CON factura: se captura el SUBTOTAL y la app calcula IVA y total a pagar.
            SIN factura: no hay IVA, se captura directo el total. */}
        {p.sinFactura ? (
          <Field label="Monto total (MXN)"><MoneyInput value={p.amount} onChange={v => set('amount', v)} placeholder="0" /></Field>
        ) : (
          <Field label="Subtotal (sin IVA)"><MoneyInput value={p.subtotal} onChange={v => set('subtotal', v)} placeholder="0" /></Field>
        )}
        {!p.sinFactura && (
          <div className="col-span-2 bg-bg-1 border border-line rounded-[8px] p-3 -mt-1 flex items-center justify-end gap-6 text-[12.5px]">
            <div className="text-right"><div className="label-k">Subtotal</div><div className="mono mt-0.5">{fmtMoney2(subNum)}</div></div>
            <div className="text-right"><div className="label-k">IVA 16%</div><div className="mono mt-0.5">{fmtMoney2(ivaMonto)}</div></div>
            <div className="text-right"><div className="label-k">Total a pagar</div><div className="mono mt-0.5 font-bold text-[15px]">{fmtMoney2(totalPagar)}</div></div>
          </div>
        )}
        {usaUbicacion && <>
          <Field label="Ubicación de origen"><Input value={p.origen} onChange={e => set('origen', e.target.value)} placeholder="Desde dónde sale" /></Field>
          <Field label="Ubicación de destino"><Input value={p.destino} onChange={e => set('destino', e.target.value)} placeholder="Hacia dónde va" /></Field>
        </>}
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
  const readOnly = isDireccion(state.currentUser?.role)   // dirección: ver sin acciones (solo descargar)
  const [reject, setReject] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [confirmDel, setConfirmDel] = React.useState(false)
  const [confirmRevert, setConfirmRevert] = React.useState(false)
  const [confirmRevertMov, setConfirmRevertMov] = React.useState(false)

  // Revierte un pago "En movimientos" a Pendiente: borra su movimiento de la lista y
  // limpia el enlace, para poder re-aprobarlo o cambiarlo a "con factura".
  const revertFromMovimientos = () => {
    if (payment.movementId) dispatch({ type: 'DELETE_MOVEMENT', id: payment.movementId })
    dispatch({ type: 'SAVE_INTERNAL_PAYMENT', payment: { ...payment, status: 'Pendiente', movementId: undefined, movementListId: undefined, approvedBy: undefined, decidedAt: undefined } })
    setConfirmRevertMov(false)
  }

  const proj = payment.projectId ? state.projects.find(x => x.id === payment.projectId) : undefined
  const supplier = payment.supplierId ? sel.supplier(state, payment.supplierId) : undefined
  const requester = sel.userName(state, payment.requestedBy)
  const approver = payment.approvedBy ? sel.userName(state, payment.approvedBy) : undefined

  // Cambia estatus conservando el resto (agendar, pagar, cancelar).
  const setStatus = (status: InternalPaymentStatus, extra: Partial<InternalPayment> = {}) => {
    dispatch({ type: 'SAVE_INTERNAL_PAYMENT', payment: { ...payment, status, ...extra } })
  }

  // Comprobante de pago: requisito para liberar (marcar "Pagado"); se puede descargar
  // para enviarlo manualmente al proveedor por WhatsApp.
  const hasComprobante = !!payment.comprobantePath
  const setComprobante = (v: { name: string; path: string }) =>
    dispatch({ type: 'SAVE_INTERNAL_PAYMENT', payment: { ...payment, comprobante: v.name || undefined, comprobantePath: v.path || undefined } })
  const downloadComprobante = async () => {
    if (!payment.comprobantePath) return
    try { window.open(await signedDocUrl(payment.comprobantePath, 3600, payment.comprobante || true), '_blank') }
    catch { alert('No se pudo generar el enlace de descarga.') }
  }
  // WhatsApp del proveedor (abre el chat; el comprobante se adjunta manualmente).
  const waDigits = (supplier?.phone || '').replace(/\D/g, '')
  const waUrl = waDigits ? `https://wa.me/${waDigits.length === 10 ? '52' + waDigits : waDigits}` : null

  const editable = payment.status === 'Pendiente' && !readOnly
  const showComprobante = payment.status === 'Aprobado' || payment.status === 'Programado' || payment.status === 'Pagado'

  return (
    <Modal width={540} icon="money" title={payment.concept} sub={`${payment.category} · solicitó ${requester}`} onClose={onClose}
      footer={<>
        {editable && <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={14} /> Editar</button>}
        {editable && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar</button>}
        <div className="flex-1"></div>
        {/* Acciones del ADMIN: aprobar / rechazar mientras está pendiente */}
        {!readOnly && isAdmin && payment.status === 'Pendiente' && (<>
          <button className="btn btn-ghost" onClick={() => setReject(true)}><Icon name="close" size={14} /> Rechazar</button>
          <button className="btn btn-primary"
            title={payment.sinFactura ? `Sin factura: al aprobar entra a la lista de movimientos del jueves ${fmtDate(payCutoff().thursday)}` : undefined}
            onClick={() => dispatch({ type: 'DECIDE_INTERNAL_PAYMENT', id: payment.id, approve: true })}>
            <Icon name="check" size={15} /> {payment.sinFactura ? 'Aprobar y mandar a movimientos' : 'Aprobar'}
          </button>
        </>)}
        {/* SIN FACTURA ya enviado a movimientos: el admin puede revertirlo a Pendiente
            (borra su movimiento de la lista) para corregirlo o re-aprobarlo. */}
        {!readOnly && isAdmin && payment.status === 'En movimientos' && (
          <button className="btn btn-ghost" onClick={() => setConfirmRevertMov(true)}><Icon name="alert" size={14} /> Revertir a pendiente</button>
        )}
        {/* Acciones de LOGÍSTICA tras la aprobación */}
        {!readOnly && payment.status === 'Aprobado' && (
          <button className="btn btn-primary" onClick={() => setStatus('Programado', { scheduledDate: payment.scheduledDate || TODAY_ISO })}><Icon name="calendar" size={15} /> Programar pago</button>
        )}
        {!readOnly && (payment.status === 'Aprobado' || payment.status === 'Programado') && (
          <button className={'btn btn-primary' + (!hasComprobante ? ' opacity-50' : '')} disabled={!hasComprobante}
            title={!hasComprobante ? 'Sube el comprobante de pago para liberar' : undefined}
            onClick={() => setStatus('Pagado')}><Icon name="check" size={15} /> Marcar pagado</button>
        )}
        {!readOnly && (payment.status === 'Aprobado' || payment.status === 'Programado') && (
          <button className="btn btn-ghost" onClick={() => setStatus('Cancelado')}>Cancelar pago</button>
        )}
        {/* Corrección: solo el admin puede revertir un pago ya liquidado. Al volver a
            "Pendiente" deja de descontar utilidad y se habilita Editar/Eliminar. */}
        {!readOnly && isAdmin && payment.status === 'Pagado' && (
          <button className="btn btn-ghost" onClick={() => setConfirmRevert(true)}><Icon name="alert" size={14} /> Revertir pago</button>
        )}
      </>}>
      <div className="bg-bg-1 border border-line rounded-[8px] p-3.5 mb-3.5 flex items-center justify-between">
        <div>
          <div className="label-k">{payment.sinFactura ? 'Monto (sin factura)' : 'Total a pagar (con IVA)'}</div>
          <div className="font-display font-extrabold text-[24px] mt-0.5">{fmtMoney2(payment.amount)}</div>
          {/* Con factura: se muestra de dónde sale el total (lo que resta de la utilidad es el subtotal). */}
          {!payment.sinFactura && (() => {
            const sub = payment.subtotal != null ? payment.subtotal : payment.amount / (1 + IVA_PI)
            return <div className="meta mt-1">Subtotal {fmtMoney2(sub)} + IVA {fmtMoney2(payment.amount - sub)}</div>
          })()}
        </div>
        <div className="text-right flex flex-col items-end gap-1.5">
          {statusBadge(payment.status)}
          {facturaBadge(payment.sinFactura)}
        </div>
      </div>

      {/* SIN FACTURA aprobado: ya vive como movimiento en la lista semanal */}
      {payment.status === 'En movimientos' && (() => {
        const list = payment.movementListId ? state.movementLists.find(l => l.id === payment.movementListId) : undefined
        return (
          <div className="flex items-start gap-3 mb-3.5 p-3 rounded-[8px] border"
            style={{ borderColor: 'var(--st-2)', background: 'color-mix(in srgb, var(--st-2) 10%, transparent)' }}>
            <Icon name="box" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--st-2)' }} />
            <div className="text-[12.5px] text-tx-2 leading-snug">
              Este pago es <strong>sin factura</strong>: ya entró como movimiento a la lista{' '}
              <strong>{list ? list.name : '—'}</strong>{list ? ` (${fmtDate(list.date)})` : ''}.
              <div className="text-tx-3 mt-0.5">Aquí ya no se programa ni se paga. Se liquida cuando Dirección autoriza la lista y se sube su comprobante.</div>
            </div>
          </div>
        )
      })()}

      <div className="grid grid-cols-2 gap-x-5 gap-y-0 text-[13px]">
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Categoría</span><span>{payment.category}</span></div>
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Solicitó</span><span>{requester}</span></div>
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Proyecto</span><span className="mono">{proj ? proj.code : '—'}</span></div>
        <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Proveedor</span><span className="truncate">{supplier ? supplier.name : '—'}</span></div>
        {payment.origen && <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Origen</span><span className="truncate text-right">{payment.origen}</span></div>}
        {payment.destino && <div className="flex justify-between gap-3 py-[9px] border-b border-line-soft"><span className="label-k">Destino</span><span className="truncate text-right">{payment.destino}</span></div>}
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

      {showComprobante && (
        <div className="mt-3.5">
          <div className="label-k mb-1.5">
            Comprobante de pago
            {!hasComprobante && payment.status !== 'Pagado' && <span className="text-tx-3 font-normal"> · requerido para marcar pagado</span>}
          </div>
          {!readOnly && <FileField label="" value={payment.comprobante || ''} path={payment.comprobantePath}
            folder={`internal_payments/${payment.id}`} onChange={setComprobante} accept=".pdf,.jpg,.jpeg,.png" />}
          {hasComprobante && (
            <div className="flex gap-2 mt-2">
              <button className="btn btn-sm btn-ghost" onClick={downloadComprobante}><Icon name="download" size={13} /> Descargar</button>
              {waUrl
                ? <a className="btn btn-sm btn-ghost" href={waUrl} target="_blank" rel="noreferrer" title="Abre el chat del proveedor para enviarle el comprobante"><Icon name="phone" size={13} /> WhatsApp proveedor</a>
                : <span className="meta self-center">Asigna un proveedor con teléfono para abrir WhatsApp</span>}
            </div>
          )}
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
      {confirmRevert && <Confirm title="Revertir pago" message={`¿Revertir "${payment.concept}" a Pendiente? Dejará de descontar utilidad del proyecto y podrás editarlo o eliminarlo.`} onConfirm={() => { setStatus('Pendiente'); setConfirmRevert(false) }} onClose={() => setConfirmRevert(false)} />}
      {confirmRevertMov && <Confirm title="Revertir a pendiente" message={`¿Sacar "${payment.concept}" de la lista de movimientos y regresarlo a Pendiente? Se eliminará su movimiento de la lista y podrás re-aprobarlo o cambiarlo a "con factura".`} onConfirm={revertFromMovimientos} onClose={() => setConfirmRevertMov(false)} />}
    </Modal>
  )
}

export function InternalPaymentsPage({ openId, onConsumed }: { openId?: string | null; onConsumed?: () => void } = {}) {
  const { state } = useStore()
  const readOnly = isDireccion(state.currentUser?.role)   // dirección: solo lectura
  const [detail, setDetail] = React.useState<InternalPayment | null>(null)
  const [form, setForm] = React.useState<InternalPayment | {} | null>(null)
  const [fStatus, setFStatus] = React.useState('')

  // Abrir un pago concreto al llegar desde una notificación ("Ver pago").
  React.useEffect(() => {
    if (!openId) return
    const p = state.internalPayments.find(x => x.id === openId)
    if (p) setDetail(p)
    onConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  const rows = state.internalPayments
    .filter(p => !fStatus || p.status === fStatus)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  const pendientes = state.internalPayments.filter(p => p.status === 'Pendiente')
  const aprobadoPorPagar = state.internalPayments.filter(p => p.status === 'Aprobado' || p.status === 'Programado').reduce((a, p) => a + p.amount, 0)
  const pagado = state.internalPayments.filter(p => p.status === 'Pagado').reduce((a, p) => a + p.amount, 0)
  const cutoff = payCutoff()

  const editFromDetail = () => { if (detail) { setForm(detail); setDetail(null) } }

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Pagos internos</h2><span className="sub">Solicitudes con aprobación del administrador</span></div>
        {!readOnly && <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Solicitar pago</button>}
      </div>

      {/* Corte semanal de los pagos SIN FACTURA (van a la lista de movimientos del jueves) */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-[8px] border"
        style={{ borderColor: 'var(--st-2)', background: 'color-mix(in srgb, var(--st-2) 8%, transparent)' }}>
        <Icon name="box" size={18} className="flex-none" style={{ color: 'var(--st-2)' }} />
        <div className="text-[12.5px] text-tx-1 flex-1">
          Pagos <strong>sin factura</strong>: los que apruebes entran a la lista de movimientos del{' '}
          <strong>jueves {fmtDate(cutoff.thursday)}</strong>.
          <span className="text-tx-3"> · Corte: jueves 2:00 pm (faltan {leftText(cutoff.msLeft)})</span>
        </div>
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
            <thead><tr><th>Concepto</th><th>Categoría</th><th>Factura</th><th>Proyecto</th><th>Solicitó</th><th className="num">Monto</th><th>Fecha pago</th><th>Estatus</th></tr></thead>
            <tbody>
              {rows.map(p => {
                const proj = p.projectId ? state.projects.find(x => x.id === p.projectId) : undefined
                return (
                <tr key={p.id} onClick={() => setDetail(p)}>
                  <td className="text-[12.5px] font-semibold text-tx-1">{p.concept}</td>
                  <td className="text-[12px]">{p.category}</td>
                  <td>{facturaBadge(p.sinFactura)}</td>
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
