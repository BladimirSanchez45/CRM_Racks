// ============================================================
//  DASHBOARD — KPIs, pipeline chart, activity, alerts
// ============================================================
import * as React from 'react'
import { useStore, sel, STAGES, stageIndex, fmtMoney, fmtK, fmtDate, daysBetween, ago, docCount, TODAY, TODAY_ISO, MESES_L, isAdminRole, isSalesManager } from '../../core/data'
import { KPI, StageBadge, Badge, SecTitle, Empty } from '../../core/ui'
import { WarehouseLoadCard, WarehouseDashboard } from '../warehouse/warehouse'
import { Icon, type IconName } from '../../core/icons'
import type { Activity, AppState, Project, StageId } from '../../core/types'

function PipelineChart({ projects, onPick }: { projects: Project[]; onPick?: (stageId: StageId) => void }) {
  const counts = STAGES.map(s => ({ s, n: projects.filter(p => p.stage === s.id).length, v: projects.filter(p => p.stage === s.id).reduce((a, p) => a + sel.budget(p), 0) }))
  const max = Math.max(1, ...counts.map(c => c.n))
  return (
    <div className="flex flex-col gap-[7px]">
      {counts.map(({ s, n, v }) => (
        <div key={s.id} onClick={() => onPick && onPick(s.id)} className="pipe-row flex items-center gap-3 cursor-pointer">
          <div className="w-[150px] flex-none flex items-center gap-2">
            <span className="mono text-[10px] font-bold w-4" style={{ color: s.color }}>{String(s.n).padStart(2,'0')}</span>
            <span className="text-[12px] text-tx-1 overflow-hidden text-ellipsis whitespace-nowrap">{s.short}</span>
          </div>
          <div className="flex-1 h-[22px] bg-bg-1 border border-line relative">
            <div className="h-full opacity-85" style={{ width: `${(n / max) * 100}%`, background: s.color, minWidth: n ? 3 : 0, transition: 'width .5s ease' }}></div>
            {v > 0 && <span className="mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,.65)' }}>{fmtK(v)}</span>}
          </div>
          <span className="mono w-[22px] text-right text-[13px] font-semibold" style={{ color: n ? 'var(--tx-0)' : 'var(--tx-3)' }}>{n}</span>
        </div>
      ))}
    </div>
  )
}

function ActivityFeed({ activity }: { activity: Activity[] }) {
  const kindColor: Record<string, string> = { done: 'var(--ok)', money: 'var(--ok)', new: 'var(--acc)', work: 'var(--st-4)', info: 'var(--st-5)' }
  return (
    <div className="flex flex-col">
      {activity.slice(0, 8).map((a, i) => (
        <div key={a.id} className={'flex gap-3 py-[11px] px-0' + (i < 7 ? ' border-b border-line-soft' : '')}>
          <span className="w-[30px] h-[30px] flex-none grid place-items-center bg-bg-1 border border-line-2" style={{ color: kindColor[a.kind] || 'var(--tx-2)' }}>
            <Icon name={a.icon} size={15} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] leading-[1.4]">
              <strong className="font-semibold">{a.who}</strong> <span className="text-tx-1">{a.txt}</span> <span className="mono text-acc text-[11.5px]">{a.tgt}</span>
            </div>
            <div className="meta mt-0.5">{ago(a.t)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface AlertItem { p: Project; kind: 'danger' | 'warn' | 'info'; icon: IconName; txt: string }

function Alerts({ projects, state, onOpen }: { projects: Project[]; state: AppState; onOpen: (p: Project) => void }) {
  const overdue = projects.filter(p => p.stage !== 'finalizado' && p.eta && (daysBetween(p.eta) as number) < 0)
  const pendingPay = projects.filter(p => p.stage !== 'finalizado' && p.finiquito === 'pending' && stageIndex(p.stage) >= 4)
  const missingDocs = projects.filter(p => p.stage !== 'finalizado' && p.stage !== 'registro' && docCount(p).done < docCount(p).total)

  const items: AlertItem[] = [
    ...overdue.map((p): AlertItem => ({ p, kind: 'danger', icon: 'alert', txt: `ETA vencida hace ${-(daysBetween(p.eta) as number)} días` })),
    ...pendingPay.map((p): AlertItem => ({ p, kind: 'warn', icon: 'money', txt: 'Finiquito pendiente del cliente' })),
    ...missingDocs.map((p): AlertItem => ({ p, kind: 'info', icon: 'doc', txt: `Documentos incompletos (${docCount(p).done}/${docCount(p).total})` })),
  ]
  const cmap: Record<string, string> = { danger: 'var(--danger)', warn: 'var(--warn)', info: 'var(--st-5)' }

  if (items.length === 0) return <Empty icon="check">Sin alertas — todo en orden</Empty>
  return (
    <div className="flex flex-col gap-2">
      {items.slice(0, 6).map((it, i) => (
        <div key={i} onClick={() => onOpen(it.p)} className="flex items-center gap-[11px] py-[10px] px-3 bg-bg-1 border border-line cursor-pointer" style={{ borderLeft: `3px solid ${cmap[it.kind]}` }}>
          <span style={{ color: cmap[it.kind] }}><Icon name={it.icon} size={16} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px]">{it.txt}</div>
            <div className="meta mt-px"><span className="mono text-acc">{it.p.code}</span> · {sel.clientName(state, it.p.client) || ''}</div>
          </div>
          <Icon name="chevron" size={15} className="text-tx-3" />
        </div>
      ))}
    </div>
  )
}

// Paleta estable para las barras por vendedor (mismo orden = mismo color).
const SELLER_PALETTE = ['#2f6feb', '#14b8a6', '#f59e0b', '#c084fc', '#f472b6', '#38bdf8', '#34d399', '#fb7185']

/** Meta de ventas del mes: avance del equipo contra la meta (editable por mes),
 *  meta personal (meta ÷ vendedores) con el avance de cada uno, y proyección
 *  con lo que está por cerrar. Se recalcula con cada registro de venta
 *  (proyecto creado en el mes, por su subtotal). */
function SalesGoalCard() {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const canEdit = isAdminRole(me?.role) || isSalesManager(me)
  const monthPrefix = TODAY_ISO.slice(0, 7)
  const monthName = MESES_L[TODAY.getMonth()]
  const meta = sel.salesGoal(state, monthPrefix)

  // Vendedores que participan de la meta (todo el equipo, gerentes incluidos).
  const vendedores = sel.vendedoresMeta(state)
  const idsVendedores = new Set(vendedores.map(v => v.id))
  // Meta personal: la meta del mes repartida en partes iguales entre el equipo.
  const metaPersonal = vendedores.length > 0 ? meta / vendedores.length : 0

  // Vendido del mes: proyectos REGISTRADOS este mes (fecha de alta) por los
  // vendedores participantes, por su subtotal de venta.
  const ventasMes = state.projects.filter(p => p.created.startsWith(monthPrefix) && idsVendedores.has(p.seller))
  const vendido = ventasMes.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)

  // Por cerrar: prospectos cotizados o en negociación sin desenlace, más los ya
  // marcados Vendido que todavía no se registran como proyecto.
  const abiertos = state.prospects.filter(pr => idsVendedores.has(pr.seller) && (
    (pr.resultado === 'En espera' && (pr.estado === 'Cotizado' || pr.estado === 'Negociación')) ||
    (pr.resultado === 'Vendido' && !pr.convertedProjectId)))
  const porCerrar = abiertos.reduce((a, pr) => a + (pr.costo || 0), 0)

  const falta = Math.max(0, meta - vendido)
  const proyeccion = vendido + porCerrar
  const pctVendido = meta > 0 ? (vendido / meta) * 100 : 0
  const pctProyeccion = meta > 0 ? (proyeccion / meta) * 100 : 0

  const porVendedor = vendedores
    .map(v => {
      const mias = ventasMes.filter(p => p.seller === v.id)
      return { v, n: mias.length, total: mias.reduce((a, p) => a + (p.ventaSubtotal || 0), 0) }
    })
    .sort((a, b) => b.total - a.total)

  // Edición de la meta DEL MES en curso (solo admin); los meses pasados
  // conservan la suya. Se guarda en app_settings y sincroniza para todos.
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const saveGoal = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ''))
    if (n > 0 && n !== meta) dispatch({ type: 'SAVE_SALES_GOAL', month: monthPrefix, goal: n })
    setEditing(false)
  }

  return (
    <div className="card">
      <div className="card-h">
        <Icon name="trendUp" size={17} className="text-ok" />
        <span className="ttl">Meta de ventas · {monthName}</span>
        <span className="flex-1"></span>
        {editing ? (
          <span className="flex items-center gap-1.5">
            <input autoFocus className="input mono text-[12px] w-[120px] py-1 px-2" value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditing(false) }} />
            <button className="btn btn-ghost btn-sm" onClick={saveGoal}><Icon name="check" size={13} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}><Icon name="close" size={13} /></button>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="sub">Meta <span className="mono font-semibold text-tx-0">{fmtK(meta)}</span> · <span className="mono">{fmtK(metaPersonal)}</span> c/u</span>
            {canEdit && <button className="btn btn-ghost btn-sm" title={`Editar la meta de ${monthName}`} onClick={() => { setDraft(String(meta)); setEditing(true) }}><Icon name="edit" size={13} /></button>}
          </span>
        )}
      </div>
      <div className="card-b">
        {/* Avance contra la meta: vendido (sólido) + por cerrar (tenue) */}
        <div className="h-[28px] bg-bg-1 border border-line relative overflow-hidden">
          <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, pctProyeccion)}%`, background: 'var(--acc)', opacity: .28, transition: 'width .6s ease' }}></div>
          <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, pctVendido)}%`, background: 'var(--ok)', opacity: .9, transition: 'width .6s ease' }}></div>
          <span className="mono absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,.65)' }}>{pctVendido.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-4 mt-2 mb-3 text-[11.5px] text-tx-2">
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--ok)' }}></span>Vendido</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--acc)', opacity: .45 }}></span>Por cerrar ({abiertos.length} prospectos)</span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-bg-1 border border-line py-2 px-3">
            <div className="meta">Vendido</div>
            <div className="mono text-[14px] font-semibold" style={{ color: 'var(--ok)' }}>{fmtMoney(vendido)}</div>
          </div>
          <div className="bg-bg-1 border border-line py-2 px-3">
            <div className="meta">Falta para la meta</div>
            <div className="mono text-[14px] font-semibold" style={{ color: falta > 0 ? 'var(--warn)' : 'var(--ok)' }}>{falta > 0 ? fmtMoney(falta) : '¡Meta cumplida!'}</div>
          </div>
          <div className="bg-bg-1 border border-line py-2 px-3">
            <div className="meta">Proyección con por cerrar</div>
            <div className="mono text-[14px] font-semibold" style={{ color: proyeccion >= meta ? 'var(--ok)' : 'var(--tx-0)' }}>{fmtMoney(proyeccion)} <span className="text-[11px] text-tx-2 font-normal">({pctProyeccion.toFixed(0)}%)</span></div>
          </div>
        </div>

        {/* Avance de cada vendedor contra su meta personal (meta ÷ equipo) */}
        <div className="meta mb-2">Meta personal: <span className="mono font-semibold text-tx-1">{fmtMoney(metaPersonal)}</span> por vendedor ({vendedores.length})</div>
        <div className="flex flex-col gap-2">
          {porVendedor.map((r, i) => {
            const pct = metaPersonal > 0 ? (r.total / metaPersonal) * 100 : 0
            const cumplio = metaPersonal > 0 && r.total >= metaPersonal
            return (
              <div key={r.v.id} className="flex items-center gap-3">
                <div className="w-[110px] flex-none text-[12.5px] text-tx-1 truncate" title={r.v.name}>{r.v.name}</div>
                <div className="flex-1 h-[20px] bg-bg-1 border border-line relative overflow-hidden">
                  <div className="h-full opacity-90" style={{ width: `${Math.min(100, pct)}%`, background: cumplio ? 'var(--ok)' : SELLER_PALETTE[i % SELLER_PALETTE.length], minWidth: r.total ? 3 : 0, transition: 'width .5s ease' }}></div>
                  <span className="mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-tx-2">{pct.toFixed(0)}%</span>
                </div>
                <div className="w-[180px] flex-none text-right leading-tight">
                  <div className="text-[12px]">
                    <span className="mono font-semibold" style={{ color: r.total ? 'var(--tx-0)' : 'var(--tx-3)' }}>{fmtK(r.total)}</span>
                    <span className="text-tx-3 text-[10.5px]"> / {fmtK(metaPersonal)} · {r.n} venta{r.n === 1 ? '' : 's'}</span>
                  </div>
                  <div className="meta" style={cumplio ? { color: 'var(--ok)' } : undefined}>{cumplio ? '¡Meta cumplida!' : `faltan ${fmtK(metaPersonal - r.total)}`}</div>
                </div>
              </div>
            )
          })}
          {porVendedor.length === 0 && <Empty icon="trendUp">Sin vendedores registrados</Empty>}
        </div>
      </div>
    </div>
  )
}

export function DashboardPage({ onNavigate, onOpenProject }: { onNavigate: (route: string) => void; onOpenProject: (p: Project) => void }) {
  const { state } = useStore()
  const me = state.currentUser
  const isVentas = me?.role === 'ventas'
  // ALMACÉN tiene su propio panel: el general le mostraría el pipeline con
  // montos, alertas de cobranza y actividad de pagos, que no le competen.
  const isAlmacen = me?.role === 'almacen'
  // Ventas: el panel se limita a SUS proyectos (y a la actividad sobre ellos).
  const myProjects = isVentas ? state.projects.filter(p => p.seller === me!.id) : state.projects
  const active = myProjects.filter(p => p.stage !== 'finalizado')
  const revenue = myProjects.filter(p => p.stage === 'finalizado').reduce((a, p) => a + sel.budget(p), 0)
  const pendingPay = active.filter(p => p.finiquito === 'pending' && stageIndex(p.stage) >= 4).reduce((a, p) => a + sel.budget(p), 0)
  const monthPrefix = TODAY_ISO.slice(0, 7)
  const monthName = MESES_L[TODAY.getMonth()].toLowerCase()
  const finishingThisMonth = active.filter(p => p.eta && p.eta.startsWith(monthPrefix))
  const pipelineValue = active.reduce((a, p) => a + sel.budget(p), 0)
  const myCodes = new Set(myProjects.map(p => p.code))
  const myActivity = isVentas ? state.activity.filter(a => myCodes.has(a.tgt)) : state.activity

  if (isAlmacen) return <WarehouseDashboard onNavigate={onNavigate} />

  const pipelineCard = (
    <div className="card">
      <div className="card-h">
        <Icon name="kanban" size={17} className="text-acc" />
        <span className="ttl">Pipeline por etapa</span>
        <span className="flex-1"></span>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('projects')}>Ver tablero <Icon name="arrowRight" size={13} /></button>
      </div>
      <div className="card-b"><PipelineChart projects={myProjects} onPick={() => onNavigate('projects')} /></div>
    </div>
  )

  return (
    <div>
      <SecTitle title="Panel general"  />

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <KPI label="Proyectos activos" value={active.length} icon="projects" accent foot={`${fmtK(pipelineValue)} en pipeline`} delay={0} />
        <KPI label="Ingresos cerrados" value={revenue} format={fmtMoney} icon="money" foot="Acumulado finalizados" delay={60} />
        <KPI label="Pagos pendientes" value={pendingPay} format={fmtMoney} icon="alert" foot={`${active.filter(p => p.finiquito === 'pending' && stageIndex(p.stage) >= 4).length} finiquitos por cobrar`} footTrend="dn" delay={120} />
        <KPI label="Entregas este mes" value={finishingThisMonth.length} icon="calendar" foot={`Con ETA en ${monthName}`} delay={180} />
      </div>

      {/* Carga de almacén: es lo que ventas usa para calcular fechas realistas. */}
      <div className="mb-4"><WarehouseLoadCard /></div>

      {/* Meta de ventas: a ventas le sustituye Alertas y Actividad (equipo completo,
          no se filtra por vendedor: es el marcador compartido del mes). */}
      {isVentas ? (
        <div className="grid grid-cols-[1.4fr_1fr] gap-4 mb-4">
          <SalesGoalCard />
          {pipelineCard}
        </div>
      ) : (
        <>
          <div className="mb-4"><SalesGoalCard /></div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-4 mb-4">
            {pipelineCard}
            {/* alerts */}
            <div className="card">
              <div className="card-h">
                <Icon name="bell" size={17} className="text-warn" />
                <span className="ttl">Alertas</span>
              </div>
              <div className="card-b"><Alerts projects={myProjects} state={state} onOpen={onOpenProject} /></div>
            </div>
          </div>
        </>
      )}

      <div className={isVentas ? '' : 'grid grid-cols-[1fr_1.4fr] gap-4'}>
        {/* activity (los vendedores no la ven: su espacio lo ocupa la meta de ventas) */}
        {!isVentas && <div className="card">
          <div className="card-h">
            <Icon name="layers" size={17} className="text-st-5" />
            <span className="ttl">Actividad reciente</span>
          </div>
          <div className="card-b pt-1 pb-1"><ActivityFeed activity={myActivity} /></div>
        </div>}

        {/* finishing this month */}
        <div className="card">
          <div className="card-h">
            <Icon name="flag" size={17} className="text-st-9" />
            <span className="ttl">Por entregar este mes</span>
            <span className="sub ml-auto">{finishingThisMonth.length} proyectos</span>
          </div>
          <div className="card-b p-0 max-h-[420px] overflow-y-auto">
            {finishingThisMonth.length === 0 ? <Empty icon="calendar">Sin entregas programadas este mes</Empty> : (
              <table className="tbl">
                <thead><tr><th>Proyecto</th><th>Cliente</th><th>Etapa</th><th>ETA</th><th>Finiquito</th></tr></thead>
                <tbody>
                  {finishingThisMonth.sort((a,b)=>a.eta<b.eta?-1:1).map(p => {
                    const d = daysBetween(p.eta) as number
                    return (
                      <tr key={p.id} onClick={() => onOpenProject(p)}>
                        <td><span className="mono text-acc font-semibold">{p.code}</span></td>
                        <td>{sel.clientName(state, p.client)}</td>
                        <td><StageBadge stage={p.stage} size="sm" /></td>
                        <td className="num" style={{ color: d < 0 ? 'var(--danger)' : d < 7 ? 'var(--warn)' : 'var(--tx-1)' }}>{fmtDate(p.eta)}</td>
                        <td>{p.finiquito === 'paid' ? <Badge color="var(--ok)">Pagado</Badge> : <Badge color="var(--warn)">Pendiente</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
