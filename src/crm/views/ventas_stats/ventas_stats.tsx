// ============================================================
//  METAS DE VENTA — desglose mensual por vendedor.
//  Vista del gerente de ventas (y admin/dirección): meta del mes
//  editable, avance por vendedor, participación, tendencia y
//  exportación a Excel. Navegable por mes para ver el histórico.
// ============================================================
import * as React from 'react'
import { useStore, sel, STAGES, fmtMoney, fmtK, fmtDateShort, TODAY_ISO, MESES, MESES_L, canEditSalesGoals, canSeeAllProspects, canExportUtilidad, moneyDigits, fmtMoneyInput, normalizeSistema } from '../../core/data'
import { KPI, SecTitle, Empty, useTabla, TablaCard } from '../../core/ui'
import { Icon } from '../../core/icons'
import { exportVentasExcel } from '../../core/export_ventas'
import { excelErrorMsg } from '../../core/excel_export'
import { RangoMesesModal, mesesEntre, mesLargo, rangoLabel, type RangoMeses } from '../../core/excel_rango'
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

/** Dona SVG con leyenda: cada segmento proporcional a su valor.
 *  `ocultar` en un dato = mostrar solo su porcentaje, sin importe (compañeros de un vendedor). */
function Donut({ data, center, sub }: { data: { label: string; value: number; color: string; ocultar?: boolean }[]; center: string; sub?: string }) {
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
              <title>{d.ocultar ? `${d.label}: ${pct.toFixed(1)}%` : `${d.label}: ${fmtMoney(d.value)} (${pct.toFixed(1)}%)`}</title>
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
              {!d.ocultar && <span className="mono font-semibold">{fmtK(d.value)}</span>}
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
  const canEdit = canEditSalesGoals(me)
  // Un vendedor de a pie ve de sus COMPAÑEROS solo el porcentaje de avance: ni lo vendido,
  // ni su meta ni sus ventas. Lo suyo y los totales del equipo (meta, vendido) sí los ve.
  // Gerentes (ven a todo el equipo) y quienes fijan metas ven todo.
  const soloPorcentaje = me?.role === 'ventas' && !canEdit && !canSeeAllProspects(me)
  const ocultar = (sellerId: string) => soloPorcentaje && sellerId !== me?.id
  const currentYm = TODAY_ISO.slice(0, 7)
  const [ym, setYm] = React.useState(currentYm)

  const vendedores = sel.vendedoresMeta(state)
  const idsVendedores = React.useMemo(() => new Set(vendedores.map(v => v.id)), [vendedores])

  // Filtro por vendedor ('' = todo el equipo). Acota KPIs, tendencia, sistema,
  // tablas y Excel a ese vendedor; las barras del equipo quedan como contexto.
  // Quien solo ve porcentajes arranca filtrado a sí mismo y solo puede elegirse a sí mismo.
  const [sellerId, setSellerId] = React.useState(() => (soloPorcentaje && me ? me.id : ''))
  const vendedorSel = sellerId ? vendedores.find(v => v.id === sellerId) : undefined
  const esMio = (x: { seller: string }) => !sellerId || x.seller === sellerId

  // Primer mes con ventas registradas (piso de la navegación por mes).
  const minYm = React.useMemo(() => {
    const months = state.projects.filter(p => idsVendedores.has(p.seller)).map(p => p.created.slice(0, 7))
    return months.length ? months.reduce((a, b) => (a < b ? a : b)) : currentYm
  }, [state.projects, idsVendedores, currentYm])

  const meta = sel.salesGoal(state, ym)
  // Reparto: lo que toca a quien NO tiene meta propia capturada.
  const metaPersonal = vendedores.length > 0 ? meta / vendedores.length : 0
  // Meta efectiva de cada vendedor (propia o reparto) y si es propia.
  const metaDe = (id: string) => sel.salesGoalFor(state, ym, id)
  const metaPropia = (id: string) => sel.salesGoalPersonalExplicit(state, ym, id)
  const isCurrent = ym === currentYm

  // Ventas del mes elegido: proyectos REGISTRADOS ese mes por el equipo, por su subtotal.
  const ventasMes = React.useMemo(() =>
    state.projects
      .filter(p => p.created.startsWith(ym) && idsVendedores.has(p.seller))
      .sort((a, b) => b.created.localeCompare(a.created)),
    [state.projects, ym, idsVendedores])
  const vendido = ventasMes.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)
  const pctVendido = meta > 0 ? (vendido / meta) * 100 : 0

  // Valores que alimentan KPIs y tablas: del vendedor elegido o del equipo.
  const ventasSel = ventasMes.filter(esMio)
  const metaSel = vendedorSel ? metaDe(vendedorSel.id) : meta
  const vendidoSel = ventasSel.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)
  const faltaSel = Math.max(0, metaSel - vendidoSel)
  const nVentas = ventasSel.length
  const ticket = nVentas > 0 ? vendidoSel / nVentas : 0
  // La lista de ventas (con importes por proyecto) solo muestra las propias a quien ve porcentajes.
  const ventasLista = soloPorcentaje ? ventasSel.filter(p => p.seller === me?.id) : ventasSel
  const vendidoLista = ventasLista.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)
  const pctSel = metaSel > 0 ? (vendidoSel / metaSel) * 100 : 0

  // Por cerrar (solo tiene sentido en el mes en curso): prospectos cotizados o en
  // negociación sin desenlace, más los Vendido aún sin registrar como proyecto.
  const abiertos = isCurrent ? state.prospects.filter(pr => idsVendedores.has(pr.seller) && esMio(pr) && (
    (pr.resultado === 'En espera' && (pr.estado === 'Cotizado' || pr.estado === 'Negociación')) ||
    (pr.resultado === 'Vendido' && !pr.convertedProjectId))) : []
  const porCerrar = abiertos.reduce((a, pr) => a + (pr.costo || 0), 0)
  const proyeccion = vendidoSel + porCerrar

  // Desglose por vendedor, ordenado por total (el orden fija el color en las gráficas).
  const porVendedor = React.useMemo(() => vendedores
    .map(v => {
      const mias = ventasMes.filter(p => p.seller === v.id)
      const total = mias.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)
      return { v, n: mias.length, total, meta: metaDe(v.id), propia: metaPropia(v.id) != null }
    })
    .sort((a, b) => b.total - a.total), [vendedores, ventasMes, ym, state.settings])   // eslint-disable-line react-hooks/exhaustive-deps
  const hayPropias = porVendedor.some(r => r.propia)
  const sumaMetas = porVendedor.reduce((a, r) => a + r.meta, 0)
  const sumaDifiere = hayPropias && Math.abs(sumaMetas - meta) > 1
  const colorOf = (id: string) => PALETTE[Math.max(0, porVendedor.findIndex(r => r.v.id === id)) % PALETTE.length]

  // Ventas por sistema vendido (para la dona derecha), agrupadas por el catálogo:
  // "MINIRACK", "Mini Estándar" y "miniracks" cuentan como una sola categoría.
  const porSistema = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const p of ventasMes.filter(esMio)) {
      const k = normalizeSistema(p.sistemaVendido) || 'Sin sistema'
      map.set(k, (map.get(k) || 0) + (p.ventaSubtotal || 0))
    }
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [ventasMes, sellerId])   // eslint-disable-line react-hooks/exhaustive-deps

  // Tendencia: últimos 12 meses (o desde el primer mes con datos).
  // Por mes: lo COTIZADO (prospectos que llegaron a cotización, por su costo) contra
  // lo VENDIDO (proyectos registrados). El mes de un prospecto es el mismo que usa la
  // vista de Prospectos: fecha de asignación o, si no hay, la de alta.
  const trend = React.useMemo(() => {
    const start = ymAdd(currentYm, -11) > minYm ? ymAdd(currentYm, -11) : minYm
    const months: string[] = []
    for (let m = start; m <= currentYm; m = ymAdd(m, 1)) months.push(m)
    const cotizados = state.prospects.filter(pr => idsVendedores.has(pr.seller) && esMio(pr) && (pr.costo || 0) > 0 &&
      (pr.estado === 'Cotizado' || pr.estado === 'Negociación' || pr.resultado !== 'En espera'))
    return months.map(m => ({
      m,
      total: state.projects
        .filter(p => p.created.startsWith(m) && idsVendedores.has(p.seller) && esMio(p))
        .reduce((a, p) => a + (p.ventaSubtotal || 0), 0),
      cotizado: cotizados
        .filter(pr => (pr.fechaAsignacion || pr.createdAt || '').startsWith(m))
        .reduce((a, pr) => a + (pr.costo || 0), 0),
      // Con vendedor elegido, su meta personal de cada mes (propia o reparto).
      meta: sellerId ? sel.salesGoalFor(state, m, sellerId) : sel.salesGoal(state, m),
    }))
  }, [state, currentYm, minYm, idsVendedores, sellerId])   // eslint-disable-line react-hooks/exhaustive-deps
  const maxTrend = Math.max(1, ...trend.map(t => Math.max(t.total, t.cotizado, t.meta)))

  // Edición de la meta del MES ELEGIDO (gerente de ventas y admin).
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const saveGoal = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ''))
    if (n > 0 && n !== meta) dispatch({ type: 'SAVE_SALES_GOAL', month: ym, goal: n })
    setEditing(false)
  }

  // Edición de la meta PERSONAL de un vendedor para el mes elegido (misma gente).
  // Guardar fija su meta propia desde ese mes; "Quitar" lo regresa al reparto.
  const [editSeller, setEditSeller] = React.useState<string | null>(null)
  const [draftP, setDraftP] = React.useState('')
  const startEditPersonal = (id: string) => { setDraftP(String(Math.round(metaDe(id)))); setEditSeller(id) }
  const savePersonal = () => {
    if (!editSeller) return
    const n = Number(draftP.replace(/[^0-9.]/g, ''))
    if (n > 0 && n !== metaPropia(editSeller)) dispatch({ type: 'SAVE_SALES_GOAL_PERSONAL', month: ym, sellerId: editSeller, goal: n })
    setEditSeller(null)
  }
  const quitarPersonal = (id: string) => {
    dispatch({ type: 'SAVE_SALES_GOAL_PERSONAL', month: ym, sellerId: id, goal: null })
    setEditSeller(null)
  }

  // Excel del mes que se ve, de un rango o de todos los meses (lo elige el modal).
  // Mismo criterio que la vista: proyectos registrados en esos meses por el equipo
  // (o el vendedor elegido); la meta del periodo es la suma de las metas mensuales.
  const [xls, setXls] = React.useState(false)
  // IVA, costos y utilidad por proyecto en el Excel: solo admin y autorizados (David Ríos).
  const conUtilidad = canExportUtilidad(me)
  const exportar = (r: RangoMeses) => {
    const meses = mesesEntre(r.desde, r.hasta)
    const suma = (ps: Project[]) => ps.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)
    const equipo = state.projects
      .filter(p => { const m = p.created.slice(0, 7); return m >= r.desde && m <= r.hasta && idsVendedores.has(p.seller) })
      .sort((a, b) => b.created.localeCompare(a.created))
    const mios = equipo.filter(esMio)
    const metaMes = (m: string) => (vendedorSel ? sel.salesGoalFor(state, m, vendedorSel.id) : sel.salesGoal(state, m))
    const metaPeriodo = meses.reduce((a, m) => a + metaMes(m), 0)
    const vendidoEquipo = suma(equipo), vendidoMio = suma(mios)
    const porV = vendedores.filter(v => esMio({ seller: v.id })).map(v => {
      const mias = mios.filter(p => p.seller === v.id)
      const total = suma(mias)
      const metaP = meses.reduce((a, m) => a + sel.salesGoalFor(state, m, v.id), 0)
      return {
        vendedor: v.name, ventas: mias.length, total,
        ticket: mias.length > 0 ? total / mias.length : 0, metaPersonal: metaP,
        pctMeta: metaP > 0 ? (total / metaP) * 100 : 0,
        pctEquipo: vendidoEquipo > 0 ? (total / vendidoEquipo) * 100 : 0,
      }
    }).sort((a, b) => b.total - a.total)
    const label = r.todos ? `Todos los meses (${rangoLabel(r)})` : rangoLabel(r)
    const archivo = r.desde === r.hasta ? r.desde : `${r.desde}_a_${r.hasta}`
    return exportVentasExcel({
      ym: vendedorSel ? `${archivo}_${vendedorSel.name.replace(/\s+/g, '_')}` : archivo,
      ymLabel: vendedorSel ? `${label} · ${vendedorSel.name}` : label,
      hoy: TODAY_ISO, meta: metaPeriodo, vendido: vendidoMio, conUtilidad,
      vendedores: porV,
      rows: mios.map(p => {
        const monto = p.ventaSubtotal || 0
        // Utilidad sin IVA: misma fórmula que la ficha del proyecto (venta − compras − gastos).
        const utilidad = conUtilidad ? sel.projectUtilidadSub(state, p) : 0
        return {
          fecha: p.created.slice(0, 10), proyecto: p.code, division: p.division || '',
          cliente: sel.clientName(state, p.client), region: p.entidad || '', ciudad: p.city || '',
          vendedor: sel.sellerName(state, p.seller),
          sistema: p.sistemaVendido || '', origen: p.origen || '',
          etapa: STAGES.find(s => s.id === p.stage)?.short || p.stage,
          monto,
          ...(conUtilidad ? { iva: monto * 0.16, total: monto * 1.16, costos: monto - utilidad, utilidad } : {}),
        }
      }),
      meses: meses.map(m => {
        const del = mios.filter(p => p.created.startsWith(m))
        return { ym: m, label: mesLargo(m), meta: metaMes(m), vendido: suma(del), ventas: del.length }
      }),
    })
  }

  // Tabla "Detalle por vendedor": filtro por nombre, orden por cualquier columna (total desc por defecto).
  const tv = useTabla({ key: 'total', dir: -1 }, ['vendedor'] as const)
  const filasVendedores = porVendedor.filter(r => esMio({ seller: r.v.id }))
    .map(r => ({ r, ticket: r.n > 0 ? r.total / r.n : 0, pctMeta: r.meta > 0 ? (r.total / r.meta) * 100 : 0, pctEquipo: vendido > 0 ? (r.total / vendido) * 100 : 0 }))
    .filter(x => tv.has(x.r.v.name, 'vendedor'))
    .sort((a, b) => {
      const k = tv.sort.key
      const val = (x: typeof a): string | number =>
        k === 'vendedor' ? x.r.v.name : k === 'n' ? x.r.n : k === 'ticket' ? x.ticket : k === 'meta' ? x.r.meta : k === 'pctMeta' ? x.pctMeta : k === 'pctEquipo' ? x.pctEquipo : x.r.total
      return tv.cmp(val(a), val(b))
    })

  // Tabla "Ventas del mes": filtro de texto por columna, orden por cualquier columna (fecha desc por defecto).
  // Región / Ciudad = estado de la república (campo `entidad`) + ciudad destino del proyecto.
  const tl = useTabla({ key: 'fecha', dir: -1 }, ['fecha', 'proyecto', 'cliente', 'region', 'vendedor', 'sistema'] as const)
  const filasVentas = ventasLista
    .map(p => ({ p, fecha: p.created.slice(0, 10), cliente: sel.clientName(state, p.client), region: p.entidad || '', ciudad: p.city || '', vendedor: sel.sellerName(state, p.seller), sistema: p.sistemaVendido || '', monto: p.ventaSubtotal || 0 }))
    .filter(x => tl.has(fmtDateShort(x.fecha) + ' ' + x.fecha, 'fecha') && tl.has(x.p.code, 'proyecto') && tl.has(x.cliente, 'cliente') && tl.has(`${x.region} ${x.ciudad}`, 'region') && tl.has(x.vendedor, 'vendedor') && tl.has(x.sistema, 'sistema'))
    .sort((a, b) => {
      const k = tl.sort.key
      const val = (x: typeof a): string | number =>
        k === 'proyecto' ? x.p.code : k === 'cliente' ? x.cliente : k === 'region' ? `${x.region} ${x.ciudad}`.trim().toLowerCase() : k === 'vendedor' ? x.vendedor : k === 'sistema' ? x.sistema : k === 'monto' ? x.monto : x.p.created
      return tl.cmp(val(a), val(b))
    })
  const vendidoFiltrado = filasVentas.reduce((a, x) => a + x.monto, 0)
  const filtradas = filasVentas.length !== ventasLista.length

  return (
    <div>
      <SecTitle title="Metas de venta" sub="Desglose mensual por vendedor" right={
        <div className="flex items-center gap-2">
          {/* Filtro por vendedor */}
          <select className="select text-[12px] py-1 px-2 w-[170px]" value={sellerId} onChange={e => setSellerId(e.target.value)} title="Filtrar por vendedor">
            <option value="">Todo el equipo</option>
            {/* Quien solo ve porcentajes únicamente puede filtrarse a sí mismo. */}
            {vendedores.filter(v => !ocultar(v.id)).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
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
              <input autoFocus className="input mono text-[12px] w-[120px] py-1 px-2" value={fmtMoneyInput(draft)}
                onChange={e => setDraft(moneyDigits(e.target.value))}
                onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditing(false) }} />
              <button className="btn btn-ghost btn-sm" onClick={saveGoal}><Icon name="check" size={13} /></button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}><Icon name="close" size={13} /></button>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="sub">Meta <span className="mono font-semibold text-tx-0">{fmtK(meta)}</span></span>
              {canEdit && <button className="btn btn-ghost btn-sm" title={`Editar la meta de ${ymLabel(ym)}`} onClick={() => { setDraft(String(Math.round(meta))); setEditing(true) }}><Icon name="edit" size={13} /></button>}
            </span>
          )}
          {!soloPorcentaje && <button className="btn btn-sm" onClick={() => setXls(true)} title="Exportar a Excel: este mes, un rango o todos los meses"><Icon name="download" size={14} /> Excel</button>}
        </div>
      } />
      {xls && (
        <RangoMesesModal meses={mesesEntre(minYm, currentYm)} mesActual={ym}
          titulo={`Exportar ventas${vendedorSel ? ` · ${vendedorSel.name}` : ''}`}
          onClose={() => setXls(false)}
          onExportar={r => exportar(r).catch(err => { console.error('[export] fallo al generar el Excel', err); alert(excelErrorMsg(err)) })} />
      )}

      {/* KPIs del mes */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <KPI label={vendedorSel ? `Meta personal · ${vendedorSel.name}` : 'Meta del mes'} value={metaSel} format={fmtMoney} icon="flag" accent foot={vendedorSel ? `Meta del equipo ${fmtK(meta)}${metaPropia(vendedorSel.id) != null ? ' · meta propia' : ' · reparto'}` : hayPropias ? `Metas por persona · suman ${fmtK(sumaMetas)}` : `${fmtK(metaPersonal)} por vendedor (${vendedores.length})`} delay={0} />
        <KPI label="Vendido" value={vendidoSel} format={fmtMoney} icon="money" foot={`${pctSel.toFixed(1)}% de ${vendedorSel ? 'su meta' : 'la meta'}`} footTrend={pctSel >= 100 ? 'up' : undefined} delay={60} />
        <KPI label={faltaSel > 0 ? 'Falta para la meta' : 'Meta superada por'} value={faltaSel > 0 ? faltaSel : vendidoSel - metaSel} format={fmtMoney} icon={faltaSel > 0 ? 'alert' : 'check'} footTrend={faltaSel > 0 ? 'dn' : 'up'} foot={isCurrent && porCerrar > 0 ? `Proyección ${fmtK(proyeccion)} con por cerrar` : faltaSel > 0 ? 'Contra lo vendido' : vendedorSel ? '¡Felicidades!' : '¡Felicidades al equipo!'} delay={120} />
        <KPI label="Ventas registradas" value={nVentas} icon="projects" foot={nVentas > 0 ? `Ticket promedio ${fmtK(ticket)}` : 'Sin ventas este mes'} delay={180} />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4 mb-4">
        {/* Vendido vs meta personal por vendedor */}
        <div className="card">
          <div className="card-h">
            <Icon name="trendUp" size={17} className="text-ok" />
            <span className="ttl">Vendido vs meta personal</span>
            <span className="sub ml-auto">
              {hayPropias ? (
                <>metas por persona · suman <span className="mono font-semibold" style={{ color: sumaDifiere ? 'var(--warn)' : 'var(--tx-0)' }}>{fmtK(sumaMetas)}</span>{sumaDifiere ? ` vs meta del equipo ${fmtK(meta)}` : ''}</>
              ) : (
                <>meta personal {fmtK(metaPersonal)} (reparto)</>
              )}
              {' · clic en un vendedor para filtrar'}{canEdit ? ' · ✎ para fijar su meta' : ''}
            </span>
          </div>
          <div className="card-b">
            {/* Equipo completo primero, como referencia */}
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-line-soft">
              <div className="w-[130px] flex-none text-[12.5px] font-semibold">EQUIPO</div>
              <div className="flex-1 h-[22px] bg-bg-1 border border-line relative overflow-hidden">
                {isCurrent && !sellerId && <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, meta > 0 ? (proyeccion / meta) * 100 : 0)}%`, background: 'var(--acc)', opacity: .28 }}></div>}
                <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, pctVendido)}%`, background: 'var(--ok)', opacity: .9, transition: 'width .5s ease' }}></div>
                <span className="mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-tx-2">{pctVendido.toFixed(0)}%</span>
              </div>
              <div className="w-[250px] flex-none text-right text-[12px]">
                <span className="mono font-semibold">{fmtMoney(vendido)}</span>
                <span className="text-tx-3 text-[10.5px]"> / {fmtK(meta)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {porVendedor.map(r => {
                const pct = r.meta > 0 ? (r.total / r.meta) * 100 : 0
                const cumplio = r.meta > 0 && r.total >= r.meta
                const activo = sellerId === r.v.id
                // Quien solo ve porcentajes vive filtrado a sí mismo: no se atenúa a los demás.
                const dim = !!sellerId && !activo && !soloPorcentaje
                const editandoEste = editSeller === r.v.id
                const oculto = ocultar(r.v.id)   // compañero: solo el porcentaje
                return (
                  <div key={r.v.id} className={'flex items-center gap-3' + (oculto ? '' : ' cursor-pointer')} style={{ opacity: dim ? .35 : 1, transition: 'opacity .2s' }}
                    onClick={() => { if (!editandoEste && !oculto) setSellerId(activo ? '' : r.v.id) }} title={oculto ? undefined : activo ? 'Quitar filtro' : `Ver solo a ${r.v.name}`}>
                    <div className="w-[130px] flex-none text-[12.5px] truncate" style={{ color: activo ? 'var(--acc)' : 'var(--tx-1)', fontWeight: activo ? 700 : 400 }} title={r.v.name}>{r.v.name}</div>
                    <div className="flex-1 h-[22px] bg-bg-1 border border-line relative overflow-hidden">
                      <div className="h-full opacity-90" style={{ width: `${Math.min(100, pct)}%`, background: cumplio ? 'var(--ok)' : colorOf(r.v.id), minWidth: r.total ? 3 : 0, transition: 'width .5s ease' }}></div>
                      <span className="mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-tx-2">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-[250px] flex-none text-right leading-tight">
                      <div className="text-[12px]">
                        {oculto
                          ? <span className="mono font-semibold" style={{ color: cumplio ? 'var(--ok)' : 'var(--tx-1)' }}>{pct.toFixed(0)}% de su meta</span>
                          : <span className="mono font-semibold" style={{ color: r.total ? 'var(--tx-0)' : 'var(--tx-3)' }}>{fmtMoney(r.total)}</span>}
                        <span className="text-tx-3 text-[10.5px]"> · {r.n} venta{r.n === 1 ? '' : 's'}</span>
                      </div>
                      {oculto ? null : editandoEste ? (
                        /* Captura de la meta personal de este vendedor para el mes elegido */
                        <div className="flex items-center justify-end gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
                          <input autoFocus className="input mono text-[11px] w-[105px] py-0.5 px-1.5" value={fmtMoneyInput(draftP)}
                            onChange={e => setDraftP(moneyDigits(e.target.value))}
                            onKeyDown={e => { if (e.key === 'Enter') savePersonal(); if (e.key === 'Escape') setEditSeller(null) }} />
                          <button className="btn btn-ghost btn-sm" title="Guardar meta personal" onClick={savePersonal}><Icon name="check" size={12} /></button>
                          {r.propia && <button className="btn btn-ghost btn-sm text-[10.5px]" title="Quitar su meta propia: vuelve al reparto (meta ÷ equipo)" onClick={() => quitarPersonal(r.v.id)}>Quitar</button>}
                          <button className="btn btn-ghost btn-sm" title="Cancelar" onClick={() => setEditSeller(null)}><Icon name="close" size={12} /></button>
                        </div>
                      ) : (
                        <div className="meta flex items-center justify-end gap-1">
                          <span style={cumplio ? { color: 'var(--ok)' } : undefined}>{cumplio ? '¡Meta cumplida!' : `faltan ${fmtK(r.meta - r.total)}`}</span>
                          <span className="text-tx-3" title={r.propia ? 'Meta propia capturada para esta persona' : 'Reparto: meta del equipo ÷ vendedores'}>· meta {fmtK(r.meta)}{r.propia ? '' : ' (reparto)'}</span>
                          {canEdit && <button className="btn btn-ghost btn-sm py-0 px-1" title={`Fijar la meta de ${r.v.name} para ${ymLabel(ym)}`} onClick={e => { e.stopPropagation(); startEditPersonal(r.v.id) }}><Icon name="edit" size={11} /></button>}
                        </div>
                      )}
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
              data={porVendedor.map(r => ({ label: r.v.name, value: r.total, color: colorOf(r.v.id), ocultar: ocultar(r.v.id) }))} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4 mb-4">
        {/* Tendencia mensual */}
        <div className="card">
          <div className="card-h">
            <Icon name="layers" size={17} className="text-st-5" />
            <span className="ttl">Tendencia mensual{vendedorSel ? ` · ${vendedorSel.name}` : ''}</span>
            <span className="sub ml-auto flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 flex-none" style={{ background: 'var(--tx-3)', opacity: .55 }}></span>cotizado</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 flex-none" style={{ background: 'var(--acc)' }}></span>vendido</span>
              <span>clic en un mes para verlo · línea punteada = {vendedorSel ? 'su meta personal' : 'meta'}</span>
            </span>
          </div>
          <div className="card-b">
            <div className="flex items-end gap-2">
              {trend.map(t => {
                const active = t.m === ym
                const conv = t.cotizado > 0 ? (t.total / t.cotizado) * 100 : 0
                return (
                  <div key={t.m} className="flex-1 min-w-0 flex flex-col items-center gap-1 cursor-pointer" onClick={() => setYm(t.m)}
                    title={`${ymLabel(t.m)}\nCotizado: ${fmtMoney(t.cotizado)}\nVendido: ${fmtMoney(t.total)} (${conv.toFixed(0)}% de lo cotizado)\nMeta: ${fmtMoney(t.meta)}`}>
                    {/* Importes: cotizado (tenue) y vendido, alineados con cada barra */}
                    <div className="w-full flex text-[9px] mono leading-none">
                      <span className="flex-1 text-center text-tx-3 truncate">{t.cotizado > 0 ? fmtK(t.cotizado) : ''}</span>
                      <span className="flex-1 text-center text-tx-2 font-semibold truncate">{t.total > 0 ? fmtK(t.total) : ''}</span>
                    </div>
                    <div className="w-full h-[130px] bg-bg-1 border relative overflow-hidden" style={{ borderColor: active ? 'var(--acc)' : 'var(--line)' }}>
                      {/* Cotizado: mitad izquierda */}
                      <div className="absolute bottom-0 left-0" style={{ width: 'calc(50% - 1px)', height: `${(t.cotizado / maxTrend) * 100}%`, background: 'var(--tx-3)', opacity: active ? .6 : .35, transition: 'height .4s ease' }}></div>
                      {/* Vendido: mitad derecha */}
                      <div className="absolute bottom-0 right-0" style={{ width: 'calc(50% - 1px)', height: `${(t.total / maxTrend) * 100}%`, background: t.total >= t.meta ? 'var(--ok)' : 'var(--acc)', opacity: active ? .95 : .55, transition: 'height .4s ease' }}></div>
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
            <span className="ttl">Ventas por sistema{vendedorSel ? ` · ${vendedorSel.name}` : ''}</span>
          </div>
          <div className="card-b">
            <Donut center={String(nVentas)} sub={`venta${nVentas === 1 ? '' : 's'}`}
              data={porSistema.map((s, i) => ({ label: s.label, value: s.value, color: PALETTE[i % PALETTE.length] }))} />
          </div>
        </div>
      </div>

      {/* Detalle por vendedor */}
      <TablaCard icon="clients" title="Detalle por vendedor" t={tv} className="mb-4" maxH={520}
        sub={filasVendedores.length !== porVendedor.filter(r => esMio({ seller: r.v.id })).length ? `${filasVendedores.length} vendedor${filasVendedores.length === 1 ? '' : 'es'} (filtrado)` : undefined}>
          <table className="tbl">
            <thead>
              <tr>
                {tv.th('vendedor', 'Vendedor')}{tv.th('n', 'Ventas', 'num')}{tv.th('total', 'Total vendido', 'num')}{tv.th('ticket', 'Ticket promedio', 'num')}
                {tv.th('meta', 'Meta personal', 'num')}{tv.th('pctMeta', '% de su meta', 'num')}{tv.th('pctEquipo', '% del equipo', 'num')}
              </tr>
              {tv.verFiltros && <tr>{tv.fth('vendedor')}{tv.fth()}{tv.fth()}{tv.fth()}{tv.fth()}{tv.fth()}{tv.fth()}</tr>}
            </thead>
            <tbody>
              {filasVendedores.length === 0 && <tr><td colSpan={7}><Empty icon="clients">Ningún vendedor coincide con el filtro</Empty></td></tr>}
              {filasVendedores.map(({ r, pctMeta, pctEquipo }) => {
                return (
                  <tr key={r.v.id}>
                    <td className="text-[12.5px] font-semibold text-tx-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: colorOf(r.v.id) }}></span>
                      {r.v.name}
                    </td>
                    <td className="num">{r.n}</td>
                    {ocultar(r.v.id) ? (
                      // Compañero: sin importes (con la meta y el % se deduciría lo vendido).
                      <><td className="num text-tx-3">—</td><td className="num text-tx-3">—</td><td className="num text-tx-3">—</td></>
                    ) : (<>
                      <td className="num text-[12.5px] font-semibold">{fmtMoney(r.total)}</td>
                      <td className="num text-[12.5px]">{r.n > 0 ? fmtMoney(r.total / r.n) : '—'}</td>
                      <td className="num text-[12.5px] text-tx-2" title={r.propia ? 'Meta propia' : 'Reparto (meta ÷ equipo)'}>
                        {fmtMoney(r.meta)}{r.propia && <span className="text-[10px] text-acc ml-1" title="Meta propia capturada">●</span>}
                      </td>
                    </>)}
                    <td className="num font-semibold" style={{ color: pctMeta >= 100 ? 'var(--ok)' : pctMeta >= 50 ? 'var(--tx-0)' : 'var(--warn)' }}>{pctMeta.toFixed(1)}%</td>
                    <td className="num text-[12.5px] text-tx-2">{pctEquipo.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </TablaCard>

      {/* Ventas del mes */}
      <TablaCard icon="projects" title={<>Ventas de {ymLabel(ym)}{vendedorSel ? ` · ${vendedorSel.name}` : ''}</>} t={tl}
        sub={<>{filasVentas.length}{filtradas ? ` de ${ventasLista.length}` : ''} venta{filasVentas.length === 1 ? '' : 's'} · {fmtMoney(filtradas ? vendidoFiltrado : vendidoLista)}{soloPorcentaje && !vendedorSel ? ' · solo las tuyas' : ''}</>}>
          {ventasLista.length === 0 ? <Empty icon="projects">{vendedorSel ? `${vendedorSel.name} no tiene ventas registradas este mes` : 'Sin ventas registradas este mes'}</Empty> : (
            <table className="tbl">
              <thead>
                <tr>{tl.th('fecha', 'Fecha')}{tl.th('proyecto', 'Proyecto')}{tl.th('cliente', 'Cliente')}{tl.th('region', 'Región / Ciudad')}{tl.th('vendedor', 'Vendedor')}{tl.th('sistema', 'Sistema')}{tl.th('monto', 'Venta (subtotal)', 'num')}</tr>
                {tl.verFiltros && <tr>{tl.fth('fecha')}{tl.fth('proyecto')}{tl.fth('cliente')}{tl.fth('region')}{tl.fth('vendedor')}{tl.fth('sistema')}{tl.fth()}</tr>}
              </thead>
              <tbody>
                {filasVentas.length === 0 && <tr><td colSpan={7}><Empty icon="projects">Ninguna venta coincide con los filtros</Empty></td></tr>}
                {filasVentas.map(({ p, fecha, cliente, region, ciudad, vendedor, sistema, monto }) => (
                  <tr key={p.id} onClick={() => onOpenProject(p)}>
                    <td className="num text-tx-2">{fmtDateShort(fecha)}</td>
                    <td><span className="mono text-acc font-semibold">{p.code}</span></td>
                    <td>{cliente}</td>
                    <td className="text-[12.5px]">{region || ciudad ? <>{region || <span className="text-tx-3">Sin región</span>}{ciudad && <div className="meta">{ciudad}</div>}</> : '—'}</td>
                    <td className="text-[12.5px]">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: colorOf(p.seller) }}></span>
                      {vendedor}
                    </td>
                    <td className="text-[12.5px] text-tx-2">{sistema || '—'}</td>
                    <td className="num font-semibold">{fmtMoney(monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </TablaCard>
    </div>
  )
}
