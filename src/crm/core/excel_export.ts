// ============================================================
//  ExcelJS compartido: carga diferida del módulo + descarga del .xlsx.
//  Lo usan los exportadores (ventas, prospectos). Si la carga del módulo
//  falla (lo típico: la pestaña quedó abierta de ANTES de un deploy y el
//  chunk con hash viejo ya no existe en el servidor), el error lo dice
//  claro para que el usuario recargue, en vez de un "no se pudo" sin pista.
//  (La IMPORTACIÓN de materiales con la librería xlsx vive en excel.ts.)
// ============================================================
import type ExcelJS from 'exceljs'

/** Carga ExcelJS bajo demanda (es pesado: no va en el bundle principal). */
export async function loadExcelJS(): Promise<typeof ExcelJS> {
  try {
    return (await import('exceljs')).default
  } catch (e) {
    console.error('[excel] no se pudo cargar el módulo exceljs', e)
    throw new Error('No se pudo cargar el módulo de Excel. Suele pasar cuando hay una versión nueva del CRM: recarga la página (F5) e inténtalo de nuevo.')
  }
}

/** Descarga un workbook ya armado como archivo .xlsx. */
export async function descargarXlsx(wb: ExcelJS.Workbook, nombre: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** Texto para el aviso al usuario: incluye el motivo real para poder diagnosticar. */
export const excelErrorMsg = (err: unknown) =>
  `No se pudo generar el Excel.\n\n${err instanceof Error ? err.message : String(err)}`
