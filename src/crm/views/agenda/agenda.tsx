// ============================================================
//  AGENDA — pendientes, recordatorios y citas por usuario.
//  La agenda es PERSONAL: cada quien ve la suya. Admin/Super Admin y
//  Dirección pueden además consultar la de cualquier persona (selector)
//  y agendarle cosas.
//  Vistas: DÍA (rejilla de 9:00 a 19:00) y SEMANA (lunes a domingo).
//  El aviso al iniciar sesión vive en <AgendaTodayModal> (abajo).
// ============================================================
import * as React from 'react'
import { useStore, sel, addDays, fmtDate, TODAY_ISO, MESES_L, isAdminRole, isDireccion } from '../../core/data'
import { Modal, Field, Input, Select, TextArea, Combobox, Confirm, Badge, Seg, Avatar, useUnsavedGuard } from '../../core/ui'
import { Icon, type IconName } from '../../core/icons'
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
    }
    : { kind, title: '', date, start: '09:00', end: '', location: '', notes: '', linkKind: '', linkId: '', userId: ownerId })

  const set = (k: keyof FormState, v: string) => setF(s => ({ ...s, [k]: v }))
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
            <Select value={f.userId} onChange={e => set('userId', e.target.value)}>
              {me && <option value={me.id}>Mi agenda ({me.name})</option>}
              {state.users.filter(u => u.active && u.id !== me?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        )}

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
function AgendaDetail({ event, onEdit, onClose, onOpenProject }: {
  event: AgendaEvent
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

  return (
    <Modal width={480} icon={meta.icon} title={event.title} sub={`${meta.label} · ${fmtDate(event.date)}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar</button>
        <div className="flex-1"></div>
        <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={14} /> Editar</button>
        <button className="btn btn-primary" onClick={() => { dispatch({ type: 'TOGGLE_AGENDA_DONE', id: event.id }); onClose() }}>
          <Icon name="check" size={15} /> {event.done ? 'Reabrir' : 'Marcar hecho'}
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
          {event.done ? <Badge color="var(--ok)">Hecho</Badge> : <Badge color="var(--warn)">Abierto</Badge>}
        </div>
        {owner && <div className="spread"><span className="text-tx-2">Agenda de</span><span>{owner.name}</span></div>}
      </div>

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
function EventCard({ event, onClick, compact }: { event: AgendaEvent; onClick: () => void; compact?: boolean }) {
  const meta = KIND_META[event.kind]
  const linkLabel = useLinkLabel()(event)
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-[7px] border px-2.5 py-1.5 transition-colors hover:bg-bg-3 bg-bg-2"
      style={{ borderColor: 'var(--line)', borderLeft: `3px solid ${meta.color}`, opacity: event.done ? 0.55 : 1 }}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="mono text-[11px] text-tx-2 shrink-0">{event.start}{event.end ? `–${event.end}` : ''}</span>
        <span className={'text-[12.5px] truncate ' + (event.done ? 'line-through text-tx-2' : 'font-semibold text-tx-0')}>{event.title}</span>
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

  // Eventos de la agenda que se está viendo.
  const mine = React.useMemo(
    () => state.agendaEvents.filter(e => e.userId === owner),
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
  const abiertos = dayEvents.filter(e => !e.done).length

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
                  {items.map(e => <EventCard key={e.id} event={e} onClick={() => setDetail(e)} />)}
                </div>
              </div>
            )
          })}
          {offGrid.length > 0 && (
            <div className="border-t border-line bg-bg-1 p-2.5">
              <div className="label-k mb-1.5">Fuera del horario (9:00 – 20:00)</div>
              <div className="flex flex-col gap-1.5">
                {offGrid.map(e => <EventCard key={e.id} event={e} onClick={() => setDetail(e)} />)}
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
                    : items.map(e => <EventCard key={e.id} event={e} onClick={() => setDetail(e)} compact />)}
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
        <AgendaDetail event={detail} onOpenProject={onOpenProject}
          onEdit={() => { setForm({ event: detail, kind: detail.kind }); setDetail(null) }}
          onClose={() => setDetail(null)} />
      )}
    </div>
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
    () => state.agendaEvents.filter(e => e.userId === me?.id && e.date === TODAY_ISO && !e.done).sort(sortByTime),
    [state.agendaEvents, me?.id],
  )
  const vencidos = React.useMemo(
    () => state.agendaEvents.filter(e => e.userId === me?.id && e.date < TODAY_ISO && !e.done)
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
