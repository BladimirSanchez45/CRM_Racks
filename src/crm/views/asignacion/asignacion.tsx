// ============================================================
//  ASIGNACIÓN — logística asigna proveedor de flete e instalación
//  y captura el COSTO REAL (vs el presupuesto informativo de la venta).
//  El costo real resta utilidad → impacta la comisión de todos.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney } from '../../core/data'
import { Modal, Field, Select, MoneyInput, Empty, KPI, StageBadge, Badge, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Project, Supplier } from '../../core/types'

const FLETE_CAT = 'Fletes y transporte'
const INSTALL_CAT = 'Cuadrilla de instalación'

/** Proveedores activos de una categoría (con respaldo a todos los activos si no hay de esa categoría). */
function suppliersByCat(suppliers: Supplier[], cat: string): Supplier[] {
  const active = suppliers.filter(s => s.active)
  const ofCat = active.filter(s => s.cat === cat)
  return ofCat.length ? ofCat : active
}

/* ---- Selector de proveedor + costo de un servicio ---- */
function ServiceField({ title, cat, suppliers, supplierId, cost, budget, onSupplier, onCost }: {
  title: string
  cat: string
  suppliers: Supplier[]
  supplierId: string
  cost: number | string
  budget: number
  onSupplier: (v: string) => void
  onCost: (v: number) => void
}) {
  const list = suppliersByCat(suppliers, cat)
  const c = +cost || 0
  const over = c > 0 && budget > 0 && c > budget
  const within = c > 0 && !over
  const diff = c - budget
  return (
    <div className="bg-bg-1 border border-line rounded-[8px] p-3.5">
      <div className="spread mb-2.5">
        <span className="font-display font-bold text-[14px]">{title}</span>
        <span className="meta">Presupuesto <b className="mono text-tx-1">{fmtMoney(budget)}</b></span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Proveedor">
          <Select value={supplierId} onChange={e => onSupplier(e.target.value)}>
            <option value="">Sin asignar…</option>
            {list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Costo real (MXN)"><MoneyInput value={cost} onChange={onCost} placeholder="0" /></Field>
      </div>
      {c > 0 && (
        <div className="mt-2.5 flex items-center gap-2 text-[12px]">
          {over
            ? <Badge color="var(--danger)" icon="alert">Sobre presupuesto {fmtMoney(diff)}</Badge>
            : <Badge color="var(--ok)" icon="check">Dentro del presupuesto · ahorro {fmtMoney(-diff)}</Badge>}
          {within && diff === 0 && <span className="meta">Justo en el presupuesto</span>}
        </div>
      )}
    </div>
  )
}

/* ---- Modal de asignación de servicios de un proyecto ---- */
function AssignForm({ project, onClose }: { project: Project; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [f, setF] = React.useState(() => ({
    freightSupplierId: project.freightSupplierId ?? '',
    freightCost: (project.freightCost ?? '') as number | string,
    installSupplierId: project.installSupplierId ?? '',
    installCost: (project.installCost ?? '') as number | string,
  }))
  const set = (k: keyof typeof f, v: unknown) => setF(s => ({ ...s, [k]: v }))
  const { requestClose, guard } = useUnsavedGuard(f, onClose)

  const save = () => {
    // Mantiene en suppliers[] los proveedores de servicio asignados (sin duplicar ni perder los demás).
    const serviceIds = [f.freightSupplierId, f.installSupplierId].filter(Boolean)
    const prevService = [project.freightSupplierId, project.installSupplierId].filter(Boolean) as string[]
    const suppliers = Array.from(new Set([
      ...project.suppliers.filter(id => !prevService.includes(id)),
      ...serviceIds,
    ])) as string[]
    dispatch({
      type: 'SAVE_PROJECT',
      project: {
        ...project,
        suppliers,
        freightSupplierId: f.freightSupplierId || undefined,
        freightCost: +f.freightCost || undefined,
        installSupplierId: f.installSupplierId || undefined,
        installCost: +f.installCost || undefined,
      },
    })
    onClose()
  }

  const costTotal = (+f.freightCost || 0) + (+f.installCost || 0)
  const budgetTotal = (project.freight || 0) + (project.install || 0)
  const overTotal = costTotal > budgetTotal && costTotal > 0
  // Diferencia desde la óptica del AHORRO: positiva (verde) si va dentro del presupuesto,
  // negativa (rojo) si se pasa.
  const savings = budgetTotal - costTotal

  return (
    <Modal width={560} icon="handshake" title="Asignar servicios" sub={`${project.code} · ${sel.clientName(state, project.client)}`} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} /> Guardar asignación</button>
      </>}>
      <div className="flex flex-col gap-3.5">
        <ServiceField title="Flete / transporte" cat={FLETE_CAT} suppliers={state.suppliers}
          supplierId={f.freightSupplierId} cost={f.freightCost} budget={project.freight || 0}
          onSupplier={v => set('freightSupplierId', v)} onCost={v => set('freightCost', v)} />
        <ServiceField title="Instalación (cuadrilla)" cat={INSTALL_CAT} suppliers={state.suppliers}
          supplierId={f.installSupplierId} cost={f.installCost} budget={project.install || 0}
          onSupplier={v => set('installSupplierId', v)} onCost={v => set('installCost', v)} />
        <div className="bg-bg-1 border border-line rounded-[8px] p-3 grid grid-cols-3 gap-2 text-center">
          <div><div className="label-k">Presupuesto total</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtMoney(budgetTotal)}</div></div>
          <div><div className="label-k">Costo asignado</div><div className="font-display font-bold text-[15px] mt-0.5" style={{ color: overTotal ? 'var(--danger)' : 'var(--acc)' }}>{fmtMoney(costTotal)}</div></div>
          <div><div className="label-k">Diferencia</div><div className="font-display font-bold text-[15px] mt-0.5" style={{ color: overTotal ? 'var(--danger)' : 'var(--ok)' }}>{savings > 0 ? '+' : ''}{fmtMoney(savings)}</div></div>
        </div>
        {overTotal && <div className="text-[11.5px] text-tx-2 leading-snug">⚠ El costo supera el presupuesto. El gasto real se descuenta de la utilidad cuando registres y marques como <b>Pagado</b> el pago interno correspondiente.</div>}
      </div>
      {guard}
    </Modal>
  )
}

export function AsignacionPage() {
  const { state } = useStore()
  const [assign, setAssign] = React.useState<Project | null>(null)
  const [f, setF] = React.useState('')   // '', 'sin', 'over'

  // El presupuesto y el costo asignado de cada proyecto.
  const rows = state.projects
    .map(p => {
      const budget = (p.freight || 0) + (p.install || 0)
      const cost = sel.projectServiciosCost(state, p)
      const assigned = !!(p.freightSupplierId || p.installSupplierId || cost > 0)
      const over = cost > 0 && budget > 0 && cost > budget
      return { p, budget, cost, assigned, over }
    })
    .filter(r => f === '' ? true : f === 'sin' ? !r.assigned : r.over)
    .sort((a, b) => (a.p.created < b.p.created ? 1 : -1))

  const totalBudget = state.projects.reduce((a, p) => a + (p.freight || 0) + (p.install || 0), 0)
  const totalCost = state.projects.reduce((a, p) => a + sel.projectServiciosCost(state, p), 0)
  const overCount = state.projects.filter(p => { const b = (p.freight || 0) + (p.install || 0); const c = sel.projectServiciosCost(state, p); return c > 0 && b > 0 && c > b }).length
  const sinAsignar = state.projects.filter(p => !(p.freightSupplierId || p.installSupplierId)).length

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Asignación de servicios</h2><span className="sub">Flete e instalación · presupuesto vs costo real</span></div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-4">
        <KPI label="Presupuesto total" value={totalBudget} format={fmtMoney} icon="money" />
        <KPI label="Costo asignado" value={totalCost} format={fmtMoney} icon="handshake" accent />
        <KPI label="Sin asignar" value={sinAsignar} icon="alert" />
        <KPI label="Sobre presupuesto" value={overCount} icon="alert" foot={overCount > 0 ? 'Revisar costo' : undefined} footTrend="dn" />
      </div>

      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        <span className="label-k">Filtrar:</span>
        <div className="seg">
          <button className={!f ? 'on' : ''} onClick={() => setF('')}>Todos</button>
          <button className={f === 'sin' ? 'on' : ''} onClick={() => setF('sin')}>Sin asignar</button>
          <button className={f === 'over' ? 'on' : ''} onClick={() => setF('over')}>Sobre presupuesto</button>
        </div>
        <span className="meta">{rows.length} de {state.projects.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Proyecto</th><th>Cliente</th><th>Etapa</th><th>Flete</th><th>Instalación</th><th className="num">Presupuesto</th><th className="num">Costo</th><th className="num">Dif.</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ p, budget, cost, over }) => {
                const fSup = p.freightSupplierId ? sel.supplier(state, p.freightSupplierId) : undefined
                const iSup = p.installSupplierId ? sel.supplier(state, p.installSupplierId) : undefined
                return (
                <tr key={p.id} onClick={() => setAssign(p)}>
                  <td><span className="mono text-acc font-semibold">{p.code}</span></td>
                  <td className="text-[12.5px]">{sel.clientName(state, p.client)}</td>
                  <td><StageBadge stage={p.stage} /></td>
                  <td className="text-[12px]">{fSup ? fSup.name : <span className="text-tx-3">—</span>}{p.freightCost ? <div className="meta mono">{fmtMoney(p.freightCost)}</div> : null}</td>
                  <td className="text-[12px]">{iSup ? iSup.name : <span className="text-tx-3">—</span>}{p.installCost ? <div className="meta mono">{fmtMoney(p.installCost)}</div> : null}</td>
                  <td className="num text-[12px]">{fmtMoney(budget)}</td>
                  <td className="num text-[12px] font-semibold">{cost > 0 ? fmtMoney(cost) : <span className="text-tx-3">—</span>}</td>
                  <td className="num text-[12px]" style={{ color: cost > 0 ? (over ? 'var(--danger)' : 'var(--ok)') : 'var(--tx-3)' }}>{cost > 0 ? `${budget - cost > 0 ? '' : ''}${fmtMoney(budget - cost)}` : '—'}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setAssign(p) }}><Icon name="edit" size={13} /> Asignar</button></td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="handshake">Sin proyectos que coincidan</Empty>}
      </div>

      {assign && <AssignForm project={state.projects.find(x => x.id === assign.id)!} onClose={() => setAssign(null)} />}
    </div>
  )
}
