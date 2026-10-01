// ============================================================
//  VACACIONES — cada quien ve su saldo y solicita; admin/superadmin
//  y dirección ven a todo el equipo, aprueban/rechazan y administran
//  empleados y paquetes de días.
//  Modelo: paquetes por aniversario (LFT sugerido, editable) con
//  VENCIMIENTO SUAVE (alerta, nunca descuenta solo). Saldo = otorgados
//  − tomados − pagados en nómina. Flujo espejo de Pagos internos:
//  Pendiente → (gestor) Aprobada | Rechazada; el dueño puede cancelar.
// ============================================================
import * as React from 'react'
import {
  useStore, sel, fmtDate, fmtDateShort, TODAY_ISO, daysBetween,
  isAdminRole, isDireccion,
  businessDaysLV, diasVacacionesLFT, aniosServicio, proximoAniversario,
} from '../../core/data'
import { Modal, Field, Input, TextArea, Select, Badge, Empty, Confirm, Avatar, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Employee, VacationEntitlement, VacationRequest, VacationRequestStatus } from '../../core/types'

const STATUS_COLOR: Record<VacationRequestStatus, string> = {
  Pendiente: 'var(--warn)', Aprobada: 'var(--ok)', Rechazada: 'var(--danger)', Cancelada: 'var(--tx-3)',
}
const statusBadge = (s: VacationRequestStatus) => <Badge color={STATUS_COLOR[s]}>{s}</Badge>

/** ISO + n meses (para el vencimiento default: aniversario + 6). */
const plusMonths = (iso: string, months: number): string => {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ---- Solicitud de vacaciones (propia, o a nombre de alguien si gestiona) ---- */
function RequestForm({ employeeId, onClose }: { employeeId?: string; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const manages = isAdminRole(state.currentUser?.role) || isDireccion(state.currentUser?.role)
  const [empId, setEmpId] = React.useState(employeeId ?? '')
  const [start, setStart] = React.useState('')
  const [end, setEnd] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const days = businessDaysLV(start, end)
  const bal = empId ? sel.vacBalance(state, empId) : null
  const excede = !!bal && days > bal.disponibles
  const valid = !!empId && days > 0
  const { requestClose, guard } = useUnsavedGuard({ empId, start, end, notes }, onClose)

  const save = () => {
    dispatch({ type: 'SAVE_VACATION_REQUEST', request: { employeeId: empId, startDate: start, endDate: end, days, notes } })
    onClose()
  }

  return (
    <Modal width={480} icon="sun" title="Solicitar vacaciones" onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}>
          <Icon name="check" size={15} /> Enviar a aprobación
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        {/* Sin empleado fijo solo llega aquí un gestor (capturar a nombre de alguien). */}
        {!employeeId && manages && (
          <Field label="Trabajador" span={2}>
            <Select value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">Selecciona…</option>
              {state.employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Desde"><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} /></Field>
        <div className="col-span-2 bg-bg-1 border border-line rounded-[8px] p-3 flex items-center justify-between text-[12.5px]">
          <div><div className="label-k">Días hábiles (L-V)</div><div className="font-display font-bold text-[20px] mt-0.5">{days}</div></div>
          {bal && <div className="text-right"><div className="label-k">Saldo disponible</div><div className={'font-display font-bold text-[20px] mt-0.5 ' + (bal.disponibles > 0 ? 'text-ok' : 'text-danger')}>{bal.disponibles}</div></div>}
        </div>
        {excede && (
          <div className="col-span-2 text-[11.5px] -mt-1" style={{ color: 'var(--warn)' }}>
            La solicitud excede el saldo disponible ({days} de {bal!.disponibles}). Se puede enviar, pero quien apruebe verá el excedente.
          </div>
        )}
        <Field label="Notas (opcional)" span={2}><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Motivo, cobertura del puesto, etc." /></Field>
      </div>
      {guard}
    </Modal>
  )
}

/* ---- Rechazo con motivo ---- */
function RejectModal({ req, onClose }: { req: VacationRequest; onClose: () => void }) {
  const { dispatch } = useStore()
  const [reason, setReason] = React.useState('')
  return (
    <Modal width={420} icon="close" title="Rechazar solicitud" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DECIDE_VACATION_REQUEST', id: req.id, approve: false, reason }); onClose() }}>
          <Icon name="close" size={14} /> Rechazar
        </button>
      </>}>
      <Field label="Motivo (se le notifica al solicitante)">
        <TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej. fechas con carga alta, empalme con otro compañero…" autoFocus />
      </Field>
    </Modal>
  )
}

/* ---- Alta / edición de trabajador ---- */
function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [name, setName] = React.useState(employee?.name ?? '')
  const [hireDate, setHireDate] = React.useState(employee?.hireDate ?? '')
  const [userId, setUserId] = React.useState(employee?.userId ?? '')
  const [active, setActive] = React.useState(employee?.active ?? true)
  const valid = !!name.trim() && !!hireDate
  // Un usuario solo puede estar ligado a UN empleado.
  const libres = state.users.filter(u => u.active && !state.employees.some(e => e.id !== employee?.id && e.userId === u.id))
  const save = () => {
    dispatch({ type: 'SAVE_EMPLOYEE', employee: { ...employee, name: name.trim(), hireDate, userId: userId || undefined, active } })
    onClose()
  }
  return (
    <Modal width={460} icon={employee ? 'edit' : 'plus'} title={employee ? 'Editar trabajador' : 'Nuevo trabajador'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Nombre completo" span={2}><Input value={name} onChange={e => setName(e.target.value)} placeholder="Como en nómina" /></Field>
        <Field label="Fecha de entrada"><Input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} /></Field>
        <Field label="Activo">
          <Select value={active ? '1' : '0'} onChange={e => setActive(e.target.value === '1')}>
            <option value="1">Sí</option><option value="0">No (baja)</option>
          </Select>
        </Field>
        <Field label="Usuario del CRM (para que vea y pida lo suyo)" span={2}>
          <Select value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="">Sin usuario (lo gestiona un administrador)</option>
            {libres.map(u => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

/* ---- Paquetes de días de un trabajador (lista + alta/edición) ---- */
function EntitlementForm({ employee, ent, onClose }: { employee: Employee; ent?: VacationEntitlement; onClose: () => void }) {
  const { dispatch } = useStore()
  // Sugerencia LFT para el paquete del PRÓXIMO aniversario.
  const aniv = proximoAniversario(employee.hireDate)
  const aniosAlAniv = aniosServicio(employee.hireDate, aniv)
  const sugeridos = diasVacacionesLFT(aniosAlAniv)
  const [label, setLabel] = React.useState(ent?.label ?? `Año ${aniosAlAniv} (${aniv.slice(0, 4)})`)
  const [days, setDays] = React.useState(String(ent?.days ?? sugeridos))
  const [taken, setTaken] = React.useState(String(ent?.daysTaken ?? 0))
  const [paid, setPaid] = React.useState(String(ent?.daysPaid ?? 0))
  const [obtainedOn, setObtainedOn] = React.useState(ent?.obtainedOn ?? aniv)
  const [expiresOn, setExpiresOn] = React.useState(ent?.expiresOn ?? plusMonths(aniv, 6))
  const [notes, setNotes] = React.useState(ent?.notes ?? '')
  const valid = +days >= 0 && !!label.trim()
  const save = () => {
    dispatch({ type: 'SAVE_VACATION_ENTITLEMENT', entitlement: {
      ...ent, employeeId: employee.id, label: label.trim(),
      days: Math.round(+days || 0), daysTaken: Math.round(+taken || 0), daysPaid: Math.round(+paid || 0),
      obtainedOn: obtainedOn || undefined, expiresOn: expiresOn || undefined, notes,
    } })
    onClose()
  }
  return (
    <Modal width={520} icon={ent ? 'edit' : 'plus'} title={ent ? 'Editar paquete de días' : 'Agregar paquete de días'} sub={employee.name} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      {!ent && (
        <div className="text-[11.5px] text-tx-2 mb-3">
          Sugerido por LFT al cumplir <b>{aniosAlAniv} año{aniosAlAniv !== 1 ? 's' : ''}</b> ({fmtDate(aniv)}): <b>{sugeridos} días</b>, vencen 6 meses después. Ajusta lo que haga falta.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Etiqueta" span={2}><Input value={label} onChange={e => setLabel(e.target.value)} /></Field>
        <Field label="Días otorgados"><Input type="number" min={0} value={days} onChange={e => setDays(e.target.value)} /></Field>
        <Field label="Se obtienen el"><Input type="date" value={obtainedOn} onChange={e => { setObtainedOn(e.target.value); if (e.target.value) setExpiresOn(plusMonths(e.target.value, 6)) }} /></Field>
        <Field label="Días ya tomados"><Input type="number" min={0} value={taken} onChange={e => setTaken(e.target.value)} /></Field>
        <Field label="Vencen el (alerta, no descuenta)"><Input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} /></Field>
        <Field label="Días pagados en nómina"><Input type="number" min={0} value={paid} onChange={e => setPaid(e.target.value)} /></Field>
        <Field label="Notas"><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. por pagar 1 en nómina" /></Field>
      </div>
    </Modal>
  )
}

function EntitlementsModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [edit, setEdit] = React.useState<VacationEntitlement | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [del, setDel] = React.useState<VacationEntitlement | null>(null)
  const paquetes = sel.vacEntitlementsFor(state, employee.id)
  const bal = sel.vacBalance(state, employee.id)
  return (
    <>
      <Modal width={640} icon="layers" title="Paquetes de días" sub={`${employee.name} · disponible: ${bal.disponibles} día${bal.disponibles !== 1 ? 's' : ''}`} onClose={onClose}
        footer={<>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <div className="flex-1"></div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={15} /> Agregar paquete</button>
        </>}>
        {paquetes.length === 0 ? <Empty icon="layers">Sin paquetes. Agrega el primero (la LFT se sugiere sola).</Empty> : (
          <table className="tbl">
            <thead><tr><th>Paquete</th><th className="num">Días</th><th className="num">Tomados</th><th className="num">Pagados</th><th className="num">Saldo</th><th>Vence</th><th></th></tr></thead>
            <tbody>
              {paquetes.map(p => {
                const saldo = p.days - p.daysTaken - p.daysPaid
                const vencido = !!p.expiresOn && p.expiresOn < TODAY_ISO
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium">{p.label || '—'}</div>
                      {p.notes && <div className="meta text-[10.5px]">{p.notes}</div>}
                    </td>
                    <td className="num">{p.days}</td>
                    <td className="num">{p.daysTaken}</td>
                    <td className="num">{p.daysPaid}</td>
                    <td className={'num font-semibold ' + (saldo < 0 ? 'text-danger' : '')}>{saldo}</td>
                    <td>
                      {p.expiresOn
                        ? <span style={{ color: vencido && saldo > 0 ? 'var(--danger)' : undefined }}>{fmtDateShort(p.expiresOn)}{vencido && saldo > 0 ? ' · vencido' : ''}</span>
                        : <span className="meta">—</span>}
                    </td>
                    <td className="num">
                      <button className="icon-btn" title="Editar" onClick={() => setEdit(p)}><Icon name="edit" size={14} /></button>
                      <button className="icon-btn" title="Eliminar" onClick={() => setDel(p)}><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Modal>
      {(adding || edit) && <EntitlementForm employee={employee} ent={edit ?? undefined} onClose={() => { setAdding(false); setEdit(null) }} />}
      {del && (
        <Confirm title="Eliminar paquete" message={`Se elimina "${del.label}" (${del.days} días) de ${employee.name}. Esta acción no se puede deshacer.`}
          onConfirm={() => { dispatch({ type: 'DELETE_VACATION_ENTITLEMENT', id: del.id }); setDel(null) }} onClose={() => setDel(null)} />
      )}
    </>
  )
}

/* ---- Página ---- */
export function VacacionesPage() {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const manages = isAdminRole(me?.role) || isDireccion(me?.role)
  const myEmp = sel.employeeForUser(state, me?.id)

  const [asking, setAsking] = React.useState(false)              // solicitar (propias)
  const [askingFor, setAskingFor] = React.useState(false)        // gestor: a nombre de alguien
  const [reject, setReject] = React.useState<VacationRequest | null>(null)
  const [empForm, setEmpForm] = React.useState<Employee | 'new' | null>(null)
  const [packs, setPacks] = React.useState<Employee | null>(null)
  const [cancel, setCancel] = React.useState<VacationRequest | null>(null)

  const myBal = myEmp ? sel.vacBalance(state, myEmp.id) : null
  const myReqs = myEmp ? sel.vacRequestsFor(state, myEmp.id) : []
  const pendientes = state.vacationRequests
    .filter(r => r.status === 'Pendiente')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const equipo = [...state.employees].sort((a, b) => a.name.localeCompare(b.name))

  const empName = (id: string) => state.employees.find(e => e.id === id)?.name ?? '—'
  const cancelar = (r: VacationRequest) =>
    dispatch({ type: 'SAVE_VACATION_REQUEST', request: { ...r, status: 'Cancelada' } })

  return (
    <div className="flex flex-col gap-4">

      {/* ---- Mi saldo y mis solicitudes ---- */}
      {myEmp ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="kpi kpi-accent"><div className="k-label">Días disponibles</div><div className="k-val text-[26px]">{myBal!.disponibles}</div><div className="k-foot">de {myBal!.asignados} otorgados</div></div>
            <div className="kpi"><div className="k-label">Por vencer / vencidos</div><div className={'k-val text-[26px]' + (myBal!.vencidos > 0 ? ' text-warn' : '')}>{myBal!.vencidos}</div><div className="k-foot">se acuerdan con tu gestor</div></div>
            <div className="kpi"><div className="k-label">Tomados</div><div className="k-val text-[26px]">{myBal!.tomados}</div><div className="k-foot">días de descanso</div></div>
            <div className="kpi"><div className="k-label">Pagados en nómina</div><div className="k-val text-[26px]">{myBal!.pagados}</div><div className="k-foot">días cobrados</div></div>
          </div>

          <div className="card overflow-hidden">
            <div className="card-h">
              <Icon name="sun" size={17} className="text-acc" />
              <span className="ttl">Mis solicitudes</span>
              <span className="flex-1"></span>
              <button className="btn btn-primary btn-sm" onClick={() => setAsking(true)}><Icon name="plus" size={14} /> Solicitar vacaciones</button>
            </div>
            {myReqs.length === 0 ? <Empty icon="sun">Aún no tienes solicitudes</Empty> : (
              <table className="tbl">
                <thead><tr><th>Periodo</th><th className="num">Días</th><th>Estado</th><th>Detalle</th><th></th></tr></thead>
                <tbody>
                  {myReqs.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-1.5 text-[12.5px]">
                          <Icon name="calendar" size={14} className="text-tx-2" />
                          {fmtDate(r.startDate)} <span className="text-tx-3">→</span> {fmtDate(r.endDate)}
                        </div>
                      </td>
                      <td className="num">
                        <span className="px-2 py-0.5 rounded-full font-bold text-[12px]" style={{ background: 'var(--acc-ghost)', color: 'var(--acc)' }}>{r.days}</span>
                      </td>
                      <td>{statusBadge(r.status)}</td>
                      <td className="text-[12px] text-tx-2">
                        {r.status === 'Rechazada' && r.rejectReason ? `Motivo: ${r.rejectReason}` : r.notes || '—'}
                      </td>
                      <td className="num">
                        {r.status === 'Pendiente' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setCancel(r)}>Cancelar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : !manages ? (
        <div className="card p-5 flex items-start gap-3">
          <Icon name="alert" size={20} className="text-warn mt-0.5" />
          <div className="text-[13px] text-tx-1">
            Tu usuario aún no está vinculado a un trabajador del catálogo de vacaciones.<br />
            <span className="text-tx-2">Pídele a un administrador que te vincule (Vacaciones → editar trabajador → Usuario del CRM) para ver tu saldo y solicitar días.</span>
          </div>
        </div>
      ) : null}

      {/* ---- Gestión (admin / superadmin / dirección) ---- */}
      {manages && (
        <>
          <div className="card overflow-hidden">
            <div className="card-h">
              <Icon name="bell" size={17} className="text-acc" />
              <span className="ttl">Por aprobar</span>
              <span className="flex-1"></span>
              <Badge color={pendientes.length ? 'var(--warn)' : 'var(--tx-3)'}>{pendientes.length}</Badge>
            </div>
            {pendientes.length === 0 ? (
              <div className="px-4 py-3.5 flex items-center gap-2 text-[12.5px] text-tx-2">
                <Icon name="check" size={15} className="text-ok" /> Sin solicitudes pendientes — todo al día
              </div>
            ) : (
              <div>
                {pendientes.map(r => {
                  const bal = sel.vacBalance(state, r.employeeId)
                  const excede = r.days > bal.disponibles
                  const nombre = empName(r.employeeId)
                  return (
                    <div key={r.id} className="flex items-center gap-3.5 px-4 py-3 border-b border-line-soft last:border-b-0 flex-wrap">
                      <Avatar name={nombre} size={34} />
                      <div className="min-w-[170px] flex-1">
                        <div className="font-semibold text-[13px]">{nombre}</div>
                        <div className="meta text-[11px]">solicitó {sel.userName(state, r.requestedBy ?? '')}{r.notes ? ` · ${r.notes}` : ''}</div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12.5px] text-tx-1">
                        <Icon name="calendar" size={14} className="text-tx-2" />
                        {fmtDate(r.startDate)} <span className="text-tx-3">→</span> {fmtDate(r.endDate)}
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full font-bold text-[12.5px]" style={{ background: 'var(--acc-ghost)', color: 'var(--acc)' }}>
                        {r.days} día{r.days !== 1 ? 's' : ''}
                      </span>
                      <Badge color={excede ? 'var(--danger)' : 'var(--ok)'} icon={excede ? 'alert' : undefined}>
                        saldo {bal.disponibles}
                      </Badge>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button className="btn btn-ghost btn-sm" onClick={() => setReject(r)}><Icon name="close" size={13} /> Rechazar</button>
                        <button className="btn btn-primary btn-sm" title={excede ? 'Excede el saldo: el sobrante quedará en negativo en su último paquete' : undefined}
                          onClick={() => dispatch({ type: 'DECIDE_VACATION_REQUEST', id: r.id, approve: true })}>
                          <Icon name="check" size={13} /> Aprobar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="card-h">
              <Icon name="clients" size={17} className="text-acc" />
              <span className="ttl">Equipo</span>
              <span className="meta">como el control de Excel · vencidos en rojo (no se descuentan solos)</span>
              <span className="flex-1"></span>
              <button className="btn btn-ghost btn-sm" onClick={() => setAskingFor(true)}><Icon name="sun" size={14} /> Capturar solicitud</button>
              <button className="btn btn-primary btn-sm" onClick={() => setEmpForm('new')}><Icon name="plus" size={14} /> Nuevo trabajador</button>
            </div>
            {equipo.length === 0 ? <Empty icon="clients">Sin trabajadores. Corre database/step31_vacaciones.sql para sembrar el Excel, o da de alta el primero.</Empty> : (
              <table className="tbl">
                <thead><tr><th>Trabajador</th><th>Ingreso</th><th style={{ minWidth: 170 }}>Uso de días</th><th className="num">Disponibles</th><th>Vencimiento</th><th></th></tr></thead>
                <tbody>
                  {equipo.map(e => {
                    const bal = sel.vacBalance(state, e.id)
                    const paquetes = sel.vacEntitlementsFor(state, e.id)
                    const prox = paquetes.find(p => p.expiresOn && p.days - p.daysTaken - p.daysPaid > 0)
                    const vencido = !!prox?.expiresOn && prox.expiresOn < TODAY_ISO
                    const diasAlVenc = prox?.expiresOn ? daysBetween(prox.expiresOn) : null
                    const porVencer = !vencido && diasAlVenc != null && diasAlVenc <= 45
                    const anios = aniosServicio(e.hireDate)
                    const usados = bal.tomados + bal.pagados
                    const pct = bal.asignados > 0 ? Math.min(100, Math.round((usados / bal.asignados) * 100)) : 0
                    return (
                      <tr key={e.id} className={!e.active ? 'opacity-50' : undefined}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={e.name} size={32} />
                            <div className="min-w-0">
                              <div className="font-semibold text-[12.5px] leading-tight truncate">{e.name}{!e.active && <span className="meta font-normal"> · baja</span>}</div>
                              <div className="meta text-[10.5px] mt-0.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full inline-block flex-none" style={{ background: e.userId ? 'var(--ok)' : 'var(--tx-3)' }}></span>
                                {e.userId ? sel.userName(state, e.userId) : 'Sin usuario ligado'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="text-[12.5px]">{fmtDateShort(e.hireDate)}</div>
                          <div className="meta text-[10.5px]">{anios} año{anios !== 1 ? 's' : ''}</div>
                        </td>
                        <td>
                          <div className="flex justify-between text-[10.5px] text-tx-2 mb-1">
                            <span>{usados} de {bal.asignados} usados</span>
                            <span className="mono">{pct}%</span>
                          </div>
                          <div className="bar"><i style={{ width: `${pct}%`, background: bal.disponibles < 0 ? 'var(--danger)' : 'var(--acc)' }}></i></div>
                          <div className="meta text-[10.5px] mt-1">{bal.tomados} tomado{bal.tomados !== 1 ? 's' : ''} · {bal.pagados} pagado{bal.pagados !== 1 ? 's' : ''} en nómina</div>
                        </td>
                        <td className="num">
                          <span className="font-display font-extrabold text-[21px] leading-none"
                            style={{ color: bal.disponibles > 0 ? 'var(--ok)' : bal.disponibles < 0 ? 'var(--danger)' : 'var(--tx-3)' }}>
                            {bal.disponibles}
                          </span>
                          <div className="meta text-[10px]">día{bal.disponibles !== 1 ? 's' : ''}</div>
                        </td>
                        <td>
                          {prox?.expiresOn ? (
                            vencido ? <Badge color="var(--danger)" icon="alert">Venció {fmtDateShort(prox.expiresOn)}</Badge>
                            : porVencer ? <Badge color="var(--warn)" icon="calendar">{fmtDateShort(prox.expiresOn)}</Badge>
                            : <span className="text-[12px] text-tx-2">{fmtDateShort(prox.expiresOn)}</span>
                          ) : <span className="meta">—</span>}
                        </td>
                        <td className="num whitespace-nowrap">
                          <button className="icon-btn" title="Paquetes de días" onClick={() => setPacks(e)}><Icon name="layers" size={14} /></button>
                          <button className="icon-btn" title="Editar" onClick={() => setEmpForm(e)}><Icon name="edit" size={14} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ---- modales ---- */}
      {asking && myEmp && <RequestForm employeeId={myEmp.id} onClose={() => setAsking(false)} />}
      {askingFor && <RequestForm onClose={() => setAskingFor(false)} />}
      {reject && <RejectModal req={reject} onClose={() => setReject(null)} />}
      {empForm && <EmployeeForm employee={empForm === 'new' ? undefined : empForm} onClose={() => setEmpForm(null)} />}
      {packs && <EntitlementsModal employee={packs} onClose={() => setPacks(null)} />}
      {cancel && (
        <Confirm title="Cancelar solicitud" message={`Se cancela tu solicitud del ${fmtDate(cancel.startDate)} al ${fmtDate(cancel.endDate)} (${cancel.days} días).`}
          confirmLabel="Cancelar solicitud"
          onConfirm={() => { cancelar(cancel); setCancel(null) }} onClose={() => setCancel(null)} />
      )}
    </div>
  )
}
