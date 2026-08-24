// ============================================================
//  METAS DE VENTA — desglose mensual por vendedor.
//  Vista del gerente de ventas (y admin/dirección): meta del mes
//  editable, avance por vendedor, participación, tendencia y
//  exportación a Excel. Navegable por mes para ver el histórico.
// ============================================================
import * as React from 'react'
import { useStore, sel, STAGES, fmtMoney, fmtK, fmtDateShort, TODAY_ISO, MESES, MESES_L, isAdminRole, isSalesManager } from '../../core/data'
import { KPI, SecTitle, Empty } from '../../core/ui'
import { Icon } from '../../core/icons'
import { exportVentasExcel } from '../../core/export_ventas'
import type { Project } from '../../core/types'

// Paleta estable por vendedor (mismo orden = mismo color en todas las gráficas).
const PALETTE = ['#2f6feb', '#14b8a6', '#f59e0b', '#c084fc', '#f472b6', '#38bdf8', '#34d399', '#fb7185']

/** Suma un delta de meses a un 'YYYY-MM'. */
const ymAdd = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const ymLabel = (ym: string) => `${MESES_L[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`

/** Dona SVG con leyenda: cada segmento proporcional a su valor. */
function Donut({ data, center, sub }: { data: { label: string; value: number; color: string }[]; center: string; sub?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  let acc = 0
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" width={150} height={150} className="flex-none">
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-1)" strokeWidth="15" />
        {total > 0 && data.filter(d => d.value > 0).map((d, i) => {
          const pct = (d.value / total) * 100
          const el = (
            <circle key={i} cx="50" cy="50" r="38" fill="none" stroke={d.color} strokeWidth="15"
              pathLength={100} strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acc}
              transform="rotate(-90 50 50)">
              <title>{`${d.label}: ${fmtMoney(d.value)} (${pct.toFixed(1)}%)`}</title>
            </circle>
          )
          acc += pct
          return el
        })}
        <text x="50" y="48" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--tx-0)">{center}</text>
        {sub && <text x="50" y="60" textAnchor="middle" fontSize="6" fill="var(--tx-2)">{sub}</text>}
      </svg>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {total === 0 ? <div className="meta">Sin datos este mes</div> : data.filter(d => d.value > 0).map((d, i) => {
          const pct = (d.value / total) * 100
          return (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="inline-block w-2.5 h-2.5 rounded-full flex-none" style={{ background: d.color }}></span>
              <span className="text-tx-1 truncate flex-1" title={d.label}>{d.label}</span>
              <span className="mono font-semibold">{fmtK(d.value)}</span>
              <span className="text-tx-3 text-[11px] w-[42px] text-right">{pct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SalesStatsPage({ onOpenProject }: { onOpenProject: (p: Project) => void }) {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const canEdit = isAdminRole(me?.role) || isSalesManager(me)
  const currentYm = TODAY_ISO.slice(0, 7)
  const [ym, setYm] = React.useState(currentYm)

  const vendedores = sel.vendedoresMeta(state)
  const idsVendedores = React.useMemo(() => new Set(vendedores.map(v => v.id)), [vendedores])

  // Primer mes con ventas registradas (piso de la navegación por mes).
  const minYm = React.useMemo(() => {
    const months = state.projects.filter(p => idsVendedores.has(p.seller)).map(p => p.created.slice(0, 7))
    return months.length ? months.reduce((a, b) => (a < b ? a : b)) : currentYm
  }, [state.projects, idsVendedores, currentYm])

  const meta = sel.salesGoal(state, ym)
  const metaPersonal = vendedores.length > 0 ? meta / vendedores.length : 0
  const isCurrent = ym === currentYm

  // Ventas del mes elegido: proyectos REGISTRADOS ese mes por el equipo, por su subtotal.
  const ventasMes = React.useMemo(() =>
    state.projects
      .filter(p => p.created.startsWith(ym) && idsVendedores.has(p.seller))
      .sort((a, b) => b.created.localeCompare(a.created)),
    [state.projects, ym, idsVendedores])
  const vendido = ventasMes.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)
  const falta = Math.max(0, meta - vendido)
  const nVentas = ventasMes.length
  const ticket = nVentas > 0 ? vendido / nVentas : 0
  const pctVendido = meta > 0 ? (vendido / meta) * 100 : 0

  // Por cerrar (solo tiene sentido en el mes en curso): prospectos cotizados o en
  // negociación sin desenlace, más los Vendido aún sin registrar como proyecto.
  const abiertos = isCurrent ? state.prospects.filter(pr => idsVendedores.has(pr.seller) && (
    (pr.resultado === 'En espera' && (pr.estado === 'Cotizado' || pr.estado === 'Negociación')) ||
    (pr.resultado === 'Vendido' && !pr.convertedProjectId))) : []
  const porCerrar = abiertos.reduce((a, pr) => a + (pr.costo || 0), 0)
  const proyeccion = vendido + porCerrar

  // Desglose por vendedor, ordenado por total (el orden fija el color en las gráficas).
  const porVendedor = React.useMemo(() => vendedores
    .map(v => {
      const mias = ventasMes.filter(p => p.seller === v.id)
      const total = mias.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)
      return { v, n: mias.length, total }
    })
    .sort((a, b) => b.total - a.total), [vendedores, ventasMes])
  const colorOf = (id: string) => PALETTE[Math.max(0, porVendedor.findIndex(r => r.v.id === id)) % PALETTE.length]

  // Ventas por sistema vendido (para la dona derecha).
  const porSistema = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const p of ventasMes) {
      const k = p.sistemaVendido?.trim() || 'Sin sistema'
      map.set(k, (map.get(k) || 0) + (p.ventaSubtotal || 0))
    }
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [ventasMes])

  // Tendencia: últimos 12 meses (o desde el primer mes con datos).
  const trend = React.useMemo(() => {
    const start = ymAdd(currentYm, -11) > minYm ? ymAdd(currentYm, -11) : minYm
    const months: string[] = []
    for (let m = start; m <= currentYm; m = ymAdd(m, 1)) months.push(m)
    return months.map(m => ({
      m,
      total: state.projects
        .filter(p => p.created.startsWith(m) && idsVendedores.has(p.seller))
        .reduce((a, p) => a + (p.ventaSubtotal || 0), 0),
      meta: sel.salesGoal(state, m),
    }))
  }, [state, currentYm, minYm, idsVendedores])
  const maxTrend = Math.max(1, ...trend.map(t => Math.max(t.total, t.meta)))

  // Edición de la meta del MES ELEGIDO (gerente de ventas y admin).
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const saveGoal = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ''))
    if (n > 0 && n !== meta) dispatch({ type: 'SAVE_SALES_GOAL', month: ym, goal: n })
    setEditing(false)
  }

  const exportar = () => exportVentasExcel({
    ym, ymLabel: ymLabel(ym), hoy: TODAY_ISO, meta, vendido,
    vendedores: porVendedor.map(r => ({
      vendedor: r.v.name, ventas: r.n, total: r.total,
      ticket: r.n > 0 ? r.total / r.n : 0, metaPersonal,
      pctMeta: metaPersonal > 0 ? (r.total / metaPersonal) * 100 : 0,
      pctEquipo: vendido > 0 ? (r.total / vendido) * 100 : 0,
    })),
    rows: ventasMes.map(p => ({
      fecha: p.created.slice(0, 10), proyecto: p.code,
      cliente: sel.clientName(state, p.client), vendedor: sel.sellerName(state, p.seller),
      sistema: p.sistemaVendido || '', origen: p.origen || '',
      etapa: STAGES.find(s => s.id === p.stage)?.short || p.stage,
      monto: p.ventaSubtotal || 0,
    })),
  })

  return (
    <div>
      <SecTitle title="Metas de venta" sub="Desglose mensual por vendedor" right={
        <div className="flex items-center gap-2">
          {/* Navegación por mes */}
          <button className="btn btn-ghost btn-sm" disabled={ym <= minYm} onClick={() => setYm(ymAdd(ym, -1))} title="Mes anterior">
            <Icon name="chevron" size={14} className="rotate-180" />
          </button>
          <span className="mono text-[12.5px] font-semibold w-[130px] text-center">{ymLabel(ym)}</span>
          <button className="btn btn-ghost btn-sm" disabled={ym >= currentYm} onClick={() => setYm(ymAdd(ym, 1))} title="Mes siguiente">
            <Icon name="chevron" size={14} />
          </button>
          {/* Meta del mes elegido */}
          {editing ? (
            <span className="flex items-center gap-1.5">
              <input autoFocus className="input mono text-[12px] w-[120px] py-1 px-2" value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditing(false) }} />
              <button className="btn btn-ghost btn-sm" onClick={saveGoal}><Icon name="check" size={13} /></button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}><Icon name="close" size={13} /></button>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="sub">Meta <span className="mono font-semibold text-tx-0">{fmtK(meta)}</span></span>
              {canEdit && <button className="btn btn-ghost btn-sm" title={`Editar la meta de ${ymLabel(ym)}`} onClick={() => { setDraft(String(meta)); setEditing(true) }}><Icon name="edit" size={13} /></button>}
            </span>
          )}
          <button className="btn btn-sm" onClick={() => void exportar()}><Icon name="download" size={14} /> Excel</button>
        </div>
      } />

      {/* KPIs del mes */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <KPI label="Meta del mes" value={meta} format={fmtMoney} icon="flag" accent foot={`${fmtK(metaPersonal)} por vendedor (${vendedores.length})`} delay={0} />
        <KPI label="Vendido" value={vendido} format={fmtMoney} icon="money" foot={`${pctVendido.toFixed(1)}% de la meta`} footTrend={pctVendido >= 100 ? 'up' : undefined} delay={60} />
        <KPI label={falta > 0 ? 'Falta para la meta' : 'Meta superada por'} value={falta > 0 ? falta : vendido - meta} format={fmtMoney} icon={falta > 0 ? 'alert' : 'check'} footTrend={falta > 0 ? 'dn' : 'up'} foot={isCurrent && porCerrar > 0 ? `Proyección ${fmtK(proyeccion)} con por cerrar` : falta > 0 ? 'Contra lo vendido' : '¡Felicidades al equipo!'} delay={120} />
        <KPI label="Ventas registradas" value={nVentas} icon="projects" foot={nVentas > 0 ? `Ticket promedio ${fmtK(ticket)}` : 'Sin ventas este mes'} delay={180} />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4 mb-4">
        {/* Vendido vs meta personal por vendedor */}
        <div className="card">
          <div className="card-h">
            <Icon name="trendUp" size={17} className="text-ok" />
            <span className="ttl">Vendido vs meta personal</span>
            <span className="sub ml-auto">meta personal {fmtK(metaPersonal)}</span>
          </div>
          <div className="card-b">
            {/* Equipo completo primero, como referencia */}
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-line-soft">
              <div className="w-[130px] flex-none text-[12.5px] font-semibold">EQUIPO</div>
              <div className="flex-1 h-[22px] bg-bg-1 border border-line relative overflow-hidden">
                {isCurrent && <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, meta > 0 ? (proyeccion / meta) * 100 : 0)}%`, background: 'var(--acc)', opacity: .28 }}></div>}
                <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, pctVendido)}%`, background: 'var(--ok)', opacity: .9, transition: 'width .5s ease' }}></div>
                <span className="mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-tx-2">{pctVendido.toFixed(0)}%</span>
              </div>
              <div className="w-[200px] flex-none text-right text-[12px]">
                <span className="mono font-semibold">{fmtMoney(vendido)}</span>
                <span className="text-tx-3 text-[10.5px]"> / {fmtK(meta)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {porVendedor.map(r => {
                const pct = metaPersonal > 0 ? (r.total / metaPersonal) * 100 : 0
                const cumplio = metaPersonal > 0 && r.total >= metaPersonal
                return (
                  <div key={r.v.id} className="flex items-center gap-3">
                    <div className="w-[130px] flex-none text-[12.5px] text-tx-1 truncate" title={r.v.name}>{r.v.name}</div>
                    <div className="flex-1 h-[22px] bg-bg-1 border border-line relative overflow-hidden">
                      <div className="h-full opacity-90" style={{ width: `${Math.min(100, pct)}%`, background: cumplio ? 'var(--ok)' : colorOf(r.v.id), minWidth: r.total ? 3 : 0, transition: 'width .5s ease' }}></div>
                      <span className="mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-tx-2">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-[200px] flex-none text-right leading-tight">
                      <div className="text-[12px]">
                        <span className="mono font-semibold" style={{ color: r.total ? 'var(--tx-0)' : 'var(--tx-3)' }}>{fmtMoney(r.total)}</span>
                        <span className="text-tx-3 text-[10.5px]"> · {r.n} venta{r.n === 1 ? '' : 's'}</span>
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

        {/* Participación del equipo (dona) */}
        <div className="card">
          <div className="card-h">
            <Icon name="commissions" size={17} className="text-acc" />
            <span className="ttl">Participación del mes</span>
          </div>
          <div className="card-b">
            <Donut center={fmtK(vendido)} sub="vendido"
              data={porVendedor.map(r => ({ label: r.v.name, value: r.total, color: colorOf(r.v.id) }))} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4 mb-4">
        {/* Tendencia mensual */}
        <div className="card">
          <div className="card-h">
            <Icon name="layers" size={17} className="text-st-5" />
            <span className="ttl">Tendencia mensual</span>
            <span className="sub ml-auto">clic en un mes para verlo · línea punteada = meta</span>
          </div>
          <div className="card-b">
            <div className="flex items-end gap-2">
              {trend.map(t => {
                const active = t.m === ym
                return (
                  <div key={t.m} className="flex-1 min-w-0 flex flex-col items-center gap-1 cursor-pointer" onClick={() => setYm(t.m)} title={`${ymLabel(t.m)}: ${fmtMoney(t.total)} de ${fmtMoney(t.meta)}`}>
                    <span className="mono text-[9.5px] text-tx-2">{t.total > 0 ? fmtK(t.total) : ''}</span>
                    <div className="w-full h-[130px] bg-bg-1 border relative overflow-hidden" style={{ borderColor: active ? 'var(--acc)' : 'var(--line)' }}>
                      <div className="absolute inset-x-0 bottom-0" style={{ height: `${(t.total / maxTrend) * 100}%`, background: t.total >= t.meta ? 'var(--ok)' : 'var(--acc)', opacity: active ? .95 : .55, transition: 'height .4s ease' }}></div>
                      <div className="absolute inset-x-0" style={{ bottom: `${(t.meta / maxTrend) * 100}%`, borderTop: '1.5px dashed var(--tx-3)' }}></div>
                    </div>
                    <span className={'text-[10.5px] ' + (active ? 'text-acc font-bold' : 'text-tx-2')}>{MESES[Number(t.m.slice(5)) - 1]} {t.m.slice(2, 4)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Ventas por sistema (dona) */}
        <div className="card">
          <div className="card-h">
            <Icon name="grid" size={17} className="text-st-9" />
            <span className="ttl">Ventas por sistema</span>
          </div>
          <div className="card-b">
            <Donut center={String(nVentas)} sub={`venta${nVentas === 1 ? '' : 's'}`}
              data={porSistema.map((s, i) => ({ label: s.label, value: s.value, color: PALETTE[i % PALETTE.length] }))} />
          </div>
        </div>
      </div>

      {/* Detalle por vendedor */}
      <div className="card mb-4">
        <div className="card-h">
          <Icon name="clients" size={17} className="text-acc" />
          <span className="ttl">Detalle por vendedor</span>
        </div>
        <div className="card-b p-0">
          <table className="tbl">
            <thead><tr><th>Vendedor</th><th className="num">Ventas</th><th className="num">Total vendido</th><th className="num">Ticket promedio</th><th className="num">Meta personal</th><th className="num">% de su meta</th><th className="num">% del equipo</th></tr></thead>
            <tbody>
              {porVendedor.map(r => {
                const pctMeta = metaPersonal > 0 ? (r.total / metaPersonal) * 100 : 0
                return (
                  <tr key={r.v.id}>
                    <td className="text-[12.5px] font-semibold text-tx-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: colorOf(r.v.id) }}></span>
                      {r.v.name}
                    </td>
                    <td className="num">{r.n}</td>
                    <td className="num text-[12.5px] font-semibold">{fmtMoney(r.total)}</td>
                    <td className="num text-[12.5px]">{r.n > 0 ? fmtMoney(r.total / r.n) : '—'}</td>
                    <td className="num text-[12.5px] text-tx-2">{fmtMoney(metaPersonal)}</td>
                    <td className="num font-semibold" style={{ color: pctMeta >= 100 ? 'var(--ok)' : pctMeta >= 50 ? 'var(--tx-0)' : 'var(--warn)' }}>{pctMeta.toFixed(1)}%</td>
                    <td className="num text-[12.5px] text-tx-2">{vendido > 0 ? ((r.total / vendido) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ventas del mes */}
      <div className="card">
        <div className="card-h">
          <Icon name="projects" size={17} className="text-acc" />
          <span className="ttl">Ventas de {ymLabel(ym)}</span>
          <span className="sub ml-auto">{nVentas} venta{nVentas === 1 ? '' : 's'} · {fmtMoney(vendido)}</span>
        </div>
        <div className="card-b p-0 max-h-[420px] overflow-y-auto">
          {nVentas === 0 ? <Empty icon="projects">Sin ventas registradas este mes</Empty> : (
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Proyecto</th><th>Cliente</th><th>Vendedor</th><th>Sistema</th><th className="num">Venta (subtotal)</th></tr></thead>
              <tbody>
                {ventasMes.map(p => (
                  <tr key={p.id} onClick={() => onOpenProject(p)}>
                    <td className="num text-tx-2">{fmtDateShort(p.created.slice(0, 10))}</td>
                    <td><span className="mono text-acc font-semibold">{p.code}</span></td>
                    <td>{sel.clientName(state, p.client)}</td>
                    <td className="text-[12.5px]">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: colorOf(p.seller) }}></span>
                      {sel.sellerName(state, p.seller)}
                    </td>
                    <td className="text-[12.5px] text-tx-2">{p.sistemaVendido || '—'}</td>
                    <td className="num font-semibold">{fmtMoney(p.ventaSubtotal || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
