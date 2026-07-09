// ============================================================
//  ÓRDENES DE COMPRA — Control OC + abonos + materiales/PDF
//  Flujo: 1) se crea el proyecto → 2) aparece en "Proyectos sin
//  asignar" y se asigna proveedor → 3) se crea la OC (PDF).
// ============================================================
import * as React from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, fmtDateShort, daysBetween, MESES, uid, TODAY_ISO } from '../../core/data'
import { uploadDoc } from '../../core/api'
import { Modal, Field, Input, Select, FileField, MoneyInput, MoneyCellInput, OCStatus, PaymentBadge, StageBadge, Empty, KPI, Seg, DocChip, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import { CobroForm } from '../projects/project_views'
import { importMaterialsFromExcel } from '../../core/excel'
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

/* ---- Folio de OC por proveedor: cada proveedor lleva SU propia secuencia con SU
   propio formato, tal como lo numeran ellos (p.ej. José Zavala usa "JZ-2238" y
   Metálicos Guzmán "MG-00178"). El siguiente folio CONTINÚA la última OC de ese
   proveedor conservando su prefijo y su cantidad de dígitos (ceros a la izquierda).
   Si el proveedor aún no tiene OC, se sugiere "<PREFIJO>-" (prefijo del catálogo)
   para que el usuario escriba el consecutivo inicial. El campo es EDITABLE: siempre
   se puede corregir o escribir el siguiente a mano. */
const supplierPrefix = (s?: { prefijo?: string; name?: string; notes?: string }) => {
  // Prefijo: campo "prefijo" del catálogo; si no, el de las notas ("Prefijo de factura: JZ"); si no, del nombre.
  const fromNotes = /prefijo de factura:\s*([A-Za-z0-9]+)/i.exec(s?.notes || '')?.[1]
  return ((s?.prefijo || fromNotes || s?.name || 'OC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)) || 'OC'
}
/** Descompone un folio en prefijo + número final + ancho, para conservar el formato. */
const parseFolio = (folio: string) => {
  const m = /^(.*?)(\d+)\s*$/.exec((folio || '').trim())
  return m ? { prefix: m[1], n: +m[2], width: m[2].length } : null
}
const nextOcNumber = (state: AppState, supplierId: string) => {
  // Toma la OC del proveedor con el número final más alto y le suma 1, conservando
  // su prefijo y su ancho (JZ-2238 → JZ-2239, MG-00178 → MG-00179).
  let best: { prefix: string; n: number; width: number } | null = null
  for (const o of state.orders) {
    if (o.supplierId !== supplierId) continue
    const p = parseFolio(o.number || '')
    if (p && (!best || p.n > best.n)) best = p
  }
  if (best) return `${best.prefix}${String(best.n + 1).padStart(best.width, '0')}`
  // Sin OC previa: prefijo del catálogo + guion; el usuario completa el número.
  return `${supplierPrefix(sel.supplier(state, supplierId))}-`
}

/* ---- Carga una imagen (logo) para incrustarla en el PDF; null si no existe ---- */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/* ---- Construye el PDF (vector) de la orden de compra y lo devuelve como Blob ----
   Mismo estilo que la remisión: logo, barras, marca de agua y tabla con totales. */
export async function buildOcPdf(state: AppState, o: Order, items: OcItem[]): Promise<Blob> {
  const supplier = sel.supplier(state, o.supplierId)
  const project = o.projectId ? state.projects.find(p => p.id === o.projectId) : undefined
  const { subtotal, iva, total } = itemsTotals(items)
  const money = (n: number) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const logo = await loadImage(window.location.origin + '/ccracks_logo.png')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  const BLUE: [number, number, number] = [23, 58, 138]
  const RED: [number, number, number] = [192, 57, 43]

  // ---- Encabezado ----
  let y = M
  if (logo) {
    const h = 30, w = h * (logo.naturalWidth / logo.naturalHeight)
    doc.addImage(logo, 'PNG', M, y, w, h)
  }
  doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(...BLUE); doc.setFontSize(21)
  doc.text('ORDEN DE COMPRA', W / 2, y + 17, { align: 'center' })
  doc.setFontSize(10); doc.setTextColor(30)
  doc.setFont('helvetica', 'bold'); doc.text('FECHA:', W - M - 50, y + 11)
  doc.setFont('helvetica', 'normal'); doc.text(fmtDate(o.date), W - M - 32, y + 11)
  doc.setFont('helvetica', 'bold'); doc.text('No. OC:', W - M - 50, y + 17)
  doc.text(o.number, W - M - 32, y + 17)
  y += 36

  const bar = (label: string) => {
    doc.setFillColor(...RED); doc.rect(M, y, W - 2 * M, 6, 'F')
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(label, W / 2, y + 4.2, { align: 'center' })
    y += 9
  }
  const row = (k: string, v: string, k2?: string, v2?: string) => {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30); doc.text(k, M, y)
    doc.setFont('helvetica', 'italic'); doc.setTextColor(...BLUE); doc.text(v || '', M + 32, y)
    if (k2) {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(30); doc.text(k2, W - M - 60, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30); doc.text(v2 || '', W - M - 40, y)
    }
    y += 5.5
  }

  bar('PROVEEDOR')
  row('Proveedor:', supplier ? supplier.name : '—', 'Telefono:', supplier ? supplier.phone : '')
  if (supplier && supplier.direccion) row('Direccion:', supplier.direccion)
  row('Condiciones:', o.conditions || '—')
  row('Responsable:', o.responsible || '—')
  y += 2

  bar('DATOS DE LA ORDEN')
  // En la OC al proveedor NO se muestra el cliente: solo el código de proyecto.
  row('Proyecto:', project ? project.code : '—')
  // Oculta la descripción autollenada (que es "código · cliente"); muestra solo descripciones reales.
  const autoDesc = project ? `${project.code} · ${sel.clientName(state, project.client)}` : ''
  if (o.description && o.description !== autoDesc) row('Descripcion:', o.description)
  row('Fecha entrega:', o.deliveryDate ? fmtDate(o.deliveryDate) : '—')
  y += 2

  // ---- Marca de agua tenue detrás de la tabla ----
  const tableStart = y
  if (logo) {
    try {
      const GS = (doc as unknown as { GState?: new (o: object) => unknown }).GState
      const setGS = (doc as unknown as { setGState: (g: unknown) => void }).setGState
      if (GS) setGS(new GS({ opacity: 0.07 }))
      const ww = 120, wh = ww * (logo.naturalHeight / logo.naturalWidth)
      doc.addImage(logo, 'PNG', (W - ww) / 2, tableStart + 26, ww, wh)
      if (GS) setGS(new GS({ opacity: 1 }))
    } catch { /* sin marca de agua si no hay soporte de opacidad */ }
  }

  // ---- Tabla de materiales ----
  const body: string[][] = items.length
    ? items.map((it, i) => [String(i + 1), it.parte || '', it.color || '', String(it.qty ?? ''), it.material || '', it.description || '', it.dimensiones || '', money(it.unitPrice), money((it.qty || 0) * (it.unitPrice || 0))])
    : [['', '', '', '', '— Sin materiales capturados —', '', '', '', '']]
  autoTable(doc, {
    startY: tableStart,
    head: [['#', 'Parte', 'Color', 'Cant', 'Material', 'Descripcion', 'Dimensiones', 'P.Unit', 'Importe']],
    body,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [216, 221, 228], textColor: 30, fillColor: false as unknown as undefined, overflow: 'linebreak' },
    headStyles: { fillColor: BLUE, textColor: 255, halign: 'center', fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 7 }, 3: { halign: 'center', cellWidth: 11 },
      7: { halign: 'right', cellWidth: 20 }, 8: { halign: 'right', cellWidth: 22 },
    },
    margin: { left: M, right: M },
  })

  // ---- Totales (caja inferior derecha) ----
  let fy = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 7
  const boxX = W - M - 70
  doc.setFontSize(9.5); doc.setTextColor(30)
  const totRow = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, boxX, fy); doc.text(val, W - M, fy, { align: 'right' })
    fy += 5.5
  }
  totRow('Subtotal', money(subtotal))
  totRow('IVA 16%', money(iva))
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.4); doc.line(boxX, fy - 3.5, W - M, fy - 3.5)
  doc.setFontSize(11); totRow('TOTAL', money(total), true)

  // ---- Firmas ----
  fy += 16
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.5)
  const sigW = 60
  doc.line(M + 14, fy, M + 14 + sigW, fy); doc.line(W - M - 14 - sigW, fy, W - M - 14, fy)
  doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(8.5); doc.setTextColor(...BLUE)
  doc.text('AUTORIZA', M + 14 + sigW / 2, fy + 4, { align: 'center' })
  doc.text('PROVEEDOR', W - M - 14 - sigW / 2, fy + 4, { align: 'center' })

  return doc.output('blob')
}

/* ---- Genera el PDF de la OC y lo abre en una pestaña (no lo sube). ---- */
export async function printOC(state: AppState, o: Order, items: OcItem[]) {
  const blob = await buildOcPdf(state, o, items)
  window.open(URL.createObjectURL(blob), '_blank')
}

/* ============================================================
   Formulario de abono
   ============================================================ */
type AbonoFormState = { id?: string; orderId: string; n: number | string; date: string; amount: number | string; method: string; status: PaymentStatus; comments: string }
function AbonoForm({ order, payment, onClose }: { order: Order; payment?: Payment; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const nextN = Math.max(0, ...sel.paymentsForOrder(state, order.id).map(p => p.n)) + 1
  const [a, setA] = React.useState<AbonoFormState>(() => payment ? { ...payment } : {
    orderId: order.id, n: nextN, date: TODAY_ISO, amount: '', method: '', status: 'Programado', comments: '',
  })
  const set = (k: keyof AbonoFormState, v: unknown) => setA(s => ({ ...s, [k]: v }))
  const valid = a.date && a.amount
  const { requestClose, guard } = useUnsavedGuard(a, onClose)
  const save = () => { dispatch({ type: 'SAVE_PAYMENT', payment: { ...a, n: +a.n || 1, amount: +a.amount || 0 } as PaymentInput }); onClose() }
  const total = order.amount
  const pagadoAntes = state.payments.filter(x => x.orderId === order.id && x.status === 'Pagado' && x.id !== a.id).reduce((acc, x) => acc + x.amount, 0)
  const pagado = pagadoAntes + (a.status === 'Pagado' ? (+a.amount || 0) : 0)
  const saldoRestante = total - pagado
  return (
    <Modal width={480} icon={payment ? 'edit' : 'plus'} title={payment ? 'Editar abono' : 'Nuevo abono'} sub={order.number} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar abono</button>
      </>}>
      <div className="bg-bg-1 border border-line rounded-[8px] p-3 mb-3.5 grid grid-cols-3 gap-2 text-center">
        <div><div className="label-k">Monto OC</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtMoney(total)}</div></div>
        <div><div className="label-k">Pagado</div><div className="font-display font-bold text-[15px] mt-0.5 text-ok">{fmtMoney(pagado)}</div></div>
        <div><div className="label-k">Saldo restante</div><div className="font-display font-bold text-[15px] mt-0.5" style={{ color: saldoRestante > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(saldoRestante)}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="No. Abono"><Input type="number" value={a.n} onChange={e => set('n', e.target.value)} /></Field>
        <Field label="Fecha de pago"><Input type="date" value={a.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Importe (MXN)"><MoneyInput value={a.amount} onChange={v => set('amount', v)} /></Field>
        <Field label="Estado"><Select value={a.status} onChange={e => set('status', e.target.value)}>{PAY_STATES.map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Método / Ref." span={2}><Input value={a.method} onChange={e => set('method', e.target.value)} placeholder="Transferencia, cheque, folio…" /></Field>
        <Field label="Comentarios" span={2}><Input value={a.comments} onChange={e => set('comments', e.target.value)} /></Field>
      </div>
      {guard}
    </Modal>
  )
}

/* ============================================================
   Detalle de OC
   ============================================================ */
export function OrderDetail({ order, onClose, onEdit }: { order: Order; onClose: () => void; onEdit: () => void }) {
  const { state, dispatch } = useStore()
  const role = state.currentUser?.role
  const readOnly = role === 'ventas' || role === 'logistica' || role === 'direccion'   // solo lectura
  const o = state.orders.find(x => x.id === order.id) || order
  const supplier = sel.supplier(state, o.supplierId)
  const project = o.projectId ? state.projects.find(p => p.id === o.projectId) : undefined
  const abonos = sel.paymentsForOrder(state, o.id)
  const paid = sel.ocPaid(state, o.id)
  const balance = sel.ocBalance(state, o)
  const pct = sel.ocPct(state, o)
  const next = sel.ocNextPayment(state, o.id)
  const days = next ? daysBetween(next) : null
  const eta = o.deliveryDate ? daysBetween(o.deliveryDate) : null
  const items = o.items || []
  const [abono, setAbono] = React.useState<Payment | {} | null>(null)

  return (
    <Modal width={780} onClose={onClose}
      title={<span className="flex items-center gap-3">{o.number} <OCStatus status={sel.ocStatus(state, o)} /></span>}
      sub={`${supplier ? supplier.name : '—'} · ${ocDesc(state, o)}`}
      footer={<>
        {!readOnly && <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Editar OC</button>}
        <button className="btn btn-ghost" onClick={() => printOC(state, o, items)}><Icon name="download" size={14} /> PDF</button>
        {!readOnly && <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DELETE_ORDER', id: o.id }); onClose() }}><Icon name="trash" size={14} /></button>}
        <div className="flex-1"></div>
        {!readOnly && <button className="btn btn-primary" onClick={() => setAbono({})}><Icon name="plus" size={15} /> Agregar abono</button>}
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
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Entrega estimada</span><span>{o.deliveryDate ? <>{fmtDate(o.deliveryDate)} {eta != null && <span className="mono text-[11px]" style={{ color: eta <= 3 ? 'var(--danger)' : eta <= 10 ? 'var(--warn)' : 'var(--ok)' }}>({eta < 0 ? `${-eta}d vencido` : eta + 'd'})</span>}</> : '—'}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Proyecto</span><span>{project ? `${project.code} · ${sel.clientName(state, project.client)}` : '—'}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Condiciones</span><span className="text-right">{o.conditions}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Responsable</span><span>{o.responsible || '—'}</span></div>
        <div className="flex justify-between border-b border-line-soft py-[7px]"><span className="label-k">Próximo pago</span><span>{next ? <>{fmtDate(next)} {days != null && <span className="mono text-[11px]" style={{ color: days < 0 ? 'var(--danger)' : days < 7 ? 'var(--warn)' : 'var(--tx-2)' }}>({days < 0 ? `${-days}d vencido` : days + 'd'})</span>}</> : '—'}</span></div>
        <div className="flex justify-between items-center border-b border-line-soft py-[7px]"><span className="label-k">OC firmada</span><span>{o.filePath ? <DocChip doc={{ name: o.file || 'OC firmada', ok: true, path: o.filePath }} label="OC firmada" /> : (o.file || '—')}</span></div>
      </div>

      {items.length > 0 && (
        <div className="mb-5">
          <div className="label-k mb-2">Materiales ({items.length})</div>
          <div className="border border-line rounded-[8px] overflow-hidden">
            <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>Parte</th><th>Color</th><th className="num">Cant.</th><th>Material</th><th>Descripción</th><th>Dimensiones</th>
                <th className="num">C. unit.</th><th className="num">Importe</th>
              </tr></thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} style={{ cursor: 'default' }}>
                    <td className="text-[12px]">{it.parte || '—'}</td>
                    <td className="text-[12px]">{it.color || '—'}</td>
                    <td className="num">{it.qty}</td>
                    <td className="text-[12px]">{it.material || '—'}</td>
                    <td className="text-[12.5px]">{it.description || '—'}</td>
                    <td className="text-[12px]">{it.dimensiones || '—'}</td>
                    <td className="num">{fmtMoney2(it.unitPrice)}</td>
                    <td className="num">{fmtMoney2((it.qty || 0) * (it.unitPrice || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      <div className="label-k mb-2">Abonos ({abonos.length})</div>
      {abonos.length === 0 ? <Empty icon="money">Sin abonos registrados</Empty> : (
        <div className="border border-line rounded-[8px] overflow-hidden">
          <table className="tbl">
            <thead><tr><th>#</th><th>Fecha</th><th className="num">Importe</th><th className="num">Acum.</th><th>Método / Ref.</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {abonos.map(p => {
                const acum = abonos.filter(x => x.status !== 'Cancelado' && x.n <= p.n).reduce((a, x) => a + x.amount, 0)
                return (
                <tr key={p.id} style={{ cursor: 'default' }}>
                  <td className="mono">{p.n}</td>
                  <td className="num text-tx-1 text-[12px]">{fmtDateShort(p.date)}</td>
                  <td className="num">{fmtMoney2(p.amount)}</td>
                  <td className="num text-[12px]">{fmtMoney(acum)}<div className="meta">de {fmtMoney(o.amount)}</div></td>
                  <td className="text-tx-1 text-[12px]">{p.method || '—'}{p.comments ? <div className="meta mt-px">{p.comments}</div> : null}</td>
                  <td><PaymentBadge status={p.status} /></td>
                  <td>{!readOnly && <div className="flex gap-1 justify-end">
                    <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setAbono(p)}><Icon name="edit" size={13} /></button>
                    <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => dispatch({ type: 'DELETE_PAYMENT', id: p.id })}><Icon name="trash" size={13} /></button>
                  </div>}</td>
                </tr>
              ) })}
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
const CELL = 'bg-bg-2 border border-line-2 rounded-[6px] px-1.5 py-1 text-[11.5px] outline-none focus:border-acc'

type OcFormState = {
  id?: string; number: string; date: string; supplierId: string; projectId?: string
  description: string; conditions: string; amount: number | string; responsible: string
  file: string; filePath?: string; deliveryDate?: string; items: OcItem[]; cancelled?: boolean
}
export function OrderForm({ order, onClose }: { order?: Partial<Order>; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const editing = !!order?.id
  const [o, setO] = React.useState<OcFormState>(() => ({
    // id estable: "Generar PDF" y "Guardar OC" upsertan el mismo registro (sin duplicar).
    id: order?.id || uid('oc'),
    // Folio por proveedor: si ya viene proveedor (flujo desde proyecto) se calcula su
    // siguiente consecutivo; si no, queda vacío y se autollenará al elegir proveedor.
    number: order?.number || (order?.supplierId ? nextOcNumber(state, order.supplierId) : ''),
    date: order?.date || TODAY_ISO,
    supplierId: order?.supplierId || '',
    projectId: order?.projectId,
    description: order?.description || '',
    conditions: order?.conditions || '',
    amount: order?.amount ?? '',
    responsible: order?.responsible || 'Administración',
    file: order?.file || '',
    filePath: order?.filePath || '',
    deliveryDate: order?.deliveryDate || '',
    items: order?.items ? JSON.parse(JSON.stringify(order.items)) : [],
    cancelled: order?.cancelled || false,
  }))
  const set = (k: keyof OcFormState, v: unknown) => setO(s => ({ ...s, [k]: v }))
  const onPickProject = (pid: string) => {
    const p = state.projects.find(x => x.id === pid)
    setO(s => {
      const supplierId = s.supplierId || (p && p.suppliers[0]) || ''
      return {
        ...s, projectId: pid || undefined,
        description: p ? `${p.code} · ${sel.clientName(state, p.client)}` : s.description,
        responsible: p ? sel.sellerName(state, p.seller) : s.responsible,
        supplierId,
        // OC nueva sin folio aún → asigna el consecutivo del proveedor recién fijado.
        number: !editing && !s.number && supplierId ? nextOcNumber(state, supplierId) : s.number,
        // Hereda la entrega estimada del proyecto (su eta) como fecha de entrega de la OC.
        deliveryDate: p?.eta || s.deliveryDate,
      }
    })
  }
  // Al elegir/cambiar proveedor en una OC NUEVA, el folio se regenera con la
  // secuencia propia de ese proveedor. Al editar, el folio existente no se toca.
  const onPickSupplier = (sid: string) => setO(s => ({
    ...s, supplierId: sid,
    number: editing ? s.number : (sid ? nextOcNumber(state, sid) : s.number),
  }))
  const addItem = () => setO(s => ({ ...s, items: [...s.items, { id: uid('it'), description: '', qty: 1, unitPrice: 0 }] }))
  const updItem = (i: number, k: keyof OcItem, v: unknown) => setO(s => ({ ...s, items: s.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }))
  const delItem = (i: number) => setO(s => ({ ...s, items: s.items.filter((_, idx) => idx !== i) }))
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [importing, setImporting] = React.useState(false)
  const [importErr, setImportErr] = React.useState('')
  const onImport = async (file: File) => {
    setImporting(true); setImportErr('')
    try {
      const nuevos = await importMaterialsFromExcel(file)
      setO(s => ({ ...s, items: [...s.items, ...nuevos] }))
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : 'No se pudo leer el Excel.')
    } finally { setImporting(false) }
  }

  const { subtotal, iva, total } = itemsTotals(o.items)
  const hasItems = o.items.length > 0
  // ---- Candado de anticipo: si la OC está ligada a un proyecto, exige que el
  //      cliente ya tenga el anticipo COBRADO antes de emitir la OC al proveedor.
  //      Solo se aplica al CREAR (al editar una OC existente ya no estorba).
  const project = o.projectId ? state.projects.find(p => p.id === o.projectId) : undefined
  const hasAnticipo = o.projectId ? sel.projectHasAnticipo(state, o.projectId) : true
  const needsAnticipo = !editing && !!o.projectId && !hasAnticipo
  const [showCobro, setShowCobro] = React.useState(false)
  const { requestClose, guard } = useUnsavedGuard(o, onClose)
  // Folio repetido para el MISMO proveedor (ignora la propia OC al editar).
  const dupFolio = !!o.number && state.orders.some(x => x.id !== o.id && x.supplierId === o.supplierId && (x.number || '').trim().toLowerCase() === o.number.trim().toLowerCase())
  const valid = o.number && o.supplierId && (hasItems ? total > 0 : !!o.amount) && !needsAnticipo
  const [generating, setGenerating] = React.useState(false)
  // Genera el PDF real de la OC, lo SUBE como "OC firmada", guarda la OC con ese
  // archivo y lo coloca en el documento "Orden de compra" del proyecto asociado.
  // Devuelve el blob y los datos del archivo para previsualizar/registrar.
  const buildStoreOc = async () => {
    const ord = { ...o, amount: hasItems ? total : (+o.amount || 0), items: o.items.length ? o.items : undefined } as Order
    const blob = await buildOcPdf(state, ord, o.items)
    const fileName = `OC_${o.number}.pdf`
    const path = await uploadDoc(new File([blob], fileName, { type: 'application/pdf' }), `orders/${o.number || order?.id || 'nuevas'}`)
    dispatch({ type: 'SAVE_ORDER', order: { ...ord, file: fileName, filePath: path } })
    const proj = o.projectId ? state.projects.find(p => p.id === o.projectId) : undefined
    if (proj) {
      // El proyecto guarda VARIAS órdenes de compra (una por OC). Se hace upsert por
      // nombre de archivo (OC_<folio>.pdf): si esta OC ya estaba, se actualiza su espacio;
      // si no, se agrega al siguiente. Así no se sobrescriben entre proveedores.
      const lista = proj.docs.ordenCompra || []
      const idx = lista.findIndex(d => d.name === fileName)
      const nuevaLista = idx >= 0
        ? lista.map((d, i) => i === idx ? { name: fileName, ok: true, path } : d)
        : [...lista, { name: fileName, ok: true, path }]
      dispatch({ type: 'SAVE_PROJECT', project: { ...proj, docs: { ...proj.docs, ordenCompra: nuevaLista } } })
    }
    return { blob, fileName, path }
  }
  // Guardar OC: SIEMPRE (re)genera el PDF y lo guarda en la OC y en el proyecto, de
  // modo que al crear o editar la orden el documento quede siempre actualizado.
  const save = async () => {
    if (needsAnticipo) return
    setGenerating(true)
    try {
      await buildStoreOc()
      onClose()
    } catch (e) {
      // Si el PDF falla, guarda al menos los datos para no perder el trabajo.
      const ord: OrderInput = { ...o, amount: hasItems ? total : (+o.amount || 0), items: o.items.length ? o.items : undefined }
      dispatch({ type: 'SAVE_ORDER', order: ord })
      alert('Se guardó la OC, pero no se pudo generar el PDF: ' + (e instanceof Error ? e.message : 'error desconocido'))
      onClose()
    } finally {
      setGenerating(false)
    }
  }
  // Generar PDF: igual que guardar, pero deja el modal abierto y abre el PDF en una
  // pestaña para revisarlo/imprimirlo.
  const genPdf = async () => {
    if (!o.supplierId || needsAnticipo) return
    setGenerating(true)
    try {
      const { blob, fileName, path } = await buildStoreOc()
      setO(s => ({ ...s, file: fileName, filePath: path }))
      window.open(URL.createObjectURL(blob), '_blank')
    } catch (e) {
      alert('No se pudo generar/guardar el PDF: ' + (e instanceof Error ? e.message : 'error desconocido'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal width={900} icon={editing ? 'edit' : 'plus'} title={editing ? 'Editar orden de compra' : 'Nueva orden de compra'} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <button className="btn btn-ghost" disabled={!o.supplierId || needsAnticipo || generating} onClick={genPdf} title="Genera el PDF, lo guarda en la OC y en el documento del proyecto"><Icon name="download" size={14} /> {generating ? 'Generando…' : 'Generar PDF'}</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid || generating ? ' opacity-50' : '')} disabled={!valid || generating} onClick={save}><Icon name="check" size={15} /> {generating ? 'Guardando…' : 'Guardar OC'}</button>
      </>}>
      {needsAnticipo && (
        <div className="flex items-start gap-3 mb-4 p-3 rounded-[8px] border" style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
          <Icon name="alert" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--warn)' }} />
          <div className="flex-1">
            <div className="font-semibold text-[13px]" style={{ color: 'var(--warn)' }}>Falta el anticipo del cliente</div>
            <div className="text-[12px] text-tx-2 mt-0.5">
              No puedes emitir esta OC al proveedor hasta registrar el <strong>cobro del anticipo</strong> de{' '}
              {project ? <span className="mono">{project.code} · {sel.clientName(state, project.client)}</span> : 'el proyecto'}.
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-sm flex-none" onClick={() => setShowCobro(true)}><Icon name="plus" size={13} /> Registrar anticipo</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Folio EDITABLE por proveedor: se autosugiere el siguiente (continúa la
            secuencia del proveedor: JZ-2239, MG-00179…) pero se puede escribir a mano. */}
        <Field label="No. de OC">
          <Input className="input mono" value={o.number} onChange={e => set('number', e.target.value)} placeholder="Se sugiere al elegir proveedor (ej. JZ-2239)" />
          {dupFolio && <div className="text-[11px] mt-1" style={{ color: 'var(--warn)' }}>Ya existe una OC con este folio para este proveedor.</div>}
        </Field>
        <Field label="Fecha OC"><Input type="date" value={o.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Proyecto asociado" span={2}>
          <Select value={o.projectId || ''} onChange={e => onPickProject(e.target.value)}>
            <option value="">Sin proyecto</option>
            {state.projects.map(p => <option key={p.id} value={p.id}>{p.code} · {sel.clientName(state, p.client)}</option>)}
          </Select>
        </Field>
        <Field label="Proveedor" span={2}>
          <Select value={o.supplierId} onChange={e => onPickSupplier(e.target.value)}>
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
        <Field label="Fecha estimada de entrega"><Input type="date" value={o.deliveryDate || ''} onChange={e => set('deliveryDate', e.target.value)} /></Field>
      </div>

      {/* materiales */}
      <div className="mt-4">
        <div className="spread mb-2">
          <span className="label-k">Materiales (lista del vendedor)</span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={importing} onClick={() => fileRef.current?.click()}><Icon name="doc" size={13} /> {importing ? 'Importando…' : 'Importar de Excel'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}><Icon name="plus" size={13} /> Agregar material</button>
          </div>
        </div>
        {importErr && <div className="text-[11.5px] mb-2" style={{ color: 'var(--danger)' }}>{importErr}</div>}
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = '' }} />
        {!hasItems ? (
          <div className="bg-bg-1 border border-line rounded-[8px] p-3 text-center text-tx-3 text-[12px]">Sin materiales. Agrega partidas (calcula subtotal, IVA y total) o captura el monto manualmente.</div>
        ) : (
          <div className="border border-line rounded-[8px] overflow-hidden">
            <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>Parte</th><th>Color</th><th className="num">Cant.</th><th>Material</th><th>Descripción</th><th>Dimensiones</th>
                <th className="num">C. unit.</th><th className="num">Importe</th><th>Proveedor</th><th></th>
              </tr></thead>
              <tbody>
                {o.items.map((it, i) => (
                  <tr key={it.id} style={{ cursor: 'default' }}>
                    <td><input className={CELL + ' w-[44px]'} value={it.parte || ''} onChange={e => updItem(i, 'parte', e.target.value)} /></td>
                    <td><input className={CELL + ' w-[72px]'} value={it.color || ''} onChange={e => updItem(i, 'color', e.target.value)} /></td>
                    <td className="num"><input type="number" className={CELL + ' w-[56px] text-right'} value={it.qty || ''} placeholder="0" onChange={e => updItem(i, 'qty', +e.target.value || 0)} /></td>
                    <td><input className={CELL + ' w-[110px]'} value={it.material || ''} onChange={e => updItem(i, 'material', e.target.value)} placeholder="Material" /></td>
                    <td><input className={CELL + ' w-[150px]'} value={it.description} onChange={e => updItem(i, 'description', e.target.value)} placeholder="Descripción" /></td>
                    <td><input className={CELL + ' w-[110px]'} value={it.dimensiones || ''} onChange={e => updItem(i, 'dimensiones', e.target.value)} placeholder="Dimensiones" /></td>
                    <td className="num"><MoneyCellInput className={CELL + ' w-[92px] text-right'} value={it.unitPrice || ''} placeholder="$0" onChange={v => updItem(i, 'unitPrice', v)} /></td>
                    {/* Importe = cantidad × costo unitario (SOLO LECTURA): siempre exacto, sin división ni decimales raros. */}
                    <td className="num"><div className={CELL + ' w-[92px] text-right opacity-70 cursor-default'} title="Cantidad × costo unitario">{(it.qty || 0) * (it.unitPrice || 0) ? fmtMoney2((it.qty || 0) * (it.unitPrice || 0)) : '—'}</div></td>
                    <td><select className="bg-bg-2 border border-line-2 rounded-[6px] px-1 py-1 text-[11px] outline-none focus:border-acc max-w-[110px]" value={it.supplierId || ''} onChange={e => updItem(i, 'supplierId', e.target.value || undefined)}>
                      <option value="">(de la OC)</option>
                      {state.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></td>
                    <td><button type="button" className="icon-btn w-7 h-7" onClick={() => delItem(i)}><Icon name="trash" size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="flex justify-end gap-6 p-3 bg-bg-1 border-t border-line text-[13px]">
              <div className="text-right"><div className="label-k">Subtotal</div><div className="mono mt-0.5">{fmtMoney2(subtotal)}</div></div>
              <div className="text-right"><div className="label-k">IVA 16%</div><div className="mono mt-0.5">{fmtMoney2(iva)}</div></div>
              <div className="text-right"><div className="label-k">Total</div><div className="mono mt-0.5 font-bold text-[15px]">{fmtMoney2(total)}</div></div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3.5 items-end">
        <Field label="Archivo adjunto (OC firmada)"><FileField label="" value={o.file} path={o.filePath} folder={`orders/${o.number || order?.id || 'nuevas'}`} onChange={v => setO(s => ({ ...s, file: v.name, filePath: v.path }))} accept=".pdf,.jpg,.png" /></Field>
        <Field label="Estado">
          <button type="button" className="btn h-[38px] justify-center w-full" onClick={() => set('cancelled', !o.cancelled)} style={{ color: o.cancelled ? 'var(--danger)' : 'var(--tx-2)' }}>
            {o.cancelled ? 'Cancelada' : 'Activa'}
          </button>
        </Field>
      </div>

      {showCobro && project && <CobroForm project={project} onClose={() => setShowCobro(false)} />}
      {guard}
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
  const me = state.currentUser
  const isVentas = me?.role === 'ventas'
  // Solo lectura: ventas, logística y dirección no pueden crear/editar OC (ven TODAS).
  const readOnly = isVentas || me?.role === 'logistica' || me?.role === 'direccion'
  const [view, setView] = React.useState('oc')
  const [detail, setDetail] = React.useState<Order | null>(null)
  const [form, setForm] = React.useState<Partial<Order> | null>(null)
  const [assignProj, setAssignProj] = React.useState<Project | null>(null)
  const [fStatus, setFStatus] = React.useState('')
  const [fSupplier, setFSupplier] = React.useState('')
  // Orden de la tabla: sin orden (dir 0) respeta el orden original; al hacer clic
  // en una columna numérica se ordena descendente (mayor→menor) y luego ascendente.
  const [sort, setSort] = React.useState<{ key: string; dir: number }>({ key: '', dir: 0 })

  const ocStatusOf = (o: Order) => sel.ocStatus(state, o)
  // Ventas solo ve las OC asociadas a SUS proyectos (donde es el vendedor).
  const orders = isVentas
    ? state.orders.filter(o => { const proj = state.projects.find(p => p.id === o.projectId); return !!proj && proj.seller === me!.id })
    : state.orders
  const sortVal = (o: Order): number => {
    switch (sort.key) {
      case 'amount': return o.amount
      case 'paid': return sel.ocPaid(state, o.id)
      case 'balance': return sel.ocBalance(state, o)
      case 'pct': return sel.ocPct(state, o)
      default: return 0
    }
  }
  const list = orders
    .filter(o => (!fStatus || ocStatusOf(o) === fStatus) && (!fSupplier || o.supplierId === fSupplier))
    .sort((a, b) => sort.dir === 0 ? 0 : (sortVal(a) - sortVal(b)) * sort.dir)
  // Clic en encabezado numérico: 1er clic = descendente (mayor→menor), 2º = ascendente, 3º = sin orden.
  const toggleSort = (key: string) => setSort(s =>
    s.key !== key ? { key, dir: -1 } : s.dir === -1 ? { key, dir: 1 } : { key: '', dir: 0 })
  const sortableTh = (key: string, label: string) => (
    <th className="num sortable" onClick={() => toggleSort(key)} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}{sort.key === key && <span className="text-acc"> {sort.dir < 0 ? '▼' : '▲'}</span>}
    </th>
  )
  const supplierOpts = state.suppliers.filter(s => orders.some(o => o.supplierId === s.id))
  const sinAsignar = readOnly ? [] : state.projects.filter(p => p.suppliers.length === 0 && p.stage !== 'finalizado')

  // KPIs — respetan el filtro de proveedor (NO el de estatus, para no colapsar la
  // gráfica de estatus ni el conteo de vencidas). Así, al filtrar por un proveedor
  // (p.ej. Metálicos Guzmán), el "Saldo pendiente" es el adeudo total de ESE proveedor.
  const kpiBase = fSupplier ? orders.filter(o => o.supplierId === fSupplier) : orders
  const supplierName = fSupplier ? (sel.supplier(state, fSupplier)?.name || '') : ''
  const totalOC = kpiBase.reduce((a, o) => a + o.amount, 0)
  const totalPaid = kpiBase.reduce((a, o) => a + sel.ocPaid(state, o.id), 0)
  const saldo = totalOC - totalPaid
  const vencidas = kpiBase.filter(o => ocStatusOf(o) === 'Vencida').length
  const prox7 = kpiBase.filter(o => {
    const n = sel.ocNextPayment(state, o.id); if (!n) return false
    const d = daysBetween(n); return d != null && d >= 0 && d <= 7 && sel.ocBalance(state, o) > 0
  }).length
  const statusCounts = OC_STATES.map(s => ({ s, n: kpiBase.filter(o => ocStatusOf(o) === s).length }))
  const maxCount = Math.max(1, ...statusCounts.map(c => c.n))

  const openOcForProject = (project: Project, sid: string) => {
    setAssignProj(null)
    setForm({ projectId: project.id, supplierId: sid, description: `${project.code} · ${sel.clientName(state, project.client)}`, responsible: sel.sellerName(state, project.seller), deliveryDate: project.eta })
  }

  return (
    <div>
      <div className="spread mb-[18px] flex-wrap gap-3">
        <div className="sec-title m-0"><h2>Órdenes de compra</h2><span className="sub">Control de OC y pagos a proveedores</span></div>
        <div className="flex gap-2.5 items-center">
          {!readOnly && <Seg value={view} onChange={setView} options={[{ value: 'oc', label: 'Órdenes de compra' }, { value: 'sinasignar', label: `Sin asignar (${sinAsignar.length})` }]} />}
          {!readOnly && <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nueva OC</button>}
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
            <KPI label={supplierName ? `Total OC · ${supplierName}` : 'Total OC'} value={totalOC} format={fmtMoney} icon="orders" accent foot={supplierName ? `${kpiBase.length} OC` : undefined} />
            <KPI label="Total pagado" value={totalPaid} format={fmtMoney} icon="money" />
            <KPI label={supplierName ? `Adeudo · ${supplierName}` : 'Saldo pendiente'} value={saldo} format={fmtMoney} icon="alert" footTrend="dn" foot={saldo > 0 ? 'Por pagar' : 'Al corriente'} />
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
            {(fStatus || fSupplier || sort.dir !== 0) && <button className="btn btn-ghost btn-sm" onClick={() => { setFStatus(''); setFSupplier(''); setSort({ key: '', dir: 0 }) }}><Icon name="close" size={13} /> Limpiar</button>}
            <span className="meta">{list.length} de {orders.length}</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  <th>OC</th><th>Fecha</th><th>Proveedor</th><th>Descripción</th><th>Condiciones</th>
                  {sortableTh('amount', 'Monto')}{sortableTh('paid', 'Pagado')}{sortableTh('balance', 'Saldo')}{sortableTh('pct', '%')}
                  <th>Entrega est.</th><th className="num">Días</th><th>Estatus</th><th>Responsable</th>
                </tr></thead>
                <tbody>
                  {list.map(o => {
                    const supplier = sel.supplier(state, o.supplierId)
                    const paid = sel.ocPaid(state, o.id)
                    const balance = sel.ocBalance(state, o)
                    const pct = sel.ocPct(state, o)
                    const eta = o.deliveryDate ? daysBetween(o.deliveryDate) : null
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
                        <td className="num text-tx-1 text-[12px]">{o.deliveryDate ? fmtDateShort(o.deliveryDate) : '—'}</td>
                        <td className="num text-[12px]" style={{ color: eta == null ? 'var(--tx-3)' : eta <= 3 ? 'var(--danger)' : eta <= 10 ? 'var(--warn)' : 'var(--ok)' }}>{eta == null ? '—' : eta < 0 ? `${-eta}d` : eta + 'd'}</td>
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
