// ============================================================
//  Exportación de PROSPECTOS a Excel (.xlsx) con formato.
//  Usa ExcelJS (carga diferida) para encabezado con estilo, filtros, panel
//  congelado, formato de moneda/fecha y colores por resultado/calidad.
// ============================================================

/** Una fila de prospecto ya "aplanada" (con los campos calculados resueltos). */
export interface ProspectoRow {
  nombre: string
  empresa: string
  vendedor: string
  telefono: string
  correo: string
  ciudad: string
  sistema: string
  anuncio: string
  fechaAsignacion: string     // ISO 'YYYY-MM-DD' o ''
  estado: string
  ultimoContacto: string      // ISO 'YYYY-MM-DD' o ''
  seguimiento: string         // "Al día", "3 días"…
  resultado: string           // En espera / Vendido / Perdido
  costo: number | null
  calidad: string             // Caliente / Bueno / Tibio / Frío / Sin evaluar
  puntaje: string             // "21/25" o ""
  convertido: string          // código del proyecto o ""
  comentarios: number
  notas: string
}

/* ---- Agregación + gráficas (imágenes) para la hoja "Resumen" ---- */
type Agg = { label: string; count: number; costo: number }
const aggBy = (rows: ProspectoRow[], keyFn: (r: ProspectoRow) => string): Agg[] => {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    const k = (keyFn(r) || '').trim() || '(Sin dato)'
    const cur = m.get(k) || { label: k, count: 0, costo: 0 }
    cur.count++; cur.costo += r.costo || 0
    m.set(k, cur)
  }
  return [...m.values()]
}
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Dibuja una gráfica de barras horizontales y la devuelve como base64 PNG (sin prefijo). */
function barChartPng(title: string, data: Agg[], value: (a: Agg) => number, fmt: (n: number) => string, color: string): string {
  const scale = 2
  const rowH = 26, padTop = 44, padBottom = 14
  const W = 500, H = padTop + data.length * rowH + padBottom
  const c = document.createElement('canvas')
  c.width = W * scale; c.height = H * scale
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1b2230'; ctx.font = 'bold 14px Calibri, Arial, sans-serif'
  ctx.fillText(title, 14, 22)
  const labelW = 150, chartX = labelW + 14, chartW = W - chartX - 62
  const max = Math.max(1, ...data.map(value))
  let y = padTop
  for (const d of data) {
    const v = value(d)
    ctx.font = '11px Calibri, Arial, sans-serif'; ctx.textAlign = 'left'
    ctx.fillStyle = '#475467'; ctx.fillText(trunc(d.label, 24), 14, y + rowH / 2 - 2)
    const bw = Math.max(2, (v / max) * chartW)
    ctx.fillStyle = color
    const bh = 15, by = y + (rowH - bh) / 2 - 2, rad = 3
    ctx.beginPath()
    ctx.moveTo(chartX + rad, by)
    ctx.arcTo(chartX + bw, by, chartX + bw, by + bh, rad)
    ctx.arcTo(chartX + bw, by + bh, chartX, by + bh, rad)
    ctx.arcTo(chartX, by + bh, chartX, by, rad)
    ctx.arcTo(chartX, by, chartX + bw, by, rad)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#1b2230'; ctx.font = 'bold 11px Calibri, Arial, sans-serif'
    ctx.fillText(fmt(v), chartX + bw + 6, y + rowH / 2 - 2)
    y += rowH
  }
  return c.toDataURL('image/png').split(',')[1]
}

const isoToDate = (s: string): Date | null => {
  if (!s) return null
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// Colores (ARGB) por resultado y calidad, para pintar esas celdas.
const RESULTADO_FILL: Record<string, string> = {
  'En espera': 'FFFFF3CD', Vendido: 'FFD4EDDA', Perdido: 'FFF8D7DA',
}
const CALIDAD_FILL: Record<string, string> = {
  Caliente: 'FFF8D7DA', Bueno: 'FFD4EDDA', Tibio: 'FFFFF3CD', 'Frío': 'FFE2E3E5',
}

/** Genera y descarga el Excel de prospectos. `meta` describe los filtros aplicados. */
export async function exportProspectosExcel(rows: ProspectoRow[], meta: { subtitulo: string; hoy: string }): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CC Racks CRM'
  wb.created = new Date(meta.hoy + 'T12:00:00')
  const ws = wb.addWorksheet('Prospectos', {
    views: [{ state: 'frozen', ySplit: 4 }],   // congela el título + encabezado
    pageSetup: { fitToPage: true, orientation: 'landscape' },
  })

  const cols: { header: string; key: keyof ProspectoRow | 'iva'; width: number; kind?: 'money' | 'date' | 'num' }[] = [
    { header: 'Nombre', key: 'nombre', width: 26 },
    { header: 'Empresa', key: 'empresa', width: 22 },
    { header: 'Vendedor', key: 'vendedor', width: 22 },
    { header: 'Teléfono', key: 'telefono', width: 15 },
    { header: 'Correo', key: 'correo', width: 24 },
    { header: 'Ciudad', key: 'ciudad', width: 16 },
    { header: 'Sistema', key: 'sistema', width: 14 },
    { header: 'Anuncio', key: 'anuncio', width: 20 },
    { header: 'Fecha asignación', key: 'fechaAsignacion', width: 16, kind: 'date' },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Último contacto', key: 'ultimoContacto', width: 15, kind: 'date' },
    { header: 'Seguimiento', key: 'seguimiento', width: 13 },
    { header: 'Resultado', key: 'resultado', width: 13 },
    { header: 'Costo (MXN)', key: 'costo', width: 16, kind: 'money' },
    { header: 'Calidad', key: 'calidad', width: 13 },
    { header: 'Puntaje', key: 'puntaje', width: 9 },
    { header: 'Proyecto', key: 'convertido', width: 14 },
    { header: 'Comentarios', key: 'comentarios', width: 12, kind: 'num' },
    { header: 'Notas', key: 'notas', width: 40 },
  ]
  const nCols = cols.length

  // --- Fila 1: título ---
  ws.mergeCells(1, 1, 1, nCols)
  const tCell = ws.getCell(1, 1)
  tCell.value = 'CC RACKS · Prospectos'
  tCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1B2230' } }
  tCell.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 24

  // --- Fila 2: subtítulo (filtros + fecha + total) ---
  ws.mergeCells(2, 1, 2, nCols)
  const sCell = ws.getCell(2, 1)
  const totalCosto = rows.reduce((a, r) => a + (r.costo || 0), 0)
  sCell.value = `${meta.subtitulo}  ·  ${rows.length} prospecto${rows.length === 1 ? '' : 's'}  ·  Costo total ${totalCosto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}  ·  Generado ${meta.hoy}`
  sCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF667085' } }
  ws.getRow(3).height = 4   // separador

  // --- Fila 4: encabezado ---
  const headRow = ws.getRow(4)
  cols.forEach((c, i) => {
    const cell = headRow.getCell(i + 1)
    cell.value = c.header
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FEB' } }
    cell.alignment = { vertical: 'middle', horizontal: c.kind === 'money' || c.kind === 'num' ? 'right' : 'left' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF1B4FB0' } } }
  })
  headRow.height = 20
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: nCols } }

  // --- Datos ---
  rows.forEach((r, idx) => {
    const row = ws.getRow(5 + idx)
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      const raw = r[c.key as keyof ProspectoRow]
      if (c.kind === 'money') {
        cell.value = r.costo == null ? null : r.costo
        cell.numFmt = '$#,##0.00'
        cell.alignment = { horizontal: 'right' }
      } else if (c.kind === 'date') {
        const d = isoToDate(String(raw || ''))
        cell.value = d
        cell.numFmt = 'dd/mm/yyyy'
      } else if (c.kind === 'num') {
        cell.value = Number(raw) || 0
        cell.alignment = { horizontal: 'right' }
      } else {
        cell.value = raw === '' || raw == null ? null : String(raw)
        cell.alignment = { vertical: 'top', wrapText: c.key === 'notas' }
      }
      cell.font = { name: 'Calibri', size: 10 }
    })
    // Zebra + colores por resultado/calidad.
    if (idx % 2 === 1) {
      for (let i = 1; i <= nCols; i++) {
        const cell = row.getCell(i)
        if (!cell.fill || cell.fill.type !== 'pattern') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } }
      }
    }
    const resFill = RESULTADO_FILL[r.resultado]
    if (resFill) row.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: resFill } }
    const calFill = CALIDAD_FILL[r.calidad]
    if (calFill) row.getCell(15).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: calFill } }
  })

  // --- Fila de totales ---
  const totalRowIdx = 5 + rows.length
  const totRow = ws.getRow(totalRowIdx)
  totRow.getCell(13).value = 'TOTAL'
  totRow.getCell(13).font = { bold: true }
  totRow.getCell(13).alignment = { horizontal: 'right' }
  const costoCell = totRow.getCell(14)
  costoCell.value = { formula: `SUM(N5:N${totalRowIdx - 1})`, result: totalCosto }
  costoCell.numFmt = '$#,##0.00'
  costoCell.font = { bold: true }
  for (let i = 1; i <= nCols; i++) totRow.getCell(i).border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } } }

  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

  // ============================================================
  //  Hoja "Resumen": tablas agregadas + gráficas (imágenes).
  // ============================================================
  const rs = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] })
  rs.getColumn(1).width = 26; rs.getColumn(2).width = 14; rs.getColumn(3).width = 18
  rs.getColumn(4).width = 3
  const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

  rs.mergeCells('A1:C1')
  const rt = rs.getCell('A1')
  rt.value = 'CC RACKS · Resumen de prospectos'
  rt.font = { size: 15, bold: true, color: { argb: 'FF1B2230' } }
  rs.mergeCells('A2:C2')
  rs.getCell('A2').value = `${meta.subtitulo}  ·  ${rows.length} prospecto${rows.length === 1 ? '' : 's'}  ·  ${money(totalCosto)}`
  rs.getCell('A2').font = { size: 10, color: { argb: 'FF667085' } }

  const sortByCount = (a: Agg[]) => [...a].sort((x, y) => y.count - x.count)
  const sortByCosto = (a: Agg[]) => [...a].sort((x, y) => y.costo - x.costo)

  // Cada sección: tabla (izquierda) + su gráfica (derecha), apiladas.
  const secciones: { titulo: string; data: Agg[]; chartVal: 'count' | 'costo'; color: string }[] = [
    { titulo: 'Por resultado', data: sortByCount(aggBy(rows, r => r.resultado)), chartVal: 'count', color: 'FF2F6FEB' },
    { titulo: 'Por vendedor', data: sortByCount(aggBy(rows, r => r.vendedor)).slice(0, 12), chartVal: 'count', color: 'FF16A34A' },
    { titulo: 'Por anuncio (origen)', data: sortByCount(aggBy(rows, r => r.anuncio)).slice(0, 12), chartVal: 'count', color: 'FF9333EA' },
    { titulo: 'Costo por sistema', data: sortByCosto(aggBy(rows, r => r.sistema)).slice(0, 12), chartVal: 'costo', color: 'FFF59E0B' },
  ]

  let row = 4
  for (const s of secciones) {
    // Encabezado de la sección.
    rs.mergeCells(row, 1, row, 3)
    const h = rs.getCell(row, 1)
    h.value = s.titulo
    h.font = { size: 12, bold: true, color: { argb: 'FF1B2230' } }
    h.border = { bottom: { style: 'thin', color: { argb: 'FF2F6FEB' } } }
    row++
    // Encabezado de tabla.
    const th = rs.getRow(row)
    th.getCell(1).value = s.titulo.replace('Por ', '').replace('Costo por ', '').replace(/^./, c => c.toUpperCase())
    th.getCell(2).value = 'Prospectos'
    th.getCell(3).value = 'Costo'
    ;[1, 2, 3].forEach(i => {
      const cell = th.getCell(i)
      cell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667085' } }
      cell.alignment = { horizontal: i === 1 ? 'left' : 'right' }
    })
    const tableTopRow = row
    row++
    for (const d of s.data) {
      const r2 = rs.getRow(row)
      r2.getCell(1).value = d.label
      r2.getCell(2).value = d.count
      r2.getCell(2).alignment = { horizontal: 'right' }
      r2.getCell(3).value = d.costo
      r2.getCell(3).numFmt = '$#,##0.00'
      r2.getCell(1).font = r2.getCell(2).font = r2.getCell(3).font = { size: 10 }
      row++
    }
    // Total de la sección.
    const rTot = rs.getRow(row)
    rTot.getCell(1).value = 'Total'
    rTot.getCell(2).value = s.data.reduce((a, d) => a + d.count, 0)
    rTot.getCell(3).value = s.data.reduce((a, d) => a + d.costo, 0)
    rTot.getCell(3).numFmt = '$#,##0.00'
    ;[1, 2, 3].forEach(i => { rTot.getCell(i).font = { bold: true, size: 10 }; rTot.getCell(i).border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } } } })

    // Gráfica a la derecha de la tabla (columna E).
    if (s.data.length) {
      const png = s.chartVal === 'count'
        ? barChartPng(s.titulo, s.data, d => d.count, n => String(n), s.color)
        : barChartPng(s.titulo, s.data, d => d.costo, money, s.color)
      const imgId = wb.addImage({ base64: png, extension: 'png' })
      const chartRows = 44 + s.data.length * 26 + 14   // alto en px del canvas
      rs.addImage(imgId, {
        tl: { col: 4.2, row: tableTopRow - 1 },
        ext: { width: 500, height: chartRows },
      })
    }
    // Espacio para que la siguiente sección no choque con la gráfica.
    row = Math.max(row + 2, tableTopRow + Math.ceil((44 + s.data.length * 26 + 14) / 18) + 2)
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Prospectos_${meta.hoy}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
