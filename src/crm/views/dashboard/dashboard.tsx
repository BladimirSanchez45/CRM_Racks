// ============================================================
//  DASHBOARD — KPIs, pipeline chart, activity, alerts
// ============================================================
import { useStore, sel, STAGES, stageIndex, fmtMoney, fmtK, fmtDate, daysBetween, ago, docCount } from '../../core/data'
import { KPI, StageBadge, Badge, SecTitle, Empty } from '../../core/ui'
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
  const missingDocs = projects.filter(p => p.stage !== 'finalizado' && p.stage !== 'registro' && docCount(p).done < 3)

  const items: AlertItem[] = [
    ...overdue.map((p): AlertItem => ({ p, kind: 'danger', icon: 'alert', txt: `ETA vencida hace ${-(daysBetween(p.eta) as number)} días` })),
    ...pendingPay.map((p): AlertItem => ({ p, kind: 'warn', icon: 'money', txt: 'Finiquito pendiente del cliente' })),
    ...missingDocs.map((p): AlertItem => ({ p, kind: 'info', icon: 'doc', txt: `Documentos incompletos (${docCount(p).done}/4)` })),
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

export function DashboardPage({ onNavigate, onOpenProject }: { onNavigate: (route: string) => void; onOpenProject: (p: Project) => void }) {
  const { state } = useStore()
  const active = state.projects.filter(p => p.stage !== 'finalizado')
  const revenue = state.projects.filter(p => p.stage === 'finalizado').reduce((a, p) => a + sel.budget(p), 0)
  const pendingPay = active.filter(p => p.finiquito === 'pending' && stageIndex(p.stage) >= 4).reduce((a, p) => a + sel.budget(p), 0)
  const finishingThisMonth = active.filter(p => p.eta && p.eta.startsWith('2026-06'))
  const pipelineValue = active.reduce((a, p) => a + sel.budget(p), 0)

  return (
    <div>
      <SecTitle title="Panel general"  />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <KPI label="Proyectos activos" value={active.length} icon="projects" accent foot={`${fmtK(pipelineValue)} en pipeline`} delay={0} />
        <KPI label="Ingresos cerrados" value={revenue} format={fmtMoney} icon="money" foot="Acumulado finalizados" delay={60} />
        <KPI label="Pagos pendientes" value={pendingPay} format={fmtMoney} icon="alert" foot={`${active.filter(p => p.finiquito === 'pending' && stageIndex(p.stage) >= 4).length} finiquitos por cobrar`} footTrend="dn" delay={120} />
        <KPI label="Entregas este mes" value={finishingThisMonth.length} icon="calendar" foot="Con ETA en junio" delay={180} />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4 mb-4">
        {/* pipeline */}
        <div className="card">
          <div className="card-h">
            <Icon name="kanban" size={17} className="text-acc" />
            <span className="ttl">Pipeline por etapa</span>
            <span className="flex-1"></span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('projects')}>Ver tablero <Icon name="arrowRight" size={13} /></button>
          </div>
          <div className="card-b"><PipelineChart projects={state.projects} onPick={() => onNavigate('projects')} /></div>
        </div>

        {/* alerts */}
        <div className="card">
          <div className="card-h">
            <Icon name="bell" size={17} className="text-warn" />
            <span className="ttl">Alertas</span>
          </div>
          <div className="card-b"><Alerts projects={state.projects} state={state} onOpen={onOpenProject} /></div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1.4fr] gap-4">
        {/* activity */}
        <div className="card">
          <div className="card-h">
            <Icon name="layers" size={17} className="text-st-5" />
            <span className="ttl">Actividad reciente</span>
          </div>
          <div className="card-b pt-1 pb-1"><ActivityFeed activity={state.activity} /></div>
        </div>

        {/* finishing this month */}
        <div className="card">
          <div className="card-h">
            <Icon name="flag" size={17} className="text-st-9" />
            <span className="ttl">Por entregar este mes</span>
            <span className="sub ml-auto">{finishingThisMonth.length} proyectos</span>
          </div>
          <div className="card-b p-0">
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
