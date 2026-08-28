// ============================================================
//  COBRANZA → BANCOS — abonos del estado de cuenta (BBVA)
//   · Importa el .exp/.txt que exporta BBVA (sin duplicar entre cargas).
//   · Muestra solo las ENTRADAS de dinero; cada una se clasifica sola
//     (cliente / TPV / efectivo / devolución / prueba) y se puede corregir.
//   · "Asignar" liga el abono a un proyecto: crea el cobro en Cobranza
//     (o engancha uno ya programado) con la fecha e importe reales del banco.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDate, fmtDateShort, TODAY_ISO, isDireccion } from '../../core/data'
import { Modal, Badge, Empty, KPI, Select, Seg, Combobox, Field, Input, Confirm } from '../../core/ui'
import type { ComboOption } from '../../core/ui'
import { Icon } from '../../core/icons'
import { parseBBVA, readBankFile, toBankTxInput, hintsOf, esIdPagador } from '../../core/bank_import'
import type { ParsedBankLine } from '../../core/bank_import'
import { cfdiEstado, CFDI_ESTADO_COLOR } from '../../core/cfdi'
import type { CfdiEstado } from '../../core/cfdi'
import { CfdiModal } from './cfdi_modal'
import type { AppState, BankTransaction, BankTxCategory, ClientPayment, Project } from '../../core/types'

const CAT: Record<BankTxCategory, { label: string; color: string }> = {
  cliente:    { label: 'Cliente',    color: 'var(--acc)' },
  tpv:        { label: 'TPV',        color: 'var(--ok)' },
  efectivo:   { label: 'Efectivo',   color: 'var(--ok)' },
  devolucion: { label: 'Devolución', color: 'var(--danger)' },
  prueba:     { label: 'Prueba',     color: 'var(--tx-3)' },
  no_aplica:  { label: 'No aplica',  color: 'var(--tx-3)' },
}
/** Categorías que SÍ son dinero de clientes (las demás no se asignan a proyecto). */
const ES_COBRO: BankTxCategory[] = ['cliente', 'tpv', 'efectivo']
const esCobro = (t: BankTransaction) => ES_COBRO.includes(t.category)

type Estado = 'Sin asignar' | 'Asignado' | 'No aplica'
const ESTADO_COLOR: Record<Estado, string> = { 'Sin asignar': 'var(--warn)', Asignado: 'var(--ok)', 'No aplica': 'var(--tx-3)' }
const estadoDe = (t: BankTransaction): Estado => (!esCobro(t) ? 'No aplica' : t.projectId ? 'Asignado' : 'Sin asignar')

const mesLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Concepto sugerido para el cobro a partir de lo que escribió el cliente. */
const conceptoSugerido = (detail: string) => {
  const d = detail.toUpperCase()
  if (/ANTICIPO|ANT\b/.test(d)) return 'Anticipo'
  if (/FINIQUITO|LIQUIDACION|LIQUIDACIÓN|\bFIN\b/.test(d)) return 'Finiquito'
  if (/TOTAL|CONTADO/.test(d)) return 'Pago de contado'
  return 'Abono'
}

/* ============================================================
   Sugerencias de proyecto para un abono (se calculan al abrir el modal)
   ============================================================ */
interface Sugerencia { project: Project; payment?: ClientPayment; reasons: string[]; score: number }

function sugerir(state: AppState, tx: BankTransaction): Sugerencia[] {
  const near = (a: number, b: number) => Math.abs(a - b) < 1
  const hints = hintsOf(tx.detail, tx.numRef)
  const hintNums = hints.map(h => h.replace(/\D/g, '')).filter(n => n.length >= 3)
  const words = tx.detail.toUpperCase().split(/[^A-ZÁÉÍÓÚÑ]+/).filter(w => w.length >= 4)
  const out = new Map<string, Sugerencia>()
  const add = (project: Project, reason: string, score: number, payment?: ClientPayment) => {
    const key = payment ? `${project.id}:${payment.id}` : project.id
    const cur = out.get(key)
    if (cur) { cur.reasons.push(reason); cur.score += score }
    else out.set(key, { project, payment, reasons: [reason], score })
  }
  // 0) Mismo pagador (cuenta BBVA) que un abono ya asignado → muy probablemente el mismo proyecto.
  if (esIdPagador(tx.numRef)) {
    const mismos = new Set(state.bankTxs.filter(t => t.id !== tx.id && t.projectId && t.numRef === tx.numRef).map(t => t.projectId as string))
    for (const pid of mismos) { const p = state.projects.find(x => x.id === pid); if (p) add(p, 'Mismo pagador que un abono ya asignado', 50) }
  }
  // Cobros ya ligados a OTRO abono del banco: no se pueden volver a ligar.
  const ligados = new Set(state.bankTxs.filter(b => b.id !== tx.id && b.clientPaymentId).map(b => b.clientPaymentId as string))
  for (const p of state.projects) {
    const saldo = sel.projectSaldoCliente(state, p)
    const client = sel.client(state, p.client)
    // 1) Cobro del proyecto (programado o ya capturado a mano) con el mismo importe → candidato
    //    fuerte: se LIGA en lugar de crear otro, para no contar el dinero dos veces.
    for (const c of state.clientPayments.filter(c => c.projectId === p.id && c.status !== 'Cancelado' && !ligados.has(c.id) && near(c.amount, tx.amount))) {
      add(p, c.status === 'Cobrado' ? `Cobro #${c.n} ya registrado a mano por el mismo importe` : `Cobro programado #${c.n} por el mismo importe`, c.status === 'Cobrado' ? 70 : 60, c)
    }
    // 2) Saldo pendiente igual al abono (finiquito) o mitad del total (anticipo 50%).
    if (saldo > 0 && near(saldo, tx.amount)) add(p, 'El saldo pendiente coincide', 40)
    else if (near(sel.projectTotalConIva(p) / 2, tx.amount)) add(p, 'Es el 50% del total (anticipo)', 30)
    // 3) Folio mencionado en la transferencia coincide con el código del proyecto.
    const codeNums = p.code.replace(/\D/g, '')
    if (codeNums && hintNums.some(n => codeNums.endsWith(n))) add(p, `Menciona ${hints.join(', ')}`, 35)
    // 4) Nombre del cliente / alias aparece en el texto del pago.
    const nameWords = `${client?.name ?? ''} ${p.alias ?? ''} ${client?.razonSocial ?? ''}`.toUpperCase().split(/[^A-ZÁÉÍÓÚÑ]+/).filter(w => w.length >= 4)
    const hit = words.filter(w => nameWords.includes(w))
    if (hit.length) add(p, `Menciona "${hit.join(' ')}"`, 15 * hit.length)
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 5)
}

/* ============================================================
   Modal: asignar abono a proyecto
   ============================================================ */
function AssignModal({ tx, onClose }: { tx: BankTransaction; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [projectId, setProjectId] = React.useState(tx.projectId ?? '')
  const [paymentId, setPaymentId] = React.useState(tx.clientPaymentId && !tx.paymentCreated ? tx.clientPaymentId : '')
  const [concept, setConcept] = React.useState(() => {
    const cur = tx.clientPaymentId ? state.clientPayments.find(c => c.id === tx.clientPaymentId) : undefined
    return cur?.concept || conceptoSugerido(tx.detail)
  })
  const sugerencias = React.useMemo(() => sugerir(state, tx), [state, tx])
  const hints = hintsOf(tx.detail, tx.numRef)

  const proj = state.projects.find(p => p.id === projectId)
  const total = proj ? sel.projectTotalConIva(proj) : 0
  const cobrado = proj ? sel.projectCobrado(state, proj.id) : 0
  // Cobros del proyecto que se pueden ligar: programados o ya capturados a mano, siempre que
  // no estén ligados a OTRO abono del banco. Ligar evita contar el mismo dinero dos veces.
  const ligadosOtro = new Set(state.bankTxs.filter(b => b.id !== tx.id && b.clientPaymentId).map(b => b.clientPaymentId as string))
  const ligables = proj ? state.clientPayments.filter(c => c.projectId === proj.id && c.status !== 'Cancelado' && !ligadosOtro.has(c.id)).sort((a, b) => a.n - b.n) : []
  const ligado = paymentId ? ligables.find(c => c.id === paymentId) : undefined
  // Cobrado "sin" este abono: si se liga un cobro que ya estaba Cobrado, su importe se sustituye por el del banco.
  const cobradoBase = cobrado - (ligado && ligado.status === 'Cobrado' ? ligado.amount : 0)
  const cobradoTras = cobradoBase + tx.amount
  const exceso = Math.round((cobradoTras - total) * 100) / 100
  const yaRegistrados = ligables.filter(c => c.status === 'Cobrado')
  const options: ComboOption[] = state.projects.map(p => ({
    value: p.id,
    label: `${p.code} · ${sel.clientName(state, p.client)}`,
    sub: `Saldo ${fmtMoney(Math.max(0, sel.projectSaldoCliente(state, p)))}${p.alias ? ` · ${p.alias}` : ''}`,
  }))
  const pick = (pid: string, cpid?: string) => { setProjectId(pid); setPaymentId(cpid ?? '') }
  const save = () => {
    if (!projectId) return
    dispatch({ type: 'ASSIGN_BANK_TX', id: tx.id, projectId, clientPaymentId: paymentId || undefined, concept: concept.trim() || 'Abono' })
    onClose()
  }

  return (
    <Modal width={640} icon="money" title="Asignar abono a proyecto" sub={`${fmtDate(tx.date)} · ${tx.bank}${tx.bankFrom ? ' · ' + tx.bankFrom : ''}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!projectId ? ' opacity-50' : '')} disabled={!projectId} onClick={save}><Icon name="check" size={15} /> {paymentId ? 'Ligar al cobro' : 'Crear cobro'}</button>
      </>}>
      {/* Resumen del abono */}
      <div className="bg-bg-1 border border-line rounded-[8px] p-3 mb-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13.5px] truncate">{tx.detail || tx.concept}</div>
          <div className="meta mt-0.5 truncate" title={tx.concept}>{tx.concept}</div>
          {hints.length > 0 && <div className="flex gap-1.5 mt-1.5 flex-wrap">{hints.map(h => <Badge key={h} color="var(--acc)">{h}</Badge>)}</div>}
        </div>
        <div className="font-display font-extrabold text-[20px] text-ok whitespace-nowrap">{fmtMoney2(tx.amount)}</div>
      </div>

      {/* Sugerencias */}
      {sugerencias.length > 0 && (
        <div className="mb-4">
          <div className="label-k mb-1.5">Sugerencias</div>
          <div className="flex flex-col gap-1.5">
            {sugerencias.map(s => {
              const on = projectId === s.project.id && (paymentId || '') === (s.payment?.id || '')
              return (
                <button key={`${s.project.id}:${s.payment?.id ?? ''}`} type="button"
                  className="text-left border rounded-[8px] px-3 py-2 flex items-center gap-3 transition-colors"
                  style={{ borderColor: on ? 'var(--acc)' : 'var(--line)', background: on ? 'color-mix(in srgb, var(--acc) 8%, transparent)' : 'transparent' }}
                  onClick={() => pick(s.project.id, s.payment?.id)}>
                  <span className="mono text-acc font-semibold text-[12.5px]">{s.project.code}</span>
                  <span className="text-[12.5px] flex-1 min-w-0 truncate">{sel.clientName(state, s.project.client)}</span>
                  <span className="meta whitespace-nowrap">{s.reasons[0]}{s.reasons.length > 1 ? ` +${s.reasons.length - 1}` : ''}</span>
                  {on && <Icon name="check" size={14} className="text-acc" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Proyecto" span={2}>
          <Combobox value={projectId} onChange={v => pick(v)} options={options} placeholder="Buscar proyecto o cliente…" />
        </Field>
        {proj && (
          <div className="col-span-2 bg-bg-1 border border-line rounded-[8px] p-3 grid grid-cols-3 gap-2 text-center">
            <div><div className="label-k">Total venta</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtMoney(total)}</div></div>
            <div><div className="label-k">Cobrado</div><div className="font-display font-bold text-[15px] mt-0.5 text-ok">{fmtMoney(cobrado)}</div></div>
            <div><div className="label-k">Saldo tras este abono</div><div className="font-display font-bold text-[15px] mt-0.5" style={{ color: total - cobradoTras > 0.5 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(Math.max(0, total - cobradoTras))}</div></div>
          </div>
        )}
        {proj && ligables.length > 0 && (
          <Field label="¿Cómo registrarlo?" span={2}>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="radio" name="cp" checked={!paymentId} onChange={() => setPaymentId('')} /> Crear un cobro nuevo
              </label>
              {ligables.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-[13px] cursor-pointer flex-wrap">
                  <input type="radio" name="cp" checked={paymentId === c.id} onChange={() => setPaymentId(c.id)} />
                  {c.status === 'Cobrado' ? 'Ligar al cobro ya registrado' : 'Ligar al cobro programado'} <span className="mono">#{c.n}</span> · {c.concept || 'sin concepto'} · {fmtMoney2(c.amount)} · {fmtDateShort(c.date)}
                  {c.status === 'Cobrado' && Math.abs(c.amount - tx.amount) < 1 && <Badge color="var(--ok)">mismo importe</Badge>}
                  {Math.abs(c.amount - tx.amount) >= 1 && <span className="meta">(tomará fecha e importe del banco)</span>}
                </label>
              ))}
            </div>
          </Field>
        )}
        {proj && !paymentId && exceso > 0.5 && (
          <div className="col-span-2 flex items-start gap-2 text-[12.5px]" style={{ color: 'var(--warn)' }}>
            <Icon name="alert" size={15} className="mt-px shrink-0" />
            <span>
              Con un cobro nuevo, lo cobrado superaría el total del proyecto por <b>{fmtMoney(exceso)}</b>.
              {yaRegistrados.length > 0
                ? <> Este dinero probablemente ya está registrado a mano: <b>liga el abono al cobro existente</b> (arriba) en vez de crear otro.</>
                : <> Revisa que el proyecto y el importe sean correctos antes de guardar.</>}
            </span>
          </div>
        )}
        <Field label="Concepto del cobro" span={2}>
          <Input list="banco-concepts" value={concept} onChange={e => setConcept(e.target.value)} placeholder="Anticipo, Finiquito…" />
          <datalist id="banco-concepts"><option value="Anticipo 50%" /><option value="Anticipo" /><option value="Finiquito" /><option value="Abono" /><option value="Pago de contado" /></datalist>
        </Field>
      </div>
    </Modal>
  )
}

/* ============================================================
   Modal: vista previa de la importación
   ============================================================ */
function ImportModal({ file, lines, skipped, headerOk, onClose }: { file: string; lines: ParsedBankLine[]; skipped: number; headerOk: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const seen = new Set(state.bankTxs.map(t => t.hash))
  const nuevos = lines.filter(l => !seen.has(l.hash))
  const dup = lines.length - nuevos.length
  const abonos = nuevos.filter(l => l.kind === 'abono')
  const cargos = nuevos.length - abonos.length
  const totalAbonos = abonos.reduce((a, l) => a + l.amount, 0)
  const fechas = lines.map(l => l.date).sort()
  const doImport = () => { dispatch({ type: 'IMPORT_BANK_TXS', txs: nuevos.map(toBankTxInput) }); onClose() }

  return (
    <Modal width={720} icon="download" title="Importar estado de cuenta" sub={file} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!nuevos.length ? ' opacity-50' : '')} disabled={!nuevos.length} onClick={doImport}>
          <Icon name="check" size={15} /> Importar {nuevos.length} movimiento{nuevos.length === 1 ? '' : 's'}
        </button>
      </>}>
      {!headerOk && lines.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-tx-2">
          <Icon name="alert" size={26} className="mx-auto mb-2 text-warn opacity-70" />
          No se reconoció el formato. Exporta desde BBVA el estado de cuenta en <b>texto (.exp / .txt)</b>, separado por tabulador.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Abonos nuevos</div><div className="font-display font-bold text-[17px] mt-0.5 text-ok">{abonos.length}</div><div className="meta">{fmtMoney(totalAbonos)}</div></div>
            <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Cargos nuevos</div><div className="font-display font-bold text-[17px] mt-0.5">{cargos}</div><div className="meta">se guardan, no se muestran</div></div>
            <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Ya existían</div><div className="font-display font-bold text-[17px] mt-0.5 text-tx-2">{dup}</div><div className="meta">se omiten</div></div>
            <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Periodo</div><div className="font-semibold text-[12.5px] mt-1">{fechas.length ? `${fmtDateShort(fechas[0])} – ${fmtDateShort(fechas[fechas.length - 1])}` : '—'}</div>{skipped > 0 && <div className="meta">{skipped} línea{skipped === 1 ? '' : 's'} sin leer</div>}</div>
          </div>
          {abonos.length === 0 ? (
            <Empty icon="check">Todos los abonos de este archivo ya estaban importados</Empty>
          ) : (
            <div className="border border-line rounded-[8px] overflow-hidden max-h-[360px] overflow-y-auto">
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th className="num">Importe</th></tr></thead>
                <tbody>
                  {abonos.map(l => (
                    <tr key={l.hash} style={{ cursor: 'default' }}>
                      <td className="num text-[12px]">{fmtDateShort(l.date)}</td>
                      <td className="text-[12.5px]"><div className="font-semibold truncate max-w-[340px]" title={l.concept}>{l.detail || l.concept}</div><div className="meta truncate max-w-[340px]">{l.bankFrom}{l.bankFrom && l.reference ? ' · ' : ''}{l.reference}</div></td>
                      <td><Badge color={CAT[l.category].color}>{CAT[l.category].label}</Badge></td>
                      <td className="num font-semibold">{fmtMoney2(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

/* ============================================================
   Vista principal
   ============================================================ */
export function BancosView() {
  const { state, dispatch } = useStore()
  const readOnly = state.currentUser?.role === 'ventas' || isDireccion(state.currentUser?.role)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [q, setQ] = React.useState('')
  const [mes, setMes] = React.useState('')
  const [filtro, setFiltro] = React.useState('pendientes')   // pendientes | asignados | no_aplica | todos
  const [fact, setFact] = React.useState('')                  // '' | Sin factura | Falta complemento | Facturado
  const [assign, setAssign] = React.useState<BankTransaction | null>(null)
  const [cfdi, setCfdi] = React.useState<BankTransaction | null>(null)
  const [del, setDel] = React.useState<BankTransaction | null>(null)
  const [blocked, setBlocked] = React.useState<BankTransaction | null>(null)   // intento de borrar un abono con CFDI
  const [imp, setImp] = React.useState<{ file: string; lines: ParsedBankLine[]; skipped: number; headerOk: boolean } | null>(null)
  const [parsing, setParsing] = React.useState(false)
  const [err, setErr] = React.useState('')

  const onFile = async (f: File) => {
    setParsing(true); setErr('')
    try {
      const text = await readBankFile(f)
      const r = await parseBBVA(text)
      setImp({ file: f.name, ...r })
    } catch (e) {
      console.error(e); setErr('No se pudo leer el archivo.')
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const abonos = state.bankTxs.filter(t => t.kind === 'abono')
  const mesOpts = [...new Set(abonos.map(t => t.date.slice(0, 7)))].sort((a, b) => (a < b ? 1 : -1))
  const needle = q.trim().toLowerCase()
  const docsDe = (t: BankTransaction) => state.cfdiDocs.filter(d => d.bankTxId === t.id)
  const rows = abonos
    .map(t => {
      const proj = t.projectId ? state.projects.find(p => p.id === t.projectId) : undefined
      const docs = docsDe(t)
      return { t, proj, cliente: proj ? sel.clientName(state, proj.client) : '', estado: estadoDe(t), docs, fEstado: cfdiEstado(docs) as CfdiEstado }
    })
    .filter(r =>
      (!mes || r.t.date.slice(0, 7) === mes) &&
      (filtro === 'todos' || (filtro === 'pendientes' && r.estado === 'Sin asignar') || (filtro === 'asignados' && r.estado === 'Asignado') || (filtro === 'no_aplica' && r.estado === 'No aplica')) &&
      (!fact || (esCobro(r.t) && r.fEstado === fact)) &&
      (!needle || `${r.t.concept} ${r.t.detail} ${r.t.reference} ${r.t.numRef} ${r.proj?.code ?? ''} ${r.cliente} ${r.t.amount} ${r.t.notes}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => (a.t.date < b.t.date ? 1 : a.t.date > b.t.date ? -1 : b.t.amount - a.t.amount))

  // KPIs (sobre todos los abonos, no sobre el filtro).
  const mesActual = TODAY_ISO.slice(0, 7)
  const pendientes = abonos.filter(t => estadoDe(t) === 'Sin asignar')
  const pendSum = pendientes.reduce((a, t) => a + t.amount, 0)
  const delMes = abonos.filter(t => esCobro(t) && t.date.slice(0, 7) === mesActual).reduce((a, t) => a + t.amount, 0)
  const asignadosMes = abonos.filter(t => estadoDe(t) === 'Asignado' && t.date.slice(0, 7) === mesActual).reduce((a, t) => a + t.amount, 0)
  const totalFiltrado = rows.reduce((a, r) => a + r.t.amount, 0)
  const ultima = abonos.reduce((m, t) => (t.importedAt > m ? t.importedAt : m), '')
  // Por facturar: abonos de clientes (no devoluciones/pruebas) sin factura o con complemento pendiente.
  const porFacturar = abonos.filter(t => esCobro(t) && cfdiEstado(docsDe(t)) !== 'Facturado')
  const porFacturarSum = porFacturar.reduce((a, t) => a + t.amount, 0)

  return (
    <>
      <div className="grid grid-cols-4 gap-3.5 mb-4">
        <KPI label="Sin asignar" value={pendSum} format={fmtMoney} icon="alert" accent foot={`${pendientes.length} abono${pendientes.length === 1 ? '' : 's'} pendiente${pendientes.length === 1 ? '' : 's'}`} />
        <KPI label="Por facturar" value={porFacturarSum} format={fmtMoney} icon="doc" foot={`${porFacturar.length} abono${porFacturar.length === 1 ? '' : 's'} sin factura o complemento`} />
        <KPI label="Entradas este mes" value={delMes} format={fmtMoney} icon="money" foot={mesLabel(mesActual)} />
        <KPI label="Conciliado este mes" value={asignadosMes} format={fmtMoney} icon="check" foot={ultima ? `Última importación ${fmtDateShort(ultima.slice(0, 10))}` : 'Sin importaciones'} />
      </div>

      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        {!readOnly && (
          <>
            <button className="btn btn-primary" disabled={parsing} onClick={() => fileRef.current?.click()}><Icon name="download" size={15} /> {parsing ? 'Leyendo…' : 'Importar estado de cuenta'}</button>
            <input ref={fileRef} type="file" accept=".exp,.txt,.csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          </>
        )}
        <div className="relative flex-[1_1_220px] max-w-[320px]">
          <Icon name="search" size={15} className="absolute left-[11px] top-2.5 text-tx-3" />
          <input className="input pl-[34px]" placeholder="Buscar concepto, referencia, proyecto…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={mes} onChange={e => setMes(e.target.value)} className="w-auto min-w-[160px]">
          <option value="">Todos los meses</option>
          {mesOpts.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </Select>
        <Seg value={filtro} onChange={setFiltro} options={[
          { value: 'pendientes', label: `Sin asignar${pendientes.length ? ` (${pendientes.length})` : ''}` },
          { value: 'asignados', label: 'Asignados' },
          { value: 'no_aplica', label: 'No aplica' },
          { value: 'todos', label: 'Todos' },
        ]} />
        <Select value={fact} onChange={e => setFact(e.target.value)} className="w-auto min-w-[170px]">
          <option value="">Facturación: todas</option>
          <option value="Sin factura">Sin factura</option>
          <option value="Falta complemento">Falta complemento</option>
          <option value="Facturado">Facturado</option>
        </Select>
        <span className="flex-1"></span>
        <span className="meta">{rows.length} abono{rows.length === 1 ? '' : 's'} · <b className="text-tx-1">{fmtMoney(totalFiltrado)}</b></span>
      </div>
      {err && <div className="text-[12px] mb-3" style={{ color: 'var(--danger)' }}>{err}</div>}

      <div className="card overflow-hidden">
        {/* Altura acotada con scroll interno (el encabezado .tbl th es sticky): la tabla no se
            extiende hasta abajo aunque haya cientos de abonos. */}
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 330px)', minHeight: 220 }}>
          <table className="tbl">
            <thead><tr>
              <th>Fecha</th><th>Concepto</th><th className="num">Importe</th><th>Tipo</th><th>Proyecto</th><th>Estado</th><th>Facturación</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(({ t, proj, cliente, estado, docs, fEstado }) => {
                const hints = hintsOf(t.detail, t.numRef)
                const canAssign = !readOnly && esCobro(t)
                return (
                  <tr key={t.id} onClick={canAssign ? () => setAssign(t) : undefined} style={canAssign ? undefined : { cursor: 'default' }}>
                    <td className="num text-[12px] whitespace-nowrap">{fmtDateShort(t.date)}</td>
                    <td className="text-[12.5px]">
                      <div className="font-semibold text-tx-1 truncate max-w-[320px]" title={t.concept}>{t.detail || t.concept}</div>
                      <div className="meta truncate max-w-[320px] flex items-center gap-1.5">
                        <span>{t.bankFrom}{t.bankFrom && t.reference ? ' · ' : ''}{t.reference}</span>
                        {hints.map(h => <Badge key={h} color="var(--acc)">{h}</Badge>)}
                      </div>
                    </td>
                    <td className="num font-semibold text-ok whitespace-nowrap">{fmtMoney2(t.amount)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {/* CANDADO: con proyecto asignado o documentos cargados, el tipo ya no se cambia
                          (primero desasigna / elimina los CFDI). */}
                      {readOnly || t.projectId || docs.length > 0 ? (
                        <Badge color={CAT[t.category].color}>{CAT[t.category].label}</Badge>
                      ) : (
                        <Select value={t.category} onChange={e => dispatch({ type: 'SET_BANK_TX_CATEGORY', id: t.id, category: e.target.value as BankTxCategory })} className="w-auto text-[12px] py-1">
                          {(Object.keys(CAT) as BankTxCategory[]).map(k => <option key={k} value={k}>{CAT[k].label}</option>)}
                        </Select>
                      )}
                    </td>
                    <td className="text-[12.5px]">
                      {proj ? <><span className="mono text-acc font-semibold">{proj.code}</span><div className="meta truncate max-w-[200px]">{cliente}</div></> : <span className="text-tx-3">—</span>}
                    </td>
                    <td><Badge color={ESTADO_COLOR[estado]}>{estado}</Badge></td>
                    <td onClick={e => e.stopPropagation()}>
                      {esCobro(t) ? (
                        <button type="button" className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer" title="Ver / cargar factura y complemento" onClick={() => setCfdi(t)}>
                          <Badge color={CFDI_ESTADO_COLOR[fEstado]}>{fEstado}</Badge>
                          {docs.length > 0 && <span className="meta whitespace-nowrap">{docs.length} doc{docs.length === 1 ? '' : 's'}</span>}
                          <Icon name="docPlus" size={14} className="text-tx-3" />
                        </button>
                      ) : <span className="text-tx-3">—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {!readOnly && (
                        <div className="flex gap-1 justify-end">
                          {esCobro(t) && <button className="btn btn-sm btn-ghost" onClick={() => setAssign(t)}><Icon name={t.projectId ? 'edit' : 'plus'} size={13} /> {t.projectId ? 'Cambiar' : 'Asignar'}</button>}
                          {t.projectId && <button className="icon-btn w-7 h-7" title="Quitar asignación" onClick={() => dispatch({ type: 'UNASSIGN_BANK_TX', id: t.id })}><Icon name="close" size={13} /></button>}
                          <button className="icon-btn w-7 h-7" title={docs.length ? 'Tiene CFDI cargados: elimínalos primero' : 'Eliminar del registro'} onClick={() => (docs.length ? setBlocked(t) : setDel(t))}><Icon name={docs.length ? 'lock' : 'trash'} size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <Empty icon="money">
            {abonos.length === 0
              ? <>Aún no hay movimientos. {readOnly ? '' : 'Importa el estado de cuenta (.exp / .txt) que exporta BBVA.'}</>
              : filtro === 'pendientes' && !q && !mes && !fact ? 'Todos los abonos están asignados' : 'Ningún abono coincide con el filtro'}
          </Empty>
        )}
      </div>

      {assign && <AssignModal tx={assign} onClose={() => setAssign(null)} />}
      {cfdi && <CfdiModal tx={cfdi} onClose={() => setCfdi(null)} />}
      {imp && <ImportModal {...imp} onClose={() => setImp(null)} />}
      {blocked && (
        <Confirm title="No se puede eliminar" confirmLabel="Ver documentos" danger={false}
          message={<>El abono de <b>{fmtMoney2(blocked.amount)}</b> del {fmtDate(blocked.date)} tiene {docsDe(blocked).length} CFDI cargado{docsDe(blocked).length === 1 ? '' : 's'}. Elimínalos primero desde Facturación y luego podrás borrar el abono.</>}
          onConfirm={() => setCfdi(blocked)} onClose={() => setBlocked(null)} />
      )}
      {del && (
        <Confirm title="Eliminar movimiento" confirmLabel="Eliminar"
          message={<>Se quitará el abono de <b>{fmtMoney2(del.amount)}</b> del {fmtDate(del.date)}.{del.paymentCreated ? <> También se borrará el cobro que se creó desde él.</> : null}<br /><span className="meta">Si vuelves a importar el mismo archivo, reaparecerá.</span></>}
          onConfirm={() => { dispatch({ type: 'DELETE_BANK_TX', id: del.id }); setDel(null) }} onClose={() => setDel(null)} />
      )}
    </>
  )
}
