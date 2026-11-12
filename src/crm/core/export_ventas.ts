// ============================================================
//  Exportación de VENTAS DEL MES a Excel (.xlsx) con formato.
//  Usa ExcelJS (carga diferida). Hojas: "Resumen" (meta, avance y
//  desglose por vendedor, con gráfica), "Por mes" (solo si el archivo
//  abarca varios meses: meta y vendido de cada uno) y "Ventas" (una
//  fila por venta registrada en el periodo, con las fechas del prospecto
//  de origen cuando la venta nació de uno).
// ============================================================

import { loadExcelJS, descargarXlsx } from './excel_export'

/** Una venta registrada (proyecto creado en el mes), ya "aplanada". */
export interface VentaRow {
  fecha: string        // ISO 'YYYY-MM-DD'
  proyecto: string     // código PRY-…
  division: string        // CC Racks / Racks Tapatíos
  cliente: string
  region: string       // estado de la república (entidad)
  ciudad: string       // ciudad destino
  vendedor: string
  sistema: string
  origen: string
  anuncio: string      // anuncio individual de la campaña CTC (CCMR 101…) o ''
  etapa: string
  // Proceso comercial, leído del prospecto ligado (vacío si el proyecto se registró directo).
  prospectoAlta: string        // alta del prospecto (fecha de origen) ISO 'YYYY-MM-DD'
  prospectoAsignacion: string  // fecha de asignación del prospecto ISO 'YYYY-MM-DD'
  diasCierre: number | null    // días de la asignación (o alta) al registro de la venta
  monto: number        // subtotal de la venta (sin IVA)
  // Solo cuando se exporta CON utilidad (admin y autorizados): ver canExportUtilidad.
  iva?: number         // IVA 16% de la venta
  total?: number       // total con IVA
  costos?: number      // compras + pagos internos + movimientos, a subtotal (sin IVA); solo con conCostos
  utilidad?: number    // utilidad sin IVA = monto − costos (misma fórmula que la ficha del proyecto)
}

/** Un mes del periodo (para la hoja "Por mes" cuando se exporta un rango). */
export interface MesRow {
  ym: string           // 'YYYY-MM'
  label: string        // "Agosto 2026"
  meta: number
  vendido: number
  ventas: number       // número de ventas
}

/** Resumen de un vendedor en el periodo. */
export interface VendedorRow {
  vendedor: string
  ventas: number
  total: number
  ticket: number       // promedio por venta
  metaPersonal: number
  pctMeta: number      // % de su meta personal
  pctEquipo: number    // % del total vendido por el equipo
}

const isoToDate = (s: string): Date | null => {
  if (!s) return null
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

/** Barras horizontales (vendido por vendedor) como base64 PNG, para la hoja Resumen. */
function barChartPng(title: string, rows: VendedorRow[]): string {
  const scale = 2
  const rowH = 26, padTop = 44, padBottom = 14
  const W = 500, H = padTop + rows.length * rowH + padBottom
  const c = document.createElement('canvas')
  c.width = W * scale; c.height = H * scale
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1b2230'; ctx.font = 'bold 14px Calibri, Arial, sans-serif'
  ctx.fillText(title, 14, 22)
  const labelW = 150, chartX = labelW + 14, chartW = W - chartX - 92
  const max = Math.max(1, ...rows.map(r => r.total), ...rows.map(r => r.metaPersonal))
  let y = padTop
  for (const r of rows) {
    ctx.font = '11px Calibri, Arial, sans-serif'; ctx.textAlign = 'left'
    ctx.fillStyle = '#475467'
    ctx.fillText(r.vendedor.length > 24 ? r.vendedor.slice(0, 23) + '…' : r.vendedor, 14, y + rowH / 2 - 2)
    const bh = 15, by = y + (rowH - bh) / 2 - 2
    // riel de la meta personal (fondo gris) + barra de lo vendido encima
    ctx.fillStyle = '#e5e9f0'
    ctx.fillRect(chartX, by, Math.max(2, (r.metaPersonal / max) * chartW), bh)
    ctx.fillStyle = r.total >= r.metaPersonal && r.metaPersonal > 0 ? '#16a34a' : '#2f6feb'
    ctx.fillRect(chartX, by, Math.max(r.total > 0 ? 2 : 0, (r.total / max) * chartW), bh)
    ctx.fillStyle = '#1b2230'; ctx.font = 'bold 11px Calibri, Arial, sans-serif'
    ctx.fillText(`${money(r.total)} (${r.pctMeta.toFixed(0)}%)`, chartX + Math.max(2, (r.metaPersonal / max) * chartW) + 6, y + rowH / 2 - 2)
    y += rowH
  }
  return c.toDataURL('image/png').split(',')[1]
}

/** Genera y descarga el Excel de ventas del mes. */
export async function exportVentasExcel(opts: {
  ym: string             // 'YYYY-MM' o 'YYYY-MM_a_YYYY-MM' (va en el nombre del archivo)
  ymLabel: string        // "Agosto 2026" / "Agosto – Octubre 2026"
  hoy: string            // ISO de hoy (fecha de generación)
  meta: number           // meta del periodo (suma de las metas mensuales si es un rango)
  vendido: number
  /** Agrega IVA, total, utilidad y margen por proyecto (y utilidad del periodo en Resumen).
   *  Solo para quien pasa canExportUtilidad; las filas deben traer esos campos. */
  conUtilidad?: boolean
  /** Agrega también la columna "Costos (sin IVA)" (lo que se rebaja). Solo admin
   *  (canExportCostos); los demás autorizados ven la utilidad sin ese desglose. */
  conCostos?: boolean
  vendedores: VendedorRow[]
  rows: VentaRow[]
  /** Desglose mensual; con más de un mes se agrega la hoja "Por mes". */
  meses?: MesRow[]
}): Promise<void> {
  const { ym, ymLabel, hoy, meta, vendido, vendedores, rows, meses = [], conUtilidad = false } = opts
  const conCostos = conUtilidad && !!opts.conCostos
  const utilidadPeriodo = rows.reduce((a, r) => a + (r.utilidad || 0), 0)
  const esRango = meses.length > 1
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CC Racks CRM'
  wb.created = new Date(hoy + 'T12:00:00')

  // ============================================================
  //  Hoja "Resumen": meta del mes + desglose por vendedor.
  // ============================================================
  const rs = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] })
  rs.getColumn(1).width = 26
  ;[2, 3, 4, 5, 6, 7].forEach(i => { rs.getColumn(i).width = 15 })

  rs.mergeCells('A1:G1')
  const rt = rs.getCell('A1')
  rt.value = `CC RACKS · Ventas de ${ymLabel}`
  rt.font = { size: 15, bold: true, color: { argb: 'FF1B2230' } }
  rs.mergeCells('A2:G2')
  rs.getCell('A2').value = `${rows.length} venta${rows.length === 1 ? '' : 's'} registrada${rows.length === 1 ? '' : 's'}  ·  Generado ${hoy}`
  rs.getCell('A2').font = { size: 10, color: { argb: 'FF667085' } }

  // --- Bloque de meta ---
  const falta = Math.max(0, meta - vendido)
  const avance = meta > 0 ? vendido / meta : 0
  const metaBlock: [string, number | string, string?][] = [
    [esRango ? `Meta del periodo (${meses.length} meses)` : 'Meta del mes', meta, '$#,##0.00'],
    ['Vendido', vendido, '$#,##0.00'],
    ['Falta para la meta', falta, '$#,##0.00'],
    ['Avance', avance, '0.0%'],
    ...(conUtilidad ? [
      ['Utilidad (sin IVA)', utilidadPeriodo, '$#,##0.00'] as [string, number, string],
      ['Margen sobre venta', vendido > 0 ? utilidadPeriodo / vendido : 0, '0.0%'] as [string, number, string],
    ] : []),
  ]
  let row = 4
  for (const [label, value, fmt] of metaBlock) {
    rs.getCell(row, 1).value = label
    rs.getCell(row, 1).font = { size: 11, bold: true, color: { argb: 'FF475467' } }
    const c = rs.getCell(row, 2)
    c.value = value as number
    if (fmt) c.numFmt = fmt
    c.font = { size: 11, bold: true }
    c.alignment = { horizontal: 'right' }
    row++
  }

  // --- Tabla por vendedor ---
  row += 1
  rs.mergeCells(row, 1, row, 7)
  const h = rs.getCell(row, 1)
  h.value = 'Desglose por vendedor'
  h.font = { size: 12, bold: true, color: { argb: 'FF1B2230' } }
  h.border = { bottom: { style: 'thin', color: { argb: 'FF2F6FEB' } } }
  row++
  const headers = ['Vendedor', 'Ventas', 'Total vendido', 'Ticket prom.', 'Meta personal', '% de su meta', '% del equipo']
  const th = rs.getRow(row)
  headers.forEach((label, i) => {
    const cell = th.getCell(i + 1)
    cell.value = label
    cell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FEB' } }
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right' }
  })
  row++
  for (const v of vendedores) {
    const r2 = rs.getRow(row)
    r2.getCell(1).value = v.vendedor
    r2.getCell(2).value = v.ventas
    r2.getCell(3).value = v.total
    r2.getCell(3).numFmt = '$#,##0.00'
    r2.getCell(4).value = v.ticket
    r2.getCell(4).numFmt = '$#,##0.00'
    r2.getCell(5).value = v.metaPersonal
    r2.getCell(5).numFmt = '$#,##0.00'
    r2.getCell(6).value = v.pctMeta / 100
    r2.getCell(6).numFmt = '0.0%'
    r2.getCell(7).value = v.pctEquipo / 100
    r2.getCell(7).numFmt = '0.0%'
    for (let i = 1; i <= 7; i++) {
      r2.getCell(i).font = { size: 10 }
      if (i > 1) r2.getCell(i).alignment = { horizontal: 'right' }
    }
    // verde si cumplió su meta personal
    if (v.metaPersonal > 0 && v.total >= v.metaPersonal) {
      r2.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } }
    }
    row++
  }
  const rTot = rs.getRow(row)
  rTot.getCell(1).value = 'Total'
  rTot.getCell(2).value = vendedores.reduce((a, v) => a + v.ventas, 0)
  rTot.getCell(3).value = vendido
  rTot.getCell(3).numFmt = '$#,##0.00'
  for (let i = 1; i <= 7; i++) {
    rTot.getCell(i).font = { bold: true, size: 10 }
    rTot.getCell(i).border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
    if (i > 1) rTot.getCell(i).alignment = { horizontal: 'right' }
  }

  // --- Gráfica: vendido vs meta personal por vendedor ---
  if (vendedores.length) {
    const png = barChartPng(`Vendido vs meta personal · ${ymLabel}`, vendedores)
    const imgId = wb.addImage({ base64: png, extension: 'png' })
    rs.addImage(imgId, {
      tl: { col: 0, row: row + 2 },
      ext: { width: 500, height: 44 + vendedores.length * 26 + 14 },
    })
  }

  // ============================================================
  //  Hoja "Por mes" (solo rangos): meta, vendido, falta y avance de cada mes.
  // ============================================================
  if (esRango) {
    const pm = wb.addWorksheet('Por mes', { views: [{ showGridLines: false }] })
    pm.getColumn(1).width = 20
    ;[2, 3, 4, 5, 6].forEach(i => { pm.getColumn(i).width = 16 })
    pm.mergeCells('A1:F1')
    pm.getCell('A1').value = `CC RACKS · Ventas por mes · ${ymLabel}`
    pm.getCell('A1').font = { size: 15, bold: true, color: { argb: 'FF1B2230' } }
    pm.mergeCells('A2:F2')
    pm.getCell('A2').value = `${meses.length} meses  ·  Vendido ${money(vendido)}  ·  Meta ${money(meta)}  ·  Generado ${hoy}`
    pm.getCell('A2').font = { size: 10, color: { argb: 'FF667085' } }
    const hdr = ['Mes', 'Ventas', 'Vendido', 'Meta', 'Falta', 'Avance']
    const hr = pm.getRow(4)
    hdr.forEach((label, i) => {
      const cell = hr.getCell(i + 1)
      cell.value = label
      cell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FEB' } }
      cell.alignment = { horizontal: i === 0 ? 'left' : 'right' }
    })
    let r = 5
    for (const m of meses) {
      const rr = pm.getRow(r)
      rr.getCell(1).value = m.label
      rr.getCell(2).value = m.ventas
      rr.getCell(3).value = m.vendido
      rr.getCell(4).value = m.meta
      rr.getCell(5).value = Math.max(0, m.meta - m.vendido)
      rr.getCell(6).value = m.meta > 0 ? m.vendido / m.meta : 0
      ;[3, 4, 5].forEach(i => { rr.getCell(i).numFmt = '$#,##0.00' })
      rr.getCell(6).numFmt = '0.0%'
      for (let i = 1; i <= 6; i++) {
        rr.getCell(i).font = { size: 10 }
        if (i > 1) rr.getCell(i).alignment = { horizontal: 'right' }
      }
      // verde si ese mes cumplió su meta
      if (m.meta > 0 && m.vendido >= m.meta) rr.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } }
      r++
    }
    const tt = pm.getRow(r)
    tt.getCell(1).value = 'Total'
    tt.getCell(2).value = meses.reduce((a, m) => a + m.ventas, 0)
    tt.getCell(3).value = vendido
    tt.getCell(4).value = meta
    tt.getCell(5).value = Math.max(0, meta - vendido)
    tt.getCell(6).value = meta > 0 ? vendido / meta : 0
    ;[3, 4, 5].forEach(i => { tt.getCell(i).numFmt = '$#,##0.00' })
    tt.getCell(6).numFmt = '0.0%'
    for (let i = 1; i <= 6; i++) {
      tt.getCell(i).font = { bold: true, size: 10 }
      tt.getCell(i).border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
      if (i > 1) tt.getCell(i).alignment = { horizontal: 'right' }
    }
    // Gráfica: vendido vs meta por mes.
    const png = barChartPng(`Vendido vs meta · ${ymLabel}`, meses.map(m => ({
      vendedor: m.label, ventas: m.ventas, total: m.vendido, ticket: 0, metaPersonal: m.meta,
      pctMeta: m.meta > 0 ? (m.vendido / m.meta) * 100 : 0, pctEquipo: 0,
    })))
    const imgId = wb.addImage({ base64: png, extension: 'png' })
    pm.addImage(imgId, { tl: { col: 0, row: r + 2 }, ext: { width: 500, height: 44 + meses.length * 26 + 14 } })
  }

  // ============================================================
  //  Hoja "Ventas": una fila por venta registrada en el periodo.
  // ============================================================
  const ws = wb.addWorksheet('Ventas', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { fitToPage: true, orientation: 'landscape' },
  })
  type ColKey = keyof VentaRow | 'margen'
  const cols: { header: string; key: ColKey; width: number; kind?: 'money' | 'date' | 'pct' | 'int' }[] = [
    { header: 'Fecha', key: 'fecha', width: 13, kind: 'date' },
    { header: 'Proyecto', key: 'proyecto', width: 15 },
    { header: 'División', key: 'division', width: 15 },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Región', key: 'region', width: 18 },
    { header: 'Ciudad', key: 'ciudad', width: 18 },
    { header: 'Vendedor', key: 'vendedor', width: 22 },
    { header: 'Sistema', key: 'sistema', width: 18 },
    { header: 'Origen', key: 'origen', width: 18 },
    { header: 'Núm. anuncio', key: 'anuncio', width: 13 },
    { header: 'Alta prospecto', key: 'prospectoAlta', width: 15, kind: 'date' },
    { header: 'Asignación prospecto', key: 'prospectoAsignacion', width: 19, kind: 'date' },
    { header: 'Días a cierre', key: 'diasCierre', width: 13, kind: 'int' },
    { header: 'Etapa', key: 'etapa', width: 18 },
    { header: 'Venta (subtotal MXN)', key: 'monto', width: 20, kind: 'money' },
    // Columnas de utilidad: solo para admin y autorizados (canExportUtilidad).
    ...(conUtilidad ? [
      { header: 'IVA 16%', key: 'iva' as ColKey, width: 16, kind: 'money' as const },
      { header: 'Total con IVA', key: 'total' as ColKey, width: 18, kind: 'money' as const },
      ...(conCostos ? [{ header: 'Costos (sin IVA)', key: 'costos' as ColKey, width: 18, kind: 'money' as const }] : []),
      { header: 'Utilidad (sin IVA)', key: 'utilidad' as ColKey, width: 18, kind: 'money' as const },
      { header: 'Margen', key: 'margen' as ColKey, width: 10, kind: 'pct' as const },
    ] : []),
  ]
  const nCols = cols.length
  const colIdx = (key: ColKey) => cols.findIndex(c => c.key === key) + 1
  const letra = (i: number) => String.fromCharCode(64 + i)   // 1 → 'A' (hasta 26 columnas)

  ws.mergeCells(1, 1, 1, nCols)
  const tCell = ws.getCell(1, 1)
  tCell.value = `CC RACKS · Ventas de ${ymLabel}`
  tCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1B2230' } }
  tCell.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 24
  ws.mergeCells(2, 1, 2, nCols)
  ws.getCell(2, 1).value = `${rows.length} venta${rows.length === 1 ? '' : 's'}  ·  Total ${money(vendido)}  ·  Meta ${money(meta)}  ·  Generado ${hoy}`
  ws.getCell(2, 1).font = { name: 'Calibri', size: 10, color: { argb: 'FF667085' } }
  ws.getRow(3).height = 4

  const headRow = ws.getRow(4)
  cols.forEach((c, i) => {
    const cell = headRow.getCell(i + 1)
    cell.value = c.header
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FEB' } }
    cell.alignment = { vertical: 'middle', horizontal: c.kind === 'money' || c.kind === 'pct' || c.kind === 'int' ? 'right' : 'left' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF1B4FB0' } } }
  })
  headRow.height = 20
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: nCols } }

  rows.forEach((r, idx) => {
    const row2 = ws.getRow(5 + idx)
    const util = r.utilidad || 0
    const valor = (c: typeof cols[number]): string | number | Date | null => {
      switch (c.key) {
        case 'fecha': return isoToDate(r.fecha)
        case 'prospectoAlta': case 'prospectoAsignacion': return isoToDate(r[c.key])
        case 'diasCierre': return r.diasCierre
        case 'margen': return r.monto > 0 ? util / r.monto : null
        case 'monto': return r.monto
        case 'iva': case 'total': case 'costos': case 'utilidad': return r[c.key] ?? 0
        default: return r[c.key] || null
      }
    }
    cols.forEach((c, i) => {
      const cell = row2.getCell(i + 1)
      cell.value = valor(c)
      cell.font = { name: 'Calibri', size: 10 }
      if (c.kind === 'money') { cell.numFmt = '$#,##0.00'; cell.alignment = { horizontal: 'right' } }
      if (c.kind === 'pct') { cell.numFmt = '0.0%'; cell.alignment = { horizontal: 'right' } }
      if (c.kind === 'date') cell.numFmt = 'dd/mm/yyyy'
      if (c.kind === 'int') { cell.numFmt = '0'; cell.alignment = { horizontal: 'right' } }
      // Utilidad negativa en rojo (el proyecto deja pérdida).
      if ((c.key === 'utilidad' || c.key === 'margen') && util < 0) cell.font = { name: 'Calibri', size: 10, color: { argb: 'FFB42318' } }
    })
    if (idx % 2 === 1) {
      for (let i = 1; i <= nCols; i++) {
        row2.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } }
      }
    }
  })

  // Fila de totales: SUMA de cada columna de importe y, con utilidad, margen global (utilidad ÷ venta).
  const totalRowIdx = 5 + rows.length
  const totRow = ws.getRow(totalRowIdx)
  const cEtapa = colIdx('etapa')
  totRow.getCell(cEtapa).value = 'TOTAL'
  totRow.getCell(cEtapa).font = { bold: true }
  totRow.getCell(cEtapa).alignment = { horizontal: 'right' }
  const sumaDe = (key: keyof VentaRow) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
  for (const c of cols) {
    if (c.kind !== 'money') continue
    const i = colIdx(c.key), L = letra(i)
    const cell = totRow.getCell(i)
    cell.value = { formula: `SUM(${L}5:${L}${totalRowIdx - 1})`, result: sumaDe(c.key as keyof VentaRow) }
    cell.numFmt = '$#,##0.00'
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'right' }
  }
  if (conUtilidad) {
    const mCell = totRow.getCell(colIdx('margen'))
    const Lm = letra(colIdx('monto')), Lu = letra(colIdx('utilidad'))
    mCell.value = { formula: `IF(${Lm}${totalRowIdx}>0,${Lu}${totalRowIdx}/${Lm}${totalRowIdx},0)`, result: vendido > 0 ? utilidadPeriodo / vendido : 0 }
    mCell.numFmt = '0.0%'
    mCell.font = { bold: true }
    mCell.alignment = { horizontal: 'right' }
  }
  for (let i = 1; i <= nCols; i++) totRow.getCell(i).border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

  await descargarXlsx(wb, `Ventas_${ym}.xlsx`)
}
