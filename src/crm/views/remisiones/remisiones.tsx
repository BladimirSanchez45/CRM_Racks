// ============================================================
//  REMISIONES DE SALIDA — documento de salida del material del
//  proyecto hacia el destino. Folio, transportista, destino,
//  partidas de material, estatus y PDF firmado.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtDateShort, fmtDate, TODAY_ISO, nextFolio, uid } from '../../core/data'
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

/* ---- Generar PDF de la remisión (vista de impresión del navegador) ---- */
function printRemision(state: AppState, r: Remision) {
  const proj = state.projects.find(p => p.id === r.projectId)
  const client = proj ? sel.client(state, proj.client) : undefined
  const carrier = r.carrierId ? sel.supplier(state, r.carrierId) : undefined
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const w = window.open('', '_blank', 'width=820,height=1000')
  if (!w) { alert('Permite las ventanas emergentes para generar el PDF.'); return }
  // Filas: las partidas + filas vacías hasta completar al menos 12 (como el formato impreso).
  const minRows = 12
  const blanks = Math.max(0, minRows - r.items.length)
  const rows =
    r.items.map(it => `<tr><td class="c">${esc(it.code)}</td><td>${esc(it.description)}</td><td class="c">${esc(it.qty)}</td></tr>`).join('') +
    Array.from({ length: blanks }, () => '<tr><td>&nbsp;</td><td></td><td></td></tr>').join('')
  const clienteNombre = r.receivedBy || (client ? client.name : '')
  const envioNota = r.notes ? esc(r.notes) : ''
  // Logo servido desde public/ (URL absoluta para que cargue en la ventana de impresión).
  // Si el archivo no existe, cae al texto de marca.
  const logoUrl = window.location.origin + '/ccracks_logo.png'
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Remisión ${esc(r.number)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1b2230;padding:30px;font-size:12.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
    .brand img{height:120px;display:block}
    .brand-txt{font-size:30px;font-weight:800;color:#173a8a;letter-spacing:1px}
    .brand-txt small{display:block;font-size:10px;color:#c0392b;font-weight:700;letter-spacing:.5px}
    .ttl{font-size:30px;font-weight:800;color:#173a8a;font-style:italic}
    table.meta{font-size:12px}
    table.meta td{padding:1px 8px 1px 0}
    .bar{background:#c0392b;color:#fff;font-weight:700;text-align:center;padding:4px;letter-spacing:.5px;margin:10px 0 6px}
    table.blk{width:100%;border-collapse:collapse;font-size:12px}
    table.blk td{padding:2px 6px;vertical-align:top}
    table.blk td.k{font-weight:700;font-style:italic;width:90px}
    table.blk td.v{font-style:italic;color:#173a8a}
    .items-wrap{position:relative;margin-top:8px}
    .watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0}
    .watermark img{width:62%;opacity:.10}
    table.items{width:100%;border-collapse:collapse;position:relative;z-index:1}
    table.items th{background:#173a8a;color:#fff;padding:6px;font-size:12px;font-style:italic}
    table.items td{border:1px solid #d8dde4;padding:5px 8px;height:20px;background:transparent}
    table.items td.c{text-align:center}
    .sign{display:flex;justify-content:space-around;margin-top:60px;text-align:center;font-size:11px;font-weight:700;font-style:italic}
    .sign div{border-top:2px solid #173a8a;padding-top:6px;width:230px}
    .sign2{display:flex;justify-content:center;margin-top:36px;text-align:center;font-size:11px;font-weight:700;font-style:italic}
    .sign2 div{border-top:2px solid #173a8a;padding-top:6px;width:230px}
    .foot{margin-top:40px;text-align:center;color:#666;font-size:11px;font-weight:700}
    @media print{.noprint{display:none}}
  </style></head><body>
    <div class="head">
      <div class="brand">
        <img src="${logoUrl}" alt="CC Racks" onerror="this.style.display='none';document.getElementById('brandtxt').style.display='block'" />
        <span id="brandtxt" class="brand-txt" style="display:none">CC<small>RACKS MÉXICO S.A. DE C.V.</small></span>
      </div>
      <div class="ttl">REMISION</div>
      <table class="meta"><tr><td><b>FECHA:</b></td><td>${esc(fmtDate(r.date))}</td></tr><tr><td><b>FOLIO:</b></td><td><b>${esc(r.number)}</b></td></tr></table>
    </div>

    <div class="bar">ORIGEN</div>
    <table class="blk"><tr>
      <td class="k">Razon social:</td><td class="v">${esc(ORIGEN.razonSocial)}</td><td class="k" style="text-align:right">Telefono:</td><td>${esc(ORIGEN.telefono)}</td>
    </tr><tr><td class="k">Calle:</td><td class="v">${esc(ORIGEN.calle)}</td></tr>
    <tr><td class="k">Colonia:</td><td class="v">${esc(ORIGEN.colonia)}</td></tr>
    <tr><td class="k">C.P:</td><td class="v">${esc(ORIGEN.cp)}</td></tr></table>

    <div class="bar">DESTINO</div>
    <table class="blk"><tr>
      <td class="k">Cliente:</td><td class="v">${esc(clienteNombre)}</td><td class="k" style="text-align:right">Telefono:</td><td>${esc(client ? client.phone : '')}</td>
    </tr><tr><td class="k">Domicilio:</td><td class="v" colspan="3">${esc(r.destination)}</td></tr>
    <tr><td class="k">C.P:</td><td class="v" colspan="3">${esc(client ? client.cp : '')}</td></tr>
    ${carrier ? `<tr><td class="k">Transporte:</td><td class="v" colspan="3">${esc(carrier.name)}</td></tr>` : ''}
    ${envioNota ? `<tr><td class="k">Nota de envío:</td><td class="v" colspan="3" style="font-weight:700">${envioNota}</td></tr>` : ''}</table>

    <div class="items-wrap">
      <div class="watermark"><img src="${logoUrl}" alt="" onerror="this.style.display='none'" /></div>
      <table class="items"><thead><tr><th style="width:90px">CODIGO</th><th>DESCRIPCION</th><th style="width:90px">CANTIDAD</th></tr></thead><tbody>${rows}</tbody></table>
    </div>

    <div class="sign"><div>AUTORIZO SALIDA MATERIAL</div><div>RECIBIO</div></div>
    <div class="sign2"><div>AUTORIZO FABRICACION</div></div>
    <div class="foot">Con la firma de este documento doy por hecha la entrega,<br>asi como tambien el buen estado del material entregado.</div>
    <button class="noprint" onclick="window.print()" style="margin-top:24px;padding:10px 22px;background:#173a8a;color:#fff;border:0;border-radius:8px;cursor:pointer">Imprimir / Guardar PDF</button>
  </body></html>`)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* el usuario puede usar el botón */ } }, 400)
}

const STATUSES: RemisionStatus[] = ['Borrador', 'Emitida', 'Entregada', 'Cancelada']
const STATUS_COLOR: Record<RemisionStatus, string> = {
  Borrador: 'var(--tx-2)', Emitida: 'var(--st-5)', Entregada: 'var(--ok)', Cancelada: 'var(--tx-3)',
}
const statusBadge = (s: RemisionStatus) => <Badge color={STATUS_COLOR[s]}>{s}</Badge>

const FLETE_CAT = 'Fletes y transporte'

type FormState = {
  id?: string
  number: string
  projectId: string
  date: string
  carrierId: string
  destination: string
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
    ...remision, carrierId: remision.carrierId ?? '', receivedBy: remision.receivedBy ?? '',
  } : {
    number: nextFolio(state.remisiones, 'REM'), projectId: '', date: TODAY_ISO, carrierId: '',
    destination: '', receivedBy: '', items: [], status: 'Borrador', notes: '', file: '',
  })
  const set = (k: keyof FormState, v: unknown) => setR(s => ({ ...s, [k]: v }))
  const { requestClose, guard } = useUnsavedGuard(r, onClose)

  // Al elegir proyecto, precarga el destino (ciudad) si está vacío.
  const onPickProject = (pid: string) => {
    const proj = state.projects.find(p => p.id === pid)
    setR(s => ({ ...s, projectId: pid, destination: s.destination || (proj?.city ?? '') }))
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

  const save = () => {
    const payload: RemisionInput = {
      ...r,
      carrierId: r.carrierId || undefined,
      receivedBy: r.receivedBy || undefined,
      items: r.items.map(it => ({ ...it, qty: +it.qty || 0 })),
    }
    dispatch({ type: 'SAVE_REMISION', remision: payload })
    onClose()
  }

  return (
    <Modal width={680} icon={remision ? 'edit' : 'plus'} title={remision ? 'Editar remisión' : 'Nueva remisión de salida'} sub={r.number} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        {remision && <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DELETE_REMISION', id: remision.id }); onClose() }}><Icon name="trash" size={14} /> Eliminar</button>}
        <button className={'btn btn-ghost' + (!valid ? ' opacity-50' : '')} disabled={!valid}
          onClick={() => printRemision(state, {
            ...r, carrierId: r.carrierId || undefined, receivedBy: r.receivedBy || undefined,
            items: r.items.map(it => ({ ...it, qty: +it.qty || 0 })),
            createdBy: remision?.createdBy ?? '', createdAt: remision?.createdAt ?? '',
          } as Remision)}>
          <Icon name="download" size={14} /> Generar PDF
        </button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
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
        <Field label="Recibe (en destino)"><Input value={r.receivedBy} onChange={e => set('receivedBy', e.target.value)} placeholder="Nombre de quien recibe" /></Field>
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
