// ============================================================
//  SUPPLIERS — CRUD, purchase history, active toggle
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtDate, fmtK } from '../../core/data'
import { Modal, Field, Input, TextArea, Select, Rating, Badge, OCStatus, Empty, Confirm } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Supplier, SupplierInput } from '../../core/types'

const CATS = ['Fabricante de racks', 'Fletes y transporte', 'Cuadrilla de instalación', 'Materiales', 'Otro']
const catColor = (c: string) => (({ 'Fabricante de racks': 'var(--st-4)', 'Fletes y transporte': 'var(--st-5)', 'Cuadrilla de instalación': 'var(--st-8)' } as Record<string, string>)[c] || 'var(--tx-2)')

function SupplierForm({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const { dispatch } = useStore()
  const [s, setS] = React.useState<SupplierInput>(() => supplier ? { ...supplier } : { name: '', cat: CATS[0], contact: '', phone: '', email: '', city: '', rating: 4, active: true, notes: '' })
  const set = (k: keyof SupplierInput, v: unknown) => setS(o => ({ ...o, [k]: v }))
  const valid = s.name
  return (
    <Modal width={580} icon={supplier ? 'edit' : 'plus'} title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={() => { dispatch({ type: 'SAVE_SUPPLIER', supplier: s }); onClose() }}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Razón social" span={2}><Input value={s.name} onChange={e => set('name', e.target.value)} placeholder="Empresa S.A. de C.V." /></Field>
        <Field label="Categoría"><Select value={s.cat} onChange={e => set('cat', e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Ciudad"><Input value={s.city} onChange={e => set('city', e.target.value)} placeholder="Ciudad, Estado" /></Field>
        <Field label="Persona de contacto"><Input value={s.contact} onChange={e => set('contact', e.target.value)} /></Field>
        <Field label="Teléfono"><Input value={s.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Correo" span={2}><Input value={s.email} onChange={e => set('email', e.target.value)} placeholder="contacto@empresa.mx" /></Field>
        <Field label="Dirección" span={2}><Input value={s.direccion || ''} onChange={e => set('direccion', e.target.value)} placeholder="Calle, número, colonia" /></Field>
        <Field label="Días de crédito"><Input type="number" value={s.diasCredito ?? ''} onChange={e => set('diasCredito', e.target.value === '' ? undefined : +e.target.value)} placeholder="0" /></Field>
        <Field label="Prefijo de factura"><Input value={s.prefijo || ''} onChange={e => set('prefijo', e.target.value)} placeholder="IR, MG…" /></Field>
        <Field label="Cuenta / Banco" span={2}><Input value={s.cuentaBanco || ''} onChange={e => set('cuentaBanco', e.target.value)} placeholder="Cuenta CLABE o banco" /></Field>
        <Field label="Calificación">
          <div className="flex items-center gap-3 h-[38px]">
            <div className="flex gap-1">
              {[1,2,3,4,5].map(i => (
                <svg key={i} onClick={() => set('rating', i)} width={20} height={20} viewBox="0 0 24 24" fill={i <= s.rating ? 'var(--acc)' : 'none'} stroke="var(--acc)" strokeWidth="1.5" className="cursor-pointer" style={{ opacity: i <= s.rating ? 1 : 0.4 }}>
                  <path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>
                </svg>
              ))}
            </div>
          </div>
        </Field>
        <Field label="Estado">
          <button type="button" className="btn h-[38px] justify-center" onClick={() => set('active', !s.active)} style={{ background: s.active ? 'var(--acc-ghost-2)' : 'var(--bg-1)', borderColor: s.active ? 'var(--acc)' : 'var(--line)', color: s.active ? 'var(--acc-bright)' : 'var(--tx-2)' }}>
            {s.active ? 'Activo' : 'Inactivo'}
          </button>
        </Field>
        <Field label="Notas" span={2}><TextArea value={s.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function SupplierDetail({ supplier, onClose, onEdit, onDelete }: { supplier: Supplier; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const { state } = useStore()
  const ocs = sel.ordersForSupplier(state, supplier.id)
  const total = ocs.reduce((a, o) => a + o.amount, 0)
  const pagado = ocs.reduce((a, o) => a + sel.ocPaid(state, o.id), 0)
  const adeudado = ocs.reduce((a, o) => a + sel.ocBalance(state, o), 0)
  return (
    <Modal width={680} onClose={onClose} icon="suppliers"
      title={supplier.name}
      sub={`${supplier.cat} · ${supplier.city}`}
      footer={<>
        <button className="btn btn-danger" disabled={ocs.length > 0} title={ocs.length > 0 ? 'No se puede eliminar: tiene órdenes de compra' : 'Eliminar proveedor'} onClick={onDelete}><Icon name="trash" size={15} /> Eliminar</button>
        <div className="flex-1"></div>
        <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Editar</button>
      </>}>
      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="flex flex-col gap-2.5">
          {supplier.contact && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="user" size={15} className="text-tx-2" /> {supplier.contact}</div>}
          {supplier.phone && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="phone" size={15} className="text-tx-2" /> <span className="mono">{supplier.phone}</span></div>}
          {supplier.email && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="mail" size={15} className="text-tx-2" /> {supplier.email}</div>}
          {supplier.direccion && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="pin" size={15} className="text-tx-2" /> {supplier.direccion}</div>}
          {supplier.prefijo && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="doc" size={15} className="text-tx-2" /> Prefijo de factura: <span className="mono">{supplier.prefijo}</span></div>}
          {(supplier.diasCredito != null || supplier.cuentaBanco) && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="money" size={15} className="text-tx-2" /> {supplier.diasCredito != null ? `${supplier.diasCredito} días de crédito` : ''}{supplier.cuentaBanco ? `${supplier.diasCredito != null ? ' · ' : ''}${supplier.cuentaBanco}` : ''}</div>}
          <div className="flex items-center gap-[9px] text-[13px]"><Rating value={supplier.rating} /> {supplier.active ? <Badge color="var(--ok)">Activo</Badge> : <Badge color="var(--tx-2)">Inactivo</Badge>}</div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-bg-1 border border-line p-3">
            <div className="label-k">OCs totales</div>
            <div className="font-display font-extrabold text-[20px] mt-1">{ocs.length}</div>
          </div>
          <div className="bg-bg-1 border border-line p-3">
            <div className="label-k">Monto total</div>
            <div className="font-display font-extrabold text-[20px] mt-1">{fmtK(total)}</div>
          </div>
          <div className="bg-bg-1 border border-line p-3">
            <div className="label-k">Monto pagado</div>
            <div className="font-display font-extrabold text-[20px] mt-1 text-ok">{fmtK(pagado)}</div>
          </div>
          <div className="bg-bg-1 border border-line p-3">
            <div className="label-k">Monto adeudado</div>
            <div className="font-display font-extrabold text-[20px] mt-1" style={{ color: adeudado > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtK(adeudado)}</div>
          </div>
        </div>
      </div>
      {supplier.notes && <div className="bg-bg-1 py-2.5 px-3.5 text-[12.5px] text-tx-1 mb-5 leading-normal" style={{ borderLeft: '3px solid var(--acc)' }}>{supplier.notes}</div>}

      <div className="label-k mb-2">Historial de compras</div>
      {ocs.length === 0 ? <Empty icon="orders">Sin órdenes de compra registradas</Empty> : (
        <div className="border border-line">
          <table className="tbl">
            <thead><tr><th>OC</th><th>Descripción</th><th>Fecha</th><th className="num">Monto</th><th>Estatus</th></tr></thead>
            <tbody>
              {ocs.map(o => (
                <tr key={o.id}>
                  <td><span className="mono text-acc">{o.number}</span></td>
                  <td className="text-tx-1 text-[12px]">{o.description || '—'}</td>
                  <td className="num text-tx-2 text-[12px]">{fmtDate(o.date)}</td>
                  <td className="num">{fmtMoney(o.amount)}</td>
                  <td><OCStatus status={sel.ocStatus(state, o)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

export function SuppliersPage() {
  const { state, dispatch } = useStore()
  const [detail, setDetail] = React.useState<Supplier | null>(null)
  const [del, setDel] = React.useState<Supplier | null>(null)
  const [form, setForm] = React.useState<Partial<Supplier> | null>(null)
  const [showInactive, setShowInactive] = React.useState(true)
  const list = state.suppliers.filter(s => showInactive || s.active)

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Proveedores</h2><span className="sub">{state.suppliers.filter(s=>s.active).length} activos</span></div>
        <div className="flex gap-2.5">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowInactive(v => !v)}>{showInactive ? 'Ocultar inactivos' : 'Mostrar inactivos'}</button>
          <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nuevo proveedor</button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-3.5">
        {list.map(s => {
          const ocs = sel.ordersForSupplier(state, s.id)
          const total = ocs.reduce((a, o) => a + o.amount, 0)
          return (
            <div key={s.id} className="card flex flex-col" style={{ opacity: s.active ? 1 : 0.6 }}>
              <div className="p-4 cursor-pointer flex-1" onClick={() => setDetail(s)}>
                <div className="spread items-start">
                  <div className="flex gap-[11px]">
                    <span className="w-[38px] h-[38px] flex-none grid place-items-center bg-bg-1" style={{ border: `1px solid ${catColor(s.cat)}`, color: catColor(s.cat) }}><Icon name="suppliers" size={19} /></span>
                    <div>
                      <div className="font-bold text-[14px] font-display leading-[1.25]">{s.name}</div>
                      <Badge color={catColor(s.cat)}>{s.cat}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 mt-3.5 text-[12px] text-tx-1">
                  <span className="flex items-center gap-[5px]"><Icon name="pin" size={12} className="opacity-60" /> {s.city}</span>
                  <Rating value={s.rating} size={12} />
                </div>
                <div className="flex justify-between mt-3.5 pt-3 border-t border-line-soft">
                  <div><div className="label-k">OCs</div><div className="font-mono font-semibold text-[15px] mt-0.5">{ocs.length}</div></div>
                  <div className="text-right"><div className="label-k">Acumulado</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtK(total)}</div></div>
                </div>
              </div>
              <div className="flex border-t border-line">
                <button className="btn btn-ghost btn-sm flex-1 border-none justify-center" onClick={() => setForm(s)}><Icon name="edit" size={13} /> Editar</button>
                <button className="btn btn-ghost btn-sm flex-1 justify-center" style={{ border: 'none', borderLeft: '1px solid var(--line)', color: s.active ? 'var(--tx-2)' : 'var(--ok)' }} onClick={() => dispatch({ type: 'TOGGLE_SUPPLIER', id: s.id })}>{s.active ? 'Desactivar' : 'Activar'}</button>
              </div>
            </div>
          )
        })}
      </div>

      {detail && <SupplierDetail supplier={state.suppliers.find(x => x.id === detail.id)!} onClose={() => setDetail(null)} onEdit={() => { setForm(detail); setDetail(null) }} onDelete={() => { setDel(detail); setDetail(null) }} />}
      {form && <SupplierForm supplier={form.id ? (form as Supplier) : undefined} onClose={() => setForm(null)} />}
      {del && <Confirm title="Eliminar proveedor" message={`¿Eliminar a ${del.name}? Esta acción no se puede deshacer.`} onConfirm={() => { dispatch({ type: 'DELETE_SUPPLIER', id: del.id }); setDel(null) }} onClose={() => setDel(null)} />}
    </div>
  )
}
