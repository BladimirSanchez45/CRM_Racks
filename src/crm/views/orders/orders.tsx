// ============================================================
//  ÓRDENES DE COMPRA — Control OC + abonos + materiales/PDF
//  Flujo: 1) se crea el proyecto → 2) aparece en "Proyectos sin
//  asignar" y se asigna proveedor → 3) se crea la OC (PDF).
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, fmtDateShort, daysBetween, MESES, uid } from '../../core/data'
import { Modal, Field, Input, Select, FileField, MoneyInput, OCStatus, PaymentBadge, StageBadge, Empty, KPI, Seg } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { AppState, OcItem, Order, OrderInput, Payment, PaymentInput, PaymentStatus, Project } from '../../core/types'

const PAY_STATES: PaymentStatus[] = ['Pagado', 'Programado', 'Cancelado']
const OC_STATES = ['Pendiente', 'Parcial', 'Liquidada', 'Vencida', 'Cancelada'] as const
const COND_SUGGEST = ['Contado', 'Crédito', 'Anticipo', 'Contra entrega', '50% anticipo - 50% finiquito', '50% anticipo - 30 días finiquito']
const STATUS_COLOR: Record<string, string> = {
  Pendiente: 'var(--tx-2)', Parcial: 'var(--st-5)', Liquidada: 'var(--ok)', Vencida: 'var(--danger)', Cancelada: 'var(--tx-3)',
}
const IVA = 0.16
const itemsTotals = (items: OcItem[]) => {
  const subtotal = items.reduce((a, it) => a + (it.qty || 0) * (it.unitPrice || 0), 0)
  return { subtotal, iva: subtotal * IVA, total: subtotal * (1 + IVA) }
}
/** Descripción de la OC = código del proyecto + cliente (o su descripción libre). */
const ocDesc = (state: AppState, o: Order) => {
  if (o.projectId) { const p = state.projects.find(x => x.id === o.projectId); if (p) return `${p.code} · ${sel.clientName(state, p.client)}` }
  return o.description
}

/* ---- Generar PDF de la OC (vista de impresión del navegador) ---- */
function printOC(state: AppState, o: Order, items: OcItem[]) {
  const supplier = sel.supplier(state, o.supplierId)
  const project = o.projectId ? state.projects.find(p => p.id === o.projectId) : undefined
  const { subtotal, iva, total } = itemsTotals(items)
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const m = (n: number) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const w = window.open('', '_blank', 'width=820,height=1000')
  if (!w) { alert('Permite las ventanas emergentes para generar el PDF.'); return }
  const rows = items.length
    ? items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.description)}</td><td class=r>${it.qty}</td><td class=r>${m(it.unitPrice)}</td><td class=r>${m((it.qty || 0) * (it.unitPrice || 0))}</td></tr>`).join('')
    : `<tr><td colspan=5 style="text-align:center;color:#999">— Sin materiales capturados —</td></tr>`
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.number)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1b2230;padding:34px;font-size:13px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2f6feb;padding-bottom:12px;margin-bottom:18px}
    .brand{font-size:24px;font-weight:800;color:#2f6feb;letter-spacing:.5px}
    h1{font-size:20px;margin:0}
    table.meta td{padding:2px 10px 2px 0}
    table.items{width:100%;border-collapse:collapse;margin-top:16px}
    table.items th,table.items td{border:1px solid #d0d4da;padding:7px 9px}
    table.items th{background:#f1f3f6;text-align:left}
    .r{text-align:right}
    table.tot{margin-top:12px;width:300px;margin-left:auto;border-collapse:collapse}
    table.tot td{padding:5px 9px}
    table.tot tr.g td{font-weight:800;font-size:15px;border-top:2px solid #1b2230}
    .foot{margin-top:40px;color:#999;font-size:11px}
    @media print{.noprint{display:none}}
  </style></head><body>
    <div class="head"><div><div class="brand">CC RACKS</div><div style="color:#666">Orden de Compra</div></div>
      <div style="text-align:right"><h1>${esc(o.number)}</h1><div style="color:#666">${esc(o.date)}</div></div></div>
    <table class="meta">
      <tr><td><b>Proveedor:</b></td><td>${esc(supplier ? supplier.name : '—')}</td></tr>
      <tr><td><b>Proyecto:</b></td><td>${project ? esc(project.code + ' · ' + sel.clientName(state, project.client)) : '—'}</td></tr>
      <tr><td><b>Condiciones:</b></td><td>${esc(o.conditions || '—')}</td></tr>
      <tr><td><b>Responsable:</b></td><td>${esc(o.responsible || '—')}</td></tr>
    </table>
    <table class="items"><thead><tr><th>#</th><th>Descripción</th><th class="r">Cant.</th><th class="r">P. Unitario</th><th class="r">Importe</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${m(subtotal)}</td></tr>
      <tr><td>IVA 16%</td><td class="r">${m(iva)}</td></tr>
      <tr class="g"><td>Total</td><td class="r">${m(total)}</td></tr>
    </table>
    <div class="foot">Documento generado por el CRM de CC Racks.</div>
    <button class="noprint" onclick="window.print()" style="margin-top:24px;padding:10px 22px;background:#2f6feb;color:#fff;border:0;border-radius:8px;cursor:pointer">Imprimir / Guardar PDF</button>
  </body></html>`)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* el usuario puede usar el botón */ } }, 400)
}

/* ============================================================
   Formulario de abono
   ============================================================ */
type AbonoFormState = { id?: string; orderId: string; n: number | string; date: string; amount: number | string; method: string; status: PaymentStatus; comments: string }
function AbonoForm({ order, payment, onClose }: { order: Order; payment?: Payment; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const nextN = Math.max(0, ...sel.paymentsForOrder(state, order.id).map(p => p.n)) + 1
  const [a, setA] = React.useState<AbonoFormState>(() => payment ? { ...payment } : {
    orderId: order.id, n: nextN, date: '2026-06-02', amount: '', method: '', status: 'Programado', comments: '',
  })
  const set = (k: keyof AbonoFormState, v: unknown) => setA(s => ({ ...s, [k]: v }))
  const valid = a.date && a.amount
  const save = () => { dispatch({ type: 'SAVE_PAYMENT', payment: { ...a, n: +a.n || 1, amount: +a.amount || 0 } as PaymentInput }); onClose() }
  return (
    <Modal width={480} icon={payment ? 'edit' : 'plus'} title={payment ? 'Editar abono' : 'Nuevo abono'} sub={order.number} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar abono</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="No. Abono"><Input type="number" value={a.n} onChange={e => set('n', e.target.value)} /></Field>
        <Field label="Fecha de pago"><Input type="date" value={a.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Importe (MXN)"><MoneyInput value={a.amount} onChange={v => set('amount', v)} /></Field>
        <Field label="Estado"><Select value={a.status} onChange={e => set('status', e.target.value)}>{PAY_STATES.map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Método / Ref." span={2}><Input value={a.method} onChange={e => set('method', e.target.value)} placeholder="Transferencia, cheque, folio…" /></Field>
        <Field label="Comentarios" span={2}><Input value={a.comments} onChange={e => set('comments', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

/* ============================================================
   Detalle de OC
   ============================================================ */
function OrderDetail({ order, onClose, onEdit }: { order: Order; onClose: () => void; onEdit: () => void }) {
  const { state, dispatch } = useStore()
  const o = state.orders.find(x => x.id === order.id) || order
  const supplier = sel.supplier(state, o.supplierId)
  const project = o.projectId ? state.projects.find(p => p.id === o.projectId) : undefined
  const abonos = sel.paymentsForOrder(state, o.id)
  const paid = sel.ocPaid(state, o.id)
  const balance = sel.ocBalance(state, o)
  const pct = sel.ocPct(state, o)
  const next = sel.ocNextPayment(state, o.id)
  const days = next ? daysBetween(next) : null
  const items = o.items || []
  const [abono, setAbono] = React.useState<Payment | {} | null>(null)

  return (
    <Modal width={780} onClose={onClose}
      title={<span className="flex items-center gap-3">{o.number} <OCStatus status={sel.ocStatus(state, o)} /></span>}
      sub={`${supplier ? supplier.name : '—'} · ${ocDesc(state, o)}`}
      footer={<>
        <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Editar OC</button>
        <button className="btn btn-ghost" onClick={() => printOC(state, o, items)}><Icon name="download" size={14} /> PDF</button>
        <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DELETE_ORDER', id: o.id }); onClose() }}><Icon name="trash" size={14} /></button>
        <div className="flex-1"></div>
        <button className="btn btn-primary" onClick={() => setAbono({})}><Icon name="plus" size={15} /> Agregar abono</button>
      </>}>

      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <div className="bg-bg-1 border border-line rounded-[8px] p-3.5"><div className="label-k">Monto total</div><div className="font-display font-extrabold text-[22px] mt-1">{fmtMoney(o.amount)}</div></div>
        <div className="bg-bg-1 border border-line rounded-[8px] p-3.5"><div className="label-k">Pagado</div><div className="font-display font-extrabold text-[22px] mt-1 text-ok">{fmtMoney(paid)}</div></div>
        <div className="bg-bg-1 border border-line rounded-[8px] p-3.5"><div className="label-k">Saldo</div><div className="font-display font-extrabold text-[22px] mt-1" style={{ color: balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(balance)}</div></div>
      </div>

      <div className="mb-5">
        <div className="flex justify-between mb-1.5"><span className="label-k">Avance de pago</span><span className="mono text-[12px] text-tx-2">{(pct * 100).toFixed(0)}%</span></div>
        <div className="bar"><i style={{ width: `${Math.min(100, pct * 100)}%`, background: balance <= 0 ? 'var(--ok)' : 'var(--acc)' }}></i></div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-5 text-[13px]">
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Fecha OC</span><span>{fmtDate(o.date)}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Proyecto</span><span>{project ? `${project.code} · ${sel.clientName(state, project.client)}` : '—'}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Condiciones</span><span className="text-right">{o.conditions}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Responsable</span><span>{o.responsible || '—'}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Próximo pago</span><span>{next ? <>{fmtDate(next)} {days != null && <span className="mono text-[11px]" style={{ color: days < 0 ? 'var(--danger)' : days < 7 ? 'var(--warn)' : 'var(--tx-2)' }}>({days < 0 ? `${-days}d vencido` : days + 'd'})</span>}</> : '—'}</span></div>
      </div>

      {items.length > 0 && (
        <div className="mb-5">
          <div className="label-k mb-2">Materiales ({items.length})</div>
          <div className="border border-line rounded-[8px] overflow-hidden">
            <table className="tbl">
              <thead><tr><th>Descripción</th><th className="num">Cant.</th><th className="num">C. unit.</th><th className="num">Importe</th></tr></thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} style={{ cursor: 'default' }}>
                    <td className="text-[12.5px]">{it.description}</td>
                    <td className="num">{it.qty}</td>
                    <td className="num">{fmtMoney2(it.unitPrice)}</td>
                    <td className="num">{fmtMoney2((it.qty || 0) * (it.unitPrice || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="label-k mb-2">Abonos ({abonos.length})</div>
      {abonos.length === 0 ? <Empty icon="money">Sin abonos registrados</Empty> : (
        <div className="border border-line rounded-[8px] overflow-hidden">
          <table className="tbl">
            <thead><tr><th>#</th><th>Fecha</th><th className="num">Importe</th><th>Método / Ref.</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {abonos.map(p => (
                <tr key={p.id} style={{ cursor: 'default' }}>
                  <td className="mono">{p.n}</td>
                  <td className="num text-tx-1 text-[12px]">{fmtDateShort(p.date)}</td>
                  <td className="num">{fmtMoney2(p.amount)}</td>
                  <td className="text-tx-1 text-[12px]">{p.method || '—'}{p.comments ? <div className="meta mt-px">{p.comments}</div> : null}</td>
                  <td><PaymentBadge status={p.status} /></td>
                  <td><div className="flex gap-1 justify-end">
                    <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setAbono(p)}><Icon name="edit" size={13} /></button>
                    <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => dispatch({ type: 'DELETE_PAYMENT', id: p.id })}><Icon name="trash" size={13} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abono && <AbonoForm order={o} payment={'id' in abono ? abono : undefined} onClose={() => setAbono(null)} />}
    </Modal>
  )
}

/* ============================================================
   Formulario de OC (con proyecto, condiciones libres y materiales)
   ============================================================ */
type OcFormState = {
  id?: string; number: string; date: string; supplierId: string; projectId?: string
  description: string; conditions: string; amount: number | string; responsible: string
  file: string; items: OcItem[]; cancelled?: boolean
}
function OrderForm({ order, onClose }: { order?: Partial<Order>; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const editing = !!order?.id
  const [o, setO] = React.useState<OcFormState>(() => ({
    id: order?.id,
    number: order?.number || ('OC-' + String(Math.floor(Math.random() * 9000) + 1000)),
    date: order?.date || '2026-06-02',
    supplierId: order?.supplierId || '',
    projectId: order?.projectId,
    description: order?.description || '',
    conditions: order?.conditions || '',
    amount: order?.amount ?? '',
    responsible: order?.responsible || 'Administración',
    file: order?.file || '',
    items: order?.items ? JSON.parse(JSON.stringify(order.items)) : [],
    cancelled: order?.cancelled || false,
  }))
  const set = (k: keyof OcFormState, v: unknown) => setO(s => ({ ...s, [k]: v }))
  const onPickProject = (pid: string) => {
    const p = state.projects.find(x => x.id === pid)
    setO(s => ({
      ...s, projectId: pid || undefined,
      description: p ? `${p.code} · ${sel.clientName(state, p.client)}` : s.description,
      responsible: p ? sel.sellerName(state, p.seller) : s.responsible,
      supplierId: s.supplierId || (p && p.suppliers[0]) || '',
    }))
  }
  const addItem = () => setO(s => ({ ...s, items: [...s.items, { id: uid('it'), description: '', qty: 1, unitPrice: 0 }] }))
  const updItem = (i: number, k: keyof OcItem, v: unknown) => setO(s => ({ ...s, items: s.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }))
  const delItem = (i: number) => setO(s => ({ ...s, items: s.items.filter((_, idx) => idx !== i) }))

  const { subtotal, iva, total } = itemsTotals(o.items)
  const hasItems = o.items.length > 0
  const valid = o.number && o.supplierId && (hasItems ? total > 0 : !!o.amount)
  const save = () => {
    const ord: OrderInput = { ...o, amount: hasItems ? total : (+o.amount || 0), items: o.items.length ? o.items : undefined }
    dispatch({ type: 'SAVE_ORDER', order: ord })
    onClose()
  }

  return (
    <Modal width={760} icon={editing ? 'edit' : 'plus'} title={editing ? 'Editar orden de compra' : 'Nueva orden de compra'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-ghost" disabled={!o.supplierId} onClick={() => printOC(state, { ...o, amount: hasItems ? total : (+o.amount || 0) } as Order, o.items)}><Icon name="download" size={14} /> Generar PDF</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar OC</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="No. de OC"><Input className="input mono" value={o.number} onChange={e => set('number', e.target.value)} /></Field>
        <Field label="Fecha OC"><Input type="date" value={o.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Proyecto asociado" span={2}>
          <Select value={o.projectId || ''} onChange={e => onPickProject(e.target.value)}>
            <option value="">Sin proyecto</option>
            {state.projects.map(p => <option key={p.id} value={p.id}>{p.code} · {sel.clientName(state, p.client)}</option>)}
          </Select>
        </Field>
        <Field label="Proveedor" span={2}>
          <Select value={o.supplierId} onChange={e => set('supplierId', e.target.value)}>
            <option value="">Selecciona…</option>
            {state.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Descripción" span={2}><Input value={o.description} onChange={e => set('description', e.target.value)} placeholder="Concepto de la compra" /></Field>
        <Field label="Condiciones" span={2}>
          <Input list="cond-suggest" value={o.conditions} onChange={e => set('conditions', e.target.value)} placeholder="Ej. 50% anticipo - 30 días finiquito" />
          <datalist id="cond-suggest">{COND_SUGGEST.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        {hasItems
          ? <Field label="Monto total (con IVA)"><div className="input mono flex items-center">{fmtMoney2(total)}</div></Field>
          : <Field label="Monto total (MXN)"><MoneyInput value={o.amount} onChange={v => set('amount', v)} /></Field>}
        <Field label="Responsable (vendedor)"><Input value={o.responsible} onChange={e => set('responsible', e.target.value)} /></Field>
      </div>

      {/* materiales */}
      <div className="mt-4">
        <div className="spread mb-2">
          <span className="label-k">Materiales (lista del vendedor)</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}><Icon name="plus" size={13} /> Agregar material</button>
        </div>
        {!hasItems ? (
          <div className="bg-bg-1 border border-line rounded-[8px] p-3 text-center text-tx-3 text-[12px]">Sin materiales. Agrega partidas (calcula subtotal, IVA y total) o captura el monto manualmente.</div>
        ) : (
          <div className="border border-line rounded-[8px] overflow-hidden">
            <table className="tbl">
              <thead><tr><th>Descripción</th><th className="num">Cant.</th><th className="num">C. unit.</th><th className="num">Importe</th><th>Proveedor</th><th></th></tr></thead>
              <tbody>
                {o.items.map((it, i) => (
                  <tr key={it.id} style={{ cursor: 'default' }}>
                    <td><input className="w-full bg-bg-2 border border-line-2 rounded-[6px] px-2 py-1 text-[12px] outline-none focus:border-acc" value={it.description} onChange={e => updItem(i, 'description', e.target.value)} placeholder="Material / concepto" /></td>
                    <td className="num"><input type="number" className="w-[58px] bg-bg-2 border border-line-2 rounded-[6px] px-2 py-1 text-[12px] text-right outline-none focus:border-acc" value={it.qty} onChange={e => updItem(i, 'qty', +e.target.value || 0)} /></td>
                    <td className="num"><input type="number" className="w-[90px] bg-bg-2 border border-line-2 rounded-[6px] px-2 py-1 text-[12px] text-right outline-none focus:border-acc" value={it.unitPrice} onChange={e => updItem(i, 'unitPrice', +e.target.value || 0)} /></td>
                    <td className="num text-[12px]">{fmtMoney2((it.qty || 0) * (it.unitPrice || 0))}</td>
                    <td><select className="bg-bg-2 border border-line-2 rounded-[6px] px-1 py-1 text-[11.5px] outline-none focus:border-acc max-w-[130px]" value={it.supplierId || ''} onChange={e => updItem(i, 'supplierId', e.target.value || undefined)}>
                      <option value="">(de la OC)</option>
                      {state.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></td>
                    <td><button type="button" className="icon-btn w-7 h-7" onClick={() => delItem(i)}><Icon name="trash" size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-6 p-3 bg-bg-1 border-t border-line text-[13px]">
              <div className="text-right"><div className="label-k">Subtotal</div><div className="mono mt-0.5">{fmtMoney2(subtotal)}</div></div>
              <div className="text-right"><div className="label-k">IVA 16%</div><div className="mono mt-0.5">{fmtMoney2(iva)}</div></div>
              <div className="text-right"><div className="label-k">Total</div><div className="mono mt-0.5 font-bold text-[15px]">{fmtMoney2(total)}</div></div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3.5 items-end">
        <Field label="Archivo adjunto (OC firmada)"><FileField label="" value={o.file} onChange={n => set('file', n)} accept=".pdf,.jpg,.png" /></Field>
        <Field label="Estado">
          <button type="button" className="btn h-[38px] justify-center w-full" onClick={() => set('cancelled', !o.cancelled)} style={{ color: o.cancelled ? 'var(--danger)' : 'var(--tx-2)' }}>
            {o.cancelled ? 'Cancelada' : 'Activa'}
          </button>
        </Field>
      </div>
    </Modal>
  )
}

/* ---- Asignar proveedor a un proyecto sin asignar (paso 2) ---- */
function AssignSupplier({ project, onClose, onCreateOC }: { project: Project; onClose: () => void; onCreateOC: (sid: string) => void }) {
  const { state, dispatch } = useStore()
  const [sid, setSid] = React.useState(project.suppliers[0] || '')
  const assign = () => { if (sid) dispatch({ type: 'SAVE_PROJECT', project: { ...project, suppliers: [sid] } }) }
  return (
    <Modal width={460} icon="handshake" title="Asignar proveedor" sub={`${project.code} · ${sel.clientName(state, project.client)}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-ghost' + (!sid ? ' opacity-50' : '')} disabled={!sid} onClick={() => { assign(); onClose() }}>Solo asignar</button>
        <button className={'btn btn-primary' + (!sid ? ' opacity-50' : '')} disabled={!sid} onClick={() => { assign(); onCreateOC(sid) }}>Asignar y crear OC <Icon name="arrowRight" size={14} /></button>
      </>}>
      <Field label="Proveedor">
        <Select value={sid} onChange={e => setSid(e.target.value)}>
          <option value="">Selecciona…</option>
          {state.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <p className="meta mt-3">Al asignar, el proyecto avanza al paso de creación de la Orden de Compra.</p>
    </Modal>
  )
}

/* ============================================================
   Mini-gráfica: pagos por mes (Programado vs Realizado)
   ============================================================ */
function MonthlyChart({ state }: { state: AppState }) {
  const map = new Map<string, { prog: number; paid: number }>()
  for (const p of state.payments) {
    const k = p.date.slice(0, 7)
    if (!map.has(k)) map.set(k, { prog: 0, paid: 0 })
    const m = map.get(k)!
    if (p.status === 'Programado') m.prog += p.amount
    else if (p.status === 'Pagado') m.paid += p.amount
  }
  const rows = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const max = Math.max(1, ...rows.map(([, v]) => Math.max(v.prog, v.paid)))
  if (rows.length === 0) return <Empty icon="money">Sin pagos</Empty>
  return (
    <div>
      <div className="flex items-end gap-2 h-[160px] px-1">
        {rows.map(([k, v]) => {
          const [y, m] = k.split('-')
          return (
            <div key={k} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
              <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 130 }}>
                <div title={`Programado ${fmtMoney(v.prog)}`} className="w-[8px] rounded-t-[2px]" style={{ height: `${(v.prog / max) * 100}%`, background: 'var(--st-2)', minHeight: v.prog ? 2 : 0 }}></div>
                <div title={`Realizado ${fmtMoney(v.paid)}`} className="w-[8px] rounded-t-[2px]" style={{ height: `${(v.paid / max) * 100}%`, background: 'var(--danger)', minHeight: v.paid ? 2 : 0 }}></div>
              </div>
              <div className="mono text-[9px] text-tx-3 whitespace-nowrap">{MESES[+m - 1]}-{y.slice(2)}</div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 justify-center mt-3 text-[11px] text-tx-2">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'var(--st-2)' }}></span> Programado</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'var(--danger)' }}></span> Realizado</span>
      </div>
    </div>
  )
}

/* ============================================================
   Página de Órdenes de Compra
   ============================================================ */
export function OrdersPage() {
  const { state } = useStore()
  const [view, setView] = React.useState('oc')
  const [detail, setDetail] = React.useState<Order | null>(null)
  const [form, setForm] = React.useState<Partial<Order> | null>(null)
  const [assignProj, setAssignProj] = React.useState<Project | null>(null)
  const [fStatus, setFStatus] = React.useState('')
  const [fSupplier, setFSupplier] = React.useState('')

  const ocStatusOf = (o: Order) => sel.ocStatus(state, o)
  const list = state.orders.filter(o => (!fStatus || ocStatusOf(o) === fStatus) && (!fSupplier || o.supplierId === fSupplier))
  const supplierOpts = state.suppliers.filter(s => state.orders.some(o => o.supplierId === s.id))
  const sinAsignar = state.projects.filter(p => p.suppliers.length === 0 && p.stage !== 'finalizado')

  // KPIs
  const totalOC = state.orders.reduce((a, o) => a + o.amount, 0)
  const totalPaid = state.orders.reduce((a, o) => a + sel.ocPaid(state, o.id), 0)
  const saldo = totalOC - totalPaid
  const vencidas = state.orders.filter(o => ocStatusOf(o) === 'Vencida').length
  const prox7 = state.orders.filter(o => {
    const n = sel.ocNextPayment(state, o.id); if (!n) return false
    const d = daysBetween(n); return d != null && d >= 0 && d <= 7 && sel.ocBalance(state, o) > 0
  }).length
  const statusCounts = OC_STATES.map(s => ({ s, n: state.orders.filter(o => ocStatusOf(o) === s).length }))
  const maxCount = Math.max(1, ...statusCounts.map(c => c.n))

  const openOcForProject = (project: Project, sid: string) => {
    setAssignProj(null)
    setForm({ projectId: project.id, supplierId: sid, description: `${project.code} · ${sel.clientName(state, project.client)}`, responsible: sel.sellerName(state, project.seller) })
  }

  return (
    <div>
      <div className="spread mb-[18px] flex-wrap gap-3">
        <div className="sec-title m-0"><h2>Órdenes de compra</h2><span className="sub">Control de OC y pagos a proveedores</span></div>
        <div className="flex gap-2.5 items-center">
          <Seg value={view} onChange={setView} options={[{ value: 'oc', label: 'Órdenes de compra' }, { value: 'sinasignar', label: `Sin asignar (${sinAsignar.length})` }]} />
          <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nueva OC</button>
        </div>
      </div>

      {view === 'sinasignar' ? (
        /* ---- Proyectos sin proveedor asignado ---- */
        sinAsignar.length === 0 ? <Empty icon="check">Todos los proyectos activos ya tienen proveedor asignado</Empty> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
            {sinAsignar.map(p => (
              <div key={p.id} className="card p-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="mono text-acc font-semibold text-[12px]">{p.code}</div>
                    <div className="font-semibold text-[13.5px] mt-0.5 font-display">{sel.clientName(state, p.client)}</div>
                  </div>
                  <StageBadge stage={p.stage} size="sm" />
                </div>
                <div className="meta mt-2">{p.sistemaVendido || '—'} · {p.city}</div>
                <div className="meta mt-0.5">Vendedor: {sel.sellerName(state, p.seller)}</div>
                <button className="btn btn-primary btn-sm w-full justify-center mt-3" onClick={() => setAssignProj(p)}><Icon name="handshake" size={14} /> Asignar proveedor</button>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {/* KPIs estilo Dashboard del Excel */}
          <div className="grid grid-cols-5 gap-3.5 mb-4">
            <KPI label="Total OC" value={totalOC} format={fmtMoney} icon="orders" accent />
            <KPI label="Total pagado" value={totalPaid} format={fmtMoney} icon="money" />
            <KPI label="Saldo pendiente" value={saldo} format={fmtMoney} icon="alert" footTrend="dn" foot={saldo > 0 ? 'Por pagar' : 'Al corriente'} />
            <KPI label="OC vencidas" value={vencidas} icon="alert" foot={vencidas ? 'Requieren atención' : 'Ninguna'} />
            <KPI label="Pagos próx. 7 días" value={prox7} icon="calendar" foot="OC con vencimiento" />
          </div>

          <div className="grid grid-cols-[1fr_1.5fr] gap-4 mb-4">
            <div className="card">
              <div className="card-h"><Icon name="commissions" size={17} className="text-acc" /><span className="ttl">OC por estatus</span></div>
              <div className="card-b flex flex-col gap-2.5">
                {statusCounts.map(({ s, n }) => (
                  <div key={s} className="flex items-center gap-3 cursor-pointer" onClick={() => setFStatus(fStatus === s ? '' : s)}>
                    <span className="text-[12px] w-[78px] flex-none" style={{ color: STATUS_COLOR[s] }}>{s}</span>
                    <div className="flex-1 h-[18px] bg-bg-1 border border-line rounded-[4px] overflow-hidden">
                      <div className="h-full" style={{ width: `${(n / maxCount) * 100}%`, background: STATUS_COLOR[s], opacity: 0.85, minWidth: n ? 3 : 0 }}></div>
                    </div>
                    <span className="mono text-[13px] font-semibold w-5 text-right" style={{ color: n ? 'var(--tx-0)' : 'var(--tx-3)' }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-h"><Icon name="trendUp" size={17} className="text-st-5" /><span className="ttl">Pagos por mes</span></div>
              <div className="card-b"><MonthlyChart state={state} /></div>
            </div>
          </div>

          <div className="flex gap-2 mb-3.5 items-center flex-wrap">
            <span className="label-k">Filtrar:</span>
            <div className="seg">
              <button className={!fStatus ? 'on' : ''} onClick={() => setFStatus('')}>Todas</button>
              {OC_STATES.map(s => <button key={s} className={fStatus === s ? 'on' : ''} onClick={() => setFStatus(s)}>{s}</button>)}
            </div>
            <Select value={fSupplier} onChange={e => setFSupplier(e.target.value)} className="w-auto min-w-[180px]">
              <option value="">Todos los proveedores</option>
              {supplierOpts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            {(fStatus || fSupplier) && <button className="btn btn-ghost btn-sm" onClick={() => { setFStatus(''); setFSupplier('') }}><Icon name="close" size={13} /> Limpiar</button>}
            <span className="meta">{list.length} de {state.orders.length}</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  <th>OC</th><th>Fecha</th><th>Proveedor</th><th>Descripción</th><th>Condiciones</th>
                  <th className="num">Monto</th><th className="num">Pagado</th><th className="num">Saldo</th><th className="num">%</th>
                  <th>Próx. pago</th><th className="num">Días</th><th>Estatus</th><th>Responsable</th>
                </tr></thead>
                <tbody>
                  {list.map(o => {
                    const supplier = sel.supplier(state, o.supplierId)
                    const paid = sel.ocPaid(state, o.id)
                    const balance = sel.ocBalance(state, o)
                    const pct = sel.ocPct(state, o)
                    const next = sel.ocNextPayment(state, o.id)
                    const days = next ? daysBetween(next) : null
                    return (
                      <tr key={o.id} onClick={() => setDetail(o)}>
                        <td><span className="mono text-acc font-semibold">{o.number}</span></td>
                        <td className="num text-tx-2 text-[12px]">{fmtDateShort(o.date)}</td>
                        <td className="text-[12.5px]">{supplier ? supplier.name : '—'}</td>
                        <td className="text-tx-1 text-[12px] max-w-[200px] truncate">{ocDesc(state, o)}</td>
                        <td className="text-tx-2 text-[11.5px] max-w-[170px] truncate">{o.conditions}</td>
                        <td className="num">{fmtMoney(o.amount)}</td>
                        <td className="num text-ok">{fmtMoney(paid)}</td>
                        <td className="num" style={{ color: balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(balance)}</td>
                        <td className="num text-tx-2 text-[12px]">{(pct * 100).toFixed(0)}%</td>
                        <td className="num text-tx-1 text-[12px]">{next ? fmtDateShort(next) : '—'}</td>
                        <td className="num text-[12px]" style={{ color: days == null ? 'var(--tx-3)' : days < 0 ? 'var(--danger)' : days < 7 ? 'var(--warn)' : 'var(--tx-2)' }}>{days == null ? '—' : days < 0 ? `${-days}d` : days + 'd'}</td>
                        <td><OCStatus status={sel.ocStatus(state, o)} /></td>
                        <td className="text-tx-2 text-[12px]">{o.responsible}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {list.length === 0 && <Empty icon="orders">Sin órdenes de compra</Empty>}
          </div>
        </>
      )}

      {detail && <OrderDetail order={detail} onClose={() => setDetail(null)} onEdit={() => { setForm(state.orders.find(x => x.id === detail.id) || detail); setDetail(null) }} />}
      {form && <OrderForm order={form} onClose={() => setForm(null)} />}
      {assignProj && <AssignSupplier project={assignProj} onClose={() => setAssignProj(null)} onCreateOC={(sid) => openOcForProject(assignProj, sid)} />}
    </div>
  )
}
