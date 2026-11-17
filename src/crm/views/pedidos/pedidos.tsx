// ============================================================
//  PEDIDOS DE MATERIAL — registro ligero de "alguien pidió material":
//  quién lo solicitó, cuándo, a quién, qué y cuándo se espera que llegue.
//  Sirve para saber qué tenemos pedido y cuándo va a llegar.
//  NO es una OC: no lleva importes, pagos ni mueve inventario.
// ============================================================
import * as React from 'react'
import { useStore, fmtDate, fmtDateShort, daysBetween, TODAY_ISO, uid, isDireccion } from '../../core/data'
import { Modal, Field, Input, TextArea, Select, Confirm, SecTitle, Empty, KPI, Seg, Badge, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { MaterialRequest, MaterialRequestInput, MaterialRequestStatus } from '../../core/types'

const STATUS_META: Record<MaterialRequestStatus, { label: string; color: string }> = {
  pedido:    { label: 'Pedido',    color: 'var(--warn)' },
  recibido:  { label: 'Recibido',  color: 'var(--ok)' },
  cancelado: { label: 'Cancelado', color: 'var(--tx-3)' },
}

/** Texto y color de "cuándo llega" para un pedido que aún no llega. */
const llegada = (m: MaterialRequest): { txt: string; color: string } | null => {
  if (m.status !== 'pedido') return null
  const d = daysBetween(m.eta)
  if (d == null) return { txt: 'sin fecha de llegada', color: 'var(--tx-3)' }
  if (d < 0) return { txt: `atrasado ${-d} día${d === -1 ? '' : 's'}`, color: 'var(--danger)' }
  if (d === 0) return { txt: 'llega hoy', color: 'var(--ok)' }
  if (d === 1) return { txt: 'llega mañana', color: 'var(--warn)' }
  return { txt: `faltan ${d} días`, color: d <= 7 ? 'var(--warn)' : 'var(--tx-2)' }
}

/* ---- Formulario de registro / edición ---- */
type ItemRow = { id: string; description: string; qty: string }
type FormState = {
  requestedBy: string; requestedAt: string; supplier: string; reference: string
  items: ItemRow[]; eta: string; status: MaterialRequestStatus; receivedAt: string; notes: string
}

function PedidoForm({ pedido, onClose }: { pedido?: MaterialRequest; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [f, setF] = React.useState<FormState>(() => pedido
    ? {
        requestedBy: pedido.requestedBy, requestedAt: pedido.requestedAt, supplier: pedido.supplier,
        reference: pedido.reference ?? '', items: pedido.items.map(i => ({ ...i })),
        eta: pedido.eta ?? '', status: pedido.status, receivedAt: pedido.receivedAt ?? '', notes: pedido.notes ?? '',
      }
    : {
        requestedBy: state.currentUser?.name ?? '', requestedAt: TODAY_ISO, supplier: '', reference: '',
        items: [{ id: uid('pi'), description: '', qty: '' }],
        eta: '', status: 'pedido', receivedAt: '', notes: '',
      })

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(s => ({ ...s, [k]: v }))
  const setItem = (id: string, patch: Partial<ItemRow>) => setF(s => ({ ...s, items: s.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }))
  const addItem = () => setF(s => ({ ...s, items: [...s.items, { id: uid('pi'), description: '', qty: '' }] }))
  const removeItem = (id: string) => setF(s => ({ ...s, items: s.items.filter(i => i.id !== id) }))

  const { requestClose, guard } = useUnsavedGuard(f, onClose)
  const items = f.items.filter(i => i.description.trim() !== '')
  const valid = f.requestedBy.trim() !== '' && f.requestedAt !== '' && items.length > 0

  const save = () => {
    const payload: MaterialRequestInput = {
      ...(pedido ? { id: pedido.id, createdAt: pedido.createdAt, ...(pedido.createdBy ? { createdBy: pedido.createdBy } : {}) } : {}),
      requestedBy: f.requestedBy.trim(),
      requestedAt: f.requestedAt,
      supplier: f.supplier.trim(),
      items: items.map(i => ({ id: i.id, description: i.description.trim(), qty: i.qty.trim() })),
      status: f.status,
      ...(f.reference.trim() ? { reference: f.reference.trim() } : {}),
      ...(f.eta ? { eta: f.eta } : {}),
      // La fecha real de llegada solo aplica a lo recibido (hoy, si no se capturó).
      ...(f.status === 'recibido' ? { receivedAt: f.receivedAt || TODAY_ISO } : {}),
      ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    }
    dispatch({ type: 'SAVE_MATERIAL_REQUEST', request: payload })
    onClose()
  }

  // Sugerencias: proveedores del catálogo y usuarios activos (se puede escribir cualquier otro).
  const proveedores = state.suppliers.filter(s => s.active).map(s => s.name).sort((a, b) => a.localeCompare(b))
  const personas = state.users.filter(u => u.active).map(u => u.name).sort((a, b) => a.localeCompare(b))

  return (
    <Modal width={680} icon={pedido ? 'edit' : 'plus'} title={pedido ? 'Editar pedido de material' : 'Registrar pedido de material'} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}>
          <Icon name="check" size={15} /> {pedido ? 'Guardar' : 'Registrar pedido'}
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5 mb-4">
        <Field label="Quién lo solicitó">
          <Input value={f.requestedBy} onChange={e => set('requestedBy', e.target.value)} placeholder="Nombre" list="pedido-personas" />
        </Field>
        <Field label="Fecha en que se pidió">
          <Input type="date" value={f.requestedAt} onChange={e => set('requestedAt', e.target.value)} />
        </Field>
        <Field label="Proveedor (a quién se le pidió)">
          <Input value={f.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Proveedor" list="pedido-proveedores" />
        </Field>
        <Field label="Fecha estimada de llegada">
          <Input type="date" value={f.eta} onChange={e => set('eta', e.target.value)} />
        </Field>
        <Field label="Para qué es (proyecto, cliente, stock…)" span={2}>
          <Input value={f.reference} onChange={e => set('reference', e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
      <datalist id="pedido-personas">{personas.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="pedido-proveedores">{proveedores.map(n => <option key={n} value={n} />)}</datalist>

      {/* Material */}
      <div className="flex items-center mb-2">
        <span className="label-k">Material pedido</span>
        <span className="flex-1"></span>
        <button className="btn btn-sm btn-primary" onClick={addItem}><Icon name="plus" size={13} /> Agregar renglón</button>
      </div>
      <div className="flex flex-col gap-2 mb-4">
        {f.items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-2">
            <input className="input w-[130px]" value={it.qty} onChange={e => setItem(it.id, { qty: e.target.value })} placeholder="Cantidad" />
            <input className="input flex-1" value={it.description} onChange={e => setItem(it.id, { description: e.target.value })}
              placeholder={`Material ${i + 1}`} autoFocus={!pedido && i === 0} />
            <button className="icon-btn shrink-0" title="Quitar renglón" onClick={() => removeItem(it.id)}
              disabled={f.items.length <= 1} style={{ opacity: f.items.length <= 1 ? 0.4 : 1 }}>
              <Icon name="close" size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Estado">
          <Select value={f.status} onChange={e => set('status', e.target.value as MaterialRequestStatus)}>
            {(Object.keys(STATUS_META) as MaterialRequestStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </Select>
        </Field>
        {f.status === 'recibido'
          ? <Field label="Fecha en que llegó"><Input type="date" value={f.receivedAt || TODAY_ISO} onChange={e => set('receivedAt', e.target.value)} /></Field>
          : <div></div>}
        <Field label="Notas" span={2}>
          <TextArea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
      {guard}
    </Modal>
  )
}

/* ---- Página ---- */
type Filtro = 'pendientes' | 'recibidos' | 'todos'

export function PedidosPage() {
  const { state, dispatch } = useStore()
  const readOnly = isDireccion(state.currentUser?.role)   // dirección: ver sin registrar/editar/eliminar
  const [form, setForm] = React.useState<MaterialRequest | {} | null>(null)
  const [del, setDel] = React.useState<MaterialRequest | null>(null)
  const [filtro, setFiltro] = React.useState<Filtro>('pendientes')
  const [q, setQ] = React.useState('')

  const all = state.materialRequests
  const pendientes = all.filter(m => m.status === 'pedido')
  const atrasados = pendientes.filter(m => (daysBetween(m.eta) ?? 0) < 0)
  const semana = pendientes.filter(m => { const d = daysBetween(m.eta); return d != null && d >= 0 && d <= 7 })
  const sinFecha = pendientes.filter(m => !m.eta)

  const texto = q.trim().toLowerCase()
  const lista = all
    .filter(m => filtro === 'todos' ? true : filtro === 'pendientes' ? m.status === 'pedido' : m.status === 'recibido')
    .filter(m => !texto || [m.requestedBy, m.supplier, m.reference ?? '', m.notes ?? '', ...m.items.map(i => i.description)].join(' ').toLowerCase().includes(texto))
    .sort((a, b) => {
      // Pendientes: lo que llega (o debió llegar) primero arriba; sin fecha al final.
      if (filtro === 'pendientes') return (a.eta || '9999').localeCompare(b.eta || '9999') || a.requestedAt.localeCompare(b.requestedAt)
      // Recibidos / todos: lo más reciente arriba.
      return (b.receivedAt || b.requestedAt).localeCompare(a.receivedAt || a.requestedAt)
    })

  const marcarRecibido = (m: MaterialRequest) =>
    dispatch({ type: 'SAVE_MATERIAL_REQUEST', request: { ...m, status: 'recibido', receivedAt: TODAY_ISO } })

  return (
    <div>
      <SecTitle title="Pedidos de material" sub="Qué tenemos pedido y cuándo va a llegar"
        right={readOnly ? undefined : <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Registrar pedido</button>} />

      <div className="grid grid-cols-4 gap-3.5 mb-4">
        <KPI label="Por llegar" value={pendientes.length} icon="truck" accent />
        <KPI label="Llegan en 7 días" value={semana.length} icon="calendar" />
        <KPI label="Atrasados" value={atrasados.length} icon="alert" />
        <KPI label="Sin fecha de llegada" value={sinFecha.length} icon="flag" />
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <Seg value={filtro} onChange={v => setFiltro(v as Filtro)} options={[
          { value: 'pendientes', label: 'Por llegar' },
          { value: 'recibidos', label: 'Recibidos' },
          { value: 'todos', label: 'Todos' },
        ]} />
        <div className="flex-1"></div>
        <div className="w-[280px]"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar material, proveedor, quién pidió…" /></div>
      </div>

      {lista.length === 0 ? (
        <div className="card"><div className="card-b">
          <Empty icon="truck">{all.length === 0 ? 'Aún no hay pedidos de material registrados' : 'No hay pedidos con ese filtro'}</Empty>
        </div></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="tbl">
            <thead><tr>
              <th>Se pidió</th><th>Solicitó</th><th>Material</th><th>Proveedor</th><th>Llega</th><th>Estado</th>{!readOnly && <th></th>}
            </tr></thead>
            <tbody>
              {lista.map(m => {
                const st = STATUS_META[m.status]
                const ll = llegada(m)
                return (
                  <tr key={m.id} className="align-top">
                    <td className="text-[12.5px] whitespace-nowrap">{fmtDateShort(m.requestedAt)}</td>
                    <td className="text-[12.5px]">{m.requestedBy || '—'}</td>
                    <td>
                      {m.items.map(i => (
                        <div key={i.id} className="text-[12.5px] text-tx-0">
                          {i.qty && <span className="mono font-semibold mr-1.5">{i.qty}</span>}{i.description}
                        </div>
                      ))}
                      {m.reference && <div className="meta mt-0.5">Para: {m.reference}</div>}
                      {m.notes && <div className="meta mt-0.5">{m.notes}</div>}
                    </td>
                    <td className="text-[12.5px]">{m.supplier || <span className="text-tx-3">—</span>}</td>
                    <td className="whitespace-nowrap">
                      {m.status === 'recibido'
                        ? <><div className="text-[12.5px]">{fmtDate(m.receivedAt)}</div><div className="meta mt-0.5">llegó</div></>
                        : <>
                            <div className="text-[12.5px]">{m.eta ? fmtDate(m.eta) : <span className="text-tx-3">—</span>}</div>
                            {ll && <div className="text-[11.5px] mt-0.5 font-semibold" style={{ color: ll.color }}>{ll.txt}</div>}
                          </>}
                    </td>
                    <td><Badge color={st.color}>{st.label}</Badge></td>
                    {!readOnly && (
                      <td className="whitespace-nowrap text-right">
                        {m.status === 'pedido' && (
                          <button className="btn btn-sm btn-ghost mr-1" onClick={() => marcarRecibido(m)} title="Marcar que ya llegó (hoy)">
                            <Icon name="check" size={13} /> Recibido
                          </button>
                        )}
                        <button className="icon-btn" title="Editar" onClick={() => setForm(m)}><Icon name="edit" size={15} /></button>
                        <button className="icon-btn" title="Eliminar" onClick={() => setDel(m)}><Icon name="trash" size={15} /></button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && <PedidoForm pedido={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
      {del && <Confirm title="Eliminar pedido" message={`¿Eliminar el pedido de ${del.requestedBy || 'material'} del ${fmtDate(del.requestedAt)}?`}
        onConfirm={() => { dispatch({ type: 'DELETE_MATERIAL_REQUEST', id: del.id }); setDel(null) }} onClose={() => setDel(null)} />}
    </div>
  )
}
