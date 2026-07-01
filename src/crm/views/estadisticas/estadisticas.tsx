// ============================================================
//  ESTADÍSTICAS — dashboard de rendimiento por ORIGEN (anuncio)
//  Vista pensada para Marketing: qué anuncio trae más proyectos y
//  cuánta utilidad deja cada uno. Solo lectura, sin desglose de costos.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney } from '../../core/data'
import { KPI, SecTitle, Empty } from '../../core/ui'
import { Icon } from '../../core/icons'

// Paleta estable por origen (mismo color en todas las gráficas de la vista).
const PALETTE = ['#2f6feb', '#14b8a6', '#f59e0b', '#c084fc', '#f472b6', '#38bdf8', '#34d399', '#fb7185']

type Grupo = { origen: string; count: number; venta: number; utilidad: number; margen: number | null }

export function EstadisticasPage() {
  const { state } = useStore()

  // Agrupa TODOS los proyectos por su origen (anuncio). Cada proyecto aporta su
  // venta (subtotal) y su utilidad sin IVA — misma fórmula que la ficha del proyecto.
  const { grupos, porUtilidad, porCount, totalVenta, totalUtil, totalProyectos, margenProm, mejor, colorOf } = React.useMemo(() => {
    const map = new Map<string, Grupo>()
    for (const p of state.projects) {
      const key = p.origen?.trim() || 'Sin origen'
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
    const totalProyectos = state.projects.length
    const margenProm = totalVenta > 0 ? (totalUtil / totalVenta) * 100 : null
    return { grupos, porUtilidad, porCount, totalVenta, totalUtil, totalProyectos, margenProm, mejor: porUtilidad[0], colorOf }
    // Depende de state completo: la utilidad se calcula a partir de OCs, pagos internos y movimientos.
  }, [state])

  // Proyectos individuales (vista general, sin desglose de costos), ordenados por utilidad.
  const proyectos = React.useMemo(() =>
    state.projects
      .map(p => ({ p, venta: p.ventaSubtotal || 0, utilidad: sel.projectUtilidadSub(state, p) }))
      .sort((a, b) => b.utilidad - a.utilidad),
    [state])

  const maxUtil = Math.max(1, ...porUtilidad.map(g => Math.abs(g.utilidad)))
  const maxCount = Math.max(1, ...porCount.map(g => g.count))

  if (totalProyectos === 0) {
    return (
      <div>
        <SecTitle title="Estadísticas" sub="Rendimiento por origen (anuncio)" />
        <div className="card"><div className="card-b"><Empty icon="trendUp">Aún no hay proyectos para analizar</Empty></div></div>
      </div>
    )
  }

  return (
    <div>
      <SecTitle title="Estadísticas" sub="Rendimiento por origen · ¿qué anuncio deja más?" />

      {/* KPIs generales */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <KPI label="Proyectos" value={totalProyectos} icon="projects" accent foot={`${grupos.length} orígenes distintos`} delay={0} />
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

      {/* Resumen por origen */}
      <div className="card mb-4">
        <div className="card-h">
          <Icon name="layers" size={17} className="text-st-9" />
          <span className="ttl">Resumen por anuncio</span>
        </div>
        <div className="card-b p-0">
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

      {/* Detalle general por proyecto (sin desglose de costos) */}
      <div className="card">
        <div className="card-h">
          <Icon name="projects" size={17} className="text-acc" />
          <span className="ttl">Proyectos por utilidad</span>
          <span className="sub ml-auto">{proyectos.length} proyectos</span>
        </div>
        <div className="card-b p-0">
          <table className="tbl">
            <thead><tr><th>Proyecto</th><th>Anuncio (origen)</th><th className="num">Venta</th><th className="num">Utilidad</th></tr></thead>
            <tbody>
              {proyectos.map(({ p, venta, utilidad }) => (
                <tr key={p.id}>
                  <td><span className="mono text-acc font-semibold">{p.code}</span></td>
                  <td className="text-[12.5px]">{p.origen?.trim() || <span className="text-tx-3">Sin origen</span>}</td>
                  <td className="num text-[12.5px]">{fmtMoney(venta)}</td>
                  <td className="num font-semibold" style={{ color: utilidad < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmtMoney(utilidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
