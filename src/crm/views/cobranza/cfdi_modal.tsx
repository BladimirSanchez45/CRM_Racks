// ============================================================
//  FACTURACIÓN DE UN ABONO — facturas y complementos de pago (CFDI)
//   · Lista los documentos cargados al abono y su estado
//     (Sin factura / Falta complemento / Facturado).
//   · Al subir el XML se leen UUID, folio, fecha, total, PUE/PPD y receptor;
//     todo queda editable. El PDF se sube aparte.
//   · Avisa si el importe documentado no cuadra con el abono, si el RFC del
//     receptor no es el del cliente del proyecto, o si el UUID ya está en otro abono.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, fmtDateShort, isDireccion } from '../../core/data'
import { Modal, Badge, Empty, Select, Field, Input, MoneyInput, FileField, DocChip, Confirm, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import { uploadDoc, deleteDoc } from '../../core/api'
import { parseCfdiXml, cfdiEstado, cfdiDescuadre, cfdiFolio, CFDI_ESTADO_COLOR } from '../../core/cfdi'
import type { BankTransaction, CfdiDoc, CfdiDocInput, CfdiKind } from '../../core/types'

const KIND_LABEL: Record<CfdiKind, string> = { factura: 'Factura', complemento: 'Complemento de pago' }
const KIND_COLOR: Record<CfdiKind, string> = { factura: 'var(--acc)', complemento: 'var(--ok)' }

type FormState = Omit<CfdiDocInput, 'bankTxId'>
const emptyForm = (kind: CfdiKind): FormState => ({
  kind, uuid: '', serie: '', folio: '', fecha: '', total: 0, metodoPago: kind === 'factura' ? 'PUE' : '',
  rfcReceptor: '', nombreReceptor: '', relatedUuid: '', notes: '',
})

/* ---- Campo XML: sube el archivo y, de paso, lo lee para llenar el formulario ---- */
function XmlField({ value, path, folder, validate, onFile, onClear }: {
  value?: string; path?: string; folder: string
  /** Devuelve un mensaje para RECHAZAR el XML antes de subirlo (p. ej. UUID repetido). */
  validate?: (parsed: ReturnType<typeof parseCfdiXml>) => string | null
  onFile: (name: string, path: string, text: string) => void
  onClear: () => void
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')
  const pick = async (file: File) => {
    setBusy(true); setErr('')
    try {
      const text = await file.text()
      const parsed = parseCfdiXml(text)   // valida ANTES de subir (si no es CFDI, no se sube nada)
      const reject = validate?.(parsed)
      if (reject) throw new Error(reject)
      const p = await uploadDoc(file, folder)
      onFile(file.name, p, text)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo leer el XML.')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }
  const clear = async () => { if (path) { try { await deleteDoc(path) } catch { /* best-effort */ } } onClear() }
  return (
    <div className="field">
      <label>XML del CFDI</label>
      <div className="flex gap-2">
        <div className={'doc-chip flex-1 min-w-0' + (value ? '' : ' doc-missing')} style={{ cursor: busy ? 'default' : 'pointer' }}
          onClick={() => { if (!busy) ref.current?.click() }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !busy) pick(f) }}
          title="Arrastra el XML aquí o haz clic para examinar">
          <Icon name={value && !busy ? 'doc' : 'clip'} size={14} />
          <span className="nm">{busy ? 'Leyendo…' : (value || 'Arrastra el XML o examina · llena los datos solo')}</span>
        </div>
        <button type="button" className="btn btn-sm btn-ghost shrink-0" disabled={busy} onClick={() => ref.current?.click()}>{value ? 'Cambiar' : 'Examinar'}</button>
        {value && <button type="button" className="btn btn-sm btn-ghost shrink-0" disabled={busy} onClick={clear}><Icon name="close" size={13} /></button>}
      </div>
      {err && <div className="text-[11.5px] mt-1" style={{ color: 'var(--danger)' }}>{err}</div>}
      <input ref={ref} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pick(f) }} />
    </div>
  )
}

/* ---- Formulario: alta / edición de un documento ---- */
function CfdiForm({ tx, doc, kind, onClose }: { tx: BankTransaction; doc?: CfdiDoc; kind: CfdiKind; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [f, setF] = React.useState<FormState>(() => doc ? { ...doc } : emptyForm(kind))
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(s => ({ ...s, [k]: v }))
  const { requestClose, guard } = useUnsavedGuard(f, onClose)
  const folder = `cfdi/${tx.id}`

  const proj = tx.projectId ? state.projects.find(p => p.id === tx.projectId) : undefined
  const cliente = proj ? sel.client(state, proj.client) : undefined
  const rfcMismatch = !!(f.rfcReceptor && cliente?.rfc && cliente.rfc.toUpperCase() !== f.rfcReceptor.toUpperCase())
  // CANDADO: un CFDI (UUID) solo puede existir una vez en todo el sistema.
  const uuidNorm = f.uuid.trim().toUpperCase()
  const uuidDup = uuidNorm ? state.cfdiDocs.find(d => d.uuid === uuidNorm && d.id !== doc?.id) : undefined
  const dupTx = uuidDup ? state.bankTxs.find(t => t.id === uuidDup.bankTxId) : undefined
  const dupProj = dupTx?.projectId ? state.projects.find(p => p.id === dupTx.projectId) : undefined
  const hasData = f.total > 0 || f.uuid.trim() || f.folio.trim() || f.pdfPath || f.xmlPath
  const valid = hasData && !uuidDup

  // CANDADO (antes de subir el XML): si ese UUID ya existe, se rechaza y no se sube nada.
  const validateXml = (p: ReturnType<typeof parseCfdiXml>): string | null => {
    if (!p.uuid) return null
    const dup = state.cfdiDocs.find(d => d.uuid === p.uuid && d.id !== doc?.id)
    if (!dup) return null
    const t = state.bankTxs.find(x => x.id === dup.bankTxId)
    const where = dup.bankTxId === tx.id ? 'en este mismo abono' : t ? `en el abono de ${fmtMoney2(t.amount)} del ${fmtDateShort(t.date)}` : 'en otro abono'
    return `Este CFDI ya está cargado ${where}. Un mismo documento no se puede cargar dos veces.${p.kind === 'factura' && dup.bankTxId !== tx.id ? ' Si es PPD y cubre este abono, carga aquí solo su complemento de pago.' : ''}`
  }
  const onXml = (name: string, path: string, text: string) => {
    const p = parseCfdiXml(text)
    setF(s => ({
      ...s, xml: name, xmlPath: path,
      kind: p.kind, uuid: p.uuid, serie: p.serie, folio: p.folio, fecha: p.fecha, total: p.total,
      metodoPago: p.kind === 'factura' ? p.metodoPago : '', rfcReceptor: p.rfcReceptor, nombreReceptor: p.nombreReceptor,
      relatedUuid: p.relatedUuid || s.relatedUuid,
    }))
  }
  const save = () => {
    if (!valid) return
    dispatch({ type: 'SAVE_CFDI_DOC', doc: { ...f, uuid: f.uuid.trim().toUpperCase(), relatedUuid: f.relatedUuid.trim().toUpperCase(), bankTxId: tx.id, id: doc?.id } })
    onClose()
  }

  return (
    <Modal width={560} icon={doc ? 'edit' : 'docPlus'} title={doc ? `Editar ${KIND_LABEL[f.kind].toLowerCase()}` : `Agregar ${KIND_LABEL[f.kind].toLowerCase()}`} sub={`Abono de ${fmtMoney2(tx.amount)} · ${fmtDate(tx.date)}`} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2"><XmlField value={f.xml} path={f.xmlPath} folder={folder} validate={validateXml} onFile={onXml} onClear={() => setF(s => ({ ...s, xml: undefined, xmlPath: undefined }))} /></div>
        <Field label="PDF" span={2}>
          <FileField label="" value={f.pdf || ''} path={f.pdfPath} folder={folder} accept=".pdf" onChange={v => setF(s => ({ ...s, pdf: v.name || undefined, pdfPath: v.path || undefined }))} />
        </Field>
        <Field label="Tipo">
          <Select value={f.kind} onChange={e => { const k = e.target.value as CfdiKind; setF(s => ({ ...s, kind: k, metodoPago: k === 'factura' ? (s.metodoPago || 'PUE') : '' })) }}>
            <option value="factura">Factura</option><option value="complemento">Complemento de pago</option>
          </Select>
        </Field>
        {f.kind === 'factura' ? (
          <Field label="Método de pago">
            <Select value={f.metodoPago} onChange={e => set('metodoPago', e.target.value)}>
              <option value="PUE">PUE · una sola exhibición</option>
              <option value="PPD">PPD · parcialidades (pide complemento)</option>
              <option value="">—</option>
            </Select>
          </Field>
        ) : (
          <Field label="UUID de la factura que paga"><Input value={f.relatedUuid} onChange={e => set('relatedUuid', e.target.value)} placeholder="Se llena desde el XML (opcional)" /></Field>
        )}
        <Field label="Serie"><Input value={f.serie} onChange={e => set('serie', e.target.value)} placeholder="A" /></Field>
        <Field label="Folio"><Input value={f.folio} onChange={e => set('folio', e.target.value)} placeholder="1764" /></Field>
        <Field label="Folio fiscal (UUID)" span={2}><Input value={f.uuid} onChange={e => set('uuid', e.target.value)} placeholder="Se llena desde el XML" /></Field>
        <Field label={f.kind === 'factura' ? 'Fecha de emisión' : 'Fecha de pago'}><Input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></Field>
        <Field label={f.kind === 'factura' ? 'Total (c/IVA)' : 'Monto pagado'}><MoneyInput value={f.total} onChange={v => set('total', v)} /></Field>
        <Field label="RFC receptor"><Input value={f.rfcReceptor} onChange={e => set('rfcReceptor', e.target.value)} /></Field>
        <Field label="Nombre receptor"><Input value={f.nombreReceptor} onChange={e => set('nombreReceptor', e.target.value)} /></Field>
        <Field label="Notas" span={2}><Input value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
      {(rfcMismatch || uuidDup) && (
        <div className="mt-3.5 flex flex-col gap-1.5 text-[12px]">
          {uuidDup && (
            <div className="flex items-start gap-2" style={{ color: 'var(--danger)' }}>
              <Icon name="lock" size={14} className="mt-px shrink-0" />
              <span>
                Este CFDI ya está cargado{uuidDup.bankTxId === tx.id ? ' en este mismo abono' : dupTx ? <> en el abono de <b>{fmtMoney2(dupTx.amount)}</b> del {fmtDateShort(dupTx.date)}{dupProj ? <> (<span className="mono">{dupProj.code}</span>)</> : ''}</> : ' en otro abono'}. Un mismo documento no se puede cargar dos veces.
                {f.kind === 'factura' && uuidDup.bankTxId !== tx.id && <> Si esta factura es PPD y cubre también este abono, carga aquí solo su <b>complemento de pago</b>.</>}
              </span>
            </div>
          )}
          {rfcMismatch && <div className="flex items-center gap-2" style={{ color: 'var(--warn)' }}><Icon name="alert" size={14} /> El RFC del receptor no coincide con el del cliente del proyecto ({cliente?.rfc}).</div>}
        </div>
      )}
      {guard}
    </Modal>
  )
}

/* ---- Modal principal: documentos del abono ---- */
export function CfdiModal({ tx, onClose }: { tx: BankTransaction; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const readOnly = state.currentUser?.role === 'ventas' || isDireccion(state.currentUser?.role)
  const docs = sel.cfdiForTx(state, tx.id)
  const estado = cfdiEstado(docs)
  const descuadre = cfdiDescuadre(docs, tx.amount)
  const proj = tx.projectId ? state.projects.find(p => p.id === tx.projectId) : undefined
  const [form, setForm] = React.useState<{ doc?: CfdiDoc; kind: CfdiKind } | null>(null)
  const [del, setDel] = React.useState<CfdiDoc | null>(null)
  const necesitaComplemento = estado === 'Falta complemento'

  return (
    <Modal width={760} icon="doc" title="Facturación del abono" sub={`${fmtDate(tx.date)} · ${tx.bank}${tx.bankFrom ? ' · ' + tx.bankFrom : ''}${tx.reference ? ' · ' + tx.reference : ''}`} onClose={onClose}
      footer={<>
        <div className="flex-1"></div>
        {!readOnly && <>
          <button className="btn btn-ghost" onClick={() => setForm({ kind: 'complemento' })}><Icon name="plus" size={15} /> Complemento de pago</button>
          <button className={'btn ' + (necesitaComplemento ? 'btn-ghost' : 'btn-primary')} onClick={() => setForm({ kind: 'factura' })}><Icon name="plus" size={15} /> Factura</button>
        </>}
      </>}>
      <div className="bg-bg-1 border border-line rounded-[8px] p-3 mb-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13.5px] truncate">{tx.detail || tx.concept}</div>
          <div className="meta mt-0.5 truncate">
            {proj ? <><span className="mono text-acc font-semibold">{proj.code}</span> · {sel.clientName(state, proj.client)}</> : 'Sin proyecto asignado'}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display font-extrabold text-[20px] text-ok whitespace-nowrap">{fmtMoney2(tx.amount)}</div>
          <Badge color={CFDI_ESTADO_COLOR[estado]}>{estado}</Badge>
        </div>
      </div>

      {descuadre != null && (
        <div className="mb-3.5 flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--warn)' }}>
          <Icon name="alert" size={15} />
          {descuadre > 0 ? <>Lo documentado es <b>{fmtMoney(Math.abs(descuadre))}</b> menor que el abono.</> : <>Lo documentado es <b>{fmtMoney(Math.abs(descuadre))}</b> mayor que el abono.</>}
        </div>
      )}
      {necesitaComplemento && (
        <div className="mb-3.5 flex items-center gap-2 text-[12.5px] text-tx-2">
          <Icon name="alert" size={15} className="text-warn" /> La factura es <b>PPD</b>: falta cargar el complemento de pago de este abono.
        </div>
      )}

      {docs.length === 0 ? (
        <Empty icon="docPlus">Sin documentos.{readOnly ? '' : ' Carga la factura (o el complemento si la factura ya está en otro abono).'}</Empty>
      ) : (
        <div className="border border-line rounded-[8px] overflow-hidden">
          <table className="tbl">
            <thead><tr><th>Tipo</th><th>Folio</th><th>Fecha</th><th className="num">Importe</th><th>Método</th><th>Archivos</th><th></th></tr></thead>
            <tbody>
              {docs.map(d => {
                return (
                  <tr key={d.id} style={{ cursor: 'default' }}>
                    <td><Badge color={KIND_COLOR[d.kind]}>{KIND_LABEL[d.kind]}</Badge></td>
                    <td>
                      <div className="mono text-[12.5px] font-semibold">{cfdiFolio(d)}</div>
                      {d.uuid && <div className="meta mono truncate max-w-[200px]" title={d.uuid}>{d.uuid}</div>}
                    </td>
                    <td className="num text-[12px]">{d.fecha ? fmtDateShort(d.fecha) : '—'}</td>
                    <td className="num font-semibold">{fmtMoney2(d.total)}</td>
                    <td className="text-[12px]">{d.kind === 'factura' ? (d.metodoPago || '—') : (d.relatedUuid ? <span className="mono" title={`Paga la factura ${d.relatedUuid}`}>{d.relatedUuid.slice(0, 8)}…</span> : '—')}</td>
                    <td>
                      <div className="flex gap-1.5 flex-wrap">
                        {d.pdfPath ? <DocChip doc={{ name: d.pdf || 'PDF', ok: true, path: d.pdfPath }} label="PDF" /> : <span className="doc-chip doc-missing"><Icon name="docPlus" size={14} /><span className="nm">PDF</span></span>}
                        {d.xmlPath ? <DocChip doc={{ name: d.xml || 'XML', ok: true, path: d.xmlPath }} label="XML" /> : <span className="doc-chip doc-missing"><Icon name="docPlus" size={14} /><span className="nm">XML</span></span>}
                      </div>
                    </td>
                    <td>{!readOnly && <div className="flex gap-1 justify-end">
                      <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setForm({ doc: d, kind: d.kind })}><Icon name="edit" size={13} /></button>
                      <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => setDel(d)}><Icon name="trash" size={13} /></button>
                    </div>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && <CfdiForm tx={tx} doc={form.doc} kind={form.kind} onClose={() => setForm(null)} />}
      {del && (
        <Confirm title={`Eliminar ${KIND_LABEL[del.kind].toLowerCase()}`} message={<>Se quitará <b>{cfdiFolio(del)}</b> de este abono y se borrarán sus archivos.</>}
          onConfirm={() => { dispatch({ type: 'DELETE_CFDI_DOC', id: del.id }); setDel(null) }} onClose={() => setDel(null)} />
      )}
    </Modal>
  )
}
