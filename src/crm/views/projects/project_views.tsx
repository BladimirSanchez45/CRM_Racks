// ============================================================
//  PROJECT VIEWS — detail drawer + create/edit form
// ============================================================
import * as React from 'react'
import { useStore, sel, STAGES, stageIndex, fmtMoney, fmtDate, daysBetween, docNo, docCount, DOC_LABELS } from '../../core/data'
import { Modal, Field, Input, TextArea, Select, FileField, StageBadge, DocChip, PayBadge, Badge, Avatar, OCStatus } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { PayStatus, Project, ProjectDocs, StageId } from '../../core/types'

/** Estado editable del formulario de proyecto (campos numéricos admiten texto mientras se escribe). */
type ProjectFormState = {
  id?: string
  code: string
  stage: StageId
  client: string
  seller: string
  city: string
  sistemaVendido?: string
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
  const { state } = useStore()
  const p = state.projects.find(x => x.id === project.id) || project
  const client = sel.client(state, p.client)
  const seller = sel.seller(state, p.seller)
  const ocs = sel.ordersForProject(state, p.id)
  const eta = daysBetween(p.eta)
  const budget = sel.budget(p)

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
          <div className="label-k mb-2">Presupuesto</div>
          <div className="bg-bg-1 border border-line p-3.5 mb-3.5">
            <div className="flex justify-between text-[12.5px] text-tx-1 py-[3px]"><span>Flete</span><span className="mono">{fmtMoney(p.freight)}</span></div>
            <div className="flex justify-between text-[12.5px] text-tx-1 py-[3px]"><span>Instalación</span><span className="mono">{fmtMoney(p.install)}</span></div>
            <div className="h-px bg-line my-2"></div>
            <div className="flex justify-between items-baseline"><span className="label-k">Total</span><span className="font-display font-extrabold text-[19px]">{fmtMoney(budget)}</span></div>
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
    </Modal>
  )
}

/* ---------- Create / edit form ---------- */
const blank = (): ProjectFormState => ({
  code: 'PRY-2026-' + String(Math.floor(Math.random()*900)+100), stage: 'registro',
  client: '', seller: '', city: '', sistemaVendido: '', freight: '', install: '', weeks: '', obs: '',
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
  const save = () => {
    dispatch({ type: 'SAVE_PROJECT', project: { ...p, freight: +p.freight || 0, install: +p.install || 0, weeks: +p.weeks || 0 } })
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

        <Field label="Presupuesto flete (MXN)"><Input type="number" value={p.freight} onChange={e => set('freight', e.target.value)} placeholder="0" /></Field>
        <Field label="Presupuesto instalación (MXN)"><Input type="number" value={p.install} onChange={e => set('install', e.target.value)} placeholder="0" /></Field>
        <Field label="ETA proveedor"><Input type="date" value={p.eta} onChange={e => set('eta', e.target.value)} /></Field>
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
