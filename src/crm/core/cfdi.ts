// ============================================================
//  CFDI — lectura del XML (SAT 3.3 / 4.0) en el navegador y estado
//  de facturación de un abono.
//
//  Del XML se toman: tipo (I = factura, P = complemento de pago), UUID del
//  timbre, serie/folio, fecha, total, método de pago (PUE/PPD) y receptor.
//  En un complemento (P) el importe es el "Monto" del nodo Pago y se guarda
//  el UUID de la factura que paga (DoctoRelacionado).
// ============================================================
import type { CfdiDoc, CfdiKind } from './types'

export interface CfdiParsed {
  kind: CfdiKind
  uuid: string
  serie: string
  folio: string
  fecha: string          // YYYY-MM-DD
  total: number
  metodoPago: string     // PUE | PPD | ''
  rfcReceptor: string
  nombreReceptor: string
  relatedUuid: string
}

/** Primer elemento con ese nombre local (sin importar el prefijo cfdi:/pago20:/tfd:). */
const first = (root: ParentNode, local: string): Element | null => {
  const all = (root as Document | Element).getElementsByTagNameNS?.('*', local)
  return all && all.length ? all[0] : null
}
const attr = (el: Element | null, name: string) => (el?.getAttribute(name) ?? '').trim()

/** Lee un CFDI. Lanza Error con mensaje legible si el XML no es un comprobante. */
export function parseCfdiXml(text: string): CfdiParsed {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('El archivo no es un XML válido.')
  const comp = first(doc, 'Comprobante')
  if (!comp) throw new Error('El XML no es un CFDI (no tiene el nodo Comprobante).')

  const tipo = attr(comp, 'TipoDeComprobante').toUpperCase()
  if (tipo && tipo !== 'I' && tipo !== 'P') {
    throw new Error(`El CFDI es de tipo "${tipo}" (${tipo === 'E' ? 'egreso / nota de crédito' : tipo === 'N' ? 'nómina' : tipo === 'T' ? 'traslado' : 'otro'}); aquí solo van facturas (I) y complementos de pago (P).`)
  }
  const kind: CfdiKind = tipo === 'P' ? 'complemento' : 'factura'
  const receptor = first(comp, 'Receptor')
  const timbre = first(comp, 'TimbreFiscalDigital')

  let total = Number(attr(comp, 'Total') || 0) || 0
  let fecha = attr(comp, 'Fecha').slice(0, 10)
  let relatedUuid = ''
  if (kind === 'complemento') {
    // pago10/pago20: <Pagos><Pago Monto FechaPago><DoctoRelacionado IdDocumento ImpPagado/>
    const pago = first(comp, 'Pago')
    if (pago) {
      total = Number(attr(pago, 'Monto') || 0) || 0
      fecha = attr(pago, 'FechaPago').slice(0, 10) || fecha
      relatedUuid = attr(first(pago, 'DoctoRelacionado'), 'IdDocumento').toUpperCase()
    }
  }
  return {
    kind,
    uuid: attr(timbre, 'UUID').toUpperCase(),
    serie: attr(comp, 'Serie'),
    folio: attr(comp, 'Folio'),
    fecha,
    total: Math.round(total * 100) / 100,
    metodoPago: kind === 'factura' ? attr(comp, 'MetodoPago').toUpperCase() : '',
    rfcReceptor: attr(receptor, 'Rfc').toUpperCase(),
    nombreReceptor: attr(receptor, 'Nombre'),
    relatedUuid,
  }
}

/* ============================================================
   Estado de facturación de un abono
   ============================================================ */
export type CfdiEstado = 'Sin factura' | 'Falta complemento' | 'Facturado'
export const CFDI_ESTADO_COLOR: Record<CfdiEstado, string> = { 'Sin factura': 'var(--danger)', 'Falta complemento': 'var(--warn)', Facturado: 'var(--ok)' }

/** Sin documentos → Sin factura. Factura PPD sin complemento → Falta complemento.
 *  Lo demás (PUE, PPD + complemento, o solo complemento porque la factura vive en
 *  otro abono) → Facturado. */
export function cfdiEstado(docs: CfdiDoc[]): CfdiEstado {
  if (!docs.length) return 'Sin factura'
  const facturas = docs.filter(d => d.kind === 'factura')
  const complementos = docs.filter(d => d.kind === 'complemento')
  if (facturas.some(f => f.metodoPago === 'PPD') && complementos.length === 0) return 'Falta complemento'
  return 'Facturado'
}

/** Diferencia entre el importe del abono y lo documentado (null si cuadra o no hay con qué comparar).
 *  Si hay complementos se compara contra su monto pagado; si no, contra el total de las facturas PUE. */
export function cfdiDescuadre(docs: CfdiDoc[], amount: number): number | null {
  const complementos = docs.filter(d => d.kind === 'complemento')
  const base = complementos.length ? complementos : docs.filter(d => d.kind === 'factura' && d.metodoPago !== 'PPD')
  if (!base.length) return null
  const suma = base.reduce((a, d) => a + d.total, 0)
  const diff = Math.round((amount - suma) * 100) / 100
  return Math.abs(diff) < 1 ? null : diff
}

export const cfdiFolio = (d: Pick<CfdiDoc, 'serie' | 'folio' | 'uuid'>) =>
  d.serie || d.folio ? `${d.serie}${d.serie && d.folio ? '-' : ''}${d.folio}` : d.uuid ? d.uuid.slice(0, 8) + '…' : '—'
