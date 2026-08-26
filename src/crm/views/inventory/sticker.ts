// ============================================================
//  STICKER DE SALIDA — la calcomanía que se pega al pedido cuando
//  ya quedó listo en almacén.
//  Formato HORIZONTAL 150 × 100 mm (6" × 4"): la etiqueta estándar de
//  embarque, así sale igual en impresora de etiquetas que recortada
//  de una hoja carta.
//
//  Todo se dibuja en VECTOR (nada de imágenes rasterizadas salvo el
//  logo), para que se imprima nítido a cualquier tamaño.
//  Estructura: marco azul redondeado · logo arriba a la izquierda ·
//  banner rojo diagonal con "LISTO PARA SALIDA" y el camión ·
//  los datos con su icono · pie a dos tonos.
// ============================================================
import { jsPDF } from 'jspdf'
import { fmtDate, sel } from '../../core/data'
import type { AppState, Order } from '../../core/types'

const W = 150
const H = 100

/* ---- Paleta ---- */
const NAVY: [number, number, number] = [20, 52, 107]
const RED: [number, number, number] = [196, 47, 40]
const LABEL: [number, number, number] = [21, 62, 138]
const VALUE: [number, number, number] = [17, 24, 39]
const ICON_BG: [number, number, number] = [232, 238, 247]
const DIVIDER: [number, number, number] = [220, 226, 234]
const WMARK: [number, number, number] = [236, 239, 244]

/* ---- Geometría (mm) ---- */
const HY0 = 9, HY1 = 27.5          // banner del encabezado
const FY0 = 86, FY1 = 93           // pie
const ROWS = [38, 57, 76]          // centro vertical de cada renglón de datos
const ICON_R = 5.6
const ICON_CX = 17                 // columna izquierda
const TXT_X = 26.5
const COL2_CX = 86                 // columna derecha (fila 1)
const COL2_TXT = 95.5
const DIV_X = 79                   // separador vertical de la fila 1

/** Carga el logo para incrustarlo; null si no se pudo (sale sin él). */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Recorta el margen vacío del logo y devuelve solo el dibujo.
 *  El PNG viene en un lienzo cuadrado de 225×225 con FONDO BLANCO OPACO y mucho
 *  aire alrededor, así que colocarlo tal cual desperdicia como la mitad del
 *  espacio que se le da. Aquí se buscan los píxeles que no son casi blancos y se
 *  recorta a esa caja. Si algo falla (canvas bloqueado, recorte degenerado), se
 *  devuelve la imagen original: la etiqueta sale igual, solo con el logo chico. */
function trimLogo(img: HTMLImageElement): { src: string | HTMLImageElement; ratio: number } {
  const original = { src: img as string | HTMLImageElement, ratio: img.naturalWidth / img.naturalHeight }
  try {
    const w = img.naturalWidth, h = img.naturalHeight
    if (!w || !h) return original
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return original
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, w, h).data
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const pinta = d[i + 3] > 24 && !(d[i] > 238 && d[i + 1] > 238 && d[i + 2] > 238)
        if (!pinta) continue
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1
    if (cw < 8 || ch < 8) return original
    const out = document.createElement('canvas')
    out.width = cw; out.height = ch
    const octx = out.getContext('2d')
    if (!octx) return original
    octx.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch)
    return { src: out.toDataURL('image/png'), ratio: cw / ch }
  } catch {
    return original
  }
}

/** Fecha en que la OC quedó lista en almacén; si todavía no se marca, hoy. */
export function fechaListo(state: AppState, order: Order): string {
  const wh = sel.warehouseForOrder(state, order.id)
  if (wh?.doneAt) return wh.doneAt.slice(0, 10)
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Arma el PDF del sticker y lo devuelve como Blob. */
export async function buildStickerPdf(state: AppState, order: Order): Promise<Blob> {
  const project = order.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
  const cliente = project ? sel.clientName(state, project.client) : '—'
  const logo = await loadImage(window.location.origin + '/ccracks_logo.png')

  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape' })
  doc.setLineJoin('round'); doc.setLineCap('round')

  /** Polígono cerrado a partir de puntos absolutos. */
  const poly = (pts: [number, number][], style: 'F' | 'S') => {
    const deltas: number[][] = []
    for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]])
    doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], style, true)
  }
  /** Ajusta el tamaño de letra hasta que el texto quepa en el ancho dado. */
  const fit = (text: string, maxW: number, start: number, min: number) => {
    let size = start
    doc.setFontSize(size)
    while (size > min && doc.getTextWidth(text) > maxW) { size -= 0.5; doc.setFontSize(size) }
    return size
  }

  /* ---- Fondo y marco ---- */
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, 'F')
  doc.setDrawColor(...NAVY); doc.setLineWidth(2)
  doc.roundedRect(4, 4, W - 8, H - 8, 5, 5, 'S')

  /* ---- Encabezado: banner rojo con arista diagonal ----
     La arista arranca en x=36 abajo para dejarle una cuña ancha al logo. */
  doc.setFillColor(...RED)
  poly([[36, HY1], [47, HY0], [143, HY0], [143, HY1]], 'F')
  // Tajo blanco que separa el camión del título (misma inclinación que la arista).
  doc.setFillColor(255, 255, 255)
  poly([[114, HY1], [120, HY0], [123.5, HY0], [117.5, HY1]], 'F')

  // Logo arriba a la izquierda, en la cuña blanca. Ya recortado, se estira hasta
  // llenar la cuña (respetando su proporción) y se centra con la banda roja.
  if (logo) {
    const { src, ratio } = trimLogo(logo)
    const MAXW = 24.5, MAXH = 18.5
    let w = MAXW, h = w / ratio
    if (h > MAXH) { h = MAXH; w = h * ratio }
    doc.addImage(src as string, 'PNG', 9.5, (HY0 + HY1) / 2 - h / 2, w, h)
  } else {
    doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(...NAVY); doc.setFontSize(21)
    doc.text('CC', 11, HY0 + 13)
  }

  // Título centrado en el tramo rojo que queda libre.
  doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(255, 255, 255)
  fit('LISTO PARA SALIDA', 66, 21, 12)
  doc.text('LISTO PARA SALIDA', 79, HY0 + 12.4, { align: 'center' })

  /* ---- Camión: centrado en el trozo de rojo que queda a la derecha del tajo.
     El grupo mide 16 mm de ancho (líneas de velocidad incluidas) por 6.7 de alto;
     la franja libre va de x≈122 a 143 y el banner de y=9 a 27.5. ---- */
  const tx = 130, ty = 14.7
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.65)
  doc.rect(tx, ty, 6.6, 4.6, 'S')                                     // caja
  poly([[tx + 6.6, ty + 1.3], [tx + 9.2, ty + 1.3], [tx + 10.6, ty + 2.9], [tx + 10.6, ty + 4.6], [tx + 6.6, ty + 4.6]], 'S')  // cabina
  doc.circle(tx + 2.3, ty + 5.6, 1.05, 'S')
  doc.circle(tx + 8.6, ty + 5.6, 1.05, 'S')
  doc.setLineWidth(0.55)
  doc.line(tx - 4.2, ty + 1.2, tx - 1, ty + 1.2)                      // líneas de velocidad
  doc.line(tx - 5.4, ty + 2.8, tx - 1, ty + 2.8)
  doc.line(tx - 3.6, ty + 4.4, tx - 1, ty + 4.4)

  /* ---- Iconos de los datos ---- */
  const iconBase = (cx: number, cy: number) => {
    doc.setFillColor(...ICON_BG); doc.circle(cx, cy, ICON_R, 'F')
    doc.setDrawColor(...LABEL); doc.setLineWidth(0.5)
  }
  const icoCarrito = (cx: number, cy: number) => {
    iconBase(cx, cy)
    poly([[cx - 2.9, cy - 1.5], [cx + 3, cy - 1.5], [cx + 2.2, cy + 0.9], [cx - 2.1, cy + 0.9]], 'S')
    doc.line(cx - 4.1, cy - 2.7, cx - 2.9, cy - 1.5)
    doc.circle(cx - 1.4, cy + 2.3, 0.62, 'S')
    doc.circle(cx + 1.6, cy + 2.3, 0.62, 'S')
  }
  const icoTablilla = (cx: number, cy: number) => {
    iconBase(cx, cy)
    doc.roundedRect(cx - 2.6, cy - 3, 5.2, 6.2, 0.7, 0.7, 'S')
    doc.setFillColor(...LABEL); doc.roundedRect(cx - 1.3, cy - 3.8, 2.6, 1.5, 0.4, 0.4, 'F')
    doc.line(cx - 1.4, cy - 0.6, cx + 1.4, cy - 0.6)
    doc.line(cx - 1.4, cy + 0.9, cx + 1.4, cy + 0.9)
  }
  const icoPersona = (cx: number, cy: number) => {
    iconBase(cx, cy)
    doc.circle(cx, cy - 1.7, 1.5, 'S')
    // Hombros: una curva bezier abierta.
    doc.lines([[0.3, -2.5, 5.7, -2.5, 6, 0]], cx - 3, cy + 3.2, [1, 1], 'S', false)
  }
  const icoCalendario = (cx: number, cy: number) => {
    iconBase(cx, cy)
    doc.roundedRect(cx - 3, cy - 2.5, 6, 5.7, 0.7, 0.7, 'S')
    doc.line(cx - 3, cy - 0.8, cx + 3, cy - 0.8)
    doc.line(cx - 1.6, cy - 3.6, cx - 1.6, cy - 2.1)
    doc.line(cx + 1.6, cy - 3.6, cx + 1.6, cy - 2.1)
  }

  /* ---- Un dato: icono + etiqueta chica + valor grande ---- */
  const dato = (
    icono: (cx: number, cy: number) => void,
    cx: number, tx0: number, cy: number,
    label: string, value: string, maxW: number, grande: number, min = 9,
  ) => {
    icono(cx, cy)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...LABEL)
    doc.setCharSpace(0.25); doc.text(label, tx0, cy - 2.5); doc.setCharSpace(0)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...VALUE)
    // `min` alto = prefiere PARTIR EN DOS RENGLONES antes que encoger la letra.
    // Un nombre largo se lee mucho mejor en dos líneas de 12 pt que en una de 9.
    const size = fit(value, maxW, grande, min)
    // Si aun en el mínimo no cabe (razones sociales largas), se parte en dos
    // renglones. Cuando ni así entra, se corta CON PUNTOS SUSPENSIVOS: mejor que
    // se note el recorte a que la calcomanía muestre un nombre a medias.
    let lineas: string[] = [value]
    if (doc.getTextWidth(value) > maxW) {
      const todas: string[] = doc.splitTextToSize(value, maxW)
      lineas = todas.slice(0, 2)
      if (todas.length > 2) lineas[1] = lineas[1].replace(/\s*\S*$/, '') + '…'
    }
    // Con dos renglones, el par se acomoda a caballo de donde iría el único,
    // para que el bloque siga viéndose centrado con su icono.
    let y = lineas.length > 1 ? cy + 5.2 - size * 0.25 : cy + 5.2
    for (const l of lineas) { doc.text(l, tx0, y); y += size * 0.42 }
  }

  /* ---- Marca de agua: solo la retícula de puntos ---- */
  doc.setFillColor(...WMARK)
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 5; j++) doc.circle(69 + i * 2.1, 69 + j * 2.1, 0.3, 'F')
  }

  /* ---- Datos ---- */
  dato(icoCarrito, ICON_CX, TXT_X, ROWS[0], 'ORDEN DE COMPRA', order.number || '—', DIV_X - TXT_X - 4, 19)
  dato(icoTablilla, COL2_CX, COL2_TXT, ROWS[0], 'PROYECTO', project ? project.code : '—', 141 - COL2_TXT, 19)
  dato(icoPersona, ICON_CX, TXT_X, ROWS[1], 'CLIENTE', cliente, 141 - TXT_X, 19, 12)
  dato(icoCalendario, ICON_CX, TXT_X, ROWS[2], 'LISTO EL', fmtDate(fechaListo(state, order)), 141 - TXT_X, 19, 12)

  /* ---- Separadores ---- */
  doc.setDrawColor(...DIVIDER); doc.setLineWidth(0.4)
  doc.line(DIV_X, ROWS[0] - 6.5, DIV_X, ROWS[0] + 6.5)   // vertical de la fila 1
  doc.line(9, 48, 141, 48)
  doc.line(9, 67, 141, 67)

  /* ---- Pie a dos tonos con tajo diagonal ----
     Se arma en capas para que las esquinas redondeadas queden limpias y el tajo
     tenga ANCHO CONSTANTE: (1) toda la franja en azul con sus dos extremos
     redondeados, (2) el extremo derecho en rojo, también redondeado, (3) el
     relleno rojo intermedio, de aristas rectas pero totalmente interior, y
     (4) el tajo blanco justo encima de la arista del rojo.
     OJO con el paso 3: `roundedRect` redondea las CUATRO esquinas, así que las
     izquierdas del rojo (en x=100) dejan dos muescas por las que se asomaba el
     azul y partían la franja en dos. El relleno se pasa hasta x=105 —más allá
     del radio— para taparlas; el sobrante queda dentro del rojo y no se ve. */
  const FH = FY1 - FY0
  doc.setFillColor(...NAVY)
  doc.roundedRect(7, FY0, 136, FH, 2, 2, 'F')
  doc.setFillColor(...RED)
  doc.roundedRect(100, FY0, 43, FH, 2, 2, 'F')
  poly([[83, FY0], [105, FY0], [105, FY1], [76, FY1]], 'F')
  doc.setFillColor(255, 255, 255)
  poly([[79.5, FY0], [83, FY0], [76, FY1], [72.5, FY1]], 'F')

  // Palomita + leyenda de revisión
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.55)
  doc.circle(13, 89.5, 2.5, 'S')
  doc.lines([[0.85, 0.95], [1.6, -2]], 11.8, 89.4, [1, 1], 'S', false)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255)
  doc.setCharSpace(0.15)
  doc.text('REVISADO Y LISTO PARA ENTREGA', 18, 90.3)
  // El alineado a la derecha de jsPDF NO cuenta el espaciado entre letras, así
  // que el texto se recorría y se salía de la franja. Se coloca a la izquierda
  // en la x calculada, ya con el espaciado incluido.
  const cia = 'CC RACKS MEXICO S.A. DE C.V.'
  const wCia = doc.getTextWidth(cia) + cia.length * 0.15
  doc.text(cia, 139 - wCia, 90.3)
  doc.setCharSpace(0)

  return doc.output('blob')
}

/** Genera el sticker y lo abre en una pestaña para imprimirlo. */
export async function printSticker(state: AppState, order: Order) {
  const blob = await buildStickerPdf(state, order)
  window.open(URL.createObjectURL(blob), '_blank')
}
