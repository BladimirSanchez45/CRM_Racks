// ============================================================
//  NOTIFICATIONS — campana del topbar: lista + detalle
//  Notificaciones dirigidas al usuario en sesión (no es el feed
//  global de actividad). Primer caso: proyecto asignado a un vendedor.
// ============================================================
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useStore, sel, fmtMoney } from '../../core/data'
import { Modal, Avatar, Empty } from '../../core/ui'
import { Icon, type IconName } from '../../core/icons'
import type { Notification, NotificationKind, Project } from '../../core/types'

/** Ícono por tipo de notificación. */
const KIND_ICON: Record<NotificationKind, IconName> = {
  project_assigned: 'flag',
  project_created: 'flag',
  internal_payment_requested: 'money',
  internal_payment_decided: 'money',
}

/** Fecha relativa amigable ("hace 5 min"). */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} día${d !== 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('es-MX')
}

export function NotificationsBell({ onOpenProject }: { onOpenProject: (p: Project) => void }) {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const [open, setOpen] = React.useState(false)
  const [detail, setDetail] = React.useState<Notification | null>(null)
  const [coords, setCoords] = React.useState<{ top: number; right: number }>({ top: 64, right: 12 })
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Abre/cierra anclando el panel a la posición del botón (se renderiza en un portal).
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setCoords({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen(o => !o)
  }

  // Cierra al hacer clic fuera (del botón y del panel) o con Escape.
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const mine = React.useMemo(
    () => state.notifications
      .filter(n => n.userId === me?.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.notifications, me?.id],
  )
  const unread = mine.filter(n => !n.read).length

  const openDetail = (n: Notification) => {
    if (!n.read) dispatch({ type: 'MARK_NOTIFICATION_READ', id: n.id })
    setDetail(n)
    setOpen(false)
  }

  const project = detail?.projectId ? state.projects.find(p => p.id === detail.projectId) : undefined

  return (
    <>
      <button ref={btnRef} className="icon-btn relative" title="Notificaciones" onClick={toggle}>
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 grid place-items-center rounded-full bg-danger text-white text-[9px] font-bold leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && createPortal(
          <div ref={panelRef} className="fixed w-[340px] card overflow-hidden p-0"
            style={{ top: coords.top, right: coords.right, zIndex: 1000, boxShadow: '0 12px 32px rgba(0,0,0,.28)' }}>
            <div className="card-h">
              <Icon name="bell" size={16} className="text-acc" />
              <span className="ttl">Notificaciones</span>
              <span className="flex-1"></span>
              {unread > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })}>
                  Marcar todas
                </button>
              )}
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {mine.length === 0 ? (
                <Empty icon="bell">Sin notificaciones</Empty>
              ) : (
                mine.map(n => (
                  <button key={n.id} onClick={() => openDetail(n)}
                    className="w-full flex items-start gap-2.5 text-left px-3.5 py-3 border-b border-line-soft bg-transparent hover:bg-bg-3 transition-colors"
                    style={n.read ? undefined : { boxShadow: 'inset 3px 0 0 var(--acc)' }}>
                    <span className={'mt-0.5 shrink-0 ' + (n.read ? 'text-tx-2' : 'text-acc')}><Icon name={KIND_ICON[n.kind] ?? 'bell'} size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className={'text-[12.5px] truncate ' + (n.read ? 'font-medium text-tx-1' : 'font-semibold text-tx-0')}>{n.title}</div>
                      <div className="text-[11.5px] text-tx-1 mt-0.5 leading-snug">{n.body}</div>
                      <div className="text-[10.5px] text-tx-3 mt-1">{timeAgo(n.createdAt)}</div>
                    </div>
                    {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-danger shrink-0"></span>}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
      )}

      {detail && (
        <Modal width={460} icon="bell" title={detail.title} sub={timeAgo(detail.createdAt)} onClose={() => setDetail(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setDetail(null)}>Cerrar</button>
            <div className="flex-1"></div>
            {project && (
              <button className="btn btn-primary" onClick={() => { onOpenProject(project); setDetail(null) }}>
                <Icon name="kanban" size={15} /> Ver proyecto
              </button>
            )}
          </>}>
          <p className="text-[13px] text-tx-1 mb-3.5">{detail.body}</p>
          {detail.actorName && (
            <div className="flex items-center gap-2 mb-3.5 text-[12.5px]">
              <Avatar name={detail.actorName} size={26} /> <span>Asignado por <b>{detail.actorName}</b></span>
            </div>
          )}
          {project ? (
            <div className="rounded-[8px] border border-line p-3 bg-bg-1 flex flex-col gap-2 text-[12.5px]">
              <div className="spread"><span className="text-tx-2">Proyecto</span><span className="mono text-acc font-semibold">{project.code}</span></div>
              <div className="spread"><span className="text-tx-2">Cliente</span><span>{sel.clientName(state, project.client) || '—'}</span></div>
              <div className="spread"><span className="text-tx-2">Ciudad</span><span>{project.city || '—'}</span></div>
              <div className="spread"><span className="text-tx-2">Sistema</span><span>{project.sistemaVendido || '—'}</span></div>
              <div className="spread"><span className="text-tx-2">Venta (c/IVA)</span><span className="font-semibold">{fmtMoney(sel.projectTotalConIva(project))}</span></div>
            </div>
          ) : (
            <div className="meta">El proyecto ya no está disponible.</div>
          )}
        </Modal>
      )}
    </>
  )
}
