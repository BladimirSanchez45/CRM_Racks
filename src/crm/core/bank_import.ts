// ============================================================
//  Importación del estado de cuenta BBVA (archivo .exp / .txt)
//
//  Formato (exportación de BBVA Net Cash): texto separado por TAB,
//  una línea por movimiento, con encabezado:
//    Día \t Concepto / Referencia \t cargo \t Abono \t Saldo
//    25-08-2026 \t SPEI RECIBIDOBANORTE/0118688976  072 0260825pago \t \t 5,034.40 \t 221,857.62
//
//  Cargo y Abono nunca vienen los dos en la misma fila. Los montos traen
//  coma de miles. La fecha es DD-MM-AAAA.
// ============================================================
import type { BankTransactionInput, BankTxCategory, BankTxKind } from './types'

export interface ParsedBankLine {
  date: string          // YYYY-MM-DD
  kind: BankTxKind
  amount: number
  balance?: number
  concept: string       // texto completo (espacios normalizados)
  detail: string        // texto libre del pagador
  reference: string     // clave de rastreo / referencia
  numRef: string        // referencia numérica (SPEI: la captura el cliente; cuenta BBVA: id del pagador)
  bankFrom: string      // banco emisor (SPEI)
  category: BankTxCategory
  hash: string
  raw: string           // línea original (para depurar)
}

export interface ParseResult {
  lines: ParsedBankLine[]
  skipped: number       // líneas que no se pudieron leer (vacías o sin formato)
  headerOk: boolean     // se reconoció el encabezado de BBVA
}

const toNum = (s?: string) => {
  const t = (s ?? '').replace(/[,$\s]/g, '')
  if (!t) return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

/** DD-MM-AAAA (o DD/MM/AAAA) → AAAA-MM-DD. Devuelve '' si no es fecha. */
const toISO = (s: string): string => {
  const m = s.trim().match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** Huella estable del renglón: fecha + concepto normalizado + cargo/abono + saldo.
 *  El saldo hace único cada movimiento aunque se repitan concepto e importe. */
async function hashOf(parts: string[]): Promise<string> {
  const text = parts.join('|')
  try {
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    }
  } catch { /* cae al hash simple */ }
  // Respaldo (contexto no seguro): dos hashes de 32 bits combinados.
  let h1 = 5381, h2 = 52711
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c }
  return `djb2-${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`
}

/** Separa del concepto: banco emisor, referencia, referencia numérica y el texto libre del pagador. */
export function splitConcept(concept: string): { bankFrom: string; reference: string; numRef: string; detail: string } {
  const c = concept.replace(/\s+/g, ' ').trim()
  let m: RegExpMatchArray | null

  // SPEI RECIBIDO{BANCO}/{clave}  {cod3} {ref7}{texto libre}
  // La referencia numérica de 7 dígitos (la captura el cliente) viene PEGADA al texto libre ("0250826PAGO").
  if ((m = c.match(/^SPEI (RECIBIDO|DEVUELTO)\s?(.*?)\/(\d+)\s+(\d{3})\s+(\d{7})(.*)$/i))) {
    return { bankFrom: m[2].trim(), reference: m[3], numRef: m[5], detail: m[6].trim() }
  }
  // PAGO CUENTA DE TERCERO/ {n1} BNET {n2} {texto libre}   (pago desde otra cuenta BBVA; n2 identifica al pagador)
  if ((m = c.match(/^PAGO CUENTA DE TERCERO\/\s*(\d+)\s+BNET\s+(\d+)\s*(.*)$/i))) {
    return { bankFrom: 'BBVA', reference: m[1], numRef: m[2], detail: m[3].trim() }
  }
  // DEPOSITO DE TERCERO/REFBNTC{n} {texto libre} BMRCASH   (depósito en ventanilla/practicaja)
  if ((m = c.match(/^DEPOSITO DE TERCERO\/(\S+)\s*(.*?)\s*(BMRCASH)?$/i))) {
    return { bankFrom: 'BBVA', reference: m[1], numRef: '', detail: m[2].trim() }
  }
  // DEPOSITO EN EFECTIVO/{folio}
  if ((m = c.match(/^DEPOSITO EN EFECTIVO\/(\S*)\s*(.*)$/i))) {
    return { bankFrom: '', reference: m[1], numRef: '', detail: m[2].trim() }
  }
  // VENTAS DEBITO|CREDITO/{afiliación} TERMINALES PUNTO DE VENTA
  if ((m = c.match(/^VENTAS (DEBITO|CREDITO)\/(\d+)\s*(.*)$/i))) {
    return { bankFrom: '', reference: m[2], numRef: '', detail: `TPV ${m[1].toLowerCase()}` }
  }
  // Genérico: lo que va después de la primera "/"
  const slash = c.indexOf('/')
  return { bankFrom: '', reference: '', numRef: '', detail: slash >= 0 ? c.slice(slash + 1).trim() : c }
}

/** ¿La referencia numérica identifica al PAGADOR (cuenta BBVA) y no es la ref. libre del SPEI? */
export const esIdPagador = (numRef?: string) => (numRef ?? '').length >= 9

/** Clasificación automática de un ABONO (el usuario la puede cambiar). */
export function classify(concept: string, amount: number): BankTxCategory {
  const c = concept.toUpperCase()
  if (/SPEI DEVUELTO/.test(c)) return 'devolucion'
  if (/TERMINALES PUNTO DE VENTA|^VENTAS (DEBITO|CREDITO)/.test(c)) return 'tpv'
  if (/^DEPOSITO EN EFECTIVO/.test(c)) return 'efectivo'
  if (amount < 1) return 'prueba'
  return 'cliente'
}

/** Pistas que el cliente dejó en la transferencia: folio de factura, cotización, OC… */
export function hintsOf(detail?: string, numRef?: string): string[] {
  const out: string[] = []
  detail = detail ?? ''
  numRef = numRef ?? ''
  const d = ` ${detail} `
  const add = (v?: string) => { if (v && !out.includes(v)) out.push(v) }
  let m: RegExpMatchArray | null
  if ((m = d.match(/\b(?:F|FAC|FACT|FACTURA)\s*[-.]?\s*(\d{3,5})\b/i))) add(`F${m[1]}`)
  if ((m = d.match(/\bCOT(?:IZACION|IZACIÓN)?\s*[-.]?\s*(\d{3,6})\b/i))) add(`COT ${m[1]}`)
  if ((m = d.match(/\b(?:OC|PO)\s*[-.]?\s*([0-9A-Z]{4,})\b/i))) add(`OC ${m[1]}`)
  // Solo un número (ej. "1727"): casi siempre es el folio de la factura.
  if ((m = detail.trim().match(/^(\d{3,5})$/))) add(`#${m[1]}`)
  // Referencia numérica SPEI: los clientes suelen poner el folio de la factura (0001764 → F1764).
  // (Si parece fecha, 0250826, no se toma.)
  if (!esIdPagador(numRef) && (m = numRef.match(/^0{2,}(\d{3,5})$/)) && Number(m[1]) >= 100) add(`F${String(Number(m[1]))}`)
  return out
}

/** Lee el archivo probando UTF-8 y, si no es válido, Windows-1252 (BBVA exporta en ambos). */
export async function readBankFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) }
  catch { return new TextDecoder('windows-1252').decode(buf) }
}

/** Parsea el texto del .exp/.txt de BBVA. */
export async function parseBBVA(text: string): Promise<ParseResult> {
  const rows = text.split(/\r?\n/)
  const lines: ParsedBankLine[] = []
  let skipped = 0
  let headerOk = false
  for (const raw of rows) {
    if (!raw.trim()) continue
    const cols = raw.split('\t')
    if (!headerOk && /^d[ií]a/i.test(cols[0] ?? '')) { headerOk = true; continue }
    if (cols.length < 5) { skipped++; continue }
    const date = toISO(cols[0])
    if (!date) { skipped++; continue }
    const concept = cols[1].replace(/\s+/g, ' ').trim()
    const cargo = toNum(cols[2])
    const abono = toNum(cols[3])
    const balance = cols[4]?.trim() ? toNum(cols[4]) : undefined
    if (!cargo && !abono) { skipped++; continue }
    const kind: BankTxKind = abono > 0 ? 'abono' : 'cargo'
    const amount = abono > 0 ? abono : cargo
    const { bankFrom, reference, numRef, detail } = splitConcept(concept)
    const hash = await hashOf(['BBVA', date, concept, kind, amount.toFixed(2), balance != null ? balance.toFixed(2) : ''])
    lines.push({ date, kind, amount, balance, concept, detail, reference, numRef, bankFrom, category: kind === 'abono' ? classify(concept, amount) : 'no_aplica', hash, raw })
  }
  return { lines, skipped, headerOk }
}

/** Convierte un renglón parseado en el payload que espera IMPORT_BANK_TXS. */
export const toBankTxInput = (l: ParsedBankLine): BankTransactionInput => ({
  bank: 'BBVA', date: l.date, kind: l.kind, amount: l.amount, balance: l.balance,
  concept: l.concept, detail: l.detail, reference: l.reference, numRef: l.numRef, bankFrom: l.bankFrom,
  hash: l.hash, category: l.category, paymentCreated: false, notes: '',
})
