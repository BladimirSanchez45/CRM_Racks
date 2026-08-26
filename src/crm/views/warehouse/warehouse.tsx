// ============================================================
//  ALMACÉN — cola de trabajo priorizada por el propio almacén.
//  · Los proyectos entran solos al emitirse su ORDEN DE COMPRA.
//  · Almacén los ordena (arrastrando o con ▲▼), les pone TALLA
//    (Chico/Mediano/Grande = días configurables) y mueve su estado.
//  · Puede haber VARIOS en proceso a la vez.
//  · La "fecha estimada" que captura almacén es SOLO de este módulo:
//    no toca el ETA ni ninguna fecha del proyecto.
//  Ventas ve el mismo dato en modo lectura: <WarehouseLoadCard>.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtDate, fmtMoney2, addDays } from '../../core/data'
import { Modal, Field, Input, TextArea, Select, Badge, DocChip, Confirm, Empty, Seg, SecTitle } from '../../core/ui'
import { Icon } from '../../core/icons'
import { InventoryLowCard, ConsumoModal } from '../inventory/inventory'
import type { Order, Project, WarehouseItem, WarehouseSize, WarehouseStatus } from '../../core/types'

const SIZE_META: Record<WarehouseSize, { label: string; short: string }> = {
  S: { label: 'Chico', short: 'S' },
  M: { label: 'Mediano', short: 'M' },
  L: { label: 'Grande', short: 'L' },
}
const STATUS_META: Record<WarehouseStatus, { label: string; color: string }> = {
  pendiente: { label: 'Por iniciar', color: 'var(--tx-2)' },
  proceso:   { label: 'En proceso',  color: 'var(--warn)' },
  pausado:   { label: 'Pausado',     color: 'var(--st-5)' },
  listo:     { label: 'Listo',       color: 'var(--ok)' },
}
/** Orden en que se ofrecen los estatus en el selector. */
const STATUSES: WarehouseStatus[] = ['pendiente', 'proceso', 'pausado', 'listo']

/** ¿Este usuario puede MOVER la cola? Almacén (dueño del proceso) y admin. */
const canManageWarehouse = (role?: string | null) => role === 'almacen' || role === 'admin' || role === 'superadmin'

/* ============================================================
   Modal de clasificación de un renglón
   ============================================================ */
function WarehouseItemModal({ item, onClose }: { item: WarehouseItem; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const order = state.orders.find(o => o.id === item.orderId)
  const project = order?.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
  const [size, setSize] = React.useState<WarehouseSize | ''>(item.size ?? '')
  // Los días son el dato real; la talla solo es un atajo para llenarlos.
  const [dias, setDias] = React.useState(() => {
    const d = sel.warehouseDays(state, item)
    return d > 0 ? String(d) : ''
  })
  const [estimatedDone, setEstimatedDone] = React.useState(item.estimatedDone ?? '')
  const [notes, setNotes] = React.useState(item.notes ?? '')
  const [confirmDel, setConfirmDel] = React.useState(false)

  // Al elegir talla se rellenan sus días; el número queda editable encima.
  const pickSize = (k: WarehouseSize) => {
    if (size === k) { setSize(''); setDias(''); return }
    setSize(k); setDias(String(state.settings.whDays[k]))
  }
  // Días SIEMPRE enteros y mínimo 1 (lo que sale el mismo día cuenta como 1).
  const diasNum = dias.trim() === '' ? null : Math.round(Number(dias))
  const diasOk = dias.trim() === ''
    || (/^\d+$/.test(dias.trim()) && Number(dias) >= 1)
  // Si el número coincide con el de la talla, se guarda solo la talla: así el
  // día que cambien los días por talla en Administración, este renglón se ajusta.
  const sigueLaTalla = !!size && diasNum === state.settings.whDays[size as WarehouseSize]

  const save = () => {
    if (!diasOk) return
    dispatch({
      type: 'SAVE_WAREHOUSE_ITEM',
      item: {
        id: item.id,
        size: size || undefined,
        days: diasNum == null || sigueLaTalla ? undefined : diasNum,
        estimatedDone: estimatedDone || undefined,
        notes: notes.trim() || undefined,
      },
    })
    onClose()
  }

  return (
    <Modal width={560} icon="pkg" title={`OC ${order?.number ?? '—'}`}
      sub={[
        sel.supplier(state, order?.supplierId ?? '')?.name,
        project ? `${project.code} · ${sel.clientName(state, project.client)}` : 'Sin proyecto',
      ].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost text-danger" title="Esta OC no le toca a almacén" onClick={() => setConfirmDel(true)}>
          <Icon name="trash" size={14} /> Quitar de la cola
        </button>
        <div className="flex-1"></div>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!diasOk ? ' opacity-50' : '')} disabled={!diasOk} onClick={save}>
          <Icon name="check" size={15} /> Guardar
        </button>
      </>}>
      {order?.description && <div className="text-[12.5px] text-tx-1 mb-3.5">{order.description}</div>}
      <Field label="Carga de trabajo">
        <div className="flex gap-2">
          {(['S', 'M', 'L'] as WarehouseSize[]).map(k => (
            <button key={k} onClick={() => pickSize(k)}
              className={'btn flex-1 ' + (size === k ? 'btn-primary' : 'btn-ghost')}>
              {SIZE_META[k].label} · {state.settings.whDays[k]}d
            </button>
          ))}
        </div>
      </Field>

      <div className="mt-3.5">
        <Field label="Días de trabajo">
          <div className="flex items-center gap-2.5">
            <div className="w-[120px]">
              <Input value={dias} inputMode="numeric" placeholder="0"
                onChange={e => setDias(e.target.value)} />
            </div>
            <span className="meta">
              {dias.trim() === ''
                ? 'Vacío: esta OC queda sin clasificar y no suma a la carga.'
                : !diasOk ? 'Días enteros, mínimo 1.'
                : sigueLaTalla ? `Toma los días de la talla ${SIZE_META[size as WarehouseSize].label}.`
                : <>Ajustados a mano · <b>sí suman a la carga</b>.</>}
            </span>
          </div>
        </Field>
        <div className="meta mt-1.5">
          <b>Para lo que sale el mismo día usa 1</b>.
        </div>
      </div>

      <div className="mt-4">
        <Field label="Estimo terminar (opcional)">
          <Input type="date" value={estimatedDone} onChange={e => setEstimatedDone(e.target.value)} />
        </Field>
        <div className="meta mt-1.5">
          <b>Es tu estimado interno de almacén.</b>
        </div>
      </div>

      <div className="mt-4">
        <Field label="Notas (opcional)">
          <TextArea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Faltantes, material especial, quién lo está armando…" />
        </Field>
      </div>

      {confirmDel && (
        <Confirm title="Quitar de la cola"
          message={`¿Sacar la OC ${order?.number ?? ''} de la cola de almacén? Úsalo cuando entró por error (proveedor externo, OC cancelada). No borra la orden de compra.`}
          confirmLabel="Quitar de la cola"
          onConfirm={() => { dispatch({ type: 'REMOVE_FROM_WAREHOUSE', id: item.id }); onClose() }}
          onClose={() => setConfirmDel(false)} />
      )}
    </Modal>
  )
}

/* ============================================================
   Detalle de la OC: los materiales que almacén tiene que preparar.
   Solo lectura. A ALMACÉN se le ocultan los importes (costos de compra);
   ve las cantidades y descripciones, que es lo que necesita para trabajar.
   ============================================================ */
function OrderDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { state } = useStore()
  const verImportes = state.currentUser?.role !== 'almacen'
  const project = order.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
  const items = order.items ?? []

  return (
    <Modal width={860} icon="orders" title={`OC ${order.number}`}
      sub={[
        sel.supplier(state, order.supplierId)?.name,
        project ? `${project.code} · ${sel.clientName(state, project.client)}` : null,
      ].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={<><div className="flex-1"></div><button className="btn btn-primary" onClick={onClose}>Cerrar</button></>}>
      <div className="label-k mb-1.5">Orden de compra</div>
      <div className="grid grid-cols-2 gap-x-6 text-[12.5px] mb-4">
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Fecha OC</span><span>{order.date ? fmtDate(order.date) : '—'}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Entrega estimada</span><span>{order.deliveryDate ? fmtDate(order.deliveryDate) : '—'}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Descripción</span><span className="text-right max-w-[60%]">{order.description || '—'}</span></div>
        <div className="flex justify-between items-center border-b border-line-soft py-[7px]">
          <span className="label-k">OC firmada</span>
          <span>{order.filePath ? <DocChip doc={{ name: order.file || 'OC firmada', ok: true, path: order.filePath }} label="OC firmada" /> : (order.file || '—')}</span>
        </div>
      </div>

      {/* Datos del proyecto: a quién le pertenece, a dónde va y cuándo se prometió. */}
      {project && (
        <>
          <div className="label-k mb-1.5">Proyecto {project.code}</div>
          <div className="grid grid-cols-2 gap-x-6 text-[12.5px] mb-5">
            <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Vendedor</span><span>{sel.sellerName(state, project.seller)}</span></div>
            <div className="flex justify-between border-b border-line-soft py-[7px]">
              <span className="label-k">Destino</span>
              <span className="text-right max-w-[60%]">
                {project.city ? <><Icon name="pin" size={12} className="align-[-1px] opacity-60" /> {project.city}</> : '—'}
              </span>
            </div>
            <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Entrega estimada</span><span>{project.eta ? fmtDate(project.eta) : '—'}</span></div>
            <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Semanas de entrega</span><span className="mono">{project.weeks ? `${project.weeks} sem` : '—'}</span></div>
          </div>
        </>
      )}

      {items.length === 0 ? (
        <Empty icon="box">Esta OC no tiene materiales capturados. Revisa el PDF de la OC firmada.</Empty>
      ) : (
        <>
          <div className="label-k mb-2">Materiales ({items.length})</div>
          <div className="border border-line rounded-[8px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  <th>Parte</th><th>Color</th><th className="num">Cant.</th><th>Material</th>
                  <th>Descripción</th><th>Dimensiones</th>
                  {verImportes && <th className="num">Importe</th>}
                </tr></thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} style={{ cursor: 'default' }}>
                      <td className="text-[12px]">{it.parte || '—'}</td>
                      <td className="text-[12px]">{it.color || '—'}</td>
                      <td className="num font-semibold">{it.qty}</td>
                      <td className="text-[12px]">{it.material || '—'}</td>
                      <td className="text-[12.5px]">{it.description || '—'}</td>
                      <td className="text-[12px]">{it.dimensiones || '—'}</td>
                      {verImportes && <td className="num">{fmtMoney2((it.qty || 0) * (it.unitPrice || 0))}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="meta mt-2">
            Total de piezas: <b>{items.reduce((a, it) => a + (it.qty || 0), 0)}</b>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ============================================================
   Renglón de la cola
   ============================================================ */
function QueueRow({ item, index, total, manage, dragging, over, onOpen, onOpenOrder, onStatus, onDragStart, onDragOver, onDrop, onDragEnd }: {
  item: WarehouseItem
  index: number
  total: number
  manage: boolean
  dragging: boolean
  over: boolean
  onOpen: () => void
  onOpenOrder: (o: Order) => void
  /** Sube el cambio de estado a la página: al pasar a "listo" hay que revisar
   *  antes si a la OC le falta descontar el material del inventario. */
  onStatus: (item: WarehouseItem, status: WarehouseStatus) => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const { state, dispatch } = useStore()
  const order = state.orders.find(o => o.id === item.orderId)
  const project = order?.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
  const dias = sel.warehouseDays(state, item)
  const st = STATUS_META[item.status]
  const move = (to: number) => dispatch({ type: 'MOVE_WAREHOUSE_ITEM', id: item.id, toIndex: to })
  const setStatus = (status: WarehouseStatus) => onStatus(item, status)
  // Evita que los controles de la fila disparen la apertura de la OC.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <tr
      draggable={manage}
      // setData es lo que hace que el navegador inicie el arrastre de verdad.
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.id)
        onDragStart()
      }}
      onDragOver={e => { if (!manage) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDrop={e => { if (!manage) return; e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      // Clic en cualquier parte de la fila → abre la OC con sus materiales.
      onClick={() => order && onOpenOrder(order)}
      className="cursor-pointer"
      style={{
        opacity: dragging ? 0.4 : 1,
        // Línea de inserción: marca dónde va a caer la fila que arrastras.
        boxShadow: over ? 'inset 0 2px 0 0 var(--acc)' : undefined,
      }}>
      <td className="w-[54px]">
        <span className="inline-flex items-center gap-1.5">
          {manage && <span className="text-tx-3 cursor-grab" title="Arrastra la fila para cambiar la prioridad"><Icon name="dots" size={14} /></span>}
          <span className="mono font-bold text-[13px]">{index + 1}</span>
        </span>
      </td>
      <td>
        <span className="inline-flex items-center gap-2">
          {/* Abre la OC: ahí vienen los materiales a preparar. */}
          <button className="mono text-acc font-semibold bg-transparent border-none p-0 cursor-pointer hover:underline"
            title="Ver materiales de la OC" disabled={!order}
            onClick={() => order && onOpenOrder(order)}>
            {order?.number ?? '—'}
          </button>
          {order?.cancelled && <Badge color="var(--danger)">Cancelada</Badge>}
          {(order?.items?.length ?? 0) > 0 && <span className="meta">{order!.items!.length} Materiales</span>}
        </span>
        <div className="meta mt-0.5 truncate max-w-[280px]" title={order?.description}>
          {sel.supplier(state, order?.supplierId ?? '')?.name ?? 'Sin proveedor'}
          {order?.description ? ` · ${order.description}` : ''}
        </div>
      </td>
      <td>
        {project
          ? <>
              <span className="mono text-[12px] font-semibold">{project.code}</span>
              <div className="meta mt-0.5 truncate max-w-[180px]">{sel.clientName(state, project.client)}</div>
            </>
          : <span className="text-tx-3">—</span>}
      </td>
      <td>
        {sel.warehouseClasificado(item)
          ? <Badge color="var(--acc)">{item.size ? `${SIZE_META[item.size].label} · ` : ''}{dias}d</Badge>
          : <Badge color="var(--warn)">Sin clasificar</Badge>}
      </td>
      <td onClick={stop}>
        {manage
          ? (
            // Selector de estatus: almacén mueve el proyecto libremente
            // (arrancarlo, pausarlo para meter otro antes, o darlo por listo).
            <Select value={item.status} onChange={e => setStatus(e.target.value as WarehouseStatus)}
              className="w-auto min-w-[130px]" style={{ color: st.color, fontWeight: 600 }}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </Select>
          )
          : <Badge color={st.color}>{st.label}</Badge>}
      </td>
      <td className="whitespace-nowrap">
        {item.estimatedDone
          ? <span className="text-[12.5px]">{fmtDate(item.estimatedDone)}</span>
          : <span className="text-tx-3">—</span>}
      </td>
      <td className="text-right whitespace-nowrap" onClick={stop}>
        {manage && (
          <span className="inline-flex items-center gap-1">
            <button className="icon-btn" title="Subir" disabled={index === 0} style={{ opacity: index === 0 ? 0.35 : 1 }}
              onClick={() => move(index - 1)}><Icon name="chevron" size={14} className="-rotate-90" /></button>
            <button className="icon-btn" title="Bajar" disabled={index === total - 1} style={{ opacity: index === total - 1 ? 0.35 : 1 }}
              onClick={() => move(index + 1)}><Icon name="chevron" size={14} className="rotate-90" /></button>
            <button className="btn btn-sm btn-ghost" onClick={onOpen}><Icon name="edit" size={13} /> Clasificar</button>
          </span>
        )}
      </td>
    </tr>
  )
}

/* ============================================================
   Página
   ============================================================ */
export function WarehousePage() {
  const { state, dispatch } = useStore()
  const manage = canManageWarehouse(state.currentUser?.role)
  const [view, setView] = React.useState('cola')      // cola | listos
  const [open, setOpen] = React.useState<WarehouseItem | null>(null)
  const [openOrder, setOpenOrder] = React.useState<Order | null>(null)
  // Arrastre para reordenar: qué fila se arrastra y sobre cuál está parada.
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [overIndex, setOverIndex] = React.useState<number | null>(null)
  // Candado al cerrar: la OC que se quiere marcar lista pero aún no tiene
  // descontado su material del inventario.
  const [pendiente, setPendiente] = React.useState<{ item: WarehouseItem; order: Order } | null>(null)
  const [consumoOc, setConsumoOc] = React.useState<Order | null>(null)

  const queue = sel.warehouseQueue(state)
  const done = sel.warehouseDone(state)
  const load = sel.warehouseLoad(state)

  const marcarListo = (item: WarehouseItem) =>
    dispatch({ type: 'SET_WAREHOUSE_STATUS', id: item.id, status: 'listo' })
  /** Cambio de estado con candado: al pasar a "listo" se revisa que el material
   *  ya se haya descontado del inventario. No bloquea —hay OC cuyo material no
   *  sale de almacén— pero obliga a decidirlo a propósito. */
  const cambiarEstado = (item: WarehouseItem, status: WarehouseStatus) => {
    const order = state.orders.find(o => o.id === item.orderId)
    const faltaConsumo = status === 'listo' && item.status !== 'listo' && order
      && state.invItems.length > 0 && !sel.invConsumoCapturado(state, order.id)
    if (faltaConsumo) { setPendiente({ item, order }); return }
    dispatch({ type: 'SET_WAREHOUSE_STATUS', id: item.id, status })
  }

  const endDrag = () => { setDragId(null); setOverIndex(null) }
  const onDrop = (toIndex: number) => {
    if (dragId) dispatch({ type: 'MOVE_WAREHOUSE_ITEM', id: dragId, toIndex })
    endDrag()
  }

  return (
    <div>
      <SecTitle title="Almacén" sub="Cola de trabajo por prioridad" />

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="kpi kpi-accent">
          <div className="k-label">Días de trabajo</div>
          <div className="k-val text-[26px]">{load.dias}</div>
          <div className="k-foot">{load.total} proyecto{load.total === 1 ? '' : 's'} en cola</div>
        </div>
        <div className="kpi"><div className="k-label">En proceso</div><div className="k-val text-[26px] text-warn">{load.proceso}</div><div className="k-foot">{load.diasProceso} días</div></div>
        <div className="kpi"><div className="k-label">Por iniciar / pausados</div><div className="k-val text-[26px]">{load.pendiente}<span className="text-[17px] text-tx-2"> / {load.pausado}</span></div><div className="k-foot">esperando turno</div></div>
        <div className="kpi"><div className="k-label">Sin clasificar</div><div className="k-val text-[26px]" style={{ color: load.sinClasificar ? 'var(--warn)' : undefined }}>{load.sinClasificar}</div><div className="k-foot">no suman a la carga</div></div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-h">
          <Icon name="pkg" size={17} className="text-acc" />
          <span className="ttl">{view === 'cola' ? 'Cola de trabajo' : 'Terminados'}</span>
          <span className="flex-1"></span>
          <Seg value={view} onChange={setView} options={[
            { value: 'cola', label: `Cola (${queue.length})` },
            { value: 'listos', label: `Terminados (${done.length})` },
          ]} />
        </div>

        {view === 'cola' ? (
          queue.length === 0 ? <Empty icon="pkg">No hay proyectos en la cola. Entran solos al emitirse su orden de compra.</Empty> : (
            <table className="tbl">
              <thead><tr><th>#</th><th>Orden de compra</th><th>Proyecto</th><th>Carga</th><th>Estado</th><th>Estimo terminar</th><th></th></tr></thead>
              <tbody>
                {queue.map((w, i) => (
                  <QueueRow key={w.id} item={w} index={i} total={queue.length} manage={manage}
                    dragging={dragId === w.id} over={overIndex === i && dragId !== null && dragId !== w.id}
                    onOpen={() => setOpen(w)} onOpenOrder={setOpenOrder} onStatus={cambiarEstado}
                    onDragStart={() => setDragId(w.id)}
                    onDragOver={() => setOverIndex(i)}
                    onDrop={() => onDrop(i)}
                    onDragEnd={endDrag} />
                ))}
              </tbody>
            </table>
          )
        ) : (
          done.length === 0 ? <Empty icon="check">Todavía no hay proyectos terminados</Empty> : (
            <table className="tbl">
              <thead><tr><th>Orden de compra</th><th>Proyecto</th><th>Carga</th><th>Terminado</th><th></th></tr></thead>
              <tbody>
                {done.map(w => {
                  const order = state.orders.find(o => o.id === w.orderId)
                  const project = order?.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
                  return (
                    <tr key={w.id} className="cursor-pointer" onClick={() => order && setOpenOrder(order)}>
                      <td>
                        <span className="mono text-acc font-semibold">{order?.number ?? '—'}</span>
                        <div className="meta mt-0.5">{sel.supplier(state, order?.supplierId ?? '')?.name ?? '—'}</div>
                      </td>
                      <td>
                        {project
                          ? <><span className="mono text-[12px] font-semibold">{project.code}</span>
                              <div className="meta mt-0.5">{sel.clientName(state, project.client)}</div></>
                          : <span className="text-tx-3">—</span>}
                      </td>
                      <td>{sel.warehouseClasificado(w) ? <Badge color="var(--acc)">{w.size ? `${SIZE_META[w.size].label} · ` : ''}{sel.warehouseDays(state, w)}d</Badge> : <span className="text-tx-3">—</span>}</td>
                      <td className="text-[12.5px]">{w.doneAt ? fmtDate(w.doneAt.slice(0, 10)) : '—'}</td>
                      <td className="text-right" onClick={e => e.stopPropagation()}>
                        {manage && <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'SET_WAREHOUSE_STATUS', id: w.id, status: 'pendiente' })}>Reabrir</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      {open && <WarehouseItemModal item={open} onClose={() => setOpen(null)} />}
      {openOrder && <OrderDetailModal order={openOrder} onClose={() => setOpenOrder(null)} />}

      {/* Antes de dar por lista una OC: recordar que falta descontar su material. */}
      {pendiente && !consumoOc && (
        <Modal width={500} icon="alert" title="Falta descontar el material"
          sub={`OC ${pendiente.order.number}`}
          onClose={() => setPendiente(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setPendiente(null)}>Cancelar</button>
            <div className="flex-1"></div>
            <button className="btn btn-ghost" title="El inventario se queda como está"
              onClick={() => { marcarListo(pendiente.item); setPendiente(null) }}>
              Marcar listo sin descontar
            </button>
            <button className="btn btn-primary" onClick={() => setConsumoOc(pendiente.order)}>
              <Icon name="pkg" size={15} /> Capturar consumo
            </button>
          </>}>
          <div className="text-[13px] text-tx-1 leading-[1.6]">
            Esta orden de compra todavía no tiene capturado el consumo, así que el material que se
            ocupó <b>no se ha descontado del inventario</b>. Si la das por lista así, las existencias
            van a quedar más altas de lo que de verdad hay en el piso.
          </div>
          <div className="meta mt-3">
            Si el material de esta OC no sale del almacén, marcarla lista sin descontar es lo correcto.
          </div>
        </Modal>
      )}

      {/* Al guardar el consumo, la OC queda lista en el mismo movimiento. */}
      {consumoOc && (
        <ConsumoModal order={consumoOc}
          onSaved={() => { if (pendiente) marcarListo(pendiente.item) }}
          onClose={() => { setConsumoOc(null); setPendiente(null) }} />
      )}
    </div>
  )
}

/* ============================================================
   Tarjeta de DISPONIBILIDAD para ventas (Panel).
   Solo carga de trabajo: sin fechas proyectadas ni simuladores —
   el vendedor saca sus propias conclusiones con estos números.
   ============================================================ */
export function WarehouseLoadCard() {
  const { state } = useStore()
  const [open, setOpen] = React.useState(false)
  const load = sel.warehouseLoad(state)
  const queue = sel.warehouseQueue(state)
  // Proporción proceso / por iniciar (NO es un % de capacidad: no hay tope definido).
  const pct = load.total > 0 ? (load.proceso / load.total) * 100 : 0

  return (
    <div className="card">
      <div className="card-h">
        <Icon name="pkg" size={17} className="text-acc" />
        <span className="ttl">Almacén · Carga de trabajo</span>
      </div>
      <div className="card-b">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="font-display font-extrabold text-[24px] text-warn">{load.proceso}</div>
            <div className="label-k mt-0.5">en proceso</div>
          </div>
          <div>
            <div className="font-display font-extrabold text-[24px]">{load.pendiente}</div>
            <div className="label-k mt-0.5">por iniciar</div>
          </div>
          <div>
            <div className="font-display font-extrabold text-[24px] text-acc">{load.dias}</div>
            <div className="label-k mt-0.5">días de trabajo</div>
          </div>
        </div>

        <div className="h-2 rounded-full overflow-hidden mt-4 flex" style={{ background: 'var(--bg-3)' }}>
          <div style={{ width: `${pct}%`, background: 'var(--warn)' }}></div>
          <div style={{ width: `${100 - pct}%`, background: 'var(--acc)', opacity: 0.35 }}></div>
        </div>

        {(load.pausado > 0 || load.sinClasificar > 0) && (
          <div className="meta mt-2.5 flex flex-col gap-0.5">
            {load.pausado > 0 && <span>{load.pausado} pausado{load.pausado === 1 ? '' : 's'}: ya arrancaron pero están detenidos.</span>}
            {load.sinClasificar > 0 && <span>{load.sinClasificar} sin clasificar: aún no suma{load.sinClasificar === 1 ? '' : 'n'} días.</span>}
          </div>
        )}

        <button className="btn btn-ghost w-full mt-3.5" onClick={() => setOpen(o => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevron'} size={14} /> {open ? 'Ocultar la cola' : 'Ver la cola'}
        </button>

        {open && (
          queue.length === 0
            ? <div className="meta text-center mt-3">La cola está vacía.</div>
            : (
              <table className="tbl mt-2">
                <thead><tr><th>#</th><th>Orden de compra</th><th>Proyecto</th><th>Carga</th><th>Estado</th><th>Estimo terminar</th></tr></thead>
                <tbody>
                  {queue.map((w, i) => {
                    const order = state.orders.find(o => o.id === w.orderId)
                    const project = order?.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
                    const st = STATUS_META[w.status]
                    return (
                      <tr key={w.id}>
                        <td className="mono font-bold text-[12.5px]">{i + 1}</td>
                        <td>
                          <span className="mono text-acc font-semibold">{order?.number ?? '—'}</span>
                          <div className="meta mt-0.5">{sel.supplier(state, order?.supplierId ?? '')?.name ?? '—'}</div>
                        </td>
                        <td>
                          {project
                            ? <><span className="mono text-[12px] font-semibold">{project.code}</span>
                                <div className="meta mt-0.5">{sel.clientName(state, project.client)}</div></>
                            : <span className="text-tx-3">—</span>}
                        </td>
                        <td>{sel.warehouseClasificado(w) ? `${w.size ? `${SIZE_META[w.size].label} · ` : ''}${sel.warehouseDays(state, w)}d` : <span className="text-tx-3">sin clasificar</span>}</td>
                        <td><Badge color={st.color}>{st.label}</Badge></td>
                        <td className="text-[12.5px]">{w.estimatedDone ? fmtDate(w.estimatedDone) : <span className="text-tx-3">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
        )}
      </div>
    </div>
  )
}

/* ============================================================
   Tira compacta de disponibilidad, para el FORMULARIO de la venta:
   es el momento en que el vendedor decide las semanas de entrega.
   ============================================================ */
export function WarehouseLoadStrip() {
  const { state } = useStore()
  const [open, setOpen] = React.useState(false)
  const load = sel.warehouseLoad(state)
  const queue = sel.warehouseQueue(state)

  return (
    <div className="bg-bg-1 border border-line rounded-[8px] mt-4 overflow-hidden">
      <div className="flex items-center gap-2.5 flex-wrap px-3.5 py-2.5">
        <Icon name="pkg" size={15} className="text-acc shrink-0" />
        <span className="label-k">Almacén</span>
        <span className="text-[12.5px]"><b className="text-warn">{load.proceso}</b> en proceso</span>
        <span className="text-tx-3">·</span>
        <span className="text-[12.5px]"><b>{load.pendiente}</b> por iniciar</span>
        {load.pausado > 0 && (
          <>
            <span className="text-tx-3">·</span>
            <span className="text-[12.5px]"><b>{load.pausado}</b> pausado{load.pausado === 1 ? '' : 's'}</span>
          </>
        )}
        <span className="text-tx-3">·</span>
        <span className="text-[12.5px]"><b className="text-acc">{load.dias}</b> días de trabajo acumulados</span>
        {load.sinClasificar > 0 && (
          <>
            <span className="text-tx-3">·</span>
            <span className="meta">{load.sinClasificar} sin clasificar</span>
          </>
        )}
        <span className="flex-1"></span>
        <button className="btn btn-sm btn-ghost shrink-0" onClick={() => setOpen(o => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevron'} size={13} /> {open ? 'Ocultar' : 'Ver cola'}
        </button>
      </div>

      {open && (
        queue.length === 0
          ? <div className="meta px-3.5 pb-3">La cola de almacén está vacía.</div>
          : (
            <div className="border-t border-line max-h-[210px] overflow-y-auto">
              <table className="tbl">
                <tbody>
                  {queue.map((w, i) => {
                    const order = state.orders.find(o => o.id === w.orderId)
                    const project = order?.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
                    const st = STATUS_META[w.status]
                    return (
                      <tr key={w.id}>
                        <td className="w-[34px] mono font-bold text-[12px]">{i + 1}</td>
                        <td>
                          <span className="mono text-acc font-semibold">{order?.number ?? '—'}</span>
                          <div className="meta mt-0.5">{project?.code ?? 'sin proyecto'}</div>
                        </td>
                        <td className="text-[12px] text-tx-2">{sel.warehouseClasificado(w) ? `${w.size ? `${SIZE_META[w.size].label} · ` : ''}${sel.warehouseDays(state, w)}d` : 'sin clasificar'}</td>
                        <td><Badge color={st.color}>{st.label}</Badge></td>
                        <td className="text-[12px] text-tx-2 whitespace-nowrap">{w.estimatedDone ? fmtDate(w.estimatedDone) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  )
}

/* ============================================================
   PANEL de almacén. Sustituye por completo al Panel general para el rol
   almacén: nada de pipeline con montos, ingresos, alertas de cobranza ni
   actividad de pagos. Solo su trabajo.
   ============================================================ */
export function WarehouseDashboard({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { state } = useStore()
  const load = sel.warehouseLoad(state)
  const queue = sel.warehouseQueue(state)
  const done = sel.warehouseDone(state)
  const [openOrder, setOpenOrder] = React.useState<Order | null>(null)

  // Lo que está en proceso primero; después, lo que sigue en la fila.
  const enProceso = queue.filter(w => w.status === 'proceso')
  const siguientes = queue.filter(w => w.status !== 'proceso').slice(0, 6)
  const sinClasificar = queue.filter(w => !sel.warehouseClasificado(w))
  // Terminados en los últimos 7 días. `doneAt` es ISO completo, así que basta
  // comparar contra la fecha: '2026-08-03T…' >= '2026-07-27' funciona por texto.
  const semana = addDays(-7)
  const recientes = done.filter(w => (w.doneAt || '') >= semana)

  const fila = (w: WarehouseItem) => {
    const order = state.orders.find(o => o.id === w.orderId)
    const project = order?.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
    const st = STATUS_META[w.status]
    return (
      <button key={w.id} onClick={() => order && setOpenOrder(order)}
        className="w-full flex items-center gap-3 text-left px-3.5 py-2.5 border-b border-line-soft last:border-b-0 bg-transparent border-x-0 border-t-0 cursor-pointer hover:bg-bg-3 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-acc font-semibold text-[12.5px]">{order?.number ?? '—'}</span>
            <Badge color={st.color}>{st.label}</Badge>
          </div>
          <div className="meta mt-0.5 truncate">
            {project ? `${project.code} · ${sel.clientName(state, project.client)}` : 'Sin proyecto'}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="mono font-semibold text-[12.5px]">
            {sel.warehouseClasificado(w) ? `${sel.warehouseDays(state, w)}d` : <span className="text-warn">sin clasificar</span>}
          </div>
          {w.estimatedDone && <div className="meta mt-0.5">{fmtDate(w.estimatedDone)}</div>}
        </div>
      </button>
    )
  }

  return (
    <div>
      <SecTitle title="Panel de almacén" sub="Tu carga de trabajo de hoy"
        right={<button className="btn btn-primary" onClick={() => onNavigate('almacen')}><Icon name="pkg" size={15} /> Ir a la cola</button>} />

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="kpi kpi-accent">
          <div className="k-label">Días de trabajo</div>
          <div className="k-val text-[26px]">{load.dias}</div>
          <div className="k-foot">{load.total} OC en tu cola</div>
        </div>
        <div className="kpi"><div className="k-label">En proceso</div><div className="k-val text-[26px] text-warn">{load.proceso}</div><div className="k-foot">{load.diasProceso} días</div></div>
        <div className="kpi"><div className="k-label">Por iniciar / pausados</div><div className="k-val text-[26px]">{load.pendiente}<span className="text-[17px] text-tx-2"> / {load.pausado}</span></div><div className="k-foot">esperando turno</div></div>
        <div className="kpi"><div className="k-label">Terminadas (7 días)</div><div className="k-val text-[26px] text-ok">{recientes.length}</div><div className="k-foot">de {done.length} en total</div></div>
      </div>

      {sinClasificar.length > 0 && (
        <div className="flex items-start gap-3 mb-4 p-3 rounded-[8px] border"
          style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
          <Icon name="alert" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--warn)' }} />
          <div className="text-[12.5px] text-tx-2">
            Tienes <b>{sinClasificar.length}</b> OC sin clasificar. Mientras no les pongas los días,
            no cuentan en la carga que ve el equipo de ventas para comprometer entregas.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="card-h">
            <Icon name="pkg" size={17} className="text-warn" />
            <span className="ttl">Trabajando ahora</span>
          </div>
          {enProceso.length === 0
            ? <Empty icon="pkg">No tienes nada en proceso</Empty>
            : <div>{enProceso.map(fila)}</div>}
        </div>

        <div className="card overflow-hidden">
          <div className="card-h">
            <Icon name="layers" size={17} className="text-acc" />
            <span className="ttl">Lo que sigue</span>
            <span className="flex-1"></span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('almacen')}>Ver todo <Icon name="arrowRight" size={13} /></button>
          </div>
          {siguientes.length === 0
            ? <Empty icon="check">La cola está al día</Empty>
            : <div>{siguientes.map(fila)}</div>}
        </div>
      </div>

      {/* Lo que hay que resurtir. Solo aparece cuando ya hay inventario capturado. */}
      <div className="mt-4">
        <InventoryLowCard onNavigate={onNavigate} />
      </div>

      {openOrder && <OrderDetailModal order={openOrder} onClose={() => setOpenOrder(null)} />}
    </div>
  )
}

/** Estado en almacén de las OC del proyecto (una línea por orden de compra). */
export function WarehouseProjectLine({ project }: { project: Project }) {
  const { state } = useStore()
  const items = sel.warehouseForProject(state, project.id)
  if (items.length === 0) return null
  const queue = sel.warehouseQueue(state)

  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => {
        const order = state.orders.find(o => o.id === item.orderId)
        const pos = queue.findIndex(w => w.id === item.id)
        const st = STATUS_META[item.status]
        return (
          <div key={item.id} className="flex items-center gap-2 flex-wrap text-[12.5px]">
            <Icon name="pkg" size={14} className="text-acc" />
            <span className="text-tx-2">Almacén · OC</span>
            <span className="mono text-acc font-semibold">{order?.number ?? '—'}</span>
            <Badge color={st.color}>{st.label}</Badge>
            {pos >= 0 && <span className="text-tx-2">posición {pos + 1} de {queue.length}</span>}
            {sel.warehouseClasificado(item) && <span className="text-tx-2">· {item.size ? `${SIZE_META[item.size].label} · ` : ''}{sel.warehouseDays(state, item)}d</span>}
            {item.estimatedDone && <span className="text-tx-2">· estimo terminar {fmtDate(item.estimatedDone)}</span>}
          </div>
        )
      })}
    </div>
  )
}
