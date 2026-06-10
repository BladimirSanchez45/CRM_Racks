// ============================================================
//  Importación de materiales desde el Excel del cotizador.
//  Lee la hoja "Cotizador Selectivo" y devuelve las partidas.
//  Lo usan la OC (Órdenes de compra) y las Remisiones de salida.
// ============================================================
import { uid } from './data'
import type { OcItem } from './types'

/** Importa materiales desde el Excel (hoja "Cotizador Selectivo") como partidas de OC.
 *  Mismo formato del cotizador que usan tanto la OC como las remisiones. */
export async function importMaterialsFromExcel(file: File): Promise<OcItem[]> {
  const XLSX = await import('xlsx')            // carga diferida (no infla el bundle)
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = wb.SheetNames.find(n => /cotizador\s*selectivo/i.test(n))
  if (!sheetName) throw new Error('El Excel no tiene la hoja "Cotizador Selectivo".')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' })
  const items: OcItem[] = []
  let inTable = false
  for (const r of rows) {
    const parte = String(r[0] ?? '').trim().toLowerCase()
    const material = String(r[3] ?? '').trim()
    if (parte === 'parte' && material.toLowerCase() === 'material') { inTable = true; continue } // encabezado de tabla
    if (!inTable) continue
    const qty = Number(r[2])
    if (!material || !Number.isFinite(qty) || qty <= 0) { inTable = false; continue }            // fin de la tabla
    items.push({
      id: uid('it'),
      parte: String(r[0] ?? '').trim(),
      color: String(r[1] ?? '').trim(),
      material,
      description: String(r[4] ?? '').trim(),
      dimensiones: r[5] === '' || r[5] == null ? '' : String(r[5]).trim(),
      qty: Math.round(qty * 100) / 100,
      unitPrice: 0,
    })
  }
  if (!items.length) throw new Error('No se encontraron materiales en la hoja.')
  return items
}
