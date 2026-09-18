// ============================================================
//  CONTEO DE LAYOUT — extracción de geometría de una página de PDF.
//  Recorre la lista de operaciones de pdf.js siguiendo la matriz de transformación
//  y los colores, y devuelve cada tramo recto con su color, más los textos.
//  No importa pdf.js en runtime (recibe la página y su tabla OPS), así sirve igual
//  en el navegador y en pruebas con Node.
// ============================================================
import type { PDFPageProxy } from 'pdfjs-dist'
import type { Seg, TextItem } from './detect'

type Mat = [number, number, number, number, number, number]
const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]
const ap = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// Códigos del buffer de trazos de pdf.js (DrawOPS).
const MOVE = 0, LINE = 1, CURVE = 2, QUAD = 3, CLOSE = 4

export async function extractPageGeometry(page: PDFPageProxy, OPS: Record<string, number>): Promise<{ segs: Seg[]; texts: TextItem[] }> {
  // Intent 'print': lista de operaciones aparte de la que usa el render en pantalla,
  // que reemplaza los buffers de trazos por Path2D al dibujar.
  const ol = await page.getOperatorList({ intent: 'print' })
  type St = { ctm: Mat; stroke: string; fill: string }
  let st: St = { ctm: [1, 0, 0, 1, 0, 0], stroke: '#000000', fill: '#000000' }
  const stack: St[] = []
  const segs: Seg[] = []
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke])
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]
    const args = ol.argsArray[i]
    switch (fn) {
      case OPS.save: stack.push({ ...st }); break
      case OPS.restore: st = stack.pop() ?? st; break
      case OPS.transform: st = { ...st, ctm: mul(st.ctm, args as Mat) }; break
      case OPS.paintFormXObjectBegin:
        stack.push({ ...st })
        if (Array.isArray(args?.[0])) st = { ...st, ctm: mul(st.ctm, args[0] as Mat) }
        break
      case OPS.paintFormXObjectEnd: st = stack.pop() ?? st; break
      case OPS.setStrokeRGBColor: if (typeof args?.[0] === 'string') st = { ...st, stroke: args[0] }; break
      case OPS.setFillRGBColor: if (typeof args?.[0] === 'string') st = { ...st, fill: args[0] }; break
      case OPS.constructPath: {
        const op = args?.[0] as number
        const buf = args?.[1]?.[0] as ArrayLike<number> | undefined
        if (!buf || typeof buf.length !== 'number') break
        const color = strokeOps.has(op) ? st.stroke : fillOps.has(op) ? st.fill : null
        if (!color) break   // trazo de recorte / sin pintar
        let cx = 0, cy = 0, sx = 0, sy = 0
        for (let k = 0; k < buf.length;) {
          const c = buf[k++]
          if (c === MOVE) { [cx, cy] = ap(st.ctm, buf[k], buf[k + 1]); sx = cx; sy = cy; k += 2 }
          else if (c === LINE) {
            const [x, y] = ap(st.ctm, buf[k], buf[k + 1])
            segs.push({ x1: cx, y1: cy, x2: x, y2: y, color }); cx = x; cy = y; k += 2
          }
          else if (c === CURVE) { [cx, cy] = ap(st.ctm, buf[k + 4], buf[k + 5]); k += 6 }
          else if (c === QUAD) { [cx, cy] = ap(st.ctm, buf[k + 2], buf[k + 3]); k += 4 }
          else if (c === CLOSE) { if (cx !== sx || cy !== sy) segs.push({ x1: cx, y1: cy, x2: sx, y2: sy, color }); cx = sx; cy = sy }
          else break
        }
        break
      }
    }
  }

  const tc = await page.getTextContent()
  const texts: TextItem[] = []
  for (const it of tc.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const [a, b, c, d, e, f] = it.transform as number[]
    const angle = Math.atan2(b, a), h = Math.hypot(c, d) || it.height || 1
    const ux = Math.cos(angle), uy = Math.sin(angle)
    // Centro aproximado: a media anchura sobre la línea base y a media altura hacia arriba.
    texts.push({ str: it.str, x: e + ux * it.width / 2 - uy * h / 2, y: f + uy * it.width / 2 + ux * h / 2, angle, height: h })
  }
  return { segs, texts }
}
