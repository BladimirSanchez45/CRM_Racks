// ============================================================
//  Exportación de VENTAS DEL MES a Excel (.xlsx) con formato.
//  Usa ExcelJS (carga diferida). Dos hojas: "Resumen" (meta, avance
//  y desglose por vendedor, con gráfica) y "Ventas" (una fila por
//  venta registrada en el mes).
// ============================================================

/** Una venta registrada (proyecto creado en el mes), ya "aplanada". */
export interface VentaRow {
  fecha: string        // ISO 'YYYY-MM-DD'
  proyecto: string     // código PRY-…
  cliente: string
  vendedor: string
  sistema: string
  origen: string
  etapa: string
  monto: number        // subtotal de la venta (sin IVA)
}

/** Resumen de un vendedor en el mes. */
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
  ym: string             // 'YYYY-MM'
  ymLabel: string        // "Agosto 2026"
  hoy: string            // ISO de hoy (fecha de generación)
  meta: number
  vendido: number
  vendedores: VendedorRow[]
  rows: VentaRow[]
}): Promise<void> {
  const { ym, ymLabel, hoy, meta, vendido, vendedores, rows } = opts
  const ExcelJS = (await import('exceljs')).default
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
    ['Meta del mes', meta, '$#,##0.00'],
    ['Vendido', vendido, '$#,##0.00'],
    ['Falta para la meta', falta, '$#,##0.00'],
    ['Avance', avance, '0.0%'],
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
  //  Hoja "Ventas": una fila por venta registrada en el mes.
  // ============================================================
  const ws = wb.addWorksheet('Ventas', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { fitToPage: true, orientation: 'landscape' },
  })
  const cols: { header: string; width: number; kind?: 'money' | 'date' }[] = [
    { header: 'Fecha', width: 13, kind: 'date' },
    { header: 'Proyecto', width: 15 },
    { header: 'Cliente', width: 30 },
    { header: 'Vendedor', width: 22 },
    { header: 'Sistema', width: 18 },
    { header: 'Origen', width: 18 },
    { header: 'Etapa', width: 18 },
    { header: 'Venta (subtotal MXN)', width: 20, kind: 'money' },
  ]
  const nCols = cols.length

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
    cell.alignment = { vertical: 'middle', horizontal: c.kind === 'money' ? 'right' : 'left' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF1B4FB0' } } }
  })
  headRow.height = 20
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: nCols } }

  rows.forEach((r, idx) => {
    const row2 = ws.getRow(5 + idx)
    const values: (string | number | Date | null)[] = [
      isoToDate(r.fecha), r.proyecto, r.cliente, r.vendedor, r.sistema || null, r.origen || null, r.etapa, r.monto,
    ]
    values.forEach((v, i) => {
      const cell = row2.getCell(i + 1)
      cell.value = v
      cell.font = { name: 'Calibri', size: 10 }
      if (cols[i].kind === 'money') { cell.numFmt = '$#,##0.00'; cell.alignment = { horizontal: 'right' } }
      if (cols[i].kind === 'date') cell.numFmt = 'dd/mm/yyyy'
    })
    if (idx % 2 === 1) {
      for (let i = 1; i <= nCols; i++) {
        row2.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } }
      }
    }
  })

  const totalRowIdx = 5 + rows.length
  const totRow = ws.getRow(totalRowIdx)
  totRow.getCell(nCols - 1).value = 'TOTAL'
  totRow.getCell(nCols - 1).font = { bold: true }
  totRow.getCell(nCols - 1).alignment = { horizontal: 'right' }
  const totCell = totRow.getCell(nCols)
  totCell.value = { formula: `SUM(H5:H${totalRowIdx - 1})`, result: vendido }
  totCell.numFmt = '$#,##0.00'
  totCell.font = { bold: true }
  for (let i = 1; i <= nCols; i++) totRow.getCell(i).border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Ventas_${ym}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
