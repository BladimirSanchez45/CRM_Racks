// ============================================================
//  MODAL "PROYECTOS POR VENCER" — recordatorio al iniciar sesión
//  Para VENTAS (solo sus proyectos) y LOGÍSTICA (todos): al entrar les
//  aparece un modal grande con los proyectos por vencer para darles
//  prioridad. Se muestra una vez por sesión (sessionStorage).
// ============================================================
import * as React from 'react'
import { useStore, sel, daysBetween, stageIndex, fmtMoney, fmtDate, cityAbbr } from '../../core/data'
import { Modal, StageBadge } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Project } from '../../core/types'

/** Un proyecto está "por vencer" si está en la etapa Por Vencer (entrega_est), o si
 *  su ETA ya venció y todavía no llega a "Pago Recibido" (red de seguridad). */
export const isDueSoon = (p: Project): boolean => {
  if (p.stage === 'finalizado') return false
  if (p.stage === 'entrega_est') return true
  const d = daysBetween(p.eta)
  return !!p.eta && d != null && d < 0 && stageIndex(p.stage) < stageIndex('pago')
}

export function DueSoonModal({ onOpenProject }: { onOpenProject: (p: Project) => void }) {
  const { state } = useStore()
  const me = state.currentUser
  const role = me?.role
  const applies = role === 'ventas' || role === 'logistica'

  // Proyectos por vencer del alcance del usuario (ventas: los suyos; logística: todos),
  // ordenados por urgencia (más vencidos / más próximos primero).
  const list = React.useMemo(() => {
    if (!applies || !me) return []
    return state.projects
      .filter(p => (role === 'ventas' ? p.seller === me.id : true) && isDueSoon(p))
      .sort((a, b) => (daysBetween(a.eta) ?? 9999) - (daysBetween(b.eta) ?? 9999))
  }, [state.projects, me, role, applies])

  const seenKey = me ? `due_soon_seen_${me.id}` : ''
  const [open, setOpen] = React.useState(false)
  // Abre una vez por sesión cuando ya hay proyectos por vencer cargados.
  React.useEffect(() => {
    if (!applies || !me || list.length === 0) return
    let already = false
    try { already = sessionStorage.getItem(seenKey) === '1' } catch { /* ignore */ }
    if (!already) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applies, me?.id, list.length])

  const close = () => {
    try { sessionStorage.setItem(seenKey, '1') } catch { /* ignore */ }
    setOpen(false)
  }

  if (!open || list.length === 0) return null

  // Abre el detalle ENCIMA del aviso (sin cerrarlo): así puedes revisar varios
  // proyectos y el aviso sigue disponible hasta que le des "Entendido".
  const openOne = (p: Project) => onOpenProject(p)

  return (
    <Modal width={860} icon="calendar" title="Proyectos por vencer"
      sub={`Tienes ${list.length} proyecto${list.length === 1 ? '' : 's'} que requieren prioridad`}
      onClose={close}
      footer={<><div className="flex-1"></div>
        <button className="btn btn-primary" onClick={close}><Icon name="check" size={15} /> Entendido</button>
      </>}>
      <div className="flex items-start gap-3 mb-4 p-3 rounded-[8px] border"
        style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
        <Icon name="alert" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--warn)' }} />
        <div className="text-[12.5px] text-tx-2">
          Estos proyectos están <strong>próximos a la fecha de entrega o ya vencidos</strong>. Dales
          prioridad para no retrasar la entrega ni el cobro. Haz clic en uno para ver su detalle.
        </div>
      </div>

      <div className="border border-line rounded-[8px] overflow-hidden">
        <div className="max-h-[52vh] overflow-y-auto">
          <table className="tbl">
            <thead><tr>
              <th>Proyecto</th><th>Cliente</th><th>Ciudad</th><th>Etapa</th>
              <th className="num">Entrega</th><th className="num">Saldo por cobrar</th>
            </tr></thead>
            <tbody>
              {list.map(p => {
                const eta = daysBetween(p.eta) as number
                const saldo = sel.projectSaldoCliente(state, p)
                return (
                  <tr key={p.id} onClick={() => openOne(p)}>
                    <td><span className="mono text-acc font-semibold">{p.code}</span></td>
                    <td>
                      <div className="text-[12.5px]">{sel.clientName(state, p.client)}</div>
                      {p.alias && <div className="meta truncate max-w-[180px]" title={p.alias}>“{p.alias}”</div>}
                    </td>
                    <td className="text-tx-1"><span title={p.city}>{cityAbbr(p.city)}</span></td>
                    <td><StageBadge stage={p.stage} size="sm" /></td>
                    <td className="num whitespace-nowrap">
                      {p.eta ? (
                        <span style={{ color: eta < 0 ? 'var(--danger)' : eta <= 3 ? 'var(--warn)' : 'var(--tx-1)' }}>
                          {fmtDate(p.eta)}
                          <div className="mono text-[11px]">{eta < 0 ? `${-eta}d vencido` : `${eta}d`}</div>
                        </span>
                      ) : <span className="text-tx-3">—</span>}
                    </td>
                    <td className="num" style={{ color: saldo > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(saldo)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
