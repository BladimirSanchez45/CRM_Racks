// ============================================================
//  MOVIMIENTOS — gastos "por fuera" organizados por LISTAS.
//  Cada semana (jueves) el admin arma una lista con su nombre, su saldo de
//  cuenta y sus movimientos; la envía y Dirección la autoriza.
//  Lista: Borrador → (admin envía) Pendiente → (dirección) Autorizada | Rechazada
//  Total de la lista = subtotal + 5.3% (comisión bancaria fija).
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, fmtDateShort, TODAY_ISO, isAdminRole, isDireccion, COMISION_BANCARIA } from '../../core/data'
import { signedDocUrl } from '../../core/api'
import { Modal, Field, Input, TextArea, Select, MoneyInput, Badge, Empty, KPI, Confirm, FileField, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Movement, MovementInput, MovementStatus, MovementList, MovementListInput, MovementListStatus } from '../../core/types'

const LIST_STATUS_COLOR: Record<MovementListStatus, string> = {
  // Autorizada en azul para no confundirla con "Pagada" (verde).
  Borrador: 'var(--tx-3)', Pendiente: 'var(--warn)', Autorizada: 'var(--acc)', Rechazada: 'var(--danger)',
}
const MOV_STATUS_COLOR: Record<MovementStatus, string> = {
  Pendiente: 'var(--warn)', Autorizado: 'var(--ok)', Rechazado: 'var(--danger)',
}
// Una lista Autorizada con comprobante se muestra como "Pagada".
const listBadge = (l: MovementList) =>
  l.status === 'Autorizada' && l.comprobantePath
    ? <Badge color="var(--ok)" icon="check">Pagada</Badge>
    : <Badge color={LIST_STATUS_COLOR[l.status]}>{l.status}</Badge>
const movBadge = (s: MovementStatus) => <Badge color={MOV_STATUS_COLOR[s]}>{s}</Badge>

const listTotals = (movs: Movement[]) => {
  // Los movimientos eliminados por Dirección (borrado suave) no suman.
  const subtotal = movs.filter(m => m.changedByDireccion !== 'removed').reduce((a, m) => a + (m.amount || 0), 0)
  const comision = subtotal * COMISION_BANCARIA
  return { subtotal, comision, total: subtotal + comision }
}

/* Chip de intervención de Dirección sobre la lista enviada. */
const DIR_CHIP: Record<NonNullable<Movement['changedByDireccion']>, { label: string; color: string }> = {
  added: { label: 'Agregado por Dir.', color: 'var(--st-5)' },
  edited: { label: 'Editado por Dir.', color: 'var(--acc)' },
  removed: { label: 'Eliminado por Dir.', color: 'var(--danger)' },
}
function DirChip({ kind }: { kind?: Movement['changedByDireccion'] }) {
  if (!kind) return null
  const c = DIR_CHIP[kind]
  return <span className="inline-block text-[10px] font-semibold px-1.5 py-px rounded-full" style={{ color: c.color, border: `1px solid ${c.color}`, opacity: 0.9 }}>{c.label}</span>
}

/* Nombre auto-sugerido: "Lista jue 26 jun" (editable). */
function defaultListName(): string {
  const f = new Date().toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\.|,/g, '')
  return `Lista ${f}`
}

type ListFilter = 'activas' | 'Autorizada' | 'Rechazada' | 'todas'
const LIST_FILTERS: { key: ListFilter; label: string }[] = [
  { key: 'activas', label: 'Activas' },
  { key: 'Autorizada', label: 'Autorizadas' },
  { key: 'Rechazada', label: 'Rechazadas' },
  { key: 'todas', label: 'Todas' },
]
const matchesListFilter = (l: MovementList, f: ListFilter) =>
  f === 'todas' ? true
  : f === 'activas' ? (l.status === 'Borrador' || l.status === 'Pendiente')
  : l.status === f

/* ============================================================
   Formulario de LISTA (crear / editar nombre, fecha, saldo)
   ============================================================ */
function MovementListForm({ list, prefillBalance, onClose, onCreated }: { list?: MovementList; prefillBalance: number; onClose: () => void; onCreated?: (id: string) => void }) {
  const { dispatch } = useStore()
  const [l, setL] = React.useState(() => list
    ? { name: list.name, date: list.date, bankBalance: list.bankBalance as number | string }
    : { name: defaultListName(), date: TODAY_ISO, bankBalance: prefillBalance as number | string })
  const set = (k: keyof typeof l, v: unknown) => setL(s => ({ ...s, [k]: v }))
  const valid = String(l.name).trim() && l.date
  const { requestClose, guard } = useUnsavedGuard(l, onClose)

  const save = () => {
    const id = list?.id ?? `ml-${Date.now().toString(36)}`
    const payload: MovementListInput = {
      ...list,
      id,
      name: String(l.name).trim(),
      date: l.date,
      bankBalance: +l.bankBalance || 0,
      status: list ? list.status : 'Borrador',
    }
    dispatch({ type: 'SAVE_MOVEMENT_LIST', list: payload })
    if (!list) onCreated?.(id)
    onClose()
  }

  return (
    <Modal width={460} icon={list ? 'edit' : 'plus'} title={list ? 'Editar lista' : 'Nueva lista'} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Nombre de la lista" span={2}><Input value={l.name} onChange={e => set('name', e.target.value)} placeholder="Lista jueves…" /></Field>
        <Field label="Fecha"><Input type="date" value={l.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Saldo en cuenta (MXN)"><MoneyInput value={l.bankBalance} onChange={v => set('bankBalance', v)} placeholder="0" /></Field>
      </div>
      {guard}
    </Modal>
  )
}

/* ============================================================
   Formulario de MOVIMIENTO (dentro de una lista)
   ============================================================ */
type MovFormState = { id?: string; date: string; description: string; amount: number | string; projectId: string }
function MovementForm({ listId, movement, onClose }: { listId: string; movement?: Movement; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [m, setM] = React.useState<MovFormState>(() => movement ? {
    ...movement, projectId: movement.projectId ?? '',
  } : { date: TODAY_ISO, description: '', amount: '', projectId: '' })
  const set = (k: keyof MovFormState, v: unknown) => setM(s => ({ ...s, [k]: v }))
  const valid = m.description.trim() && m.amount && m.date
  const { requestClose, guard } = useUnsavedGuard(m, onClose)

  const save = () => {
    const payload: MovementInput = {
      ...movement,
      listId,
      date: m.date,
      description: m.description.trim(),
      amount: +m.amount || 0,
      projectId: m.projectId || undefined,
      status: movement ? movement.status : 'Pendiente',
    }
    dispatch({ type: 'SAVE_MOVEMENT', movement: payload })
    onClose()
  }

  return (
    <Modal width={500} icon={movement ? 'edit' : 'plus'} title={movement ? 'Editar movimiento' : 'Agregar movimiento'} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Descripción" span={2}><Input value={m.description} onChange={e => set('description', e.target.value)} placeholder="Ej. Nóminas, Flete Cristian Morales, Caja chica…" /></Field>
        <Field label="Monto (MXN)"><MoneyInput value={m.amount} onChange={v => set('amount', v)} placeholder="0" /></Field>
        <Field label="Fecha"><Input type="date" value={m.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Proyecto (opcional)" span={2}>
          <Select value={m.projectId} onChange={e => set('projectId', e.target.value)}>
            <option value="">Sin proyecto…</option>
            {state.projects.map(pr => <option key={pr.id} value={pr.id}>{pr.code} · {sel.clientName(state, pr.client)}</option>)}
          </Select>
        </Field>
      </div>
      {m.projectId && (
        <div className="text-[11.5px] text-tx-2 mt-3">Al autorizarse, este movimiento descontará <b>{fmtMoney(+m.amount || 0)}</b> de la utilidad del proyecto.</div>
      )}
      {guard}
    </Modal>
  )
}

/* ============================================================
   Detalle de una LISTA (movimientos + acciones)
   ============================================================ */
function ListDetail({ list, onBack }: { list: MovementList; onBack: () => void }) {
  const { state, dispatch } = useStore()
  const role = state.currentUser?.role
  const isAdmin = isAdminRole(role)
  const isDir = isDireccion(role)
  const isBorrador = list.status === 'Borrador'
  const isPendiente = list.status === 'Pendiente'
  // El admin puede seguir ajustando la lista mientras NO esté autorizada/rechazada: en Borrador
  // y también en Pendiente (ya enviada a Dirección), p. ej. si cambió el saldo en cuenta o
  // entró/salió dinero. Enviar y Eliminar siguen siendo solo de Borrador.
  const adminEdit = isAdmin && (isBorrador || isPendiente)
  const dirReview = isDir && isPendiente                          // dirección revisa/edita la lista enviada
  const canEditMov = adminEdit || dirReview                       // quién puede agregar/editar/eliminar movimientos
  const canAuthorize = isDir && isPendiente                       // dirección decide cuando está pendiente

  const [movForm, setMovForm] = React.useState<Movement | {} | null>(null)
  const [editList, setEditList] = React.useState(false)
  const [delList, setDelList] = React.useState(false)
  const [rejectList, setRejectList] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [rejectMov, setRejectMov] = React.useState<Movement | null>(null)
  const [movReason, setMovReason] = React.useState('')

  const movs = state.movements.filter(m => m.listId === list.id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const { subtotal, comision, total } = listTotals(movs)
  const saldoDespues = list.bankBalance - total
  const creator = sel.userName(state, list.createdBy)
  const downloadComprobante = async () => {
    if (!list.comprobantePath) return
    try { window.open(await signedDocUrl(list.comprobantePath, 3600, list.comprobante || true), '_blank') }
    catch { alert('No se pudo generar el enlace de descarga.') }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-[18px]">
        <button className="btn btn-ghost btn-sm" onClick={onBack}><Icon name="arrowRight" size={14} className="rotate-180" /> Volver</button>
        <div className="sec-title m-0 flex items-center gap-3"><h2 className="m-0">{list.name}</h2> {listBadge(list)}</div>
        <div className="flex-1"></div>
        {canEditMov && <button className="btn btn-ghost" onClick={() => setMovForm({})}><Icon name="plus" size={15} /> Agregar movimiento</button>}
        {isAdmin && isBorrador && movs.length > 0 && <button className="btn btn-primary" onClick={() => dispatch({ type: 'SUBMIT_MOVEMENT_LIST', id: list.id })}><Icon name="arrowRight" size={15} /> Enviar lista</button>}
        {canAuthorize && (<>
          <button className="btn btn-ghost" onClick={() => setRejectList(true)}><Icon name="close" size={14} /> Rechazar lista</button>
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'DECIDE_MOVEMENT_LIST', id: list.id, approve: true })}><Icon name="check" size={15} /> Autorizar lista</button>
        </>)}
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-4">
        <div className="bg-bg-1 border border-line rounded-[10px] p-3.5">
          <div className="label-k">Saldo en cuenta</div>
          <div className="font-display font-extrabold text-[20px] mt-0.5">{fmtMoney(list.bankBalance)}</div>
        </div>
        <div className="bg-bg-1 border border-line rounded-[10px] p-3.5">
          <div className="label-k">Total de la lista</div>
          <div className="font-display font-extrabold text-[20px] mt-0.5">{fmtMoney(total)}</div>
          <div className="meta mt-0.5">incluye 5.3%</div>
        </div>
        <div className="bg-bg-1 border border-line rounded-[10px] p-3.5">
          <div className="label-k">Saldo tras la lista</div>
          <div className="font-display font-extrabold text-[20px] mt-0.5" style={{ color: saldoDespues < 0 ? 'var(--danger)' : undefined }}>{fmtMoney(saldoDespues)}</div>
        </div>
        <div className="bg-bg-1 border border-line rounded-[10px] p-3.5">
          <div className="label-k">Fecha · armó</div>
          <div className="text-[13px] text-tx-1 mt-1.5">{fmtDate(list.date)}</div>
          <div className="meta mt-0.5">{creator}</div>
        </div>
      </div>

      {/* Comprobante de pago de la lista: al subirlo se marca PAGADA y descuenta la utilidad
          de los proyectos vinculados. Solo disponible una vez autorizada. */}
      {list.status === 'Autorizada' && (
        <div className="bg-bg-1 border border-line rounded-[10px] p-3.5 mb-4">
          <div className="label-k mb-1.5">
            Comprobante de pago
            {list.comprobantePath
              ? <span className="font-normal" style={{ color: 'var(--ok)' }}> · Pagada</span>
              : <span className="text-tx-3 font-normal"> · pendiente de pago</span>}
          </div>
          {isAdmin && (
            <FileField label="" value={list.comprobante || ''} path={list.comprobantePath}
              folder={`movements/${list.id}`} accept=".pdf,.jpg,.jpeg,.png"
              onChange={v => dispatch({ type: 'SET_LIST_COMPROBANTE', id: list.id, comprobante: v.name || undefined, comprobantePath: v.path || undefined })} />
          )}
          {list.comprobantePath && (
            <div className="flex gap-2 mt-2">
              <button className="btn btn-sm btn-ghost" onClick={downloadComprobante}><Icon name="download" size={13} /> Descargar</button>
              {!isAdmin && <span className="meta self-center">{list.comprobante || 'Comprobante adjunto'}</span>}
            </div>
          )}
          <p className="meta mt-2">Al subir el comprobante, la lista se marca <b>pagada</b> y recién entonces se descuenta la utilidad de los proyectos vinculados.</p>
        </div>
      )}

      {(canEditMov || list.status === 'Rechazada') && (
        <div className="flex gap-2 mb-3.5 items-center">
          {canEditMov && <button className="btn btn-ghost btn-sm" onClick={() => setEditList(true)}><Icon name="edit" size={13} /> Editar lista</button>}
          {isAdmin && isBorrador && <button className="btn btn-ghost btn-sm" onClick={() => setDelList(true)}><Icon name="trash" size={13} /> Eliminar lista</button>}
          {adminEdit && isPendiente && <span className="text-[12px] text-tx-2">Lista ya enviada — puedes ajustarla mientras Dirección no la autorice.</span>}
          {dirReview && <span className="text-[12px] text-tx-2">Estás revisando la lista — tus cambios quedan marcados.</span>}
          {list.status === 'Rechazada' && list.rejectReason && <span className="text-[12px]" style={{ color: 'var(--danger)' }}>Rechazo: {list.rejectReason}</span>}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th className="w-[90px]">Fecha</th><th>Descripción</th><th>Estatus</th><th className="num">Monto</th><th className="w-[80px]"></th></tr></thead>
            <tbody>
              {movs.map(m => {
                const proj = m.projectId ? state.projects.find(x => x.id === m.projectId) : undefined
                const removed = m.changedByDireccion === 'removed'
                return (
                <tr key={m.id} style={removed ? { opacity: 0.55 } : undefined}>
                  <td className="num text-tx-2 text-[12px] whitespace-nowrap">{m.date ? fmtDateShort(m.date) : '—'}</td>
                  <td>
                    <div className={'text-[13px] font-semibold leading-tight ' + (removed ? 'line-through text-tx-3' : 'text-tx-1')}>{m.description}</div>
                    {proj && <div className="meta mt-0.5"><span className="mono text-acc">{proj.code}</span> · {sel.clientName(state, proj.client)}</div>}
                    <div className="flex items-center gap-1.5 mt-1">
                      {m.internalPaymentId && (
                        <span className="inline-block text-[10px] font-semibold px-1.5 py-px rounded-full"
                          style={{ color: 'var(--st-2)', border: '1px solid var(--st-2)' }}
                          title="Nació de un pago interno sin factura aprobado">Pago interno · sin factura</span>
                      )}
                      {m.changedByDireccion && <DirChip kind={m.changedByDireccion} />}
                    </div>
                  </td>
                  <td>{removed ? <span className="text-[12px] text-tx-3">—</span> : movBadge(m.status)}</td>
                  <td className={'num font-display font-bold text-[14px] whitespace-nowrap ' + (removed ? 'line-through text-tx-3' : '')}>{fmtMoney2(m.amount)}</td>
                  <td><div className="flex gap-1 justify-end">
                    {removed && canEditMov && (
                      <button className="icon-btn w-7 h-7" title="Restaurar" onClick={() => dispatch({ type: 'SAVE_MOVEMENT', movement: { ...m, status: 'Pendiente' } })}><Icon name="check" size={13} /></button>
                    )}
                    {!removed && canEditMov && <>
                      <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setMovForm(m)}><Icon name="edit" size={13} /></button>
                      <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => dispatch({ type: 'DELETE_MOVEMENT', id: m.id })}><Icon name="trash" size={13} /></button>
                    </>}
                    {!removed && canAuthorize && m.status === 'Pendiente' && <>
                      <button className="icon-btn w-7 h-7" title="Autorizar" onClick={() => dispatch({ type: 'DECIDE_MOVEMENT', id: m.id, approve: true })}><Icon name="check" size={13} /></button>
                      <button className="icon-btn w-7 h-7" title="Rechazar" onClick={() => { setRejectMov(m); setMovReason('') }}><Icon name="close" size={13} /></button>
                    </>}
                  </div></td>
                </tr>
              ) })}
            </tbody>
            {movs.length > 0 && (
              <tfoot>
                <tr><td colSpan={2}></td><td className="text-right text-tx-2 text-[12.5px]">Subtotal</td><td className="num text-[13px]">{fmtMoney2(subtotal)}</td><td></td></tr>
                <tr><td colSpan={2}></td><td className="text-right text-tx-2 text-[12px]">Comisión 5.3%</td><td className="num text-tx-2 text-[12px]">{fmtMoney2(comision)}</td><td></td></tr>
                <tr><td colSpan={2}></td><td className="text-right font-display font-bold">Total</td><td className="num font-display font-bold text-[15px]">{fmtMoney2(total)}</td><td></td></tr>
              </tfoot>
            )}
          </table>
        </div>
        {movs.length === 0 && <Empty icon="box">Esta lista no tiene movimientos{canEditMov ? ' — agrega el primero' : ''}</Empty>}
      </div>

      {movForm && <MovementForm listId={list.id} movement={'id' in movForm ? movForm : undefined} onClose={() => setMovForm(null)} />}
      {editList && <MovementListForm list={list} prefillBalance={list.bankBalance} onClose={() => setEditList(false)} />}
      {delList && <Confirm title="Eliminar lista" message={`¿Eliminar "${list.name}" y sus ${movs.length} movimientos?`} danger onConfirm={() => { dispatch({ type: 'DELETE_MOVEMENT_LIST', id: list.id }); onBack() }} onClose={() => setDelList(false)} />}
      {rejectList && (
        <Modal width={420} icon="alert" title="Rechazar lista" onClose={() => setRejectList(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setRejectList(false)}>Cancelar</button>
            <div className="flex-1"></div>
            <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DECIDE_MOVEMENT_LIST', id: list.id, approve: false, reason }); setRejectList(false) }}><Icon name="close" size={14} /> Rechazar</button>
          </>}>
          <Field label="Motivo del rechazo"><TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explica por qué se rechaza la lista…" /></Field>
        </Modal>
      )}
      {rejectMov && (
        <Modal width={420} icon="alert" title="Rechazar movimiento" onClose={() => setRejectMov(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setRejectMov(null)}>Cancelar</button>
            <div className="flex-1"></div>
            <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DECIDE_MOVEMENT', id: rejectMov.id, approve: false, reason: movReason }); setRejectMov(null) }}><Icon name="close" size={14} /> Rechazar</button>
          </>}>
          <Field label="Motivo del rechazo"><TextArea value={movReason} onChange={e => setMovReason(e.target.value)} placeholder="Explica por qué se rechaza…" /></Field>
        </Modal>
      )}
    </div>
  )
}

/* ============================================================
   Página de Movimientos — resumen de listas
   ============================================================ */
export function MovementsPage({ openId, onConsumed }: { openId?: string | null; onConsumed?: () => void } = {}) {
  const { state } = useStore()
  const role = state.currentUser?.role
  const isAdmin = isAdminRole(role)
  const isDir = isDireccion(role)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<ListFilter>('activas')
  const [newList, setNewList] = React.useState(false)

  // Abrir una lista concreta al llegar desde una notificación.
  React.useEffect(() => {
    if (!openId) return
    if (state.movementLists.some(l => l.id === openId)) setSelectedId(openId)
    onConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  const selected = selectedId ? state.movementLists.find(l => l.id === selectedId) : undefined
  if (selected) return <ListDetail list={selected} onBack={() => setSelectedId(null)} />

  // Dirección no ve las listas en Borrador (que el admin sigue armando).
  const visible = state.movementLists.filter(l => isDir ? l.status !== 'Borrador' : true)
  const lists = visible.filter(l => matchesListFilter(l, filter))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)))
  const pendientes = visible.filter(l => l.status === 'Pendiente').length
  const movsOf = (id: string) => state.movements.filter(m => m.listId === id)

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Movimientos</h2><span className="sub">Listas semanales · autoriza Dirección</span></div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setNewList(true)}><Icon name="plus" size={15} /> Nueva lista</button>}
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <KPI label="Listas por autorizar" value={pendientes} icon="alert" />
        <KPI label="Listas activas" value={visible.filter(l => l.status === 'Borrador' || l.status === 'Pendiente').length} icon="box" />
        <KPI label="Total de listas" value={visible.length} icon="orders" />
      </div>

      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        <span className="label-k">Filtrar:</span>
        <div className="seg">
          {LIST_FILTERS.map(f => <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>
        <span className="meta">{lists.length} de {visible.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Lista</th><th>Fecha</th><th className="num">Movs.</th><th className="num">Total</th><th className="num">Saldo</th><th>Estatus</th></tr></thead>
            <tbody>
              {lists.map(l => {
                const ms = movsOf(l.id)
                const { total } = listTotals(ms)
                return (
                <tr key={l.id} onClick={() => setSelectedId(l.id)}>
                  <td className="text-[12.5px] font-semibold text-tx-1">{l.name}</td>
                  <td className="num text-tx-1 text-[12px]">{fmtDateShort(l.date)}</td>
                  <td className="num text-[12px]">{ms.length}</td>
                  <td className="num font-semibold">{fmtMoney2(total)}</td>
                  <td className="num text-[12px]">{fmtMoney(l.bankBalance)}</td>
                  <td>{listBadge(l)}</td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>
        {lists.length === 0 && <Empty icon="box">Sin listas en esta vista</Empty>}
      </div>

      {newList && <MovementListForm prefillBalance={[...state.movementLists].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.bankBalance ?? 0} onClose={() => setNewList(false)} onCreated={(id) => setSelectedId(id)} />}
    </div>
  )
}
