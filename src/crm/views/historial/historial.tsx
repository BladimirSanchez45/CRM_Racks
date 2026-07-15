// ============================================================
//  HISTORIAL DE PROYECTOS — proyectos finalizados con comisiones ya pagadas.
//  Se archivan automáticamente (para no acumularlos en Proyectos). Solo consulta;
//  se pueden restaurar a Proyectos desde el detalle si hiciera falta.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, isVentasRole } from '../../core/data'
import { KPI, Empty } from '../../core/ui'
import { ProjectsTable } from '../projects/projects'
import { ProjectDetail } from '../projects/project_views'
import type { Project } from '../../core/types'

export function HistorialPage() {
  const { state } = useStore()
  const me = state.currentUser
  const isVentas = isVentasRole(me?.role)
  const [detail, setDetail] = React.useState<Project | null>(null)

  // Archivados = finalizados con comisiones pagadas (no restaurados). Ventas solo los suyos.
  const archived = state.projects
    .filter(p => sel.isProjectArchived(state, p) && (!isVentas || p.seller === me?.id))
    .sort((a, b) => ((a.closedOn || a.updated || '') < (b.closedOn || b.updated || '') ? 1 : -1))

  const ventaTotal = archived.reduce((a, p) => a + sel.projectTotalConIva(p), 0)
  const utilidad = archived.reduce((a, p) => a + sel.projectUtilidadSub(state, p), 0)

  const openDetail = (p: Project) => setDetail(p)

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0">
          <h2>Historial de proyectos</h2>
          <span className="sub">Finalizados con comisiones pagadas · {archived.length} proyecto{archived.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <KPI label="Proyectos archivados" value={archived.length} icon="check" accent />
        <KPI label="Venta acumulada (c/IVA)" value={ventaTotal} format={fmtMoney} icon="money" />
        <KPI label="Utilidad acumulada (s/IVA)" value={utilidad} format={fmtMoney} icon="commissions" />
      </div>

      {archived.length === 0 ? (
        <Empty icon="check">Aún no hay proyectos archivados. Un proyecto llega aquí cuando se finaliza y se pagan todas sus comisiones.</Empty>
      ) : (
        <>
          <ProjectsTable projects={archived} onOpen={openDetail} historial />
        </>
      )}

      {detail && <ProjectDetail project={detail} onClose={() => setDetail(null)} onEdit={() => {}} historial />}
    </div>
  )
}
