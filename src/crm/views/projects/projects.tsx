// ============================================================
//  PROJECTS — Kanban board (drag + menu) + Table view
// ============================================================
import * as React from 'react'
import { useStore, sel, STAGES, STAGE_MAP, stageIndex, fmtMoney, fmtK, fmtDateShort, daysBetween, docCount, cityAbbr } from '../../core/data'
import type { AppState } from '../../core/types'
import { StageBadge, Seg, Empty, Badge, Avatar, Select } from '../../core/ui'
import { ProjectDetail, ProjectForm } from './project_views'
import { Icon } from '../../core/icons'
import type { Project, StageId } from '../../core/types'

/* ---------- Kanban card ---------- */
function KanbanCard({ p, onOpen, onDragStart, onDragEnd, dragging, draggable = true }: {
  p: Project
  onOpen: (p: Project) => void
  onDragStart: (p: Project) => void
  onDragEnd: () => void
  dragging: boolean
  draggable?: boolean
}) {
  const { state } = useStore()
  const client = sel.client(state, p.client)
  const seller = sel.seller(state, p.seller)
  const eta = daysBetween(p.eta) as number
  const dc = docCount(p)
  const stage = STAGE_MAP[p.stage]
  return (
    <div draggable={draggable}
      onDragStart={(e) => { if (!draggable) return; e.dataTransfer.effectAllowed = 'move'; onDragStart(p) }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(p)}
      className="kan-card bg-bg-2 border border-line-2 py-[11px] px-3 cursor-pointer shadow-[var(--shadow-1)]"
      style={{ borderLeft: `3px solid ${stage.color}`, opacity: dragging ? 0.4 : 1, transition: 'transform .1s, box-shadow .1s' }}>
      <div className="flex justify-between items-center gap-2">
        <span className="mono text-[11px] text-acc font-semibold">{p.code}</span>
        <Avatar name={seller ? seller.name : ''} size={20} />
      </div>
      <div className="font-semibold text-[13.5px] mt-[7px] leading-[1.3]">{client ? client.name : '—'}</div>
      <div className="meta mt-[3px] flex items-center gap-1"><Icon name="pin" size={11} className="opacity-50" />{p.city}</div>

      <div className="flex justify-between items-center mt-[11px]">
        <span className="font-display font-bold text-[15px]">{fmtK(sel.budget(p))}</span>
        <span className="meta">{p.weeks} sem</span>
      </div>

      <div className="flex items-center gap-2 mt-2.5 pt-[9px] border-t border-line-soft">
        {/* doc completeness */}
        <span title={`${dc.done}/${dc.total} documentos`} className="flex gap-0.5">
          {[0,1,2,3].map(i => <span key={i} className="w-[7px] h-[7px] border border-line-2" style={{ background: i < dc.done ? stage.color : 'transparent' }}></span>)}
        </span>
        <span className="flex-1"></span>
        {p.eta && eta != null && (
          <span className="mono text-[10.5px] flex items-center gap-[3px]" style={{ color: eta < 0 ? 'var(--danger)' : eta < 7 ? 'var(--warn)' : 'var(--tx-2)' }}>
            <Icon name="calendar" size={11} />{eta < 0 ? `${-eta}d` : eta + 'd'}
          </span>
        )}
        {p.finiquito === 'paid' && <Icon name="money" size={13} className="text-ok" />}
      </div>
    </div>
  )
}

/* ---------- Kanban board ---------- */
export function Kanban({ projects, onOpen, canMove = true }: { projects: Project[]; onOpen: (p: Project) => void; canMove?: boolean }) {
  const { dispatch } = useStore()
  const [drag, setDrag] = React.useState<Project | null>(null)
  const [over, setOver] = React.useState<StageId | null>(null)

  const cols = STAGES.map(s => ({ stage: s, items: projects.filter(p => p.stage === s.id) }))
  const drop = (stageId: StageId) => {
    if (canMove && drag && drag.stage !== stageId) dispatch({ type: 'MOVE_STAGE', id: drag.id, stage: stageId })
    setDrag(null); setOver(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 min-h-[400px]">
      {cols.map(({ stage, items }) => {
        const total = items.reduce((a, p) => a + sel.budget(p), 0)
        const isOver = over === stage.id
        return (
          <div key={stage.id}
            onDragOver={(e) => { e.preventDefault(); setOver(stage.id) }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null) }}
            onDrop={() => drop(stage.id)}
            className="w-[244px] flex-none flex flex-col">
            {/* column header */}
            <div className="bg-bg-1 py-[9px] px-[11px] border border-line" style={{ borderTop: `2px solid ${stage.color}` }}>
              <div className="flex items-center gap-[7px]">
                <span className="font-mono text-[10px] font-bold" style={{ color: stage.color }}>{String(stage.n).padStart(2,'0')}</span>
                <span className="font-bold text-[12.5px] font-display flex-1">{stage.short}</span>
                <span className="mono text-[11px] text-tx-2 bg-bg-3 py-px px-[7px]">{items.length}</span>
              </div>
              {total > 0 && <div className="mono text-[10px] text-tx-3 mt-1">{fmtK(total)}</div>}
            </div>
            {/* drop zone */}
            <div className="flex-1 flex flex-col gap-[9px] p-[9px] border border-line border-t-0 min-h-[120px]"
              style={{
                background: isOver ? 'var(--acc-ghost)' : 'var(--bg-0)',
                outline: isOver ? '1px dashed var(--acc)' : 'none', outlineOffset: -4,
                transition: 'background .12s',
              }}>
              {items.length === 0 && <div className="text-center text-tx-3 text-[11px] py-6 font-mono">— vacío —</div>}
              {items.map(p => (
                <KanbanCard key={p.id} p={p} onOpen={onOpen} draggable={canMove}
                  dragging={!!drag && drag.id === p.id}
                  onDragStart={setDrag} onDragEnd={() => { setDrag(null); setOver(null) }} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Table view ---------- */
const provName = (state: AppState, p: Project) =>
  p.suppliers.map(id => sel.supplier(state, id)?.name).filter(Boolean).join(', ') || 'Sin asignar'

function ProjectsTable({ projects, onOpen }: { projects: Project[]; onOpen: (p: Project) => void }) {
  const { state } = useStore()
  const [sort, setSort] = React.useState<{ key: string; dir: number }>({ key: 'updated', dir: -1 })
  const [cf, setCf] = React.useState({ proyecto: '', cliente: '', sistema: '', ciudad: '', etapa: '', proveedor: '', liquidado: '' })

  const sortBtn = (key: string, label: string, cls?: string) => (
    <th className={'sortable ' + (cls || '')} onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
      {label}{sort.key === key && <span className="text-acc"> {sort.dir > 0 ? '▲' : '▼'}</span>}
    </th>
  )
  // celda de filtro (no sticky, para no encimar el encabezado)
  const fth = (k?: keyof typeof cf) => (
    <th style={{ position: 'static' }}>
      {k && <input value={cf[k]} onChange={e => setCf(s => ({ ...s, [k]: e.target.value }))} placeholder="buscar…"
        className="w-full bg-bg-2 border border-line-2 rounded-[6px] px-2 py-1 text-[11.5px] font-normal outline-none focus:border-acc" />}
    </th>
  )

  const liquidado = (p: Project) => (p.finiquito === 'paid' ? 'Liquidado' : 'Pendiente')
  const has = (val: string, q: string) => !q || val.toLowerCase().includes(q.toLowerCase())

  const rows = projects.filter(p =>
    has(p.code, cf.proyecto) &&
    has(sel.clientName(state, p.client), cf.cliente) &&
    has(p.sistemaVendido || '', cf.sistema) &&
    has(cityAbbr(p.city) + ' ' + p.city, cf.ciudad) &&
    has(STAGE_MAP[p.stage]?.label || '', cf.etapa) &&
    has(provName(state, p), cf.proveedor) &&
    has(liquidado(p), cf.liquidado),
  ).sort((a, b) => {
    let va: string | number, vb: string | number
    switch (sort.key) {
      case 'client': va = sel.clientName(state, a.client); vb = sel.clientName(state, b.client); break
      case 'stage': va = stageIndex(a.stage); vb = stageIndex(b.stage); break
      case 'eta': va = a.eta || '9999'; vb = b.eta || '9999'; break
      case 'sistema': va = a.sistemaVendido || ''; vb = b.sistemaVendido || ''; break
      case 'freight': va = a.freight; vb = b.freight; break
      case 'install': va = a.install; vb = b.install; break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      default: va = (a as any)[sort.key] || ''; vb = (b as any)[sort.key] || ''
    }
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir
  })

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {sortBtn('code', 'Proyecto')}
              {sortBtn('client', 'Cliente')}
              {sortBtn('sistema', 'Sistema vendido')}
              <th>Ciudad</th>
              {sortBtn('stage', 'Estatus / Etapa')}
              <th>Proveedor</th>
              {sortBtn('freight', 'Pres. flete', 'num')}
              {sortBtn('install', 'Pres. instalación', 'num')}
              {sortBtn('eta', 'Entrega est.')}
              <th>Liquidado</th>
              <th>Docs</th>
              {sortBtn('updated', 'Actualizado', 'num')}
            </tr>
            <tr>
              {fth('proyecto')}{fth('cliente')}{fth('sistema')}{fth('ciudad')}{fth('etapa')}{fth('proveedor')}
              {fth()}{fth()}{fth()}{fth('liquidado')}{fth()}{fth()}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const eta = daysBetween(p.eta) as number; const dc = docCount(p); const prov = provName(state, p)
              return (
                <tr key={p.id} onClick={() => onOpen(p)}>
                  <td><span className="mono text-acc font-semibold">{p.code}</span></td>
                  <td>{sel.clientName(state, p.client)}</td>
                  <td className="text-tx-1 text-[12.5px]">{p.sistemaVendido || '—'}</td>
                  <td className="text-tx-1"><span title={p.city}>{cityAbbr(p.city)}</span></td>
                  <td><StageBadge stage={p.stage} size="sm" /></td>
                  <td className="text-[12.5px]" style={prov === 'Sin asignar' ? { color: 'var(--tx-3)' } : undefined}>{prov}</td>
                  <td className="num">{fmtMoney(p.freight)}</td>
                  <td className="num">{fmtMoney(p.install)}</td>
                  <td className="num">{p.eta ? <span style={{ color: eta < 0 ? 'var(--danger)' : eta < 7 ? 'var(--warn)' : 'var(--tx-1)' }}>{fmtDateShort(p.eta)}</span> : <span className="text-tx-3">—</span>}</td>
                  <td>{p.finiquito === 'paid' ? <Badge color="var(--ok)">Liquidado</Badge> : <Badge color="var(--warn)">Pendiente</Badge>}</td>
                  <td><span className="mono text-[11px]" style={{ color: dc.done === dc.total ? 'var(--ok)' : 'var(--tx-2)' }}>{dc.done}/{dc.total}</span></td>
                  <td className="num text-tx-2 text-[12px]">{fmtDateShort(p.updated)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <Empty icon="projects">Sin proyectos que coincidan con los filtros</Empty>}
    </div>
  )
}

/* ---------- Projects page ---------- */
export function ProjectsPage() {
  const { state } = useStore()
  const me = state.currentUser
  const isVentas = me?.role === 'ventas'
  // Ventas solo ve SUS proyectos (donde es el vendedor).
  const mine = isVentas ? state.projects.filter(p => p.seller === me!.id) : state.projects
  const [view, setView] = React.useState('kanban')
  const [detail, setDetail] = React.useState<Project | null>(null)
  const [form, setForm] = React.useState<object | null>(null) // {} para nuevo
  const [editing, setEditing] = React.useState(false)
  const [f, setF] = React.useState({ q: '', stage: '', client: '', supplier: '' })

  const filtered = mine.filter(p => {
    if (f.stage && p.stage !== f.stage) return false
    if (f.client && p.client !== f.client) return false
    if (f.supplier && !p.suppliers.includes(f.supplier)) return false
    if (f.q) {
      const hay = (p.code + ' ' + sel.clientName(state, p.client) + ' ' + p.city).toLowerCase()
      if (!hay.includes(f.q.toLowerCase())) return false
    }
    return true
  })

  const openDetail = (p: Project) => { setDetail(p); setEditing(false) }
  const hasFilters = f.stage || f.client || f.supplier || f.q

  return (
    <div>
      <div className="spread mb-[18px] flex-wrap">
        <div className="sec-title m-0">
          <h2>Proyectos</h2>
          <span className="sub">{filtered.length} de {mine.length}</span>
        </div>
        <div className="flex gap-2.5 items-center">
          <Seg value={view} onChange={setView} options={[{ value: 'kanban', icon: 'kanban', label: 'Tablero' }, { value: 'table', icon: 'list', label: 'Tabla' }]} />
          <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Registrar venta</button>
        </div>
      </div>

      {/* filters */}
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <div className="relative flex-[1_1_240px] max-w-[320px]">
          <Icon name="search" size={15} className="absolute left-[11px] top-2.5 text-tx-3" />
          <input className="input pl-[34px]" placeholder="Buscar código, cliente, ciudad…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        </div>
        <Select value={f.stage} onChange={e => setF({ ...f, stage: e.target.value })} className="w-auto min-w-[150px]">
          <option value="">Todas las etapas</option>
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Select value={f.client} onChange={e => setF({ ...f, client: e.target.value })} className="w-auto min-w-[150px]">
          <option value="">Todos los clientes</option>
          {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} className="w-auto min-w-[150px]">
          <option value="">Todos los proveedores</option>
          {state.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={() => setF({ q: '', stage: '', client: '', supplier: '' })}><Icon name="close" size={13} /> Limpiar</button>}
      </div>

      {view === 'kanban' ? <Kanban projects={filtered} onOpen={openDetail} canMove={!isVentas} /> : <ProjectsTable projects={filtered} onOpen={openDetail} />}

      {detail && !editing && <ProjectDetail project={detail} onClose={() => setDetail(null)} onEdit={() => setEditing(true)} />}
      {detail && editing && <ProjectForm project={state.projects.find(x => x.id === detail.id)} onClose={() => { setEditing(false) }} />}
      {form && <ProjectForm onClose={() => setForm(null)} />}
    </div>
  )
}
