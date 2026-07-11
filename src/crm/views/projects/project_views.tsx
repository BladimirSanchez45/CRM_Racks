// ============================================================
//  PROJECT VIEWS — detail drawer + create/edit form
// ============================================================
import * as React from 'react'
import { useStore, sel, STAGES, stageIndex, fmtMoney, fmtDate, fmtDateShort, daysBetween, addDays, docNo, docCount, DOC_LABELS, type DocKey, stageBlockedReason, TODAY_ISO, uid, canEditProject, isAdminRole, isDireccion, isIngenieria } from '../../core/data'
import { Modal, useUnsavedGuard, Field, Input, TextArea, Select, Combobox, FileField, MoneyInput, StageBadge, DocChip, PayBadge, Badge, Avatar, OCStatus, Empty } from '../../core/ui'
import { Icon } from '../../core/icons'
import { printRemision, remisionStatusBadge } from '../remisiones/remisiones'
import { ClientForm } from '../clients/clients'
import type { AppState, ClientPayment, ClientPaymentInput, ClientPaymentStatus, InternalPayment, PayStatus, Project, ProjectDocs, StageId } from '../../core/types'

/* ---- badge de estado de cobro + formulario de cobro del cliente ---- */
const COBRO_COLOR: Record<ClientPaymentStatus, string> = { Cobrado: 'var(--ok)', Programado: 'var(--warn)', Cancelado: 'var(--tx-3)' }
const cobroBadge = (s: ClientPaymentStatus) => <Badge color={COBRO_COLOR[s]}>{s}</Badge>

type CobroFormState = { id?: string; projectId: string; n: number | string; date: string; amount: number | string; concept: string; method: string; status: ClientPaymentStatus; comments: string; file?: string; filePath?: string }
export function CobroForm({ project, cobro, onClose, readOnly }: { project?: Project; cobro?: ClientPayment; onClose: () => void; readOnly?: boolean }) {
  const { state, dispatch } = useStore()
  const nextN = (pid: string) => Math.max(0, ...sel.clientPaymentsForProject(state, pid).map(c => c.n)) + 1
  const initPid = project?.id || cobro?.projectId || ''
  const [c, setC] = React.useState<CobroFormState>(() => cobro ? { ...cobro } : {
    projectId: initPid, n: initPid ? nextN(initPid) : 1, date: TODAY_ISO, amount: '', concept: '', method: '', status: 'Programado', comments: '',
  })
  const set = (k: keyof CobroFormState, v: unknown) => setC(s => ({ ...s, [k]: v }))
  const onPickProject = (pid: string) => setC(s => ({ ...s, projectId: pid, n: cobro ? s.n : (pid ? nextN(pid) : 1) }))
  const valid = c.projectId && c.date && c.amount
  const { requestClose, guard } = useUnsavedGuard(c, onClose)
  const save = () => { dispatch({ type: 'SAVE_CLIENT_PAYMENT', payment: { ...c, n: +c.n || 1, amount: +c.amount || 0 } as ClientPaymentInput }); onClose() }
  const proj = state.projects.find(x => x.id === c.projectId)
  const total = proj ? sel.projectTotalConIva(proj) : 0
  const abonadoAntes = state.clientPayments.filter(x => x.projectId === c.projectId && x.status === 'Cobrado' && x.id !== c.id).reduce((a, x) => a + x.amount, 0)
  const abonado = abonadoAntes + (c.status === 'Cobrado' ? (+c.amount || 0) : 0)
  const saldoRestante = total - abonado
  return (
    <Modal width={500} icon={cobro ? 'edit' : 'plus'} title={cobro ? 'Editar cobro' : 'Registrar cobro del cliente'} sub={proj ? `${proj.code} · ${sel.clientName(state, proj.client)}` : undefined} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
        {!readOnly && <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar cobro</button>}
      </>}>
      <fieldset disabled={readOnly} className="contents">
      {proj && (
        <div className="bg-bg-1 border border-line rounded-[8px] p-3 mb-3.5 grid grid-cols-3 gap-2 text-center">
          <div><div className="label-k">Total venta</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtMoney(total)}</div></div>
          <div><div className="label-k">Abonado</div><div className="font-display font-bold text-[15px] mt-0.5 text-ok">{fmtMoney(abonado)}</div></div>
          <div><div className="label-k">Saldo restante</div><div className="font-display font-bold text-[15px] mt-0.5" style={{ color: saldoRestante > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(saldoRestante)}</div></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3.5">
        {!project && (
          <Field label="Proyecto" span={2}>
            <Select value={c.projectId} onChange={e => onPickProject(e.target.value)}>
              <option value="">Selecciona…</option>
              {state.projects.map(p => <option key={p.id} value={p.id}>{p.code} · {sel.clientName(state, p.client)}</option>)}
            </Select>
          </Field>
        )}
        <Field label="No. de cobro"><Input type="number" value={c.n} onChange={e => set('n', e.target.value)} /></Field>
        <Field label="Fecha"><Input type="date" value={c.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Importe (MXN)"><MoneyInput value={c.amount} onChange={v => set('amount', v)} /></Field>
        <Field label="Estado">
          <Select value={c.status} onChange={e => set('status', e.target.value)}>
            {(['Cobrado', 'Programado', 'Cancelado'] as ClientPaymentStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Concepto" span={2}>
          <Input list="cobro-concepts" value={c.concept} onChange={e => set('concept', e.target.value)} placeholder="Anticipo, Finiquito…" />
          <datalist id="cobro-concepts"><option value="Anticipo 50%" /><option value="Finiquito" /><option value="Abono" /><option value="Pago de contado" /></datalist>
        </Field>
        <Field label="Forma de pago / Ref." span={2}><Input value={c.method} onChange={e => set('method', e.target.value)} placeholder="Transferencia, cheque…" /></Field>
        <Field label="Comentarios" span={2}><Input value={c.comments} onChange={e => set('comments', e.target.value)} /></Field>
        <Field label="Comprobante de pago (imagen/PDF)" span={2}>
          <FileField label="" value={c.file || ''} path={c.filePath} folder={`client_payments/${c.projectId || 'nuevos'}`} onChange={v => setC(s => ({ ...s, file: v.name, filePath: v.path }))} accept=".pdf,.jpg,.jpeg,.png" />
        </Field>
      </div>
      </fieldset>
      {guard}
    </Modal>
  )
}

/** Estado editable del formulario de proyecto (campos numéricos admiten texto mientras se escribe). */
type ProjectFormState = {
  id?: string
  code: string
  stage: StageId
  client: string
  seller: string
  city: string
  alias?: string
  origen?: string
  sistemaVendido?: string
  ventaSubtotal?: number | string
  freight: number | string
  install: number | string
  weeks: number | string
  obs: string
  suppliers: string[]
  eta: string
  finiquito: PayStatus
  docs: ProjectDocs
  created?: string
  updated?: string
  remision?: string
  closedOn?: string
}

/* ---------- Move-stage control ---------- */
export function MoveStage({ project }: { project: Project }) {
  const { state, dispatch } = useStore()
  const [open, setOpen] = React.useState(false)
  const cur = stageIndex(project.stage)
  const next = STAGES[cur + 1]
  const prev = STAGES[cur - 1]
  // Requisito faltante para avanzar a la siguiente etapa (null = se puede avanzar).
  const nextBlocked = next ? stageBlockedReason(state, project, next.id) : null
  return (
    <div className="flex gap-2 items-center relative">
      {prev && (
        <button className="btn btn-ghost btn-sm" title={'Regresar a ' + prev.label}
          onClick={() => dispatch({ type: 'MOVE_STAGE', id: project.id, stage: prev.id })}>
          <Icon name="collapse" size={14} />
        </button>
      )}
      {next ? (
        <button className={'btn btn-primary btn-sm' + (nextBlocked ? ' opacity-50' : '')} disabled={!!nextBlocked}
          title={nextBlocked || undefined}
          onClick={() => dispatch({ type: 'MOVE_STAGE', id: project.id, stage: next.id })}>
          {project.stage === 'registro' ? 'Confirmar venta' : `Avanzar a ${next.short}`} <Icon name="arrowRight" size={14} />
        </button>
      ) : (
        <Badge color="var(--st-9)" icon="check" solid>Proyecto cerrado</Badge>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}><Icon name="dots" size={15} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)}></div>
          <div className="absolute bottom-[115%] right-0 z-[31] bg-bg-3 border border-line-2 shadow-[var(--shadow-2)] min-w-[230px] p-[5px] rounded-[8px] max-h-[58vh] overflow-y-auto">
            <div className="label-k pt-2 px-2.5 pb-1">Mover a etapa</div>
            {STAGES.map(s => (
              <div key={s.id} onClick={() => { dispatch({ type: 'MOVE_STAGE', id: project.id, stage: s.id }); setOpen(false) }}
                className="flex items-center gap-[9px] py-[7px] px-2.5 cursor-pointer"
                style={{ background: s.id === project.stage ? 'var(--bg-4)' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-4)'}
                onMouseLeave={e => e.currentTarget.style.background = s.id === project.stage ? 'var(--bg-4)' : 'transparent'}>
                <span className="w-[7px] h-[7px] rounded-full flex-none" style={{ background: s.color }}></span>
                <span className="font-mono text-[10px] text-tx-2 w-[18px]">{String(s.n).padStart(2,'0')}</span>
                <span className="text-[12.5px]">{s.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function InfoRow({ k, children }: { k: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-[9px] border-b border-line-soft">
      <span className="label-k">{k}</span>
      <span className="text-right text-[13px]">{children}</span>
    </div>
  )
}

/* ---- Estado del PAGO INTERNO de un servicio (flete/instalación) ----
   Resume las solicitudes de pago interno del proyecto para ese servicio y dice si:
   no se ha solicitado, se solicitó (aprobado/programado), va parcial o ya se pagó.
   Los pagos rechazados/cancelados no cuentan. */
const PI_ACTIVE = (ip: InternalPayment) => ip.status !== 'Rechazado' && ip.status !== 'Cancelado'
function pagoInternoEstado(payments: InternalPayment[], cost?: number): { label: string; color: string; detail: string } {
  const activos = payments.filter(PI_ACTIVE)
  if (activos.length === 0) return { label: 'Sin solicitar', color: 'var(--danger)', detail: 'No se ha solicitado el pago interno de este servicio' }
  const pagado = activos.filter(p => p.status === 'Pagado').reduce((a, p) => a + (p.amount || 0), 0)
  const solicitado = activos.reduce((a, p) => a + (p.amount || 0), 0)
  const ref = cost && cost > 0 ? cost : solicitado
  if (pagado <= 0) {
    // Sin pagar aún: refleja qué tan avanzada está la solicitud.
    const label = activos.some(p => p.status === 'Programado') ? 'Programado'
      : activos.some(p => p.status === 'Aprobado') ? 'Aprobado'
      : 'Solicitado'
    return { label, color: 'var(--warn)', detail: `Solicitado ${fmtMoney(solicitado)} · sin pagar` }
  }
  if (pagado >= ref - 0.5) return { label: 'Pagado', color: 'var(--ok)', detail: `Pagado ${fmtMoney(pagado)}` }
  return { label: 'Pago parcial', color: 'var(--st-5)', detail: `Pagado ${fmtMoney(pagado)} de ${fmtMoney(ref)}` }
}

/* ---- Renglón de servicio asignado (flete/instalación): proveedor + presupuesto vs costo ---- */
export function ServiceRow({ label, supplierId, budget, cost, state, payments }: { label: string; supplierId?: string; budget?: number; cost?: number; state: AppState; payments?: InternalPayment[] }) {
  const supplier = supplierId ? sel.supplier(state, supplierId) : undefined
  const hasCost = cost != null && cost > 0
  const over = hasCost && (budget || 0) > 0 && (cost || 0) > (budget || 0)
  const within = hasCost && !over
  // El indicador de pago interno solo tiene sentido cuando el servicio ya tiene proveedor
  // asignado o cuando ya existe alguna solicitud de pago interno.
  const showPI = payments && (!!supplierId || payments.some(PI_ACTIVE))
  const pi = showPI ? pagoInternoEstado(payments!, cost) : null
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px]">
      <div className="min-w-0">
        <div className="font-semibold text-tx-1">{label}</div>
        <div className="meta truncate">{supplier ? supplier.name : 'Sin proveedor asignado'}</div>
        {pi && <div className="mt-1" title={pi.detail}><Badge color={pi.color}>{pi.label}</Badge></div>}
      </div>
      <div className="text-right shrink-0">
        <div className="meta">Presupuesto {fmtMoney(budget)}</div>
        {hasCost
          ? <div className="mono font-semibold" style={{ color: over ? 'var(--danger)' : within ? 'var(--ok)' : 'var(--tx-1)' }}>
              {fmtMoney(cost)} {over ? '▲' : within ? '▼' : ''}
            </div>
          : <div className="meta">Sin costo</div>}
      </div>
    </div>
  )
}

/* ---------- Project detail drawer ---------- */
export function ProjectDetail({ project, onClose, onEdit }: { project: Project; onClose: () => void; onEdit: () => void }) {
  const { state, dispatch } = useStore()
  // Ventas, dirección e ingeniería: ver sin registrar/editar cobros ni mover etapa.
  // (Ventas registra la venta, pero la cobranza la maneja Administración/Finanzas.)
  const readOnly = state.currentUser?.role === 'ventas' || isDireccion(state.currentUser?.role) || isIngenieria(state.currentUser?.role)
  const p = state.projects.find(x => x.id === project.id) || project
  const client = sel.client(state, p.client)
  const seller = sel.seller(state, p.seller)
  const ocs = sel.ordersForProject(state, p.id)
  const eta = daysBetween(p.eta)
  const ventaSub = p.ventaSubtotal || 0
  const ventaIva = ventaSub * 0.16
  const ventaTotal = ventaSub * 1.16
  // Utilidad = venta − compras/gastos (OCs del proyecto, sin contar las canceladas).
  // Misma fuente que la base de comisiones (sel.projectUtilidadSub).
  const comprasTotal = sel.projectComprasConIva(state, p.id)
  const comprasSub = comprasTotal / 1.16
  const internalCost = sel.projectInternalPaymentsCost(state, p.id)
  // Movimientos "por fuera" (sin IVA) ligados al proyecto: ya restan en projectUtilidadSub,
  // así que también deben restarse en la utilidad con IVA para que ambas bases coincidan.
  const movementsCost = sel.projectMovementsCost(state, p.id)
  const utilSub = sel.projectUtilidadSub(state, p)
  const utilTotal = ventaTotal - comprasTotal - internalCost - movementsCost
  const margen = ventaSub > 0 ? (utilSub / ventaSub) * 100 : null
  const cobros = sel.clientPaymentsForProject(state, p.id)
  const cobrado = sel.projectCobrado(state, p.id)
  const saldoCli = sel.projectSaldoCliente(state, p)
  const [cobro, setCobro] = React.useState<ClientPayment | {} | null>(null)

  // Logística (y admins) pueden subir docs de obra desde aquí, sin editar todo el proyecto:
  // Carta fin de obra, Remisión de salida y Evidencia de obra terminada.
  const canUploadObra = isAdminRole(state.currentUser?.role) || state.currentUser?.role === 'logistica'
  const obraFolder = `projects/${p.code || p.id}`
  const setObraDoc = (k: 'cartaFin' | 'remision', v: { name: string; path: string }) =>
    dispatch({ type: 'SAVE_PROJECT', project: { ...p, docs: { ...p.docs, [k]: { name: v.name, ok: !!v.name, ...(v.path ? { path: v.path } : {}) } } } })
  const addEvidencia = (v: { name: string; path: string }) => { if (!v.name) return; dispatch({ type: 'SAVE_PROJECT', project: { ...p, docs: { ...p.docs, evidencia: [...(p.docs.evidencia || []), { name: v.name, ok: true, path: v.path }] } } }) }
  const removeEvidencia = (i: number) => dispatch({ type: 'SAVE_PROJECT', project: { ...p, docs: { ...p.docs, evidencia: (p.docs.evidencia || []).filter((_, idx) => idx !== i) } } })

  return (
    <Modal width={760} onClose={onClose}
      title={<span className="flex items-center gap-3">{p.code} <StageBadge stage={p.stage} withNum /></span>}
      sub={`${client ? client.name : ''} · ${p.city}`}
      footer={<>
        {canEditProject(state.currentUser, p) && <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Editar datos</button>}
        {/* Recalcular comisiones de un proyecto finalizado (admin): útil si cambió el vendedor u overrides. */}
        {isAdminRole(state.currentUser?.role) && p.stage === 'finalizado' && (
          <button className="btn btn-ghost" title="Vuelve a calcular las comisiones según el vendedor y overrides actuales"
            onClick={() => dispatch({ type: 'RECALC_COMMISSIONS', id: p.id })}><Icon name="commissions" size={15} /> Recalcular comisiones</button>
        )}
        <div className="flex-1"></div>
        {/* Avanzar de etapa (confirmar/mover) solo para roles con gestión, no para Ventas ni Dirección. */}
        {state.currentUser?.role !== 'ventas' && !readOnly && <MoveStage project={p} />}
      </>}>

      {/* stage stepper full */}
      <div className="flex gap-0.5 mb-5">
        {STAGES.map((s, i) => {
          const cur = stageIndex(p.stage)
          const active = i === cur
          return (
            <div key={s.id} title={s.label} className="flex-1 text-center">
              <div className="h-1" style={{ background: i <= cur ? s.color : 'var(--bg-4)', opacity: i <= cur ? 1 : 0.5 }}></div>
              <div className={'font-mono text-[8.5px] mt-[5px] whitespace-nowrap overflow-hidden text-ellipsis ' + (active ? 'font-bold' : 'font-normal')} style={{ color: active ? s.color : 'var(--tx-3)' }}>{String(s.n).padStart(2,'0')}</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="label-k mb-2">Datos generales</div>
          <InfoRow k="Cliente">{client ? client.name : '—'}</InfoRow>
          {p.alias && <InfoRow k="Nombre interno / Alias">{p.alias}</InfoRow>}
          <InfoRow k="Origen">{p.origen || '—'}</InfoRow>
          <InfoRow k="Sistema vendido">{p.sistemaVendido || '—'}</InfoRow>
          <InfoRow k="Ciudad destino"><Icon name="pin" size={12} className="align-[-1px] opacity-60" /> {p.city}</InfoRow>
          <InfoRow k="Vendedor"><span className="inline-flex items-center gap-1.5"><Avatar name={seller ? seller.name : ''} size={20} /> {seller ? seller.name : '—'}</span></InfoRow>
          <InfoRow k="Fecha de registro">{p.created ? fmtDate(p.created) : '—'}</InfoRow>
          <InfoRow k="Semanas de entrega"><span className="mono">{p.weeks} sem</span></InfoRow>
          <InfoRow k="ETA proveedor">{p.eta ? <span>{fmtDate(p.eta)} {eta != null && <span className="font-mono text-[11px]" style={{ color: eta < 0 ? 'var(--danger)' : eta < 7 ? 'var(--warn)' : 'var(--tx-2)' }}>({eta < 0 ? `${-eta}d vencido` : eta + 'd'})</span>}</span> : '—'}</InfoRow>
          <InfoRow k="Finiquito"><PayBadge status={p.finiquito} /></InfoRow>
          {p.remision && <InfoRow k="Remisión"><span className="mono">{p.remision}</span></InfoRow>}
        </div>

        <div>
          <div className="label-k mb-2">Venta</div>
          <div className="bg-bg-1 border border-line p-3.5 mb-3.5">
            <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>Presupuesto flete</span><span className="mono">{fmtMoney(p.freight)}</span></div>
            <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>Presupuesto instalación</span><span className="mono">{fmtMoney(p.install)}</span></div>
            <div className="h-px bg-line my-2"></div>
            <div className="flex justify-between text-[12.5px] text-tx-1 py-[3px]"><span>Subtotal de la venta</span><span className="mono">{fmtMoney(ventaSub)}</span></div>
            <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>IVA 16%</span><span className="mono">{fmtMoney(ventaIva)}</span></div>
            <div className="flex justify-between items-baseline mt-1"><span className="label-k">Total con IVA</span><span className="font-display font-extrabold text-[19px]">{fmtMoney(ventaTotal)}</span></div>
          </div>

          <div className="label-k mb-2">Utilidad</div>
          <div className="bg-bg-1 border border-line p-3.5 mb-3.5">
            <div className="flex justify-between text-[12.5px] text-tx-1 py-[3px]"><span>Subtotal de la venta</span><span className="mono">{fmtMoney(ventaSub)}</span></div>
            <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>Compras / gastos (sin IVA)</span><span className="mono">−{fmtMoney(comprasSub)}</span></div>
            {internalCost > 0 && <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>Pagos internos (pagados)</span><span className="mono">−{fmtMoney(internalCost)}</span></div>}
            {movementsCost > 0 && <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>Movimientos (pagados)</span><span className="mono">−{fmtMoney(movementsCost)}</span></div>}
            <div className="flex justify-between text-[12.5px] py-[3px]"><span className="text-tx-1 font-semibold">Utilidad sin IVA</span><span className="mono font-semibold" style={{ color: utilSub >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmtMoney(utilSub)}</span></div>
            <div className="h-px bg-line my-2"></div>
            <div className="flex justify-between text-[12.5px] text-tx-1 py-[3px]"><span>Total con IVA</span><span className="mono">{fmtMoney(ventaTotal)}</span></div>
            <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>Compras / gastos (con IVA)</span><span className="mono">−{fmtMoney(comprasTotal)}</span></div>
            {internalCost > 0 && <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>Pagos internos (pagados)</span><span className="mono">−{fmtMoney(internalCost)}</span></div>}
            {movementsCost > 0 && <div className="flex justify-between text-[12.5px] text-tx-2 py-[3px]"><span>Movimientos (pagados)</span><span className="mono">−{fmtMoney(movementsCost)}</span></div>}
            <div className="flex justify-between items-baseline mt-1"><span className="label-k">Utilidad con IVA</span><span className="font-display font-extrabold text-[19px]" style={{ color: utilTotal >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmtMoney(utilTotal)}</span></div>
            {margen != null && <div className="flex justify-between text-[11px] text-tx-3 mt-1.5"><span>Margen sobre venta</span><span className="mono">{margen.toFixed(1)}%</span></div>}
          </div>

          <div className="label-k mb-2">Servicios asignados (logística)</div>
          <div className="bg-bg-1 border border-line p-3.5 mb-3.5 flex flex-col gap-2.5">
            <ServiceRow label="Flete" supplierId={p.freightSupplierId} budget={p.freight} cost={p.freightCost} state={state}
              payments={state.internalPayments.filter(ip => ip.projectId === p.id && ip.category === 'Flete')} />
            <ServiceRow label="Instalación" supplierId={p.installSupplierId} budget={p.install} cost={p.installCost} state={state}
              payments={state.internalPayments.filter(ip => ip.projectId === p.id && ip.category === 'Instalación')} />
          </div>

          <div className="label-k mb-2">Proveedores asignados</div>
          <div className="flex flex-col gap-1.5">
            {p.suppliers.length === 0 && <span className="meta">Sin proveedor asignado</span>}
            {p.suppliers.map(sid => { const s = sel.supplier(state, sid); return s ? (
              <div key={sid} className="flex items-center gap-2 text-[12.5px]"><Icon name="suppliers" size={14} className="opacity-60" /> {s.name}</div>
            ) : null })}
          </div>
        </div>
      </div>

      {/* observations */}
      {p.obs && (
        <div className="mt-5">
          <div className="label-k mb-2">Observaciones</div>
          <div className="bg-bg-1 py-[11px] px-3.5 text-[13px] text-tx-1 leading-[1.55]" style={{ borderLeft: '3px solid var(--acc)' }}>{p.obs}</div>
        </div>
      )}

      {/* documents */}
      <div className="mt-5">
        <div className="label-k mb-2">Documentos ({docCount(p).done}/7)</div>
        <div className="flex flex-wrap gap-2">
          {DOC_LABELS.map(d => <DocChip key={d.key} doc={p.docs[d.key]} label={d.label} />)}
          {(p.docs.ordenCompra || []).map((oc, i) => <DocChip key={'oc' + i} doc={oc} label={`Orden de compra ${i + 1}`} />)}
          <DocChip doc={p.docs.excel} label="Excel" />
        </div>
      </div>

      {/* Subida de documentos de obra (logística / admin) sin abrir el formulario completo */}
      {canUploadObra && (
        <div className="mt-5">
          <div className="label-k mb-2">Subir documentos de obra</div>
          <div className="grid grid-cols-2 gap-3.5">
            <FileField label="Carta fin de obra" value={p.docs.cartaFin.name} path={p.docs.cartaFin.path} folder={obraFolder} onChange={v => setObraDoc('cartaFin', v)} accept=".pdf,.jpg,.jpeg,.png" />
            <FileField label="Remisión de salida" value={p.docs.remision.name} path={p.docs.remision.path} folder={obraFolder} onChange={v => setObraDoc('remision', v)} accept=".pdf,.jpg,.jpeg,.png" />
          </div>
          <div className="mt-3">
            <div className="label-k mb-1.5">Evidencia de obra terminada ({(p.docs.evidencia || []).length})</div>
            <div className="grid grid-cols-2 gap-3.5">
              {(p.docs.evidencia || []).map((ev, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0"><DocChip doc={ev} label={ev.name || `Evidencia ${i + 1}`} /></div>
                  <button type="button" className="btn btn-sm btn-ghost shrink-0" title="Quitar" onClick={() => removeEvidencia(i)}><Icon name="trash" size={13} /></button>
                </div>
              ))}
              <FileField label="" value="" folder={`${obraFolder}/evidencia`} onChange={addEvidencia} accept=".jpg,.jpeg,.png,.webp" />
            </div>
          </div>
        </div>
      )}

      {/* OCs */}
      {ocs.length > 0 && (
        <div className="mt-5">
          <div className="label-k mb-2">Órdenes de compra ({ocs.length})</div>
          <div className="border border-line">
            {ocs.map(o => { const s = sel.supplier(state, o.supplierId); return (
              <div key={o.id} className="flex items-center gap-3 py-[10px] px-3 border-b border-line-soft text-[12.5px]">
                <span className="mono text-acc">{o.number}</span>
                <span className="flex-1 text-tx-1">{s ? s.name : ''}</span>
                <span className="mono">{fmtMoney(o.amount)}</span>
                <OCStatus status={sel.ocStatus(state, o)} />
              </div>
            ) })}
          </div>
        </div>
      )}

      {/* remisiones de salida del proyecto */}
      {(() => {
        const rems = sel.remisionesForProject(state, p.id)
        if (rems.length === 0) return null
        return (
          <div className="mt-5">
            <div className="label-k mb-2">Remisiones de salida ({rems.length})</div>
            <div className="border border-line rounded-[8px] overflow-hidden">
              <table className="tbl">
                <thead><tr><th>Folio</th><th>Fecha</th><th className="num">Partidas</th><th>Estatus</th><th></th></tr></thead>
                <tbody>
                  {rems.map(r => (
                    <tr key={r.id} style={{ cursor: 'default' }}>
                      <td><span className="mono text-acc font-semibold">{r.number}</span></td>
                      <td className="num text-tx-1 text-[12px]">{fmtDateShort(r.date)}</td>
                      <td className="num mono text-[12px]">{r.items.length}</td>
                      <td>{remisionStatusBadge(r.status)}</td>
                      <td><div className="flex gap-1 justify-end">
                        {r.filePath && <DocChip doc={{ name: r.file || 'Remisión PDF', ok: true, path: r.filePath }} label="PDF" />}
                        <button className="btn btn-ghost btn-sm" title="Generar / ver PDF" onClick={() => printRemision(state, r)}><Icon name="download" size={13} /> PDF</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* cobros del cliente (ingresos del proyecto) */}
      <div className="mt-5">
        <div className="spread mb-2">
          <span className="label-k">Cobros del cliente</span>
          {!readOnly && <button className="btn btn-ghost btn-sm" onClick={() => setCobro({})}><Icon name="plus" size={13} /> Registrar cobro</button>}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Total venta (c/IVA)</div><div className="font-display font-bold text-[16px] mt-0.5">{fmtMoney(ventaTotal)}</div></div>
          <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Cobrado</div><div className="font-display font-bold text-[16px] mt-0.5 text-ok">{fmtMoney(cobrado)}</div></div>
          <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Saldo por cobrar</div><div className="font-display font-bold text-[16px] mt-0.5" style={{ color: saldoCli > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(saldoCli)}</div></div>
        </div>
        {cobros.length === 0 ? <Empty icon="money">Sin cobros registrados</Empty> : (
          <div className="border border-line rounded-[8px] overflow-hidden">
            <table className="tbl">
              <thead><tr><th>#</th><th>Fecha</th><th>Concepto</th><th className="num">Importe</th><th className="num">Acum.</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {cobros.map(c => {
                  const acum = cobros.filter(x => x.status !== 'Cancelado' && x.n <= c.n).reduce((a, x) => a + x.amount, 0)
                  return (
                  <tr key={c.id} style={{ cursor: 'default' }}>
                    <td className="mono">{c.n}</td>
                    <td className="num text-tx-1 text-[12px]">{fmtDateShort(c.date)}</td>
                    <td className="text-[12.5px]">{c.concept || '—'}{c.method ? <div className="meta mt-px">{c.method}</div> : null}</td>
                    <td className="num">{fmtMoney(c.amount)}</td>
                    <td className="num text-[12px]">{fmtMoney(acum)}<div className="meta">de {fmtMoney(ventaTotal)}</div></td>
                    <td>{cobroBadge(c.status)}</td>
                    <td>{!readOnly && <div className="flex gap-1 justify-end">
                      <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setCobro(c)}><Icon name="edit" size={13} /></button>
                      <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => dispatch({ type: 'DELETE_CLIENT_PAYMENT', id: c.id })}><Icon name="trash" size={13} /></button>
                    </div>}</td>
                  </tr>
                ) })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cobro && <CobroForm project={p} cobro={'id' in cobro ? cobro : undefined} onClose={() => setCobro(null)} readOnly={readOnly} />}
    </Modal>
  )
}

/* ---------- Create / edit form ---------- */
// Siguiente código consecutivo: PRY-2026-### (el mayor existente + 1).
const nextProjectCode = (projects: Project[]) => {
  const max = projects.reduce((m, p) => {
    const mt = /(\d+)\s*$/.exec(p.code || '')
    return mt ? Math.max(m, parseInt(mt[1], 10)) : m
  }, 0)
  return `PRY-2026-${String(max + 1).padStart(3, '0')}`
}

// Orígenes de la venta/lead (canal de captación).
const ORIGENES = ['WebAd', 'CTC Ad Racks Industriales', 'CTC Ad Mezzanines', 'CTC Ad Minirack', 'Otro (Especificar)']

const blank = (): ProjectFormState => ({
  code: '', stage: 'registro',
  client: '', seller: '', city: '', alias: '', origen: '', sistemaVendido: '', ventaSubtotal: '', freight: '', install: '', weeks: '', obs: '',
  suppliers: [], eta: '', finiquito: 'pending', created: TODAY_ISO,
  docs: { cotizacion: docNo(), layout: docNo(), anticipo: docNo(), ordenCompra: [], finiquito: docNo(), remision: docNo(), cartaFin: docNo() },
})

/* ---- Vista rápida de la info del cliente desde el formulario de proyecto ---- */
function ClientInfoModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { state } = useStore()
  const c = sel.client(state, clientId)
  if (!c) return null
  const sub = [c.rfc || c.city, c.since ? `Cliente desde ${fmtDate(c.since)}` : ''].filter(Boolean).join(' · ')
  const Row = ({ k, v, mono }: { k: string; v?: React.ReactNode; mono?: boolean }) => (
    <div className="flex justify-between gap-4 py-[7px] border-b border-line-soft">
      <span className="label-k">{k}</span>
      <span className={'text-right text-[13px] ' + (mono ? 'mono' : '')}>{v || '—'}</span>
    </div>
  )
  return (
    <Modal width={460} icon="clients" title={c.name} sub={sub} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div className="flex flex-col gap-2.5 mb-4">
        {c.contact && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="user" size={15} className="text-tx-2" /> {c.contact}</div>}
        {c.phone && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="phone" size={15} className="text-tx-2" /> <span className="mono">{c.phone}</span></div>}
        {c.email && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="mail" size={15} className="text-tx-2" /> {c.email}</div>}
        {c.city && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="pin" size={15} className="text-tx-2" /> {c.city}</div>}
      </div>
      {(c.razonSocial || c.rfc || c.regimenFiscal || c.cp || c.usoCFDI || c.diasCredito != null || c.limiteCredito != null) && (
        <>
          <div className="label-k mb-1.5">Datos fiscales</div>
          <div className="bg-bg-1 border border-line p-3">
            <Row k="Razón social" v={c.razonSocial} />
            <Row k="RFC" v={c.rfc} mono />
            <Row k="Régimen fiscal" v={c.regimenFiscal} mono />
            <Row k="Código postal" v={c.cp} mono />
            <Row k="Uso de CFDI" v={c.usoCFDI} mono />
            {c.diasCredito != null && <Row k="Días de crédito" v={String(c.diasCredito)} />}
            {c.limiteCredito != null && <Row k="Límite de crédito" v={fmtMoney(c.limiteCredito)} />}
          </div>
        </>
      )}
    </Modal>
  )
}

export function ProjectForm({ project, prefill, onClose, onSaved }: { project?: Project; prefill?: Partial<Project>; onClose: () => void; onSaved?: (project: Project) => void }) {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const isVentas = me?.role === 'ventas'
  const [p, setP] = React.useState<ProjectFormState>(() => project
    ? JSON.parse(JSON.stringify(project))
    // Proyecto nuevo (opcionalmente prellenado desde un prospecto): id estable para poder
    // enlazar el prospecto convertido; el reducer lo trata como nuevo igualmente.
    : { ...blank(), code: nextProjectCode(state.projects), seller: isVentas ? me!.id : '', id: uid('p'), ...prefill })
  const isNew = !project
  const set = (k: keyof ProjectFormState, v: unknown) => setP(s => ({ ...s, [k]: v }))
  // Origen: si el valor guardado no es uno de los presets, se considera "Otro" (texto libre).
  const presetOrigenes = ORIGENES.slice(0, -1)
  const [origenOtro, setOrigenOtro] = React.useState(() => !!p.origen && !presetOrigenes.includes(p.origen))
  const [showClient, setShowClient] = React.useState(false)
  const [addClient, setAddClient] = React.useState(false)
  // ETA proveedor automático: fecha base (creación o hoy) + semanas de entrega × 7 días.
  const etaBase = (project?.created || '').slice(0, 10) || TODAY_ISO
  const setWeeks = (v: string) => setP(s => {
    const w = +v
    return { ...s, weeks: v, eta: w > 0 ? addDays(Math.round(w * 7), etaBase) : s.eta }
  })
  const setDoc = (k: DocKey, v: { name: string; path: string }) => setP(s => ({ ...s, docs: { ...s.docs, [k]: { name: v.name, ok: !!v.name, ...(v.path ? { path: v.path } : {}) } } }))
  // Evidencia de obra terminada: lista de imágenes (varias). Requisito para finalizar.
  const addEvidencia = (v: { name: string; path: string }) => { if (!v.name) return; setP(s => ({ ...s, docs: { ...s.docs, evidencia: [...(s.docs.evidencia || []), { name: v.name, ok: true, path: v.path }] } })) }
  const removeEvidencia = (i: number) => setP(s => ({ ...s, docs: { ...s.docs, evidencia: (s.docs.evidencia || []).filter((_, idx) => idx !== i) } }))
  const docFolder = `projects/${p.code || project?.id || 'nuevos'}`

  const valid = p.client && p.city && p.seller
  const ventaSub = +(p.ventaSubtotal || 0)
  const ventaIva = ventaSub * 0.16
  const ventaTotal = ventaSub * 1.16
  // Guardia de cambios sin guardar: si el formulario se tocó, confirma antes de salir.
  const { requestClose, guard } = useUnsavedGuard(p, onClose)
  const save = () => {
    // Ventas: el vendedor SIEMPRE es él mismo (no puede registrar ventas a nombre de otro).
    const seller = isVentas ? me!.id : p.seller
    const project = { ...p, seller, ventaSubtotal: ventaSub, freight: +p.freight || 0, install: +p.install || 0, weeks: +p.weeks || 0 } as Project
    dispatch({ type: 'SAVE_PROJECT', project })
    onSaved?.(project)
    onClose()
  }

  return (
    <Modal width={720} icon={isNew ? 'plus' : 'edit'}
      title={isNew ? 'Registrar venta / proyecto' : 'Editar proyecto'}
      sub={isNew ? 'Captura los datos iniciales de la venta' : p.code}
      onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50 cursor-not-allowed' : '')} disabled={!valid} onClick={save}>
          <Icon name="check" size={15} /> {isNew ? 'Registrar proyecto' : 'Guardar cambios'}
        </button>
      </>}>
      <div className="grid grid-cols-3 gap-3.5">
        <Field label="Código de proyecto"><Input className="input mono" value={p.code} onChange={e => set('code', e.target.value)} /></Field>
        <Field label="Cliente">
          <div className="flex gap-1.5 items-stretch">
            <div className="flex-1 min-w-0">
              <Combobox value={p.client} onChange={v => set('client', v)} placeholder="Buscar cliente…"
                options={state.clients.map(c => ({ value: c.id, label: c.name, sub: c.rfc || c.city }))} />
            </div>
            <button type="button" className="btn btn-ghost px-2.5 shrink-0" disabled={!p.client}
              title={p.client ? 'Ver información del cliente' : 'Selecciona un cliente'} onClick={() => setShowClient(true)}>
              <Icon name="eye" size={15} />
            </button>
            <button type="button" className="btn btn-ghost px-2.5 shrink-0" title="Agregar cliente nuevo" onClick={() => setAddClient(true)}>
              <Icon name="plus" size={15} />
            </button>
          </div>
        </Field>
        <Field label={<>Nombre interno / Alias <span className="meta font-normal">(opcional)</span></>}>
          <Input value={p.alias || ''} onChange={e => set('alias', e.target.value)} placeholder="Cómo conoces al cliente" />
        </Field>
        <Field label="Ciudad destino"><Input value={p.city} onChange={e => set('city', e.target.value)} placeholder="Ej. Monterrey, N.L." /></Field>
        <Field label="Sistema vendido"><Input value={p.sistemaVendido || ''} onChange={e => set('sistemaVendido', e.target.value)} placeholder="Ej. Rack selectivo" /></Field>

        <Field label="Origen">
          <Select value={origenOtro ? 'Otro (Especificar)' : (p.origen || '')} onChange={e => {
            const v = e.target.value
            if (v === 'Otro (Especificar)') { setOrigenOtro(true); set('origen', '') }
            else { setOrigenOtro(false); set('origen', v) }
          }}>
            <option value="">Selecciona…</option>
            {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
        </Field>
        {origenOtro && <Field label="Especificar origen"><Input value={p.origen || ''} onChange={e => set('origen', e.target.value)} placeholder="Describe el origen" autoFocus /></Field>}

        <Field label="Vendedor">
          <Select value={p.seller} onChange={e => set('seller', e.target.value)} disabled={isVentas}>
            <option value="">Selecciona…</option>
            {sel.vendedores(state).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Etapa actual">
          <Select value={p.stage} onChange={e => set('stage', e.target.value)} disabled={isVentas}>
            {STAGES.map(s => <option key={s.id} value={s.id}>{String(s.n).padStart(2,'0')} · {s.label}</option>)}
          </Select>
        </Field>
        <Field label="Semanas de entrega"><Input type="number" value={p.weeks} onChange={e => setWeeks(e.target.value)} placeholder="6" /></Field>

        <Field label="Presupuesto flete (MXN)"><MoneyInput value={p.freight} onChange={v => set('freight', v)} placeholder="0" /></Field>
        <Field label="Presupuesto instalación (MXN)"><MoneyInput value={p.install} onChange={v => set('install', v)} placeholder="0" /></Field>
        <Field label={<>ETA proveedor <span className="meta font-normal">(auto)</span></>}><Input type="date" value={p.eta} onChange={e => set('eta', e.target.value)} /></Field>
        <Field label="Fecha de registro"><Input type="date" value={(p.created || '').slice(0, 10)} onChange={e => set('created', e.target.value)} /></Field>
      </div>

      {/* venta: subtotal (ya incluye flete e instalación) → IVA → total */}
      <div className="mt-4 bg-bg-1 border border-line rounded-[8px] p-3.5">
        <div className="grid grid-cols-[1fr_auto_auto] gap-5 items-end">
          <Field label="Subtotal de la venta (incluye flete e instalación)"><MoneyInput value={p.ventaSubtotal ?? ''} onChange={v => set('ventaSubtotal', v)} placeholder="0" /></Field>
          <div className="text-right"><div className="label-k">IVA 16%</div><div className="mono mt-1">{fmtMoney(ventaIva)}</div></div>
          <div className="text-right"><div className="label-k">Total con IVA</div><div className="font-display font-extrabold text-[18px] mt-1">{fmtMoney(ventaTotal)}</div></div>
        </div>
      </div>

      <div className="mt-4">
        <Field label="Observaciones (cambios de color, peticiones especiales)">
          <TextArea value={p.obs} onChange={e => set('obs', e.target.value)} placeholder="Ej. Cambio de color a gris RAL 7016, refuerzo en niveles bajos…" />
        </Field>
      </div>

      <div className="mt-4">
        <div className="label-k mb-2">Documentos</div>
        {/* Dos columnas balanceadas (4 y 4): izquierda = docs impares + Excel; derecha = docs pares + Evidencia. */}
        <div className="grid grid-cols-2 gap-3.5 items-start">
          {/* Columna izquierda */}
          <div className="flex flex-col gap-3.5">
            {DOC_LABELS.filter((_, i) => i % 2 === 0).map(d => (
              <FileField key={d.key} label={d.label} value={p.docs[d.key]?.name} path={p.docs[d.key]?.path} folder={docFolder} onChange={v => setDoc(d.key, v)} accept=".pdf,.xlsx,.xls,.jpg,.png,.dwg" />
            ))}
            <FileField label="Excel" value={p.docs.excel?.name} path={p.docs.excel?.path} folder={docFolder} onChange={v => setDoc('excel', v)} accept=".xlsx,.xls,.csv" />
          </div>
          {/* Columna derecha */}
          <div className="flex flex-col gap-3.5">
            {DOC_LABELS.filter((_, i) => i % 2 === 1).map(d => (
              <FileField key={d.key} label={d.label} value={p.docs[d.key]?.name} path={p.docs[d.key]?.path} folder={docFolder} onChange={v => setDoc(d.key, v)} accept=".pdf,.xlsx,.xls,.jpg,.png,.dwg" />
            ))}
            <div className="field">
              <label>Evidencia de obra terminada ({(p.docs.evidencia || []).length})</label>
              <div className="flex flex-col gap-2">
                {(p.docs.evidencia || []).map((ev, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0"><DocChip doc={ev} label={ev.name || `Evidencia ${i + 1}`} /></div>
                    <button type="button" className="btn btn-sm btn-ghost shrink-0" title="Quitar" onClick={() => removeEvidencia(i)}><Icon name="trash" size={13} /></button>
                  </div>
                ))}
                <FileField label="" value="" folder={`${docFolder}/evidencia`} onChange={addEvidencia} accept=".jpg,.jpeg,.png,.webp" />
              </div>
            </div>
          </div>
        </div>
        {(p.docs.ordenCompra || []).length > 0 && (
          <div className="mt-3">
            <div className="label-k mb-1.5">Órdenes de compra ({p.docs.ordenCompra.length})</div>
            <div className="flex flex-wrap gap-2">
              {p.docs.ordenCompra.map((oc, i) => <DocChip key={i} doc={oc} label={`Orden de compra ${i + 1}`} />)}
            </div>
          </div>
        )}
        <div className="meta mt-2">Requisito para finalizar el proyecto: Carta fin de obra + al menos una imagen de evidencia.</div>
      </div>

      {guard}
      {showClient && p.client && <ClientInfoModal clientId={p.client} onClose={() => setShowClient(false)} />}
      {addClient && <ClientForm requestApproval onCreated={(cli) => setP(s => ({ ...s, client: cli.id }))} onClose={() => setAddClient(false)} />}
    </Modal>
  )
}
