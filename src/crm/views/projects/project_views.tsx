// ============================================================
//  PROJECT VIEWS — detail drawer + create/edit form
// ============================================================
import * as React from 'react'
import { useStore, sel, STAGES, stageIndex, fmtMoney, fmtDate, fmtDateShort, daysBetween, docNo, docCount, DOC_LABELS } from '../../core/data'
import { Modal, Field, Input, TextArea, Select, FileField, MoneyInput, StageBadge, DocChip, PayBadge, Badge, Avatar, OCStatus, Empty } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { ClientPayment, ClientPaymentInput, ClientPaymentStatus, PayStatus, Project, ProjectDocs, StageId } from '../../core/types'

/* ---- badge de estado de cobro + formulario de cobro del cliente ---- */
const COBRO_COLOR: Record<ClientPaymentStatus, string> = { Cobrado: 'var(--ok)', Programado: 'var(--warn)', Cancelado: 'var(--tx-3)' }
const cobroBadge = (s: ClientPaymentStatus) => <Badge color={COBRO_COLOR[s]}>{s}</Badge>

type CobroFormState = { id?: string; projectId: string; n: number | string; date: string; amount: number | string; concept: string; method: string; status: ClientPaymentStatus; comments: string }
export function CobroForm({ project, cobro, onClose }: { project?: Project; cobro?: ClientPayment; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const nextN = (pid: string) => Math.max(0, ...sel.clientPaymentsForProject(state, pid).map(c => c.n)) + 1
  const initPid = project?.id || cobro?.projectId || ''
  const [c, setC] = React.useState<CobroFormState>(() => cobro ? { ...cobro } : {
    projectId: initPid, n: initPid ? nextN(initPid) : 1, date: '2026-06-05', amount: '', concept: '', method: '', status: 'Programado', comments: '',
  })
  const set = (k: keyof CobroFormState, v: unknown) => setC(s => ({ ...s, [k]: v }))
  const onPickProject = (pid: string) => setC(s => ({ ...s, projectId: pid, n: cobro ? s.n : (pid ? nextN(pid) : 1) }))
  const valid = c.projectId && c.date && c.amount
  const save = () => { dispatch({ type: 'SAVE_CLIENT_PAYMENT', payment: { ...c, n: +c.n || 1, amount: +c.amount || 0 } as ClientPaymentInput }); onClose() }
  const proj = state.projects.find(x => x.id === c.projectId)
  const total = proj ? sel.projectTotalConIva(proj) : 0
  const abonadoAntes = state.clientPayments.filter(x => x.projectId === c.projectId && x.status === 'Cobrado' && x.id !== c.id).reduce((a, x) => a + x.amount, 0)
  const abonado = abonadoAntes + (c.status === 'Cobrado' ? (+c.amount || 0) : 0)
  const saldoRestante = total - abonado
  return (
    <Modal width={500} icon={cobro ? 'edit' : 'plus'} title={cobro ? 'Editar cobro' : 'Registrar cobro del cliente'} sub={proj ? `${proj.code} · ${sel.clientName(state, proj.client)}` : undefined} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar cobro</button>
      </>}>
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
      </div>
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
  const { dispatch } = useStore()
  const [open, setOpen] = React.useState(false)
  const cur = stageIndex(project.stage)
  const next = STAGES[cur + 1]
  const prev = STAGES[cur - 1]
  return (
    <div className="flex gap-2 items-center relative">
      {prev && (
        <button className="btn btn-ghost btn-sm" title={'Regresar a ' + prev.label}
          onClick={() => dispatch({ type: 'MOVE_STAGE', id: project.id, stage: prev.id })}>
          <Icon name="collapse" size={14} />
        </button>
      )}
      {next ? (
        <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: 'MOVE_STAGE', id: project.id, stage: next.id })}>
          Avanzar a {next.short} <Icon name="arrowRight" size={14} />
        </button>
      ) : (
        <Badge color="var(--st-9)" icon="check" solid>Proyecto cerrado</Badge>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}><Icon name="dots" size={15} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)}></div>
          <div className="absolute top-[110%] right-0 z-[31] bg-bg-3 border border-line-2 shadow-[var(--shadow-2)] min-w-[230px] p-[5px]">
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

/* ---------- Project detail drawer ---------- */
export function ProjectDetail({ project, onClose, onEdit }: { project: Project; onClose: () => void; onEdit: () => void }) {
  const { state, dispatch } = useStore()
  const p = state.projects.find(x => x.id === project.id) || project
  const client = sel.client(state, p.client)
  const seller = sel.seller(state, p.seller)
  const ocs = sel.ordersForProject(state, p.id)
  const eta = daysBetween(p.eta)
  const ventaSub = p.ventaSubtotal || 0
  const ventaIva = ventaSub * 0.16
  const ventaTotal = ventaSub * 1.16
  const cobros = sel.clientPaymentsForProject(state, p.id)
  const cobrado = sel.projectCobrado(state, p.id)
  const saldoCli = sel.projectSaldoCliente(state, p)
  const [cobro, setCobro] = React.useState<ClientPayment | {} | null>(null)

  return (
    <Modal width={760} onClose={onClose}
      title={<span className="flex items-center gap-3">{p.code} <StageBadge stage={p.stage} withNum /></span>}
      sub={`${client ? client.name : ''} · ${p.city}`}
      footer={<>
        <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Editar datos</button>
        <div className="flex-1"></div>
        <MoveStage project={p} />
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
          <InfoRow k="Sistema vendido">{p.sistemaVendido || '—'}</InfoRow>
          <InfoRow k="Ciudad destino"><Icon name="pin" size={12} className="align-[-1px] opacity-60" /> {p.city}</InfoRow>
          <InfoRow k="Vendedor"><span className="inline-flex items-center gap-1.5"><Avatar name={seller ? seller.name : ''} size={20} /> {seller ? seller.name : '—'}</span></InfoRow>
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
        </div>
      </div>

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

      {/* cobros del cliente (ingresos del proyecto) */}
      <div className="mt-5">
        <div className="spread mb-2">
          <span className="label-k">Cobros del cliente</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setCobro({})}><Icon name="plus" size={13} /> Registrar cobro</button>
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
                    <td><div className="flex gap-1 justify-end">
                      <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setCobro(c)}><Icon name="edit" size={13} /></button>
                      <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => dispatch({ type: 'DELETE_CLIENT_PAYMENT', id: c.id })}><Icon name="trash" size={13} /></button>
                    </div></td>
                  </tr>
                ) })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cobro && <CobroForm project={p} cobro={'id' in cobro ? cobro : undefined} onClose={() => setCobro(null)} />}
    </Modal>
  )
}

/* ---------- Create / edit form ---------- */
const blank = (): ProjectFormState => ({
  code: 'PRY-2026-' + String(Math.floor(Math.random()*900)+100), stage: 'registro',
  client: '', seller: '', city: '', sistemaVendido: '', ventaSubtotal: '', freight: '', install: '', weeks: '', obs: '',
  suppliers: [], eta: '', finiquito: 'pending',
  docs: { cotizacion: docNo(), layout: docNo(), anticipo: docNo(), ordenCompra: docNo(), finiquito: docNo(), remision: docNo(), cartaFin: docNo() },
})

export function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [p, setP] = React.useState<ProjectFormState>(() => project ? JSON.parse(JSON.stringify(project)) : blank())
  const isNew = !project
  const set = (k: keyof ProjectFormState, v: unknown) => setP(s => ({ ...s, [k]: v }))
  const setDoc = (k: keyof ProjectDocs, name: string) => setP(s => ({ ...s, docs: { ...s.docs, [k]: { name, ok: !!name } } }))

  const valid = p.client && p.city && p.seller
  const ventaSub = +(p.ventaSubtotal || 0)
  const ventaIva = ventaSub * 0.16
  const ventaTotal = ventaSub * 1.16
  const save = () => {
    dispatch({ type: 'SAVE_PROJECT', project: { ...p, ventaSubtotal: ventaSub, freight: +p.freight || 0, install: +p.install || 0, weeks: +p.weeks || 0 } })
    onClose()
  }

  return (
    <Modal width={720} icon={isNew ? 'plus' : 'edit'}
      title={isNew ? 'Registrar venta / proyecto' : 'Editar proyecto'}
      sub={isNew ? 'Captura los datos iniciales de la venta' : p.code}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50 cursor-not-allowed' : '')} disabled={!valid} onClick={save}>
          <Icon name="check" size={15} /> {isNew ? 'Registrar proyecto' : 'Guardar cambios'}
        </button>
      </>}>
      <div className="grid grid-cols-3 gap-3.5">
        <Field label="Código de proyecto"><Input className="input mono" value={p.code} onChange={e => set('code', e.target.value)} /></Field>
        <Field label="Cliente">
          <Select value={p.client} onChange={e => set('client', e.target.value)}>
            <option value="">Selecciona…</option>
            {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Ciudad destino"><Input value={p.city} onChange={e => set('city', e.target.value)} placeholder="Ej. Monterrey, N.L." /></Field>
        <Field label="Sistema vendido"><Input value={p.sistemaVendido || ''} onChange={e => set('sistemaVendido', e.target.value)} placeholder="Ej. Rack selectivo" /></Field>

        <Field label="Vendedor">
          <Select value={p.seller} onChange={e => set('seller', e.target.value)}>
            <option value="">Selecciona…</option>
            {state.sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Etapa actual">
          <Select value={p.stage} onChange={e => set('stage', e.target.value)}>
            {STAGES.map(s => <option key={s.id} value={s.id}>{String(s.n).padStart(2,'0')} · {s.label}</option>)}
          </Select>
        </Field>
        <Field label="Semanas de entrega"><Input type="number" value={p.weeks} onChange={e => set('weeks', e.target.value)} placeholder="6" /></Field>

        <Field label="Presupuesto flete (MXN)"><MoneyInput value={p.freight} onChange={v => set('freight', v)} placeholder="0" /></Field>
        <Field label="Presupuesto instalación (MXN)"><MoneyInput value={p.install} onChange={v => set('install', v)} placeholder="0" /></Field>
        <Field label="ETA proveedor"><Input type="date" value={p.eta} onChange={e => set('eta', e.target.value)} /></Field>
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
        <div className="grid grid-cols-2 gap-3.5">
          {DOC_LABELS.map(d => (
            <FileField key={d.key} label={d.label} value={p.docs[d.key].name} onChange={n => setDoc(d.key, n)} accept=".pdf,.xlsx,.xls,.jpg,.png,.dwg" />
          ))}
        </div>
      </div>
    </Modal>
  )
}
