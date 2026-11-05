// ============================================================
//  ESTADÍSTICAS — dashboard de rendimiento por ORIGEN (anuncio)
//  Vista pensada para Marketing: qué anuncio trae más proyectos y
//  cuánta utilidad deja cada uno. Solo lectura, sin desglose de costos.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, TODAY_ISO, MESES_L, normalizeOrigen, DIVISIONES } from '../../core/data'
import { KPI, SecTitle, Empty, Seg, useFitTableHeight, useTabla, TablaCard } from '../../core/ui'
import { Icon } from '../../core/icons'

/** Suma un delta de meses a un 'YYYY-MM'. */
const ymAdd = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const ymLabel = (ym: string) => `${MESES_L[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`

// Paleta estable por origen (mismo color en todas las gráficas de la vista).
const PALETTE = ['#2f6feb', '#14b8a6', '#f59e0b', '#c084fc', '#f472b6', '#38bdf8', '#34d399', '#fb7185']

type Grupo = { origen: string; count: number; venta: number; utilidad: number; margen: number | null }
const SIN_DIVISION = 'Sin división'

export function EstadisticasPage() {
  const tabla = useFitTableHeight()   // tabla "Proyectos por utilidad" ajustada a la pantalla
  const { state } = useStore()

  // Segmentación por mes de registro del proyecto ('' = todos los meses).
  // Navegable como en Metas de venta: desde el primer mes con proyectos hasta hoy.
  const currentYm = TODAY_ISO.slice(0, 7)
  const [ym, setYm] = React.useState('')
  const minYm = React.useMemo(() => {
    const months = state.projects.map(p => p.created.slice(0, 7)).filter(Boolean)
    return months.length ? months.reduce((a, b) => (a < b ? a : b)) : currentYm
  }, [state.projects, currentYm])
  const proyectosPeriodo = React.useMemo(() => ym ? state.projects.filter(p => p.created.startsWith(ym)) : state.projects, [state.projects, ym])
  // División (CC Racks / Racks Tapatíos): '' = ambas. Acota KPIs, gráficas y tabla; el
  // bloque "Por división" siempre compara las dos sobre el periodo completo.
  const [division, setDivision] = React.useState('')
  const proyectosMes = React.useMemo(() => division ? proyectosPeriodo.filter(p => (p.division || SIN_DIVISION) === division) : proyectosPeriodo, [proyectosPeriodo, division])
  const porDivision = React.useMemo(() => {
    const filas = [...DIVISIONES, SIN_DIVISION].map(m => {
      const ps = proyectosPeriodo.filter(p => (p.division || SIN_DIVISION) === m)
      const venta = ps.reduce((a, p) => a + (p.ventaSubtotal || 0), 0)
      const utilidad = ps.reduce((a, p) => a + sel.projectUtilidadSub(state, p), 0)
      return { division: m, count: ps.length, venta, utilidad, margen: venta > 0 ? (utilidad / venta) * 100 : null }
    })
    // "Sin división" solo aparece si hay proyectos viejos sin capturarla.
    return filas.filter(f => f.division !== SIN_DIVISION || f.count > 0)
  }, [state, proyectosPeriodo])
  const totalPeriodo = proyectosPeriodo.length

  // Agrupa los proyectos del periodo por su origen (anuncio), llevado al catálogo:
  // "cliente viejito", "CLIENTE EXISTENTE" y "Ya era cliente" cuentan como uno solo.
  // Cada proyecto aporta su venta (subtotal) y su utilidad sin IVA — misma fórmula que la ficha.
  const { grupos, porUtilidad, porCount, totalVenta, totalUtil, totalProyectos, margenProm, mejor, colorOf } = React.useMemo(() => {
    const map = new Map<string, Grupo>()
    for (const p of proyectosMes) {
      const key = normalizeOrigen(p.origen) || 'Sin origen'
      const g = map.get(key) || { origen: key, count: 0, venta: 0, utilidad: 0, margen: null }
      g.count += 1
      g.venta += p.ventaSubtotal || 0
      g.utilidad += sel.projectUtilidadSub(state, p)
      map.set(key, g)
    }
    const grupos = [...map.values()].map(g => ({ ...g, margen: g.venta > 0 ? (g.utilidad / g.venta) * 100 : null }))
    const porUtilidad = [...grupos].sort((a, b) => b.utilidad - a.utilidad)
    const porCount = [...grupos].sort((a, b) => b.count - a.count)
    const orden = porUtilidad.map(g => g.origen)
    const colorOf = (o: string) => PALETTE[Math.max(0, orden.indexOf(o)) % PALETTE.length]
    const totalVenta = grupos.reduce((a, g) => a + g.venta, 0)
    const totalUtil = grupos.reduce((a, g) => a + g.utilidad, 0)
    const totalProyectos = proyectosMes.length
    const margenProm = totalVenta > 0 ? (totalUtil / totalVenta) * 100 : null
    return { grupos, porUtilidad, porCount, totalVenta, totalUtil, totalProyectos, margenProm, mejor: porUtilidad[0], colorOf }
    // Depende de state completo: la utilidad se calcula a partir de OCs, pagos internos y movimientos.
  }, [state, proyectosMes])

  // Proyectos individuales del periodo (vista general, sin desglose de costos).
  const proyectosCalc = React.useMemo(() =>
    proyectosMes.map(p => ({
      p, cliente: sel.clientName(state, p.client), origen: normalizeOrigen(p.origen), division: p.division || '',
      venta: p.ventaSubtotal || 0, utilidad: sel.projectUtilidadSub(state, p),
    })),
    [state, proyectosMes])
  // Tabla: filtro de texto por proyecto / cliente / origen y orden por cualquier columna (utilidad desc por defecto).
  const tp = useTabla({ key: 'utilidad', dir: -1 }, ['proyecto', 'division', 'cliente', 'origen'] as const)
  const proyectos = proyectosCalc
    .filter(x => tp.has(x.p.code, 'proyecto') && tp.has(x.division || SIN_DIVISION, 'division') && tp.has(x.cliente, 'cliente') && tp.has(x.origen || 'Sin origen', 'origen'))
    .sort((a, b) => {
      const k = tp.sort.key
      const val = (x: typeof a): string | number =>
        k === 'proyecto' ? x.p.code : k === 'division' ? x.division : k === 'cliente' ? x.cliente : k === 'origen' ? x.origen : k === 'venta' ? x.venta
        : k === 'margen' ? (x.venta > 0 ? x.utilidad / x.venta : -Infinity) : x.utilidad
      return tp.cmp(val(a), val(b))
    })

  const maxUtil = Math.max(1, ...porUtilidad.map(g => Math.abs(g.utilidad)))
  const maxCount = Math.max(1, ...porCount.map(g => g.count))

  if (state.projects.length === 0) {
    return (
      <div>
        <SecTitle title="Estadísticas" sub="Rendimiento por origen (anuncio)" />
        <div className="card"><div className="card-b"><Empty icon="trendUp">Aún no hay proyectos para analizar</Empty></div></div>
      </div>
    )
  }

  return (
    <div>
      <SecTitle title="Estadísticas" sub="Rendimiento por origen · ¿qué anuncio deja más?" right={
        <div className="flex items-center gap-2">
          {/* División: ambas o solo una */}
          <Seg value={division} onChange={setDivision} options={[{ value: '', label: 'Ambas divisiones' }, ...DIVISIONES.map(m => ({ value: m, label: m }))]} />
          {/* Periodo: todos los meses o un mes concreto (por fecha de registro del proyecto) */}
          <button className={'btn btn-sm ' + (ym ? 'btn-ghost' : '')} onClick={() => setYm('')} title="Ver todos los meses">Todo</button>
          <button className="btn btn-ghost btn-sm" disabled={!!ym && ym <= minYm} onClick={() => setYm(ym ? ymAdd(ym, -1) : currentYm)} title="Mes anterior">
            <Icon name="chevron" size={14} className="rotate-180" />
          </button>
          <span className="mono text-[12.5px] font-semibold w-[150px] text-center">{ym ? ymLabel(ym) : 'Todos los meses'}</span>
          <button className="btn btn-ghost btn-sm" disabled={!ym || ym >= currentYm} onClick={() => setYm(ymAdd(ym, 1))} title="Mes siguiente">
            <Icon name="chevron" size={14} />
          </button>
        </div>
      } />

      {/* KPIs generales */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <KPI label={ym ? `Proyectos · ${ymLabel(ym)}` : 'Proyectos'} value={totalProyectos} icon="projects" accent foot={totalProyectos ? `${grupos.length} orígenes distintos` : 'Sin proyectos registrados en el mes'} delay={0} />
        <KPI label="Venta total" value={totalVenta} format={fmtMoney} icon="money" foot="Subtotal sin IVA" delay={60} />
        <KPI label="Utilidad total" value={totalUtil} format={fmtMoney} icon="commissions" foot={margenProm != null ? `Margen ${margenProm.toFixed(1)}%` : undefined} delay={120} />
        <KPI label="Mejor anuncio" value={mejor ? mejor.origen : '—'} icon="trendUp" foot={mejor ? `${fmtMoney(mejor.utilidad)} de utilidad` : undefined} delay={180} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Utilidad por origen — el gráfico clave */}
        <div className="card">
          <div className="card-h">
            <Icon name="commissions" size={17} className="text-acc" />
            <span className="ttl">Utilidad por anuncio</span>
            <span className="sub ml-auto">sin IVA</span>
          </div>
          <div className="card-b">
            <div className="flex flex-col gap-2.5">
              {porUtilidad.length === 0 && <Empty icon="commissions">Sin proyectos en este mes</Empty>}
              {porUtilidad.map(g => {
                const neg = g.utilidad < 0
                const w = (Math.abs(g.utilidad) / maxUtil) * 100
                return (
                  <div key={g.origen} className="flex items-center gap-3">
                    <div className="w-[170px] flex-none text-[12.5px] text-tx-1 truncate" title={g.origen}>{g.origen}</div>
                    <div className="flex-1 h-[22px] bg-bg-1 border border-line relative">
                      <div className="h-full opacity-90" style={{ width: `${w}%`, background: neg ? 'var(--danger)' : colorOf(g.origen), minWidth: 3, transition: 'width .5s ease' }}></div>
                    </div>
                    <div className="w-[110px] flex-none text-right mono text-[12.5px] font-semibold" style={{ color: neg ? 'var(--danger)' : 'var(--tx-0)' }}>{fmtMoney(g.utilidad)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Proyectos vendidos por origen */}
        <div className="card">
          <div className="card-h">
            <Icon name="kanban" size={17} className="text-st-5" />
            <span className="ttl">Proyectos por anuncio</span>
            <span className="sub ml-auto">{totalProyectos} en total</span>
          </div>
          <div className="card-b">
            <div className="flex flex-col gap-2.5">
              {porCount.length === 0 && <Empty icon="kanban">Sin proyectos en este mes</Empty>}
              {porCount.map(g => {
                const w = (g.count / maxCount) * 100
                const pct = totalProyectos > 0 ? (g.count / totalProyectos) * 100 : 0
                return (
                  <div key={g.origen} className="flex items-center gap-3">
                    <div className="w-[170px] flex-none text-[12.5px] text-tx-1 truncate" title={g.origen}>{g.origen}</div>
                    <div className="flex-1 h-[22px] bg-bg-1 border border-line relative">
                      <div className="h-full opacity-90" style={{ width: `${w}%`, background: colorOf(g.origen), minWidth: 3, transition: 'width .5s ease' }}></div>
                    </div>
                    <div className="w-[110px] flex-none text-right text-[12.5px]"><span className="mono font-semibold">{g.count}</span> <span className="text-tx-3 text-[11px]">· {pct.toFixed(0)}%</span></div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Por división: CC Racks vs Racks Tapatíos en el periodo (sin importar el filtro de división) */}
      <div className="card mb-4">
        <div className="card-h">
          <Icon name="flag" size={17} className="text-acc" />
          <span className="ttl">Por división</span>
          <span className="sub ml-auto">{ym ? ymLabel(ym) : 'Todos los meses'} · {totalPeriodo} proyectos</span>
        </div>
        <div className="card-b p-0">
          <table className="tbl">
            <thead><tr><th>División</th><th className="num">Proyectos</th><th className="num">% proyectos</th><th className="num">Venta</th><th className="num">% venta</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
            <tbody>
              {porDivision.map(f => {
                const totalVentaP = porDivision.reduce((a, x) => a + x.venta, 0)
                return (
                  <tr key={f.division} className={division === f.division ? 'bg-bg-1' : ''}>
                    <td className="text-[12.5px] font-semibold text-tx-1">{f.division === SIN_DIVISION ? <span className="text-tx-3 font-normal">{SIN_DIVISION}</span> : f.division}</td>
                    <td className="num">{f.count}</td>
                    <td className="num text-[12.5px] text-tx-2">{totalPeriodo > 0 ? `${((f.count / totalPeriodo) * 100).toFixed(0)}%` : '—'}</td>
                    <td className="num text-[12.5px]">{fmtMoney(f.venta)}</td>
                    <td className="num text-[12.5px] text-tx-2">{totalVentaP > 0 ? `${((f.venta / totalVentaP) * 100).toFixed(0)}%` : '—'}</td>
                    <td className="num font-semibold" style={{ color: f.utilidad < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmtMoney(f.utilidad)}</td>
                    <td className="num text-[12.5px] text-tx-2">{f.margen != null ? `${f.margen.toFixed(1)}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen por origen */}
      <div className="card mb-4">
        <div className="card-h">
          <Icon name="layers" size={17} className="text-st-9" />
          <span className="ttl">Resumen por anuncio</span>
        </div>
        {/* Altura acotada con scroll propio (encabezado pegado): la página no se alarga con cada anuncio. */}
        <div className="card-b p-0 max-h-[380px] overflow-auto">
          <table className="tbl">
            <thead><tr><th>Anuncio (origen)</th><th className="num">Proyectos</th><th className="num">Venta</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
            <tbody>
              {porUtilidad.map(g => (
                <tr key={g.origen}>
                  <td className="text-[12.5px] font-semibold text-tx-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: g.utilidad < 0 ? 'var(--danger)' : colorOf(g.origen) }}></span>
                    {g.origen}
                  </td>
                  <td className="num">{g.count}</td>
                  <td className="num text-[12.5px]">{fmtMoney(g.venta)}</td>
                  <td className="num font-semibold" style={{ color: g.utilidad < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmtMoney(g.utilidad)}</td>
                  <td className="num text-[12.5px] text-tx-2">{g.margen != null ? `${g.margen.toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle general por proyecto (sin desglose de costos): filtrable, ordenable y ampliable */}
      <TablaCard icon="projects" title="Proyectos por utilidad" t={tp} bodyRef={tabla.ref} maxH={tabla.maxH}
        sub={`${proyectos.length}${proyectos.length !== proyectosCalc.length ? ` de ${proyectosCalc.length}` : ''} proyectos`}>
          <table className="tbl">
            <thead>
              <tr>{tp.th('proyecto', 'Proyecto')}{tp.th('division', 'División')}{tp.th('cliente', 'Cliente')}{tp.th('origen', 'Anuncio (origen)')}{tp.th('venta', 'Venta', 'num')}{tp.th('utilidad', 'Utilidad', 'num')}{tp.th('margen', 'Margen', 'num')}</tr>
              {tp.verFiltros && <tr>{tp.fth('proyecto')}{tp.fth('division')}{tp.fth('cliente')}{tp.fth('origen')}{tp.fth()}{tp.fth()}{tp.fth()}</tr>}
            </thead>
            <tbody>
              {proyectos.length === 0 && <tr><td colSpan={7}><Empty icon="projects">Ningún proyecto coincide con los filtros</Empty></td></tr>}
              {proyectos.map(({ p, cliente, origen, division: m, venta, utilidad }) => (
                <tr key={p.id}>
                  <td><span className="mono text-acc font-semibold">{p.code}</span></td>
                  <td className="text-[12.5px]">{m || <span className="text-tx-3">{SIN_DIVISION}</span>}</td>
                  <td className="text-[12.5px]">{cliente}</td>
                  {/* Origen llevado al catálogo; el texto original, si difiere, va en el tooltip. */}
                  <td className="text-[12.5px]" title={p.origen?.trim() || undefined}>{origen || <span className="text-tx-3">Sin origen</span>}</td>
                  <td className="num text-[12.5px]">{fmtMoney(venta)}</td>
                  <td className="num font-semibold" style={{ color: utilidad < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmtMoney(utilidad)}</td>
                  <td className="num text-[12.5px] text-tx-2">{venta > 0 ? `${((utilidad / venta) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </TablaCard>
    </div>
  )
}
