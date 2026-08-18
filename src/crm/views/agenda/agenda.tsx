// ============================================================
//  AGENDA — pendientes, recordatorios y citas por usuario.
//  La agenda es PERSONAL: cada quien ve la suya. Admin/Super Admin y
//  Dirección pueden además consultar la de cualquier persona (selector)
//  y agendarle cosas.
//  COMPARTIDAS: cualquiera puede invitar compañeros a una anotación; les
//  aparece en SU agenda (y les avisa) y cada quien la marca hecha por su
//  cuenta. Editarla o eliminarla es solo del organizador.
//  Vistas: DÍA (rejilla de 9:00 a 19:00) y SEMANA (lunes a domingo).
//  Avisos: <AgendaTodayModal> al iniciar sesión y <AgendaAlerts> (toast)
//  cuando llega la hora de una anotación con la app abierta.
// ============================================================
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useStore, sel, addDays, fmtDate, TODAY_ISO, MESES_L, isAdminRole, isDireccion, agendaIsFor, agendaDoneFor } from '../../core/data'
import { Modal, Field, Input, Select, TextArea, Combobox, Confirm, Badge, Seg, Avatar, useUnsavedGuard } from '../../core/ui'
import { Icon, type IconName } from '../../core/icons'
import { desktopEnabled, desktopNotify } from '../../core/desktop_notify'
import type { AgendaEvent, AgendaEventInput, AgendaKind, AgendaLinkKind, Project } from '../../core/types'

/* ---- Horario visible de la rejilla del día ---- */
const HOUR_START = 9
const HOUR_END = 19   // última franja mostrada (19:00 – 20:00)
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i)

const KIND_META: Record<AgendaKind, { label: string; icon: IconName; color: string }> = {
  pendiente:    { label: 'Pendiente',    icon: 'check',    color: 'var(--st-5)' },
  recordatorio: { label: 'Recordatorio', icon: 'bell',     color: 'var(--warn)' },
  cita:         { label: 'Cita',         icon: 'calendar', color: 'var(--acc)' },
}
const DIAS_S = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Hora ('HH:MM') → número de hora (9:30 → 9). */
const hourOf = (hhmm: string) => Number((hhmm || '').slice(0, 2)) || 0
/** Hora actual como 'HH:MM' (comparable con `AgendaEvent.start` por texto). */
const nowHHMM = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** Fecha de HOY recalculada al vuelo (TODAY_ISO se congela al cargar la app). */
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Lunes de la semana de una fecha ISO. */
const weekStart = (iso: string) => {
  const dow = (new Date(iso + 'T00:00:00').getDay() + 6) % 7   // 0 = lunes
  return addDays(-dow, iso)
}
const sortByTime = (a: AgendaEvent, b: AgendaEvent) => a.start.localeCompare(b.start)
/** Título legible del vínculo con el CRM (proyecto / prospecto / cliente). */
function useLinkLabel() {
  const { state } = useStore()
  return (e: AgendaEvent): string | null => {
    if (!e.linkKind || !e.linkId) return null
    if (e.linkKind === 'project') {
      const p = state.projects.find(x => x.id === e.linkId)
      return p ? `${p.code} · ${sel.clientName(state, p.client)}` : null
    }
    if (e.linkKind === 'prospect') return state.prospects.find(x => x.id === e.linkId)?.name ?? null
    return state.clients.find(x => x.id === e.linkId)?.name ?? null
  }
}

/* ============================================================
   Formulario de alta / edición
   ============================================================ */
type FormState = {
  id?: string
  kind: AgendaKind
  title: string
  date: string
  start: string
  end: string
  location: string
  notes: string
  linkKind: '' | AgendaLinkKind
  linkId: string
  userId: string
  participants: string[]
}

function AgendaForm({ event, kind, date, ownerId, onClose }: {
  event?: AgendaEvent
  kind: AgendaKind
  date: string
  ownerId: string
  onClose: () => void
}) {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const canAssign = isAdminRole(me?.role) || isDireccion(me?.role)

  const [f, setF] = React.useState<FormState>(() => event
    ? {
      id: event.id, kind: event.kind, title: event.title, date: event.date, start: event.start,
      end: event.end ?? '', location: event.location ?? '', notes: event.notes ?? '',
      linkKind: event.linkKind ?? '', linkId: event.linkId ?? '', userId: event.userId,
      participants: event.participants ?? [],
    }
    : { kind, title: '', date, start: '09:00', end: '', location: '', notes: '', linkKind: '', linkId: '', userId: ownerId, participants: [] })

  const set = (k: keyof FormState, v: string) => setF(s => ({ ...s, [k]: v }))
  // Invitar / quitar a un compañero de la anotación.
  const toggleGuest = (id: string) => setF(s => ({
    ...s,
    participants: s.participants.includes(id) ? s.participants.filter(x => x !== id) : [...s.participants, id],
  }))
  // Compañeros a los que se puede invitar: activos y que no sean ya el dueño.
  const invitables = state.users.filter(u => u.active && u.id !== f.userId)
  const isCita = f.kind === 'cita'
  const { requestClose, guard } = useUnsavedGuard(f, onClose)

  // Opciones del vínculo según el tipo elegido.
  const linkOptions = React.useMemo(() => {
    if (f.linkKind === 'project') return state.projects.map(p => ({ value: p.id, label: `${p.code} · ${sel.clientName(state, p.client)}`, sub: p.alias || p.city }))
    if (f.linkKind === 'prospect') return state.prospects.map(p => ({ value: p.id, label: p.name, sub: p.empresa || p.city }))
    if (f.linkKind === 'client') return state.clients.map(c => ({ value: c.id, label: c.name, sub: c.city }))
    return []
  }, [f.linkKind, state])

  // Una cita con hora fin anterior a la de inicio no tiene sentido.
  const horaOk = !isCita || !f.end || f.end > f.start
  const valid = f.title.trim() !== '' && !!f.date && !!f.start && horaOk

  const save = () => {
    if (!valid) return
    const payload: AgendaEventInput = {
      ...(event ?? {}),
      id: f.id,
      userId: f.userId,
      // El dueño puede haber cambiado (admin reasignando): que no quede invitado a lo suyo.
      participants: f.participants.filter(id => id !== f.userId),
      kind: f.kind,
      title: f.title.trim(),
      date: f.date,
      start: f.start,
      // Ubicación y hora fin son propias de las citas: si cambias el tipo, se limpian.
      end: isCita && f.end ? f.end : undefined,
      location: isCita && f.location.trim() ? f.location.trim() : undefined,
      notes: f.notes.trim() || undefined,
      linkKind: f.linkKind && f.linkId ? f.linkKind : undefined,
      linkId: f.linkKind && f.linkId ? f.linkId : undefined,
    }
    dispatch({ type: 'SAVE_AGENDA_EVENT', event: payload })
    onClose()
  }

  return (
    <Modal width={600} icon={KIND_META[f.kind].icon}
      title={event ? 'Editar anotación' : `Nuev${f.kind === 'cita' ? 'a' : 'o'} ${KIND_META[f.kind].label.toLowerCase()}`}
      onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}>
          <Icon name="check" size={15} /> {event ? 'Guardar' : 'Agendar'}
        </button>
      </>}>
      <div className="mb-3.5">
        <div className="label-k mb-1.5">Tipo de anotación</div>
        <Seg value={f.kind} onChange={v => set('kind', v)} options={[
          { value: 'pendiente', icon: 'check', label: 'Pendiente' },
          { value: 'recordatorio', icon: 'bell', label: 'Recordatorio' },
          { value: 'cita', icon: 'calendar', label: 'Cita' },
        ]} />
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Field label={isCita ? 'Asunto de la cita' : 'Título'} span={2}>
          <Input value={f.title} onChange={e => set('title', e.target.value)} autoFocus
            placeholder={isCita ? 'Ej. Visita técnica a planta' : f.kind === 'pendiente' ? 'Ej. Enviar cotización a CLIENTE X' : 'Ej. Llamar a proveedor'} />
        </Field>

        <Field label="Fecha"><Input type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
        <div className={isCita ? 'grid grid-cols-2 gap-3.5' : ''}>
          <Field label={isCita ? 'Inicio' : 'Hora'}><Input type="time" value={f.start} onChange={e => set('start', e.target.value)} /></Field>
          {isCita && <Field label="Fin"><Input type="time" value={f.end} onChange={e => set('end', e.target.value)} /></Field>}
        </div>

        {isCita && (
          <Field label="Ubicación" span={2}>
            <Input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Ej. Av. Industria 120, Naucalpan, Edo. Méx." />
          </Field>
        )}

        {/* Vínculo opcional con el CRM */}
        <Field label="Relacionado con">
          <Select value={f.linkKind} onChange={e => setF(s => ({ ...s, linkKind: e.target.value as FormState['linkKind'], linkId: '' }))}>
            <option value="">Nada en particular</option>
            <option value="project">Proyecto</option>
            <option value="prospect">Prospecto</option>
            <option value="client">Cliente</option>
          </Select>
        </Field>
        <Field label={f.linkKind === 'project' ? 'Proyecto' : f.linkKind === 'prospect' ? 'Prospecto' : 'Cliente'}>
          {f.linkKind
            ? <Combobox value={f.linkId} onChange={v => set('linkId', v)} options={linkOptions} placeholder="Buscar…" />
            : <Input value="" disabled placeholder="—" />}
        </Field>

        {canAssign && (
          <Field label="Agendar para" span={2}>
            <Select value={f.userId} onChange={e => setF(s => ({ ...s, userId: e.target.value, participants: s.participants.filter(id => id !== e.target.value) }))}>
              {me && <option value={me.id}>Mi agenda ({me.name})</option>}
              {state.users.filter(u => u.active && u.id !== me?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        )}

        {/* Participantes: a quien invites le aparece en SU agenda y le avisa a la hora. */}
        <Field label={`Con quién${f.participants.length ? ` · ${f.participants.length}` : ''}`} span={2}>
          <div className="border border-line rounded-[8px] bg-bg-1 p-1.5 max-h-[152px] overflow-y-auto flex flex-col gap-1">
            {invitables.length === 0
              ? <div className="meta px-1.5 py-1">No hay otros usuarios activos.</div>
              : invitables.map(u => {
                const on = f.participants.includes(u.id)
                return (
                  <button key={u.id} type="button" onClick={() => toggleGuest(u.id)}
                    className="flex items-center gap-2 w-full text-left rounded-[6px] px-2 py-1.5 border transition-colors hover:bg-bg-3 cursor-pointer"
                    style={{
                      borderColor: on ? 'var(--acc)' : 'transparent',
                      background: on ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'transparent',
                    }}>
                    <Avatar name={u.name} size={24} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12.5px] font-semibold text-tx-0 truncate">{u.name}</span>
                      {u.title && <span className="block meta truncate">{u.title}</span>}
                    </span>
                    <span className="shrink-0" style={{ color: on ? 'var(--acc)' : 'var(--tx-3)' }}>
                      <Icon name={on ? 'check' : 'plus'} size={15} />
                    </span>
                  </button>
                )
              })}
          </div>
          {f.participants.length > 0 && (
            <div className="meta mt-1.5">Les aparecerá en su agenda y cada quien la marca como hecha por su cuenta.</div>
          )}
        </Field>

        <Field label="Notas" span={2}>
          <TextArea rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Detalles, qué llevar, con quién…" />
        </Field>
      </div>

      {!horaOk && <div className="text-[11.5px] mt-2" style={{ color: 'var(--warn)' }}>La hora de fin debe ser posterior a la de inicio.</div>}
      {guard}
    </Modal>
  )
}

/* ============================================================
   Detalle de una anotación
   ============================================================ */
function AgendaDetail({ event, viewerId, onEdit, onClose, onOpenProject }: {
  event: AgendaEvent
  viewerId?: string        // agenda desde la que se abrió (la propia, o la de otro si es un admin consultando)
  onEdit: () => void
  onClose: () => void
  onOpenProject?: (p: Project) => void
}) {
  const { state, dispatch } = useStore()
  const [confirmDel, setConfirmDel] = React.useState(false)
  const meta = KIND_META[event.kind]
  const linkLabel = useLinkLabel()(event)
  const project = event.linkKind === 'project' ? state.projects.find(p => p.id === event.linkId) : undefined
  const owner = state.users.find(u => u.id === event.userId)
  const creator = event.createdBy && event.createdBy !== event.userId ? state.users.find(u => u.id === event.createdBy) : undefined

  const me = state.currentUser
  const viewer = viewerId || me?.id || ''
  const guests = (event.participants ?? []).map(id => state.users.find(u => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u)
  const shared = guests.length > 0
  // Hecho INDIVIDUAL: el botón cierra la anotación en la agenda que se está viendo.
  const doneForViewer = agendaDoneFor(event, viewer)
  const doneCount = shared ? (event.doneBy ?? []).length : 0
  // Editar y eliminar es del organizador (o de quien la registró / un admin):
  // un invitado no le borra la cita a los demás.
  const canManage = !shared || event.userId === me?.id || event.createdBy === me?.id || isAdminRole(me?.role) || isDireccion(me?.role)

  return (
    <Modal width={480} icon={meta.icon} title={event.title} sub={`${meta.label} · ${fmtDate(event.date)}`} onClose={onClose}
      footer={<>
        {canManage && <button className="btn btn-ghost" onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar</button>}
        <div className="flex-1"></div>
        {canManage && <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={14} /> Editar</button>}
        <button className="btn btn-primary" onClick={() => { dispatch({ type: 'TOGGLE_AGENDA_DONE', id: event.id, userId: viewer }); onClose() }}>
          <Icon name="check" size={15} /> {doneForViewer ? 'Reabrir' : 'Marcar hecho'}
        </button>
      </>}>
      <div className="rounded-[8px] border border-line p-3 bg-bg-1 flex flex-col gap-2 text-[12.5px]">
        <div className="spread"><span className="text-tx-2">Tipo</span><Badge color={meta.color}>{meta.label}</Badge></div>
        <div className="spread"><span className="text-tx-2">Horario</span>
          <span className="mono font-semibold">{event.start}{event.end ? ` – ${event.end}` : ''}</span>
        </div>
        {event.location && <div className="spread"><span className="text-tx-2">Ubicación</span><span className="text-right max-w-[62%]">{event.location}</span></div>}
        {linkLabel && <div className="spread"><span className="text-tx-2">Relacionado</span><span className="font-semibold text-right max-w-[62%]">{linkLabel}</span></div>}
        <div className="spread"><span className="text-tx-2">Estado</span>
          <span className="flex items-center gap-1.5">
            {doneForViewer ? <Badge color="var(--ok)">Hecho</Badge> : <Badge color="var(--warn)">Abierto</Badge>}
            {shared && <span className="meta">{doneCount} de {guests.length + 1} atendida</span>}
          </span>
        </div>
        {owner && <div className="spread"><span className="text-tx-2">{shared ? 'Organiza' : 'Agenda de'}</span><span>{owner.name}</span></div>}
      </div>

      {shared && (
        <div className="mt-3">
          <div className="label-k mb-1.5">Participantes</div>
          <div className="flex flex-col gap-1.5">
            {[owner, ...guests].filter((u): u is NonNullable<typeof u> => !!u).map(u => {
              const listo = (event.doneBy ?? []).includes(u.id)
              return (
                <div key={u.id} className="flex items-center gap-2 rounded-[7px] border border-line bg-bg-1 px-2.5 py-1.5">
                  <Avatar name={u.name} size={24} />
                  <span className="flex-1 min-w-0 text-[12.5px] truncate">
                    {u.name}
                    {u.id === event.userId && <span className="meta"> · organiza</span>}
                    {u.id === viewer && <span className="meta"> · tú</span>}
                  </span>
                  {listo
                    ? <Badge color="var(--ok)" icon="check">Hecho</Badge>
                    : <span className="meta">Pendiente</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {event.notes && <div className="mt-3 text-[12.5px] text-tx-1 whitespace-pre-wrap">{event.notes}</div>}
      {creator && <div className="meta mt-3 flex items-center gap-2"><Avatar name={creator.name} size={22} /> Agendado por {creator.name}</div>}

      {project && onOpenProject && (
        <button className="btn btn-ghost w-full mt-3.5" onClick={() => { onOpenProject(project); onClose() }}>
          <Icon name="kanban" size={15} /> Ver proyecto {project.code}
        </button>
      )}

      {confirmDel && <Confirm title="Eliminar anotación" message={`¿Eliminar "${event.title}" de la agenda?`}
        onConfirm={() => { dispatch({ type: 'DELETE_AGENDA_EVENT', id: event.id }); onClose() }}
        onClose={() => setConfirmDel(false)} />}
    </Modal>
  )
}

/* ============================================================
   Tarjeta compacta de un evento
   ============================================================ */
function EventCard({ event, viewerId, onClick, compact }: { event: AgendaEvent; viewerId?: string; onClick: () => void; compact?: boolean }) {
  const meta = KIND_META[event.kind]
  const linkLabel = useLinkLabel()(event)
  // En las compartidas, "hecho" es de cada quien: se pinta según la agenda que se ve.
  const done = agendaDoneFor(event, viewerId)
  const shared = !!event.participants?.length
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-[7px] border px-2.5 py-1.5 transition-colors hover:bg-bg-3 bg-bg-2"
      style={{ borderColor: 'var(--line)', borderLeft: `3px solid ${meta.color}`, opacity: done ? 0.55 : 1 }}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="mono text-[11px] text-tx-2 shrink-0">{event.start}{event.end ? `–${event.end}` : ''}</span>
        <span className={'text-[12.5px] truncate ' + (done ? 'line-through text-tx-2' : 'font-semibold text-tx-0')}>{event.title}</span>
        {shared && <span className="shrink-0 text-tx-3" title={`Compartida con ${event.participants!.length} persona(s)`}><Icon name="clients" size={12} /></span>}
      </div>
      {!compact && (event.location || linkLabel) && (
        <div className="meta mt-0.5 truncate flex items-center gap-1">
          {event.location && <><Icon name="pin" size={11} /> {event.location}</>}
          {event.location && linkLabel && <span className="text-tx-3">·</span>}
          {linkLabel}
        </div>
      )}
    </button>
  )
}

/* ============================================================
   Página
   ============================================================ */
export function AgendaPage({ onOpenProject }: { onOpenProject?: (p: Project) => void }) {
  const { state } = useStore()
  const me = state.currentUser
  const canSeeOthers = isAdminRole(me?.role) || isDireccion(me?.role)

  const [owner, setOwner] = React.useState(me?.id ?? '')
  const [view, setView] = React.useState('dia')          // dia | semana
  const [date, setDate] = React.useState(TODAY_ISO)
  const [form, setForm] = React.useState<{ event?: AgendaEvent; kind: AgendaKind } | null>(null)
  const [detail, setDetail] = React.useState<AgendaEvent | null>(null)

  // Eventos de la agenda que se está viendo: los propios MÁS aquellos a los que
  // esa persona fue invitada por alguien más.
  const mine = React.useMemo(
    () => state.agendaEvents.filter(e => agendaIsFor(e, owner)),
    [state.agendaEvents, owner],
  )
  const forDay = React.useCallback((d: string) => mine.filter(e => e.date === d).sort(sortByTime), [mine])

  const dayEvents = forDay(date)
  // Fuera de la rejilla 9–20: se listan aparte para que nunca se pierdan de vista.
  const offGrid = dayEvents.filter(e => hourOf(e.start) < HOUR_START || hourOf(e.start) > HOUR_END)
  const semana = Array.from({ length: 7 }, (_, i) => addDays(i, weekStart(date)))

  const step = view === 'dia' ? 1 : 7
  const titulo = view === 'dia'
    ? fmtDate(date)
    : `${fmtDate(semana[0])} – ${fmtDate(semana[6])}`
  const abiertos = dayEvents.filter(e => !agendaDoneFor(e, owner)).length

  return (
    <div>
      <div className="spread mb-3.5">
        <div className="sec-title m-0">
          <h2>Agenda</h2>
          <span className="sub">{view === 'dia' ? `${dayEvents.length} anotacion${dayEvents.length === 1 ? '' : 'es'} · ${abiertos} sin atender` : 'Vista semanal'}</span>
        </div>
        <div className="flex items-center gap-2">
          {canSeeOthers && (
            <Select value={owner} onChange={e => setOwner(e.target.value)} className="w-auto min-w-[180px]">
              {me && <option value={me.id}>Mi agenda</option>}
              {state.users.filter(u => u.active && u.id !== me?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
          {/* Un solo botón: el TIPO (pendiente / recordatorio / cita) se elige dentro del modal. */}
          <button className="btn btn-primary" onClick={() => setForm({ kind: 'pendiente' })}><Icon name="plus" size={15} /> Agendar</button>
        </div>
      </div>

      {/* Barra de navegación de fechas */}
      <div className="card mb-3.5">
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <button className="icon-btn" title="Anterior" onClick={() => setDate(addDays(-step, date))}>
            <Icon name="chevron" size={16} className="rotate-180" />
          </button>
          <button className="icon-btn" title="Siguiente" onClick={() => setDate(addDays(step, date))}>
            <Icon name="chevron" size={16} />
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setDate(TODAY_ISO)}>Hoy</button>
          <div className="text-[14px] font-semibold text-tx-0 ml-1.5">{titulo}</div>
          {date === TODAY_ISO && view === 'dia' && <Badge color="var(--acc)">Hoy</Badge>}
          <span className="flex-1"></span>
          <Seg value={view} onChange={setView} options={[{ value: 'dia', label: 'Día' }, { value: 'semana', label: 'Semana' }]} />
        </div>
      </div>

      {view === 'dia' ? (
        <div className="card overflow-hidden">
          {HOURS.map(h => {
            const items = dayEvents.filter(e => hourOf(e.start) === h)
            return (
              <div key={h} className="flex items-stretch border-b border-line-soft last:border-b-0">
                <div className="w-[64px] shrink-0 px-3 py-2 text-right mono text-[11.5px] text-tx-3 border-r border-line-soft">
                  {String(h).padStart(2, '0')}:00
                </div>
                <div className="flex-1 min-w-0 p-1.5 min-h-[46px] flex flex-col gap-1.5">
                  {items.map(e => <EventCard key={e.id} event={e} viewerId={owner} onClick={() => setDetail(e)} />)}
                </div>
              </div>
            )
          })}
          {offGrid.length > 0 && (
            <div className="border-t border-line bg-bg-1 p-2.5">
              <div className="label-k mb-1.5">Fuera del horario (9:00 – 20:00)</div>
              <div className="flex flex-col gap-1.5">
                {offGrid.map(e => <EventCard key={e.id} event={e} viewerId={owner} onClick={() => setDetail(e)} />)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {semana.map((d, i) => {
            const items = forDay(d)
            const esHoy = d === TODAY_ISO
            return (
              <div key={d} className="card overflow-hidden flex flex-col" style={esHoy ? { borderColor: 'var(--acc)' } : undefined}>
                {/* El botón va SIN fondo propio (el navegador se lo pone gris por defecto);
                    el borde inferior lo pone el contenedor para no pelearse con el reset. */}
                <div className="border-b border-line">
                  <button className="w-full px-2.5 py-2 text-left bg-transparent border-none cursor-pointer hover:bg-bg-3 transition-colors"
                    style={esHoy ? { background: 'color-mix(in srgb, var(--acc) 14%, transparent)' } : undefined}
                    onClick={() => { setDate(d); setView('dia') }}>
                    <div className="label-k">{DIAS_S[i]}</div>
                    <div className={'font-display font-bold text-[15px] ' + (esHoy ? 'text-acc' : 'text-tx-0')}>{Number(d.slice(8, 10))}</div>
                  </button>
                </div>
                <div className="p-1.5 flex flex-col gap-1.5 min-h-[160px]">
                  {items.length === 0
                    ? <div className="meta text-center mt-3">—</div>
                    : items.map(e => <EventCard key={e.id} event={e} viewerId={owner} onClick={() => setDetail(e)} compact />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'dia' && dayEvents.length === 0 && (
        <div className="meta text-center mt-2.5">Sin anotaciones para este día</div>
      )}

      {form && <AgendaForm event={form.event} kind={form.kind} date={date} ownerId={owner} onClose={() => setForm(null)} />}
      {detail && !form && (
        <AgendaDetail event={detail} viewerId={owner} onOpenProject={onOpenProject}
          onEdit={() => { setForm({ event: detail, kind: detail.kind }); setDetail(null) }}
          onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

/* ============================================================
   Aviso EN EL MOMENTO: toast al llegar la hora de una anotación.
   Solo funciona con la app abierta (no son notificaciones del sistema).
   Regla: se avisa de las anotaciones propias (o en las que uno está
   invitado), de HOY, que uno no ha marcado como hechas, cuya hora ya llegó
   Y que no habían pasado cuando se abrió la app — así al entrar no salta un
   montón de avisos viejos (de eso se encarga <AgendaTodayModal>).
   ============================================================ */
const TICK_MS = 15_000   // cada cuánto se revisa el reloj

export function AgendaAlerts({ onOpenAgenda }: { onOpenAgenda: () => void }) {
  const { state, dispatch } = useStore()
  const me = state.currentUser

  // Refs para que el temporizador lea siempre lo último sin re-suscribirse.
  // Se refrescan DESPUÉS de cada render (no durante), como pide React.
  const eventsRef = React.useRef(state.agendaEvents)
  const meRef = React.useRef(me?.id)
  React.useEffect(() => { eventsRef.current = state.agendaEvents; meRef.current = me?.id })
  // Hora en la que arrancó la vigilancia: nada anterior a esto dispara aviso.
  const sinceRef = React.useRef(nowHHMM())
  const dayRef = React.useRef(todayISO())
  const alerted = React.useRef<Set<string>>(new Set())
  const [shown, setShown] = React.useState<string[]>([])

  React.useEffect(() => {
    const check = () => {
      const hoy = todayISO()
      // Si la app quedó abierta y cambió el día, se reinicia la ventana de vigilancia.
      if (hoy !== dayRef.current) { dayRef.current = hoy; sinceRef.current = '00:00' }
      const now = nowHHMM()
      const due = eventsRef.current.filter(e =>
        agendaIsFor(e, meRef.current) && !agendaDoneFor(e, meRef.current) && e.date === hoy &&
        e.start <= now && e.start >= sinceRef.current && !alerted.current.has(e.id))
      if (!due.length) return
      due.forEach(e => alerted.current.add(e.id))
      // Además del aviso dentro de la app, notificación del sistema si el
      // usuario las activó en Configuración (útil con la pestaña de fondo).
      if (desktopEnabled(meRef.current)) {
        due.forEach(e => desktopNotify({
          title: `${KIND_META[e.kind].label} · ${e.start}`,
          body: e.location ? `${e.title}\n📍 ${e.location}` : e.title,
          tag: e.id,
        }))
      }
      setShown(s => [...s, ...due.map(e => e.id)])
    }
    const iv = window.setInterval(check, TICK_MS)
    return () => clearInterval(iv)
  }, [])

  const dismiss = (id: string) => setShown(s => s.filter(x => x !== id))
  // Se resuelven contra el estado vivo: si se borra o se cierra en otro lado, el toast se va.
  const toasts = shown
    .map(id => state.agendaEvents.find(e => e.id === id))
    .filter((e): e is AgendaEvent => !!e && !agendaDoneFor(e, me?.id))

  if (toasts.length === 0) return null

  // Al centro y sobre un velo oscuro: el aviso interrumpe a propósito, para que
  // no se pase de largo. Solo se cierra con un botón (el velo no lo descarta).
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-5 overflow-y-auto"
      style={{ zIndex: 1200, background: 'rgba(20,28,42,0.45)', backdropFilter: 'blur(4px)' }}>
      <div className="flex flex-col gap-3 w-full max-w-[440px]">
        {toasts.map(e => {
          const meta = KIND_META[e.kind]
          return (
            <div key={e.id} className="modal" style={{ borderLeft: `4px solid ${meta.color}` }}>
              <div className="flex items-start gap-3.5 px-5 pt-5 pb-4">
                <span className="shrink-0 grid place-items-center rounded-full w-10 h-10"
                  style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 16%, transparent)` }}>
                  <Icon name={meta.icon} size={20} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="label-k">{meta.label} · {e.start}{e.end ? `–${e.end}` : ''}</div>
                  <div className="font-display font-bold text-[16px] text-tx-0 mt-0.5">{e.title}</div>
                  {e.location && (
                    <div className="meta mt-1.5 flex items-center gap-1"><Icon name="pin" size={12} /> {e.location}</div>
                  )}
                  {e.notes && <div className="text-[12.5px] text-tx-1 mt-2 whitespace-pre-wrap">{e.notes}</div>}
                </div>
                <button className="icon-btn shrink-0 bg-transparent border-none" title="Cerrar" onClick={() => dismiss(e.id)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div className="flex gap-2.5 px-5 pb-5">
                <button className="btn btn-ghost flex-1" onClick={() => { onOpenAgenda(); dismiss(e.id) }}>Ver agenda</button>
                <button className="btn btn-primary flex-1" onClick={() => { dispatch({ type: 'TOGGLE_AGENDA_DONE', id: e.id, userId: me?.id }); dismiss(e.id) }}>
                  <Icon name="check" size={15} /> Hecho
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

/* ============================================================
   Aviso al iniciar sesión: "Tu agenda de hoy"
   Muestra lo de HOY sin atender + lo vencido de días anteriores.
   Se abre una vez por sesión (sessionStorage), igual que el modal
   de Proyectos por vencer.
   ============================================================ */
export function AgendaTodayModal({ onOpenAgenda }: { onOpenAgenda: () => void }) {
  const { state } = useStore()
  const me = state.currentUser
  const linkLabel = useLinkLabel()

  const hoy = React.useMemo(
    () => state.agendaEvents.filter(e => agendaIsFor(e, me?.id) && e.date === TODAY_ISO && !agendaDoneFor(e, me?.id)).sort(sortByTime),
    [state.agendaEvents, me?.id],
  )
  const vencidos = React.useMemo(
    () => state.agendaEvents.filter(e => agendaIsFor(e, me?.id) && e.date < TODAY_ISO && !agendaDoneFor(e, me?.id))
      .sort((a, b) => b.date.localeCompare(a.date) || sortByTime(a, b)),
    [state.agendaEvents, me?.id],
  )
  const total = hoy.length + vencidos.length

  const seenKey = me ? `agenda_today_seen_${me.id}` : ''
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (!me || total === 0) return
    let already = false
    try { already = sessionStorage.getItem(seenKey) === '1' } catch { /* ignore */ }
    if (!already) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, total])

  const close = () => {
    try { sessionStorage.setItem(seenKey, '1') } catch { /* ignore */ }
    setOpen(false)
  }

  if (!open || total === 0) return null

  const fila = (e: AgendaEvent, vencido?: boolean) => {
    const meta = KIND_META[e.kind]
    const link = linkLabel(e)
    // Si me invitaron a la anotación de alguien más, se dice de quién es.
    const organiza = e.userId !== me?.id ? state.users.find(u => u.id === e.userId)?.name : undefined
    return (
      <div key={e.id} className="flex items-start gap-2.5 px-3 py-2.5 border-b border-line-soft last:border-b-0">
        <span className="mt-0.5 shrink-0" style={{ color: meta.color }}><Icon name={meta.icon} size={15} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-tx-0">{e.title}</div>
          <div className="meta mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="mono">{e.start}{e.end ? `–${e.end}` : ''}</span>
            <span className="text-tx-3">·</span>
            <span>{meta.label}</span>
            {vencido && <><span className="text-tx-3">·</span><span style={{ color: 'var(--danger)' }}>{fmtDate(e.date)}</span></>}
            {e.location && <><span className="text-tx-3">·</span><span className="inline-flex items-center gap-1"><Icon name="pin" size={11} /> {e.location}</span></>}
            {link && <><span className="text-tx-3">·</span><span>{link}</span></>}
            {organiza && <><span className="text-tx-3">·</span><span className="inline-flex items-center gap-1"><Icon name="clients" size={11} /> {organiza}</span></>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Modal width={620} icon="calendar" title="Tu agenda de hoy"
      sub={`${MESES_L[Number(TODAY_ISO.slice(5, 7)) - 1]} ${Number(TODAY_ISO.slice(8, 10))} · ${total} anotación${total === 1 ? '' : 'es'} por atender`}
      onClose={close}
      footer={<>
        <button className="btn btn-ghost" onClick={() => { onOpenAgenda(); close() }}><Icon name="calendar" size={15} /> Abrir agenda</button>
        <div className="flex-1"></div>
        <button className="btn btn-primary" onClick={close}><Icon name="check" size={15} /> Entendido</button>
      </>}>
      {vencidos.length > 0 && (
        <>
          <div className="flex items-start gap-3 mb-3 p-3 rounded-[8px] border"
            style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}>
            <Icon name="alert" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--danger)' }} />
            <div className="text-[12.5px] text-tx-2">
              Tienes <strong>{vencidos.length}</strong> anotación{vencidos.length === 1 ? '' : 'es'} de días anteriores sin marcar como hecha.
            </div>
          </div>
          <div className="border border-line rounded-[8px] overflow-hidden mb-4">{vencidos.map(e => fila(e, true))}</div>
        </>
      )}

      {hoy.length > 0 ? (
        <>
          <div className="label-k mb-1.5">Hoy</div>
          <div className="border border-line rounded-[8px] overflow-hidden">{hoy.map(e => fila(e))}</div>
        </>
      ) : (
        <div className="meta">Hoy no tienes nada agendado.</div>
      )}
    </Modal>
  )
}
