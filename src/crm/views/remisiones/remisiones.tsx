// ============================================================
//  REMISIONES DE SALIDA — documento de salida del material del
//  proyecto hacia el destino. Folio, transportista, destino,
//  partidas de material, estatus y PDF firmado.
// ============================================================
import * as React from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useStore, sel, fmtDateShort, fmtDate, TODAY_ISO, nextFolio, uid } from '../../core/data'
import { uploadDoc } from '../../core/api'
import { Modal, Field, Input, TextArea, Select, FileField, Badge, Empty, KPI, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import { importMaterialsFromExcel } from '../../core/excel'
import type { AppState, Remision, RemisionInput, RemisionItem, RemisionStatus } from '../../core/types'

/* ---- Datos de ORIGEN (empresa) para el PDF de la remisión ---- */
const ORIGEN = {
  razonSocial: 'CC RACKS MEXICO',
  calle: 'Francisco Villa #250',
  colonia: 'Victor Hugo',
  cp: '45190',
  telefono: '33 2170 9829',
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

/* ---- Construye el PDF (vector) de la remisión y lo devuelve como Blob ----
   Replica el formato impreso: encabezado con logo, bloques ORIGEN/DESTINO,
   tabla de material con marca de agua, y firmas. */
export async function buildRemisionPdf(state: AppState, r: Remision): Promise<Blob> {
  const proj = state.projects.find(p => p.id === r.projectId)
  const client = proj ? sel.client(state, proj.client) : undefined
  const carrier = r.carrierId ? sel.supplier(state, r.carrierId) : undefined
  const logo = await loadImage(window.location.origin + '/ccracks_logo.png')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  const BLUE: [number, number, number] = [23, 58, 138]
  const RED: [number, number, number] = [192, 57, 43]

  // ---- Encabezado ----
  let y = M
  if (logo) {
    const h = 20, w = h * (logo.naturalWidth / logo.naturalHeight)
    doc.addImage(logo, 'PNG', M, y, w, h)
  }
  doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(...BLUE); doc.setFontSize(26)
  doc.text('REMISION', W / 2, y + 13, { align: 'center' })
  doc.setFontSize(10); doc.setTextColor(30)
  doc.setFont('helvetica', 'bold'); doc.text('FECHA:', W - M - 48, y + 6)
  doc.setFont('helvetica', 'normal'); doc.text(fmtDate(r.date), W - M - 30, y + 6)
  doc.setFont('helvetica', 'bold'); doc.text('FOLIO:', W - M - 48, y + 12)
  doc.text(r.number, W - M - 30, y + 12)
  y += 26

  // ---- Helpers de bloque ----
  const bar = (label: string) => {
    doc.setFillColor(...RED); doc.rect(M, y, W - 2 * M, 6, 'F')
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(label, W / 2, y + 4.2, { align: 'center' })
    y += 9
  }
  const row = (k: string, v: string, k2?: string, v2?: string) => {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30); doc.text(k, M, y)
    doc.setFont('helvetica', 'italic'); doc.setTextColor(...BLUE); doc.text(v || '', M + 30, y)
    if (k2) {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(30); doc.text(k2, W - M - 55, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30); doc.text(v2 || '', W - M - 35, y)
    }
    y += 5.5
  }

  bar('ORIGEN')
  // El teléfono solo se muestra una vez, en DESTINO (es el del cliente).
  row('Razon social:', ORIGEN.razonSocial)
  row('Calle:', ORIGEN.calle)
  row('Colonia:', ORIGEN.colonia)
  row('C.P:', ORIGEN.cp)
  y += 2

  bar('DESTINO')
  // Teléfono = exactamente el que está en el campo "Teléfono" del modal (precargado del
  // cliente al elegir proyecto si lo tiene; vacío si no, para capturarlo a mano).
  row('Cliente:', r.receivedBy || (client ? client.name : ''), 'Telefono:', r.phone || '')
  row('Domicilio:', r.destination)
  row('C.P:', client ? (client.cp || '') : '')
  if (carrier) row('Transporte:', carrier.name)
  if (r.notes) row('Nota de envio:', r.notes)
  y += 2

  // ---- Marca de agua (logo tenue) detrás de la tabla ----
  const tableStart = y
  if (logo) {
    try {
      const GS = (doc as unknown as { GState?: new (o: object) => unknown }).GState
      if (GS) (doc as unknown as { setGState: (g: unknown) => void }).setGState(new GS({ opacity: 0.08 }))
      const ww = 120, wh = ww * (logo.naturalHeight / logo.naturalWidth)
      doc.addImage(logo, 'PNG', (W - ww) / 2, tableStart + 28, ww, wh)
      if (GS) (doc as unknown as { setGState: (g: unknown) => void }).setGState(new GS({ opacity: 1 }))
    } catch { /* sin marca de agua si el motor no soporta opacidad */ }
  }

  // ---- Tabla de material (mín. 12 filas como el formato) ----
  const body: string[][] = r.items.map(it => [it.code || '', it.description || '', String(it.qty ?? '')])
  while (body.length < 12) body.push(['', '', ''])
  autoTable(doc, {
    startY: tableStart,
    head: [['CODIGO', 'DESCRIPCION', 'CANTIDAD']],
    body,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8, lineColor: [216, 221, 228], textColor: 30, fillColor: false as unknown as undefined },
    headStyles: { fillColor: BLUE, textColor: 255, halign: 'center', fontStyle: 'bolditalic' },
    columnStyles: { 0: { halign: 'center', cellWidth: 28 }, 2: { halign: 'center', cellWidth: 28 } },
    margin: { left: M, right: M },
  })

  // ---- Firmas + pie ----
  let fy = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 22
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.5)
  const sigW = 60
  const leftX = M + 14, rightX = W - M - 14 - sigW
  doc.line(leftX, fy, leftX + sigW, fy); doc.line(rightX, fy, rightX + sigW, fy)
  doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(8.5); doc.setTextColor(...BLUE)
  doc.text('AUTORIZO SALIDA MATERIAL', leftX + sigW / 2, fy + 4, { align: 'center' })
  doc.text('RECIBIO', rightX + sigW / 2, fy + 4, { align: 'center' })
  fy += 18
  const cX = (W - sigW) / 2
  doc.line(cX, fy, cX + sigW, fy)
  doc.text('AUTORIZO FABRICACION', cX + sigW / 2, fy + 4, { align: 'center' })
  fy += 16
  doc.setFont('helvetica', 'bold'); doc.setTextColor(120); doc.setFontSize(8)
  doc.text('Con la firma de este documento doy por hecha la entrega,', W / 2, fy, { align: 'center' })
  doc.text('asi como tambien el buen estado del material entregado.', W / 2, fy + 4, { align: 'center' })

  return doc.output('blob')
}

/* ---- Genera el PDF y lo abre en una pestaña para ver/imprimir (no lo sube). ---- */
export async function printRemision(state: AppState, r: Remision) {
  const blob = await buildRemisionPdf(state, r)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

const STATUSES: RemisionStatus[] = ['Borrador', 'Emitida', 'Entregada', 'Cancelada']
const STATUS_COLOR: Record<RemisionStatus, string> = {
  Borrador: 'var(--tx-2)', Emitida: 'var(--st-5)', Entregada: 'var(--ok)', Cancelada: 'var(--tx-3)',
}
export const remisionStatusBadge = (s: RemisionStatus) => <Badge color={STATUS_COLOR[s]}>{s}</Badge>
const statusBadge = remisionStatusBadge

const FLETE_CAT = 'Fletes y transporte'

type FormState = {
  id?: string
  number: string
  projectId: string
  date: string
  carrierId: string
  destination: string
  phone: string
  receivedBy: string
  items: RemisionItem[]
  status: RemisionStatus
  notes: string
  file: string
  filePath?: string
}

/* ---- Formulario de remisión ---- */
function RemisionForm({ remision, onClose }: { remision?: Remision; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [r, setR] = React.useState<FormState>(() => remision ? {
    ...remision, carrierId: remision.carrierId ?? '', phone: remision.phone ?? '', receivedBy: remision.receivedBy ?? '',
  } : {
    // id estable desde el inicio: así "Generar PDF" y "Guardar" usan el mismo registro (upsert), sin duplicar.
    id: uid('rm'), number: nextFolio(state.remisiones, 'REM'), projectId: '', date: TODAY_ISO, carrierId: '',
    destination: '', phone: '', receivedBy: '', items: [], status: 'Borrador', notes: '', file: '',
  })
  const set = (k: keyof FormState, v: unknown) => setR(s => ({ ...s, [k]: v }))
  const { requestClose, guard } = useUnsavedGuard(r, onClose)

  // Al elegir proyecto, precarga destino (ciudad) y teléfono del cliente si están vacíos.
  const onPickProject = (pid: string) => {
    const proj = state.projects.find(p => p.id === pid)
    const cli = proj ? sel.client(state, proj.client) : undefined
    setR(s => ({ ...s, projectId: pid, destination: s.destination || (proj?.city ?? ''), phone: s.phone || (cli?.phone ?? '') }))
  }

  const addItem = () => setR(s => ({ ...s, items: [...s.items, { id: uid('ri'), code: '', description: '', qty: 1, unit: 'pza' }] }))
  const setItem = (id: string, k: keyof RemisionItem, v: unknown) =>
    setR(s => ({ ...s, items: s.items.map(it => it.id === id ? { ...it, [k]: v } : it) }))
  const delItem = (id: string) => setR(s => ({ ...s, items: s.items.filter(it => it.id !== id) }))

  // Importa material del MISMO Excel del cotizador que la OC (hoja "Cotizador Selectivo").
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [importing, setImporting] = React.useState(false)
  const [importErr, setImportErr] = React.useState('')
  const onImport = async (file: File) => {
    setImporting(true); setImportErr('')
    try {
      const ocItems = await importMaterialsFromExcel(file)
      const nuevos: RemisionItem[] = ocItems.map(it => ({
        id: uid('ri'),
        code: it.parte || '',
        description: [it.material, it.description, it.dimensiones].filter(Boolean).join(' ').trim(),
        qty: it.qty,
        unit: 'pza',
      }))
      setR(s => ({ ...s, items: [...s.items, ...nuevos] }))
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : 'No se pudo leer el Excel.')
    } finally { setImporting(false) }
  }

  const carriers = state.suppliers.filter(s => s.active && (s.cat === FLETE_CAT))
  const carrierList = carriers.length ? carriers : state.suppliers.filter(s => s.active)
  const valid = r.projectId && r.number && r.date
  const docFolder = `remisiones/${r.number || 'nuevas'}`

  const payload = (): RemisionInput => ({
    ...r,
    carrierId: r.carrierId || undefined,
    receivedBy: r.receivedBy || undefined,
    items: r.items.map(it => ({ ...it, qty: +it.qty || 0 })),
  })
  const [generating, setGenerating] = React.useState(false)
  // Genera el PDF real de la remisión, lo SUBE como "Remisión firmada", guarda la remisión
  // con ese archivo y lo coloca en el documento "Remisión de salida" del proyecto asociado.
  // Devuelve el blob y los datos del archivo para previsualizar/registrar.
  const buildStoreRemision = async () => {
    const rem = { ...payload(), createdBy: remision?.createdBy ?? '', createdAt: remision?.createdAt ?? '' } as Remision
    const blob = await buildRemisionPdf(state, rem)
    const fileName = `Remision_${r.number}.pdf`
    const path = await uploadDoc(new File([blob], fileName, { type: 'application/pdf' }), `remisiones/${r.number || 'nuevas'}`)
    dispatch({ type: 'SAVE_REMISION', remision: { ...payload(), file: fileName, filePath: path } })
    const proj = state.projects.find(p => p.id === r.projectId)
    if (proj) {
      dispatch({
        type: 'SAVE_PROJECT',
        project: { ...proj, remision: r.number, docs: { ...proj.docs, remision: { name: fileName, ok: true, path } } },
      })
    }
    return { blob, fileName, path }
  }
  // Guardar: SIEMPRE (re)genera el PDF y lo guarda en la remisión y en el proyecto, de modo
  // que al crear o editar quede siempre actualizado.
  const save = async () => {
    setGenerating(true)
    try {
      await buildStoreRemision()
      onClose()
    } catch (e) {
      // Si el PDF falla, guarda al menos los datos para no perder el trabajo.
      dispatch({ type: 'SAVE_REMISION', remision: payload() })
      alert('Se guardó la remisión, pero no se pudo generar el PDF: ' + (e instanceof Error ? e.message : 'error desconocido'))
      onClose()
    } finally {
      setGenerating(false)
    }
  }
  // Generar PDF: igual que guardar, pero deja el modal abierto y abre el PDF en una pestaña.
  const genPdf = async () => {
    setGenerating(true)
    try {
      const { blob, fileName, path } = await buildStoreRemision()
      setR(s => ({ ...s, file: fileName, filePath: path }))
      window.open(URL.createObjectURL(blob), '_blank')
    } catch (e) {
      alert('No se pudo generar/guardar el PDF: ' + (e instanceof Error ? e.message : 'error desconocido'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal width={680} icon={remision ? 'edit' : 'plus'} title={remision ? 'Editar remisión' : 'Nueva remisión de salida'} sub={r.number} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        {remision && <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DELETE_REMISION', id: remision.id }); onClose() }}><Icon name="trash" size={14} /> Eliminar</button>}
        <button className={'btn btn-ghost' + (!valid || generating ? ' opacity-50' : '')} disabled={!valid || generating} onClick={genPdf} title="Genera el PDF, lo guarda en la remisión del proyecto y lo abre">
          <Icon name="download" size={14} /> {generating ? 'Generando…' : 'Generar PDF'}
        </button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid || generating ? ' opacity-50' : '')} disabled={!valid || generating} onClick={save}><Icon name="check" size={15} /> {generating ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div className="grid grid-cols-3 gap-3.5">
        <Field label="Folio"><Input className="input mono" value={r.number} onChange={e => set('number', e.target.value)} /></Field>
        <Field label="Fecha de salida"><Input type="date" value={r.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Estatus">
          <Select value={r.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Proyecto" span={2}>
          <Select value={r.projectId} onChange={e => onPickProject(e.target.value)}>
            <option value="">Selecciona…</option>
            {state.projects.map(p => <option key={p.id} value={p.id}>{p.code} · {sel.clientName(state, p.client)}</option>)}
          </Select>
        </Field>
        <Field label="Transportista / flete">
          <Select value={r.carrierId} onChange={e => set('carrierId', e.target.value)}>
            <option value="">Sin asignar…</option>
            {carrierList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Destino" span={2}><Input value={r.destination} onChange={e => set('destination', e.target.value)} placeholder="Domicilio / ciudad de entrega" /></Field>
        <Field label="Teléfono"><Input value={r.phone} onChange={e => set('phone', e.target.value)} placeholder="Tel. de contacto en destino" /></Field>
        <Field label="Recibe (en destino)" span={2}><Input value={r.receivedBy} onChange={e => set('receivedBy', e.target.value)} placeholder="Nombre de quien recibe" /></Field>
      </div>

      {/* partidas de material */}
      <div className="mt-4">
        <div className="spread mb-2">
          <span className="label-k">Material que sale ({r.items.length})</span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={importing} onClick={() => fileRef.current?.click()}><Icon name="doc" size={13} /> {importing ? 'Importando…' : 'Importar de Excel'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}><Icon name="plus" size={13} /> Agregar partida</button>
          </div>
        </div>
        {importErr && <div className="text-[11.5px] mb-2" style={{ color: 'var(--danger)' }}>{importErr}</div>}
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = '' }} />
        {r.items.length === 0 ? <div className="meta">Sin partidas. Importa del Excel del cotizador o agrégalas a mano.</div> : (
          <div className="border border-line rounded-[8px] overflow-hidden">
            <table className="tbl">
              <thead><tr><th className="w-[90px]">Código</th><th>Descripción</th><th className="num w-[90px]">Cantidad</th><th className="w-[80px]">Unidad</th><th className="w-[40px]"></th></tr></thead>
              <tbody>
                {r.items.map(it => (
                  <tr key={it.id} style={{ cursor: 'default' }}>
                    <td><Input value={it.code ?? ''} onChange={e => setItem(it.id, 'code', e.target.value)} placeholder="Código" /></td>
                    <td><Input value={it.description} onChange={e => setItem(it.id, 'description', e.target.value)} placeholder="Material…" /></td>
                    <td><Input type="number" value={it.qty} onChange={e => setItem(it.id, 'qty', e.target.value)} /></td>
                    <td><Input value={it.unit ?? ''} onChange={e => setItem(it.id, 'unit', e.target.value)} placeholder="pza" /></td>
                    <td><button className="icon-btn w-7 h-7" title="Quitar" onClick={() => delItem(it.id)}><Icon name="trash" size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3.5">
        <Field label="Notas" span={2}><TextArea value={r.notes} onChange={e => set('notes', e.target.value)} placeholder="Observaciones de la salida…" /></Field>
        <div className="col-span-2">
          <FileField label="Remisión firmada (PDF / imagen)" value={r.file} path={r.filePath} folder={docFolder}
            onChange={v => setR(s => ({ ...s, file: v.name, filePath: v.path || undefined }))} accept=".pdf,.jpg,.png,.xlsx" />
        </div>
      </div>
      {guard}
    </Modal>
  )
}

export function RemisionesPage() {
  const { state } = useStore()
  const [form, setForm] = React.useState<Remision | {} | null>(null)
  const [fStatus, setFStatus] = React.useState('')

  const rows = state.remisiones
    .filter(r => !fStatus || r.status === fStatus)
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const emitidas = state.remisiones.filter(r => r.status === 'Emitida').length
  const entregadas = state.remisiones.filter(r => r.status === 'Entregada').length

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Remisiones de salida</h2><span className="sub">Salida de material a destino</span></div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nueva remisión</button>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <KPI label="Remisiones" value={state.remisiones.length} icon="truck" accent />
        <KPI label="Emitidas (en tránsito)" value={emitidas} icon="truck" />
        <KPI label="Entregadas" value={entregadas} icon="check" />
      </div>

      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        <span className="label-k">Filtrar:</span>
        <div className="seg">
          <button className={!fStatus ? 'on' : ''} onClick={() => setFStatus('')}>Todas</button>
          {STATUSES.map(s => <button key={s} className={fStatus === s ? 'on' : ''} onClick={() => setFStatus(s)}>{s}</button>)}
        </div>
        <span className="meta">{rows.length} de {state.remisiones.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Folio</th><th>Proyecto</th><th>Fecha</th><th>Destino</th><th>Transportista</th><th className="num">Partidas</th><th>Estatus</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const proj = state.projects.find(p => p.id === r.projectId)
                const carrier = r.carrierId ? sel.supplier(state, r.carrierId) : undefined
                return (
                <tr key={r.id} onClick={() => setForm(r)}>
                  <td><span className="mono text-acc font-semibold">{r.number}</span></td>
                  <td className="text-[12px]">{proj ? <><span className="mono text-tx-1">{proj.code}</span><div className="meta">{sel.clientName(state, proj.client)}</div></> : <span className="text-tx-3">—</span>}</td>
                  <td className="num text-tx-1 text-[12px]">{fmtDateShort(r.date)}</td>
                  <td className="text-[12px]">{r.destination || '—'}</td>
                  <td className="text-[12px]">{carrier ? carrier.name : <span className="text-tx-3">—</span>}</td>
                  <td className="num mono text-[12px]">{r.items.length}</td>
                  <td>{statusBadge(r.status)}</td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="truck">Sin remisiones registradas</Empty>}
      </div>

      {form && <RemisionForm remision={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
    </div>
  )
}
